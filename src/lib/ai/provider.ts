import { safeOperationalError } from "../security";
import type { AIContractContext } from "./contracts";
import { degradedAIOutcome, type AIAnalysisOutcome } from "./degraded";
import { validateAIResponse } from "./response-validator";

export interface StructuredGenerationRequest {
  purpose: "incident-analysis" | "repair";
  systemPrompt: string;
  dataPayload: string;
  signal: AbortSignal;
}

/** Adapter boundary implemented by Gemini on server runtimes. */
export interface AIProvider {
  readonly name: string;
  generateStructured(request: StructuredGenerationRequest): Promise<unknown>;
}

export class AIProviderFailure extends Error {
  constructor(
    readonly code: "TIMEOUT" | "UNAVAILABLE" | "RATE_LIMITED" | "INVALID_REQUEST",
    readonly retryable: boolean,
  ) {
    super("AI provider request failed.");
    this.name = "AIProviderFailure";
  }
}

export interface AnalyzeWithProviderInput {
  provider?: AIProvider;
  systemPrompt: string;
  dataPayload: string;
  contractContext: AIContractContext;
  timeoutMs?: number;
  maxAttempts?: 1 | 2;
}

async function generateWithTimeout(
  provider: AIProvider,
  request: Omit<StructuredGenerationRequest, "signal">,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await provider.generateStructured({ ...request, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new AIProviderFailure("TIMEOUT", true);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Runtime-neutral orchestration; no provider key or SDK is needed at build time. */
export async function analyzeWithProvider(
  input: AnalyzeWithProviderInput,
): Promise<AIAnalysisOutcome> {
  if (!input.provider) {
    return degradedAIOutcome(
      "not-configured",
      safeOperationalError(
        "AI_NOT_CONFIGURED",
        "AI analysis is not configured for this deployment.",
        false,
      ),
    );
  }
  const timeoutMs = Math.min(30_000, Math.max(1_000, input.timeoutMs ?? 12_000));
  const maxAttempts = input.maxAttempts ?? 2;
  let raw: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      raw = await generateWithTimeout(
        input.provider,
        {
          purpose: "incident-analysis",
          systemPrompt: input.systemPrompt,
          dataPayload: input.dataPayload,
        },
        timeoutMs,
      );
      break;
    } catch (error) {
      const retryable = error instanceof AIProviderFailure && error.retryable;
      if (!retryable || attempt === maxAttempts) {
        const timedOut = error instanceof AIProviderFailure && error.code === "TIMEOUT";
        return degradedAIOutcome(
          timedOut ? "timeout" : "provider-unavailable",
          safeOperationalError(
            timedOut ? "AI_TIMEOUT" : "AI_PROVIDER_UNAVAILABLE",
            timedOut
              ? "AI analysis timed out; deterministic assessment remains available."
              : "AI provider is unavailable; deterministic assessment remains available.",
            retryable,
          ),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100 + Math.floor(Math.random() * 100)));
    }
  }

  return validateAIResponse(raw, input.contractContext, async (repairRequest) =>
    generateWithTimeout(
      input.provider as AIProvider,
      {
        purpose: "repair",
        systemPrompt: repairRequest.instruction,
        dataPayload: JSON.stringify({
          contractVersion: repairRequest.contractVersion,
          issues: repairRequest.issues,
          invalidResponse: repairRequest.invalidResponse,
        }),
      },
      timeoutMs,
    ),
  );
}

