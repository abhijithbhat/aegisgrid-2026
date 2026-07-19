"use client";

import { useState, type CSSProperties } from "react";
import type { Incident } from "./aegisData";
import { Icon } from "./Icon";

interface IncidentIntelligencePanelProps {
  incident: Incident;
  aiAvailable: boolean;
  aiPending: boolean;
  reasoningProgress: { stage: string; detail: string }[];
  onDismissReport: (sourceId: string) => void;
}

export function IncidentIntelligencePanel({
  incident,
  aiAvailable,
  aiPending,
  reasoningProgress,
  onDismissReport,
}: IncidentIntelligencePanelProps) {
  const [comparePaths, setComparePaths] = useState(false);

  return (
    <div
      id="incident-panel-intelligence"
      aria-labelledby="incident-tab-intelligence"
      className="tab-content intelligence-content"
      role="tabpanel"
    >
      <div className="essentiality-control">
        <div>
          <strong>GenAI essentiality</strong>
          <span>Compare the operational facts available with and without semantic reasoning.</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={comparePaths}
          onClick={() => setComparePaths((current) => !current)}
        >
          <span />
          {comparePaths ? "Comparison on" : "Compare paths"}
        </button>
      </div>

      {comparePaths ? (
        <div
          className="path-comparison"
          aria-label="Deterministic-only and full AI path comparison"
        >
          <article>
            <span>DETERMINISTIC ONLY</span>
            <h3>Measured facts and safe route</h3>
            <p>
              Risk <strong>{incident.risk}/100</strong>. {incident.reports} reports remain separate
              records. The engine can rank urgency and calculate a route, but it cannot determine
              whether different wording describes the same event.
            </p>
            <ul>
              <li>Transparent weighted risk</li>
              <li>Validated source records</li>
              <li>Graph-calculated ETA {incident.eta}</li>
            </ul>
          </article>
          <article className="ai-path">
            <span>FULL AI PATH</span>
            <h3>Evidence interpreted for review</h3>
            <p>
              {aiAvailable
                ? incident.summary
                : "Unavailable until a provider response passes the evidence contract."}
            </p>
            <ul>
              <li>
                {aiAvailable
                  ? `${incident.contradictions} contradictions synthesized`
                  : "No semantic synthesis"}
              </li>
              <li>
                {aiAvailable
                  ? `${incident.confidence}% classification confidence`
                  : "No AI confidence claimed"}
              </li>
              <li>
                {aiAvailable
                  ? `${incident.questions.length} high-value questions generated`
                  : "No generated questions"}
              </li>
            </ul>
          </article>
        </div>
      ) : null}

      {reasoningProgress.length ? (
        <ol className="reasoning-stream" aria-label="Live AI reasoning status" aria-live="polite">
          {reasoningProgress.map((item) => (
            <li key={item.stage}>
              <Icon name="check" size={13} />
              <span>
                <strong>{item.stage}</strong>
                <small>{item.detail}</small>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="score-strip">
        <div className="risk-score-block">
          <div
            className="score-ring"
            style={{ "--score": `${incident.risk * 3.6}deg` } as CSSProperties}
          >
            <span>
              <b>{incident.risk}</b>
              <small>/100</small>
            </span>
          </div>
          <div>
            <span>DETERMINISTIC RISK</span>
            <strong>
              {incident.risk >= 80
                ? "Very high"
                : incident.risk >= 65
                  ? "High"
                  : incident.risk >= 45
                    ? "Elevated"
                    : "Guarded"}
            </strong>
            <small>9 weighted factors</small>
          </div>
        </div>
        <div className="score-divider" />
        {aiAvailable ? (
          <>
            <div className="ai-score-block">
              <span>VALIDATED AI CLASSIFICATION</span>
              <strong>
                <Icon name="spark" size={18} />
                {incident.aiSeverity}
              </strong>
              <small>{incident.confidence}% calibrated confidence · 19:42:07</small>
            </div>
            <div className="confidence-bars" aria-label={`${incident.confidence}% confidence`}>
              {Array.from({ length: 10 }, (_, index) => (
                <i
                  className={index < Math.round(incident.confidence / 10) ? "filled" : ""}
                  key={index}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="ai-unavailable-inline">
            <Icon name={aiPending ? "clock" : "warning"} size={18} />
            <div>
              <strong>{aiPending ? "AI analysis in progress" : "AI analysis unavailable."}</strong>
              <small>
                {aiPending
                  ? "Evidence is being validated against the strict response contract."
                  : "Deterministic risk and routing remain active."}
              </small>
            </div>
          </div>
        )}
      </div>

      {incident.riskContributions?.length ? (
        <details className="risk-breakdown">
          <summary>Show deterministic risk breakdown</summary>
          <div>
            {incident.riskContributions.map((item) => (
              <span key={item.label}>
                <b>{item.label}</b>
                <i>
                  <em style={{ width: `${item.normalized}%` }} />
                </i>
                <small>
                  {item.normalized.toFixed(0)}/100 · +{item.contribution.toFixed(1)} pts
                </small>
              </span>
            ))}
          </div>
          <p>{incident.riskFormula}</p>
        </details>
      ) : null}

      {aiAvailable ? (
        <>
          <article className="analysis-summary">
            <div className="section-title">
              <span className="section-icon cyan">
                <Icon name="spark" size={16} />
              </span>
              <div>
                <span>AI INCIDENT SYNTHESIS</span>
                <small>Concise evidence-based assessment</small>
              </div>
            </div>
            <p>{incident.summary}</p>
            <blockquote>
              <Icon name="evidence" size={16} />
              <span>
                <strong>Why this priority:</strong> {incident.rationale}
              </span>
            </blockquote>
          </article>

          <div className="evidence-grid">
            <section className="evidence-section">
              <div className="section-title">
                <span className="section-icon green">
                  <Icon name="check" size={16} />
                </span>
                <div>
                  <span>SUPPORTING EVIDENCE</span>
                  <small>{incident.evidence.length} validated sources</small>
                </div>
              </div>
              <div className="evidence-list">
                {incident.evidence.map((item, index) => (
                  <article key={item.source} style={{ "--index": index } as CSSProperties}>
                    <div>
                      <span className="source-id">{item.source}</span>
                      <span className="source-kind">{item.kind}</span>
                      <span className="weight">w {item.weight}</span>
                      <button
                        type="button"
                        className="icon-text-button"
                        onClick={() => onDismissReport(item.source)}
                      >
                        <Icon name="x" size={11} />
                        Dismiss source
                      </button>
                    </div>
                    <p>{item.fact}</p>
                  </article>
                ))}
              </div>
            </section>
            <section className="evidence-section">
              <div className="section-title">
                <span className="section-icon amber">
                  <Icon name="warning" size={16} />
                </span>
                <div>
                  <span>CONTRADICTIONS</span>
                  <small>
                    {incident.contradictoryEvidence.length
                      ? `${incident.contradictoryEvidence.length} require verification`
                      : "No material conflicts"}
                  </small>
                </div>
              </div>
              {incident.contradictoryEvidence.length ? (
                <div className="contradiction-list">
                  {incident.contradictoryEvidence.map((item, index) => (
                    <article
                      key={`${item.sources}-${index}`}
                      style={{ "--index": index } as CSSProperties}
                    >
                      <span>{item.sources}</span>
                      <p>{item.description}</p>
                      <small>{item.impact}</small>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-evidence">
                  <Icon name="check" />
                  <span>No contradictory evidence detected across current sources.</span>
                </div>
              )}
            </section>
          </div>

          <div className="uncertainty-grid">
            <section>
              <div className="section-title compact">
                <Icon name="question" size={16} />
                <span>MISSING INFORMATION</span>
              </div>
              <ul>
                {incident.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section>
              <div className="section-title compact">
                <Icon name="radio" size={16} />
                <span>HIGH-VALUE QUESTIONS</span>
              </div>
              <ol>
                {incident.questions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </section>
          </div>

          <div className="uncertainty-note">
            <Icon name="info" size={16} />
            <div>
              <strong>Uncertainty statement</strong>
              <span>{incident.uncertainty}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="degraded-analysis-card">
          <span className="degraded-icon">
            <Icon name="warning" size={22} />
          </span>
          <div>
            <strong>{aiPending ? "AI analysis in progress" : "AI analysis unavailable."}</strong>
            <p>
              {aiPending
                ? "AegisGrid is validating the provider response and its cited source IDs. Deterministic risk and routing remain available while this completes."
                : "Semantic fusion, contradiction reasoning, clarifying questions, and generated communications are paused. Source reports remain preserved; deterministic risk and routing continue to update."}
            </p>
          </div>
          <span className="degraded-mode-tag">{aiPending ? "VALIDATING" : "DEGRADED MODE"}</span>
        </div>
      )}
    </div>
  );
}
