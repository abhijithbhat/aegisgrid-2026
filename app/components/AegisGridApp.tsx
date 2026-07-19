"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rankOperationalItems } from "../../src/lib/incidents";
import { AuditView } from "./AuditView";
import { DataLab } from "./DataLab";
import { AppSidebar, AppTopbar, GlobalFooter, type View } from "./AppChrome";
import { CommandOverview } from "./CommandOverview";
import { Icon } from "./Icon";
import { IncidentDetail } from "./IncidentDetail";
import { IncidentQueue } from "./IncidentQueue";
import { ScenarioSimulator } from "./ScenarioSimulator";
import { StadiumMap } from "./StadiumMap";
import { useAuditPersistence } from "./use-audit-persistence";
import { useIncidentAnalysis } from "./use-incident-analysis";
import { useIncidentActions } from "./use-incident-actions";
import { useScenarioSimulation } from "./use-scenario-simulation";
import { INITIAL_INCIDENTS, INITIAL_ZONES, type Incident } from "./aegisData";
import {
  domainIncidentType,
  domainPhase,
  etaSeconds,
  numericSeverity,
  withDeterministicRisk,
  withDeterministicRoute,
  withLiveRecommendation,
} from "./operational-model";

export function AegisGridApp() {
  const [interactiveReady, setInteractiveReady] = useState(false);
  const [view, setView] = useState<View>("command");
  const [clock, setClock] = useState<Date | null>(null);
  const [phase, setPhase] = useState("Live match");
  const [zones, setZones] = useState(INITIAL_ZONES);
  const [incidents, setIncidents] = useState(INITIAL_INCIDENTS);
  const [selectedId, setSelectedId] = useState(INITIAL_INCIDENTS[0].id);
  const [selectedZone, setSelectedZone] = useState(INITIAL_INCIDENTS[0].zoneId);
  const [toast, setToast] = useState("");
  const { auditEvents, auditPersistence, addAudit, syncIncident } = useAuditPersistence({
    setIncidents,
    onToast: setToast,
  });
  const sidebarRef = useRef<HTMLElement>(null);
  const firstNavRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const previousCriticalIds = useRef<string[]>([]);
  const [newCriticalIncident, setNewCriticalIncident] = useState<{
    id: string;
    zoneId: string;
  } | null>(null);
  const isInitialMount = useRef(true);
  const { simulation, handleSimulationEvent, resetSimulation, handleSimulationStatus } =
    useScenarioSimulation({
      setZones,
      setIncidents,
      setSelectedId,
      setSelectedZone,
      setPhase,
      addAudit,
      onToast: setToast,
    });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setInteractiveReady(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const assessedIncidents = useMemo(
    () => incidents.map((incident) => withDeterministicRisk(incident, zones, phase)),
    [incidents, zones, phase],
  );
  const routedIncidents = useMemo(
    () => assessedIncidents.map((incident) => withDeterministicRoute(incident, zones)),
    [assessedIncidents, zones],
  );
  const selectedIncident =
    routedIncidents.find((incident) => incident.id === selectedId) ?? routedIncidents[0];
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
      primaryZoneIds: selectedIncident.route.path.length
        ? selectedIncident.route.path
        : ["no-safe-route"],
      alternateZoneIds: selectedIncident.route.alternate,
      etaMinutes: Math.max(0, Number.parseFloat(selectedIncident.route.eta) || 0),
      avoidedZoneIds: selectedIncident.route.avoided,
      rationale: selectedIncident.route.rationale,
    },
  });
  const { aiState, analysisByIncident, setAnalysisByIncident } =
    useIncidentAnalysis(analysisRequestBody);
  const {
    handleDecision,
    handleAssignTeam,
    handleModifyPlan,
    handleDismissReport,
    handleUpdateAnnouncement,
    handleResolve,
    handleTelemetryImport,
    handleDirectReport,
  } = useIncidentActions({
    incidents,
    selectedIncident,
    phase,
    setIncidents,
    setZones,
    setPhase,
    setSelectedId,
    setView,
    setAnalysisByIncident,
    syncIncident,
    addAudit,
  });

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
      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNav]);

  const selectedAnalysis = analysisByIncident[selectedIncident.id];
  const displayedIncident = useMemo(
    () =>
      withDeterministicRoute(
        withLiveRecommendation(
          selectedIncident,
          selectedAnalysis?.status === "available" ? selectedAnalysis.recommendation : undefined,
        ),
        zones,
      ),
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

  const activeIncidents = useMemo(
    () =>
      rankOperationalItems(
        routedIncidents.filter((incident) => !["Resolved", "Dismissed"].includes(incident.status)),
        (incident) => ({
          riskScore: incident.risk,
          severity: numericSeverity(incident.risk),
          confidence: Math.min(1, 0.45 + incident.reports * 0.1),
          contradictionCount: incident.contradictions,
          awaitingApproval: incident.status === "Awaiting approval",
        }),
      ).map((entry) => entry.item),
    [routedIncidents],
  );

  useEffect(() => {
    const currentCriticals = activeIncidents.filter(
      (inc) => numericSeverity(inc.risk) === "critical",
    );
    const currentIds = currentCriticals.map((inc) => inc.id);

    if (isInitialMount.current) {
      previousCriticalIds.current = currentIds;
      isInitialMount.current = false;
      return;
    }

    const newCritical = currentCriticals.find(
      (inc) => !previousCriticalIds.current.includes(inc.id),
    );
    if (newCritical) {
      setNewCriticalIncident({ id: newCritical.id, zoneId: newCritical.zoneId });
      previousCriticalIds.current = currentIds;
      const timer = setTimeout(() => {
        setNewCriticalIncident(null);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      const hasDiff =
        currentIds.length !== previousCriticalIds.current.length ||
        currentIds.some((id) => !previousCriticalIds.current.includes(id));
      if (hasDiff) {
        previousCriticalIds.current = currentIds;
      }
    }
  }, [activeIncidents]);

  const criticalCount = activeIncidents.filter(
    (incident) => numericSeverity(incident.risk) === "critical",
  ).length;
  const degradedZones = zones.filter((zone) => zone.state === "degraded");
  const readiness = Math.max(
    0,
    100 -
      criticalCount * 12 -
      degradedZones.length * 6 -
      zones.filter((zone) => zone.state === "watch").length * 2 -
      activeIncidents.filter((incident) => incident.status === "Awaiting approval").length * 2,
  );
  const totalCapacity = zones.reduce((sum, zone) => sum + zone.capacity, 0);
  const estimatedAttendance = Math.round(
    zones.reduce((sum, zone) => sum + (zone.capacity * zone.occupancy) / 100, 0),
  );
  const overallOccupancy = totalCapacity
    ? Math.round((estimatedAttendance / totalCapacity) * 100)
    : 0;
  const inboundRate = zones.reduce((sum, zone) => sum + Math.max(0, zone.flow), 0);
  const outboundRate = zones.reduce((sum, zone) => sum + Math.max(0, -zone.flow), 0);
  const responseEtas = activeIncidents.flatMap((incident) => {
    const seconds = etaSeconds(incident.eta);
    return seconds === undefined ? [] : [seconds];
  });
  const averageEta = responseEtas.length
    ? responseEtas.reduce((sum, seconds) => sum + seconds, 0) / responseEtas.length
    : undefined;
  const assignedTeams = new Set(
    activeIncidents
      .filter((incident) => incident.status === "Monitoring")
      .map((incident) => incident.team),
  ).size;
  const totalTeams = 8;
  const availableTeams = Math.max(0, totalTeams - assignedTeams);
  const topIncident = activeIncidents[0] ?? selectedIncident;

  const selectIncident = (incident: Incident) => {
    setSelectedId(incident.id);
    setSelectedZone(incident.zoneId);
  };

  const switchView = (nextView: View) => {
    setView(nextView);
    setMobileNav(false);
    if (window.matchMedia("(max-width: 820px)").matches)
      window.requestAnimationFrame(() => mobileMenuRef.current?.focus());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="aegis-app">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <AppSidebar
        sidebarRef={sidebarRef}
        firstNavRef={firstNavRef}
        mobileMenuRef={mobileMenuRef}
        mobileNav={mobileNav}
        view={view}
        interactiveReady={interactiveReady}
        incidents={incidents}
        degradedZoneCount={degradedZones.length}
        aiState={aiState}
        onSwitchView={switchView}
        onClose={() => setMobileNav(false)}
        onStatus={setToast}
      />

      <div className="app-shell">
        <AppTopbar
          mobileMenuRef={mobileMenuRef}
          mobileNav={mobileNav}
          interactiveReady={interactiveReady}
          aiState={aiState}
          clock={clock}
          phase={phase}
          activeIncidentCount={activeIncidents.length}
          onToggleNavigation={() => setMobileNav((current) => !current)}
          onPhaseChange={setPhase}
          onReviewIncidents={() => {
            selectIncident(topIncident);
            document.getElementById("incident-queue")?.scrollIntoView({ behavior: "smooth" });
          }}
        />

        <div id="main-content">
          {view === "command" ? (
            <main className="workspace-view command-view">
              <CommandOverview
                simulation={simulation}
                topIncident={topIncident}
                readiness={readiness}
                criticalCount={criticalCount}
                degradedZones={degradedZones}
                activeIncidents={activeIncidents}
                averageEta={averageEta}
                responseEtaCount={responseEtas.length}
                zones={zones}
                availableTeams={availableTeams}
                totalTeams={totalTeams}
                assignedTeams={assignedTeams}
                overallOccupancy={overallOccupancy}
                estimatedAttendance={estimatedAttendance}
                inboundRate={inboundRate}
                outboundRate={outboundRate}
                onSelectIncident={selectIncident}
              />

              <div className="command-grid">
                <StadiumMap
                  zones={zones}
                  selectedZone={selectedZone}
                  selectedIncident={displayedIncident}
                  onSelectZone={setSelectedZone}
                  pulseZoneId={newCriticalIncident?.zoneId}
                />
                <IncidentQueue
                  incidents={activeIncidents}
                  selectedId={selectedId}
                  onSelect={selectIncident}
                  pulseIncidentId={newCriticalIncident?.id}
                />
              </div>

              <div id="incident-intelligence">
                <IncidentDetail
                  key={selectedIncident.id}
                  incident={displayedIncident}
                  aiStatus={detailAiStatus}
                  reasoningProgress={
                    selectedAnalysis?.status === "loading" ? selectedAnalysis.progress : []
                  }
                  onDecision={handleDecision}
                  onAssignTeam={handleAssignTeam}
                  onModifyPlan={handleModifyPlan}
                  onDismissReport={handleDismissReport}
                  onUpdateAnnouncement={handleUpdateAnnouncement}
                />
              </div>
            </main>
          ) : null}
          {view === "data" ? (
            <DataLab
              onAudit={(action, note) => addAudit(action, note)}
              onImport={handleTelemetryImport}
              onReport={handleDirectReport}
            />
          ) : null}
          {view === "simulator" ? (
            <ScenarioSimulator
              onEvent={handleSimulationEvent}
              onReset={resetSimulation}
              onStatus={handleSimulationStatus}
            />
          ) : null}
          {view === "audit" ? (
            <AuditView
              events={auditEvents}
              incidents={incidents}
              persistence={auditPersistence}
              onResolve={handleResolve}
            />
          ) : null}
        </div>

        <GlobalFooter />
      </div>

      {toast ? (
        <div className="toast" role="status">
          <span>
            <Icon name={auditPersistence === "error" ? "warning" : "check"} size={15} />
          </span>
          <div>
            <strong>{toast}</strong>
            <small>
              {auditPersistence === "firestore"
                ? "Recorded in durable append-only audit storage"
                : auditPersistence === "error"
                  ? "Local event recorded; server audit write unavailable"
                  : "Recorded in the append-only demo session log"}
            </small>
          </div>
        </div>
      ) : null}
    </div>
  );
}
