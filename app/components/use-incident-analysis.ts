"use client";

import { useEffect, useRef, useState } from "react";
import type { AIRecommendation } from "../../src/types";

export type AiState = "checking" | "available" | "unavailable";
export type IncidentAnalysisState =
  | { status: "loading"; progress: { stage: string; detail: string }[] }
  | { status: "available"; recommendation: AIRecommendation }
  | { status: "unavailable"; reason: string };

type AnalysisStreamResult = {
  outcome?:
    | { status: "available"; recommendation: AIRecommendation }
    | { status: "degraded"; reason?: string; error?: { message?: string } };
  error?: { message?: string };
};

/** Owns provider health, streaming analysis, deduplication, and fail-safe state. */
export function useIncidentAnalysis(analysisRequestBody: string) {
  const [aiState, setAiState] = useState<AiState>("checking");
  const [analysisByIncident, setAnalysisByIncident] = useState<
    Record<string, IncidentAnalysisState>
  >({});
  const analysisStateRef = useRef(analysisByIncident);
  const validatedRequestByIncident = useRef(new Map<string, string>());

  useEffect(() => {
    analysisStateRef.current = analysisByIncident;
  }, [analysisByIncident]);

  useEffect(() => {
    let active = true;
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("health unavailable");
        const data = (await response.json()) as Record<string, unknown>;
        const ai = data.ai as Record<string, unknown> | undefined;
        const services = data.services as
          | Record<string, Record<string, unknown>>
          | undefined;
        const rawStatus = String(
          ai?.status ?? services?.ai?.status ?? data.aiStatus ?? "",
        ).toLowerCase();
        const available =
          data.aiAvailable === true ||
          ai?.available === true ||
          ["ok", "ready", "available", "configured", "connected"].includes(rawStatus);
        if (active) setAiState(available ? "available" : "unavailable");
      })
      .catch(() => {
        if (active) setAiState("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (aiState !== "available") return;
    const requestPayload = JSON.parse(analysisRequestBody) as { incidentId: string };
    const incidentId = requestPayload.incidentId;
    const previousValidatedRequest = validatedRequestByIncident.current.get(incidentId);
    if (previousValidatedRequest === analysisRequestBody) return;
    if (
      !previousValidatedRequest &&
      analysisStateRef.current[incidentId]?.status === "available"
    ) {
      // Direct reports already carry a contract-validated recommendation.
      validatedRequestByIncident.current.set(incidentId, analysisRequestBody);
      return;
    }

    const controller = new AbortController();
    void Promise.resolve()
      .then(() => {
        if (!controller.signal.aborted) {
          setAnalysisByIncident((current) => ({
            ...current,
            [incidentId]: { status: "loading", progress: [] },
          }));
        }
        return fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "text/event-stream" },
          signal: controller.signal,
          body: analysisRequestBody,
        });
      })
      .then(async (response) => {
        if (!response.ok || !response.body) throw new Error("Analysis request failed.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let body: AnalysisStreamResult | undefined;

        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const event = frame.match(/^event: (.+)$/m)?.[1];
            const data = frame.match(/^data: (.+)$/m)?.[1];
            if (!event || !data) continue;
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (event === "reasoning") {
              const stage =
                typeof parsed.stage === "string" ? parsed.stage : "Reasoning update";
              const detail = typeof parsed.detail === "string" ? parsed.detail : "";
              setAnalysisByIncident((current) => {
                const currentAnalysis = current[incidentId];
                return currentAnalysis?.status === "loading"
                  ? {
                      ...current,
                      [incidentId]: {
                        ...currentAnalysis,
                        progress: [...currentAnalysis.progress, { stage, detail }],
                      },
                    }
                  : current;
              });
            }
            if (event === "result") body = parsed as AnalysisStreamResult;
          }
          if (done) break;
        }

        if (!body) throw new Error("Analysis stream ended before a validated result.");
        const outcome = body.outcome;
        if (!outcome) throw new Error(body.error?.message ?? "Analysis request failed.");
        if (outcome.status === "available") {
          validatedRequestByIncident.current.set(incidentId, analysisRequestBody);
          setAnalysisByIncident((current) => ({
            ...current,
            [incidentId]: { status: "available", recommendation: outcome.recommendation },
          }));
        } else {
          setAnalysisByIncident((current) => ({
            ...current,
            [incidentId]: {
              status: "unavailable",
              reason:
                outcome.error?.message ?? outcome.reason ?? "Provider unavailable",
            },
          }));
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAnalysisByIncident((current) => ({
          ...current,
          [incidentId]: {
            status: "unavailable",
            reason: error instanceof Error ? error.message : "Analysis request failed.",
          },
        }));
      });

    return () => controller.abort();
  }, [aiState, analysisRequestBody]);

  return { aiState, analysisByIncident, setAnalysisByIncident } as const;
}
