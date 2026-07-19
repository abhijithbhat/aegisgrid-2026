import type { AIRecommendation, StructuredError } from "../../types";

export type AICapability =
  | "semantic-fusion"
  | "contradiction-reasoning"
  | "incident-interpretation"
  | "schema-mapping"
  | "announcement-generation";

export type DeterministicCapability = "risk-scoring" | "routing" | "telemetry";

export type AIAnalysisOutcome =
  | {
      status: "available";
      recommendation: AIRecommendation;
      contractVersion: string;
      repairAttempted: boolean;
    }
  | {
      status: "degraded";
      notice: "AI analysis unavailable";
      deterministicCapabilities: readonly DeterministicCapability[];
      unavailableCapabilities: readonly AICapability[];
      reason: "provider-unavailable" | "timeout" | "invalid-response" | "not-configured";
      error: StructuredError;
      repairAttempted: boolean;
    };

export function degradedAIOutcome(
  reason: Extract<AIAnalysisOutcome, { status: "degraded" }>["reason"],
  error: StructuredError,
  repairAttempted = false,
): AIAnalysisOutcome {
  return {
    status: "degraded",
    notice: "AI analysis unavailable",
    deterministicCapabilities: ["risk-scoring", "routing", "telemetry"],
    unavailableCapabilities: [
      "semantic-fusion",
      "contradiction-reasoning",
      "incident-interpretation",
      "schema-mapping",
      "announcement-generation",
    ],
    reason,
    error,
    repairAttempted,
  };
}
