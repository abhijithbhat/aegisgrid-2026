import { z } from "zod";
import {
  enforceRateLimit,
  isResponse,
  jsonResponse,
  parseJson,
  publicError,
  rejectCrossOriginRequest,
  requestId,
} from "../../../src/lib/api/http";
import { getOperationalRepository } from "../../../src/lib/firestore/repository";

export const runtime = "nodejs";

const incidentPatchSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/),
    status: z
      .enum(["Awaiting approval", "Plan approved", "Monitoring", "Resolved", "Dismissed"])
      .optional(),
    team: z.string().trim().min(1).max(120).optional(),
    actions: z
      .array(
        z
          .object({
            text: z.string().trim().min(1).max(500),
            owner: z.string().trim().min(1).max(120),
            target: z.string().trim().min(1).max(80),
            approval: z.boolean(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    announcement: z
      .object({
        language: z.string().trim().min(1).max(120),
        tone: z.string().trim().min(1).max(120),
        text: z.string().trim().min(1).max(2_000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.status !== undefined ||
      value.team !== undefined ||
      value.actions !== undefined ||
      value.announcement !== undefined,
    { message: "At least one incident field is required." },
  );

export async function POST(request: Request): Promise<Response> {
  const id = requestId(request);
  const originRejected = rejectCrossOriginRequest(request, id);
  if (originRejected) return originRejected;
  const limited = enforceRateLimit(request, id, { limit: 90, windowMs: 60_000 });
  if (limited) return limited;
  const body = await parseJson(request, incidentPatchSchema, id);
  if (isResponse(body)) return body;
  try {
    const repository = await getOperationalRepository();
    await repository.upsertIncident({
      id: body.id,
      updatedAt: new Date().toISOString(),
      payload: body,
    });
    return jsonResponse(
      { ok: true, persistence: { mode: repository.mode, durable: repository.durable } },
      200,
      id,
    );
  } catch {
    return publicError(
      id,
      503,
      "INCIDENT_SYNC_UNAVAILABLE",
      "The incident update remains local because shared persistence is unavailable.",
    );
  }
}
