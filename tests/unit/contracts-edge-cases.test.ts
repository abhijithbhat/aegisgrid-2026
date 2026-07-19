import { describe, expect, it } from "vitest";
import { parseAIRecommendation, parseSchemaMappingProposal } from "../../src/lib/ai/contracts";
import {
  ContractValidationError,
  enumValue,
  finiteNumber,
  isRecord,
  rejectUnknownKeys,
  requiredBoolean,
  requiredString,
  unknownToJson,
  type ContractIssue,
} from "../../src/lib/validation/contract";

const validRecommendation = () => ({
  summary: "A person needs medical assessment near the west concourse.",
  incidentType: "medical",
  severity: "high",
  confidence: 0.88,
  evidence: [{ sourceId: "SRC-1", fact: "A person fainted near section W1.", weight: 0.9 }],
  contradictions: [] as Array<{
    sourceIds: string[];
    description: string;
    operationalImpact: string;
  }>,
  missingInformation: ["Breathing status is unconfirmed."],
  clarifyingQuestions: ["Is the person conscious?"],
  recommendedActions: [
    {
      priority: 1,
      action: "Prepare the nearest medical team for supervisor-approved dispatch.",
      ownerRole: "medical lead",
      targetMinutes: 2,
      justification: "The report describes a person who fainted.",
      requiresApproval: true,
    },
  ],
  recommendedTeamType: "medical",
  equipment: ["AED"],
  announcement: { language: "en", tone: "calm", text: "Please keep the west concourse clear." },
  uncertaintyNote: "The person's current condition is not confirmed.",
  requiresHumanApproval: true,
});

describe("AI contract adversarial branches", () => {
  it("accepts a fully grounded recommendation with a Set allowlist", () => {
    const result = parseAIRecommendation(validRecommendation(), {
      allowedSourceIds: new Set(["SRC-1"]),
      sourceTextById: { "SRC-1": "A person fainted near section W1." },
    });
    expect(result.success).toBe(true);
  });

  it("collects grounding, safety, approval, priority, and unknown-field failures", () => {
    const unsafe = validRecommendation();
    unsafe.summary = "A medical unit has already dispatched after facial recognition.";
    unsafe.requiresHumanApproval = false;
    unsafe.evidence = [
      { sourceId: "SRC-1", fact: "Occupancy is 999 and a person is bleeding.", weight: 2 },
      { sourceId: "INVENTED", fact: "An invented source", weight: 0.2 },
    ];
    unsafe.contradictions = [
      {
        sourceIds: ["INVENTED"],
        description: "One source differs.",
        operationalImpact: "Confirm before acting.",
      },
    ];
    unsafe.recommendedActions = [
      { ...unsafe.recommendedActions[0], requiresApproval: false },
      { ...unsafe.recommendedActions[0], action: "Second action" },
    ];
    const value = { ...unsafe, unexpected: "field" };

    const result = parseAIRecommendation(value, {
      allowedSourceIds: ["SRC-1"],
      sourceTextById: { "SRC-1": "Sensor occupancy is 20." },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const codes = result.issues.map((issue) => issue.code);
      expect(codes).toEqual(
        expect.arrayContaining([
          "unknown_field",
          "ungrounded_evidence",
          "out_of_range",
          "invalid_value",
          "unsafe_content",
        ]),
      );
      expect(result.issues.some((issue) => issue.path === "recommendedActions")).toBe(true);
    }
  });

  it("rejects non-records, non-arrays, oversized arrays, and malformed announcement values", () => {
    const malformed = {
      ...validRecommendation(),
      evidence: "not an array",
      contradictions: Array.from({ length: 21 }, () => null),
      missingInformation: null,
      recommendedActions: {},
      announcement: "not an object",
    };
    const result = parseAIRecommendation(malformed, { allowedSourceIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.filter((issue) => issue.code === "invalid_type").length).toBeGreaterThan(
        4,
      );
      expect(result.issues.some((issue) => issue.code === "out_of_range")).toBe(true);
    }
  });
});

describe("schema-mapping contract", () => {
  it("accepts explicit null mappings while keeping every proposal approval-gated", () => {
    const result = parseSchemaMappingProposal(
      {
        mappings: [
          {
            sourceColumn: "comment",
            canonicalField: null,
            confidence: 0.8,
            rationale: "No safe canonical match.",
            requiresApproval: true,
            source: "ai",
          },
        ],
      },
      new Set(["comment"]),
    );
    expect(result).toEqual({
      success: true,
      data: [
        {
          sourceField: "comment",
          targetField: null,
          confidence: 0.8,
          rationale: "No safe canonical match.",
          requiresConfirmation: true,
        },
      ],
    });
  });

  it("rejects invented columns, duplicate targets, unapproved mappings, and non-AI provenance", () => {
    const mapping = {
      sourceColumn: "first",
      canonicalField: "zone_id",
      confidence: 0.7,
      rationale: "Possible match.",
      requiresApproval: false,
      source: "manual",
    };
    const result = parseSchemaMappingProposal(
      {
        mappings: [mapping, { ...mapping, sourceColumn: "invented", extra: true }],
        extraEnvelope: true,
      },
      new Set(["first"]),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.code)).toEqual(
        expect.arrayContaining(["unknown_field", "invalid_value"]),
      );
      expect(result.issues.some((issue) => issue.message.includes("Multiple source fields"))).toBe(
        true,
      );
    }
  });
});

describe("primitive contract helpers", () => {
  it("reports invalid primitive types and ranges without throwing", () => {
    const issues: ContractIssue[] = [];
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord([])).toBe(false);
    rejectUnknownKeys({ allowed: 1, blocked: 2 }, ["allowed"], "root", issues);
    expect(requiredString(3, "string", issues)).toBe("");
    expect(requiredString("x", "long-string", issues, { min: 2, max: 4 })).toBe("x");
    expect(finiteNumber(Number.NaN, "number", issues)).toBe(0);
    expect(finiteNumber(1.2, "integer", issues, { integer: true })).toBe(1.2);
    expect(enumValue("missing", ["one", "two"] as const, "enum", issues)).toBe("one");
    expect(requiredBoolean("true", "boolean", issues)).toBe(false);
    expect(issues.length).toBe(7);
  });

  it("parses raw JSON and preserves already-structured values", () => {
    expect(unknownToJson({ ok: true })).toEqual({ success: true, data: { ok: true } });
    expect(unknownToJson('{"ok":true}')).toEqual({ success: true, data: { ok: true } });
    expect(unknownToJson("```json")).toEqual(expect.objectContaining({ success: false }));
    expect(new ContractValidationError([])).toMatchObject({
      name: "ContractValidationError",
      code: "CONTRACT_VALIDATION_FAILED",
    });
  });
});
