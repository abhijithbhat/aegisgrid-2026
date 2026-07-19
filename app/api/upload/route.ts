import { z } from "zod";
import { SCHEMA_MAPPING_SYSTEM_PROMPT } from "../../../prompts/schema-mapping/system";
import {
  enforceRateLimit,
  isResponse,
  jsonResponse,
  MAX_UPLOAD_BYTES,
  parseJson,
  publicError,
  rejectCrossOriginRequest,
  requestId,
  structuredLog,
} from "../../../src/lib/api/http";
import {
  CANONICAL_FIELDS,
  ImportValidationError,
  normalizeMappedRows,
  parseUpload,
  proposeMappings,
  type ImportRow,
  type ProposedMapping,
} from "../../../src/lib/data/importer";
import { geminiCapability, generateStructuredJson } from "../../../src/lib/google/gemini";
import { SCHEMA_MAPPING_JSON_SCHEMA } from "../../../src/lib/google/schemas";

export const runtime = "nodejs";

const ALLOWED_ZONE_IDS = new Set([
  "GATE-W",
  "GATE-N",
  "GATE-E",
  "GATE-S",
  "W-CONC",
  "N-CONC",
  "E-CONC",
  "S-CONC",
  "SEAT-NW",
  "SEAT-NE",
  "SEAT-SW",
  "SEAT-SE",
  "FOOD",
  "MEDICAL",
  "CONTROL",
  "ACCESS-CORR",
  "SERVICE-TUNNEL",
  "TRANSIT",
  "EXIT-NW",
  "EXIT-NE",
  "EXIT-SW",
  "EXIT-SE",
]);

const mappingSchema = z
  .object({
    sourceColumn: z.string().trim().min(1).max(200),
    canonicalField: z.enum(CANONICAL_FIELDS).nullable(),
    confidence: z.number().min(0).max(1),
    rationale: z.string().trim().max(500),
    requiresApproval: z.literal(true),
    source: z.enum(["canonical", "heuristic", "ai"]),
  })
  .strict();

const scalarSchema = z.union([z.string().max(8_000), z.number().finite(), z.boolean(), z.null()]);

const validateRequestSchema = z
  .object({
    action: z.literal("validate"),
    rows: z
      .array(z.record(z.string().max(200), scalarSchema))
      .min(1)
      .max(1_000),
    mappings: z.array(mappingSchema).min(1).max(40),
  })
  .strict();

const mappingPreviewSchema = z
  .object({
    action: z.literal("map-columns"),
    columns: z.array(z.string().trim().min(1).max(200)).min(1).max(40),
  })
  .strict();

const jsonActionSchema = z.discriminatedUnion("action", [
  validateRequestSchema,
  mappingPreviewSchema,
]);

const aiMappingResponseSchema = z
  .object({
    mappings: z
      .array(mappingSchema.extend({ source: z.literal("ai") }))
      .min(1)
      .max(40),
  })
  .strict();

async function aiMappingsForUpload(
  parsed: Awaited<ReturnType<typeof parseUpload>>,
  id: string,
): Promise<ProposedMapping[] | null> {
  if (parsed.canonical || !geminiCapability().available) return null;
  try {
    const sampleRows = parsed.rows
      .slice(0, 4)
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            typeof value === "string" ? value.slice(0, 2_000) : value,
          ]),
        ),
      );
    const generated = await generateStructuredJson({
      requestId: id,
      systemInstruction: SCHEMA_MAPPING_SYSTEM_PROMPT,
      trustedContext: { canonicalFields: CANONICAL_FIELDS },
      untrustedData: { sourceColumns: parsed.headers, sampleRows },
      task: "Propose one mapping for every source column. This is advisory and always requires explicit supervisor approval.",
      responseJsonSchema: SCHEMA_MAPPING_JSON_SCHEMA,
      temperature: 0.05,
      maxOutputTokens: 2_048,
      attempts: 1,
    });
    const validated = aiMappingResponseSchema.safeParse(generated.data);
    if (!validated.success) return null;
    const sourceColumns = validated.data.mappings.map((item) => item.sourceColumn);
    if (
      sourceColumns.length !== parsed.headers.length ||
      new Set(sourceColumns).size !== sourceColumns.length ||
      parsed.headers.some((header) => !sourceColumns.includes(header))
    )
      return null;
    const targets = validated.data.mappings.flatMap((item) =>
      item.canonicalField ? [item.canonicalField] : [],
    );
    if (new Set(targets).size !== targets.length) return null;
    return validated.data.mappings;
  } catch {
    return null;
  }
}

async function responseForParsedUpload(
  parsed: Awaited<ReturnType<typeof parseUpload>>,
  id: string,
): Promise<Response> {
  const aiAvailable = geminiCapability().available;
  const requiresSemanticMapping = !parsed.canonical;
  const aiMappings = await aiMappingsForUpload(parsed, id);
  const upload = aiMappings ? { ...parsed, mappings: aiMappings } : parsed;
  return jsonResponse(
    {
      ok: true,
      stage: "mapping-approval-required",
      upload,
      mapping: {
        requiresExplicitApproval: true,
        mode: parsed.canonical ? "canonical" : aiMappings ? "ai-proposed" : "manual-required",
        aiAvailable,
        notice: !requiresSemanticMapping
          ? "Canonical headings detected. Review every field before validation."
          : aiMappings
            ? "AI proposed these mappings from untrusted headings and samples. Review every field; nothing has been applied."
            : aiAvailable
              ? "AI mapping did not pass validation. Confirm or edit the deterministic suggestions manually."
              : "AI analysis unavailable. Confirm or edit the proposed fields manually; no uncertain mapping has been applied.",
      },
      storage: { rawFilePersisted: false },
    },
    200,
    id,
  );
}

export async function POST(request: Request): Promise<Response> {
  const id = requestId(request);
  const started = Date.now();
  const originRejected = rejectCrossOriginRequest(request, id);
  if (originRejected) return originRejected;
  const limited = enforceRateLimit(request, id, { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await parseJson(request, jsonActionSchema, id);
    if (isResponse(body)) return body;
    if (body.action === "map-columns") {
      const mappings = proposeMappings(body.columns);
      return jsonResponse(
        {
          ok: true,
          stage: "mapping-approval-required",
          mappings,
          aiAvailable: Boolean(process.env.GEMINI_API_KEY),
          requiresExplicitApproval: true,
          untrustedDataHandledAsInstructions: false,
        },
        200,
        id,
      );
    }
    const result = normalizeMappedRows(
      body.rows as ImportRow[],
      body.mappings as ProposedMapping[],
      ALLOWED_ZONE_IDS,
    );
    structuredLog({
      requestId: id,
      operation: "validate-import",
      outcome: result.accepted ? "success" : "rejected",
      durationMs: Date.now() - started,
      code: result.accepted ? undefined : "VALIDATION_FAILED",
    });
    return jsonResponse(
      {
        ok: result.accepted,
        stage: result.accepted ? "ready-to-import" : "validation-failed",
        validation: result,
      },
      result.accepted ? 200 : 422,
      id,
    );
  }

  if (!contentType.includes("multipart/form-data")) {
    return publicError(
      id,
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Use multipart form data for files or JSON for validation.",
    );
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) {
    return publicError(id, 413, "FILE_TOO_LARGE", "Files must be 2 MiB or smaller.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return publicError(id, 400, "MALFORMED_FORM", "The upload form could not be read.");
  }
  const value = form.get("file");
  if (!(value instanceof File))
    return publicError(id, 400, "FILE_REQUIRED", "Choose a CSV, JSON, PDF, or text file.");

  try {
    const parsed = await parseUpload(value);
    structuredLog({
      requestId: id,
      operation: "inspect-upload",
      outcome: "success",
      durationMs: Date.now() - started,
    });
    return await responseForParsedUpload(parsed, id);
  } catch (error) {
    if (error instanceof ImportValidationError) {
      structuredLog({
        requestId: id,
        operation: "inspect-upload",
        outcome: "rejected",
        durationMs: Date.now() - started,
        code: error.code,
      });
      return publicError(id, error.status, error.code, error.message);
    }
    structuredLog({
      requestId: id,
      operation: "inspect-upload",
      outcome: "error",
      durationMs: Date.now() - started,
      code: "UPLOAD_FAILED",
    });
    return publicError(id, 500, "UPLOAD_FAILED", "The file could not be processed safely.");
  }
}
