import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIRecommendation } from "../../src/types";
import { AIProviderFailure, analyzeWithProvider, type AIProvider } from "../../src/lib/ai/provider";

const recommendation = (): AIRecommendation => ({
  summary: "One person is reported unconscious near the west food court.",
  incidentType: "medical",
  severity: "critical",
  confidence: 0.91,
  evidence: [{ sourceId: "SRC-1", fact: "A person is reported unconscious.", weight: 0.9 }],
  contradictions: [],
  missingInformation: ["Breathing status is not confirmed."],
  clarifyingQuestions: ["Is the person breathing normally?"],
  recommendedActions: [{ priority: 1, action: "Prepare a medical response for supervisor approval.", ownerRole: "medical lead", targetMinutes: 1, justification: "The cited report describes unresponsiveness.", requiresApproval: true }],
  recommendedTeamType: "medical",
  equipment: ["AED"],
  announcement: { language: "en", tone: "calm", text: "Please keep the west food court access clear." },
  uncertaintyNote: "Current breathing status is unknown.",
  requiresHumanApproval: true,
});

const baseInput = {
  systemPrompt: "Return safe structured JSON.",
  dataPayload: JSON.stringify({ sources: [{ sourceId: "SRC-1" }] }),
  contractContext: { allowedSourceIds: ["SRC-1"] },
} as const;

afterEach(() => vi.useRealTimers());

describe("AI provider orchestration", () => {
  it("returns honest degraded mode when no provider is configured", async () => {
    const outcome = await analyzeWithProvider(baseInput);
    expect(outcome.status).toBe("degraded");
    if (outcome.status === "degraded") expect(outcome.reason).toBe("not-configured");
  });

  it("repairs malformed JSON exactly once and revalidates it", async () => {
    const generateStructured = vi.fn(async ({ purpose, dataPayload }: { purpose: "incident-analysis" | "repair"; dataPayload: string }) => {
      if (purpose === "incident-analysis") return "{not-json";
      const repairData = JSON.parse(dataPayload) as { allowedSourceIds: string[] };
      expect(repairData.allowedSourceIds).toEqual(["SRC-1"]);
      return JSON.stringify(recommendation());
    });
    const provider: AIProvider = { name: "test", generateStructured };
    const outcome = await analyzeWithProvider({ ...baseInput, provider, maxAttempts: 1 });
    expect(generateStructured).toHaveBeenCalledTimes(2);
    expect(outcome.status).toBe("available");
    expect(outcome.repairAttempted).toBe(true);
  });

  it("aborts a cooperative provider at the bounded deadline", async () => {
    vi.useFakeTimers();
    const provider: AIProvider = {
      name: "slow-test",
      generateStructured: ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new AIProviderFailure("TIMEOUT", true)), { once: true });
      }),
    };
    const pending = analyzeWithProvider({ ...baseInput, provider, timeoutMs: 1_000, maxAttempts: 1 });
    await vi.advanceTimersByTimeAsync(1_001);
    const outcome = await pending;
    expect(outcome.status).toBe("degraded");
    if (outcome.status === "degraded") expect(outcome.reason).toBe("timeout");
  });
});
