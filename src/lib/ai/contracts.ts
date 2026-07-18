import type {
  AIRecommendation,
  Contradiction,
  EvidenceItem,
  IncidentType,
  ProposedFieldMapping,
  RecommendedAction,
  Severity,
  TeamType,
} from "../../types";
import { sanitizePlainText } from "../security";
import {
  enumValue,
  finiteNumber,
  isRecord,
  rejectUnknownKeys,
  requiredBoolean,
  requiredString,
  type ContractIssue,
  type ContractResult,
} from "../validation";

export const AI_RECOMMENDATION_CONTRACT_VERSION = "aegis-ai-contract-1.0.0";

const INCIDENT_TYPES = [
  "medical",
  "fire",
  "crowd",
  "security",
  "infrastructure",
  "accessibility",
  "lost_person",
  "other",
] as const satisfies readonly IncidentType[];
const SEVERITIES = ["low", "moderate", "high", "critical"] as const satisfies readonly Severity[];
const TEAM_TYPES = [
  "medical",
  "security",
  "fire",
  "accessibility",
  "maintenance",
  "crowd_control",
] as const satisfies readonly TeamType[];
const ANNOUNCEMENT_TONES = ["calm", "urgent", "emergency"] as const;
const CANONICAL_FIELDS = [
  "timestamp",
  "zone_id",
  "occupancy",
  "capacity",
  "inflow_per_minute",
  "outflow_per_minute",
  "queue_minutes",
  "temperature_c",
  "air_quality_index",
  "noise_db",
  "sensor_health",
  "blocked",
  "event_phase",
] as const;

export interface AIContractContext {
  allowedSourceIds: readonly string[] | ReadonlySet<string>;
  /** Raw source text enables numeric/entity grounding beyond ID validation. */
  sourceTextById?: Readonly<Record<string, string>>;
}

const toAllowedSet = (values: readonly string[] | ReadonlySet<string>): ReadonlySet<string> =>
  values instanceof Set ? values : new Set(values);

function expectRecord(
  value: unknown,
  path: string,
  issues: ContractIssue[],
): Record<string, unknown> {
  if (!isRecord(value)) {
    issues.push({ path, code: "invalid_type", message: "Expected an object." });
    return {};
  }
  return value;
}

function expectArray(
  value: unknown,
  path: string,
  issues: ContractIssue[],
  maxItems: number,
): unknown[] {
  if (!Array.isArray(value)) {
    issues.push({ path, code: "invalid_type", message: "Expected an array." });
    return [];
  }
  if (value.length > maxItems) {
    issues.push({
      path,
      code: "out_of_range",
      message: `Array may contain at most ${maxItems} items.`,
    });
  }
  return value.slice(0, maxItems);
}

function stringArray(
  value: unknown,
  path: string,
  issues: ContractIssue[],
  maxItems = 12,
): string[] {
  return expectArray(value, path, issues, maxItems).map((item, index) =>
    sanitizePlainText(requiredString(item, `${path}[${index}]`, issues, { max: 500 }), 500),
  );
}

const SENSOR_TERMS = /\b(occupancy|capacity|inflow|outflow|queue|temperature|air quality|aqi|noise|sensor)\b/i;
const PEOPLE_OR_INJURY_TERMS = /\b(person|people|injur(?:y|ed)|unconscious|fainted|bleeding|wheelchair)\b/i;
const NUMBER_TOKEN = /-?\d+(?:\.\d+)?%?/g;

function groundedFact(
  fact: string,
  sourceId: string,
  context: AIContractContext,
  path: string,
  issues: ContractIssue[],
): void {
  const sourceText = context.sourceTextById?.[sourceId];
  if (!sourceText) return;

  const factNumbers = fact.match(NUMBER_TOKEN) ?? [];
  const sourceNumbers = new Set(sourceText.match(NUMBER_TOKEN) ?? []);
  if (SENSOR_TERMS.test(fact) && factNumbers.some((number) => !sourceNumbers.has(number))) {
    issues.push({
      path,
      code: "ungrounded_evidence",
      message: "Sensor values must appear in the cited source.",
    });
  }
  if (PEOPLE_OR_INJURY_TERMS.test(fact) && !PEOPLE_OR_INJURY_TERMS.test(sourceText)) {
    issues.push({
      path,
      code: "ungrounded_evidence",
      message: "People and injury claims must be supported by the cited source.",
    });
  }
}

function parseEvidence(
  value: unknown,
  context: AIContractContext,
  issues: ContractIssue[],
): EvidenceItem[] {
  const allowedSources = toAllowedSet(context.allowedSourceIds);
  return expectArray(value, "evidence", issues, 30).map((item, index) => {
    const path = `evidence[${index}]`;
    const record = expectRecord(item, path, issues);
    rejectUnknownKeys(record, ["sourceId", "fact", "weight"], path, issues);
    const sourceId = requiredString(record.sourceId, `${path}.sourceId`, issues, { max: 160 });
    const fact = sanitizePlainText(
      requiredString(record.fact, `${path}.fact`, issues, { max: 700 }),
      700,
    );
    const weight = finiteNumber(record.weight, `${path}.weight`, issues, {
      min: 0,
      max: 1,
    });
    if (!allowedSources.has(sourceId)) {
      issues.push({
        path: `${path}.sourceId`,
        code: "ungrounded_evidence",
        message: "Evidence source ID was not supplied in the incident context.",
      });
    } else {
      groundedFact(fact, sourceId, context, `${path}.fact`, issues);
    }
    return { sourceId, fact, weight };
  });
}

function parseContradictions(
  value: unknown,
  context: AIContractContext,
  issues: ContractIssue[],
): Contradiction[] {
  const allowedSources = toAllowedSet(context.allowedSourceIds);
  return expectArray(value, "contradictions", issues, 20).map((item, index) => {
    const path = `contradictions[${index}]`;
    const record = expectRecord(item, path, issues);
    rejectUnknownKeys(
      record,
      ["sourceIds", "description", "operationalImpact"],
      path,
      issues,
    );
    const sourceIds = stringArray(record.sourceIds, `${path}.sourceIds`, issues, 12);
    if (sourceIds.length < 2) {
      issues.push({
        path: `${path}.sourceIds`,
        code: "out_of_range",
        message: "A contradiction must cite at least two source IDs.",
      });
    }
    sourceIds.forEach((sourceId, sourceIndex) => {
      if (!allowedSources.has(sourceId)) {
        issues.push({
          path: `${path}.sourceIds[${sourceIndex}]`,
          code: "ungrounded_evidence",
          message: "Contradiction source ID was not supplied in the incident context.",
        });
      }
    });
    return {
      sourceIds,
      description: sanitizePlainText(
        requiredString(record.description, `${path}.description`, issues, { max: 700 }),
        700,
      ),
      operationalImpact: sanitizePlainText(
        requiredString(record.operationalImpact, `${path}.operationalImpact`, issues, {
          max: 700,
        }),
        700,
      ),
    };
  });
}

function parseActions(value: unknown, issues: ContractIssue[]): RecommendedAction[] {
  const actions = expectArray(value, "recommendedActions", issues, 20).map((item, index) => {
    const path = `recommendedActions[${index}]`;
    const record = expectRecord(item, path, issues);
    rejectUnknownKeys(
      record,
      [
        "priority",
        "action",
        "ownerRole",
        "targetMinutes",
        "justification",
        "requiresApproval",
      ],
      path,
      issues,
    );
    const requiresApproval = requiredBoolean(
      record.requiresApproval,
      `${path}.requiresApproval`,
      issues,
    );
    if (!requiresApproval) {
      issues.push({
        path: `${path}.requiresApproval`,
        code: "invalid_value",
        message: "Every operational action must require human approval.",
      });
    }
    return {
      priority: finiteNumber(record.priority, `${path}.priority`, issues, {
        min: 1,
        max: 100,
        integer: true,
      }),
      action: sanitizePlainText(
        requiredString(record.action, `${path}.action`, issues, { max: 500 }),
        500,
      ),
      ownerRole: sanitizePlainText(
        requiredString(record.ownerRole, `${path}.ownerRole`, issues, { max: 160 }),
        160,
      ),
      targetMinutes: finiteNumber(record.targetMinutes, `${path}.targetMinutes`, issues, {
        min: 0,
        max: 1_440,
      }),
      justification: sanitizePlainText(
        requiredString(record.justification, `${path}.justification`, issues, { max: 700 }),
        700,
      ),
      requiresApproval: true as const,
    };
  });

  const priorities = actions.map((action) => action.priority);
  if (new Set(priorities).size !== priorities.length) {
    issues.push({
      path: "recommendedActions",
      code: "invalid_value",
      message: "Recommended-action priorities must be unique.",
    });
  }
  return actions.sort((a, b) => a.priority - b.priority);
}

const UNSAFE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:has|have|was|were) (?:already )?dispatched\b/i, label: "automatic dispatch claim" },
  { pattern: /\b(?:diagnosed|diagnosis is|definitely has)\b/i, label: "medical diagnosis" },
  { pattern: /\bchain[- ]of[- ]thought\b|\binternal reasoning\b/i, label: "hidden reasoning" },
  { pattern: /\bfacial recognition\b|\bbiometric\b/i, label: "biometric processing" },
  { pattern: /\binfer(?:red|ring)? (?:their )?(?:identity|race|religion|ethnicity)\b/i, label: "personal identity inference" },
];

function checkSafetyPolicy(recommendation: AIRecommendation, issues: ContractIssue[]): void {
  const allText = JSON.stringify(recommendation);
  for (const rule of UNSAFE_PATTERNS) {
    if (rule.pattern.test(allText)) {
      issues.push({
        path: "$",
        code: "unsafe_content",
        message: `Response contains a prohibited ${rule.label}.`,
      });
    }
  }
}

export function parseAIRecommendation(
  value: unknown,
  context: AIContractContext,
): ContractResult<AIRecommendation> {
  const issues: ContractIssue[] = [];
  const record = expectRecord(value, "$", issues);
  rejectUnknownKeys(
    record,
    [
      "summary",
      "incidentType",
      "severity",
      "confidence",
      "evidence",
      "contradictions",
      "missingInformation",
      "clarifyingQuestions",
      "recommendedActions",
      "recommendedTeamType",
      "equipment",
      "announcement",
      "uncertaintyNote",
      "requiresHumanApproval",
    ],
    "",
    issues,
  );

  const announcementRecord = expectRecord(record.announcement, "announcement", issues);
  rejectUnknownKeys(
    announcementRecord,
    ["language", "tone", "text"],
    "announcement",
    issues,
  );
  const requiresHumanApproval = requiredBoolean(
    record.requiresHumanApproval,
    "requiresHumanApproval",
    issues,
  );
  if (!requiresHumanApproval) {
    issues.push({
      path: "requiresHumanApproval",
      code: "invalid_value",
      message: "AI recommendations always require human approval.",
    });
  }

  const recommendation: AIRecommendation = {
    summary: sanitizePlainText(
      requiredString(record.summary, "summary", issues, { max: 1_200 }),
      1_200,
    ),
    incidentType: enumValue(record.incidentType, INCIDENT_TYPES, "incidentType", issues),
    severity: enumValue(record.severity, SEVERITIES, "severity", issues),
    confidence: finiteNumber(record.confidence, "confidence", issues, { min: 0, max: 1 }),
    evidence: parseEvidence(record.evidence, context, issues),
    contradictions: parseContradictions(record.contradictions, context, issues),
    missingInformation: stringArray(record.missingInformation, "missingInformation", issues),
    clarifyingQuestions: stringArray(record.clarifyingQuestions, "clarifyingQuestions", issues),
    recommendedActions: parseActions(record.recommendedActions, issues),
    recommendedTeamType: enumValue(
      record.recommendedTeamType,
      TEAM_TYPES,
      "recommendedTeamType",
      issues,
    ),
    equipment: stringArray(record.equipment, "equipment", issues, 30),
    announcement: {
      language: sanitizePlainText(
        requiredString(announcementRecord.language, "announcement.language", issues, {
          max: 80,
        }),
        80,
      ),
      tone: enumValue(
        announcementRecord.tone,
        ANNOUNCEMENT_TONES,
        "announcement.tone",
        issues,
      ),
      text: sanitizePlainText(
        requiredString(announcementRecord.text, "announcement.text", issues, {
          max: 1_000,
        }),
        1_000,
      ),
    },
    uncertaintyNote: sanitizePlainText(
      requiredString(record.uncertaintyNote, "uncertaintyNote", issues, { max: 1_000 }),
      1_000,
    ),
    requiresHumanApproval: true,
  };

  checkSafetyPolicy(recommendation, issues);
  return issues.length ? { success: false, issues } : { success: true, data: recommendation };
}

export function parseSchemaMappingProposal(
  value: unknown,
  sourceFields: ReadonlySet<string>,
): ContractResult<ProposedFieldMapping[]> {
  const issues: ContractIssue[] = [];
  const envelope = expectRecord(value, "$", issues);
  rejectUnknownKeys(envelope, ["mappings"], "$", issues);
  const mappings = expectArray(envelope.mappings, "mappings", issues, 200).map((item, index) => {
    const path = `mappings[${index}]`;
    const record = expectRecord(item, path, issues);
    rejectUnknownKeys(
      record,
      ["sourceColumn", "canonicalField", "confidence", "rationale", "requiresApproval", "source"],
      path,
      issues,
    );
    const sourceField = requiredString(record.sourceColumn, `${path}.sourceColumn`, issues, {
      max: 200,
    });
    if (!sourceFields.has(sourceField)) {
      issues.push({
        path: `${path}.sourceColumn`,
        code: "invalid_value",
        message: "Mapping references a source field that was not uploaded.",
      });
    }
    let targetField: ProposedFieldMapping["targetField"] = null;
    if (record.canonicalField !== null) {
      targetField = enumValue(record.canonicalField, CANONICAL_FIELDS, `${path}.canonicalField`, issues);
    }
    const confidence = finiteNumber(record.confidence, `${path}.confidence`, issues, {
      min: 0,
      max: 1,
    });
    const requiresApproval = requiredBoolean(
      record.requiresApproval,
      `${path}.requiresApproval`,
      issues,
    );
    if (!requiresApproval) {
      issues.push({
        path: `${path}.requiresApproval`,
        code: "invalid_value",
        message: "Every AI-proposed mapping must require supervisor approval.",
      });
    }
    if (record.source !== "ai") {
      issues.push({ path: `${path}.source`, code: "invalid_value", message: "AI mapping responses must identify their source as ai." });
    }
    return {
      sourceField,
      targetField,
      confidence,
      rationale: sanitizePlainText(
        requiredString(record.rationale, `${path}.rationale`, issues, { max: 600 }),
        600,
      ),
      requiresConfirmation: true,
    };
  });

  const duplicatedTargets = mappings
    .filter((mapping) => mapping.targetField !== null)
    .map((mapping) => mapping.targetField)
    .filter((field, index, all) => all.indexOf(field) !== index);
  if (duplicatedTargets.length) {
    issues.push({
      path: "$",
      code: "invalid_value",
      message: `Multiple source fields map to ${[...new Set(duplicatedTargets)].join(", ")}.`,
    });
  }

  return issues.length ? { success: false, issues } : { success: true, data: mappings };
}
