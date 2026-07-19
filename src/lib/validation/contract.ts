export interface ContractIssue {
  path: string;
  code:
    | "invalid_type"
    | "missing_required"
    | "unknown_field"
    | "out_of_range"
    | "invalid_value"
    | "ungrounded_evidence"
    | "unsafe_content";
  message: string;
}

export type ContractResult<T> =
  { success: true; data: T } | { success: false; issues: ContractIssue[] };

export class ContractValidationError extends Error {
  readonly code = "CONTRACT_VALIDATION_FAILED";

  constructor(readonly issues: ContractIssue[]) {
    super("The response did not satisfy the required structured contract.");
    this.name = "ContractValidationError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: ContractIssue[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push({
        path: path ? `${path}.${key}` : key,
        code: "unknown_field",
        message: `Unknown field "${key}" is not allowed.`,
      });
    }
  }
}

export function requiredString(
  value: unknown,
  path: string,
  issues: ContractIssue[],
  options: { min?: number; max?: number } = {},
): string {
  if (typeof value !== "string") {
    issues.push({ path, code: "invalid_type", message: "Expected a string." });
    return "";
  }
  const trimmed = value.trim();
  const min = options.min ?? 1;
  const max = options.max ?? 2_000;
  if (trimmed.length < min || trimmed.length > max) {
    issues.push({
      path,
      code: "out_of_range",
      message: `String length must be between ${min} and ${max}.`,
    });
  }
  return trimmed;
}

export function finiteNumber(
  value: unknown,
  path: string,
  issues: ContractIssue[],
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, code: "invalid_type", message: "Expected a finite number." });
    return 0;
  }
  if (
    (options.min !== undefined && value < options.min) ||
    (options.max !== undefined && value > options.max) ||
    (options.integer === true && !Number.isInteger(value))
  ) {
    issues.push({
      path,
      code: "out_of_range",
      message: `Number is outside the permitted range${options.integer ? " or is not an integer" : ""}.`,
    });
  }
  return value;
}

export function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string,
  issues: ContractIssue[],
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    issues.push({
      path,
      code: "invalid_value",
      message: `Expected one of: ${allowed.join(", ")}.`,
    });
    return allowed[0];
  }
  return value as T[number];
}

export function requiredBoolean(value: unknown, path: string, issues: ContractIssue[]): boolean {
  if (typeof value !== "boolean") {
    issues.push({ path, code: "invalid_type", message: "Expected a boolean." });
    return false;
  }
  return value;
}

export function unknownToJson(value: unknown): ContractResult<unknown> {
  if (typeof value !== "string") return { success: true, data: value };
  try {
    return { success: true, data: JSON.parse(value) as unknown };
  } catch {
    return {
      success: false,
      issues: [
        {
          path: "$",
          code: "invalid_value",
          message: "Expected valid JSON without markdown fences or prose.",
        },
      ],
    };
  }
}
