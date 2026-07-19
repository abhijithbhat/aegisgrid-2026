import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "../api/http";

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
export type ImportRow = Record<string, string | number | boolean | null>;

export interface ProposedMapping {
  sourceColumn: string;
  canonicalField: CanonicalField | null;
  confidence: number;
  rationale: string;
  requiresApproval: true;
  source: "canonical" | "heuristic" | "ai";
}

export interface ParsedUpload {
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  headers: string[];
  rows: ImportRow[];
  extractedText?: string;
  mappings: ProposedMapping[];
  canonical: boolean;
  warnings: string[];
}

export interface ValidationIssue {
  row: number;
  field?: CanonicalField | string;
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface NormalizedImportResult {
  accepted: boolean;
  rows: Array<Record<CanonicalField, unknown>>;
  issues: ValidationIssue[];
  summary: { inputRows: number; validRows: number; errorCount: number; warningCount: number };
}

const MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  csv: ["text/csv", "application/csv", "text/plain"],
  json: ["application/json", "text/json"],
  pdf: ["application/pdf"],
  txt: ["text/plain"],
};

const MAX_ROWS = 1_000;
const MAX_COLUMNS = 40;
const MAX_CELL_LENGTH = 8_000;
const MAX_PDF_PAGES = 50;
const MAX_EXTRACTED_TEXT = 250_000;

export class ImportValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 422,
  ) {
    super(message);
    this.name = "ImportValidationError";
  }
}

function fileExtension(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

function verifyFile(file: File): string {
  if (file.size === 0)
    throw new ImportValidationError("EMPTY_FILE", "The selected file is empty.", 400);
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImportValidationError("FILE_TOO_LARGE", "Files must be 2 MiB or smaller.", 413);
  }
  const extension = fileExtension(file.name);
  const allowedMimeTypes = MIME_BY_EXTENSION[extension];
  if (!allowedMimeTypes || !allowedMimeTypes.includes(file.type)) {
    throw new ImportValidationError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Upload a CSV, JSON, text-based PDF, or plain-text report.",
      415,
    );
  }
  return extension;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ImportValidationError(
      "INVALID_TEXT_ENCODING",
      "CSV, JSON, and text uploads must use valid UTF-8 encoding.",
      400,
    );
  }
}

function parseCsv(text: string): { headers: string[]; rows: ImportRow[] } {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      record.push(cell.trim());
      cell = "";
    } else if (character === "\n") {
      record.push(cell.trim().replace(/\r$/, ""));
      if (record.some(Boolean)) records.push(record);
      record = [];
      cell = "";
    } else cell += character;

    if (cell.length > MAX_CELL_LENGTH) {
      throw new ImportValidationError(
        "CELL_TOO_LONG",
        `A cell exceeds the ${MAX_CELL_LENGTH}-character limit.`,
      );
    }
  }
  if (quoted)
    throw new ImportValidationError("MALFORMED_CSV", "The CSV contains an unclosed quoted value.");
  record.push(cell.trim().replace(/\r$/, ""));
  if (record.some(Boolean)) records.push(record);
  if (records.length < 2)
    throw new ImportValidationError(
      "NO_DATA_ROWS",
      "The CSV must contain a header and at least one data row.",
    );
  if (records.length - 1 > MAX_ROWS)
    throw new ImportValidationError("TOO_MANY_ROWS", `Imports are limited to ${MAX_ROWS} rows.`);

  const headers = records[0].map((header) => header.trim());
  if (headers.some((header) => !header))
    throw new ImportValidationError("EMPTY_HEADER", "Every CSV column needs a heading.");
  if (headers.some((header) => header.length > 200))
    throw new ImportValidationError(
      "HEADER_TOO_LONG",
      "CSV headings are limited to 200 characters.",
    );
  if (headers.length > MAX_COLUMNS)
    throw new ImportValidationError(
      "TOO_MANY_COLUMNS",
      `Imports are limited to ${MAX_COLUMNS} columns.`,
    );
  if (new Set(headers).size !== headers.length)
    throw new ImportValidationError("DUPLICATE_HEADER", "CSV headings must be unique.");

  const rows = records.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new ImportValidationError(
        "COLUMN_COUNT_MISMATCH",
        `Row ${rowIndex + 2} has ${values.length} values; expected ${headers.length}.`,
      );
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
  return { headers, rows };
}

function parseJson(text: string): { headers: string[]; rows: ImportRow[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ImportValidationError("MALFORMED_JSON", "The JSON file could not be parsed.", 400);
  }
  const records = Array.isArray(value) ? value : [value];
  if (!records.length || records.length > MAX_ROWS)
    throw new ImportValidationError(
      "INVALID_JSON_ROWS",
      `JSON must contain 1–${MAX_ROWS} records.`,
    );
  if (records.some((record) => !record || typeof record !== "object" || Array.isArray(record))) {
    throw new ImportValidationError(
      "INVALID_JSON_SHAPE",
      "JSON must be an object or an array of flat objects.",
    );
  }

  const headers = Array.from(new Set(records.flatMap((record) => Object.keys(record as object))));
  if (!headers.length || headers.length > MAX_COLUMNS)
    throw new ImportValidationError(
      "INVALID_JSON_COLUMNS",
      `JSON records must contain 1–${MAX_COLUMNS} fields.`,
    );
  if (headers.some((header) => header.length > 200))
    throw new ImportValidationError(
      "HEADER_TOO_LONG",
      "JSON field names are limited to 200 characters.",
    );
  const rows = records.map((record, index) => {
    const output: ImportRow = {};
    for (const [key, raw] of Object.entries(record as Record<string, unknown>)) {
      if (raw !== null && !["string", "number", "boolean"].includes(typeof raw)) {
        throw new ImportValidationError(
          "NESTED_JSON_UNSUPPORTED",
          `Row ${index + 1}, field ${key} is nested. Flatten the record before import.`,
        );
      }
      if (typeof raw === "number" && !Number.isFinite(raw)) {
        throw new ImportValidationError(
          "NON_FINITE_VALUE",
          `Row ${index + 1}, field ${key} is not finite.`,
        );
      }
      if (typeof raw === "string" && raw.length > MAX_CELL_LENGTH) {
        throw new ImportValidationError(
          "CELL_TOO_LONG",
          `Row ${index + 1}, field ${key} exceeds the text limit.`,
        );
      }
      output[key] = raw as ImportRow[string];
    }
    return output;
  });
  return { headers, rows };
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const timeoutMs = 10_000;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
    let document: Awaited<typeof task.promise> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void task.destroy();
        reject(
          new ImportValidationError(
            "PDF_EXTRACTION_TIMEOUT",
            "PDF text extraction exceeded the 10-second safety limit.",
            408,
          ),
        );
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        (async () => {
          document = await task.promise;
          if (document.numPages > MAX_PDF_PAGES) {
            throw new ImportValidationError(
              "PDF_TOO_MANY_PAGES",
              `PDF imports are limited to ${MAX_PDF_PAGES} pages.`,
            );
          }
          const pages: string[] = [];
          let extractedCharacters = 0;
          for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
            const page = await document.getPage(pageNumber);
            const content = await page.getTextContent();
            const pageText = content.items
              .map((item) => ("str" in item ? item.str : ""))
              .filter(Boolean)
              .join(" ");
            pages.push(pageText);
            extractedCharacters += pageText.length + 1;
            if (extractedCharacters > MAX_EXTRACTED_TEXT) {
              throw new ImportValidationError(
                "PDF_TEXT_TOO_LONG",
                "The extracted PDF text exceeds the safe processing limit.",
              );
            }
          }
          const text = pages.join("\n").trim();
          if (!text)
            throw new ImportValidationError(
              "PDF_NO_TEXT",
              "No selectable text was found. Scanned or encrypted PDFs require OCR and are not accepted.",
            );
          return text;
        })(),
        timeout,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (document) await document.destroy();
      else await task.destroy().catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof ImportValidationError) throw error;
    throw new ImportValidationError(
      "PDF_EXTRACTION_FAILED",
      "The PDF text could not be extracted. Confirm it is not encrypted or scanned.",
    );
  }
}

const HEURISTICS: Array<{ patterns: RegExp; field: CanonicalField }> = [
  { patterns: /^(time|date|observed|recorded|created)(_?at)?$/i, field: "timestamp" },
  { patterns: /^(zone|area|location|sector)(_?id)?$/i, field: "zone_id" },
  { patterns: /^(occupancy|head_?count|people|current_?count)$/i, field: "occupancy" },
  { patterns: /^(capacity|max_?people|limit)$/i, field: "capacity" },
  { patterns: /^(inflow|arrivals|entries)(_?per_?minute)?$/i, field: "inflow_per_minute" },
  { patterns: /^(outflow|departures|exits)(_?per_?minute)?$/i, field: "outflow_per_minute" },
  { patterns: /^(queue|wait)(_?minutes|_?mins)?$/i, field: "queue_minutes" },
  { patterns: /^(temp|temperature)(_?c|_?celsius)?$/i, field: "temperature_c" },
  { patterns: /^(aqi|air_?quality)(_?index)?$/i, field: "air_quality_index" },
  { patterns: /^(noise)(_?db|_?decibels)?$/i, field: "noise_db" },
  { patterns: /^(sensor)(_?health|_?status)?$/i, field: "sensor_health" },
  { patterns: /^(blocked|closed|obstructed)$/i, field: "blocked" },
  { patterns: /^(event_?phase|phase)$/i, field: "event_phase" },
];

export function proposeMappings(headers: string[]): ProposedMapping[] {
  return headers.map((sourceColumn) => {
    const canonical = CANONICAL_FIELDS.find((field) => field === sourceColumn.trim().toLowerCase());
    if (canonical)
      return {
        sourceColumn,
        canonicalField: canonical,
        confidence: 1,
        rationale: "Exact canonical heading.",
        requiresApproval: true,
        source: "canonical",
      };
    const heuristic = HEURISTICS.find(({ patterns }) => patterns.test(sourceColumn.trim()));
    if (heuristic)
      return {
        sourceColumn,
        canonicalField: heuristic.field,
        confidence: 0.68,
        rationale: "Name similarity only; confirm before applying.",
        requiresApproval: true,
        source: "heuristic",
      };
    return {
      sourceColumn,
      canonicalField: null,
      confidence: 0,
      rationale: "No safe deterministic mapping.",
      requiresApproval: true,
      source: "heuristic",
    };
  });
}

export async function parseUpload(file: File): Promise<ParsedUpload> {
  const extension = verifyFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === "pdf") {
    const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
    if (signature !== "%PDF-")
      throw new ImportValidationError(
        "MALFORMED_PDF",
        "The file does not contain a valid PDF signature.",
      );
  }
  let headers: string[] = [];
  let rows: ImportRow[] = [];
  let extractedText: string | undefined;
  const warnings: string[] = [];

  if (extension === "csv") ({ headers, rows } = parseCsv(decodeUtf8(bytes)));
  else if (extension === "json") ({ headers, rows } = parseJson(decodeUtf8(bytes)));
  else if (extension === "pdf") {
    extractedText = await extractPdf(bytes);
    headers = ["report_text"];
    rows = [{ report_text: extractedText }];
    warnings.push("PDF text requires an approved AI or manual mapping before telemetry import.");
  } else {
    extractedText = decodeUtf8(bytes).trim();
    if (!extractedText) throw new ImportValidationError("EMPTY_TEXT", "The text report is empty.");
    if (extractedText.length > MAX_EXTRACTED_TEXT)
      throw new ImportValidationError("TEXT_TOO_LONG", "The report exceeds the safe text limit.");
    headers = ["report_text"];
    rows = [{ report_text: extractedText }];
  }

  const mappings = proposeMappings(headers);
  return {
    fileName: file.name,
    mediaType: file.type,
    sizeBytes: file.size,
    headers,
    rows,
    extractedText,
    mappings,
    canonical: mappings.every(
      (mapping) => mapping.source === "canonical" && mapping.canonicalField !== null,
    ),
    warnings,
  };
}

const finiteNumber = z.union([
  z.number(),
  z
    .string()
    .trim()
    .min(1)
    .transform((value, context) => {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        context.addIssue({ code: "custom", message: "Expected a finite number." });
        return z.NEVER;
      }
      return number;
    }),
]);

const booleanLike = z.union([
  z.boolean(),
  z
    .string()
    .trim()
    .toLowerCase()
    .transform((value, context) => {
      if (["true", "1", "yes"].includes(value)) return true;
      if (["false", "0", "no"].includes(value)) return false;
      context.addIssue({ code: "custom", message: "Expected true or false." });
      return z.NEVER;
    }),
]);

const normalizedTelemetrySchema = z
  .object({
    timestamp: z.iso.datetime({ offset: true }),
    zone_id: z.string().trim().min(1).max(80),
    occupancy: finiteNumber.pipe(z.number().int().min(0)),
    capacity: finiteNumber.pipe(z.number().int().positive()),
    inflow_per_minute: finiteNumber.pipe(z.number().min(0)).optional(),
    outflow_per_minute: finiteNumber.pipe(z.number().min(0)).optional(),
    queue_minutes: finiteNumber.pipe(z.number().min(0)).optional(),
    temperature_c: finiteNumber.pipe(z.number().min(-50).max(80)).optional(),
    air_quality_index: finiteNumber.pipe(z.number().min(0).max(500)).optional(),
    noise_db: finiteNumber.pipe(z.number().min(0).max(200)).optional(),
    sensor_health: z.enum(["healthy", "degraded", "offline"]).optional().default("healthy"),
    blocked: booleanLike.optional().default(false),
    event_phase: z.enum(["pre-entry", "ingress", "live-match", "halftime", "egress"]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.occupancy > value.capacity) {
      context.addIssue({
        code: "custom",
        path: ["occupancy"],
        message: "Occupancy cannot exceed declared capacity.",
      });
    }
  });

export function normalizeMappedRows(
  rows: ImportRow[],
  mappings: ProposedMapping[],
  allowedZoneIds: ReadonlySet<string>,
): NormalizedImportResult {
  const issues: ValidationIssue[] = [];
  const targetFields = mappings
    .filter((mapping) => mapping.canonicalField)
    .map((mapping) => mapping.canonicalField);
  if (new Set(targetFields).size !== targetFields.length) {
    issues.push({
      row: 0,
      code: "DUPLICATE_MAPPING",
      message: "Two source columns cannot map to the same canonical field.",
      severity: "error",
    });
  }
  const normalized = rows.flatMap((row, index) => {
    const mapped = Object.fromEntries(
      mappings
        .filter((mapping) => mapping.canonicalField)
        .map((mapping) => [mapping.canonicalField, row[mapping.sourceColumn]]),
    );
    const result = normalizedTelemetrySchema.safeParse(mapped);
    if (!result.success) {
      for (const issue of result.error.issues)
        issues.push({
          row: index + 1,
          field: String(issue.path[0] ?? "row"),
          code: issue.code,
          message: issue.message,
          severity: "error",
        });
      return [];
    }
    if (!allowedZoneIds.has(result.data.zone_id)) {
      issues.push({
        row: index + 1,
        field: "zone_id",
        code: "UNKNOWN_ZONE",
        message: `Zone ${result.data.zone_id} is unknown and must be mapped.`,
        severity: "error",
      });
      return [];
    }
    return [result.data as unknown as Record<CanonicalField, unknown>];
  });

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  return {
    accepted: errorCount === 0 && normalized.length === rows.length,
    rows: normalized,
    issues,
    summary: {
      inputRows: rows.length,
      validRows: normalized.length,
      errorCount,
      warningCount: issues.length - errorCount,
    },
  };
}
