import { safeOperationalError } from "../security";
import { unknownToJson, type ContractIssue } from "../validation";
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

  if (!repairHook) {
    return degradedAIOutcome(
      "invalid-response",
      {
        ...safeOperationalError(
          "AI_RESPONSE_INVALID",
          "AI analysis did not meet the required safety contract.",
          false,
        ),
        details: initial.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      },
      false,
    );
  }

  let repaired: unknown;
  try {
    repaired = await repairHook({
      schema: "AIRecommendation",
      contractVersion: AI_RECOMMENDATION_CONTRACT_VERSION,
      invalidResponse: raw,
      issues: initial.issues,
      instruction:
        "Return only corrected JSON matching the provided contract. Do not add facts, sources, prose, or markdown.",
    });
  } catch {
    return degradedAIOutcome(
      "invalid-response",
      safeOperationalError(
        "AI_REPAIR_FAILED",
        "AI analysis could not be safely repaired.",
        false,
      ),
      true,
    );
  }

  const repairedResult = validate(repaired, context);
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

