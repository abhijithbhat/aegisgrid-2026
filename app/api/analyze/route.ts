import { z } from "zod";
import { INCIDENT_ANALYSIS_SYSTEM_PROMPT } from "../../../prompts/incident-analysis/system";
import { analyzeWithProvider } from "../../../src/lib/ai/provider";
import {
  enforceRateLimit,
  isResponse,
  jsonResponse,
  parseJson,
  rejectCrossOriginRequest,
  requestId,
  structuredLog,
} from "../../../src/lib/api/http";
import { createGeminiProvider } from "../../../src/lib/google/provider-adapter";

export const runtime = "nodejs";

const severitySchema = z.enum(["low", "moderate", "high", "critical"]);

const analysisRequestSchema = z.object({
  incidentId: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  title: z.string().trim().min(1).max(240),
  incidentType: z.enum(["medical", "fire", "crowd", "security", "infrastructure", "accessibility", "lost_person", "other"]),
  zoneId: z.string().trim().min(1).max(80),
  eventPhase: z.enum(["pre-entry", "ingress", "live-match", "halftime", "egress"]),
  deterministicRisk: z.object({
    score: z.number().int().min(0).max(100),
    severity: severitySchema,
    explanation: z.string().trim().min(1).max(1_200),
  }).strict(),
  sources: z.array(z.object({
    sourceId: z.string().trim().min(1).max(160),
    sourceType: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(8_000),
    reliability: z.number().min(0).max(1),
  }).strict()).min(1).max(30),
  route: z.object({
    primaryZoneIds: z.array(z.string().trim().min(1).max(80)).min(1).max(40),
    alternateZoneIds: z.array(z.string().trim().min(1).max(80)).max(40),
    etaMinutes: z.number().min(0).max(180),
    avoidedZoneIds: z.array(z.string().trim().min(1).max(80)).max(40),
    rationale: z.string().trim().min(1).max(1_200),
  }).strict(),
}).strict().superRefine((value, context) => {
  const sourceIds = value.sources.map((source) => source.sourceId);
  if (new Set(sourceIds).size !== sourceIds.length) {
    context.addIssue({
      code: "custom",
      path: ["sources"],
      message: "Every evidence source ID must be unique.",
    });
  }
});

export async function POST(request: Request): Promise<Response> {
  const id = requestId(request);
  const started = Date.now();
  const originRejected = rejectCrossOriginRequest(request, id);
  if (originRejected) return originRejected;
  const limited = enforceRateLimit(request, id, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const body = await parseJson(request, analysisRequestSchema, id);
  if (isResponse(body)) return body;

  const sourceTextById = Object.fromEntries(body.sources.map((source) => [source.sourceId, source.text]));
  const outcome = await analyzeWithProvider({
    provider: createGeminiProvider(),
    systemPrompt: INCIDENT_ANALYSIS_SYSTEM_PROMPT,
    dataPayload: JSON.stringify({
      incident: {
        id: body.incidentId,
        title: body.title,
        incidentType: body.incidentType,
        zoneId: body.zoneId,
        eventPhase: body.eventPhase,
      },
      deterministicRisk: body.deterministicRisk,
      deterministicRoute: body.route,
      sources: body.sources,
      safetyBoundary: "Decision support only. No dispatch, diagnosis, or broadcast has occurred.",
    }),
    contractContext: {
      allowedSourceIds: body.sources.map((source) => source.sourceId),
      sourceTextById,
    },
    timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 12_000),
    maxAttempts: Number(process.env.AI_MAX_RETRIES ?? 1) > 0 ? 2 : 1,
  });

  structuredLog({
    requestId: id,
    operation: "incident-analysis",
    outcome: outcome.status === "available" ? "success" : "degraded",
    durationMs: Date.now() - started,
    code: outcome.status === "degraded" ? outcome.error.code : undefined,
  });

  return jsonResponse({
    ok: true,
    incidentId: body.incidentId,
    outcome,
    dispatchPerformed: false,
  }, 200, id);
}
