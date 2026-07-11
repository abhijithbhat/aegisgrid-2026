"use client";

import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import type { AuditEvent, Incident } from "./aegisData";

type AuditViewProps = {
  events: AuditEvent[];
  incidents: Incident[];
  persistence: "checking" | "firestore" | "memory" | "error";
  onResolve: (incidentId: string, note: string) => void;
};

export function AuditView({ events, incidents, persistence, onResolve }: AuditViewProps) {
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState("All actors");
  const [incidentId, setIncidentId] = useState(incidents[0]?.id ?? "");
  const [resolutionNote, setResolutionNote] = useState("");

  const filtered = useMemo(() => events.filter((event) => {
    const text = `${event.action} ${event.incident} ${event.note} ${event.actor}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (actor === "All actors" || event.actor === actor);
  }), [events, query, actor]);

  const actors = ["All actors", ...Array.from(new Set(events.map((event) => event.actor)))];

  const exportLog = () => {
    const href = URL.createObjectURL(new Blob([JSON.stringify(events, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = "aegisgrid-audit-log.json";
    link.click();
    URL.revokeObjectURL(href);
  };

  return (
    <main className="workspace-view audit-view">
      <div className="view-heading">
        <div><div className="eyebrow">APPEND-ONLY DECISION RECORD</div><h1>Action & Audit</h1><p>Review every human and system action without storing hidden model reasoning.</p></div>
        <button type="button" className="secondary-button" onClick={exportLog}><Icon name="download" size={15} />Export audit log</button>
      </div>

      <div className="audit-kpis">
        <article><span className="metric-icon cyan"><Icon name="audit" size={18} /></span><div><small>RECORDED EVENTS</small><strong>{String(events.length).padStart(2, "0")}</strong><span>Current session</span></div></article>
        <article><span className="metric-icon green"><Icon name="check" size={18} /></span><div><small>HUMAN DECISIONS</small><strong>{events.filter((event) => event.actor === "Safety Supervisor").length}</strong><span>Supervisor confirmed</span></div></article>
        <article><span className="metric-icon amber"><Icon name="lock" size={18} /></span><div><small>PENDING APPROVAL</small><strong>{incidents.filter((incident) => incident.status === "Awaiting approval").length}</strong><span>Action required</span></div></article>
        <article><span className="metric-icon blue"><Icon name="shield" size={18} /></span><div><small>AUDIT STORAGE</small><strong>{persistence === "firestore" ? "DURABLE" : persistence === "memory" ? "SESSION" : persistence === "checking" ? "CHECK" : "LOCAL"}</strong><span>{persistence === "firestore" ? "Firestore create-only events" : persistence === "error" ? "Server write unavailable" : "Append-only demo session"}</span></div></article>
      </div>

      <div className="audit-layout">
        <section className="panel audit-log-panel">
          <div className="panel-head audit-log-head">
            <div><div className="eyebrow">CHRONOLOGICAL EVENT STREAM</div><h2>Decision ledger</h2></div>
            <div className="audit-filters">
              <label className="search-field"><Icon name="search" size={14} /><span className="sr-only">Search audit log</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search event or incident" /></label>
              <label><span className="sr-only">Filter by actor</span><select value={actor} onChange={(event) => setActor(event.target.value)}>{actors.map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
          </div>
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead><tr><th>Time</th><th>Actor / role</th><th>Action</th><th>Incident</th><th>State transition</th><th>Note</th><th>Recommendation version</th></tr></thead>
              <tbody>
                {filtered.map((event) => (
                  <tr key={event.id}>
                    <td><span className="mono">{event.timestamp}</span></td>
                    <td><span className={`actor-icon ${event.actor === "Safety Supervisor" ? "human" : "system"}`}>{event.actor === "Safety Supervisor" ? "SS" : <Icon name={event.actor.includes("Routing") ? "route" : event.actor.includes("Fusion") ? "spark" : "shield"} size={14} />}</span><strong>{event.actor}</strong></td>
                    <td><strong>{event.action}</strong></td>
                    <td><span className="audit-incident">{event.incident}</span></td>
                    <td><span className="state-transition"><span>{event.previous}</span><Icon name="chevron" size={12} /><strong>{event.next}</strong></span></td>
                    <td>{event.note}</td>
                    <td><span className="version-text">{event.version}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length ? <div className="empty-audit"><Icon name="search" size={22} /><span>No events match this filter.</span></div> : null}
          </div>
          <footer className="audit-log-footer"><span><Icon name="lock" size={13} />Events cannot be edited or deleted in this workflow</span><span>Showing {filtered.length} of {events.length}</span></footer>
        </section>

        <aside className="audit-sidebar">
          <section className="panel resolution-card">
            <div className="panel-head"><div><div className="eyebrow">HUMAN WORKFLOW</div><h2>Resolve incident</h2></div></div>
            <p>Resolution requires a supervisor-authored outcome note. This does not delete source reports.</p>
            <label className="field-label">Incident
              <select value={incidentId} onChange={(event) => setIncidentId(event.target.value)}>{incidents.filter((incident) => incident.status !== "Resolved" && incident.status !== "Dismissed").map((incident) => <option value={incident.id} key={incident.id}>{incident.id} · {incident.title}</option>)}</select>
            </label>
            <label className="field-label">Resolution note
              <textarea rows={5} value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} placeholder="Describe the verified outcome and any follow-up…" />
            </label>
            <button type="button" className="primary-button full-button" disabled={!incidentId || resolutionNote.trim().length < 8} onClick={() => { onResolve(incidentId, resolutionNote.trim()); setResolutionNote(""); }}><Icon name="check" size={15} />Mark resolved</button>
            <small className="resolution-hint"><Icon name="info" size={13} />Minimum 8 characters · recorded with actor and version</small>
          </section>

          <section className="panel audit-policy-card">
            <div className="section-title"><span className="section-icon green"><Icon name="shield" size={16} /></span><div><span>AUDIT POLICY</span><small>What is and is not retained</small></div></div>
            <ul>
              <li><Icon name="check" size={13} />Timestamps and actor roles</li>
              <li><Icon name="check" size={13} />State transitions and supervisor notes</li>
              <li><Icon name="check" size={13} />Recommendation and route versions</li>
              <li className="excluded"><Icon name="x" size={13} />No hidden reasoning or chain-of-thought</li>
              <li className="excluded"><Icon name="x" size={13} />No personal or biometric identifiers</li>
            </ul>
          </section>

          <section className="audit-integrity-card">
            <span className="integrity-shield"><Icon name="shield" size={24} /></span>
            <div><strong>Decision-support boundary intact</strong><p>No recorded action claims autonomous dispatch, diagnosis, or public broadcast.</p></div>
          </section>
        </aside>
      </div>
    </main>
  );
}
