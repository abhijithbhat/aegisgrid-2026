import { z } from "zod";

export const MAX_JSON_BYTES = 256 * 1024;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export interface PublicErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export function requestId(request: Request): string {
  const incoming = request.headers.get("x-request-id");
  if (incoming && /^[a-zA-Z0-9_-]{8,80}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

export function jsonResponse(data: unknown, status = 200, id?: string): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      ...(id ? { "x-request-id": id } : {}),
    },
  });
}

export function publicError(
  id: string,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: PublicErrorBody = {
    ok: false,
    error: { code, message, requestId: id, ...(details === undefined ? {} : { details }) },
  };
  return jsonResponse(body, status, id);
}

/**
 * Blocks browser cross-origin writes while preserving non-browser/server calls
 * that do not carry an Origin header. Cloudflare supplies the canonical request
 * URL in production, so an accepted browser Origin must match it exactly.
 */
export function rejectCrossOriginRequest(request: Request, id: string): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    
    if (originUrl.origin === requestUrl.origin) return null;

    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (forwardedHost) {
      const forwardedProto = request.headers.get("x-forwarded-proto") || (requestUrl.protocol === "https:" ? "https" : "http");
      const forwardedOriginUrl = new URL(`${forwardedProto}://${forwardedHost}`);
      if (originUrl.origin === forwardedOriginUrl.origin) return null;
    }
  } catch {
    // Invalid Origin values are rejected below.
  }
  return publicError(id, 403, "ORIGIN_REJECTED", "Cross-origin access is not allowed.");
}

export async function parseJson<TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  id: string,
): Promise<z.infer<TSchema> | Response> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length > MAX_JSON_BYTES) {
    return publicError(id, 413, "PAYLOAD_TOO_LARGE", "The request exceeds the 256 KiB JSON limit.");
  }

  let raw: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
      return publicError(id, 413, "PAYLOAD_TOO_LARGE", "The request exceeds the 256 KiB JSON limit.");
    }
    raw = JSON.parse(text);
  } catch {
    return publicError(id, 400, "INVALID_JSON", "The request body must contain valid JSON.");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return publicError(
      id,
      422,
      "VALIDATION_FAILED",
      "The request contains invalid or unsupported fields.",
      result.error.issues.map(({ path, code, message }) => ({ path, code, message })),
    );
  }
  return result.data;
}

type RateWindow = { count: number; resetAt: number };
const requestWindows = new Map<string, RateWindow>();

export function enforceRateLimit(
  request: Request,
  id: string,
  options: { limit: number; windowMs: number } = { limit: 30, windowMs: 60_000 },
): Response | null {
  const forwarded = request.headers.get("cf-connecting-ip") ?? "local";
  const address = forwarded.trim().slice(0, 80) || "local";
  const key = `${new URL(request.url).pathname}:${address}`;
  const now = Date.now();
  if (requestWindows.size > 1_000) {
    for (const [windowKey, window] of requestWindows) {
      if (window.resetAt <= now) requestWindows.delete(windowKey);
    }
  }
  const current = requestWindows.get(key);
  if (!current || current.resetAt <= now) {
    requestWindows.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }
  current.count += 1;
  if (current.count <= options.limit) return null;
  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  const response = publicError(id, 429, "RATE_LIMITED", "Too many requests. Try again shortly.");
  response.headers.set("retry-after", String(retryAfter));
  return response;
}

export function structuredLog(entry: {
  requestId: string;
  operation: string;
  outcome: "success" | "degraded" | "rejected" | "error";
  durationMs: number;
  code?: string;
}): void {
  // Intentionally excludes request bodies, provider payloads, and secrets.
  console.info(JSON.stringify({
    severity: entry.outcome === "error" ? "ERROR" : "INFO",
    timestamp: new Date().toISOString(),
    ...entry,
  }));
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
