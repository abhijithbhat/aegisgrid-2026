"use client";

import { useState } from "react";
import type { Incident } from "./aegisData";
import { Icon } from "./Icon";

interface IncidentCommunicationPanelProps {
  incident: Incident;
  aiAvailable: boolean;
  aiPending: boolean;
  onDecision: (action: string, nextStatus: Incident["status"], note: string) => void;
  onUpdateAnnouncement: (text: string) => void;
}

export function IncidentCommunicationPanel({
  incident,
  aiAvailable,
  aiPending,
  onDecision,
  onUpdateAnnouncement,
}: IncidentCommunicationPanelProps) {
  const [announcementDraft, setAnnouncementDraft] = useState(incident.announcement.text);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const hasNonLatinScenarioSample = /[^\u0000-\u024f]/.test(incident.announcement.text);

  return (
    <div
      id="incident-panel-comms"
      aria-labelledby="incident-tab-comms"
      className="tab-content comms-content"
      role="tabpanel"
    >
      {!aiAvailable ? (
        <>
          <div className="degraded-analysis-card comms-degraded">
            <span className="degraded-icon">
              <Icon name="language" size={22} />
            </span>
            <div>
              <strong>
                {aiPending ? "Announcement analysis in progress" : "AI analysis unavailable."}
              </strong>
              <p>
                {aiPending
                  ? "The draft will appear only after the provider output passes contract and evidence validation."
                  : "Context-sensitive announcement generation is paused. No canned or unverified message will be presented as current."}
              </p>
            </div>
            <span className="degraded-mode-tag">
              {aiPending ? "VALIDATING" : "NO CURRENT DRAFT"}
            </span>
          </div>
          {hasNonLatinScenarioSample ? (
            <article
              className="announcement-card scenario-language-sample"
              aria-label="Validated multilingual scenario rendering sample"
            >
              <div>
                <span className="announcement-language">
                  SCENARIO FIXTURE · {incident.announcement.language.toUpperCase()}
                </span>
                <span className="tone-label">RENDERING CHECK</span>
              </div>
              <p lang="hi">{incident.announcement.text}</p>
              <footer>
                <span>
                  <Icon name="shield" size={14} />
                  Saved synthetic fixture—not a current AI recommendation
                </span>
              </footer>
            </article>
          ) : null}
        </>
      ) : (
        <>
          <div className="comms-control-row">
            <div>
              <span className="section-icon cyan">
                <Icon name="language" size={16} />
              </span>
              <div>
                <span>ANNOUNCEMENT DRAFT</span>
                <small>Context-sensitive · not literal translation</small>
              </div>
            </div>
            <span className="announcement-language">{incident.announcement.language}</span>
          </div>
          <article className="announcement-card">
            <div>
              <span className="announcement-language">
                {incident.announcement.language.toUpperCase()}
              </span>
              <span className="tone-label">TONE · {incident.announcement.tone}</span>
            </div>
            {editingAnnouncement ? (
              <textarea
                aria-label="Edit announcement draft"
                rows={6}
                value={announcementDraft}
                onChange={(event) => setAnnouncementDraft(event.target.value)}
              />
            ) : (
              <p>{announcementDraft}</p>
            )}
            <footer>
              <span>
                <Icon name="clock" size={14} />
                Estimated {Math.max(
                  5,
                  Math.round(announcementDraft.split(/\s+/).length / 2.4),
                )}{" "}
                seconds
              </span>
              <span>
                <Icon name="users" size={14} />
                Target: nearby spectators
              </span>
            </footer>
          </article>
          <div className="comms-safety-checks">
            <span>
              <Icon name="check" size={14} />
              No diagnosis or personal data
            </span>
            <span>
              <Icon name="check" size={14} />
              Clear action and location
            </span>
            <span>
              <Icon name="check" size={14} />
              Calm, non-alarming tone
            </span>
          </div>
          <div className="comms-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                if (editingAnnouncement) {
                  onUpdateAnnouncement(announcementDraft.trim());
                  onDecision(
                    "Supervisor note added",
                    incident.status,
                    "Announcement draft edited for PA operator review.",
                  );
                }
                setEditingAnnouncement((current) => !current);
              }}
              disabled={editingAnnouncement && !announcementDraft.trim()}
            >
              <Icon name={editingAnnouncement ? "check" : "edit"} size={14} />
              {editingAnnouncement ? "Save draft" : "Edit draft"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(announcementDraft)
                  .then(() => setCopyStatus("Copied for PA review"))
                  .catch(() => setCopyStatus("Clipboard unavailable"));
              }}
            >
              <Icon name="file" size={14} /> Copy for PA operator
            </button>
            {copyStatus ? <span role="status">{copyStatus}</span> : null}
          </div>
          <div className="approval-banner comms-approval">
            <span className="approval-icon">
              <Icon name="lock" size={17} />
            </span>
            <div>
              <strong>Approval does not broadcast</strong>
              <span>
                A trained PA operator must review and issue this message through the stadium
                announcement system.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
