"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import type { Incident } from "./aegisData";
import { IncidentCommunicationPanel } from "./IncidentCommunicationPanel";
import { IncidentIntelligencePanel } from "./IncidentIntelligencePanel";
import { IncidentResponsePanel } from "./IncidentResponsePanel";
import { IncidentRoutingPanel } from "./IncidentRoutingPanel";

type DetailTab = "intelligence" | "response" | "routing" | "comms";

type IncidentDetailProps = {
  incident: Incident;
  aiStatus: "checking" | "loading" | "available" | "unavailable";
  reasoningProgress: { stage: string; detail: string }[];
  onDecision: (action: string, nextStatus: Incident["status"], note: string) => void;
  onAssignTeam: (team: string) => void;
  onModifyPlan: (actions: string[]) => void;
  onDismissReport: (sourceId: string) => void;
  onUpdateAnnouncement: (text: string) => void;
};

const DETAIL_TABS = [
  ["intelligence", "Intelligence", "spark"],
  ["response", "Response plan", "evidence"],
  ["routing", "Routing", "route"],
  ["comms", "Communication", "language"],
] as const;

export function IncidentDetail({
  incident,
  aiStatus,
  reasoningProgress,
  onDecision,
  onAssignTeam,
  onModifyPlan,
  onDismissReport,
  onUpdateAnnouncement,
}: IncidentDetailProps) {
  const [tab, setTab] = useState<DetailTab>("intelligence");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const aiAvailable = aiStatus === "available";
  const aiPending = aiStatus === "checking" || aiStatus === "loading";

  return (
    <section className="panel detail-panel" aria-labelledby="detail-title">
      <div className="detail-header">
        <div className="detail-heading">
          <div className="detail-id-row">
            <span className={`severity-badge ${incident.severity}`}>
              <i />
              {incident.severity}
            </span>
            <span className="mono">{incident.id}</span>
            <span className="status-label">
              <span />
              {incident.status}
            </span>
          </div>
          <h2 id="detail-title">{incident.title}</h2>
          <p>
            {incident.zone} <span>•</span> Opened {incident.age} ago <span>•</span>{" "}
            {incident.reports} source reports
          </p>
          <span className="saved-analysis-label">
            <Icon name="shield" size={12} />
            {aiAvailable
              ? "Live provider output · strict contract validated"
              : aiPending
                ? "Validating evidence with the AI provider…"
                : "Deterministic assessment · AI analysis unavailable"}
          </span>
        </div>
      </div>

      <div className="approval-banner">
        <span className="approval-icon">
          <Icon name="lock" size={17} />
        </span>
        <div>
          <strong>Human approval required</strong>
          <span>
            Decision support only — AegisGrid cannot dispatch teams or issue public messages.
          </span>
        </div>
        <span className="model-version">AI contract 1.0</span>
      </div>

      <div className="detail-tabs" role="tablist" aria-label="Incident detail sections">
        {DETAIL_TABS.map(([id, label, icon], index) => (
          <button
            key={id}
            id={`incident-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`incident-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? "is-active" : ""}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? DETAIL_TABS.length - 1
                    : event.key === "ArrowRight"
                      ? (index + 1) % DETAIL_TABS.length
                      : (index - 1 + DETAIL_TABS.length) % DETAIL_TABS.length;
              const nextId = DETAIL_TABS[nextIndex][0] as DetailTab;
              setTab(nextId);
              window.requestAnimationFrame(() =>
                document.getElementById(`incident-tab-${nextId}`)?.focus(),
              );
            }}
          >
            <Icon name={icon} size={15} />
            {label}
            {id === "intelligence" && incident.contradictions > 0 ? (
              <span className="tab-count">{incident.contradictions}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="detail-body">
        {tab === "intelligence" ? (
          <IncidentIntelligencePanel
            incident={incident}
            aiAvailable={aiAvailable}
            aiPending={aiPending}
            reasoningProgress={reasoningProgress}
            onDismissReport={onDismissReport}
          />
        ) : null}

        {tab === "response" ? (
          <IncidentResponsePanel
            incident={incident}
            aiAvailable={aiAvailable}
            aiPending={aiPending}
            editing={editing}
            setEditing={setEditing}
            note={note}
            setNote={setNote}
            onDecision={onDecision}
            onAssignTeam={onAssignTeam}
            onModifyPlan={onModifyPlan}
          />
        ) : null}

        {tab === "routing" ? <IncidentRoutingPanel incident={incident} /> : null}

        {tab === "comms" ? (
          <IncidentCommunicationPanel
            incident={incident}
            aiAvailable={aiAvailable}
            aiPending={aiPending}
            onDecision={onDecision}
            onUpdateAnnouncement={onUpdateAnnouncement}
          />
        ) : null}
      </div>

      <div className="decision-footer">
        <div className="decision-context">
          <span>SUPERVISOR DECISION</span>
          <small>Every action is timestamped and auditable</small>
        </div>
        <div className="decision-buttons">
          <button
            type="button"
            className="dismiss-button"
            onClick={() =>
              onDecision(
                "Recommendation dismissed",
                "Monitoring",
                note ||
                  "Recommendation dismissed after supervisor review; source reports preserved.",
              )
            }
          >
            <Icon name="x" size={15} />
            Dismiss
          </button>
          <button
            type="button"
            className="modify-button"
            onClick={() => {
              setTab("response");
              setEditing(true);
            }}
          >
            <Icon name="edit" size={15} />
            Modify
          </button>
          <button
            type="button"
            className="accept-button"
            onClick={() =>
              onDecision(
                "Response plan approved",
                "Plan approved",
                note ||
                  `Plan approved with ${incident.team} as the suggested team; AegisGrid did not dispatch or notify responders.`,
              )
            }
          >
            <Icon name="check" size={16} />
            Accept plan
          </button>
        </div>
      </div>
    </section>
  );
}
