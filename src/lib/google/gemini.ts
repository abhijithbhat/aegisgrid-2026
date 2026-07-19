import { GoogleGenAI } from "@google/genai";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_AI_TIMEOUT_MS = 12_000;

export interface GeminiInvocation<T = unknown> {
  data: T;
  model: string;
  durationMs: number;
  requestId: string;
}

export type GeminiFailureCode =
  "AI_UNAVAILABLE" | "AI_TIMEOUT" | "AI_RATE_LIMITED" | "AI_INVALID_RESPONSE";

export class GeminiInvocationError extends Error {
  constructor(
    public readonly code: GeminiFailureCode,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "GeminiInvocationError";
  }
}

export interface StructuredGenerationRequest {
  requestId: string;
  systemInstruction: string;
  trustedContext: unknown;
  untrustedData: unknown;
  task: string;
  responseJsonSchema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  attempts?: number;
  signal?: AbortSignal;
  /** Lets the contract validator see malformed JSON so it can run one repair. */
  returnRawText?: boolean;
}

function configuration(): {
  apiKey: string;
  model: string;
  timeout: number;
  attempts: number;
} | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const configuredTimeout = Number(process.env.AI_TIMEOUT_MS ?? DEFAULT_AI_TIMEOUT_MS);
  const configuredRetries = Number(process.env.AI_MAX_RETRIES ?? 1);
  return {
    apiKey,
    model,
    timeout: Number.isFinite(configuredTimeout)
      ? Math.min(30_000, Math.max(2_000, configuredTimeout))
      : DEFAULT_AI_TIMEOUT_MS,
    attempts: Number.isFinite(configuredRetries)
      ? Math.min(2, Math.max(1, Math.trunc(configuredRetries) + 1))
      : 2,
  };
}

export function geminiCapability(): { available: boolean; model: string | null } {
  const config = configuration();
  return { available: config !== null, model: config?.model ?? null };
}

function normalizeProviderError(error: unknown): GeminiInvocationError {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  // Log the provider error for operational diagnostics (no secrets or request bodies).
  console.error(
    JSON.stringify({
      severity: "ERROR",
      component: "gemini-provider",
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }),
  );
  if (message.includes("timeout") || message.includes("abort"))
    return new GeminiInvocationError("AI_TIMEOUT", true);
  if (message.includes("429") || message.includes("rate") || message.includes("quota"))
    return new GeminiInvocationError("AI_RATE_LIMITED", true);
  return new GeminiInvocationError("AI_UNAVAILABLE", true);
}

/**
 * Server-side Gemini structured-output boundary. Uploaded text is serialized in
 * a dedicated untrusted block and is never concatenated with instructions.
 */
export async function generateStructuredJson<T = unknown>(
  request: StructuredGenerationRequest,
): Promise<GeminiInvocation<T>> {
  const config = configuration();
  if (!config) throw new GeminiInvocationError("AI_UNAVAILABLE", false);
  const started = Date.now();
  const ai = new GoogleGenAI({
    apiKey: config.apiKey,
    httpOptions: {
      timeout: config.timeout,
      retryOptions: { attempts: request.attempts ?? config.attempts },
    },
  });
  const contents = [
    "<trusted_context>",
    JSON.stringify(request.trustedContext),
    "</trusted_context>",
    "<untrusted_data>",
    JSON.stringify(request.untrustedData),
    "</untrusted_data>",
    "<task>",
    request.task,
    "</task>",
  ].join("\n");

  try {
    const response = await ai.models.generateContent({
      model: config.model,
      contents,
      config: {
        systemInstruction: request.systemInstruction,
        responseMimeType: "application/json",
        responseJsonSchema: request.responseJsonSchema,
        temperature: request.temperature ?? 0.15,
        maxOutputTokens: request.maxOutputTokens ?? 4_096,
        abortSignal: request.signal
          ? AbortSignal.any([request.signal, AbortSignal.timeout(config.timeout)])
          : AbortSignal.timeout(config.timeout),
      },
    });
    const text = response.text?.trim();
    if (!text) throw new GeminiInvocationError("AI_INVALID_RESPONSE", false);
    if (request.returnRawText) {
      return {
        data: text as T,
        model: config.model,
        durationMs: Date.now() - started,
        requestId: request.requestId,
      };
    }
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new GeminiInvocationError("AI_INVALID_RESPONSE", false);
    }
    return {
      data,
      model: config.model,
      durationMs: Date.now() - started,
      requestId: request.requestId,
    };
  } catch (error) {
    if (error instanceof GeminiInvocationError) throw error;
    throw normalizeProviderError(error);
  }
}
