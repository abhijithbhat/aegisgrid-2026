import { describe, expect, it } from "vitest";
import type { FusedIncident, IncidentReport, ZoneEdge } from "../../src/types";
import { assessRisk, DEFAULT_RISK_CONFIG } from "../../src/lib/risk";
import {
  BinaryHeap,
  fuseIncidentReports,
  generateDuplicateCandidates,
  IncidentPriorityQueue,
} from "../../src/lib/incidents";

describe("transparent risk engine", () => {
  it("returns auditable normalized contributions with configured weights", () => {
    const result = assessRisk({
      telemetry: {
        occupancy: 950,
        capacity: 1_000,
        inflowPerMinute: 70,
        outflowPerMinute: 20,
        queueMinutes: 15,
        sensorHealth: "degraded",
        blocked: true,
        eventPhase: "egress",
      },
      hazardSeverity: 80,
      independentSourceCount: 3,
      meanSourceReliability: 0.9,
      blockedRoute: true,
      vulnerablePerson: true,
    });

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.severity).toBe("critical");
    expect(result.contributions).toHaveLength(9);
    expect(result.contributions.reduce((sum, item) => sum + item.weight, 0)).toBeCloseTo(1);
    expect(result.configVersion).toBe(DEFAULT_RISK_CONFIG.version);
  });
});

describe("binary heap and incident priority queue", () => {
  it("orders generic values in O(log n) heap operations", () => {
    const heap = new BinaryHeap<number>((a, b) => a - b, [8, 3, 5, 1, 9]);
    expect([heap.pop(), heap.pop(), heap.pop(), heap.pop(), heap.pop()]).toEqual([1, 3, 5, 8, 9]);
  });

  it("removes the highest operational-priority incident first", () => {
    const base: FusedIncident = {
      id: "low",
      title: "Low",
      incidentType: "other",
      zoneId: "z1",
      severity: "low",
      confidence: 0.8,
      createdAt: "2026-07-10T10:00:00Z",
      updatedAt: "2026-07-10T10:00:00Z",
      reportIds: ["r1"],
      sourceIds: ["s1"],
      evidence: [],
      contradictions: [],
      riskScore: 20,
      status: "new",
      recommendedTeamType: "security",
      vulnerablePerson: false,
    };
    const queue = new IncidentPriorityQueue();
    queue.enqueue(base, new Date("2026-07-10T10:01:00Z"));
    queue.enqueue(
      { ...base, id: "critical", severity: "critical", riskScore: 88, vulnerablePerson: true },
      new Date("2026-07-10T10:01:00Z"),
    );
    expect(queue.dequeue()?.incident.id).toBe("critical");
  });
});

describe("duplicate blocking and semantic fusion", () => {
  const edge: ZoneEdge = {
    id: "z1-z2",
    from: "z1",
    to: "z2",
    distanceMeters: 20,
    baseTravelSeconds: 15,
    bidirectional: true,
    accessible: true,
    hasStairs: false,
    access: "public",
    crowdSensitivity: 1,
    hazardExposure: 1,
    blocked: false,
  };
  const report = (overrides: Partial<IncidentReport>): IncidentReport => ({
    id: "r1",
    sourceId: "s1",
    sourceType: "staff",
    timestamp: "2026-07-10T10:00:00Z",
    receivedAt: "2026-07-10T10:00:03Z",
    rawText: "Person collapsed near the west food kiosk",
    language: "en",
    zoneId: "z1",
    incidentType: "medical",
    reliability: 0.9,
    vulnerablePerson: true,
    dismissed: false,
    ...overrides,
  });

  it("only sends plausible neighbourhood/time pairs to semantic comparison", () => {
    const reports = [
      report({}),
      report({
        id: "r2",
        sourceId: "s2",
        timestamp: "2026-07-10T10:03:00Z",
        rawText: "A person collapsed beside the west food kiosk",
      }),
      report({
        id: "r3",
        sourceId: "s3",
        zoneId: "z2",
        timestamp: "2026-07-10T10:02:00Z",
        rawText: "An adult slipped beside a different kiosk",
        vulnerablePerson: false,
      }),
    ];
    const candidates = generateDuplicateCandidates(reports, [edge]);
    expect(candidates.some((item) => item.pairKey === "r1::r2")).toBe(true);

    const fused = fuseIncidentReports(
      reports,
      [edge],
      [
        {
          reportAId: "r1",
          reportBId: "r2",
          sameIncident: true,
          confidence: 0.94,
          explanation: "Same event",
          contradictions: [],
        },
      ],
    );
    expect(fused.clusters.find((cluster) => cluster.reportIds.includes("r1"))?.reportIds).toEqual([
      "r1",
      "r2",
    ]);
    expect(fused.clusters.flatMap((cluster) => cluster.reports)).toHaveLength(3);
  });
});
