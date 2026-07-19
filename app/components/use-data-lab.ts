"use client";

import { useMemo, useRef, useState } from "react";
import type {
  CanonicalField,
  DataLabCallbacks,
  FileState,
  ImportRow,
  LabMode,
  ProposedMapping,
  TextAnalysis,
  ValidationIssue,
  ValidationResult,
} from "./data-lab-model";

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function publicMessage(body: Record<string, unknown>, fallback: string): string {
  const error = body.error as Record<string, unknown> | undefined;
  return typeof error?.message === "string" ? error.message : fallback;
}

export function useDataLab({ onAudit, onImport, onReport }: DataLabCallbacks) {
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
      if (!response.ok)
        throw new Error(publicMessage(body, "The file could not be inspected safely."));
      const upload = body.upload as
        | {
            fileName: string;
            mediaType: string;
            sizeBytes: number;
            headers: string[];
            rows: ImportRow[];
            mappings: ProposedMapping[];
            warnings: string[];
          }
        | undefined;
      if (!upload) throw new Error("The inspection response was incomplete.");
      const mappingInfo = body.mapping as { mode?: string; notice?: string } | undefined;
      setFile({
        name: upload.fileName,
        type: incoming.name.split(".").pop()?.toUpperCase() ?? upload.mediaType,
        size: upload.sizeBytes,
      });
      setHeaders(upload.headers);
      setRows(upload.rows);
      setMapping(upload.mappings);
      setMappingNotice([mappingInfo?.notice, ...(upload.warnings ?? [])].filter(Boolean).join(" "));
      onAudit(
        "Untrusted dataset staged",
        `${upload.fileName} was inspected server-side; raw content was not persisted.`,
      );
    } catch (caught) {
      setFile(null);
      setHeaders([]);
      setRows([]);
      setMapping([]);
      setError(
        caught instanceof Error ? caught.message : "The file could not be inspected safely.",
      );
    } finally {
      setBusy(false);
    }
  };

  const updateMapping = (index: number, value: string) => {
    setValidation(null);
    setImported(false);
    setMapping((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              canonicalField: value ? (value as CanonicalField) : null,
              confidence: 1,
              rationale: "Manually confirmed by the stadium safety supervisor.",
            }
          : item,
      ),
    );
  };

  const updateCell = (rowIndex: number, header: string, value: string) => {
    setValidation(null);
    setImported(false);
    setRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, [header]: value } : row)),
    );
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
      validation: validation ?? {
        accepted: false,
        issues: [],
        summary: { inputRows: rows.length, validRows: 0, errorCount: 0, warningCount: 0 },
      },
      notice: "Uploaded content was treated as untrusted data and raw content was not persisted.",
    };
    const href = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
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
          deterministicRisk: {
            score: 10,
            severity: "low",
            explanation: "Provisional deterministic baseline; no telemetry has been linked yet.",
          },
          sources: [{ sourceId, sourceType: "direct-report", text, reliability: 0.5 }],
          route: {
            primaryZoneIds: ["unconfirmed"],
            alternateZoneIds: [],
            etaMinutes: 0,
            avoidedZoneIds: [],
            rationale: "No route is calculated until the report location is confirmed.",
          },
        }),
      });
      const body = await responseJson(response);
      if (!response.ok)
        throw new Error(publicMessage(body, "The report could not be interpreted."));
      const outcome = body.outcome as
        | { status: "available"; recommendation: import("../../src/types").AIRecommendation }
        | { status: "degraded"; error?: { message?: string } }
        | undefined;
      if (!outcome || outcome.status !== "available") {
        setTextAnalysis({
          status: "unavailable",
          message:
            outcome?.status === "degraded"
              ? (outcome.error?.message ?? "AI analysis unavailable.")
              : "AI analysis unavailable.",
        });
        return;
      }
      setTextAnalysis({ status: "available", sourceId, recommendation: outcome.recommendation });
      onAudit(
        "Direct report interpreted",
        `${sourceId} passed the strict AI response contract; supervisor confirmation is still required.`,
      );
    } catch (caught) {
      setTextAnalysis({
        status: "unavailable",
        message: caught instanceof Error ? caught.message : "AI analysis unavailable.",
      });
    }
  };

  const addInterpretedReport = () => {
    if (textAnalysis.status !== "available") return;
    onReport({
      sourceId: textAnalysis.sourceId,
      text: textReport.trim(),
      recommendation: textAnalysis.recommendation,
    });
    setReportAdded(true);
  };

  const commitImport = () => {
    if (!validation?.accepted || imported) return;
    onImport(validation.rows);
    setImported(true);
    onAudit(
      "Dataset imported",
      `${validation.rows.length} normalized rows were applied to the live operational state.`,
    );
  };

  return {
    fileInput,
    mode,
    setMode,
    file,
    headers,
    rows,
    mapping,
    validation,
    mappingNotice,
    busy,
    imported,
    dragging,
    setDragging,
    error,
    textReport,
    setTextReport,
    textAnalysis,
    setTextAnalysis,
    reportAdded,
    setReportAdded,
    rowIssues,
    globalIssues,
    previewRows,
    reset,
    processFile,
    updateMapping,
    updateCell,
    validateApprovedMapping,
    downloadReport,
    interpretTextReport,
    addInterpretedReport,
    commitImport,
  };
}

export type DataLabController = ReturnType<typeof useDataLab>;
