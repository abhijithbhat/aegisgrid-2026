import type { AIRecommendation, EventPhase, IncidentType } from "../../src/types";
import { assessRisk, severityForRiskScore } from "../../src/lib/risk";
import {
  buildStadiumGraph,
  calculateResponderRoutes,
  RouteNotFoundError,
} from "../../src/lib/routing";
import { STADIUM_ZONES, ZONE_EDGES } from "../../data/seed/stadium";
import type { Incident, Zone } from "./aegisData";

export const EVENT_PHASE_LABELS = [
  "Pre-entry",
  "Ingress",
  "Live match",
  "Halftime",
  "Egress",
] as const;

const EVENT_PHASE_BY_LABEL: Record<(typeof EVENT_PHASE_LABELS)[number], EventPhase> = {
  "Pre-entry": "pre-entry",
  Ingress: "ingress",
  "Live match": "live-match",
  Halftime: "halftime",
  Egress: "egress",
};

export const UI_ZONE_BY_CANONICAL: Readonly<Record<string, string>> = Object.freeze({
  "W-CONC": "west-concourse",
  "N-CONC": "north-stands",
  "E-CONC": "east-concourse",
  "S-CONC": "south-stands",
  "ACCESS-CORR": "accessible-corridor",
  TRANSIT: "transit-plaza",
});

const DOMAIN_ZONE_BY_UI: Readonly<Record<string, string>> = Object.freeze({
  "west-concourse": "concourse-west",
  "north-stands": "concourse-north",
  "east-concourse": "concourse-east",
  "south-stands": "concourse-south",
  "accessible-corridor": "accessible-corridor",
  "transit-plaza": "transit-plaza",
});

const TEAM_START_ZONE: Readonly<Record<string, string>> = Object.freeze({
  "Medical Alpha": "medical-room",
  "Medical Bravo": "medical-room",
  "Fire Safety 1": "service-tunnel",
  "Security Delta": "security-control",
  "Accessibility Rover": "gate-south",
  "Crowd Team North": "security-control",
  "Facilities 2": "service-tunnel",
});

export const AUDIT_ACTION_BY_LABEL: Readonly<Record<string, string>> = Object.freeze({
  "Response plan approved": "recommendation-approved",
  "Response plan modified": "recommendation-modified",
  "Recommendation dismissed": "recommendation-dismissed",
  "Response team assigned": "team-assigned",
  "Response step completed": "step-completed",
  "Source report dismissed": "report-dismissed",
  "Supervisor note added": "note-added",
  "Incident resolved": "incident-resolved",
});

export const AUDIT_LABEL_BY_ACTION: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(AUDIT_ACTION_BY_LABEL).map(([label, action]) => [action, label]),
  ),
);

export const TEAM_BY_TYPE: Readonly<
  Record<AIRecommendation["recommendedTeamType"], string>
> = Object.freeze({
  medical: "Medical Alpha",
  security: "Security Delta",
  fire: "Fire Safety 1",
  accessibility: "Accessibility Rover",
  maintenance: "Facilities 2",
  crowd_control: "Crowd Team North",
});

const STADIUM_GRAPH = buildStadiumGraph(STADIUM_ZONES, ZONE_EDGES);
const ZONE_NAME = new Map(STADIUM_ZONES.map((zone) => [zone.id, zone.shortName]));
const RISK_LABEL: Readonly<Record<string, string>> = Object.freeze({
  occupancyPressure: "Occupancy pressure",
  inflowPressure: "Inflow pressure",
  queuePressure: "Queue pressure",
  hazardSeverity: "Hazard severity",
  independentEvidence: "Independent evidence",
  sensorUncertainty: "Sensor uncertainty",
  eventPhase: "Event phase",
  routeBlockage: "Route blockage",
  vulnerability: "Vulnerability",
});

export function domainIncidentType(label: string): IncidentType {
  const normalized = label.toLowerCase();
  if (normalized.includes("medical")) return "medical";
  if (normalized.includes("fire")) return "fire";
  if (normalized.includes("crowd")) return "crowd";
  if (normalized.includes("security")) return "security";
  if (normalized.includes("infrastructure")) return "infrastructure";
  if (normalized.includes("access")) return "accessibility";
  if (normalized.includes("lost")) return "lost_person";
  return "other";
}

export function domainPhase(label: string): EventPhase {
  return EVENT_PHASE_BY_LABEL[label as keyof typeof EVENT_PHASE_BY_LABEL] ?? "live-match";
}

export const numericSeverity = severityForRiskScore;

export function withLiveRecommendation(
  incident: Incident,
  recommendation?: AIRecommendation,
): Incident {
  if (!recommendation) return incident;
  const numeric = numericSeverity(incident.risk);
  const disagrees = numeric !== recommendation.severity;
  return {
    ...incident,
    aiSeverity: recommendation.severity[0].toUpperCase() + recommendation.severity.slice(1),
    confidence: Math.round(recommendation.confidence * 100),
    summary: recommendation.summary,
    rationale: disagrees
      ? `Numeric risk is ${numeric} at ${incident.risk}. AI severity is ${recommendation.severity} because it interprets the cited unstructured evidence: ${recommendation.summary}`
      : `Numeric and AI severity both classify this incident as ${numeric}. ${recommendation.summary}`,
    evidence: recommendation.evidence.map((item) => ({
      source: item.sourceId,
      fact: item.fact,
      weight: item.weight.toFixed(2),
      kind:
        incident.evidence.find((source) => source.source === item.sourceId)?.kind ??
        "Validated source",
    })),
    contradictions: recommendation.contradictions.length,
    contradictoryEvidence: recommendation.contradictions.map((item) => ({
      sources: item.sourceIds.join(" · "),
      description: item.description,
      impact: item.operationalImpact,
    })),
    missing: recommendation.missingInformation,
    questions: recommendation.clarifyingQuestions,
    team: TEAM_BY_TYPE[recommendation.recommendedTeamType],
    equipment: recommendation.equipment,
    actions: recommendation.recommendedActions.map((action) => ({
      text: action.action,
      owner: action.ownerRole,
      target: action.targetMinutes === 0 ? "Now" : `${action.targetMinutes} min`,
      approval: action.requiresApproval,
    })),
    announcement: recommendation.announcement,
    uncertainty: recommendation.uncertaintyNote,
  };
}

export function withDeterministicRisk(
  incident: Incident,
  zones: readonly Zone[],
  phase: string,
): Incident {
  const zone = zones.find((item) => item.id === incident.zoneId);
  const explicitlyBlocked = zone ? /blocked|unavailable|fails|failure/i.test(zone.detail) : false;
  const reliability = incident.evidence.length
    ? incident.evidence.reduce(
        (sum, evidence) => sum + (Number(evidence.weight) || 0),
        0,
      ) / incident.evidence.length
    : 0;
  const assessment = assessRisk({
    telemetry: zone
      ? {
          occupancy: Math.round((zone.capacity * zone.occupancy) / 100),
          capacity: zone.capacity,
          inflowPerMinute: Math.max(0, zone.flow),
          outflowPerMinute: Math.max(0, -zone.flow),
          sensorHealth: zone.state === "degraded" ? "degraded" : "healthy",
          blocked: explicitlyBlocked,
          eventPhase: domainPhase(phase),
        }
      : undefined,
    eventPhase: domainPhase(phase),
    hazardSeverity: incident.riskInputs.hazardSeverity,
    independentSourceCount: incident.evidence.length,
    meanSourceReliability: reliability,
    sensorHealth: zone?.state === "degraded" ? "degraded" : "healthy",
    blockedRoute: explicitlyBlocked,
    vulnerablePerson: incident.riskInputs.vulnerablePerson,
  });
  return {
    ...incident,
    risk: assessment.score,
    code: `RISK · ${assessment.score}`,
    riskFormula: assessment.formula,
    riskContributions: assessment.contributions.map((item) => ({
      label: RISK_LABEL[item.component] ?? item.component,
      normalized: item.normalizedValue,
      contribution: item.contribution,
    })),
  };
}

function formatRouteDuration(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}m ${Math.round(totalSeconds % 60)}s`;
}

export function withDeterministicRoute(
  incident: Incident,
  zones: readonly Zone[],
): Incident {
  const fromZoneId = TEAM_START_ZONE[incident.team];
  const toZoneId = DOMAIN_ZONE_BY_UI[incident.zoneId];
  if (!fromZoneId || !toZoneId) return incident;

  const zoneCongestion = Object.fromEntries(
    zones.flatMap((zone) => {
      const domainId = DOMAIN_ZONE_BY_UI[zone.id];
      return domainId ? [[domainId, zone.occupancy / 100]] : [];
    }),
  );
  const blockedZoneIds = zones.flatMap((zone) => {
    const domainId = DOMAIN_ZONE_BY_UI[zone.id];
    const explicitlyBlocked = /blocked|unavailable|fails|failure/i.test(zone.detail);
    return domainId && explicitlyBlocked ? [domainId] : [];
  });

  try {
    const route = calculateResponderRoutes(STADIUM_GRAPH, {
      fromZoneId,
      toZoneId,
      algorithm: "a-star",
      accessibilityRequired:
        incident.team.startsWith("Medical") || incident.team.startsWith("Accessibility"),
      zoneCongestion,
      zoneHazards: { [toZoneId]: incident.risk },
      blockedZoneIds,
    });
    const namePath = (path: readonly string[]) =>
      path.map((zoneId) => ZONE_NAME.get(zoneId) ?? zoneId);
    return {
      ...incident,
      eta: formatRouteDuration(route.primary.travelSeconds),
      route: {
        from: ZONE_NAME.get(fromZoneId) ?? fromZoneId,
        path: namePath(route.primary.zoneIds),
        alternate: route.alternate ? namePath(route.alternate.zoneIds) : [],
        eta: formatRouteDuration(route.primary.travelSeconds),
        alternateEta: route.alternate
          ? formatRouteDuration(route.alternate.travelSeconds)
          : "Unavailable",
        avoided: namePath(route.avoidedZoneIds),
        saved: `${route.timeSavedSeconds}s`,
        rationale: route.rationale.join(" "),
      },
    };
  } catch (error) {
    if (!(error instanceof RouteNotFoundError)) throw error;
    return {
      ...incident,
      eta: "No route",
      route: {
        ...incident.route,
        eta: "No safe route",
        alternateEta: "Unavailable",
        path: [],
        alternate: [],
        rationale:
          "No route satisfies the current deterministic closures and accessibility constraints.",
      },
    };
  }
}

export function nowTime(): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function etaSeconds(value: string): number | undefined {
  const match = value.match(/(?:(\d+)m)?\s*(?:(\d+)s)?/i);
  if (!match || (!match[1] && !match[2])) return undefined;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

export function formatEta(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

export function auditStatus(value: string): string {
  const normalized: Readonly<Record<string, string>> = {
    "Awaiting approval": "awaiting-approval",
    "Plan approved": "approved",
    Monitoring: "monitoring",
    Resolved: "resolved",
    Dismissed: "dismissed",
    "—": "unchanged",
  };
  return normalized[value] ?? "unchanged";
}
