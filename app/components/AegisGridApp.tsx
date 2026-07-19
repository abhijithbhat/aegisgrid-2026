"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AIRecommendation } from "../../src/types";
import { assessRisk } from "../../src/lib/risk";
import { rankOperationalItems } from "../../src/lib/incidents";
import { AuditView } from "./AuditView";
import { DataLab, type NormalizedImportRow } from "./DataLab";
import { Icon, type IconName } from "./Icon";
import { IncidentDetail } from "./IncidentDetail";
import { IncidentQueue } from "./IncidentQueue";
import { ScenarioSimulator } from "./ScenarioSimulator";
import { StadiumMap } from "./StadiumMap";
import { useIncidentAnalysis } from "./use-incident-analysis";
import { INITIAL_AUDIT, INITIAL_INCIDENTS, INITIAL_ZONES, type AuditEvent, type Incident } from "./aegisData";
import {
  AUDIT_ACTION_BY_LABEL,
  AUDIT_LABEL_BY_ACTION,
  EVENT_PHASE_LABELS,
  TEAM_BY_TYPE,
  UI_ZONE_BY_CANONICAL,
  auditStatus,
  domainIncidentType,
  domainPhase,
  etaSeconds,
  formatEta,
  nowTime,
  numericSeverity,
  withDeterministicRisk,
  withDeterministicRoute,
  withLiveRecommendation,
} from "./operational-model";

type View = "command" | "data" | "simulator" | "audit";
type AuditPersistence = "checking" | "firestore" | "memory" | "error";

const NAV: { id: View; label: string; icon: IconName }[] = [
  { id: "command", label: "Command", icon: "grid" },
  { id: "data", label: "Data Lab", icon: "database" },
  { id: "simulator", label: "Simulator", icon: "play" },
  { id: "audit", label: "Audit", icon: "audit" },
];

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
  const sidebarRef = useRef<HTMLElement>(null);
  const firstNavRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const [simulation, setSimulation] = useState({ running: false, name: "West Gate Surge", event: "Baseline loaded" });
  const [mobileNav, setMobileNav] = useState(false);
  const previousCriticalIds = useRef<string[]>([]);
  const [newCriticalIncident, setNewCriticalIncident] = useState<{ id: string; zoneId: string } | null>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setInteractiveReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (auditPersistence !== "firestore") return;
    const stream = new EventSource("/api/live");
    stream.addEventListener("incident", (event) => {
      try {
        const update = JSON.parse((event as MessageEvent<string>).data) as { record?: { id?: unknown; payload?: unknown } };
        const id = typeof update.record?.id === "string" ? update.record.id : "";
        const payload = update.record?.payload;
        if (!id || !payload || typeof payload !== "object" || Array.isArray(payload)) return;
        setIncidents((current) => current.map((incident) => incident.id === id ? { ...incident, ...(payload as Partial<Incident>), id } : incident));
      } catch { /* malformed provider state is ignored at the UI boundary */ }
    });
    stream.addEventListener("audit", (event) => {
      try {
        const update = JSON.parse((event as MessageEvent<string>).data) as { event?: Record<string, unknown> };
        const item = update.event;
        if (!item || typeof item.id !== "string" || typeof item.timestamp !== "string" || typeof item.action !== "string" || typeof item.incidentId !== "string") return;
        const mapped: AuditEvent = { id: item.id, timestamp: new Date(item.timestamp).toLocaleTimeString("en-GB", { hour12: false }), actor: item.actorRole === "stadium-safety-supervisor" ? "Safety Supervisor" : "System", action: AUDIT_LABEL_BY_ACTION[item.action] ?? item.action, incident: item.incidentId, previous: String(item.previousStatus ?? "—"), next: String(item.newStatus ?? "—"), note: String(item.note ?? ""), version: String(item.aiRecommendationVersion ?? "") };
        setAuditEvents((current) => current.some((existing) => existing.id === mapped.id) ? current : [mapped, ...current]);
      } catch { /* malformed provider state is ignored at the UI boundary */ }
    });
    stream.addEventListener("sync-error", () => setAuditPersistence("error"));
    stream.onerror = () => { stream.close(); };
    return () => stream.close();
  }, [auditPersistence]);

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
  const analysisRequestBody = JSON.stringify({
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
    sources: selectedIncident.evidence.map((evidence) => ({
      sourceId: evidence.source,
      sourceType: evidence.kind,
      text: evidence.fact,
      reliability: Math.min(1, Math.max(0, Number(evidence.weight))),
    })),
    route: {
      primaryZoneIds: selectedIncident.route.path.length ? selectedIncident.route.path : ["no-safe-route"],
      alternateZoneIds: selectedIncident.route.alternate,
      etaMinutes: Math.max(0, Number.parseFloat(selectedIncident.route.eta) || 0),
      avoidedZoneIds: selectedIncident.route.avoided,
      rationale: selectedIncident.route.rationale,
    },
  });
  const { aiState, analysisByIncident, setAnalysisByIncident } =
    useIncidentAnalysis(analysisRequestBody);

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
  const detailAiStatus: "checking" | "loading" | "available" | "unavailable" =
    selectedAnalysis?.status === "available"
      ? "available"
      : selectedAnalysis?.status === "loading"
        ? "loading"
        : selectedAnalysis?.status === "unavailable" || aiState === "unavailable"
          ? "unavailable"
          : aiState === "checking"
            ? "checking"
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

  useEffect(() => {
    const currentCriticals = activeIncidents.filter((inc) => numericSeverity(inc.risk) === "critical");
    const currentIds = currentCriticals.map(inc => inc.id);
    
    if (isInitialMount.current) {
      previousCriticalIds.current = currentIds;
      isInitialMount.current = false;
      return;
    }
    
    const newCritical = currentCriticals.find((inc) => !previousCriticalIds.current.includes(inc.id));
    if (newCritical) {
      setNewCriticalIncident({ id: newCritical.id, zoneId: newCritical.zoneId });
      previousCriticalIds.current = currentIds;
      const timer = setTimeout(() => {
        setNewCriticalIncident(null);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      const hasDiff = currentIds.length !== previousCriticalIds.current.length || currentIds.some(id => !previousCriticalIds.current.includes(id));
      if (hasDiff) {
        previousCriticalIds.current = currentIds;
      }
    }
  }, [activeIncidents]);

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

  const syncIncident = useCallback((patch: { id: string; status?: Incident["status"]; team?: string; actions?: Incident["actions"]; announcement?: Incident["announcement"] }) => {
    void fetch("/api/incidents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).catch(() => undefined);
  }, []);

  const handleDecision = (action: string, nextStatus: Incident["status"], note: string) => {
    const previous = selectedIncident.status;
    setIncidents((current) => current.map((incident) => incident.id === selectedIncident.id ? { ...incident, status: nextStatus } : incident));
    syncIncident({ id: selectedIncident.id, status: nextStatus });
    addAudit(action, note, selectedIncident.id, previous, nextStatus);
  };

  const handleAssignTeam = (team: string) => {
    const previousTeam = selectedIncident.team;
    setIncidents((current) => current.map((incident) => incident.id === selectedIncident.id ? { ...incident, team } : incident));
    syncIncident({ id: selectedIncident.id, team });
    addAudit("Response team assigned", `Suggested team changed from ${previousTeam} to ${team}; no dispatch occurred.`, selectedIncident.id, selectedIncident.status, selectedIncident.status);
  };

  const handleModifyPlan = (actions: string[]) => {
    const synchronizedActions = actions.map((text, index) => ({ text, owner: selectedIncident.actions[index]?.owner ?? "Safety supervisor", target: selectedIncident.actions[index]?.target ?? "Review", approval: true }));
    setIncidents((current) => current.map((incident) => incident.id === selectedIncident.id ? {
      ...incident,
      actions: synchronizedActions,
    } : incident));
    syncIncident({ id: selectedIncident.id, actions: synchronizedActions });
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
    syncIncident({ id: selectedIncident.id, announcement: { ...selectedIncident.announcement, text } });
  };

  const handleResolve = (incidentId: string, note: string) => {
    const target = incidents.find((incident) => incident.id === incidentId);
    if (!target) return;
    setIncidents((current) => current.map((incident) => incident.id === incidentId ? { ...incident, status: "Resolved" } : incident));
    syncIncident({ id: incidentId, status: "Resolved" });
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
    const phaseLabel = EVENT_PHASE_LABELS.find((item) => domainPhase(item) === latestPhase);
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
        if (scenarioId === "medical-multilingual") return {
          ...item,
          reports: Math.max(1, Math.min(3, step + 1)),
          status: step >= 2 ? "Awaiting approval" as const : item.status,
          summary: step >= 1 ? "English and हिंदी reports use different landmarks for the same unconscious guest near west stair W-3." : event,
          evidence: step >= 1 && !item.evidence.some((source) => source.source === "SIM-REPORT-HI") ? [...item.evidence, { source: "SIM-REPORT-HI", fact: "पश्चिमी भोजन क्षेत्र के पास एक व्यक्ति बेहोश है।", weight: "0.84", kind: "Hindi guest report" }] : item.evidence,
          announcement: step >= 2 ? { language: "English · हिन्दी", tone: "Calm / directive", text: "Please keep west stair W-3 clear. कृपया पश्चिमी सीढ़ी W-3 को खाली रखें और कर्मचारियों के निर्देशों का पालन करें।" } : item.announcement,
        };
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
    if (scenarioId === "accessible-block" && step >= 1) setPhase("Egress");
    if (scenarioId === "false-duplicate" && step === 3) addAudit("Fusion comparison rejected", "REPORT-A-FALL and REPORT-B-EQUIPMENT remain separate; both sources are preserved.", incidentId, "2 candidate reports", "2 distinct incidents", "Fusion Engine");
  }, [addAudit]);

  const resetSimulation = useCallback(() => {
    setZones(INITIAL_ZONES);
    setIncidents(INITIAL_INCIDENTS);
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
            <label className="phase-select"><span>EVENT PHASE</span><select value={phase} onChange={(event) => setPhase(event.target.value)}>{EVENT_PHASE_LABELS.map((item) => <option key={item}>{item}</option>)}</select></label>
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
                <StadiumMap zones={zones} selectedZone={selectedZone} selectedIncident={displayedIncident} onSelectZone={setSelectedZone} pulseZoneId={newCriticalIncident?.zoneId} />
                <IncidentQueue incidents={activeIncidents} selectedId={selectedId} onSelect={selectIncident} pulseIncidentId={newCriticalIncident?.id} />
              </div>

              <div id="incident-intelligence">
                <IncidentDetail key={selectedIncident.id} incident={displayedIncident} aiStatus={detailAiStatus} reasoningProgress={selectedAnalysis?.status === "loading" ? selectedAnalysis.progress : []} onDecision={handleDecision} onAssignTeam={handleAssignTeam} onModifyPlan={handleModifyPlan} onDismissReport={handleDismissReport} onUpdateAnnouncement={handleUpdateAnnouncement} />
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
