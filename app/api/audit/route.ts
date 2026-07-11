import { z } from "zod";
import {
  enforceRateLimit,
  isResponse,
  jsonResponse,
  parseJson,
  publicError,
  requestId,
} from "../../../src/lib/api/http";
import { getOperationalRepository } from "../../../src/lib/firestore/repository";

export const runtime = "nodejs";

const auditInputSchema = z.object({
  action: z.enum(["recommendation-approved", "recommendation-modified", "recommendation-dismissed", "team-assigned", "step-completed", "report-dismissed", "note-added", "incident-resolved"]),
  incidentId: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  previousStatus: z.enum(["new", "assessing", "awaiting-approval", "approved", "responding", "monitoring", "resolved", "dismissed", "unchanged"]),
  newStatus: z.enum(["new", "assessing", "awaiting-approval", "approved", "responding", "monitoring", "resolved", "dismissed", "unchanged"]),
  note: z.string().trim().max(1_000).default(""),
  aiRecommendationVersion: z.literal("aegis-ai-contract-1.0.0"),
}).strict();

function rejectCrossOrigin(request: Request, id: string): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  if (origin === new URL(request.url).origin) return null;
  return publicError(id, 403, "ORIGIN_REJECTED", "Cross-origin audit access is not allowed.");
}

export async function GET(request: Request): Promise<Response> {
  const id = requestId(request);
  const originRejected = rejectCrossOrigin(request, id);
  if (originRejected) return originRejected;
  const limited = enforceRateLimit(request, id, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const incidentId = new URL(request.url).searchParams.get("incidentId") ?? undefined;
  if (incidentId && !/^[a-zA-Z0-9_-]{1,80}$/.test(incidentId)) {
    return publicError(id, 400, "INVALID_INCIDENT_ID", "The incident identifier is invalid.");
  }
  try {
    const repository = await getOperationalRepository();
    const events = await repository.listAuditEvents(incidentId);
    return jsonResponse({ ok: true, events, persistence: { mode: repository.mode, durable: repository.durable } }, 200, id);
  } catch {
    return publicError(id, 503, "AUDIT_READ_UNAVAILABLE", "The audit log is temporarily unavailable.");
  }
}

export async function POST(request: Request): Promise<Response> {
  const id = requestId(request);
  const originRejected = rejectCrossOrigin(request, id);
  if (originRejected) return originRejected;
  const limited = enforceRateLimit(request, id, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const body = await parseJson(request, auditInputSchema, id);
  if (isResponse(body)) return body;

  const repository = await getOperationalRepository();
  const event = {
    ...body,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    actorRole: "stadium-safety-supervisor" as const,
  };

  try {
    await repository.appendAuditEvent(event);
    return jsonResponse({
      ok: true,
      event,
      persistence: { mode: repository.mode, durable: repository.durable },
      dispatchPerformed: false,
    }, 201, id);
  } catch {
    return publicError(id, 503, "AUDIT_WRITE_UNAVAILABLE", "The audit event could not be recorded. No operational action was dispatched.");
  }
}
