import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  enforceRateLimit,
  isResponse,
  jsonResponse,
  MAX_JSON_BYTES,
  parseJson,
  publicError,
  rejectCrossOriginRequest,
  requestId,
  structuredLog,
} from "../../src/lib/api/http";

afterEach(() => {
  delete process.env.APP_ORIGIN;
  vi.restoreAllMocks();
});

describe("HTTP trust boundary", () => {
  it("accepts a safe correlation ID and replaces malformed values", () => {
    expect(
      requestId(
        new Request("https://example.test", { headers: { "x-request-id": "request_1234" } }),
      ),
    ).toBe("request_1234");
    expect(
      requestId(new Request("https://example.test", { headers: { "x-request-id": "bad id" } })),
    ).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns no-store JSON and stable public error envelopes", async () => {
    const response = jsonResponse({ ok: true }, 201, "request_1234");
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("request_1234");
    expect(await response.json()).toEqual({ ok: true });

    const error = publicError("request_1234", 422, "INVALID", "Invalid request", { field: "zone" });
    expect(await error.json()).toEqual({
      ok: false,
      error: {
        code: "INVALID",
        message: "Invalid request",
        requestId: "request_1234",
        details: { field: "zone" },
      },
    });
  });

  it("allows same-origin and configured production writes but rejects every other origin", () => {
    const id = "request_1234";
    expect(rejectCrossOriginRequest(new Request("https://app.test/api/audit"), id)).toBeNull();
    expect(
      rejectCrossOriginRequest(
        new Request("https://app.test/api/audit", { headers: { origin: "https://app.test" } }),
        id,
      ),
    ).toBeNull();

    process.env.APP_ORIGIN = "https://aegis.example";
    expect(
      rejectCrossOriginRequest(
        new Request("http://internal:8080/api/audit", {
          headers: { origin: "https://aegis.example" },
        }),
        id,
      ),
    ).toBeNull();
    expect(
      rejectCrossOriginRequest(
        new Request("http://internal:8080/api/audit", {
          headers: { origin: "https://attacker.example" },
        }),
        id,
      )?.status,
    ).toBe(403);
    expect(
      rejectCrossOriginRequest(
        new Request("http://internal:8080/api/audit", { headers: { origin: "not a url" } }),
        id,
      )?.status,
    ).toBe(403);
  });

  it("honors trusted proxy host metadata when no canonical origin is configured", () => {
    const request = new Request("http://internal:8080/api/audit", {
      headers: {
        origin: "https://public.example",
        "x-forwarded-host": "public.example",
        "x-forwarded-proto": "https",
      },
    });
    expect(rejectCrossOriginRequest(request, "request_1234")).toBeNull();
  });

  it("bounds, parses, and schema-validates JSON bodies", async () => {
    const schema = z.object({ zone: z.string().min(1) }).strict();
    const valid = await parseJson(
      new Request("https://app.test/api", {
        method: "POST",
        body: JSON.stringify({ zone: "west" }),
      }),
      schema,
      "request_1234",
    );
    expect(valid).toEqual({ zone: "west" });

    const declaredTooLarge = await parseJson(
      new Request("https://app.test/api", {
        method: "POST",
        headers: { "content-length": String(MAX_JSON_BYTES + 1) },
        body: "{}",
      }),
      schema,
      "request_1234",
    );
    expect(isResponse(declaredTooLarge) && declaredTooLarge.status).toBe(413);

    const actualTooLarge = await parseJson(
      new Request("https://app.test/api", {
        method: "POST",
        body: JSON.stringify({ zone: "x".repeat(MAX_JSON_BYTES) }),
      }),
      schema,
      "request_1234",
    );
    expect(isResponse(actualTooLarge) && actualTooLarge.status).toBe(413);

    const invalidJson = await parseJson(
      new Request("https://app.test/api", { method: "POST", body: "{" }),
      schema,
      "request_1234",
    );
    expect(isResponse(invalidJson) && invalidJson.status).toBe(400);

    const invalidShape = await parseJson(
      new Request("https://app.test/api", {
        method: "POST",
        body: JSON.stringify({ zone: "", extra: true }),
      }),
      schema,
      "request_1234",
    );
    expect(isResponse(invalidShape) && invalidShape.status).toBe(422);
    if (isResponse(invalidShape)) {
      const body = (await invalidShape.json()) as { error: { details: unknown[] } };
      expect(body.error.details.length).toBeGreaterThan(0);
    }
  });

  it("rate-limits by route and address with a retry-after response", () => {
    const url = `https://app.test/api/rate-${crypto.randomUUID()}`;
    const request = new Request(url, { headers: { "cf-connecting-ip": "203.0.113.9" } });
    expect(enforceRateLimit(request, "request_1234", { limit: 1, windowMs: 60_000 })).toBeNull();
    const limited = enforceRateLimit(request, "request_1234", { limit: 1, windowMs: 60_000 });
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });

  it("logs metadata without request payloads", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    structuredLog({
      requestId: "request_1234",
      operation: "unit-test",
      outcome: "error",
      durationMs: 3,
      code: "EXPECTED",
    });
    const entry = JSON.parse(String(info.mock.calls[0][0])) as Record<string, unknown>;
    expect(entry).toMatchObject({ severity: "ERROR", operation: "unit-test", code: "EXPECTED" });
    expect(entry).not.toHaveProperty("body");
  });
});
