import { describe, expect, it } from "vitest";
import type { AIRecommendation } from "../../src/types";
import { INITIAL_INCIDENTS, INITIAL_ZONES } from "../../app/components/aegisData";
import {
  domainIncidentType,
  domainPhase,
  numericSeverity,
  withDeterministicRisk,
  withDeterministicRoute,
  withLiveRecommendation,
} from "../../app/components/operational-model";

const recommendation: AIRecommendation = {
  summary: "A cited medical report requires supervisor review.",
  incidentType: "medical",
  severity: "high",
  confidence: 0.91,
  evidence: [
    {
      sourceId: INITIAL_INCIDENTS[0].evidence[0].source,
      fact: INITIAL_INCIDENTS[0].evidence[0].fact,
      weight: 0.95,
    },
  ],
  contradictions: [],
  missingInformation: ["Breathing status is unconfirmed."],
  clarifyingQuestions: ["Is the guest breathing?"],
  recommendedActions: [
    {
      priority: 1,
      action: "Confirm breathing status.",
      ownerRole: "Medical Alpha",
      targetMinutes: 1,
      justification: "This is required for safe triage.",
      requiresApproval: true,
    },
  ],
  recommendedTeamType: "medical",
  equipment: ["AED"],
  announcement: {
    language: "English",
    tone: "calm",
    text: "Please keep west stair W-3 clear.",
  },
  uncertaintyNote: "The report does not confirm a diagnosis.",
  requiresHumanApproval: true,
};

describe("operator view-model adapters", () => {
  it("uses one canonical event-phase and severity mapping", () => {
    expect(domainPhase("Pre-entry")).toBe("pre-entry");
    expect(domainPhase("Egress")).toBe("egress");
    expect(domainPhase("unsupported phase")).toBe("live-match");
    expect(numericSeverity(29)).toBe("low");
    expect(numericSeverity(30)).toBe("moderate");
    expect(numericSeverity(55)).toBe("high");
    expect(numericSeverity(75)).toBe("critical");
  });

  it("normalizes presentation incident types without stringly typed fall-through", () => {
    expect(domainIncidentType("Fire / environmental")).toBe("fire");
    expect(domainIncidentType("Accessible route")).toBe("accessibility");
    expect(domainIncidentType("Unknown fixture")).toBe("other");
  });

  it("exposes all deterministic risk contributions to the operator", () => {
    const assessed = withDeterministicRisk(INITIAL_INCIDENTS[0], INITIAL_ZONES, "Live match");
    expect(assessed.risk).toBeGreaterThanOrEqual(0);
    expect(assessed.risk).toBeLessThanOrEqual(100);
    expect(assessed.riskContributions).toHaveLength(9);
    expect(assessed.riskFormula).toContain("configured weight");
  });

  it("keeps validated AI semantics separate from deterministic routing", () => {
    const interpreted = withLiveRecommendation(INITIAL_INCIDENTS[0], recommendation);
    const routed = withDeterministicRoute(interpreted, INITIAL_ZONES);

    expect(interpreted.evidence.map((item) => item.source)).toEqual([
      recommendation.evidence[0].sourceId,
    ]);
    expect(interpreted.team).toBe("Medical Alpha");
    expect(routed.route.path.length).toBeGreaterThan(1);
    expect(routed.route.rationale).toContain("deterministic");
    expect(recommendation.requiresHumanApproval).toBe(true);
  });
});
