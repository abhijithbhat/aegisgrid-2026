import { AI_RECOMMENDATION_JSON_SCHEMA } from "./schemas";
import { geminiCapability, generateStructuredJson, GeminiInvocationError } from "./gemini";
import { AIProviderFailure, type AIProvider } from "../ai/provider";

function providerFailure(error: unknown): AIProviderFailure {
  if (error instanceof GeminiInvocationError) {
    if (error.code === "AI_TIMEOUT") return new AIProviderFailure("TIMEOUT", error.retryable);
    if (error.code === "AI_RATE_LIMITED") return new AIProviderFailure("RATE_LIMITED", error.retryable);
    if (error.code === "AI_INVALID_RESPONSE") return new AIProviderFailure("INVALID_REQUEST", false);
  }
  return new AIProviderFailure("UNAVAILABLE", true);
}

/** Server-only adapter connecting the runtime-neutral AI orchestrator to Gemini. */
export function createGeminiProvider(): AIProvider | undefined {
  if (!geminiCapability().available) return undefined;

  return {
    name: "google-gemini",
    async generateStructured(request) {
      if (request.signal.aborted) throw new AIProviderFailure("TIMEOUT", true);
      let data: unknown;
      try {
        data = JSON.parse(request.dataPayload) as unknown;
      } catch {
        throw new AIProviderFailure("INVALID_REQUEST", false);
      }

      try {
        const result = await generateStructuredJson({
          requestId: crypto.randomUUID(),
          systemInstruction: request.systemPrompt,
          trustedContext: {
            responseContract: "AIRecommendation",
            purpose: request.purpose,
            outputRule: "Return only the requested JSON object.",
          },
          untrustedData: data,
          task: request.purpose === "repair"
            ? "Correct the supplied response using only the supplied facts and validation issues."
            : "Produce an evidence-grounded incident recommendation for supervisor review.",
          responseJsonSchema: AI_RECOMMENDATION_JSON_SCHEMA,
          temperature: request.purpose === "repair" ? 0 : 0.15,
          maxOutputTokens: 4_096,
          attempts: 1,
          signal: request.signal,
          returnRawText: true,
        });
        if (request.signal.aborted) throw new AIProviderFailure("TIMEOUT", true);
        return result.data;
      } catch (error) {
        if (error instanceof AIProviderFailure) throw error;
        throw providerFailure(error);
      }
    },
  };
}
