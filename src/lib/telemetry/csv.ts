import { MAX_IMPORT_ROWS } from "./upload-policy";

export class TelemetryParseError extends Error {
  readonly code = "MALFORMED_FILE";

  constructor(message: string) {
    super(message);
    this.name = "TelemetryParseError";
  }
}

/** RFC-4180-style parser with escaped quotes and quoted newlines. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) quoted = true;
    else if (character === ",") {
      record.push(field.trim());
      field = "";
    } else if (character === "\n") {
      record.push(field.trim());
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else if (character !== "\r") field += character;
  }
  if (quoted) throw new TelemetryParseError("CSV contains an unterminated quoted field.");
  record.push(field.trim());
  if (record.some((value) => value.length > 0)) records.push(record);
  if (records.length === 0) throw new TelemetryParseError("CSV is empty.");

  const headers = records[0].map((header) => header.trim());
  if (headers.some((header) => !header)) {
    throw new TelemetryParseError("CSV contains an empty column heading.");
  }
  if (new Set(headers).size !== headers.length) {
    throw new TelemetryParseError("CSV contains duplicate column headings.");
  }
  const body = records.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    throw new TelemetryParseError(`CSV exceeds the ${MAX_IMPORT_ROWS}-row limit.`);
  }

  return body.map((values, index) => {
    if (values.length !== headers.length) {
      throw new TelemetryParseError(
        `CSV row ${index + 2} has ${values.length} cells; expected ${headers.length}.`,
      );
    }
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
}

