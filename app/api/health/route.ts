import { getPersistenceCapability } from "../../../src/lib/firestore/repository";
import { jsonResponse, requestId } from "../../../src/lib/api/http";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const id = requestId(request);
  const aiAvailable = Boolean(process.env.GEMINI_API_KEY);
  const persistence = getPersistenceCapability();

  return jsonResponse({
    ok: true,
    service: "aegisgrid",
    version: "1.0.0",
    mode: aiAvailable ? "hybrid" : "degraded",
    ai: {
      available: aiAvailable,
      status: aiAvailable ? "configured" : "unavailable",
    },
    capabilities: {
      deterministicRisk: true,
      priorityQueue: true,
      routing: true,
      validation: true,
      semanticAnalysis: aiAvailable,
      generatedCommunication: aiAvailable,
      persistenceConfigured: persistence.configured,
      persistenceExpectedMode: persistence.expectedMode,
    },
    notice: aiAvailable
      ? "AI analysis is available; all operational actions still require human approval."
      : "AI analysis unavailable. Deterministic decision-support features remain active.",
  }, 200, id);
}
