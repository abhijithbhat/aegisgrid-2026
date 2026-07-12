import { afterEach, describe, expect, it } from "vitest";
import { GET as health } from "../../app/api/health/route";
import { GET as listAudit, POST as createAudit } from "../../app/api/audit/route";
import { POST as upload } from "../../app/api/upload/route";
import { POST as analyze } from "../../app/api/analyze/route";
import { POST as fuse } from "../../app/api/fuse/route";
import { POST as updateIncident } from "../../app/api/incidents/route";
import { GET as liveUpdates } from "../../app/api/live/route";

const originalKey = process.env.GEMINI_API_KEY;
const originalFirestore = process.env.ENABLE_FIRESTORE;

afterEach(() => {
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
  if (originalFirestore === undefined) delete process.env.ENABLE_FIRESTORE;
  else process.env.ENABLE_FIRESTORE = originalFirestore;
});

describe("typed API boundaries", () => {
  it("reports honest degraded capabilities without exposing configuration", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await health(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("degraded");
    expect(body.capabilities.deterministicRisk).toBe(true);
    expect(body.capabilities.semanticAnalysis).toBe(false);
    expect(JSON.stringify(body)).not.toContain("GEMINI_API_KEY");
  });

  it("rejects cross-origin browser writes before parsing or provider work", async () => {
    const routes = [
      ["upload", upload],
      ["analyze", analyze],
      ["fuse", fuse],
      ["audit", createAudit],
    ] as const;

    for (const [name, route] of routes) {
      const response = await route(new Request(`http://localhost/api/${name}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://attacker.example",
        },
        body: "{}",
      }));
      const body = await response.json();
      expect(response.status, name).toBe(403);
      expect(body.error.code, name).toBe("ORIGIN_REJECTED");
    }
  });

  it("accepts a canonical file only into the mapping-approval stage", async () => {
    const form = new FormData();
    form.set("file", new File([
      "timestamp,zone_id,occupancy,capacity,event_phase\n2026-07-10T14:00:00Z,GATE-W,20,100,ingress",
    ], "reading.csv", { type: "text/csv" }));
    const response = await upload(new Request("http://localhost/api/upload", { method: "POST", body: form }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stage).toBe("mapping-approval-required");
    expect(body.mapping.requiresExplicitApproval).toBe(true);
    expect(body.storage.rawFilePersisted).toBe(false);
  });

  it("writes append-only audit events without claiming dispatch", async () => {
    const incidentId = `incident-${crypto.randomUUID()}`;
    const response = await createAudit(new Request("http://localhost/api/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "recommendation-approved",
        incidentId,
        previousStatus: "awaiting-approval",
        newStatus: "approved",
        note: "Approved for team assignment; no dispatch performed by AegisGrid.",
        aiRecommendationVersion: "aegis-ai-contract-1.0.0",
      }),
    }));
    const created = await response.json();

    expect(response.status).toBe(201);
    expect(created.dispatchPerformed).toBe(false);

    const listResponse = await listAudit(new Request(`http://localhost/api/audit?incidentId=${incidentId}`));
    const listed = await listResponse.json();
    expect(listed.events).toHaveLength(1);
    expect(listed.events[0].incidentId).toBe(incidentId);
  });

  it("rejects unknown JSON fields", async () => {
    const response = await createAudit(new Request("http://localhost/api/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "recommendation-approved",
        incidentId: "INC-1",
        previousStatus: "new",
        newStatus: "approved",
        note: "",
        aiRecommendationVersion: "v1",
        dispatchEmergencyServices: true,
      }),
    }));
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.error.code).toBe("VALIDATION_FAILED");
  });

  it("inspects flat JSON without silently importing it", async () => {
    const form = new FormData();
    form.set("file", new File([JSON.stringify([{
      timestamp: "2026-07-10T14:00:00Z", zone_id: "W-CONC", occupancy: 20, capacity: 100, event_phase: "ingress",
    }])], "reading.json", { type: "application/json" }));
    const response = await upload(new Request("http://localhost/api/upload", { method: "POST", body: form }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.stage).toBe("mapping-approval-required");
    expect(body.upload.rows).toHaveLength(1);
    expect(body.storage.rawFilePersisted).toBe(false);
  });

  it("rejects invalid UTF-8 and oversized files with public 4xx errors", async () => {
    const malformed = new FormData();
    malformed.set("file", new File([new Uint8Array([0xff, 0xfe, 0xfd])], "bad.csv", { type: "text/csv" }));
    const malformedResponse = await upload(new Request("http://localhost/api/upload", { method: "POST", body: malformed }));
    expect(malformedResponse.status).toBe(400);
    expect((await malformedResponse.json()).error.code).toBe("INVALID_TEXT_ENCODING");

    const oversized = new FormData();
    oversized.set("file", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.csv", { type: "text/csv" }));
    const oversizedResponse = await upload(new Request("http://localhost/api/upload", { method: "POST", body: oversized }));
    expect(oversizedResponse.status).toBe(413);
  });

  it("validates approved mappings and rejects unknown zones", async () => {
    const response = await upload(new Request("http://localhost/api/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "validate",
        rows: [{ observed: "2026-07-10T14:00:00Z", area: "NOT-A-ZONE", people: 20, limit: 100, phase: "ingress" }],
        mappings: [
          ["observed", "timestamp"], ["area", "zone_id"], ["people", "occupancy"], ["limit", "capacity"], ["phase", "event_phase"],
        ].map(([sourceColumn, canonicalField]) => ({ sourceColumn, canonicalField, confidence: 1, rationale: "Supervisor confirmed.", requiresApproval: true, source: "heuristic" })),
      }),
    }));
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.validation.issues.map((issue: { code: string }) => issue.code)).toContain("UNKNOWN_ZONE");
  });

  it("returns the full deterministic capability set when AI is unavailable", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await analyze(new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        incidentId: "INC-TEST", title: "Unstructured report", incidentType: "other", zoneId: "unconfirmed", eventPhase: "live-match",
        deterministicRisk: { score: 10, severity: "low", explanation: "No telemetry linked." },
        sources: [{ sourceId: "SRC-1", sourceType: "staff", text: "A person may need help near the west stairs.", reliability: 0.6 }],
        route: { primaryZoneIds: ["unconfirmed"], alternateZoneIds: [], etaMinutes: 0, avoidedZoneIds: [], rationale: "Location must be confirmed." },
      }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.outcome.status).toBe("degraded");
    expect(body.outcome.deterministicCapabilities).toEqual(["risk-scoring", "routing", "telemetry"]);
  });

  it("streams validated reasoning milestones before the final degraded result", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await analyze(new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({
        incidentId: "INC-STREAM", title: "Streaming contract test", incidentType: "other", zoneId: "unconfirmed", eventPhase: "live-match",
        deterministicRisk: { score: 12, severity: "low", explanation: "No telemetry linked." },
        sources: [{ sourceId: "SRC-STREAM", sourceType: "staff", text: "A person may need assistance.", reliability: 0.6 }],
        route: { primaryZoneIds: ["unconfirmed"], alternateZoneIds: [], etaMinutes: 0, avoidedZoneIds: [], rationale: "Location must be confirmed." },
      }),
    }));
    const stream = await response.text();
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(stream).toContain("event: reasoning");
    expect(stream).toContain("Evidence envelope validated");
    expect(stream).toContain("event: result");
    expect(stream).toContain('"status":"degraded"');
  });

  it("persists strict incident patches and keeps live sync honest in memory mode", async () => {
    delete process.env.ENABLE_FIRESTORE;
    const update = await updateIncident(new Request("http://localhost/api/incidents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "INC-SYNC", status: "Monitoring", team: "Medical Alpha" }),
    }));
    expect(update.status).toBe(200);
    expect((await update.json()).persistence).toEqual({ mode: "memory", durable: false });

    const live = await liveUpdates(new Request("http://localhost/api/live"));
    expect(live.status).toBe(409);
    expect((await live.json()).mode).toBe("memory");
  });

  it("preserves distinct source reports in degraded fusion mode", async () => {
    delete process.env.GEMINI_API_KEY;
    const response = await fuse(new Request("http://localhost/api/fuse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reports: [
        { sourceId: "FALL-A", zoneId: "W-GATE", timestamp: "2026-07-10T14:00:00Z", text: "A person fell by the west gate.", language: "en", reliability: 0.8, incidentType: "medical", vulnerablePerson: true },
        { sourceId: "CASE-B", zoneId: "W-CONC", timestamp: "2026-07-10T14:01:00Z", text: "An equipment case fell in the west concourse.", language: "en", reliability: 0.8, incidentType: "infrastructure", vulnerablePerson: false },
      ] }),
    }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.sourceReportsPreserved).toBe(true);
    expect(body.clusters).toHaveLength(2);
  });
});
