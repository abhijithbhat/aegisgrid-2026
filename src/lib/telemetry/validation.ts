import type {
  DataImportResult,
  EventPhase,
  ImportIssue,
  IncidentType,
  SensorHealth,
  TelemetryReading,
} from "../../types";
import { sanitizePlainText } from "../security";
import { isRecord } from "../validation";
import { parseCsv, TelemetryParseError } from "./csv";
import { MAX_IMPORT_ROWS } from "./upload-policy";

const CANONICAL_KEYS = new Set([
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
]);

const PHASES = new Set<EventPhase>(["pre-entry", "ingress", "live-match", "halftime", "egress"]);
const SENSOR_HEALTH = new Set<SensorHealth>(["healthy", "degraded", "offline"]);
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export interface TelemetryValidationContext {
  knownZoneIds: ReadonlySet<string>;
  zoneIdMap?: Readonly<Record<string, string>>;
  importId?: string;
}

function valuePresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function parseNumber(
  value: unknown,
  field: string,
  row: number,
  issues: ImportIssue[],
  options: { min: number; max: number; required?: boolean },
): number | undefined {
  if (!valuePresent(value)) {
    if (options.required) {
      issues.push({ row, field, code: "missing_required", message: `${field} is required.` });
    }
    return undefined;
  }
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    issues.push({
      row,
      field,
      code: "invalid_number",
      message: `${field} must be a finite number.`,
      value,
    });
    return undefined;
  }
  if (parsed < options.min || parsed > options.max) {
    issues.push({
      row,
      field,
      code: "out_of_range",
      message: `${field} must be between ${options.min} and ${options.max}.`,
      value,
    });
  }
  return parsed;
}

function parseBoolean(
  value: unknown,
  field: string,
  row: number,
  issues: ImportIssue[],
): boolean | undefined {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  issues.push({ row, field, code: "invalid_type", message: `${field} must be true or false.` });
  return undefined;
}

function normalizedPhase(value: unknown): EventPhase | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase().replace(/[ _]/g, "-");
  return PHASES.has(normalized as EventPhase) ? (normalized as EventPhase) : undefined;
}

function validateRow(
  raw: unknown,
  row: number,
  context: TelemetryValidationContext,
): { reading?: TelemetryReading; issues: ImportIssue[]; warnings: string[] } {
  const issues: ImportIssue[] = [];
  const warnings: string[] = [];
  if (!isRecord(raw)) {
    return {
      issues: [{ row, code: "invalid_type", message: "Telemetry row must be an object." }],
      warnings,
    };
  }
  for (const key of Object.keys(raw)) {
    if (!CANONICAL_KEYS.has(key)) {
      issues.push({ row, field: key, code: "unknown_field", message: `Unknown field: ${key}.` });
    }
  }

  const timestamp = typeof raw.timestamp === "string" ? raw.timestamp.trim() : "";
  if (!timestamp) {
    issues.push({
      row,
      field: "timestamp",
      code: "missing_required",
      message: "timestamp is required.",
    });
  } else if (!ISO_TIMESTAMP.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    issues.push({
      row,
      field: "timestamp",
      code: "invalid_timestamp",
      message: "timestamp must be an ISO-8601 value with an explicit timezone.",
    });
  }

  const inputZoneId = typeof raw.zone_id === "string" ? raw.zone_id.trim() : "";
  const zoneId = context.zoneIdMap?.[inputZoneId] ?? inputZoneId;
  if (!inputZoneId) {
    issues.push({
      row,
      field: "zone_id",
      code: "missing_required",
      message: "zone_id is required.",
    });
  } else if (!context.knownZoneIds.has(zoneId)) {
    issues.push({
      row,
      field: "zone_id",
      code: "unknown_zone",
      message: `Unknown zone "${inputZoneId}"; map it before import.`,
    });
  }

  const occupancy = parseNumber(raw.occupancy, "occupancy", row, issues, {
    min: 0,
    max: 1_000_000,
  });
  const capacity = parseNumber(raw.capacity, "capacity", row, issues, { min: 1, max: 1_000_000 });
  if (occupancy !== undefined && capacity === undefined && !valuePresent(raw.capacity)) {
    issues.push({
      row,
      field: "capacity",
      code: "missing_required",
      message: "capacity is required when occupancy is supplied.",
    });
  }
  if (occupancy !== undefined && capacity !== undefined && occupancy > capacity) {
    warnings.push(`Row ${row}: occupancy exceeds stated capacity and should be reviewed.`);
  }
  const inflowPerMinute = parseNumber(raw.inflow_per_minute, "inflow_per_minute", row, issues, {
    min: 0,
    max: 100_000,
  });
  const outflowPerMinute = parseNumber(raw.outflow_per_minute, "outflow_per_minute", row, issues, {
    min: 0,
    max: 100_000,
  });
  const queueMinutes = parseNumber(raw.queue_minutes, "queue_minutes", row, issues, {
    min: 0,
    max: 1_440,
  });
  const temperatureC = parseNumber(raw.temperature_c, "temperature_c", row, issues, {
    min: -60,
    max: 100,
  });
  const airQualityIndex = parseNumber(raw.air_quality_index, "air_quality_index", row, issues, {
    min: 0,
    max: 1_000,
  });
  const noiseDb = parseNumber(raw.noise_db, "noise_db", row, issues, { min: 0, max: 220 });

  const sensorHealth =
    typeof raw.sensor_health === "string" && SENSOR_HEALTH.has(raw.sensor_health as SensorHealth)
      ? (raw.sensor_health as SensorHealth)
      : undefined;
  if (!sensorHealth) {
    issues.push({
      row,
      field: "sensor_health",
      code: valuePresent(raw.sensor_health) ? "invalid_type" : "missing_required",
      message: "sensor_health must be healthy, degraded, or offline.",
    });
  }
  const blocked = parseBoolean(raw.blocked, "blocked", row, issues);
  const eventPhase = normalizedPhase(raw.event_phase);
  if (!eventPhase) {
    issues.push({
      row,
      field: "event_phase",
      code: valuePresent(raw.event_phase) ? "invalid_type" : "missing_required",
      message: "event_phase is invalid.",
    });
  }

  if (issues.length || !sensorHealth || blocked === undefined || !eventPhase) {
    return { issues, warnings };
  }
  return {
    reading: {
      id: `${context.importId ?? "import"}-${row}`,
      timestamp,
      zoneId,
      occupancy,
      capacity,
      inflowPerMinute,
      outflowPerMinute,
      queueMinutes,
      temperatureC,
      airQualityIndex,
      noiseDb,
      sensorHealth,
      blocked,
      eventPhase,
    },
    issues,
    warnings,
  };
}

export function validateTelemetryRows(
  rows: readonly unknown[],
  context: TelemetryValidationContext,
): DataImportResult {
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      accepted: [],
      rejectedRows: rows.length,
      issues: [
        {
          code: "malformed_file",
          message: `Import exceeds the ${MAX_IMPORT_ROWS}-row safety limit.`,
        },
      ],
      warnings: [],
      summary: { totalRows: rows.length, acceptedRows: 0, rejectedRows: rows.length },
    };
  }
  const accepted: TelemetryReading[] = [];
  const issues: ImportIssue[] = [];
  const warnings: string[] = [];
  rows.forEach((raw, index) => {
    const result = validateRow(raw, index + 1, context);
    if (result.reading) accepted.push(result.reading);
    issues.push(...result.issues);
    warnings.push(...result.warnings);
  });
  const rejectedRows = rows.length - accepted.length;
  return {
    accepted,
    rejectedRows,
    issues,
    warnings,
    summary: {
      totalRows: rows.length,
      acceptedRows: accepted.length,
      rejectedRows,
    },
  };
}

export function parseTelemetryCsv(
  text: string,
  context: TelemetryValidationContext,
): DataImportResult {
  try {
    return validateTelemetryRows(parseCsv(text), context);
  } catch (error) {
    const message =
      error instanceof TelemetryParseError ? error.message : "CSV could not be parsed.";
    return {
      accepted: [],
      rejectedRows: 0,
      issues: [{ code: "malformed_file", message }],
      warnings: [],
      summary: { totalRows: 0, acceptedRows: 0, rejectedRows: 0 },
    };
  }
}

export function parseTelemetryJson(
  text: string,
  context: TelemetryValidationContext,
): DataImportResult {
  try {
    const parsed = JSON.parse(text) as unknown;
    let rows: unknown;
    if (Array.isArray(parsed)) rows = parsed;
    else if (
      isRecord(parsed) &&
      Object.keys(parsed).length === 1 &&
      Array.isArray(parsed.readings)
    ) {
      rows = parsed.readings;
    } else throw new Error("JSON must be an array or an object containing only a readings array.");
    return validateTelemetryRows(rows as unknown[], context);
  } catch (error) {
    return {
      accepted: [],
      rejectedRows: 0,
      issues: [
        {
          code: "malformed_file",
          message:
            error instanceof Error
              ? sanitizePlainText(error.message, 300)
              : "JSON could not be parsed.",
        },
      ],
      warnings: [],
      summary: { totalRows: 0, acceptedRows: 0, rejectedRows: 0 },
    };
  }
}

export interface DirectReportInput {
  text: string;
  zoneId?: string;
  language?: string;
  incidentType?: IncidentType;
}

export function validateDirectReport(
  input: DirectReportInput,
  knownZoneIds: ReadonlySet<string>,
): { valid: true; value: DirectReportInput } | { valid: false; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const text = typeof input.text === "string" ? sanitizePlainText(input.text, 10_000) : "";
  if (!text)
    issues.push({ field: "text", code: "missing_required", message: "Report text is required." });
  if (input.zoneId && !knownZoneIds.has(input.zoneId)) {
    issues.push({ field: "zoneId", code: "unknown_zone", message: "Unknown report zone." });
  }
  return issues.length
    ? { valid: false, issues }
    : {
        valid: true,
        value: {
          text,
          zoneId: input.zoneId,
          language: sanitizePlainText(input.language ?? "und", 35),
          incidentType: input.incidentType,
        },
      };
}

export function serializeValidationReport(result: DataImportResult): string {
  return JSON.stringify(
    {
      format: "AEGISGRID_VALIDATION_REPORT",
      version: 1,
      summary: result.summary,
      issues: result.issues,
      warnings: result.warnings,
    },
    null,
    2,
  );
}
