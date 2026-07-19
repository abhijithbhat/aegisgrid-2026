"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { Incident } from "./aegisData";
import { Icon } from "./Icon";

const TEAMS = [
  "Medical Alpha",
  "Medical Bravo",
  "Fire Safety 1",
  "Security Delta",
  "Accessibility Rover",
  "Crowd Team North",
  "Facilities 2",
];

interface IncidentResponsePanelProps {
  incident: Incident;
  aiAvailable: boolean;
  aiPending: boolean;
  editing: boolean;
  setEditing: Dispatch<SetStateAction<boolean>>;
  note: string;
  setNote: Dispatch<SetStateAction<string>>;
  onDecision: (action: string, nextStatus: Incident["status"], note: string) => void;
  onAssignTeam: (team: string) => void;
  onModifyPlan: (actions: string[]) => void;
}

export function IncidentResponsePanel({
  incident,
  aiAvailable,
  aiPending,
  editing,
  setEditing,
  note,
  setNote,
  onDecision,
  onAssignTeam,
  onModifyPlan,
}: IncidentResponsePanelProps) {
  const [completed, setCompleted] = useState<number[]>([]);
  const [modifiedPlan, setModifiedPlan] = useState(
    incident.actions.map((action) => action.text).join("\n"),
  );

  const recordNote = () => {
    if (!note.trim()) return;
    onDecision("Supervisor note added", incident.status, note.trim());
    setNote("");
  };

  return (
    <div
      id="incident-panel-response"
      aria-labelledby="incident-tab-response"
      className="tab-content response-content"
      role="tabpanel"
    >
      {!aiAvailable ? (
        <div className="saved-plan-warning">
          <Icon name={aiPending ? "clock" : "warning"} size={16} />
          <span>
            <strong>
              {aiPending ? "AI analysis is still validating." : "AI analysis unavailable."}
            </strong>{" "}
            Showing the scenario&apos;s saved, human-verified response plan; it is not a new
            recommendation.
          </span>
        </div>
      ) : null}
      <div className="response-overview">
        <section className="team-assignment-card">
          <div className="section-title">
            <span className="section-icon cyan">
              <Icon name="team" size={16} />
            </span>
            <div>
              <span>RECOMMENDED TEAM</span>
              <small>Availability checked 8s ago</small>
            </div>
          </div>
          <div className="team-identity">
            <span className="team-avatar">MA</span>
            <div>
              <strong>{incident.team}</strong>
              <span>Available · Radio channel 4</span>
            </div>
            <span className="eta-box">
              <small>ROUTE ETA</small>
              <b>{incident.eta}</b>
            </span>
          </div>
          <label className="field-label">
            Assign response team
            <select value={incident.team} onChange={(event) => onAssignTeam(event.target.value)}>
              {TEAMS.map((team) => (
                <option key={team}>{team}</option>
              ))}
            </select>
          </label>
        </section>
        <section className="equipment-card">
          <div className="section-title">
            <span className="section-icon amber">
              <Icon name="evidence" size={16} />
            </span>
            <div>
              <span>REQUIRED EQUIPMENT</span>
              <small>Confirm before departure</small>
            </div>
          </div>
          <div className="equipment-list">
            {incident.equipment.map((item) => (
              <span key={item}>
                <Icon name="check" size={13} />
                {item}
              </span>
            ))}
          </div>
          <div className="affected-zones">
            <small>LIKELY AFFECTED</small>
            <p>{incident.affectedZones.join(" · ")}</p>
          </div>
        </section>
      </div>

      <section className="response-sequence">
        <div className="section-title">
          <span className="section-icon green">
            <Icon name="evidence" size={16} />
          </span>
          <div>
            <span>RECOMMENDED RESPONSE SEQUENCE</span>
            <small>Check a step only after supervisor confirmation</small>
          </div>
        </div>
        {editing ? (
          <div className="plan-editor">
            <label htmlFor="plan-edit">Edit response actions, one per line</label>
            <textarea
              id="plan-edit"
              value={modifiedPlan}
              onChange={(event) => setModifiedPlan(event.target.value)}
              rows={8}
            />
            <div>
              <button type="button" className="secondary-button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!modifiedPlan.trim()}
                onClick={() => {
                  const actions = modifiedPlan
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .slice(0, 20);
                  onModifyPlan(actions);
                  onDecision("Response plan modified", incident.status, actions.join(" · "));
                  setEditing(false);
                }}
              >
                Save changes
              </button>
            </div>
          </div>
        ) : (
          <ol className="action-sequence">
            {incident.actions.map((action, index) => (
              <li key={action.text} className={completed.includes(index) ? "is-complete" : ""}>
                <button
                  type="button"
                  className="action-check"
                  aria-label={`${completed.includes(index) ? "Mark incomplete" : "Mark complete"}: ${action.text}`}
                  onClick={() => {
                    setCompleted((current) =>
                      current.includes(index)
                        ? current.filter((item) => item !== index)
                        : [...current, index],
                    );
                    if (!completed.includes(index)) {
                      onDecision("Response step completed", incident.status, action.text);
                    }
                  }}
                >
                  {completed.includes(index) ? <Icon name="check" size={14} /> : index + 1}
                </button>
                <div>
                  <strong>{action.text}</strong>
                  <span>
                    {action.owner} · target {action.target}
                  </span>
                </div>
                {action.approval ? (
                  <span className="approval-tag">
                    <Icon name="lock" size={11} />
                    approval
                  </span>
                ) : (
                  <span className="auto-tag">verify</span>
                )}
              </li>
            ))}
          </ol>
        )}
        {!editing ? (
          <button
            type="button"
            className="icon-text-button edit-sequence"
            onClick={() => setEditing(true)}
          >
            <Icon name="edit" size={14} /> Modify sequence
          </button>
        ) : null}
      </section>

      <section className="supervisor-note">
        <label htmlFor="supervisor-note">
          <span>Supervisor note</span>
          <small>Recorded in append-only audit log</small>
        </label>
        <div>
          <input
            id="supervisor-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add operational context or decision rationale…"
          />
          <button
            type="button"
            className="secondary-button"
            onClick={recordNote}
            disabled={!note.trim()}
          >
            Add note
          </button>
        </div>
      </section>
    </div>
  );
}
