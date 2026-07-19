/**
 * Shared domain language for AEGISGRID 2026.
 *
 * IDs are deliberately opaque strings. Persistence and transport layers may
 * choose UUIDs, but the domain does not couple itself to a specific generator.
 */

export type EventPhase = "pre-entry" | "ingress" | "live-match" | "halftime" | "egress";

export type Severity = "low" | "moderate" | "high" | "critical";

export type IncidentType =
  | "medical"
  | "fire"
  | "crowd"
  | "security"
  | "infrastructure"
  | "accessibility"
  | "lost_person"
  | "other";

export type TeamType =
  "medical" | "security" | "fire" | "accessibility" | "maintenance" | "crowd_control";

export type ZoneKind =
  | "gate"
  | "concourse"
  | "seating"
  | "food"
  | "medical"
  | "control"
  | "accessible-corridor"
  | "service-tunnel"
  | "transit-plaza"
  | "exit"
  | "pitch"
  | "other";

export type ZoneOperationalStatus = "normal" | "watch" | "degraded" | "restricted" | "closed";

export interface Point2D {
  x: number;
  y: number;
}

export interface StadiumZone {
  id: string;
  name: string;
  shortName: string;
  kind: ZoneKind;
  capacity: number;
  coordinates: Point2D;
  level: number;
  accessible: boolean;
  status: ZoneOperationalStatus;
  description?: string;
  tags: string[];
}

export type EdgeAccess = "public" | "staff" | "emergency-only";

export interface ZoneEdge {
  id: string;
  from: string;
  to: string;
  /** Geometric walking distance, used by the naive comparator. */
  distanceMeters: number;
  /** Uncongested responder travel time. */
  baseTravelSeconds: number;
  bidirectional: boolean;
  accessible: boolean;
  hasStairs: boolean;
  access: EdgeAccess;
  crowdSensitivity: number;
  hazardExposure: number;
  blocked: boolean;
  label?: string;
}

export type SensorHealth = "healthy" | "degraded" | "offline";

export interface TelemetryReading {
  id: string;
  timestamp: string;
  zoneId: string;
  occupancy?: number;
  capacity?: number;
  inflowPerMinute?: number;
  outflowPerMinute?: number;
  queueMinutes?: number;
  temperatureC?: number;
  airQualityIndex?: number;
  noiseDb?: number;
  sensorHealth: SensorHealth;
  blocked: boolean;
  eventPhase: EventPhase;
}

export type ReportSourceType =
  "staff" | "spectator" | "sensor" | "radio" | "camera-operator" | "system";

export interface IncidentReport {
  id: string;
  /** Stable evidence identifier shown to supervisors and the AI validator. */
  sourceId: string;
  sourceType: ReportSourceType;
  timestamp: string;
  receivedAt: string;
  rawText: string;
  language: string;
  zoneId?: string;
  incidentType?: IncidentType;
  reliability: number;
  peopleAffected?: number;
  vulnerablePerson: boolean;
  dismissed: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface EvidenceItem {
  sourceId: string;
  fact: string;
  weight: number;
  observedAt?: string;
}

export interface Contradiction {
  sourceIds: string[];
  description: string;
  operationalImpact: string;
}

export type IncidentStatus =
  | "new"
  | "assessing"
  | "awaiting-approval"
  | "responding"
  | "monitoring"
  | "resolved"
  | "dismissed";

export interface FusedIncident {
  id: string;
  title: string;
  incidentType: IncidentType;
  zoneId: string;
  severity: Severity;
  confidence: number;
  createdAt: string;
  updatedAt: string;
  reportIds: string[];
  sourceIds: string[];
  evidence: EvidenceItem[];
  contradictions: Contradiction[];
  riskScore: number;
  status: IncidentStatus;
  recommendedTeamType: TeamType;
  assignedTeamId?: string;
  estimatedResponseMinutes?: number;
  vulnerablePerson: boolean;
  summary?: string;
}

export type TeamStatus = "available" | "assigned" | "responding" | "offline";

export interface ResponseTeam {
  id: string;
  name: string;
  type: TeamType;
  currentZoneId: string;
  status: TeamStatus;
  capabilities: string[];
  equipment: string[];
  stepFreeRequired: boolean;
}

export interface RouteLeg {
  edgeId: string;
  from: string;
  to: string;
  distanceMeters: number;
  travelSeconds: number;
  congestionPenaltySeconds: number;
  hazardPenaltySeconds: number;
}

export interface RoutePath {
  zoneIds: string[];
  edgeIds: string[];
  legs: RouteLeg[];
  distanceMeters: number;
  travelSeconds: number;
  accessible: boolean;
}

export interface RouteResult {
  primary: RoutePath;
  alternate?: RoutePath;
  naive: RoutePath;
  etaMinutes: number;
  alternateEtaMinutes?: number;
  timeSavedSeconds: number;
  avoidedZoneIds: string[];
  rationale: string[];
  algorithm: "dijkstra" | "a-star";
}

export interface RecommendedAction {
  priority: number;
  action: string;
  ownerRole: string;
  targetMinutes: number;
  justification: string;
  requiresApproval: true;
}

export interface AIRecommendation {
  summary: string;
  incidentType: IncidentType;
  severity: Severity;
  confidence: number;
  evidence: EvidenceItem[];
  contradictions: Contradiction[];
  missingInformation: string[];
  clarifyingQuestions: string[];
  recommendedActions: RecommendedAction[];
  recommendedTeamType: TeamType;
  equipment: string[];
  announcement: {
    language: string;
    tone: "calm" | "urgent" | "emergency";
    text: string;
  };
  uncertaintyNote: string;
  requiresHumanApproval: true;
}

export type AuditAction =
  | "recommendation-approved"
  | "recommendation-modified"
  | "recommendation-dismissed"
  | "team-assigned"
  | "step-completed"
  | "report-dismissed"
  | "note-added"
  | "incident-resolved"
  | "incident-reopened";

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorRole: "stadium-safety-supervisor" | "system";
  action: AuditAction;
  incidentId: string;
  previousStatus?: IncidentStatus;
  newStatus?: IncidentStatus;
  note?: string;
  aiRecommendationVersion?: string;
}

export type ScenarioEventKind =
  "telemetry" | "report" | "edge-status" | "team-status" | "phase-change";

export interface ScenarioEvent<TPayload = unknown> {
  id: string;
  atSeconds: number;
  kind: ScenarioEventKind;
  payload: TPayload;
  label: string;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  seed: number;
  durationSeconds: number;
  initialEventPhase: EventPhase;
  events: ScenarioEvent[];
}

export type CanonicalTelemetryField =
  | "timestamp"
  | "zone_id"
  | "occupancy"
  | "capacity"
  | "inflow_per_minute"
  | "outflow_per_minute"
  | "queue_minutes"
  | "temperature_c"
  | "air_quality_index"
  | "noise_db"
  | "sensor_health"
  | "blocked"
  | "event_phase";

export interface ProposedFieldMapping {
  sourceField: string;
  targetField: CanonicalTelemetryField | null;
  confidence: number;
  rationale: string;
  requiresConfirmation: boolean;
}

export type ImportIssueCode =
  | "invalid_type"
  | "invalid_number"
  | "invalid_timestamp"
  | "missing_required"
  | "unknown_field"
  | "unknown_zone"
  | "out_of_range"
  | "unsupported_file"
  | "file_too_large"
  | "malformed_file";

export interface ImportIssue {
  row?: number;
  field?: string;
  code: ImportIssueCode;
  message: string;
  value?: unknown;
}

export interface DataImportResult<T = TelemetryReading> {
  accepted: T[];
  rejectedRows: number;
  issues: ImportIssue[];
  warnings: string[];
  mappings?: ProposedFieldMapping[];
  summary: {
    totalRows: number;
    acceptedRows: number;
    rejectedRows: number;
  };
}

export interface StructuredError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Array<{ path: string; message: string }>;
}
