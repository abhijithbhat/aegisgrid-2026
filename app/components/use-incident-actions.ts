"use client";

import type { Dispatch, SetStateAction } from "react";
import { assessRisk } from "../../src/lib/risk";
import type { AIRecommendation } from "../../src/types";
import type { View } from "./AppChrome";
import type { NormalizedImportRow } from "./data-lab-model";
import type { IncidentAnalysisState } from "./use-incident-analysis";
import type { Incident, Zone } from "./aegisData";
import {
  EVENT_PHASE_LABELS,
  TEAM_BY_TYPE,
  UI_ZONE_BY_CANONICAL,
  domainPhase,
} from "./operational-model";

type AddAudit = (
  action: string,
  note: string,
  incident?: string,
  previous?: string,
  next?: string,
  actor?: string,
) => void;

type SyncIncident = (patch: {
  id: string;
  status?: Incident["status"];
  team?: string;
  actions?: Incident["actions"];
  announcement?: Incident["announcement"];
}) => void;

type UseIncidentActionsOptions = {
  incidents: Incident[];
  selectedIncident: Incident;
  phase: string;
  setIncidents: Dispatch<SetStateAction<Incident[]>>;
  setZones: Dispatch<SetStateAction<Zone[]>>;
  setPhase: Dispatch<SetStateAction<string>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setView: Dispatch<SetStateAction<View>>;
  setAnalysisByIncident: Dispatch<SetStateAction<Record<string, IncidentAnalysisState>>>;
  syncIncident: SyncIncident;
  addAudit: AddAudit;
};

/**
 * Owns explicit supervisor mutations. Deterministic engines calculate risk and
 * routing; AI recommendations are only edited, cited, or queued for approval.
 */
export function useIncidentActions({
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
}: UseIncidentActionsOptions) {
  const handleDecision = (action: string, nextStatus: Incident["status"], note: string) => {
    const previous = selectedIncident.status;
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === selectedIncident.id ? { ...incident, status: nextStatus } : incident,
      ),
    );
    syncIncident({ id: selectedIncident.id, status: nextStatus });
    addAudit(action, note, selectedIncident.id, previous, nextStatus);
  };

  const handleAssignTeam = (team: string) => {
    const previousTeam = selectedIncident.team;
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === selectedIncident.id ? { ...incident, team } : incident,
      ),
    );
    syncIncident({ id: selectedIncident.id, team });
    addAudit(
      "Response team assigned",
      `Suggested team changed from ${previousTeam} to ${team}; no dispatch occurred.`,
      selectedIncident.id,
      selectedIncident.status,
      selectedIncident.status,
    );
  };

  const handleModifyPlan = (actions: string[]) => {
    const synchronizedActions = actions.map((text, index) => ({
      text,
      owner: selectedIncident.actions[index]?.owner ?? "Safety supervisor",
      target: selectedIncident.actions[index]?.target ?? "Review",
      approval: true,
    }));
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === selectedIncident.id
          ? { ...incident, actions: synchronizedActions }
          : incident,
      ),
    );
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
              ownerRole:
                analysis.recommendation.recommendedActions[index]?.ownerRole ?? "Safety supervisor",
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
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === selectedIncident.id
          ? {
              ...incident,
              reports: Math.max(0, incident.reports - 1),
              evidence: incident.evidence.filter((item) => item.source !== sourceId),
              contradictoryEvidence: incident.contradictoryEvidence.filter(
                (item) => !item.sources.includes(sourceId),
              ),
            }
          : incident,
      ),
    );
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
            contradictions: analysis.recommendation.contradictions.filter(
              (item) => !item.sourceIds.includes(sourceId),
            ),
          },
        },
      };
    });
    addAudit(
      "Source report dismissed",
      `${sourceId} was marked incorrect after supervisor review; the append-only source record remains preserved.`,
      selectedIncident.id,
      selectedIncident.status,
      selectedIncident.status,
    );
  };

  const handleUpdateAnnouncement = (text: string) => {
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === selectedIncident.id
          ? { ...incident, announcement: { ...incident.announcement, text } }
          : incident,
      ),
    );
    setAnalysisByIncident((current) => {
      const analysis = current[selectedIncident.id];
      if (analysis?.status !== "available") return current;
      return {
        ...current,
        [selectedIncident.id]: {
          status: "available",
          recommendation: {
            ...analysis.recommendation,
            announcement: { ...analysis.recommendation.announcement, text },
          },
        },
      };
    });
    syncIncident({
      id: selectedIncident.id,
      announcement: { ...selectedIncident.announcement, text },
    });
  };

  const handleResolve = (incidentId: string, note: string) => {
    const target = incidents.find((incident) => incident.id === incidentId);
    if (!target) return;
    setIncidents((current) =>
      current.map((incident) =>
        incident.id === incidentId ? { ...incident, status: "Resolved" } : incident,
      ),
    );
    syncIncident({ id: incidentId, status: "Resolved" });
    addAudit("Incident resolved", note, incidentId, target.status, "Resolved");
  };

  const handleTelemetryImport = (normalizedRows: NormalizedImportRow[]) => {
    const latestByZone = new Map<string, NormalizedImportRow>();
    for (const row of normalizedRows) {
      const uiZoneId = UI_ZONE_BY_CANONICAL[String(row.zone_id ?? "")];
      if (uiZoneId) latestByZone.set(uiZoneId, row);
    }
    setZones((current) =>
      current.map((zone) => {
        const row = latestByZone.get(zone.id);
        if (!row) return zone;
        const occupancy = Number(row.occupancy);
        const capacity = Number(row.capacity);
        const inflow = Number(row.inflow_per_minute ?? 0);
        const outflow = Number(row.outflow_per_minute ?? 0);
        const occupancyPercent =
          Number.isFinite(occupancy) && Number.isFinite(capacity) && capacity > 0
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
          state:
            blocked || health !== "healthy"
              ? "degraded"
              : occupancyPercent >= 90
                ? "critical"
                : occupancyPercent >= 75
                  ? "watch"
                  : "stable",
          detail: `Validated import · ${String(row.timestamp ?? "timestamp unavailable")}`,
        };
      }),
    );
    const latestPhase = String(normalizedRows[normalizedRows.length - 1]?.event_phase ?? "");
    const phaseLabel = EVENT_PHASE_LABELS.find((item) => domainPhase(item) === latestPhase);
    if (phaseLabel) setPhase(phaseLabel);
  };

  const handleDirectReport = ({
    sourceId,
    text,
    recommendation,
  }: {
    sourceId: string;
    text: string;
    recommendation: AIRecommendation;
  }) => {
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
      type: recommendation.incidentType
        .replace("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase()),
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
      evidence: recommendation.evidence.length
        ? recommendation.evidence.map((item) => ({
            source: item.sourceId,
            fact: item.fact,
            weight: item.weight.toFixed(2),
            kind: "Direct report",
          }))
        : [{ source: sourceId, fact: text, weight: "0.50", kind: "Direct report" }],
      contradictoryEvidence: recommendation.contradictions.map((item) => ({
        sources: item.sourceIds.join(" · "),
        description: item.description,
        impact: item.operationalImpact,
      })),
      missing: recommendation.missingInformation,
      questions: recommendation.clarifyingQuestions,
      affectedZones: ["Location requires supervisor confirmation"],
      equipment: recommendation.equipment,
      actions: recommendation.recommendedActions.map((action) => ({
        text: action.action,
        owner: action.ownerRole,
        target: action.targetMinutes ? `${action.targetMinutes} min` : "Now",
        approval: true,
      })),
      route: {
        from: "Unassigned",
        path: ["Location confirmation required"],
        alternate: [],
        eta: "Pending",
        alternateEta: "Pending",
        avoided: [],
        saved: "—",
        rationale:
          "The deterministic route engine will run after a supervisor confirms the incident zone and response team.",
      },
      announcement: recommendation.announcement,
      uncertainty: recommendation.uncertaintyNote,
    };
    setIncidents((current) => [incident, ...current]);
    setAnalysisByIncident((current) => ({
      ...current,
      [incidentId]: { status: "available", recommendation },
    }));
    setSelectedId(incidentId);
    setView("command");
    addAudit(
      "Direct report added to queue",
      `${sourceId} was added for supervisor assessment; no dispatch occurred.`,
      incidentId,
      "—",
      "Awaiting approval",
    );
  };

  return {
    handleDecision,
    handleAssignTeam,
    handleModifyPlan,
    handleDismissReport,
    handleUpdateAnnouncement,
    handleResolve,
    handleTelemetryImport,
    handleDirectReport,
  };
}
