import { z } from "zod";
import { INCIDENT_FUSION_SYSTEM_PROMPT } from "../../../prompts/incident-fusion/system";
import { ZONE_EDGES } from "../../../data/seed/stadium";
import {
  enforceRateLimit,
  isResponse,
  jsonResponse,
  parseJson,
  rejectCrossOriginRequest,
  requestId,
  structuredLog,
} from "../../../src/lib/api/http";
import {
  DEFAULT_FUSION_CONFIG,
  fuseIncidentReports,
  type SemanticFusionDecision,
} from "../../../src/lib/incidents/fusion";
import { generateDuplicateCandidates } from "../../../src/lib/incidents/candidates";
import { geminiCapability, generateStructuredJson } from "../../../src/lib/google/gemini";
import { FUSION_JSON_SCHEMA } from "../../../src/lib/google/schemas";
import type { IncidentReport, IncidentType } from "../../../src/types";

export const runtime = "nodejs";

const incidentTypes = [
  "medical",
  "fire",
  "crowd",
  "security",
  "infrastructure",
  "accessibility",
  "lost_person",
  "other",
] as const;
const requestSchema = z
  .object({
    reports: z
      .array(
        z
          .object({
            sourceId: z.string().trim().min(1).max(160),
            zoneId: z.string().trim().min(1).max(80),
            timestamp: z.iso.datetime({ offset: true }),
            text: z.string().trim().min(1).max(8_000),
            language: z.string().trim().min(2).max(35).default("und"),
            reliability: z.number().min(0).max(1).default(0.5),
            incidentType: z.enum(incidentTypes).optional(),
            vulnerablePerson: z.boolean().default(false),
          })
          .strict(),
      )
      .min(2)
      .max(10),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.reports.map((report) => report.sourceId);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["reports"],
        message: "Report source IDs must be unique.",
      });
  });

const decisionSchema = z
  .object({
    reportAId: z.string().trim().min(1).max(160),
    reportBId: z.string().trim().min(1).max(160),
    sameIncident: z.boolean(),
    confidence: z.number().min(0).max(1),
    explanation: z.string().trim().min(1).max(1_000),
    contradictions: z.array(z.string().trim().min(1).max(500)).max(12),
  })
  .strict();

const ZONE_ALIASES: Record<string, string> = {
  "GATE-W": "gate-west",
  "W-GATE": "gate-west",
  "GATE-N": "gate-north",
  "N-GATE": "gate-north",
  "GATE-E": "gate-east",
  "E-GATE": "gate-east",
  "GATE-S": "gate-south",
  "S-GATE": "gate-south",
  "W-CONC": "concourse-west",
  WEST_CONC: "concourse-west",
  "N-CONC": "concourse-north",
  NORTH_CONC: "concourse-north",
  "E-CONC": "concourse-east",
  EAST_CONC: "concourse-east",
  "S-CONC": "concourse-south",
  SOUTH_CONC: "concourse-south",
  "ACCESS-CORR": "accessible-corridor",
  ACCESS_02: "accessible-corridor",
};

function domainReport(report: z.infer<typeof requestSchema>["reports"][number]): IncidentReport {
  const zoneId = ZONE_ALIASES[report.zoneId] ?? report.zoneId;
  return {
    id: report.sourceId,
    sourceId: report.sourceId,
    sourceType: "staff",
    timestamp: report.timestamp,
    receivedAt: report.timestamp,
    rawText: report.text,
    language: report.language,
    zoneId,
    incidentType: report.incidentType as IncidentType | undefined,
    reliability: report.reliability,
    vulnerablePerson: report.vulnerablePerson,
    dismissed: false,
  };
}

async function compareCandidate(
  reportA: IncidentReport,
  reportB: IncidentReport,
  requestIdentifier: string,
): Promise<SemanticFusionDecision | null> {
  try {
    const result = await generateStructuredJson({
      requestId: requestIdentifier,
      systemInstruction: INCIDENT_FUSION_SYSTEM_PROMPT,
      trustedContext: { mergeThreshold: DEFAULT_FUSION_CONFIG.semanticConfidenceThreshold },
      untrustedData: {
        reportA: {
          id: reportA.id,
          sourceId: reportA.sourceId,
          zoneId: reportA.zoneId,
          timestamp: reportA.timestamp,
          language: reportA.language,
          text: reportA.rawText,
        },
        reportB: {
          id: reportB.id,
          sourceId: reportB.sourceId,
          zoneId: reportB.zoneId,
          timestamp: reportB.timestamp,
          language: reportB.language,
          text: reportB.rawText,
        },
      },
      task: "Compare this deterministically pre-screened pair. Preserve both sources and return only the structured decision.",
      responseJsonSchema: FUSION_JSON_SCHEMA,
      temperature: 0.05,
      maxOutputTokens: 1_024,
      attempts: 1,
    });
    const parsed = decisionSchema.safeParse(result.data);
    if (!parsed.success) return null;
    const idsMatch =
      (parsed.data.reportAId === reportA.id && parsed.data.reportBId === reportB.id) ||
      (parsed.data.reportAId === reportB.id && parsed.data.reportBId === reportA.id);
    return idsMatch ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const id = requestId(request);
  const started = Date.now();
  const originRejected = rejectCrossOriginRequest(request, id);
  if (originRejected) return originRejected;
  const limited = enforceRateLimit(request, id, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const body = await parseJson(request, requestSchema, id);
  if (isResponse(body)) return body;

  const reports = body.reports.map(domainReport);
  const candidates = generateDuplicateCandidates(
    reports,
    ZONE_EDGES,
    DEFAULT_FUSION_CONFIG.candidate,
  );
  const reportById = new Map(reports.map((report) => [report.id, report]));
  const aiAvailable = geminiCapability().available;
  const decisions = aiAvailable
    ? (
        await Promise.all(
          candidates.slice(0, 12).map((candidate) => {
            const reportA = reportById.get(candidate.reportAId);
            const reportB = reportById.get(candidate.reportBId);
            return reportA && reportB ? compareCandidate(reportA, reportB, id) : null;
          }),
        )
      ).filter((decision): decision is SemanticFusionDecision => decision !== null)
    : [];
  const result = fuseIncidentReports(reports, ZONE_EDGES, decisions);

  structuredLog({
    requestId: id,
    operation: "incident-fusion",
    outcome: aiAvailable && decisions.length === candidates.length ? "success" : "degraded",
    durationMs: Date.now() - started,
    code: aiAvailable ? undefined : "AI_NOT_CONFIGURED",
  });

  return jsonResponse(
    {
      ok: true,
      mode: aiAvailable ? "hybrid" : "degraded",
      aiNotice: aiAvailable
        ? undefined
        : "AI analysis unavailable. Only exact deterministic matches can be fused.",
      threshold: DEFAULT_FUSION_CONFIG.semanticConfidenceThreshold,
      candidates: result.candidates,
      clusters: result.clusters.map((cluster) => ({
        id: cluster.id,
        reportIds: cluster.reportIds,
        sourceIds: cluster.sourceIds,
      })),
      acceptedDecisions: result.acceptedDecisions,
      rejectedDecisions: result.rejectedDecisions,
      pendingSemanticPairKeys: result.pendingSemanticPairKeys,
      sourceReportsPreserved: true,
    },
    200,
    id,
  );
}
