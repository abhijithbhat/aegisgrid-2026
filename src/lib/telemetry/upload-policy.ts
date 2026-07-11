import type { ImportIssue } from "../../types";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_000;

export type SupportedUploadKind = "csv" | "json" | "pdf" | "text";

export interface UploadDescriptor {
  name: string;
  size: number;
  mimeType: string;
}

export type UploadPolicyResult =
  | { valid: true; kind: SupportedUploadKind }
  | { valid: false; issues: ImportIssue[] };

const POLICIES: Record<SupportedUploadKind, { extensions: string[]; mimeTypes: string[] }> = {
  csv: {
    extensions: [".csv"],
    mimeTypes: ["text/csv", "application/csv", "application/vnd.ms-excel"],
  },
  json: {
    extensions: [".json"],
    mimeTypes: ["application/json", "text/json"],
  },
  pdf: { extensions: [".pdf"], mimeTypes: ["application/pdf"] },
  text: { extensions: [".txt"], mimeTypes: ["text/plain"] },
};

export function validateUploadDescriptor(descriptor: UploadDescriptor): UploadPolicyResult {
  const issues: ImportIssue[] = [];
  if (!Number.isSafeInteger(descriptor.size) || descriptor.size < 0) {
    issues.push({ code: "invalid_number", field: "size", message: "File size is invalid." });
  } else if (descriptor.size > MAX_UPLOAD_BYTES) {
    issues.push({
      code: "file_too_large",
      field: "size",
      message: "File exceeds the 2 MB upload limit.",
      value: descriptor.size,
    });
  }

  const lowerName = descriptor.name.toLowerCase();
  const normalizedMime = descriptor.mimeType.toLowerCase().split(";", 1)[0].trim();
  // Determine type from both extension and MIME. A mismatch is rejected instead
  // of trusting a user-controlled filename alone.
  const matchedKind = (Object.keys(POLICIES) as SupportedUploadKind[]).find((candidate) => {
    const policy = POLICIES[candidate];
    return (
      policy.extensions.some((extension) => lowerName.endsWith(extension)) &&
      policy.mimeTypes.includes(normalizedMime)
    );
  });
  if (!matchedKind) {
    issues.push({
      code: "unsupported_file",
      field: "mimeType",
      message: "Only CSV, JSON, PDF, and plain-text files with matching MIME types are supported.",
    });
  }

  return issues.length || !matchedKind
    ? { valid: false, issues }
    : { valid: true, kind: matchedKind };
}
