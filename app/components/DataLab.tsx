"use client";

import { DataLabPreviewPanel } from "./DataLabPreviewPanel";
import { DataLabSchemaPanel } from "./DataLabSchemaPanel";
import { DataLabSourcePanel } from "./DataLabSourcePanel";
import { Icon } from "./Icon";
import type { DataLabCallbacks } from "./data-lab-model";
import { useDataLab } from "./use-data-lab";

export type { NormalizedImportRow } from "./data-lab-model";

export function DataLab(props: DataLabCallbacks) {
  const lab = useDataLab(props);

  return (
    <main className="workspace-view data-lab-view">
      <div className="view-heading">
        <div>
          <div className="eyebrow">CONTROLLED INGESTION WORKSPACE</div>
          <h1>Data Injection Lab</h1>
          <p>
            Inspect, normalize, and approve operational data before it enters the live command
            model.
          </p>
        </div>
        <div className="view-heading-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={lab.downloadReport}
            disabled={!lab.file}
          >
            <Icon name="download" size={15} />
            Validation report
          </button>
          <button type="button" className="danger-ghost-button" onClick={lab.reset}>
            <Icon name="reset" size={15} />
            Clear workspace
          </button>
        </div>
      </div>

      <div className="lab-security-bar" role="note" aria-label="Upload security boundary">
        <Icon name="shield" size={18} />
        <div>
          <strong>Untrusted-data boundary active</strong>
          <span>
            Files are size/type checked and parsed server-side. Content is data—not instructions—and
            raw uploads are not persisted.
          </span>
        </div>
        <span>MAX 2 MiB</span>
      </div>

      <div className="lab-grid">
        <DataLabSourcePanel lab={lab} />
        <DataLabSchemaPanel lab={lab} />
      </div>

      <DataLabPreviewPanel lab={lab} />
    </main>
  );
}
