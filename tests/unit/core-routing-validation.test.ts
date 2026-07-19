import { describe, expect, it, vi } from "vitest";
import type { AIRecommendation, StadiumZone, ZoneEdge } from "../../src/types";
import { validateAIResponse } from "../../src/lib/ai";
import { StadiumGraph, calculateResponderRoutes } from "../../src/lib/routing";
import {
  parseTelemetryCsv,
  validateTelemetryRows,
  validateUploadDescriptor,
} from "../../src/lib/telemetry";

const zones: StadiumZone[] = [
  ["a", 0, 0],
  ["b", 1, 0],
  ["c", 0, 1],
  ["d", 1, 1],
].map(([id, x, y]) => ({
  id: String(id),
  name: String(id),
  shortName: String(id),
  kind: "concourse",
  capacity: 100,
  coordinates: { x: Number(x), y: Number(y) },
  level: 0,
  accessible: true,
  status: "normal",
  tags: [],
}));

const makeEdge = (
  id: string,
  from: string,
  to: string,
  distance: number,
  options: Partial<ZoneEdge> = {},
): ZoneEdge => ({
  id,
  from,
  to,
  distanceMeters: distance,
  baseTravelSeconds: distance,
  bidirectional: true,
  accessible: true,
  hasStairs: false,
  access: "public",
  crowdSensitivity: 1,
  hazardExposure: 1,
  blocked: false,
  ...options,
});

describe("deterministic responder routing", () => {
  it("returns dynamic primary, alternate and naive distance comparison", () => {
    const graph = new StadiumGraph(zones, [
      makeEdge("ab", "a", "b", 10),
      makeEdge("bd", "b", "d", 10),
      makeEdge("ac", "a", "c", 15),
      makeEdge("cd", "c", "d", 15),
    ]);
    const result = calculateResponderRoutes(graph, {
      fromZoneId: "a",
      toZoneId: "d",
      zoneCongestion: { b: 1.5 },
    });
    expect(result.primary.zoneIds).toEqual(["a", "c", "d"]);
    expect(result.naive.zoneIds).toEqual(["a", "b", "d"]);
    expect(result.alternate?.zoneIds).toEqual(["a", "b", "d"]);
    expect(result.timeSavedSeconds).toBeGreaterThan(0);
  });

  it("excludes stairs and blocked corridors for accessible routing", () => {
    const graph = new StadiumGraph(zones, [
      makeEdge("ab", "a", "b", 10, { accessible: false, hasStairs: true }),
      makeEdge("bd", "b", "d", 10, { accessible: false, hasStairs: true }),
      makeEdge("ac", "a", "c", 15),
      makeEdge("cd", "c", "d", 15),
    ]);
    const result = calculateResponderRoutes(graph, {
      fromZoneId: "a",
      toZoneId: "d",
      accessibilityRequired: true,
    });
    expect(result.primary.zoneIds).toEqual(["a", "c", "d"]);
    expect(result.primary.accessible).toBe(true);
  });
});

const validAI = (): AIRecommendation => ({
  summary: "One person is reported unconscious near the west food court.",
  incidentType: "medical",
  severity: "critical",
  confidence: 0.91,
  evidence: [{ sourceId: "SRC-1", fact: "A person was reported unconscious.", weight: 0.9 }],
  contradictions: [],
  missingInformation: ["Breathing status is not confirmed."],
  clarifyingQuestions: ["Is the person breathing normally?"],
  recommendedActions: [
    {
      priority: 1,
      action: "Send the nearest medical team after supervisor approval.",
      ownerRole: "medical responder",
      targetMinutes: 2,
      justification: "Unconsciousness requires immediate assessment.",
      requiresApproval: true,
    },
  ],
  recommendedTeamType: "medical",
  equipment: ["AED"],
  announcement: {
    language: "en",
    tone: "calm",
    text: "Please keep the west food court access clear.",
  },
  uncertaintyNote: "The person's current breathing status is unknown.",
  requiresHumanApproval: true,
});

describe("strict AI response contract", () => {
  it("accepts grounded sources and performs no repair", async () => {
    const outcome = await validateAIResponse(validAI(), {
      allowedSourceIds: new Set(["SRC-1"]),
      sourceTextById: { "SRC-1": "A person is unconscious near the food court." },
    });
    expect(outcome.status).toBe("available");
    expect(outcome.repairAttempted).toBe(false);
  });

  it("attempts exactly one repair then fails safely", async () => {
    const repair = vi.fn(async () => ({ ...validAI(), confidence: 5 }));
    const outcome = await validateAIResponse(
      { ...validAI(), confidence: 2 },
      { allowedSourceIds: ["SRC-1"] },
      repair,
    );
    expect(repair).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("degraded");
    expect(outcome.repairAttempted).toBe(true);
  });

  it("deterministically removes invented citations without changing grounded evidence", async () => {
    const response = validAI();
    response.evidence.push({
      sourceId: "INVENTED-SOURCE",
      fact: "An unsupported source claims a different severity.",
      weight: 0.4,
    });
    response.contradictions.push({
      sourceIds: ["SRC-1", "INVENTED-SOURCE"],
      description: "The invented source conflicts with the report.",
      operationalImpact: "The severity might be lower.",
    });
    const repair = vi.fn(async () => validAI());

    const outcome = await validateAIResponse(response, { allowedSourceIds: ["SRC-1"] }, repair);

    expect(repair).not.toHaveBeenCalled();
    expect(outcome.status).toBe("available");
    expect(outcome.repairAttempted).toBe(true);
    if (outcome.status === "available") {
      expect(outcome.recommendation.evidence).toEqual([response.evidence[0]]);
      expect(outcome.recommendation.contradictions).toEqual([]);
    }
  });

  it("rejects an invented evidence source", async () => {
    const outcome = await validateAIResponse(validAI(), { allowedSourceIds: ["OTHER"] });
    expect(outcome.status).toBe("degraded");
  });
});

describe("untrusted telemetry validation", () => {
  const context = { knownZoneIds: new Set(["gate-west"]), importId: "test" };

  it("rejects oversized and mismatched file metadata", () => {
    expect(
      validateUploadDescriptor({
        name: "payload.csv",
        size: 2 * 1024 * 1024 + 1,
        mimeType: "text/csv",
      }).valid,
    ).toBe(false);
    expect(
      validateUploadDescriptor({ name: "payload.csv", size: 100, mimeType: "application/pdf" })
        .valid,
    ).toBe(false);
  });

  it("rejects negative capacity, occupancy without capacity, NaN and unknown zones", () => {
    const result = validateTelemetryRows(
      [
        {
          timestamp: "2026-07-10T10:00:00Z",
          zone_id: "gate-west",
          occupancy: 10,
          sensor_health: "healthy",
          blocked: false,
          event_phase: "ingress",
        },
        {
          timestamp: "bad",
          zone_id: "unknown",
          capacity: -1,
          occupancy: Number.NaN,
          sensor_health: "healthy",
          blocked: false,
          event_phase: "ingress",
        },
      ],
      context,
    );
    expect(result.accepted).toHaveLength(0);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "missing_required",
        "invalid_timestamp",
        "unknown_zone",
        "invalid_number",
      ]),
    );
  });

  it("parses quoted canonical CSV and accepts a valid row", () => {
    const csv = [
      "timestamp,zone_id,occupancy,capacity,sensor_health,blocked,event_phase",
      '"2026-07-10T10:00:00Z",gate-west,900,1000,healthy,false,ingress',
    ].join("\n");
    expect(parseTelemetryCsv(csv, context).accepted).toHaveLength(1);
  });
});
