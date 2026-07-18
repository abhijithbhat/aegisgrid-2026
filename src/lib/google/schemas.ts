const stringArray = { type: "array", items: { type: "string" } };

/**
 * Gemini `responseJsonSchema` for incident analysis. Constraint keywords
 * (minItems, maxItems, minimum, maximum, additionalProperties) are omitted
 * because gemini-3.5-flash rejects them with 400 INVALID_ARGUMENT. The
 * app's own response-validator enforces those limits at runtime instead.
 */
export const AI_RECOMMENDATION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: [
    "summary", "incidentType", "severity", "confidence", "evidence", "contradictions",
    "missingInformation", "clarifyingQuestions", "recommendedActions", "recommendedTeamType",
    "equipment", "announcement", "uncertaintyNote", "requiresHumanApproval",
  ],
  properties: {
    summary: { type: "string" },
    incidentType: { type: "string", enum: ["medical", "fire", "crowd", "security", "infrastructure", "accessibility", "lost_person", "other"] },
    severity: { type: "string", enum: ["low", "moderate", "high", "critical"] },
    confidence: { type: "number" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        required: ["sourceId", "fact", "weight"],
        properties: {
          sourceId: { type: "string" },
          fact: { type: "string" },
          weight: { type: "number" },
        },
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        required: ["sourceIds", "description", "operationalImpact"],
        properties: {
          sourceIds: { type: "array", items: { type: "string" } },
          description: { type: "string" },
          operationalImpact: { type: "string" },
        },
      },
    },
    missingInformation: stringArray,
    clarifyingQuestions: stringArray,
    recommendedActions: {
      type: "array",
      items: {
        type: "object",
        required: ["priority", "action", "ownerRole", "targetMinutes", "justification", "requiresApproval"],
        properties: {
          priority: { type: "integer" },
          action: { type: "string" },
          ownerRole: { type: "string" },
          targetMinutes: { type: "number" },
          justification: { type: "string" },
          requiresApproval: { type: "boolean" },
        },
      },
    },
    recommendedTeamType: { type: "string", enum: ["medical", "security", "fire", "accessibility", "maintenance", "crowd_control"] },
    equipment: stringArray,
    announcement: {
      type: "object",
      required: ["language", "tone", "text"],
      properties: {
        language: { type: "string" },
        tone: { type: "string", enum: ["calm", "urgent", "emergency"] },
        text: { type: "string" },
      },
    },
    uncertaintyNote: { type: "string" },
    requiresHumanApproval: { type: "boolean" },
  },
};


export const SCHEMA_MAPPING_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["mappings"],
  properties: {
    mappings: {
      type: "array",
      items: {
        type: "object",
        required: ["sourceColumn", "canonicalField", "confidence", "rationale", "requiresApproval", "source"],
        properties: {
          sourceColumn: { type: "string" },
          canonicalField: { type: "string" },
          confidence: { type: "number" },
          rationale: { type: "string" },
          requiresApproval: { type: "boolean" },
          source: { type: "string", enum: ["ai"] },
        },
      },
    },
  },
};

export const FUSION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["reportAId", "reportBId", "sameIncident", "confidence", "explanation", "contradictions"],
  properties: {
    reportAId: { type: "string" },
    reportBId: { type: "string" },
    sameIncident: { type: "boolean" },
    confidence: { type: "number" },
    explanation: { type: "string" },
    contradictions: stringArray,
  },
};
