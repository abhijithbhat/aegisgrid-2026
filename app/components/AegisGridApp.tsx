"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AIRecommendation, IncidentType, Severity } from "../../src/types";
import { assessRisk } from "../../src/lib/risk";
import { rankOperationalItems } from "../../src/lib/incidents";
import { buildStadiumGraph, calculateResponderRoutes, RouteNotFoundError } from "../../src/lib/routing";
import { STADIUM_ZONES, ZONE_EDGES } from "../../data/seed/stadium";
import { AuditView } from "./AuditView";
import { DataLab, type NormalizedImportRow } from "./DataLab";
import { Icon, type IconName } from "./Icon";
import { IncidentDetail } from "./IncidentDetail";
import { IncidentQueue } from "./IncidentQueue";
import { ScenarioSimulator } from "./ScenarioSimulator";
import { StadiumMap } from "./StadiumMap";
import { INITIAL_AUDIT, INITIAL_INCIDENTS, INITIAL_ZONES, type AuditEvent, type Incident, type Zone } from "./aegisData";

type View = "command" | "data" | "simulator" | "audit";
type AiState = "checking" | "available" | "unavailable";
type AuditPersistence = "checking" | "firestore" | "memory" | "error";
type IncidentAnalysisState =
  | { status: "loading" }
  | { status: "available"; recommendation: AIRecommendation }
  | { status: "unavailable"; reason: string };

const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: "command", label: "Command", icon: "grid" },
  { id: "data", label: "Data Lab", icon: "database" },
  { id: "simulator", label: "Simulator", icon: "play" },
  { id: "audit", label: "Audit", icon: "audit" },
];

const PHASES = ["Pre-entry", "Ingress", "Live match", "Halftime", "Egress"];
const UI_ZONE_BY_CANONICAL: Record<string, string> = {
  "W-CONC": "west-concourse",
  "N-CONC": "north-stands",
  "E-CONC": "east-concourse",
  "S-CONC": "south-stands",
  "ACCESS-CORR": "accessible-corridor",
  TRANSIT: "transit-plaza",
};
const DOMAIN_ZONE_BY_UI: Record<string, string> = {
  "west-concourse": "concourse-west",
  "north-stands": "concourse-north",
  "east-concourse": "concourse-east",
  "south-stands": "concourse-south",
  "accessible-corridor": "accessible-corridor",
  "transit-plaza": "transit-plaza",
};
const TEAM_START_ZONE: Record<string, string> = {
  "Medical Alpha": "medical-room",
  "Medical Bravo": "medical-room",
  "Fire Safety 1": "service-tunnel",
  "Security Delta": "security-control",
  "Accessibility Rover": "gate-south",
  "Crowd Team North": "security-control",
  "Facilities 2": "service-tunnel",
};
const STADIUM_GRAPH = buildStadiumGraph(STADIUM_ZONES, ZONE_EDGES);
const ZONE_NAME = new Map(STADIUM_ZONES.map((zone) => [zone.id, zone.shortName]));

const AUDIT_ACTION_BY_LABEL: Record<string, string> = {
  "Response plan approved": "recommendation-approved",
  "Response plan modified": "recommendation-modified",
  "Recommendation dismissed": "recommendation-dismissed",
  "Response team assigned": "team-assigned",
  "Response step completed": "step-completed",
  "Source report dismissed": "report-dismissed",
  "Supervisor note added": "note-added",
  "Incident resolved": "incident-resolved",
};

const TEAM_BY_TYPE: Record<AIRecommendation["recommendedTeamType"], string> = {
  medical: "Medical Alpha",
  security: "Security Delta",
  fire: "Fire Safety 1",
  accessibility: "Accessibility Rover",
  maintenance: "Facilities 2",
  crowd_control: "Crowd Team North",
};

function domainIncidentType(label: string): IncidentType {
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

function domainPhase(label: string) {
  return label.toLowerCase().replace(" ", "-") as "pre-entry" | "ingress" | "live-match" | "halftime" | "egress";
}

function numericSeverity(score: number): Severity {
  if (score < 30) return "low";
  if (score < 55) return "moderate";
  if (score < 75) return "high";
  return "critical";
}

function withLiveRecommendation(incident: Incident, recommendation?: AIRecommendation): Incident {
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
      kind: incident.evidence.find((source) => source.source === item.sourceId)?.kind ?? "Validated source",
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

const RISK_LABEL: Record<string, string> = {
  occupancyPressure: "Occupancy pressure",
  inflowPressure: "Inflow pressure",
  queuePressure: "Queue pressure",
  hazardSeverity: "Hazard severity",
  independentEvidence: "Independent evidence",
  sensorUncertainty: "Sensor uncertainty",
  eventPhase: "Event phase",
  routeBlockage: "Route blockage",
  vulnerability: "Vulnerability",
};

function withDeterministicRisk(incident: Incident, zones: readonly Zone[], phase: string): Incident {
  const zone = zones.find((item) => item.id === incident.zoneId);
  const explicitlyBlocked = zone ? /blocked|unavailable|fails|failure/i.test(zone.detail) : false;
  const reliability = incident.evidence.length
    ? incident.evidence.reduce((sum, evidence) => sum + (Number(evidence.weight) || 0), 0) / incident.evidence.length
    : 0;
  const assessment = assessRisk({
    telemetry: zone ? {
      occupancy: Math.round(zone.capacity * zone.occupancy / 100),
      capacity: zone.capacity,
      inflowPerMinute: Math.max(0, zone.flow),
      outflowPerMinute: Math.max(0, -zone.flow),
      sensorHealth: zone.state === "degraded" ? "degraded" : "healthy",
      blocked: explicitlyBlocked,
      eventPhase: domainPhase(phase),
    } : undefined,
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

function withDeterministicRoute(incident: Incident, zones: readonly (typeof INITIAL_ZONES)[number][]): Incident {
  const fromZoneId = TEAM_START_ZONE[incident.team];
  const toZoneId = DOMAIN_ZONE_BY_UI[incident.zoneId];
  if (!fromZoneId || !toZoneId) return incident;
  const zoneCongestion = Object.fromEntries(zones.flatMap((zone) => {
    const domainId = DOMAIN_ZONE_BY_UI[zone.id];
    return domainId ? [[domainId, zone.occupancy / 100]] : [];
  }));
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
      accessibilityRequired: incident.team.startsWith("Medical") || incident.team.startsWith("Accessibility"),
      zoneCongestion,
      zoneHazards: { [toZoneId]: incident.risk },
      blockedZoneIds,
    });
    const namePath = (path: readonly string[]) => path.map((zoneId) => ZONE_NAME.get(zoneId) ?? zoneId);
    return {
      ...incident,
      eta: `${Math.floor(route.primary.travelSeconds / 60)}m ${Math.round(route.primary.travelSeconds % 60)}s`,
      route: {
        from: ZONE_NAME.get(fromZoneId) ?? fromZoneId,
        path: namePath(route.primary.zoneIds),
        alternate: route.alternate ? namePath(route.alternate.zoneIds) : [],
        eta: `${Math.floor(route.primary.travelSeconds / 60)}m ${Math.round(route.primary.travelSeconds % 60)}s`,
        alternateEta: route.alternate ? `${Math.floor(route.alternate.travelSeconds / 60)}m ${Math.round(route.alternate.travelSeconds % 60)}s` : "Unavailable",
        avoided: namePath(route.avoidedZoneIds),
        saved: `${route.timeSavedSeconds}s`,
        rationale: route.rationale.join(" "),
      },
    };
  } catch (error) {
    if (!(error instanceof RouteNotFoundError)) throw error;
    return { ...incident, eta: "No route", route: { ...incident.route, eta: "No safe route", alternateEta: "Unavailable", path: [], alternate: [], rationale: "No route satisfies the current deterministic closures and accessibility constraints." } };
  }
}

function nowTime() {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
}

function etaSeconds(value: string): number | undefined {
  const match = value.match(/(?:(\d+)m)?\s*(?:(\d+)s)?/i);
  if (!match || (!match[1] && !match[2])) return undefined;
  return Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
}

function formatEta(seconds: number | undefined): string {
  if (seconds === undefined) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function auditStatus(value: string): string {
  const normalized: Record<string, string> = {
    "Awaiting approval": "awaiting-approval",
    "Plan approved": "approved",
    Monitoring: "monitoring",
    Resolved: "resolved",
    Dismissed: "dismissed",
    "—": "unchanged",
  };
  return normalized[value] ?? "unchanged";
}

export function AegisGridApp() {
  const [interactiveReady, setInteractiveReady] = useState(false);
  const [view, setView] = useState<View>("command");
  const [clock, setClock] = useState<Date | null>(null);
  const [phase, setPhase] = useState("Live match");
  const [zones, setZones] = useState(INITIAL_ZONES);
  const [incidents, setIncidents] = useState(INITIAL_INCIDENTS);
  const [selectedId, setSelectedId] = useState(INITIAL_INCIDENTS[0].id);
  const [selectedZone, setSelectedZone] = useState(INITIAL_INCIDENTS[0].zoneId);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(INITIAL_AUDIT);
  const [auditPersistence, setAuditPersistence] = useState<AuditPersistence>("checking");
  const [toast, setToast] = useState("");
  const [aiState, setAiState] = useState<AiState>("checking");
  const [analysisByIncident, setAnalysisByIncident] = useState<Record<string, IncidentAnalysisState>>({});
  const requestedAnalysisIds = useRef(new Set<string>());
  const sidebarRef = useRef<HTMLElement>(null);
  const firstNavRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const [simulation, setSimulation] = useState({ running: false, name: "West Gate Surge", event: "Baseline loaded" });
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setInteractiveReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/audit", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("audit unavailable");
        const body = await response.json() as { persistence?: { mode?: "firestore" | "memory" } };
        if (active) setAuditPersistence(body.persistence?.mode ?? "memory");
      })
      .catch(() => { if (active) setAuditPersistence("error"); });
    return () => { active = false; };
  }, []);

  const assessedIncidents = useMemo(() => incidents.map((incident) => withDeterministicRisk(incident, zones, phase)), [incidents, zones, phase]);
  const routedIncidents = useMemo(() => assessedIncidents.map((incident) => withDeterministicRoute(incident, zones)), [assessedIncidents, zones]);
  const selectedIncident = routedIncidents.find((incident) => incident.id === selectedId) ?? routedIncidents[0];

  useEffect(() => {
    const requestedIds = requestedAnalysisIds.current;
    if (aiState !== "available" || requestedIds.has(selectedIncident.id)) return;
    const controller = new AbortController();
    const incidentId = selectedIncident.id;
    requestedIds.add(incidentId);
    const routedIncident = withDeterministicRoute(selectedIncident, zones);
    const sources = selectedIncident.evidence.map((evidence) => ({
      sourceId: evidence.source,
      sourceType: evidence.kind,
      text: evidence.fact,
      reliability: Math.min(1, Math.max(0, Number(evidence.weight))),
    }));
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        setAnalysisByIncident((current) => ({ ...current, [incidentId]: { status: "loading" } }));
      }
      return fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        incidentId: selectedIncident.id,
        title: selectedIncident.title,
        incidentType: domainIncidentType(selectedIncident.type),
        zoneId: selectedIncident.zoneId,
        eventPhase: domainPhase(phase),
        deterministicRisk: {
          score: selectedIncident.risk,
          severity: numericSeverity(selectedIncident.risk),
          explanation: `Configured nine-factor risk assessment for ${selectedIncident.zone}; score ${selectedIncident.risk} of 100.`,
        },
        sources,
        route: {
          primaryZoneIds: routedIncident.route.path.length ? routedIncident.route.path : ["no-safe-route"],
          alternateZoneIds: routedIncident.route.alternate,
          etaMinutes: Math.max(0, Number.parseFloat(routedIncident.route.eta) || 0),
          avoidedZoneIds: routedIncident.route.avoided,
          rationale: routedIncident.route.rationale,
        },
      }),
      });
    })
      .then(async (response) => {
        const body = await response.json() as {
          outcome?: { status: "available"; recommendation: AIRecommendation } | { status: "degraded"; reason?: string; error?: { message?: string } };
          error?: { message?: string };
        };
        const outcome = body.outcome;
        if (!response.ok || !outcome) throw new Error(body.error?.message ?? "Analysis request failed.");
        if (outcome.status === "available") {
          setAnalysisByIncident((current) => ({ ...current, [incidentId]: { status: "available", recommendation: outcome.recommendation } }));
        } else {
          setAnalysisByIncident((current) => ({ ...current, [incidentId]: { status: "unavailable", reason: outcome.error?.message ?? outcome.reason ?? "Provider unavailable" } }));
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAnalysisByIncident((current) => ({ ...current, [incidentId]: { status: "unavailable", reason: error instanceof Error ? error.message : "Analysis request failed." } }));
      });
    return () => {
      controller.abort();
      requestedIds.delete(incidentId);
    };
  }, [aiState, phase, selectedIncident, zones]);

  useEffect(() => {
    let active = true;
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("health unavailable");
        const data = await response.json() as Record<string, unknown>;
        const ai = data.ai as Record<string, unknown> | undefined;
        const services = data.services as Record<string, Record<string, unknown>> | undefined;
        const rawStatus = String(ai?.status ?? services?.ai?.status ?? data.aiStatus ?? "").toLowerCase();
        const available = data.aiAvailable === true || ai?.available === true || ["ok", "ready", "available", "configured", "connected"].includes(rawStatus);
        if (active) setAiState(available ? "available" : "unavailable");
      })
      .catch(() => { if (active) setAiState("unavailable"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!mobileNav) return;
    const sidebar = sidebarRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => firstNavRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNav(false);
        window.requestAnimationFrame(() => mobileMenuRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !sidebar) return;
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNav]);

  const selectedAnalysis = analysisByIncident[selectedIncident.id];
  const displayedIncident = useMemo(
    () => withDeterministicRoute(withLiveRecommendation(selectedIncident, selectedAnalysis?.status === "available" ? selectedAnalysis.recommendation : undefined), zones),
    [selectedIncident, selectedAnalysis, zones],
  );
  const detailAiStatus: "checking" | "loading" | "available" | "unavailable" = aiState === "checking"
    ? "checking"
    : aiState === "unavailable" || selectedAnalysis?.status === "unavailable"
      ? "unavailable"
      : selectedAnalysis?.status === "available"
        ? "available"
        : "loading";

  const activeIncidents = useMemo(() => rankOperationalItems(
    routedIncidents.filter((incident) => !["Resolved", "Dismissed"].includes(incident.status)),
    (incident) => ({
      riskScore: incident.risk,
      severity: numericSeverity(incident.risk),
      confidence: Math.min(1, 0.45 + incident.reports * 0.1),
      contradictionCount: incident.contradictions,
      awaitingApproval: incident.status === "Awaiting approval",
    }),
  ).map((entry) => entry.item), [routedIncidents]);
  const criticalCount = activeIncidents.filter((incident) => numericSeverity(incident.risk) === "critical").length;
  const degradedZones = zones.filter((zone) => zone.state === "degraded");
  const readiness = Math.max(0, 100 - criticalCount * 12 - degradedZones.length * 6 - zones.filter((zone) => zone.state === "watch").length * 2 - activeIncidents.filter((incident) => incident.status === "Awaiting approval").length * 2);
  const totalCapacity = zones.reduce((sum, zone) => sum + zone.capacity, 0);
  const estimatedAttendance = Math.round(zones.reduce((sum, zone) => sum + zone.capacity * zone.occupancy / 100, 0));
  const overallOccupancy = totalCapacity ? Math.round((estimatedAttendance / totalCapacity) * 100) : 0;
  const inboundRate = zones.reduce((sum, zone) => sum + Math.max(0, zone.flow), 0);
  const outboundRate = zones.reduce((sum, zone) => sum + Math.max(0, -zone.flow), 0);
  const responseEtas = activeIncidents.flatMap((incident) => {
    const seconds = etaSeconds(incident.eta);
    return seconds === undefined ? [] : [seconds];
  });
  const averageEta = responseEtas.length ? responseEtas.reduce((sum, seconds) => sum + seconds, 0) / responseEtas.length : undefined;
  const assignedTeams = new Set(activeIncidents.filter((incident) => incident.status === "Monitoring").map((incident) => incident.team)).size;
  const totalTeams = 8;
  const availableTeams = Math.max(0, totalTeams - assignedTeams);
  const topIncident = activeIncidents[0] ?? selectedIncident;
  const recentEvidence = topIncident.evidence[0];
  const maxAbsoluteFlow = Math.max(1, ...zones.map((zone) => Math.abs(zone.flow)));

  const addAudit = useCallback((action: string, note: string, incident = "SYSTEM", previous = "—", next = "—", actor = "Safety Supervisor") => {
    setAuditEvents((current) => [{
      id: Date.now() + Math.random(),
      timestamp: nowTime(),
      actor,
      action,
      incident,
      previous,
      next,
      note,
      version: actor === "Routing Engine" ? "deterministic-route v3.1.0" : "incident-analysis v2.4.1",
    }, ...current]);
    setToast(action);
    const apiAction = AUDIT_ACTION_BY_LABEL[action];
    if (!apiAction || incident === "SYSTEM") return;
    void fetch("/api/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: apiAction,
        incidentId: incident,
        previousStatus: auditStatus(previous),
        newStatus: auditStatus(next),
        note,
        aiRecommendationVersion: "aegis-ai-contract-1.0.0",
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("audit write failed");
        const body = await response.json() as { persistence?: { mode?: "firestore" | "memory" } };
        setAuditPersistence(body.persistence?.mode ?? "memory");
      })
      .catch(() => setAuditPersistence("error"));
  }, []);

  const selectIncident = (incident: Incident) => {
    setSelectedId(incident.id);
    setSelectedZone(incident.zoneId);
  };

  const handleDecision = (action: string, nextStatus: Incident["status"], note: string) => {
    const previous = selectedIncident.status;
    setIncidents((current) => current.map((incident) => incident.id === selectedIncident.id ? { ...incident, status: nextStatus } : incident));
    addAudit(action, note, selectedIncident.id, previous, nextStatus);
  };

  const handleAssignTeam = (team: string) => {
    const previousTeam = selectedIncident.team;
    setIncidents((current) => current.map((incident) => incident.id === selectedIncident.id ? { ...incident, team } : incident));
    addAudit("Response team assigned", `Suggested team changed from ${previousTeam} to ${team}; no dispatch occurred.`, selectedIncident.id, selectedIncident.status, selectedIncident.status);
  };

  const handleModifyPlan = (actions: string[]) => {
    setIncidents((current) => current.map((incident) => incident.id === selectedIncident.id ? {
      ...incident,
      actions: actions.map((text, index) => ({
        text,
        owner: incident.actions[index]?.owner ?? "Safety supervisor",
        target: incident.actions[index]?.target ?? "Review",
        approval: true,
      })),
    } : incident));
    setAnalysisByIncident((current) => {
      const analysis = current[selectedIncident.id];
      if (analysis?.status !== "available") return current;
      return {
        ...current,
        [selectedIncident.id]: {
          status: "available",
          recommendation: {
            ...analysis.recommendation,
            recommendedActions: actions.map((action, index) => ({
              priority: index + 1,
              action,
              ownerRole: analysis.recommendation.recommendedActions[index]?.ownerRole ?? "Safety supervisor",
              targetMinutes: analysis.recommendation.recommendedActions[index]?.targetMinutes ?? 0,
              justification: "Modified by the stadium safety supervisor.",
              requiresApproval: true,
            })),
          },
        },
      };
    });
  };

  const handleDismissReport = (sourceId: string) => {
    setIncidents((current) => current.map((incident) => incident.id === selectedIncident.id ? {
      ...incident,
      reports: Math.max(0, incident.reports - 1),
      evidence: incident.evidence.filter((item) => item.source !== sourceId),
      contradictoryEvidence: incident.contradictoryEvidence.filter((item) => !item.sources.includes(sourceId)),
    } : incident));
    setAnalysisByIncident((current) => {
      const analysis = current[selectedIncident.id];
      if (analysis?.status !== "available") return current;
      return {
        ...current,
        [selectedIncident.id]: {
          status: "available",
          recommendation: {
            ...analysis.recommendation,
            evidence: analysis.recommendation.evidence.filter((item) => item.sourceId !== sourceId),
            contradictions: analysis.recommendation.contradictions.filter((item) => !item.sourceIds.includes(sourceId)),
          },
        },
      };
    });
    addAudit("Source report dismissed", `${sourceId} was marked incorrect after supervisor review; the append-only source record remains preserved.`, selectedIncident.id, selectedIncident.status, selectedIncident.status);
  };

  const handleUpdateAnnouncement = (text: string) => {
    setIncidents((current) => current.map((incident) => incident.id === selectedIncident.id ? { ...incident, announcement: { ...incident.announcement, text } } : incident));
    setAnalysisByIncident((current) => {
      const analysis = current[selectedIncident.id];
      if (analysis?.status !== "available") return current;
      return { ...current, [selectedIncident.id]: { status: "available", recommendation: { ...analysis.recommendation, announcement: { ...analysis.recommendation.announcement, text } } } };
    });
  };

  const handleResolve = (incidentId: string, note: string) => {
    const target = incidents.find((incident) => incident.id === incidentId);
    if (!target) return;
    setIncidents((current) => current.map((incident) => incident.id === incidentId ? { ...incident, status: "Resolved" } : incident));
    addAudit("Incident resolved", note, incidentId, target.status, "Resolved");
  };

  const handleTelemetryImport = (normalizedRows: NormalizedImportRow[]) => {
    const latestByZone = new Map<string, NormalizedImportRow>();
    for (const row of normalizedRows) {
      const uiZoneId = UI_ZONE_BY_CANONICAL[String(row.zone_id ?? "")];
      if (uiZoneId) latestByZone.set(uiZoneId, row);
    }
    setZones((current) => current.map((zone) => {
      const row = latestByZone.get(zone.id);
      if (!row) return zone;
      const occupancy = Number(row.occupancy);
      const capacity = Number(row.capacity);
      const inflow = Number(row.inflow_per_minute ?? 0);
      const outflow = Number(row.outflow_per_minute ?? 0);
      const occupancyPercent = Number.isFinite(occupancy) && Number.isFinite(capacity) && capacity > 0
        ? Math.round((occupancy / capacity) * 100)
        : zone.occupancy;
      const health = String(row.sensor_health ?? "healthy");
      const blocked = row.blocked === true;
      return {
        ...zone,
        occupancy: occupancyPercent,
        capacity: Number.isFinite(capacity) ? capacity : zone.capacity,
        flow: Number.isFinite(inflow - outflow) ? inflow - outflow : zone.flow,
        sensor: `Imported · ${health}`,
        state: blocked || health !== "healthy" ? "degraded" : occupancyPercent >= 90 ? "critical" : occupancyPercent >= 75 ? "watch" : "stable",
        detail: `Validated import · ${String(row.timestamp ?? "timestamp unavailable")}`,
      };
    }));
    const latestPhase = String(normalizedRows[normalizedRows.length - 1]?.event_phase ?? "");
    const phaseLabel = PHASES.find((item) => domainPhase(item) === latestPhase);
    if (phaseLabel) setPhase(phaseLabel);
  };

  const handleDirectReport = ({ sourceId, text, recommendation }: { sourceId: string; text: string; recommendation: AIRecommendation }) => {
    const incidentId = `INC-${Date.now().toString(36).toUpperCase()}`;
    const risk = assessRisk({
      eventPhase: domainPhase(phase),
      hazardSeverity: 0,
      independentSourceCount: 1,
      meanSourceReliability: 0.5,
      sensorHealth: "healthy",
      blockedRoute: false,
      vulnerablePerson: false,
    });
    const incident: Incident = {
      id: incidentId,
      code: `NEW · ${risk.score}`,
      title: recommendation.summary.slice(0, 96),
      type: recommendation.incidentType.replace("_", " ").replace(/^./, (letter) => letter.toUpperCase()),
      zone: "Location unconfirmed",
      zoneId: "unconfirmed",
      severity: recommendation.severity,
      confidence: Math.round(recommendation.confidence * 100),
      age: "now",
      reports: 1,
      contradictions: recommendation.contradictions.length,
      status: "Awaiting approval",
      team: TEAM_BY_TYPE[recommendation.recommendedTeamType],
      eta: "Pending",
      risk: risk.score,
      riskInputs: { hazardSeverity: 0, vulnerablePerson: false },
      aiSeverity: recommendation.severity[0].toUpperCase() + recommendation.severity.slice(1),
      summary: recommendation.summary,
      rationale: `Numeric risk is ${risk.severity} at ${risk.score} because no telemetry or confirmed location is linked yet. AI severity is ${recommendation.severity} based on the cited report.`,
      evidence: recommendation.evidence.length ? recommendation.evidence.map((item) => ({ source: item.sourceId, fact: item.fact, weight: item.weight.toFixed(2), kind: "Direct report" })) : [{ source: sourceId, fact: text, weight: "0.50", kind: "Direct report" }],
      contradictoryEvidence: recommendation.contradictions.map((item) => ({ sources: item.sourceIds.join(" · "), description: item.description, impact: item.operationalImpact })),
      missing: recommendation.missingInformation,
      questions: recommendation.clarifyingQuestions,
      affectedZones: ["Location requires supervisor confirmation"],
      equipment: recommendation.equipment,
      actions: recommendation.recommendedActions.map((action) => ({ text: action.action, owner: action.ownerRole, target: action.targetMinutes ? `${action.targetMinutes} min` : "Now", approval: true })),
      route: {
        from: "Unassigned",
        path: ["Location confirmation required"],
        alternate: [],
        eta: "Pending",
        alternateEta: "Pending",
        avoided: [],
        saved: "—",
        rationale: "The deterministic route engine will run after a supervisor confirms the incident zone and response team.",
      },
      announcement: recommendation.announcement,
      uncertainty: recommendation.uncertaintyNote,
    };
    setIncidents((current) => [incident, ...current]);
    setAnalysisByIncident((current) => ({ ...current, [incidentId]: { status: "available", recommendation } }));
    requestedAnalysisIds.current.add(incidentId);
    setSelectedId(incidentId);
    setView("command");
    addAudit("Direct report added to queue", `${sourceId} was added for supervisor assessment; no dispatch occurred.`, incidentId, "—", "Awaiting approval");
  };

  const handleSimulationEvent = useCallback((incidentId: string, event: string, scenarioId: string, step: number, seed: number) => {
    const variation = seed % 7;
    setSelectedId(incidentId);
    const incident = INITIAL_INCIDENTS.find((item) => item.id === incidentId);
    if (incident) setSelectedZone(incident.zoneId);
    setSimulation((current) => ({ ...current, event }));
    setZones((current) => current.map((zone) => {
      if (scenarioId === "west-surge" && zone.id === "west-concourse") return { ...zone, occupancy: step >= 4 ? 89 + variation % 3 : Math.min(98, 84 + variation + step * 3), flow: step >= 4 ? 42 + variation : 150 + variation + step * 18, state: step >= 4 ? "watch" : step >= 2 ? "degraded" : step >= 1 ? "critical" : "watch", detail: event };
      if (scenarioId === "smoke-conflict" && zone.id === "east-concourse") return { ...zone, state: "watch", detail: event };
      if (scenarioId === "medical-multilingual" && zone.id === "west-concourse") return { ...zone, occupancy: Math.min(94, 88 + step), state: "critical", detail: event };
      if (scenarioId === "accessible-block" && zone.id === "accessible-corridor") return { ...zone, state: "degraded", detail: event };
      if (scenarioId === "false-duplicate" && zone.id === "south-stands") return { ...zone, state: step > 2 ? "stable" : "watch", detail: event };
      return zone;
    }));
    setIncidents((current) => {
      let next = current.map((item) => {
        if (item.id !== incidentId) return item;
        if (scenarioId === "west-surge") return { ...item, reports: Math.max(item.reports, 1 + Math.min(step, 3)), status: step >= 3 ? "Awaiting approval" as const : "Monitoring" as const, team: "Crowd Team North", riskInputs: { ...item.riskInputs, hazardSeverity: step >= 4 ? 45 : 60 + step * 8 }, summary: event };
        if (scenarioId === "smoke-conflict") return { ...item, contradictions: Math.min(2, Math.max(0, step - 1)), reports: Math.max(1, Math.min(4, step + 1)), status: step >= 4 ? "Awaiting approval" as const : item.status, summary: event };
        if (scenarioId === "medical-multilingual") return { ...item, reports: Math.max(1, Math.min(3, step + 1)), status: step >= 2 ? "Awaiting approval" as const : item.status, summary: event };
        if (scenarioId === "accessible-block") return { ...item, status: step >= 1 ? "Awaiting approval" as const : item.status, riskInputs: { ...item.riskInputs, hazardSeverity: 45 + step * 8 }, summary: event };
        if (scenarioId === "false-duplicate") return { ...item, title: "Person fall beside south service lift", type: "Medical", reports: 1, contradictions: 0, riskInputs: { hazardSeverity: 60, vulnerablePerson: true }, summary: "One person fall remains a distinct incident from the nearby equipment event.", evidence: [{ source: "REPORT-A-FALL", fact: "A person fell beside the south service lift.", weight: "0.82", kind: "Staff report" }] };
        return item;
      });
      if (scenarioId === "false-duplicate" && step >= 1 && !next.some((item) => item.id === "INC-2038-B")) {
        const base = INITIAL_INCIDENTS.find((item) => item.id === "INC-2038");
        if (base) next = [...next, {
          ...base,
          id: "INC-2038-B",
          code: "RISK · PENDING",
          title: "Equipment case fell in service tunnel",
          type: "Infrastructure",
          severity: "moderate",
          confidence: 88,
          age: "now",
          reports: 1,
          contradictions: 0,
          status: "Monitoring",
          riskInputs: { hazardSeverity: 42, vulnerablePerson: false },
          summary: "A falling equipment case in the adjacent tunnel remains separate from the reported person fall.",
          rationale: "Distinct subject and precise location prevent a false merge despite temporal and geographic proximity.",
          evidence: [{ source: "REPORT-B-EQUIPMENT", fact: "An equipment case fell in the adjacent service tunnel.", weight: "0.88", kind: "Facilities report" }],
          contradictoryEvidence: [],
        }];
      }
      return next;
    });
    setAnalysisByIncident((current) => {
      const next = { ...current };
      delete next[incidentId];
      return next;
    });
    requestedAnalysisIds.current.delete(incidentId);
    if (scenarioId === "accessible-block" && step >= 1) setPhase("Egress");
    if (scenarioId === "false-duplicate" && step === 3) addAudit("Fusion comparison rejected", "REPORT-A-FALL and REPORT-B-EQUIPMENT remain separate; both sources are preserved.", incidentId, "2 candidate reports", "2 distinct incidents", "Fusion Engine");
  }, [addAudit]);

  const resetSimulation = useCallback(() => {
    setZones(INITIAL_ZONES);
    setIncidents(INITIAL_INCIDENTS);
    setAnalysisByIncident({});
    requestedAnalysisIds.current.clear();
    setPhase("Live match");
    setSimulation((current) => ({ ...current, running: false, event: "Baseline restored" }));
    setToast("Scenario baseline restored");
  }, []);

  const handleSimulationStatus = useCallback((running: boolean, name: string) => {
    setSimulation((current) => current.running === running && current.name === name ? current : { ...current, running, name });
  }, []);

  const switchView = (nextView: View) => {
    setView(nextView);
    setMobileNav(false);
    if (window.matchMedia("(max-width: 820px)").matches) window.requestAnimationFrame(() => mobileMenuRef.current?.focus());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="aegis-app">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <aside ref={sidebarRef} className={`sidebar${mobileNav ? " is-open" : ""}`}>
        <div className="sidebar-brand" role="img" aria-label="AegisGrid home">
          <span className="brand-mark"><Icon name="shield" size={28} /><i /><b /></span>
          <span className="brand-compact">AG</span>
        </div>
        <nav aria-label="Primary navigation">
          {NAV.map((item, index) => <button ref={index === 0 ? firstNavRef : undefined} type="button" key={item.id} className={view === item.id ? "is-active" : ""} onClick={() => switchView(item.id)} aria-current={view === item.id ? "page" : undefined} disabled={!interactiveReady}><Icon name={item.icon} size={20} /><span>{item.label}</span>{item.id === "audit" && incidents.some((incident) => incident.status === "Awaiting approval") ? <i className="nav-alert" /> : null}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <button type="button" aria-label="Announce system status" onClick={() => setToast(`${aiState === "available" ? "Hybrid" : "Degraded"} mode · ${degradedZones.length} degraded zone feeds`)}><Icon name="sensor" size={19} /><span>Status</span><i className={degradedZones.length ? "status-watch" : "status-ok"} /></button>
          <div aria-label="Signed in role: Safety Supervisor" className="profile-nav"><span>SS</span><b>Supervisor</b></div>
        </div>
      </aside>
      {mobileNav ? <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation" onClick={() => { setMobileNav(false); mobileMenuRef.current?.focus(); }} /> : null}

      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-brand">
            <button ref={mobileMenuRef} type="button" className="mobile-menu-button" onClick={() => setMobileNav((current) => !current)} aria-label="Toggle navigation" aria-expanded={mobileNav} disabled={!interactiveReady}><Icon name={mobileNav ? "x" : "menu"} /></button>
            <div><span className="wordmark">AEGIS<span>GRID</span></span><small>INCIDENT FUSION & RESPONSE COPILOT</small></div>
            <span className="edition">2026</span>
          </div>
          <div className="topbar-status">
            <span className="feed-badge"><i />SYNTHETIC SCENARIO FEED</span>
            <span className={`ai-health ${aiState}`}><Icon name={aiState === "available" ? "spark" : aiState === "checking" ? "clock" : "warning"} size={13} />{aiState === "available" ? "AI provider ready" : aiState === "checking" ? "Checking AI health" : "AI analysis unavailable."}</span>
            <div className="event-clock"><span>{clock ? clock.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase() : "LOCAL TIME"}</span><strong>{clock ? clock.toLocaleTimeString("en-GB", { hour12: false }) : "--:--:--"}</strong><small>IST</small></div>
          </div>
          <div className="topbar-actions">
            <label className="phase-select"><span>EVENT PHASE</span><select value={phase} onChange={(event) => setPhase(event.target.value)}>{PHASES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <button type="button" className="top-action-button notification-button" aria-label={`Review ${activeIncidents.length} active incidents`} onClick={() => { selectIncident(topIncident); document.getElementById("incident-queue")?.scrollIntoView({ behavior: "smooth" }); }}><Icon name="bell" /><span>{activeIncidents.length}</span></button>
            <div className="supervisor-profile" aria-label="Signed in as Safety Supervisor"><span>SS</span><div><strong>Safety Supervisor</strong><small>Unity Stadium · Command 01</small></div></div>
          </div>
        </header>

        <div id="main-content">
          {view === "command" ? (
            <main className="workspace-view command-view">
              <div className="command-heading">
                <div><div className="eyebrow">UNITY STADIUM · MATCH DAY 17 · SUPERVISOR VIEW</div><h1>Live Command Center</h1><p>See what needs attention now, why it matters, and what requires your approval.</p></div>
                <div className="operational-state"><span className="state-signal"><i /><i /><i /></span><div><small>OPERATIONAL STATE</small><strong>{simulation.running ? "Scenario running" : "Heightened monitoring"}</strong><span>{simulation.running ? `${simulation.name} · ${simulation.event}` : "Risk, routing, and evidence systems online"}</span></div></div>
              </div>

              <section className="decision-brief" aria-labelledby="priority-focus-title">
                <article className="decision-incident">
                  <div className="decision-label-row">
                    <span className="priority-badge"><i />Priority 01</span>
                    <span className="decision-incident-id mono">{topIncident.id}</span>
                    <span className={`severity-badge ${topIncident.severity}`}><i />{topIncident.severity}</span>
                  </div>
                  <span className="decision-kicker">Current decision focus</span>
                  <h2 id="priority-focus-title">{topIncident.title}</h2>
                  <p className="decision-summary">{topIncident.summary}</p>
                  <dl className="decision-metrics">
                    <div><dt>Risk score</dt><dd>{topIncident.risk}<span>/100</span></dd></div>
                    <div><dt>Confidence</dt><dd>{topIncident.confidence}<span>%</span></dd></div>
                    <div><dt>Evidence</dt><dd>{topIncident.reports}<span> reports</span></dd></div>
                    <div><dt>Conflicts</dt><dd className={topIncident.contradictions ? "has-conflict" : ""}>{topIncident.contradictions}<span> open</span></dd></div>
                  </dl>
                </article>
                <aside className="decision-action-card" aria-label="Recommended supervisor decision">
                  <div className="decision-approval"><span><Icon name="lock" size={14} /></span><div><strong>Supervisor decision required</strong><small>Nothing is dispatched automatically</small></div></div>
                  <span className="decision-action-label">Recommended next step</span>
                  <h3>{topIncident.actions[0]?.text ?? "Continue monitored assessment"}</h3>
                  <div className="decision-response-meta">
                    <span><Icon name="team" size={15} />{topIncident.team}</span>
                    <span><Icon name="route" size={15} />Safe-route ETA {topIncident.eta}</span>
                  </div>
                  <button type="button" className="decision-review-button" onClick={() => { selectIncident(topIncident); document.getElementById("incident-intelligence")?.scrollIntoView({ behavior: "smooth" }); }}><span>Review evidence &amp; plan</span><Icon name="chevron" size={16} /></button>
                </aside>
              </section>

              <section className="kpi-grid" aria-label="Live synthetic event metrics">
                <article className="kpi-card readiness-card"><div><span className="metric-icon cyan"><Icon name="shield" size={19} /></span><small>OPERATIONAL READINESS</small></div><div className="kpi-value"><strong>{readiness}</strong><span>/100</span></div><div className="micro-progress"><i style={{ width: `${readiness}%` }} /></div><footer><span>{criticalCount} critical</span><span>{degradedZones.length} degraded feeds</span></footer></article>
                <article className="kpi-card"><div><span className="metric-icon amber"><Icon name="alert" size={19} /></span><small>ACTIVE INCIDENTS</small></div><div className="kpi-value"><strong>{activeIncidents.length}</strong><span className="kpi-unit">open</span></div><footer><span className="critical-sub"><i />{criticalCount} critical</span><span>{activeIncidents.filter((incident) => incident.status === "Awaiting approval").length} need approval</span></footer></article>
                <article className="kpi-card"><div><span className="metric-icon blue"><Icon name="clock" size={19} /></span><small>AVERAGE RESPONSE ETA</small></div><div className="kpi-value"><strong>{formatEta(averageEta)}</strong><span className="kpi-unit">min</span></div><footer><span>{responseEtas.length} routed incidents</span><span>Dynamic route outputs</span></footer></article>
                <article className="kpi-card"><div><span className="metric-icon muted"><Icon name="sensor" size={19} /></span><small>DEGRADED SENSORS</small></div><div className="kpi-value"><strong>{degradedZones.length}</strong><span className="kpi-unit">zones</span></div><footer><span>{degradedZones.map((zone) => zone.short).join(" · ") || "None"}</span><span>{zones.length - degradedZones.length} / {zones.length} zone feeds nominal</span></footer></article>
                <article className="kpi-card"><div><span className="metric-icon green"><Icon name="team" size={19} /></span><small>AVAILABLE TEAMS</small></div><div className="kpi-value"><strong>{availableTeams}</strong><span className="kpi-unit">of {totalTeams}</span></div><footer><span className="team-dots">{Array.from({ length: totalTeams }, (_, index) => <i key={index} className={index >= availableTeams ? "busy" : ""} />)}</span><span>{assignedTeams} assigned</span></footer></article>
                <article className="kpi-card"><div><span className="metric-icon violet"><Icon name="users" size={19} /></span><small>VENUE OCCUPANCY</small></div><div className="kpi-value"><strong>{overallOccupancy}%</strong><span className="kpi-unit">{(estimatedAttendance / 1000).toFixed(1)}k</span></div><footer><span>+{inboundRate}/min in</span><span>−{outboundRate}/min out</span></footer></article>
              </section>

              <section className="signal-strip" aria-label="Current operational signals">
                <article className="flow-readout"><span className="ribbon-icon"><Icon name="users" size={18} /></span><div><small>CROWD FLOW RIGHT NOW</small><strong>+{inboundRate} <i>in</i> / −{outboundRate} <i>out</i> per minute</strong></div><span className="sparkline" aria-hidden="true">{zones.map((zone) => <i key={zone.id} style={{ height: `${Math.max(12, Math.round(Math.abs(zone.flow) / maxAbsoluteFlow * 100))}%` }} />)}</span></article>
                <article className="recent-signal"><span className="ribbon-icon"><Icon name="radio" size={18} /></span><div><small>MOST URGENT EVIDENCE · {recentEvidence?.source ?? "NO SOURCE"} · {topIncident.age}</small><strong>“{recentEvidence?.fact ?? "No active source report"}”</strong></div><button type="button" className="icon-button" onClick={() => selectIncident(topIncident)} aria-label="Open most urgent evidence"><Icon name="chevron" size={16} /></button></article>
              </section>

              <div className="command-grid">
                <StadiumMap zones={zones} selectedZone={selectedZone} selectedIncident={displayedIncident} onSelectZone={setSelectedZone} />
                <IncidentQueue incidents={activeIncidents} selectedId={selectedId} onSelect={selectIncident} />
              </div>

              <div id="incident-intelligence">
                <IncidentDetail key={selectedIncident.id} incident={displayedIncident} aiStatus={detailAiStatus} onDecision={handleDecision} onAssignTeam={handleAssignTeam} onModifyPlan={handleModifyPlan} onDismissReport={handleDismissReport} onUpdateAnnouncement={handleUpdateAnnouncement} />
              </div>
            </main>
          ) : null}
          {view === "data" ? <DataLab onAudit={(action, note) => addAudit(action, note)} onImport={handleTelemetryImport} onReport={handleDirectReport} /> : null}
          {view === "simulator" ? <ScenarioSimulator onEvent={handleSimulationEvent} onReset={resetSimulation} onStatus={handleSimulationStatus} /> : null}
          {view === "audit" ? <AuditView events={auditEvents} incidents={incidents} persistence={auditPersistence} onResolve={handleResolve} /> : null}
        </div>

        <footer className="global-footer"><span><span className="brand-mark mini"><Icon name="shield" size={16} /></span>AEGISGRID 2026</span><p>Decision support for trained stadium safety personnel. Never an autonomous dispatch or medical diagnosis system.</p><span>Unity Stadium · Synthetic demonstration</span></footer>
      </div>

      {toast ? <div className="toast" role="status"><span><Icon name={auditPersistence === "error" ? "warning" : "check"} size={15} /></span><div><strong>{toast}</strong><small>{auditPersistence === "firestore" ? "Recorded in durable append-only audit storage" : auditPersistence === "error" ? "Local event recorded; server audit write unavailable" : "Recorded in the append-only demo session log"}</small></div></div> : null}
    </div>
  );
}
