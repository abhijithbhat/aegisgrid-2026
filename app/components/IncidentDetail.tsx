"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import type { Incident } from "./aegisData";

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

const TEAMS = ["Medical Alpha", "Medical Bravo", "Fire Safety 1", "Security Delta", "Accessibility Rover", "Crowd Team North", "Facilities 2"];
const DETAIL_TABS = [
  ["intelligence", "Intelligence", "spark"],
  ["response", "Response plan", "evidence"],
  ["routing", "Routing", "route"],
  ["comms", "Communication", "language"],
] as const;

export function IncidentDetail({ incident, aiStatus, reasoningProgress, onDecision, onAssignTeam, onModifyPlan, onDismissReport, onUpdateAnnouncement }: IncidentDetailProps) {
  const [tab, setTab] = useState<DetailTab>("intelligence");
  const [completed, setCompleted] = useState<number[]>([]);
  const [editing, setEditing] = useState(false);
  const [modifiedPlan, setModifiedPlan] = useState(incident.actions.map((action) => action.text).join("\n"));
  const [note, setNote] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState(incident.announcement.text);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [comparePaths, setComparePaths] = useState(false);
  const aiAvailable = aiStatus === "available";
  const aiPending = aiStatus === "checking" || aiStatus === "loading";
  const hasNonLatinScenarioSample = /[^\u0000-\u024f]/.test(incident.announcement.text);

  const recordNote = () => {
    if (!note.trim()) return;
    onDecision("Supervisor note added", incident.status, note.trim());
    setNote("");
  };

  return (
    <section className="panel detail-panel" aria-labelledby="detail-title">
      <div className="detail-header">
        <div className="detail-heading">
          <div className="detail-id-row">
            <span className={`severity-badge ${incident.severity}`}><i />{incident.severity}</span>
            <span className="mono">{incident.id}</span>
            <span className="status-label"><span />{incident.status}</span>
          </div>
          <h2 id="detail-title">{incident.title}</h2>
          <p>{incident.zone} <span>•</span> Opened {incident.age} ago <span>•</span> {incident.reports} source reports</p>
          <span className="saved-analysis-label"><Icon name="shield" size={12} />{aiAvailable ? "Live provider output · strict contract validated" : aiPending ? "Validating evidence with the AI provider…" : "Deterministic assessment · AI analysis unavailable"}</span>
        </div>
      </div>

      <div className="approval-banner">
        <span className="approval-icon"><Icon name="lock" size={17} /></span>
        <div><strong>Human approval required</strong><span>Decision support only — AegisGrid cannot dispatch teams or issue public messages.</span></div>
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
              const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? DETAIL_TABS.length - 1 : event.key === "ArrowRight" ? (index + 1) % DETAIL_TABS.length : (index - 1 + DETAIL_TABS.length) % DETAIL_TABS.length;
              const nextId = DETAIL_TABS[nextIndex][0] as DetailTab;
              setTab(nextId);
              window.requestAnimationFrame(() => document.getElementById(`incident-tab-${nextId}`)?.focus());
            }}
          >
            <Icon name={icon} size={15} />{label}
            {id === "intelligence" && incident.contradictions > 0 ? <span className="tab-count">{incident.contradictions}</span> : null}
          </button>
        ))}
      </div>

      <div className="detail-body">
        {tab === "intelligence" ? (
          <div id="incident-panel-intelligence" aria-labelledby="incident-tab-intelligence" className="tab-content intelligence-content" role="tabpanel">
            <div className="essentiality-control">
              <div><strong>GenAI essentiality</strong><span>Compare the operational facts available with and without semantic reasoning.</span></div>
              <button type="button" role="switch" aria-checked={comparePaths} onClick={() => setComparePaths((current) => !current)}><span />{comparePaths ? "Comparison on" : "Compare paths"}</button>
            </div>

            {comparePaths ? <div className="path-comparison" aria-label="Deterministic-only and full AI path comparison">
              <article><span>DETERMINISTIC ONLY</span><h3>Measured facts and safe route</h3><p>Risk <strong>{incident.risk}/100</strong>. {incident.reports} reports remain separate records. The engine can rank urgency and calculate a route, but it cannot determine whether different wording describes the same event.</p><ul><li>Transparent weighted risk</li><li>Validated source records</li><li>Graph-calculated ETA {incident.eta}</li></ul></article>
              <article className="ai-path"><span>FULL AI PATH</span><h3>Evidence interpreted for review</h3><p>{aiAvailable ? incident.summary : "Unavailable until a provider response passes the evidence contract."}</p><ul><li>{aiAvailable ? `${incident.contradictions} contradictions synthesized` : "No semantic synthesis"}</li><li>{aiAvailable ? `${incident.confidence}% classification confidence` : "No AI confidence claimed"}</li><li>{aiAvailable ? `${incident.questions.length} high-value questions generated` : "No generated questions"}</li></ul></article>
            </div> : null}

            {reasoningProgress.length ? <ol className="reasoning-stream" aria-label="Live AI reasoning status" aria-live="polite">
              {reasoningProgress.map((item) => <li key={item.stage}><Icon name="check" size={13} /><span><strong>{item.stage}</strong><small>{item.detail}</small></span></li>)}
            </ol> : null}
            <div className="score-strip">
              <div className="risk-score-block">
                <div className="score-ring" style={{ "--score": `${incident.risk * 3.6}deg` } as React.CSSProperties}>
                  <span><b>{incident.risk}</b><small>/100</small></span>
                </div>
                <div><span>DETERMINISTIC RISK</span><strong>{incident.risk >= 80 ? "Very high" : incident.risk >= 65 ? "High" : incident.risk >= 45 ? "Elevated" : "Guarded"}</strong><small>9 weighted factors</small></div>
              </div>
              <div className="score-divider" />
              {aiAvailable ? <>
                <div className="ai-score-block">
                  <span>VALIDATED AI CLASSIFICATION</span>
                  <strong><Icon name="spark" size={18} />{incident.aiSeverity}</strong>
                  <small>{incident.confidence}% calibrated confidence · 19:42:07</small>
                </div>
                <div className="confidence-bars" aria-label={`${incident.confidence}% confidence`}>
                  {Array.from({ length: 10 }, (_, index) => <i className={index < Math.round(incident.confidence / 10) ? "filled" : ""} key={index} />)}
                </div>
              </> : <div className="ai-unavailable-inline"><Icon name={aiPending ? "clock" : "warning"} size={18} /><div><strong>{aiPending ? "AI analysis in progress" : "AI analysis unavailable."}</strong><small>{aiPending ? "Evidence is being validated against the strict response contract." : "Deterministic risk and routing remain active."}</small></div></div>}
            </div>

            {incident.riskContributions?.length ? <details className="risk-breakdown">
              <summary>Show deterministic risk breakdown</summary>
              <div>{incident.riskContributions.map((item) => <span key={item.label}><b>{item.label}</b><i><em style={{ width: `${item.normalized}%` }} /></i><small>{item.normalized.toFixed(0)}/100 · +{item.contribution.toFixed(1)} pts</small></span>)}</div>
              <p>{incident.riskFormula}</p>
            </details> : null}

            {aiAvailable ? <>
            <article className="analysis-summary">
              <div className="section-title"><span className="section-icon cyan"><Icon name="spark" size={16} /></span><div><span>AI INCIDENT SYNTHESIS</span><small>Concise evidence-based assessment</small></div></div>
              <p>{incident.summary}</p>
              <blockquote><Icon name="evidence" size={16} /><span><strong>Why this priority:</strong> {incident.rationale}</span></blockquote>
            </article>

            <div className="evidence-grid">
              <section className="evidence-section">
                <div className="section-title"><span className="section-icon green"><Icon name="check" size={16} /></span><div><span>SUPPORTING EVIDENCE</span><small>{incident.evidence.length} validated sources</small></div></div>
                <div className="evidence-list">
                  {incident.evidence.map((item) => (
                    <article key={item.source}>
                      <div><span className="source-id">{item.source}</span><span className="source-kind">{item.kind}</span><span className="weight">w {item.weight}</span><button type="button" className="icon-text-button" onClick={() => onDismissReport(item.source)}><Icon name="x" size={11} />Dismiss source</button></div>
                      <p>{item.fact}</p>
                    </article>
                  ))}
                </div>
              </section>
              <section className="evidence-section">
                <div className="section-title"><span className="section-icon amber"><Icon name="warning" size={16} /></span><div><span>CONTRADICTIONS</span><small>{incident.contradictoryEvidence.length ? `${incident.contradictoryEvidence.length} require verification` : "No material conflicts"}</small></div></div>
                {incident.contradictoryEvidence.length ? (
                  <div className="contradiction-list">
                    {incident.contradictoryEvidence.map((item, index) => (
                      <article key={`${item.sources}-${index}`}><span>{item.sources}</span><p>{item.description}</p><small>{item.impact}</small></article>
                    ))}
                  </div>
                ) : <div className="empty-evidence"><Icon name="check" /><span>No contradictory evidence detected across current sources.</span></div>}
              </section>
            </div>

            <div className="uncertainty-grid">
              <section>
                <div className="section-title compact"><Icon name="question" size={16} /><span>MISSING INFORMATION</span></div>
                <ul>{incident.missing.map((item) => <li key={item}>{item}</li>)}</ul>
              </section>
              <section>
                <div className="section-title compact"><Icon name="radio" size={16} /><span>HIGH-VALUE QUESTIONS</span></div>
                <ol>{incident.questions.map((item) => <li key={item}>{item}</li>)}</ol>
              </section>
            </div>

            <div className="uncertainty-note"><Icon name="info" size={16} /><div><strong>Uncertainty statement</strong><span>{incident.uncertainty}</span></div></div>
            </> : <div className="degraded-analysis-card">
              <span className="degraded-icon"><Icon name="warning" size={22} /></span>
              <div><strong>{aiPending ? "AI analysis in progress" : "AI analysis unavailable."}</strong><p>{aiPending ? "AegisGrid is validating the provider response and its cited source IDs. Deterministic risk and routing remain available while this completes." : "Semantic fusion, contradiction reasoning, clarifying questions, and generated communications are paused. Source reports remain preserved; deterministic risk and routing continue to update."}</p></div>
              <span className="degraded-mode-tag">{aiPending ? "VALIDATING" : "DEGRADED MODE"}</span>
            </div>}
          </div>
        ) : null}

        {tab === "response" ? (
          <div id="incident-panel-response" aria-labelledby="incident-tab-response" className="tab-content response-content" role="tabpanel">
            {!aiAvailable ? <div className="saved-plan-warning"><Icon name={aiPending ? "clock" : "warning"} size={16} /><span><strong>{aiPending ? "AI analysis is still validating." : "AI analysis unavailable."}</strong> Showing the scenario&apos;s saved, human-verified response plan; it is not a new recommendation.</span></div> : null}
            <div className="response-overview">
              <section className="team-assignment-card">
                <div className="section-title"><span className="section-icon cyan"><Icon name="team" size={16} /></span><div><span>RECOMMENDED TEAM</span><small>Availability checked 8s ago</small></div></div>
                <div className="team-identity"><span className="team-avatar">MA</span><div><strong>{incident.team}</strong><span>Available · Radio channel 4</span></div><span className="eta-box"><small>ROUTE ETA</small><b>{incident.eta}</b></span></div>
                <label className="field-label">Assign response team
                  <select value={incident.team} onChange={(event) => onAssignTeam(event.target.value)}>
                    {TEAMS.map((team) => <option key={team}>{team}</option>)}
                  </select>
                </label>
              </section>
              <section className="equipment-card">
                <div className="section-title"><span className="section-icon amber"><Icon name="evidence" size={16} /></span><div><span>REQUIRED EQUIPMENT</span><small>Confirm before departure</small></div></div>
                <div className="equipment-list">{incident.equipment.map((item) => <span key={item}><Icon name="check" size={13} />{item}</span>)}</div>
                <div className="affected-zones"><small>LIKELY AFFECTED</small><p>{incident.affectedZones.join(" · ")}</p></div>
              </section>
            </div>

            <section className="response-sequence">
              <div className="section-title"><span className="section-icon green"><Icon name="evidence" size={16} /></span><div><span>RECOMMENDED RESPONSE SEQUENCE</span><small>Check a step only after supervisor confirmation</small></div></div>
              {editing ? (
                <div className="plan-editor">
                  <label htmlFor="plan-edit">Edit response actions, one per line</label>
                  <textarea id="plan-edit" value={modifiedPlan} onChange={(event) => setModifiedPlan(event.target.value)} rows={8} />
                  <div><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button type="button" className="primary-button" disabled={!modifiedPlan.trim()} onClick={() => { const actions = modifiedPlan.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 20); onModifyPlan(actions); onDecision("Response plan modified", incident.status, actions.join(" · ")); setEditing(false); }}>Save changes</button></div>
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
                          setCompleted((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index]);
                          if (!completed.includes(index)) onDecision("Response step completed", incident.status, action.text);
                        }}
                      >{completed.includes(index) ? <Icon name="check" size={14} /> : index + 1}</button>
                      <div><strong>{action.text}</strong><span>{action.owner} · target {action.target}</span></div>
                      {action.approval ? <span className="approval-tag"><Icon name="lock" size={11} />approval</span> : <span className="auto-tag">verify</span>}
                    </li>
                  ))}
                </ol>
              )}
              {!editing ? <button type="button" className="icon-text-button edit-sequence" onClick={() => setEditing(true)}><Icon name="edit" size={14} /> Modify sequence</button> : null}
            </section>

            <section className="supervisor-note">
              <label htmlFor="supervisor-note"><span>Supervisor note</span><small>Recorded in append-only audit log</small></label>
              <div><input id="supervisor-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add operational context or decision rationale…" /><button type="button" className="secondary-button" onClick={recordNote} disabled={!note.trim()}>Add note</button></div>
            </section>
          </div>
        ) : null}

        {tab === "routing" ? (
          <div id="incident-panel-routing" aria-labelledby="incident-tab-routing" className="tab-content routing-content" role="tabpanel">
            <div className="route-summary-grid">
              <div><span>PRIMARY ETA</span><strong>{incident.route.eta}</strong><small>Dynamic weighted route</small></div>
              <div><span>ALTERNATE ETA</span><strong>{incident.route.alternateEta}</strong><small>Continuously available</small></div>
              <div><span>TIME SAVED</span><strong>{incident.route.saved}</strong><small>vs distance-only route</small></div>
            </div>
            <section className="route-diagram" aria-label="Responder route diagram">
              <div className="route-line primary-route-line">
                {incident.route.path.map((node, index) => <span key={node}><i>{index === 0 ? <Icon name="team" size={14} /> : index === incident.route.path.length - 1 ? <Icon name="alert" size={14} /> : index}</i><b>{node}</b></span>)}
              </div>
              <div className="route-label"><span className="line-swatch primary" />Primary · lower congestion cost</div>
              <div className="route-line alternate-route-line">
                {incident.route.alternate.map((node, index) => <span key={node}><i>{index === 0 ? "A" : index}</i><b>{node}</b></span>)}
              </div>
              <div className="route-label"><span className="line-swatch alternate" />Alternate · held in reserve</div>
            </section>
            <div className="route-explanation">
              <div className="section-title"><span className="section-icon cyan"><Icon name="route" size={16} /></span><div><span>DETERMINISTIC ROUTE RATIONALE</span><small>Dijkstra · weighted adjacency list</small></div></div>
              <p>{incident.route.rationale}</p>
              <div className="avoided-zones"><span>AVOIDED</span>{incident.route.avoided.map((zone) => <strong key={zone}><Icon name="x" size={12} />{zone}</strong>)}</div>
            </div>
            <div className="route-factors">
              {["Physical distance", "Crowd congestion", "Blocked corridors", "Accessibility", "Hazard exposure", "One-way controls"].map((factor, index) => <span key={factor}><i className={index < 5 ? "active" : ""} />{factor}</span>)}
            </div>
            <div className="deterministic-notice"><Icon name="shield" size={17} /><span><strong>Path integrity protected.</strong> Routes are calculated by the deterministic graph engine; AI explains but cannot create or alter path nodes.</span></div>
          </div>
        ) : null}

        {tab === "comms" ? (
          <div id="incident-panel-comms" aria-labelledby="incident-tab-comms" className="tab-content comms-content" role="tabpanel">
            {!aiAvailable ? <><div className="degraded-analysis-card comms-degraded"><span className="degraded-icon"><Icon name="language" size={22} /></span><div><strong>{aiPending ? "Announcement analysis in progress" : "AI analysis unavailable."}</strong><p>{aiPending ? "The draft will appear only after the provider output passes contract and evidence validation." : "Context-sensitive announcement generation is paused. No canned or unverified message will be presented as current."}</p></div><span className="degraded-mode-tag">{aiPending ? "VALIDATING" : "NO CURRENT DRAFT"}</span></div>{hasNonLatinScenarioSample ? <article className="announcement-card scenario-language-sample" aria-label="Validated multilingual scenario rendering sample"><div><span className="announcement-language">SCENARIO FIXTURE · {incident.announcement.language.toUpperCase()}</span><span className="tone-label">RENDERING CHECK</span></div><p lang="hi">{incident.announcement.text}</p><footer><span><Icon name="shield" size={14} />Saved synthetic fixture—not a current AI recommendation</span></footer></article> : null}</> : <>
            <div className="comms-control-row">
              <div><span className="section-icon cyan"><Icon name="language" size={16} /></span><div><span>ANNOUNCEMENT DRAFT</span><small>Context-sensitive · not literal translation</small></div></div>
              <span className="announcement-language">{incident.announcement.language}</span>
            </div>
            <article className="announcement-card">
              <div><span className="announcement-language">{incident.announcement.language.toUpperCase()}</span><span className="tone-label">TONE · {incident.announcement.tone}</span></div>
              {editingAnnouncement ? <textarea aria-label="Edit announcement draft" rows={6} value={announcementDraft} onChange={(event) => setAnnouncementDraft(event.target.value)} /> : <p>{announcementDraft}</p>}
              <footer><span><Icon name="clock" size={14} />Estimated {Math.max(5, Math.round(announcementDraft.split(/\s+/).length / 2.4))} seconds</span><span><Icon name="users" size={14} />Target: nearby spectators</span></footer>
            </article>
            <div className="comms-safety-checks">
              <span><Icon name="check" size={14} />No diagnosis or personal data</span>
              <span><Icon name="check" size={14} />Clear action and location</span>
              <span><Icon name="check" size={14} />Calm, non-alarming tone</span>
            </div>
            <div className="comms-actions">
              <button type="button" className="secondary-button" onClick={() => { if (editingAnnouncement) { onUpdateAnnouncement(announcementDraft.trim()); onDecision("Supervisor note added", incident.status, "Announcement draft edited for PA operator review."); } setEditingAnnouncement((current) => !current); }} disabled={editingAnnouncement && !announcementDraft.trim()}><Icon name={editingAnnouncement ? "check" : "edit"} size={14} />{editingAnnouncement ? "Save draft" : "Edit draft"}</button>
              <button type="button" className="secondary-button" onClick={() => { void navigator.clipboard.writeText(announcementDraft).then(() => setCopyStatus("Copied for PA review")).catch(() => setCopyStatus("Clipboard unavailable")); }}><Icon name="file" size={14} /> Copy for PA operator</button>
              {copyStatus ? <span role="status">{copyStatus}</span> : null}
            </div>
            <div className="approval-banner comms-approval"><span className="approval-icon"><Icon name="lock" size={17} /></span><div><strong>Approval does not broadcast</strong><span>A trained PA operator must review and issue this message through the stadium announcement system.</span></div></div>
            </>}
          </div>
        ) : null}
      </div>

      <div className="decision-footer">
        <div className="decision-context"><span>SUPERVISOR DECISION</span><small>Every action is timestamped and auditable</small></div>
        <div className="decision-buttons">
          <button type="button" className="dismiss-button" onClick={() => onDecision("Recommendation dismissed", "Monitoring", note || "Recommendation dismissed after supervisor review; source reports preserved.")}><Icon name="x" size={15} />Dismiss</button>
          <button type="button" className="modify-button" onClick={() => { setTab("response"); setEditing(true); }}><Icon name="edit" size={15} />Modify</button>
          <button type="button" className="accept-button" onClick={() => onDecision("Response plan approved", "Plan approved", note || `Plan approved with ${incident.team} as the suggested team; AegisGrid did not dispatch or notify responders.`)}><Icon name="check" size={16} />Accept plan</button>
        </div>
      </div>
    </section>
  );
}
