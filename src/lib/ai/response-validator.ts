import { safeOperationalError } from "../security";
import { isRecord, unknownToJson, type ContractIssue } from "../validation";
import {
  AI_RECOMMENDATION_CONTRACT_VERSION,
  parseAIRecommendation,
  type AIContractContext,
} from "./contracts";
import { degradedAIOutcome, type AIAnalysisOutcome } from "./degraded";

export interface RepairRequest {
  schema: "AIRecommendation";
  contractVersion: string;
  invalidResponse: unknown;
  issues: readonly ContractIssue[];
  instruction: string;
}

export type AIRepairHook = (request: RepairRequest) => Promise<unknown>;

function validate(raw: unknown, context: AIContractContext) {
  const json = unknownToJson(raw);
  if (!json.success) return json;
  return parseAIRecommendation(json.data, context);
}

function constrainReferencesToContext(
  raw: unknown,
  context: AIContractContext,
): { value: unknown; changed: boolean } {
  const json = unknownToJson(raw);
  if (!json.success || !isRecord(json.data)) return { value: raw, changed: false };

  const allowed =
    context.allowedSourceIds instanceof Set
      ? context.allowedSourceIds
      : new Set(context.allowedSourceIds);
  let changed = false;
  const value = { ...json.data };

  if (Array.isArray(value.evidence)) {
    const evidence = value.evidence.filter((item) => {
      const keep =
        isRecord(item) && typeof item.sourceId === "string" && allowed.has(item.sourceId);
      if (!keep) changed = true;
      return keep;
    });
    // Never turn a wholly ungrounded response into an accepted one. At least
    // one provider-supplied citation must already match the request context.
    if (evidence.length > 0) value.evidence = evidence;
  }

  if (Array.isArray(value.contradictions)) {
    value.contradictions = value.contradictions.flatMap((item) => {
      if (!isRecord(item) || !Array.isArray(item.sourceIds)) return [item];
      const sourceIds = [
        ...new Set(
          item.sourceIds.filter(
            (sourceId): sourceId is string => typeof sourceId === "string" && allowed.has(sourceId),
          ),
        ),
      ];
      if (sourceIds.length !== item.sourceIds.length) changed = true;
      if (sourceIds.length < 2) {
        changed = true;
        return [];
      }
      return [{ ...item, sourceIds }];
    });
  }

  return { value, changed };
}

/**
 * Validates provider output, permits exactly one constrained repair attempt,
 * then fails safely while deterministic capabilities remain available.
 */
export async function validateAIResponse(
  raw: unknown,
  context: AIContractContext,
  repairHook?: AIRepairHook,
): Promise<AIAnalysisOutcome> {
  const initial = validate(raw, context);
  if (initial.success) {
    return {
      status: "available",
      recommendation: initial.data,
      contractVersion: AI_RECOMMENDATION_CONTRACT_VERSION,
      repairAttempted: false,
    };
  }

  // Unsupported citations can be removed safely without asking a model to
  // invent replacements. No facts, risk values, routes, or actions are added.
  const constrained = constrainReferencesToContext(raw, context);
  const constrainedResult = constrained.changed ? validate(constrained.value, context) : initial;
  if (constrainedResult.success) {
    return {
      status: "available",
      recommendation: constrainedResult.data,
      contractVersion: AI_RECOMMENDATION_CONTRACT_VERSION,
      repairAttempted: true,
    };
  }

  if (!repairHook) {
    return degradedAIOutcome(
      "invalid-response",
      {
        ...safeOperationalError(
          "AI_RESPONSE_INVALID",
          "AI analysis did not meet the required safety contract.",
          false,
        ),
        details: constrainedResult.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
      false,
    );
  }

  let repaired: unknown;
  try {
    repaired = await repairHook({
      schema: "AIRecommendation",
      contractVersion: AI_RECOMMENDATION_CONTRACT_VERSION,
      invalidResponse: constrained.value,
      issues: constrainedResult.issues,
      instruction:
        "Return only corrected JSON matching the provided contract. Use only exact IDs from allowedSourceIds. If fewer than two allowed IDs exist, contradictions must be empty. Do not add facts, sources, prose, or markdown.",
    });
  } catch {
    return degradedAIOutcome(
      "invalid-response",
      safeOperationalError("AI_REPAIR_FAILED", "AI analysis could not be safely repaired.", false),
      true,
    );
  }

  const constrainedRepair = constrainReferencesToContext(repaired, context);
  const repairedResult = validate(constrainedRepair.value, context);
  if (repairedResult.success) {
    return {
      status: "available",
      recommendation: repairedResult.data,
      contractVersion: AI_RECOMMENDATION_CONTRACT_VERSION,
      repairAttempted: true,
    };
  }

  return degradedAIOutcome(
    "invalid-response",
    {
      ...safeOperationalError(
        "AI_RESPONSE_INVALID_AFTER_REPAIR",
        "AI analysis remained invalid after one repair attempt.",
        false,
      ),
      details: repairedResult.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    },
    true,
  );
}
