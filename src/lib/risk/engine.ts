import type {
  EventPhase,
  FusedIncident,
  SensorHealth,
  Severity,
  TelemetryReading,
} from "../../types";
import {
  assertValidRiskConfig,
  DEFAULT_RISK_CONFIG,
  type RiskComponentName,
  type RiskEngineConfig,
} from "./config";

export interface RiskAssessmentInput {
  telemetry?: Pick<
    TelemetryReading,
    | "occupancy"
    | "capacity"
    | "inflowPerMinute"
    | "outflowPerMinute"
    | "queueMinutes"
    | "sensorHealth"
    | "blocked"
    | "eventPhase"
  >;
  eventPhase?: EventPhase;
  hazardSeverity: number;
  independentSourceCount: number;
  meanSourceReliability: number;
  sensorHealth?: SensorHealth;
  blockedRoute: boolean;
  vulnerablePerson: boolean;
}

export interface RiskContribution {
  component: RiskComponentName;
  normalizedValue: number;
  weight: number;
  contribution: number;
  explanation: string;
}

export interface RiskAssessment {
  score: number;
  severity: Severity;
  components: Record<RiskComponentName, number>;
  contributions: RiskContribution[];
  formula: string;
  configVersion: string;
}

export interface SeverityDisagreement {
  disagrees: boolean;
  numericSeverity: Severity;
  aiSeverity: Severity;
  explanation: string;
}

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));

const safeFinite = (value: number | undefined, fallback = 0): number =>
  value !== undefined && Number.isFinite(value) ? value : fallback;

function occupancyPressure(input: RiskAssessmentInput, config: RiskEngineConfig): number {
  const occupancy = input.telemetry?.occupancy;
  const capacity = input.telemetry?.capacity;
  if (occupancy === undefined || capacity === undefined || capacity <= 0) return 0;

  const ratio = Math.max(0, occupancy) / capacity;
  const { occupancyBaselineRatio: baseline, occupancyCriticalRatio: critical } = config.thresholds;
  return clamp(((ratio - baseline) / (critical - baseline)) * 100);
}

function inflowPressure(input: RiskAssessmentInput, config: RiskEngineConfig): number {
  const inflow = safeFinite(input.telemetry?.inflowPerMinute);
  const outflow = safeFinite(input.telemetry?.outflowPerMinute);
  const netInflow = Math.max(0, inflow - outflow);
  return clamp((netInflow / config.thresholds.netInflowCriticalPerMinute) * 100);
}

function queuePressure(input: RiskAssessmentInput, config: RiskEngineConfig): number {
  const queue = Math.max(0, safeFinite(input.telemetry?.queueMinutes));
  return clamp((queue / config.thresholds.queueCriticalMinutes) * 100);
}

function evidencePressure(input: RiskAssessmentInput, config: RiskEngineConfig): number {
  const sourceCount = Math.max(0, Math.floor(input.independentSourceCount));
  const countScore = clamp((sourceCount / config.thresholds.evidenceSaturationSources) * 100);
  const reliabilityScore = clamp(input.meanSourceReliability * 100);

  // Independent corroboration is the primary signal; source reliability
  // tempers it so four low-quality duplicates cannot score as strong evidence.
  return clamp(countScore * 0.7 + reliabilityScore * 0.3);
}

/** Maps a deterministic numeric risk score to the configured severity band. */
export function severityForRiskScore(
  score: number,
  config: RiskEngineConfig = DEFAULT_RISK_CONFIG,
): Severity {
  if (score < config.thresholds.severity.low) return "low";
  if (score < config.thresholds.severity.moderate) return "moderate";
  if (score < config.thresholds.severity.high) return "high";
  return "critical";
}

const COMPONENT_EXPLANATIONS: Record<RiskComponentName, string> = {
  occupancyPressure: "Zone occupancy relative to its safe capacity.",
  inflowPressure: "Positive net arrivals relative to the critical flow threshold.",
  queuePressure: "Observed queue duration relative to the critical queue threshold.",
  hazardSeverity: "Operational hazard intensity supplied by deterministic incident rules.",
  independentEvidence: "Independent-source count tempered by mean source reliability.",
  sensorUncertainty: "Penalty for degraded or offline sensing.",
  eventPhase: "Known crowd-movement pressure for the current event phase.",
  routeBlockage: "Penalty when a responder or evacuation route is blocked.",
  vulnerability: "Immediate safety uplift for a reported vulnerable person.",
};

export function assessRisk(
  input: RiskAssessmentInput,
  config: RiskEngineConfig = DEFAULT_RISK_CONFIG,
): RiskAssessment {
  assertValidRiskConfig(config);

  const phase = input.eventPhase ?? input.telemetry?.eventPhase ?? "live-match";
  const health = input.sensorHealth ?? input.telemetry?.sensorHealth ?? "healthy";
  const components: Record<RiskComponentName, number> = {
    occupancyPressure: occupancyPressure(input, config),
    inflowPressure: inflowPressure(input, config),
    queuePressure: queuePressure(input, config),
    hazardSeverity: clamp(input.hazardSeverity),
    independentEvidence: evidencePressure(input, config),
    sensorUncertainty: config.sensorPenalty[health],
    eventPhase: config.phasePressure[phase],
    routeBlockage: input.blockedRoute || input.telemetry?.blocked === true ? 100 : 0,
    vulnerability: input.vulnerablePerson ? 100 : 0,
  };

  const contributions = (Object.keys(components) as RiskComponentName[]).map(
    (component): RiskContribution => ({
      component,
      normalizedValue: Math.round(components[component] * 10) / 10,
      weight: config.weights[component],
      contribution: Math.round(components[component] * config.weights[component] * 10) / 10,
      explanation: COMPONENT_EXPLANATIONS[component],
    }),
  );
  const unroundedScore = contributions.reduce(
    (total, contribution) => total + contribution.normalizedValue * contribution.weight,
    0,
  );
  const score = Math.round(clamp(unroundedScore));

  return {
    score,
    severity: severityForRiskScore(score, config),
    components,
    contributions,
    formula: "risk = Σ(normalized component × configured weight), clamped to 0–100",
    configVersion: config.version,
  };
}

export function assessIncidentRisk(
  incident: Pick<FusedIncident, "severity" | "sourceIds" | "evidence" | "vulnerablePerson">,
  telemetry?: RiskAssessmentInput["telemetry"],
  config: RiskEngineConfig = DEFAULT_RISK_CONFIG,
): RiskAssessment {
  const hazardBySeverity: Record<Severity, number> = {
    low: 20,
    moderate: 50,
    high: 78,
    critical: 100,
  };
  const reliability = incident.evidence.length
    ? incident.evidence.reduce((sum, evidence) => sum + evidence.weight, 0) /
      incident.evidence.length
    : 0;

  return assessRisk(
    {
      telemetry,
      hazardSeverity: hazardBySeverity[incident.severity],
      independentSourceCount: new Set(incident.sourceIds).size,
      meanSourceReliability: reliability,
      blockedRoute: telemetry?.blocked ?? false,
      vulnerablePerson: incident.vulnerablePerson,
    },
    config,
  );
}

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

export function explainSeverityDisagreement(
  numeric: Pick<RiskAssessment, "score" | "severity">,
  aiSeverity: Severity,
  aiSummary?: string,
): SeverityDisagreement {
  const disagrees = numeric.severity !== aiSeverity;
  const direction =
    SEVERITY_RANK[aiSeverity] > SEVERITY_RANK[numeric.severity]
      ? "higher"
      : SEVERITY_RANK[aiSeverity] < SEVERITY_RANK[numeric.severity]
        ? "lower"
        : "the same";

  return {
    disagrees,
    numericSeverity: numeric.severity,
    aiSeverity,
    explanation: disagrees
      ? `Numeric risk is ${numeric.severity} at ${numeric.score}. AI severity is ${aiSeverity} (${direction}) because it interprets unstructured evidence${aiSummary ? `: ${aiSummary}` : "."}`
      : `Numeric and AI severity both classify this incident as ${numeric.severity}.`,
  };
}
