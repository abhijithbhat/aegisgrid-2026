import type { AIRecommendation } from "../../src/types";

export type LabMode = "upload" | "text";
export type Scalar = string | number | boolean | null;
export type ImportRow = Record<string, Scalar>;

export const CANONICAL_FIELDS = [
  "timestamp",
  "zone_id",
  "occupancy",
  "capacity",
  "inflow_per_minute",
  "outflow_per_minute",
  "queue_minutes",
  "temperature_c",
  "air_quality_index",
  "noise_db",
  "sensor_health",
  "blocked",
  "event_phase",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export type ProposedMapping = {
  sourceColumn: string;
  canonicalField: CanonicalField | null;
  confidence: number;
  rationale: string;
  requiresApproval: true;
  source: "canonical" | "heuristic" | "ai";
};

export type ValidationIssue = {
  row: number;
  field?: string;
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type NormalizedImportRow = Record<CanonicalField, unknown>;

export type ValidationResult = {
  accepted: boolean;
  rows: NormalizedImportRow[];
  issues: ValidationIssue[];
  summary: { inputRows: number; validRows: number; errorCount: number; warningCount: number };
};

export type FileState = { name: string; type: string; size: number } | null;

export type TextAnalysis =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "available"; sourceId: string; recommendation: AIRecommendation }
  | { status: "unavailable"; message: string };

export type DataLabCallbacks = {
  onAudit: (action: string, note: string) => void;
  onImport: (rows: NormalizedImportRow[]) => void;
  onReport: (report: { sourceId: string; text: string; recommendation: AIRecommendation }) => void;
};

export function humanSize(bytes: number) {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
