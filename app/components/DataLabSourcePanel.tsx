import { Icon } from "./Icon";
import { humanSize } from "./data-lab-model";
import type { DataLabController } from "./use-data-lab";

type DataLabSourcePanelProps = {
  lab: DataLabController;
};

export function DataLabSourcePanel({ lab }: DataLabSourcePanelProps) {
  const {
    busy,
    dragging,
    error,
    file,
    fileInput,
    imported,
    mode,
    reportAdded,
    textAnalysis,
    textReport,
    validation,
  } = lab;

  const selectMode = (next: "upload" | "text") => {
    lab.setMode(next);
    window.requestAnimationFrame(() => document.getElementById(`lab-tab-${next}`)?.focus());
  };

  return (
    <section className="panel lab-source-panel" aria-labelledby="data-source-heading">
      <h2 id="data-source-heading" className="sr-only">
        Select and inspect a data source
      </h2>
      <div className="mode-switch" role="tablist" aria-label="Data input method">
        <button
          id="lab-tab-upload"
          aria-controls="lab-panel-upload"
          tabIndex={mode === "upload" ? 0 : -1}
          type="button"
          role="tab"
          aria-selected={mode === "upload"}
          className={mode === "upload" ? "is-active" : ""}
          onClick={() => lab.setMode("upload")}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            selectMode(event.key === "Home" ? "upload" : "text");
          }}
        >
          <Icon name="upload" size={16} />
          File upload
        </button>
        <button
          id="lab-tab-text"
          aria-controls="lab-panel-text"
          tabIndex={mode === "text" ? 0 : -1}
          type="button"
          role="tab"
          aria-selected={mode === "text"}
          className={mode === "text" ? "is-active" : ""}
          onClick={() => lab.setMode("text")}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            selectMode(event.key === "End" ? "text" : "upload");
          }}
        >
          <Icon name="edit" size={16} />
          Direct report
        </button>
      </div>

      {mode === "upload" ? (
        <div
          id="lab-panel-upload"
          aria-labelledby="lab-tab-upload"
          role="tabpanel"
          className="source-content"
        >
          <div
            className={`dropzone${dragging ? " is-dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              lab.setDragging(true);
            }}
            onDragLeave={() => lab.setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              lab.setDragging(false);
              const dropped = event.dataTransfer.files[0];
              if (dropped) void lab.processFile(dropped);
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.json,.pdf,text/csv,application/json,application/pdf"
              onChange={(event) => {
                const selected = event.target.files?.[0];
                if (selected) void lab.processFile(selected);
              }}
            />
            <span className="dropzone-icon">
              <Icon name={busy ? "clock" : "upload"} size={24} />
            </span>
            <strong>{busy ? "Inspecting file…" : "Drop operational data here"}</strong>
            <span>CSV, JSON, or selectable-text PDF · 2 MiB maximum</span>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              Choose file
            </button>
          </div>
          {file ? (
            <article className="uploaded-file">
              <span className={`file-type ${file.type.toLowerCase()}`}>
                <Icon name="file" />
              </span>
              <div>
                <strong>{file.name}</strong>
                <span>
                  {file.type} · {humanSize(file.size)} · inspected server-side
                </span>
              </div>
              <span className="file-ready">
                <Icon name="check" size={13} />
                Staged
              </span>
              <button
                type="button"
                className="icon-button"
                onClick={lab.reset}
                aria-label="Remove uploaded file"
              >
                <Icon name="trash" size={16} />
              </button>
            </article>
          ) : null}
        </div>
      ) : (
        <div
          id="lab-panel-text"
          aria-labelledby="lab-tab-text"
          role="tabpanel"
          className="source-content direct-report"
        >
          <label htmlFor="direct-report">Incident report text</label>
          <textarea
            id="direct-report"
            value={textReport}
            onChange={(event) => {
              lab.setTextReport(event.target.value);
              lab.setTextAnalysis({ status: "idle" });
              lab.setReportAdded(false);
            }}
            placeholder="Example: Someone fainted near the food area behind the west stairs…"
            rows={9}
          />
          <div className="text-safety-note">
            <Icon name="lock" size={14} />
            Text is sent as untrusted incident data. Embedded instructions are ignored.
          </div>
          <button
            type="button"
            className="primary-button full-button"
            disabled={textAnalysis.status === "loading"}
            onClick={() => void lab.interpretTextReport()}
          >
            <Icon name={textAnalysis.status === "loading" ? "clock" : "spark"} size={15} />
            {textAnalysis.status === "loading"
              ? "Validating interpretation…"
              : "Interpret report with AI"}
          </button>
          {textAnalysis.status === "available" ? (
            <div className="text-result" role="status" aria-live="polite">
              <Icon name="check" size={16} />
              <div>
                <strong>
                  {textAnalysis.recommendation.incidentType} ·{" "}
                  {textAnalysis.recommendation.severity} ·{" "}
                  {Math.round(textAnalysis.recommendation.confidence * 100)}% confidence
                </strong>
                <span>{textAnalysis.recommendation.summary}</span>
                <button
                  type="button"
                  className="small-action-button"
                  disabled={reportAdded}
                  onClick={lab.addInterpretedReport}
                >
                  {reportAdded ? "Added to queue" : "Add to incident queue"}
                </button>
              </div>
            </div>
          ) : null}
          {textAnalysis.status === "unavailable" ? (
            <div className="form-error" role="status" aria-live="polite">
              <Icon name="warning" size={16} />
              <span>
                <strong>AI analysis unavailable.</strong> {textAnalysis.message} The report has not
                been interpreted or imported.
              </span>
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <div className="form-error" role="alert">
          <Icon name="alert" size={16} />
          {error}
        </div>
      ) : null}

      <div className="ingestion-steps" aria-label="Import progress">
        <span className={file ? "done" : "active"}>
          <i>{file ? <Icon name="check" size={12} /> : "1"}</i>Inspect file
        </span>
        <span
          className={validation ? (validation.accepted ? "done" : "active") : file ? "active" : ""}
        >
          <i>{validation?.accepted ? <Icon name="check" size={12} /> : "2"}</i>Map & validate
        </span>
        <span className={validation?.accepted ? (imported ? "done" : "active") : ""}>
          <i>{imported ? <Icon name="check" size={12} /> : "3"}</i>Approve import
        </span>
      </div>
    </section>
  );
}
