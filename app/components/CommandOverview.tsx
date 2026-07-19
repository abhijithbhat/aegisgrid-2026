"use client";

import type { Incident, Zone } from "./aegisData";
import type { SimulationState } from "./use-scenario-simulation";
import { formatEta } from "./operational-model";
import { Icon } from "./Icon";

interface CommandOverviewProps {
  simulation: SimulationState;
  topIncident: Incident;
  readiness: number;
  criticalCount: number;
  degradedZones: readonly Zone[];
  activeIncidents: readonly Incident[];
  averageEta?: number;
  responseEtaCount: number;
  zones: readonly Zone[];
  availableTeams: number;
  totalTeams: number;
  assignedTeams: number;
  overallOccupancy: number;
  estimatedAttendance: number;
  inboundRate: number;
  outboundRate: number;
  onSelectIncident: (incident: Incident) => void;
}

/** Presentational command summary; all calculations arrive from deterministic state. */
export function CommandOverview({
  simulation,
  topIncident,
  readiness,
  criticalCount,
  degradedZones,
  activeIncidents,
  averageEta,
  responseEtaCount,
  zones,
  availableTeams,
  totalTeams,
  assignedTeams,
  overallOccupancy,
  estimatedAttendance,
  inboundRate,
  outboundRate,
  onSelectIncident,
}: CommandOverviewProps) {
  const recentEvidence = topIncident.evidence[0];
  const maxAbsoluteFlow = Math.max(1, ...zones.map((zone) => Math.abs(zone.flow)));
  const approvalCount = activeIncidents.filter(
    (incident) => incident.status === "Awaiting approval",
  ).length;

  return (
    <>
      <div className="command-heading">
        <div>
          <div className="eyebrow">UNITY STADIUM · MATCH DAY 17 · SUPERVISOR VIEW</div>
          <h1>Live Command Center</h1>
          <p>See what needs attention now, why it matters, and what requires your approval.</p>
        </div>
        <div className="operational-state">
          <span className="state-signal">
            <i />
            <i />
            <i />
          </span>
          <div>
            <small>OPERATIONAL STATE</small>
            <strong>{simulation.running ? "Scenario running" : "Heightened monitoring"}</strong>
            <span>
              {simulation.running
                ? `${simulation.name} · ${simulation.event}`
                : "Risk, routing, and evidence systems online"}
            </span>
          </div>
        </div>
      </div>

      <section className="decision-brief" aria-labelledby="priority-focus-title">
        <article className="decision-incident">
          <div className="decision-label-row">
            <span className="priority-badge">
              <i />
              Priority 01
            </span>
            <span className="decision-incident-id mono">{topIncident.id}</span>
            <span className={`severity-badge ${topIncident.severity}`}>
              <i />
              {topIncident.severity}
            </span>
          </div>
          <span className="decision-kicker">Current decision focus</span>
          <h2 id="priority-focus-title">{topIncident.title}</h2>
          <p className="decision-summary">{topIncident.summary}</p>
          <dl className="decision-metrics">
            <div>
              <dt>Risk score</dt>
              <dd>
                {topIncident.risk}
                <span>/100</span>
              </dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>
                {topIncident.confidence}
                <span>%</span>
              </dd>
            </div>
            <div>
              <dt>Evidence</dt>
              <dd>
                {topIncident.reports}
                <span> reports</span>
              </dd>
            </div>
            <div>
              <dt>Conflicts</dt>
              <dd className={topIncident.contradictions ? "has-conflict" : ""}>
                {topIncident.contradictions}
                <span> open</span>
              </dd>
            </div>
          </dl>
        </article>
        <aside className="decision-action-card" aria-label="Recommended supervisor decision">
          <div className="decision-approval">
            <span>
              <Icon name="lock" size={14} />
            </span>
            <div>
              <strong>Supervisor decision required</strong>
              <small>Nothing is dispatched automatically</small>
            </div>
          </div>
          <span className="decision-action-label">Recommended next step</span>
          <h3>{topIncident.actions[0]?.text ?? "Continue monitored assessment"}</h3>
          <div className="decision-response-meta">
            <span>
              <Icon name="team" size={15} />
              {topIncident.team}
            </span>
            <span>
              <Icon name="route" size={15} />
              Safe-route ETA {topIncident.eta}
            </span>
          </div>
          <button
            type="button"
            className="decision-review-button"
            onClick={() => {
              onSelectIncident(topIncident);
              document
                .getElementById("incident-intelligence")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <span>Review evidence &amp; plan</span>
            <Icon name="chevron" size={16} />
          </button>
        </aside>
      </section>

      <section className="kpi-grid" aria-label="Live synthetic event metrics">
        <article className="kpi-card readiness-card">
          <div>
            <span className="metric-icon cyan">
              <Icon name="shield" size={19} />
            </span>
            <small>OPERATIONAL READINESS</small>
          </div>
          <div className="kpi-value">
            <strong>{readiness}</strong>
            <span>/100</span>
          </div>
          <div className="micro-progress">
            <i style={{ width: `${readiness}%` }} />
          </div>
          <footer>
            <span>{criticalCount} critical</span>
            <span>{degradedZones.length} degraded feeds</span>
          </footer>
        </article>
        <article className="kpi-card">
          <div>
            <span className="metric-icon amber">
              <Icon name="alert" size={19} />
            </span>
            <small>ACTIVE INCIDENTS</small>
          </div>
          <div className="kpi-value">
            <strong>{activeIncidents.length}</strong>
            <span className="kpi-unit">open</span>
          </div>
          <footer>
            <span className="critical-sub">
              <i />
              {criticalCount} critical
            </span>
            <span>{approvalCount} need approval</span>
          </footer>
        </article>
        <article className="kpi-card">
          <div>
            <span className="metric-icon blue">
              <Icon name="clock" size={19} />
            </span>
            <small>AVERAGE RESPONSE ETA</small>
          </div>
          <div className="kpi-value">
            <strong>{formatEta(averageEta)}</strong>
            <span className="kpi-unit">min</span>
          </div>
          <footer>
            <span>{responseEtaCount} routed incidents</span>
            <span>Dynamic route outputs</span>
          </footer>
        </article>
        <article className="kpi-card">
          <div>
            <span className="metric-icon muted">
              <Icon name="sensor" size={19} />
            </span>
            <small>DEGRADED SENSORS</small>
          </div>
          <div className="kpi-value">
            <strong>{degradedZones.length}</strong>
            <span className="kpi-unit">zones</span>
          </div>
          <footer>
            <span>{degradedZones.map((zone) => zone.short).join(" · ") || "None"}</span>
            <span>
              {zones.length - degradedZones.length} / {zones.length} zone feeds nominal
            </span>
          </footer>
        </article>
        <article className="kpi-card">
          <div>
            <span className="metric-icon green">
              <Icon name="team" size={19} />
            </span>
            <small>AVAILABLE TEAMS</small>
          </div>
          <div className="kpi-value">
            <strong>{availableTeams}</strong>
            <span className="kpi-unit">of {totalTeams}</span>
          </div>
          <footer>
            <span className="team-dots">
              {Array.from({ length: totalTeams }, (_, index) => (
                <i key={index} className={index >= availableTeams ? "busy" : ""} />
              ))}
            </span>
            <span>{assignedTeams} assigned</span>
          </footer>
        </article>
        <article className="kpi-card">
          <div>
            <span className="metric-icon violet">
              <Icon name="users" size={19} />
            </span>
            <small>VENUE OCCUPANCY</small>
          </div>
          <div className="kpi-value">
            <strong>{overallOccupancy}%</strong>
            <span className="kpi-unit">{(estimatedAttendance / 1000).toFixed(1)}k</span>
          </div>
          <footer>
            <span>+{inboundRate}/min in</span>
            <span>−{outboundRate}/min out</span>
          </footer>
        </article>
      </section>

      <section className="signal-strip" aria-label="Current operational signals">
        <article className="flow-readout">
          <span className="ribbon-icon">
            <Icon name="users" size={18} />
          </span>
          <div>
            <small>CROWD FLOW RIGHT NOW</small>
            <strong>
              +{inboundRate} <i>in</i> / −{outboundRate} <i>out</i> per minute
            </strong>
          </div>
          <span className="sparkline" aria-hidden="true">
            {zones.map((zone) => (
              <i
                key={zone.id}
                style={{
                  height: `${Math.max(12, Math.round((Math.abs(zone.flow) / maxAbsoluteFlow) * 100))}%`,
                }}
              />
            ))}
          </span>
        </article>
        <article className="recent-signal">
          <span className="ribbon-icon">
            <Icon name="radio" size={18} />
          </span>
          <div>
            <small>
              MOST URGENT EVIDENCE · {recentEvidence?.source ?? "NO SOURCE"} · {topIncident.age}
            </small>
            <strong>“{recentEvidence?.fact ?? "No active source report"}”</strong>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => onSelectIncident(topIncident)}
            aria-label="Open most urgent evidence"
          >
            <Icon name="chevron" size={16} />
          </button>
        </article>
      </section>
    </>
  );
}
