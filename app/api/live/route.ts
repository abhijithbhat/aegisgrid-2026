import { z } from "zod";
import { getOperationalRepository } from "../../../src/lib/firestore/repository";
import { enforceRateLimit, rejectCrossOriginRequest, requestId } from "../../../src/lib/api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const syncedActionSchema = z
  .object({
    text: z.string().min(1).max(500),
    owner: z.string().min(1).max(120),
    target: z.string().min(1).max(80),
    approval: z.boolean(),
  })
  .strict();
const incidentUpdateSchema = z
  .object({
    type: z.literal("incident"),
    record: z
      .object({
        id: z.string().min(1).max(80),
        updatedAt: z.iso.datetime(),
        payload: z
          .object({
            id: z.string().min(1).max(80),
            status: z
              .enum(["Awaiting approval", "Plan approved", "Monitoring", "Resolved", "Dismissed"])
              .optional(),
            team: z.string().min(1).max(120).optional(),
            actions: z.array(syncedActionSchema).max(20).optional(),
            announcement: z
              .object({
                language: z.string().min(1).max(120),
                tone: z.string().min(1).max(120),
                text: z.string().min(1).max(2_000),
              })
              .strict()
              .optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();
const auditUpdateSchema = z
  .object({
    type: z.literal("audit"),
    event: z
      .object({
        id: z.string().uuid(),
        timestamp: z.iso.datetime(),
        actorRole: z.enum(["stadium-safety-supervisor", "system"]),
        action: z.string().min(1).max(120),
        incidentId: z.string().min(1).max(80),
        previousStatus: z.string().max(80),
        newStatus: z.string().max(80),
        note: z.string().max(1_000),
        aiRecommendationVersion: z.string().max(120),
      })
      .strict(),
  })
  .strict();

export async function GET(request: Request): Promise<Response> {
  const id = requestId(request);
  const originRejected = rejectCrossOriginRequest(request, id);
  if (originRejected) return originRejected;
  const limited = enforceRateLimit(request, id, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const repository = await getOperationalRepository();
  if (!repository.durable || !repository.subscribe) {
    return Response.json(
      {
        ok: false,
        mode: "memory",
        message: "Live synchronization requires ENABLE_FIRESTORE=true.",
      },
      { status: 409, headers: { "x-request-id": id } },
    );
  }
  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("ready", { mode: "firestore" });
      unsubscribe = repository.subscribe!(
        (update) => {
          const parsed =
            update.type === "incident"
              ? incidentUpdateSchema.safeParse(update)
              : auditUpdateSchema.safeParse(update);
          if (parsed.success) send(update.type, parsed.data);
        },
        () => {
          send("sync-error", { message: "Live synchronization paused." });
          controller.close();
        },
      );
      request.signal.addEventListener(
        "abort",
        () => {
          unsubscribe();
          try {
            controller.close();
          } catch {}
        },
        { once: true },
      );
    },
    cancel() {
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-request-id": id,
    },
  });
}
