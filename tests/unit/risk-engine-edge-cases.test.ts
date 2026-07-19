import { describe, expect, it } from "vitest";
import {
  DEFAULT_RISK_CONFIG,
  assessIncidentRisk,
  assessRisk,
  assertValidRiskConfig,
  explainSeverityDisagreement,
  severityForRiskScore,
  type RiskEngineConfig,
} from "../../src/lib/risk";

function mutableConfig(): RiskEngineConfig {
  return {
    version: DEFAULT_RISK_CONFIG.version,
    weights: { ...DEFAULT_RISK_CONFIG.weights },
    thresholds: {
      ...DEFAULT_RISK_CONFIG.thresholds,
      severity: { ...DEFAULT_RISK_CONFIG.thresholds.severity },
    },
    phasePressure: { ...DEFAULT_RISK_CONFIG.phasePressure },
    sensorPenalty: { ...DEFAULT_RISK_CONFIG.sensorPenalty },
  };
}

describe("risk engine boundaries and malformed telemetry", () => {
  it.each([
    [0, "low"],
    [29, "low"],
    [30, "moderate"],
    [54, "moderate"],
    [55, "high"],
    [74, "high"],
    [75, "critical"],
    [100, "critical"],
  ] as const)("maps score %i to %s at exact configured boundaries", (score, expected) => {
    expect(severityForRiskScore(score)).toBe(expected);
  });

  it("clamps negative and non-finite inputs into a finite auditable result", () => {
    const assessment = assessRisk({
      telemetry: {
        occupancy: -10,
        capacity: 0,
        inflowPerMinute: Number.NaN,
        outflowPerMinute: Number.POSITIVE_INFINITY,
        queueMinutes: -20,
        sensorHealth: "healthy",
        blocked: false,
        eventPhase: "pre-entry",
      },
      hazardSeverity: -40,
      independentSourceCount: -2,
      meanSourceReliability: Number.NaN,
      blockedRoute: false,
      vulnerablePerson: false,
    });

    expect(assessment.components).toMatchObject({
      occupancyPressure: 0,
      inflowPressure: 0,
      queuePressure: 0,
      hazardSeverity: 0,
      independentEvidence: 0,
      routeBlockage: 0,
      vulnerability: 0,
    });
    expect(Number.isFinite(assessment.score)).toBe(true);
    expect(assessment.contributions.every((item) => Number.isFinite(item.contribution))).toBe(true);
  });

  it("uses telemetry phase and health defaults while clamping saturated pressure", () => {
    const assessment = assessRisk({
      telemetry: {
        occupancy: 2_000,
        capacity: 1_000,
        inflowPerMinute: 500,
        outflowPerMinute: 0,
        queueMinutes: 200,
        sensorHealth: "offline",
        blocked: true,
        eventPhase: "egress",
      },
      hazardSeverity: 500,
      independentSourceCount: 20,
      meanSourceReliability: 2,
      blockedRoute: false,
      vulnerablePerson: true,
    });

    expect(Object.values(assessment.components).every((value) => value >= 0 && value <= 100)).toBe(
      true,
    );
    expect(assessment.components).toMatchObject({
      occupancyPressure: 100,
      inflowPressure: 100,
      queuePressure: 100,
      hazardSeverity: 100,
      sensorUncertainty: 100,
      eventPhase: 95,
      routeBlockage: 100,
      vulnerability: 100,
    });
  });
});

describe("fused incident assessment and explainability", () => {
  it("deduplicates source identities and averages evidence reliability", () => {
    const assessment = assessIncidentRisk({
      severity: "high",
      sourceIds: ["CAM-1", "CAM-1", "STAFF-2"],
      evidence: [
        { sourceId: "CAM-1", fact: "Density crossed threshold.", weight: 0.8 },
        { sourceId: "STAFF-2", fact: "Movement slowed at the gate.", weight: 0.6 },
      ],
      vulnerablePerson: false,
    });

    expect(assessment.components.hazardSeverity).toBe(78);
    expect(assessment.components.independentEvidence).toBeGreaterThan(0);
    expect(assessment.formula).toContain("configured weight");
  });

  it("handles an incident without evidence and propagates blocked telemetry", () => {
    const assessment = assessIncidentRisk(
      {
        severity: "low",
        sourceIds: [],
        evidence: [],
        vulnerablePerson: true,
      },
      {
        occupancy: 50,
        capacity: 100,
        inflowPerMinute: 0,
        outflowPerMinute: 0,
        queueMinutes: 0,
        sensorHealth: "healthy",
        blocked: true,
        eventPhase: "live-match",
      },
    );
    expect(assessment.components.independentEvidence).toBe(0);
    expect(assessment.components.routeBlockage).toBe(100);
    expect(assessment.components.vulnerability).toBe(100);
  });

  it("states higher, lower, and matching AI severity without hiding disagreement", () => {
    expect(
      explainSeverityDisagreement({ score: 42, severity: "moderate" }, "critical", "Visible fire")
        .explanation,
    ).toContain("(higher)");
    expect(
      explainSeverityDisagreement({ score: 80, severity: "critical" }, "low").explanation,
    ).toContain("(lower)");
    const same = explainSeverityDisagreement({ score: 60, severity: "high" }, "high");
    expect(same).toMatchObject({ disagrees: false, numericSeverity: "high", aiSeverity: "high" });
    expect(same.explanation).toContain("both classify");
  });
});

describe("risk configuration validation", () => {
  it("rejects non-finite, negative, and over-one component weights", () => {
    for (const invalid of [Number.NaN, -0.01, 1.01]) {
      const config = mutableConfig();
      config.weights.occupancyPressure = invalid;
      expect(() => assertValidRiskConfig(config)).toThrow(/must be between 0 and 1/);
    }
  });

  it("rejects weights that do not sum to one", () => {
    const config = mutableConfig();
    config.weights.occupancyPressure = 0.2;
    expect(() => assertValidRiskConfig(config)).toThrow(/must total 1\.0/);
  });

  it.each([
    [
      "occupancy baseline",
      (config: RiskEngineConfig) => (config.thresholds.occupancyBaselineRatio = -1),
    ],
    [
      "occupancy ordering",
      (config: RiskEngineConfig) => (config.thresholds.occupancyCriticalRatio = 0.4),
    ],
    [
      "net inflow",
      (config: RiskEngineConfig) => (config.thresholds.netInflowCriticalPerMinute = 0),
    ],
    ["queue duration", (config: RiskEngineConfig) => (config.thresholds.queueCriticalMinutes = 0)],
    [
      "source saturation",
      (config: RiskEngineConfig) => (config.thresholds.evidenceSaturationSources = 0),
    ],
  ])("rejects invalid %s normalization", (_label, mutate) => {
    const config = mutableConfig();
    mutate(config);
    expect(() => assertValidRiskConfig(config)).toThrow(
      "Risk normalization thresholds are invalid.",
    );
  });

  it("rejects unordered or out-of-range severity thresholds", () => {
    const config = mutableConfig();
    config.thresholds.severity = { low: 0, moderate: 55, high: 75 };
    expect(() => assertValidRiskConfig(config)).toThrow(/strictly increasing/);
  });
});
