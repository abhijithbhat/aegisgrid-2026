import { Icon } from "./Icon";
import type { DataLabController } from "./use-data-lab";

type DataLabPreviewPanelProps = {
  lab: DataLabController;
};

export function DataLabPreviewPanel({ lab }: DataLabPreviewPanelProps) {
  const { globalIssues, headers, imported, mapping, previewRows, rowIssues, rows, validation } =
    lab;

  return (
    <section className="panel preview-panel" aria-labelledby="normalized-preview-heading">
      <div className="panel-head">
        <div>
          <div className="eyebrow">
            EDITABLE PREVIEW · {previewRows.length} OF {rows.length} ROWS
          </div>
          <h2 id="normalized-preview-heading">Normalized preview</h2>
        </div>
        <div className="preview-status" role="status" aria-live="polite">
          <span>
            <i className={validation?.accepted ? "valid" : ""} aria-hidden="true" />
            {validation?.summary.validRows ?? 0} valid
          </span>
          <span>
            <i
              className={(validation?.summary.errorCount ?? 0) ? "invalid" : "valid"}
              aria-hidden="true"
            />
            {validation?.summary.errorCount ?? 0} errors
          </span>
        </div>
      </div>
      {headers.length ? (
        <div className="data-table-wrap">
          <table className="data-table">
            <caption className="sr-only">
              First {previewRows.length} staged rows with editable source values and validation
              status
            </caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                {headers.map((header, index) => (
                  <th scope="col" key={header}>
                    <span>{mapping[index]?.canonicalField ?? "Ignored"}</span>
                    <small>{header}</small>
                  </th>
                ))}
                <th scope="col">Validation</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, rowIndex) => {
                const issues = rowIssues.get(rowIndex + 1) ?? [];
                return (
                  <tr key={rowIndex}>
                    <th scope="row">{String(rowIndex + 1).padStart(2, "0")}</th>
                    {headers.map((header) => (
                      <td key={`${rowIndex}-${header}`}>
                        <input
                          aria-label={`Row ${rowIndex + 1}, ${header}`}
                          value={String(row[header] ?? "")}
                          onChange={(event) => lab.updateCell(rowIndex, header, event.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      {issues.length ? (
                        <span
                          className="row-invalid"
                          title={issues.map((issue) => issue.message).join(" ")}
                        >
                          <Icon name="x" size={12} />
                          Rejected
                        </span>
                      ) : validation ? (
                        <span className="row-valid">
                          <Icon name="check" size={12} />
                          Valid
                        </span>
                      ) : (
                        <span>Pending</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-table">
          <Icon name="database" size={36} />
          <strong>No dataset staged</strong>
          <span>
            Upload a supported CSV, JSON, or selectable-text PDF to inspect and map actual records.
          </span>

          <div className="empty-table-schema-guide">
            <h3>EXPECTED CSV SCHEMA TEMPLATE</h3>
            <p>
              Prepare your upload with headers matching or easily mappable to the canonical scheme:
            </p>
            <div
              className="schema-code-box"
              tabIndex={0}
              role="region"
              aria-label="Expected CSV schema template"
            >
              <code>
                timestamp,zone_id,occupancy,capacity,event_phase
                <br />
                2026-07-17T10:00:00Z,W-CONC,820,900,live-match
                <br />
                2026-07-17T10:05:00Z,N-CONC,540,1000,live-match
              </code>
            </div>
            <ul className="schema-field-list">
              <li>
                <strong>timestamp</strong>: ISO 8601 string (e.g., <code>2026-07-17T10:00:00Z</code>
                )
              </li>
              <li>
                <strong>zone_id</strong>: Canonical zone code (e.g., <code>W-CONC</code>,{" "}
                <code>N-CONC</code>, <code>E-CONC</code>, <code>S-CONC</code>,{" "}
                <code>ACCESS-CORR</code>, <code>TRANSIT</code>)
              </li>
              <li>
                <strong>occupancy</strong>: Real-time numeric head-count
              </li>
              <li>
                <strong>capacity</strong>: Maximum safety capacity threshold
              </li>
              <li>
                <strong>event_phase</strong>: <code>pre-entry</code>, <code>ingress</code>,{" "}
                <code>live-match</code>, <code>halftime</code>, or <code>egress</code>
              </li>
            </ul>
          </div>
        </div>
      )}
      {globalIssues.length ? (
        <div className="form-error" role="alert">
          <Icon name="alert" size={16} />
          <span>{globalIssues.map((issue) => issue.message).join(" ")}</span>
        </div>
      ) : null}
      {validation && !validation.accepted ? (
        <div className="form-error" role="alert">
          <Icon name="alert" size={16} />
          <span>
            {validation.issues
              .slice(0, 5)
              .map((issue) => `Row ${issue.row || "mapping"}: ${issue.message}`)
              .join(" · ")}
          </span>
        </div>
      ) : null}
      <footer className="preview-footer">
        <div>
          <Icon name="shield" size={15} />
          <span>
            <strong>Strict server validation:</strong> timestamps, numeric bounds, canonical zone
            IDs, required capacity, finite values, enums, and duplicate mappings.
          </span>
        </div>
        <button
          type="button"
          className="accept-button"
          disabled={!validation?.accepted || imported}
          onClick={lab.commitImport}
        >
          <Icon name={imported ? "check" : "database"} size={15} />
          {imported ? "Imported" : `Import ${validation?.rows.length ?? 0} validated rows`}
        </button>
      </footer>
    </section>
  );
}
