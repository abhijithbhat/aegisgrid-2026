"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import type { Incident } from "./aegisData";

type IncidentQueueProps = {
  incidents: Incident[];
  selectedId: string;
  onSelect: (incident: Incident) => void;
  pulseIncidentId?: string | null;
};

export function IncidentQueue({
  incidents,
  selectedId,
  onSelect,
  pulseIncidentId,
}: IncidentQueueProps) {
  const [showPolicy, setShowPolicy] = useState(false);
  return (
    <section id="incident-queue" className="panel queue-panel" aria-labelledby="queue-title">
      <div className="panel-head">
        <div>
          <div className="eyebrow">SYNTHETIC SCENARIO · MAX-HEAP PRIORITY</div>
          <h2 id="queue-title">Incident queue</h2>
        </div>
        <div className="queue-total">
          <strong>{incidents.length}</strong>
          <span>active</span>
        </div>
      </div>

      <div
        className="heap-visual"
        role="list"
        aria-label="Incidents ranked by operational priority"
      >
        {incidents.map((incident, index) => (
          <div
            className={`heap-node heap-level-${Math.floor(Math.log2(index + 1))}`}
            key={incident.id}
            role="listitem"
          >
            <span className="heap-index" aria-hidden="true">
              {index + 1}
            </span>
            <button
              type="button"
              className={`incident-card severity-${incident.severity}${selectedId === incident.id ? " is-active" : ""}${pulseIncidentId === incident.id ? " is-new-critical" : ""}`}
              onClick={() => onSelect(incident)}
              aria-pressed={selectedId === incident.id}
              aria-label={`Priority ${index + 1}: ${incident.title}, ${incident.severity}, ${incident.zone}`}
            >
              <span className="incident-priority-rail" />
              <span className="incident-card-top">
                <span className={`severity-badge ${incident.severity}`}>
                  <i />
                  {incident.severity}
                </span>
                <span className="incident-code">{incident.id}</span>
                <span className="incident-age">
                  <Icon name="clock" size={13} />
                  {incident.age}
                </span>
              </span>
              <strong className="incident-title">{incident.title}</strong>
              <span className="incident-zone">
                {incident.type} · {incident.zone}
              </span>
              <span className="incident-score-row">
                <span>
                  <small>risk</small>
                  <b>{incident.risk}</b>
                </span>
                <span>
                  <small>confidence</small>
                  <b>{incident.confidence}%</b>
                </span>
                <span>
                  <small>reports</small>
                  <b>{incident.reports}</b>
                </span>
                <span className={incident.contradictions ? "has-conflict" : ""}>
                  <small>conflicts</small>
                  <b>{incident.contradictions}</b>
                </span>
              </span>
              <span className="incident-card-bottom">
                <span className="team-line">
                  <Icon name="headset" size={14} />
                  {incident.team}
                </span>
                <span className="eta-line">ETA {incident.eta}</span>
                <Icon name="chevron" size={15} />
              </span>
            </button>
          </div>
        ))}
      </div>

      <div className="queue-footer">
        <span>
          <Icon name="info" size={14} />
          Binary max-heap · insert O(log n) · extract O(log n)
        </span>
        <button
          type="button"
          className="icon-text-button"
          aria-expanded={showPolicy}
          aria-controls="queue-policy"
          onClick={() => setShowPolicy((current) => !current)}
        >
          <Icon name="filter" size={14} /> Queue policy
        </button>
      </div>
      {showPolicy ? (
        <div id="queue-policy" className="queue-policy-note">
          <strong>Deterministic queue policy</strong>
          <span>
            Risk score, numeric severity, evidence count, contradictions, and approval state are
            ranked by a binary max-heap. AI prose and recommendations cannot set queue order.
          </span>
        </div>
      ) : null}
    </section>
  );
}
