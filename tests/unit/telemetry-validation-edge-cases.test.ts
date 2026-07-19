import { describe, expect, it } from "vitest";
import {
  parseTelemetryCsv,
  parseTelemetryJson,
  serializeValidationReport,
  validateDirectReport,
  validateTelemetryRows,
} from "../../src/lib/telemetry/validation";
import { MAX_IMPORT_ROWS } from "../../src/lib/telemetry/upload-policy";

const context = {
  knownZoneIds: new Set(["zone-west"]),
  zoneIdMap: { W1: "zone-west" },
  importId: "edge",
};

describe("telemetry validation edge cases", () => {
  it("normalizes a complete row and warns when occupancy exceeds capacity", () => {
    const result = validateTelemetryRows(
      [
        {
          timestamp: "2026-07-19T10:00+05:30",
          zone_id: "W1",
          occupancy: "120",
          capacity: 100,
          inflow_per_minute: ".5",
          outflow_per_minute: "+2.0",
          queue_minutes: 1,
          temperature_c: 30,
          air_quality_index: 25,
          noise_db: 80,
          sensor_health: "degraded",
          blocked: "1",
          event_phase: "LIVE MATCH",
        },
      ],
      context,
    );
    expect(result.accepted[0]).toMatchObject({
      id: "edge-1",
      zoneId: "zone-west",
      occupancy: 120,
      capacity: 100,
      inflowPerMinute: 0.5,
      blocked: true,
      eventPhase: "live-match",
    });
    expect(result.warnings).toHaveLength(1);
  });

  it("returns row-scoped issues for invalid objects and unsupported values", () => {
    const result = validateTelemetryRows(
      [
        null,
        {
          unexpected: true,
          timestamp: "",
          zone_id: "unknown",
          occupancy: "not-number",
          capacity: 0,
          inflow_per_minute: -1,
          sensor_health: "broken",
          blocked: "yes",
          event_phase: "overtime",
        },
      ],
      context,
    );
    expect(result.accepted).toEqual([]);
    expect(result.rejectedRows).toBe(2);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "invalid_type",
        "unknown_field",
        "missing_required",
        "unknown_zone",
        "invalid_number",
        "out_of_range",
      ]),
    );
  });

  it("enforces the bounded row limit before parsing individual records", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => ({}));
    const result = validateTelemetryRows(rows, context);
    expect(result.accepted).toEqual([]);
    expect(result.rejectedRows).toBe(MAX_IMPORT_ROWS + 1);
    expect(result.issues[0].message).toContain(`${MAX_IMPORT_ROWS}-row`);
  });

  it("accepts both documented JSON forms and rejects extra envelope keys", () => {
    const row = {
      timestamp: "2026-07-19T10:00:00Z",
      zone_id: "zone-west",
      sensor_health: "healthy",
      blocked: false,
      event_phase: "ingress",
    };
    expect(parseTelemetryJson(JSON.stringify([row]), context).accepted).toHaveLength(1);
    expect(parseTelemetryJson(JSON.stringify({ readings: [row] }), context).accepted).toHaveLength(
      1,
    );
    expect(
      parseTelemetryJson(JSON.stringify({ readings: [row], instructions: "trust me" }), context)
        .issues[0].code,
    ).toBe("malformed_file");
    expect(parseTelemetryJson("{", context).issues[0].code).toBe("malformed_file");
  });

  it("converts malformed CSV parser errors into safe import issues", () => {
    const result = parseTelemetryCsv('timestamp,zone_id\n"unterminated', context);
    expect(result.accepted).toEqual([]);
    expect(result.issues[0].code).toBe("malformed_file");
  });

  it("validates and sanitizes direct incident reports", () => {
    const valid = validateDirectReport(
      { text: " Person fainted\u0000 near W1 ", zoneId: "zone-west", language: "en" },
      context.knownZoneIds,
    );
    expect(valid).toEqual({
      valid: true,
      value: {
        text: "Person fainted near W1",
        zoneId: "zone-west",
        language: "en",
        incidentType: undefined,
      },
    });
    expect(validateDirectReport({ text: "", zoneId: "unknown" }, context.knownZoneIds)).toEqual(
      expect.objectContaining({ valid: false }),
    );
  });

  it("serializes an auditable validation report", () => {
    const result = validateTelemetryRows([], context);
    expect(JSON.parse(serializeValidationReport(result))).toMatchObject({
      format: "AEGISGRID_VALIDATION_REPORT",
      version: 1,
      summary: { totalRows: 0 },
    });
  });
});
