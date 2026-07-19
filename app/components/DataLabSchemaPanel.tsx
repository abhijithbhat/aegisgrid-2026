import { Icon } from "./Icon";
import { CANONICAL_FIELDS } from "./data-lab-model";
import type { DataLabController } from "./use-data-lab";

type DataLabSchemaPanelProps = {
  lab: DataLabController;
};

export function DataLabSchemaPanel({ lab }: DataLabSchemaPanelProps) {
  const { busy, mapping, mappingNotice, validation } = lab;

  return (
    <section className="panel schema-panel" aria-labelledby="schema-mapping-heading">
      <div className="panel-head">
        <div>
          <div className="eyebrow">PROPOSED · HUMAN-CONFIRMED</div>
          <h2 id="schema-mapping-heading">Schema mapping</h2>
        </div>
        <span className={`mapping-status ${validation?.accepted ? "approved" : ""}`}>
          {validation?.accepted ? <Icon name="check" size={13} /> : <Icon name="clock" size={13} />}
          {validation?.accepted ? "Validation passed" : "Review required"}
        </span>
      </div>
      <p className="panel-description">
        Every mapping remains unapplied until you explicitly validate it. Confidence is advisory;
        strict normalization is deterministic.
      </p>
      {mappingNotice ? (
        <div className="text-safety-note" role="status">
          <Icon name="info" size={14} />
          {mappingNotice}
        </div>
      ) : null}
      <div className="mapping-table" role="table" aria-label="Proposed schema mappings">
        <div className="mapping-row header" role="row">
          <span role="columnheader">Source column</span>
          <span role="columnheader">Canonical field</span>
          <span role="columnheader">Confidence</span>
        </div>
        {mapping.map((item, index) => (
          <div className="mapping-row" role="row" key={item.sourceColumn}>
            <span role="cell" className="source-column">
              <Icon name="database" size={14} />
              {item.sourceColumn}
            </span>
            <span className="mapping-arrow" aria-hidden="true">
              <Icon name="chevron" size={13} />
            </span>
            <span role="cell" className="mapping-select-cell">
              <label className="sr-only" htmlFor={`mapping-${index}`}>
                Map {item.sourceColumn}
              </label>
              <select
                id={`mapping-${index}`}
                value={item.canonicalField ?? ""}
                onChange={(event) => lab.updateMapping(index, event.target.value)}
              >
                <option value="">Ignore field</option>
                {CANONICAL_FIELDS.map((field) => (
                  <option value={field} key={field}>
                    {field}
                  </option>
                ))}
              </select>
            </span>
            <span
              role="cell"
              title={item.rationale}
              className={`confidence-value ${item.confidence < 0.8 ? "low" : item.confidence < 0.9 ? "medium" : "high"}`}
            >
              <i style={{ width: `${item.confidence * 100}%` }} aria-hidden="true" />
              {Math.round(item.confidence * 100)}%
            </span>
          </div>
        ))}
      </div>
      <div className="mapping-actions">
        <span>
          <Icon name="info" size={14} />
          {mapping.filter((item) => item.confidence < 0.8).length} low-confidence fields need
          attention
        </span>
        <button
          type="button"
          className="primary-button"
          disabled={busy || !mapping.length}
          onClick={() => void lab.validateApprovedMapping()}
        >
          <Icon name="check" size={15} />
          Validate approved mapping
        </button>
      </div>
    </section>
  );
}
