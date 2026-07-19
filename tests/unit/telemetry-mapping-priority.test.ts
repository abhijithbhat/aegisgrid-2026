import { describe, expect, it } from "vitest";
import type { FusedIncident, ProposedFieldMapping } from "../../src/types";
import {
  computeOperationalPriority,
  IncidentPriorityQueue,
  prioritizeIncidents,
  rankOperationalItems,
} from "../../src/lib/incidents/priority-queue";
import { applyApprovedMappings } from "../../src/lib/telemetry/mapping";

const incident = (overrides: Partial<FusedIncident> = {}): FusedIncident => ({
  id: "INC-1",
  title: "Medical assistance",
  incidentType: "medical",
  zoneId: "zone-west",
  severity: "high",
  confidence: 0.8,
  createdAt: "2026-07-19T10:00:00.000Z",
  updatedAt: "2026-07-19T10:00:00.000Z",
  reportIds: ["R-1"],
  sourceIds: ["S-1"],
  evidence: [],
  contradictions: [],
  riskScore: 60,
  status: "new",
  recommendedTeamType: "medical",
  vulnerablePerson: false,
  ...overrides,
});

describe("human-confirmed schema mapping", () => {
  const mappings: ProposedFieldMapping[] = [
    {
      sourceField: "place",
      targetField: "zone_id",
      confidence: 0.97,
      rationale: "Known alias",
      requiresConfirmation: false,
    },
    {
      sourceField: "people",
      targetField: "occupancy",
      confidence: 0.72,
      rationale: "Ambiguous count",
      requiresConfirmation: true,
    },
    {
      sourceField: "comment",
      targetField: null,
      confidence: 1,
      rationale: "Not operational telemetry",
      requiresConfirmation: false,
    },
  ];

  it("applies safe mappings and holds ambiguous fields until a person confirms them", () => {
    const held = applyApprovedMappings(
      [{ place: "zone-west", people: 42, comment: "ignore me" }],
      mappings,
      new Set(),
    );
    expect(held.rows).toEqual([{ zone_id: "zone-west" }]);
    expect(held.issues).toEqual([
      expect.objectContaining({ field: "people", code: "missing_required" }),
    ]);

    const confirmed = applyApprovedMappings(
      [{ place: "zone-west", people: 42 }],
      mappings,
      new Set(["people"]),
    );
    expect(confirmed).toEqual({
      rows: [{ zone_id: "zone-west", occupancy: 42 }],
      issues: [],
    });
  });

  it("rejects two source columns targeting the same canonical field", () => {
    const result = applyApprovedMappings(
      [{ place: "west", location: "east" }],
      [mappings[0], { ...mappings[0], sourceField: "location" }],
      new Set(),
    );
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ code: "malformed_file" })]);
  });
});

describe("deterministic operational priority", () => {
  const now = new Date("2026-07-19T10:10:00.000Z");

  it("raises priority for age, contradictions, vulnerability, confidence, and approval state", () => {
    const baseline = computeOperationalPriority(incident(), now);
    const urgent = computeOperationalPriority(
      incident({
        severity: "critical",
        status: "awaiting-approval",
        confidence: 1,
        contradictions: [
          {
            sourceIds: ["S-1", "S-2"],
            description: "location mismatch",
            operationalImpact: "verify",
          },
          { sourceIds: ["S-1", "S-3"], description: "count mismatch", operationalImpact: "verify" },
        ],
        vulnerablePerson: true,
      }),
      now,
    );
    expect(urgent).toBeGreaterThan(baseline + 40);
  });

  it("supports peek, stable ties, ordered snapshots, dequeue, and clear", () => {
    const queue = new IncidentPriorityQueue();
    expect(queue.peek()).toBeUndefined();
    expect(queue.dequeue()).toBeUndefined();

    queue.enqueue(incident({ id: "first" }), now);
    queue.enqueue(incident({ id: "second" }), now);
    queue.enqueue(incident({ id: "urgent", riskScore: 99, severity: "critical" }), now);

    expect(queue.size).toBe(3);
    expect(queue.peek()?.incident.id).toBe("urgent");
    expect(queue.ordered().map((entry) => entry.incident.id)).toEqual([
      "urgent",
      "first",
      "second",
    ]);
    expect(queue.dequeue()?.incident.id).toBe("urgent");
    queue.clear();
    expect(queue.size).toBe(0);
  });

  it("omits terminal incidents and clamps presentation signals", () => {
    const active = incident({ id: "active" });
    const prioritized = prioritizeIncidents(
      [
        active,
        incident({ id: "resolved", status: "resolved" }),
        incident({ id: "dismissed", status: "dismissed" }),
      ],
      now,
    );
    expect(prioritized.map((entry) => entry.incident.id)).toEqual(["active"]);

    const ranked = rankOperationalItems(["clamped", "normal"], (item) =>
      item === "clamped"
        ? {
            riskScore: 200,
            severity: "critical",
            confidence: 3,
            contradictionCount: 20,
            awaitingApproval: true,
            vulnerablePerson: true,
          }
        : {
            riskScore: -10,
            severity: "low",
            confidence: -1,
            contradictionCount: -5,
            awaitingApproval: false,
          },
    );
    expect(ranked[0]).toEqual({ item: "clamped", priorityScore: 196 });
    expect(ranked[1]).toEqual({ item: "normal", priorityScore: 0 });
  });
});
