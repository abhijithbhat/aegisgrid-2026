const stringArray = { type: "array", items: { type: "string" }, maxItems: 12 };

export const AI_RECOMMENDATION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary", "incidentType", "severity", "confidence", "evidence", "contradictions",
    "missingInformation", "clarifyingQuestions", "recommendedActions", "recommendedTeamType",
    "equipment", "announcement", "uncertaintyNote", "requiresHumanApproval",
  ],
  properties: {
    summary: { type: "string" },
    incidentType: { type: "string", enum: ["medical", "fire", "crowd", "security", "infrastructure", "accessibility", "lost_person", "other"] },
    severity: { type: "string", enum: ["low", "moderate", "high", "critical"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "fact", "weight"],
        properties: {
          sourceId: { type: "string" },
          fact: { type: "string" },
          weight: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    contradictions: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceIds", "description", "operationalImpact"],
        properties: {
          sourceIds: { type: "array", minItems: 2, maxItems: 12, items: { type: "string" } },
          description: { type: "string" },
          operationalImpact: { type: "string" },
        },
      },
    },
    missingInformation: stringArray,
    clarifyingQuestions: stringArray,
    recommendedActions: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "action", "ownerRole", "targetMinutes", "justification", "requiresApproval"],
        properties: {
          priority: { type: "integer", minimum: 1, maximum: 100 },
          action: { type: "string" },
          ownerRole: { type: "string" },
          targetMinutes: { type: "number", minimum: 0, maximum: 1_440 },
          justification: { type: "string" },
          requiresApproval: { type: "boolean" },
        },
      },
    },
    recommendedTeamType: { type: "string", enum: ["medical", "security", "fire", "accessibility", "maintenance", "crowd_control"] },
    equipment: stringArray,
    announcement: {
      type: "object",
      additionalProperties: false,
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
  additionalProperties: false,
  required: ["mappings"],
  properties: {
    mappings: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceColumn", "canonicalField", "confidence", "rationale", "requiresApproval", "source"],
        properties: {
          sourceColumn: { type: "string" },
          canonicalField: {
            anyOf: [
              { type: "string", enum: ["timestamp", "zone_id", "occupancy", "capacity", "inflow_per_minute", "outflow_per_minute", "queue_minutes", "temperature_c", "air_quality_index", "noise_db", "sensor_health", "blocked", "event_phase"] },
              { type: "null" },
            ],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string" },
          requiresApproval: { type: "boolean", const: true },
          source: { type: "string", enum: ["ai"] },
        },
      },
    },
  },
};

export const FUSION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["reportAId", "reportBId", "sameIncident", "confidence", "explanation", "contradictions"],
  properties: {
    reportAId: { type: "string" },
    reportBId: { type: "string" },
    sameIncident: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    explanation: { type: "string" },
    contradictions: stringArray,
  },
};
