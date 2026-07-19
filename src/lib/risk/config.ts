import type { EventPhase, Severity } from "../../types";

export const RISK_ENGINE_VERSION = "aegis-risk-1.0.0";

export type RiskComponentName =
  | "occupancyPressure"
  | "inflowPressure"
  | "queuePressure"
  | "hazardSeverity"
  | "independentEvidence"
  | "sensorUncertainty"
  | "eventPhase"
  | "routeBlockage"
  | "vulnerability";

export type RiskWeights = Record<RiskComponentName, number>;

export interface RiskThresholds {
  occupancyBaselineRatio: number;
  occupancyCriticalRatio: number;
  netInflowCriticalPerMinute: number;
  queueCriticalMinutes: number;
  evidenceSaturationSources: number;
  severity: Record<Exclude<Severity, "critical">, number>;
}

export interface RiskEngineConfig {
  version: string;
  weights: RiskWeights;
  thresholds: RiskThresholds;
  phasePressure: Record<EventPhase, number>;
  sensorPenalty: Record<"healthy" | "degraded" | "offline", number>;
}

/**
 * Formula: round(sum(component[0..100] * weight)), clamped to 0..100.
 * Weights intentionally add to 1.0 so each contribution is auditable in
 * percentage points and no hidden multiplier changes the result.
 */
export const DEFAULT_RISK_CONFIG: Readonly<RiskEngineConfig> = Object.freeze({
  version: RISK_ENGINE_VERSION,
  weights: Object.freeze({
    occupancyPressure: 0.25,
    inflowPressure: 0.12,
    queuePressure: 0.08,
    hazardSeverity: 0.2,
    independentEvidence: 0.1,
    sensorUncertainty: 0.08,
    eventPhase: 0.07,
    routeBlockage: 0.05,
    vulnerability: 0.05,
  }),
  thresholds: Object.freeze({
    occupancyBaselineRatio: 0.5,
    occupancyCriticalRatio: 1,
    netInflowCriticalPerMinute: 45,
    queueCriticalMinutes: 20,
    evidenceSaturationSources: 4,
    severity: Object.freeze({ low: 30, moderate: 55, high: 75 }),
  }),
  phasePressure: Object.freeze({
    "pre-entry": 30,
    ingress: 85,
    "live-match": 45,
    halftime: 72,
    egress: 95,
  }),
  sensorPenalty: Object.freeze({ healthy: 0, degraded: 65, offline: 100 }),
});

const WEIGHT_EPSILON = 1e-9;

export function assertValidRiskConfig(config: RiskEngineConfig): void {
  const weightEntries = Object.entries(config.weights) as Array<[RiskComponentName, number]>;
  const invalidWeight = weightEntries.find(
    ([, weight]) => !Number.isFinite(weight) || weight < 0 || weight > 1,
  );

  if (invalidWeight) {
    throw new RangeError(`Risk weight ${invalidWeight[0]} must be between 0 and 1.`);
  }

  const sum = weightEntries.reduce((total, [, weight]) => total + weight, 0);
  if (Math.abs(sum - 1) > WEIGHT_EPSILON) {
    throw new RangeError(`Risk weights must total 1.0; received ${sum}.`);
  }

  const { thresholds } = config;
  if (
    thresholds.occupancyBaselineRatio < 0 ||
    thresholds.occupancyCriticalRatio <= thresholds.occupancyBaselineRatio ||
    thresholds.netInflowCriticalPerMinute <= 0 ||
    thresholds.queueCriticalMinutes <= 0 ||
    thresholds.evidenceSaturationSources < 1
  ) {
    throw new RangeError("Risk normalization thresholds are invalid.");
  }

  const { low, moderate, high } = thresholds.severity;
  if (!(low > 0 && low < moderate && moderate < high && high <= 100)) {
    throw new RangeError("Risk severity thresholds must be strictly increasing within 0..100.");
  }
}
