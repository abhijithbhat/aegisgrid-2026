"use client";

import { useMemo, useRef, useState } from "react";
import type { AIRecommendation } from "../../src/types";
import { Icon } from "./Icon";

type LabMode = "upload" | "text";
type Scalar = string | number | boolean | null;
type ImportRow = Record<string, Scalar>;

const CANONICAL_FIELDS = [
  "timestamp", "zone_id", "occupancy", "capacity", "inflow_per_minute",
  "outflow_per_minute", "queue_minutes", "temperature_c", "air_quality_index",
  "noise_db", "sensor_health", "blocked", "event_phase",
] as const;
type CanonicalField = (typeof CANONICAL_FIELDS)[number];

type ProposedMapping = {
  sourceColumn: string;
  canonicalField: CanonicalField | null;
  confidence: number;
  rationale: string;
  requiresApproval: true;
  source: "canonical" | "heuristic" | "ai";
};

type ValidationIssue = {
  row: number;
  field?: string;
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type NormalizedImportRow = Record<CanonicalField, unknown>;

type ValidationResult = {
  accepted: boolean;
  rows: NormalizedImportRow[];
  issues: ValidationIssue[];
  summary: { inputRows: number; validRows: number; errorCount: number; warningCount: number };
};

type FileState = { name: string; type: string; size: number } | null;
type TextAnalysis =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "available"; sourceId: string; recommendation: AIRecommendation }
  | { status: "unavailable"; message: string };

type DataLabProps = {
  onAudit: (action: string, note: string) => void;
  onImport: (rows: NormalizedImportRow[]) => void;
  onReport: (report: { sourceId: string; text: string; recommendation: AIRecommendation }) => void;
};

function humanSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function publicMessage(body: Record<string, unknown>, fallback: string): string {
  const error = body.error as Record<string, unknown> | undefined;
  return typeof error?.message === "string" ? error.message : fallback;
}

export function DataLab({ onAudit, onImport, onReport }: DataLabProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<LabMode>("upload");
  const [file, setFile] = useState<FileState>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [mapping, setMapping] = useState<ProposedMapping[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [mappingNotice, setMappingNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [textReport, setTextReport] = useState("");
  const [textAnalysis, setTextAnalysis] = useState<TextAnalysis>({ status: "idle" });
  const [reportAdded, setReportAdded] = useState(false);

  const rowIssues = useMemo(() => {
    const byRow = new Map<number, ValidationIssue[]>();
    for (const issue of validation?.issues ?? []) {
      if (issue.row <= 0) continue;
      byRow.set(issue.row, [...(byRow.get(issue.row) ?? []), issue]);
    }
    return byRow;
  }, [validation]);
  const globalIssues = (validation?.issues ?? []).filter((issue) => issue.row <= 0);
  const previewRows = rows.slice(0, 50);

  const reset = () => {
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping([]);
    setValidation(null);
    setMappingNotice("");
    setImported(false);
    setError("");
    setTextReport("");
    setTextAnalysis({ status: "idle" });
    setReportAdded(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const processFile = async (incoming: File) => {
    setError("");
    setValidation(null);
    setImported(false);
    if (incoming.size > 2 * 1024 * 1024) {
      setError("File rejected: maximum upload size is 2 MiB.");
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.set("file", incoming);
    try {
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(publicMessage(body, "The file could not be inspected safely."));
      const upload = body.upload as {
        fileName: string;
        mediaType: string;
        sizeBytes: number;
        headers: string[];
        rows: ImportRow[];
        mappings: ProposedMapping[];
        warnings: string[];
      } | undefined;
      if (!upload) throw new Error("The inspection response was incomplete.");
      const mappingInfo = body.mapping as { mode?: string; notice?: string } | undefined;
      setFile({ name: upload.fileName, type: incoming.name.split(".").pop()?.toUpperCase() ?? upload.mediaType, size: upload.sizeBytes });
      setHeaders(upload.headers);
      setRows(upload.rows);
      setMapping(upload.mappings);
      setMappingNotice([mappingInfo?.notice, ...(upload.warnings ?? [])].filter(Boolean).join(" "));
      onAudit("Untrusted dataset staged", `${upload.fileName} was inspected server-side; raw content was not persisted.`);
    } catch (caught) {
      setFile(null);
      setHeaders([]);
      setRows([]);
      setMapping([]);
      setError(caught instanceof Error ? caught.message : "The file could not be inspected safely.");
    } finally {
      setBusy(false);
    }
  };

  const updateMapping = (index: number, value: string) => {
    setValidation(null);
    setImported(false);
    setMapping((current) => current.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      canonicalField: value ? value as CanonicalField : null,
      confidence: 1,
      rationale: "Manually confirmed by the stadium safety supervisor.",
    } : item));
  };

  const updateCell = (rowIndex: number, header: string, value: string) => {
    setValidation(null);
    setImported(false);
    setRows((current) => current.map((row, index) => index === rowIndex ? { ...row, [header]: value } : row));
  };

  const validateApprovedMapping = async () => {
    if (!rows.length || !mapping.length) return;
    setBusy(true);
    setError("");
    setValidation(null);
    setImported(false);
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "validate", rows, mappings: mapping }),
      });
      const body = await responseJson(response);
      const result = body.validation as ValidationResult | undefined;
      if (!result) throw new Error(publicMessage(body, "Validation could not be completed."));
      setValidation(result);
      onAudit(
        result.accepted ? "Schema mapping validated" : "Dataset validation rejected",
        result.accepted
          ? `${result.summary.validRows} rows passed strict server validation after explicit mapping approval.`
          : `${result.summary.errorCount} validation errors require correction before import.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Validation could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = () => {
    const payload = {
      format: "AEGISGRID_VALIDATION_REPORT",
      version: 1,
      generatedAt: new Date().toISOString(),
      file,
      mapping,
      validation: validation ?? { accepted: false, issues: [], summary: { inputRows: rows.length, validRows: 0, errorCount: 0, warningCount: 0 } },
      notice: "Uploaded content was treated as untrusted data and raw content was not persisted.",
    };
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = href;
    link.download = "aegisgrid-validation-report.json";
    link.click();
    URL.revokeObjectURL(href);
    onAudit("Validation report downloaded", `${file?.name ?? "Dataset"} report exported.`);
  };

  const interpretTextReport = async () => {
    const text = textReport.trim();
    if (text.length < 12) {
      setError("Add a little more operational detail before requesting interpretation.");
      return;
    }
    setError("");
    setTextAnalysis({ status: "loading" });
    const sourceId = `DIRECT-${Date.now().toString(36).toUpperCase()}`;
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          incidentId: `REPORT-${Date.now().toString(36).toUpperCase()}`,
          title: "New unstructured stadium report",
          incidentType: "other",
          zoneId: "unconfirmed",
          eventPhase: "live-match",
          deterministicRisk: { score: 10, severity: "low", explanation: "Provisional deterministic baseline; no telemetry has been linked yet." },
          sources: [{ sourceId, sourceType: "direct-report", text, reliability: 0.5 }],
          route: { primaryZoneIds: ["unconfirmed"], alternateZoneIds: [], etaMinutes: 0, avoidedZoneIds: [], rationale: "No route is calculated until the report location is confirmed." },
        }),
      });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(publicMessage(body, "The report could not be interpreted."));
      const outcome = body.outcome as { status: "available"; recommendation: AIRecommendation } | { status: "degraded"; error?: { message?: string } } | undefined;
      if (!outcome || outcome.status !== "available") {
        setTextAnalysis({ status: "unavailable", message: outcome?.status === "degraded" ? outcome.error?.message ?? "AI analysis unavailable." : "AI analysis unavailable." });
        return;
      }
      setTextAnalysis({ status: "available", sourceId, recommendation: outcome.recommendation });
      onAudit("Direct report interpreted", `${sourceId} passed the strict AI response contract; supervisor confirmation is still required.`);
    } catch (caught) {
      setTextAnalysis({ status: "unavailable", message: caught instanceof Error ? caught.message : "AI analysis unavailable." });
    }
  };

  const commitImport = () => {
    if (!validation?.accepted || imported) return;
    onImport(validation.rows);
    setImported(true);
    onAudit("Dataset imported", `${validation.rows.length} normalized rows were applied to the live operational state.`);
  };

  return (
    <main className="workspace-view data-lab-view">
      <div className="view-heading">
        <div><div className="eyebrow">CONTROLLED INGESTION WORKSPACE</div><h1>Data Injection Lab</h1><p>Inspect, normalize, and approve operational data before it enters the live command model.</p></div>
        <div className="view-heading-actions"><button type="button" className="secondary-button" onClick={downloadReport} disabled={!file}><Icon name="download" size={15} />Validation report</button><button type="button" className="danger-ghost-button" onClick={reset}><Icon name="reset" size={15} />Clear workspace</button></div>
      </div>

      <div className="lab-security-bar"><Icon name="shield" size={18} /><div><strong>Untrusted-data boundary active</strong><span>Files are size/type checked and parsed server-side. Content is data—not instructions—and raw uploads are not persisted.</span></div><span>MAX 2 MiB</span></div>

      <div className="lab-grid">
        <section className="panel lab-source-panel">
          <div className="mode-switch" role="tablist" aria-label="Data input method">
            <button id="lab-tab-upload" aria-controls="lab-panel-upload" tabIndex={mode === "upload" ? 0 : -1} type="button" role="tab" aria-selected={mode === "upload"} className={mode === "upload" ? "is-active" : ""} onClick={() => setMode("upload")} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? "upload" : "text"; setMode(next); window.requestAnimationFrame(() => document.getElementById(`lab-tab-${next}`)?.focus()); }}><Icon name="upload" size={16} />File upload</button>
            <button id="lab-tab-text" aria-controls="lab-panel-text" tabIndex={mode === "text" ? 0 : -1} type="button" role="tab" aria-selected={mode === "text"} className={mode === "text" ? "is-active" : ""} onClick={() => setMode("text")} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "End" ? "text" : "upload"; setMode(next); window.requestAnimationFrame(() => document.getElementById(`lab-tab-${next}`)?.focus()); }}><Icon name="edit" size={16} />Direct report</button>
          </div>

          {mode === "upload" ? (
            <div id="lab-panel-upload" aria-labelledby="lab-tab-upload" role="tabpanel" className="source-content">
              <div className={`dropzone${dragging ? " is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); const dropped = event.dataTransfer.files[0]; if (dropped) void processFile(dropped); }}>
                <input ref={fileInput} type="file" accept=".csv,.json,.pdf,text/csv,application/json,application/pdf" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void processFile(selected); }} />
                <span className="dropzone-icon"><Icon name={busy ? "clock" : "upload"} size={24} /></span>
                <strong>{busy ? "Inspecting file…" : "Drop operational data here"}</strong>
                <span>CSV, JSON, or selectable-text PDF · 2 MiB maximum</span>
                <button type="button" className="secondary-button" disabled={busy} onClick={() => fileInput.current?.click()}>Choose file</button>
              </div>
              {file ? <article className="uploaded-file"><span className={`file-type ${file.type.toLowerCase()}`}><Icon name="file" /></span><div><strong>{file.name}</strong><span>{file.type} · {humanSize(file.size)} · inspected server-side</span></div><span className="file-ready"><Icon name="check" size={13} />Staged</span><button type="button" className="icon-button" onClick={reset} aria-label="Remove uploaded file"><Icon name="trash" size={16} /></button></article> : null}
            </div>
          ) : (
            <div id="lab-panel-text" aria-labelledby="lab-tab-text" role="tabpanel" className="source-content direct-report">
              <label htmlFor="direct-report">Incident report text</label>
              <textarea id="direct-report" value={textReport} onChange={(event) => { setTextReport(event.target.value); setTextAnalysis({ status: "idle" }); setReportAdded(false); }} placeholder="Example: Someone fainted near the food area behind the west stairs…" rows={9} />
              <div className="text-safety-note"><Icon name="lock" size={14} />Text is sent as untrusted incident data. Embedded instructions are ignored.</div>
              <button type="button" className="primary-button full-button" disabled={textAnalysis.status === "loading"} onClick={() => void interpretTextReport()}><Icon name={textAnalysis.status === "loading" ? "clock" : "spark"} size={15} />{textAnalysis.status === "loading" ? "Validating interpretation…" : "Interpret report with AI"}</button>
              {textAnalysis.status === "available" ? <div className="text-result"><Icon name="check" size={16} /><div><strong>{textAnalysis.recommendation.incidentType} · {textAnalysis.recommendation.severity} · {Math.round(textAnalysis.recommendation.confidence * 100)}% confidence</strong><span>{textAnalysis.recommendation.summary}</span><button type="button" className="small-action-button" disabled={reportAdded} onClick={() => { onReport({ sourceId: textAnalysis.sourceId, text: textReport.trim(), recommendation: textAnalysis.recommendation }); setReportAdded(true); }}>{reportAdded ? "Added to queue" : "Add to incident queue"}</button></div></div> : null}
              {textAnalysis.status === "unavailable" ? <div className="form-error" role="status"><Icon name="warning" size={16} /><span><strong>AI analysis unavailable.</strong> {textAnalysis.message} The report has not been interpreted or imported.</span></div> : null}
            </div>
          )}

          {error ? <div className="form-error" role="alert"><Icon name="alert" size={16} />{error}</div> : null}

          <div className="ingestion-steps">
            <span className={file ? "done" : "active"}><i>{file ? <Icon name="check" size={12} /> : "1"}</i>Inspect file</span>
            <span className={validation ? validation.accepted ? "done" : "active" : file ? "active" : ""}><i>{validation?.accepted ? <Icon name="check" size={12} /> : "2"}</i>Map & validate</span>
            <span className={validation?.accepted ? imported ? "done" : "active" : ""}><i>{imported ? <Icon name="check" size={12} /> : "3"}</i>Approve import</span>
          </div>
        </section>

        <section className="panel schema-panel">
          <div className="panel-head"><div><div className="eyebrow">PROPOSED · HUMAN-CONFIRMED</div><h2>Schema mapping</h2></div><span className={`mapping-status ${validation?.accepted ? "approved" : ""}`}>{validation?.accepted ? <Icon name="check" size={13} /> : <Icon name="clock" size={13} />}{validation?.accepted ? "Validation passed" : "Review required"}</span></div>
          <p className="panel-description">Every mapping remains unapplied until you explicitly validate it. Confidence is advisory; strict normalization is deterministic.</p>
          {mappingNotice ? <div className="text-safety-note"><Icon name="info" size={14} />{mappingNotice}</div> : null}
          <div className="mapping-table" role="table" aria-label="Proposed schema mappings">
            <div className="mapping-row header" role="row"><span role="columnheader">Source column</span><span role="columnheader">Canonical field</span><span role="columnheader">Confidence</span></div>
            {mapping.map((item, index) => <div className="mapping-row" role="row" key={item.sourceColumn}><span role="cell" className="source-column"><Icon name="database" size={14} />{item.sourceColumn}</span><span role="cell" className="mapping-arrow"><Icon name="chevron" size={13} /></span><label className="sr-only" htmlFor={`mapping-${index}`}>Map {item.sourceColumn}</label><select id={`mapping-${index}`} value={item.canonicalField ?? ""} onChange={(event) => updateMapping(index, event.target.value)}><option value="">Ignore field</option>{CANONICAL_FIELDS.map((field) => <option value={field} key={field}>{field}</option>)}</select><span role="cell" title={item.rationale} className={`confidence-value ${item.confidence < 0.8 ? "low" : item.confidence < 0.9 ? "medium" : "high"}`}><i style={{ width: `${item.confidence * 100}%` }} />{Math.round(item.confidence * 100)}%</span></div>)}
          </div>
          <div className="mapping-actions"><span><Icon name="info" size={14} />{mapping.filter((item) => item.confidence < 0.8).length} low-confidence fields need attention</span><button type="button" className="primary-button" disabled={busy || !mapping.length} onClick={() => void validateApprovedMapping()}><Icon name="check" size={15} />Validate approved mapping</button></div>
        </section>
      </div>

      <section className="panel preview-panel">
        <div className="panel-head"><div><div className="eyebrow">EDITABLE PREVIEW · {previewRows.length} OF {rows.length} ROWS</div><h2>Normalized preview</h2></div><div className="preview-status"><span><i className={validation?.accepted ? "valid" : ""} />{validation?.summary.validRows ?? 0} valid</span><span><i className={(validation?.summary.errorCount ?? 0) ? "invalid" : "valid"} />{validation?.summary.errorCount ?? 0} errors</span></div></div>
        {headers.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>#</th>{headers.map((header, index) => <th key={header}><span>{mapping[index]?.canonicalField ?? "Ignored"}</span><small>{header}</small></th>)}<th>Validation</th></tr></thead><tbody>{previewRows.map((row, rowIndex) => { const issues = rowIssues.get(rowIndex + 1) ?? []; return <tr key={rowIndex}><td>{String(rowIndex + 1).padStart(2, "0")}</td>{headers.map((header) => <td key={`${rowIndex}-${header}`}><input aria-label={`Row ${rowIndex + 1}, ${header}`} value={String(row[header] ?? "")} onChange={(event) => updateCell(rowIndex, header, event.target.value)} /></td>)}<td>{issues.length ? <span className="row-invalid" title={issues.map((issue) => issue.message).join(" ")}><Icon name="x" size={12} />Rejected</span> : validation ? <span className="row-valid"><Icon name="check" size={12} />Valid</span> : <span>Pending</span>}</td></tr>; })}</tbody></table></div> : <div className="empty-table"><Icon name="database" size={30} /><strong>No dataset staged</strong><span>Upload a supported file to inspect and map its actual records.</span></div>}
        {globalIssues.length ? <div className="form-error" role="alert"><Icon name="alert" size={16} /><span>{globalIssues.map((issue) => issue.message).join(" ")}</span></div> : null}
        {validation && !validation.accepted ? <div className="form-error" role="alert"><Icon name="alert" size={16} /><span>{validation.issues.slice(0, 5).map((issue) => `Row ${issue.row || "mapping"}: ${issue.message}`).join(" · ")}</span></div> : null}
        <footer className="preview-footer"><div><Icon name="shield" size={15} /><span><strong>Strict server validation:</strong> timestamps, numeric bounds, canonical zone IDs, required capacity, finite values, enums, and duplicate mappings.</span></div><button type="button" className="accept-button" disabled={!validation?.accepted || imported} onClick={commitImport}><Icon name={imported ? "check" : "database"} size={15} />{imported ? "Imported" : `Import ${validation?.rows.length ?? 0} validated rows`}</button></footer>
      </section>
    </main>
  );
}
