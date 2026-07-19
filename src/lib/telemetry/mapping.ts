import type { ImportIssue, ProposedFieldMapping } from "../../types";

export interface ApplyMappingsResult {
  rows: Array<Record<string, unknown>>;
  issues: ImportIssue[];
}

/** Applies only mappings that are high-confidence or explicitly confirmed. */
export function applyApprovedMappings(
  rows: readonly Record<string, unknown>[],
  mappings: readonly ProposedFieldMapping[],
  confirmedSourceFields: ReadonlySet<string>,
): ApplyMappingsResult {
  const issues: ImportIssue[] = [];
  const approved = mappings.filter((mapping) => {
    if (mapping.targetField === null) return false;
    const needsConfirmation = mapping.requiresConfirmation || mapping.confidence < 0.9;
    if (needsConfirmation && !confirmedSourceFields.has(mapping.sourceField)) {
      issues.push({
        field: mapping.sourceField,
        code: "missing_required",
        message: `Mapping for ${mapping.sourceField} requires explicit confirmation.`,
      });
      return false;
    }
    return true;
  });
  const targetFields = approved.map((mapping) => mapping.targetField);
  if (new Set(targetFields).size !== targetFields.length) {
    issues.push({
      code: "malformed_file",
      message: "Multiple uploaded fields cannot map to the same canonical field.",
    });
    return { rows: [], issues };
  }
  return {
    rows: rows.map((row) =>
      Object.fromEntries(
        approved.map((mapping) => [mapping.targetField, row[mapping.sourceField]]),
      ),
    ),
    issues,
  };
}
