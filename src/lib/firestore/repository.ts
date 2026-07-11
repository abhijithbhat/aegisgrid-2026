type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PersistedAuditEvent {
  id: string;
  timestamp: string;
  actorRole: "stadium-safety-supervisor" | "system";
  action: string;
  incidentId: string;
  previousStatus: string;
  newStatus: string;
  note: string;
  aiRecommendationVersion: string;
}

export interface IncidentRecord {
  id: string;
  updatedAt: string;
  payload: Record<string, JsonValue>;
}

export interface OperationalRepository {
  readonly mode: "firestore" | "memory";
  readonly durable: boolean;
  upsertIncident(record: IncidentRecord): Promise<void>;
  appendAuditEvent(event: PersistedAuditEvent): Promise<void>;
  listAuditEvents(incidentId?: string): Promise<PersistedAuditEvent[]>;
}

const memoryIncidents = new Map<string, IncidentRecord>();
const memoryAudit: PersistedAuditEvent[] = [];

const memoryRepository: OperationalRepository = {
  mode: "memory",
  durable: false,
  async upsertIncident(record) {
    memoryIncidents.set(record.id, structuredClone(record));
    if (memoryIncidents.size > 250) {
      const oldest = memoryIncidents.keys().next().value as string | undefined;
      if (oldest) memoryIncidents.delete(oldest);
    }
  },
  async appendAuditEvent(event) {
    if (memoryAudit.some((existing) => existing.id === event.id)) {
      throw new Error("AUDIT_EVENT_ALREADY_EXISTS");
    }
    if (memoryAudit.length >= 1_000) throw new Error("AUDIT_CAPACITY_REACHED");
    memoryAudit.push(structuredClone(event));
  },
  async listAuditEvents(incidentId) {
    return memoryAudit
      .filter((event) => !incidentId || event.incidentId === incidentId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .map((event) => structuredClone(event));
  },
};

let firestoreRepository: Promise<OperationalRepository> | undefined;

async function createFirestoreRepository(): Promise<OperationalRepository> {
  const [{ getApps, initializeApp, applicationDefault }, { getFirestore }] =
    await Promise.all([
      import("firebase-admin/app"),
      import("firebase-admin/firestore"),
    ]);

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const app =
    getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      ...(projectId ? { projectId } : {}),
    });
  const database = getFirestore(app);

  return {
    mode: "firestore",
    durable: true,
    async upsertIncident(record) {
      await database.collection("incidents").doc(record.id).set(record, { merge: true });
    },
    async appendAuditEvent(event) {
      // create() enforces append-only identity; an existing event cannot be overwritten.
      await database.collection("auditEvents").doc(event.id).create(event);
    },
    async listAuditEvents(incidentId) {
      let query = database.collection("auditEvents").orderBy("timestamp", "desc").limit(200);
      if (incidentId) query = query.where("incidentId", "==", incidentId);
      const snapshot = await query.get();
      return snapshot.docs.map((document) => document.data() as PersistedAuditEvent);
    },
  };
}

export async function getOperationalRepository(): Promise<OperationalRepository> {
  if (process.env.ENABLE_FIRESTORE !== "true") return memoryRepository;
  firestoreRepository ??= createFirestoreRepository();
  try {
    return await firestoreRepository;
  } catch {
    // A credential or service outage must not take down decision support.
    // Callers can expose durable:false without leaking the provider error.
    firestoreRepository = undefined;
    return memoryRepository;
  }
}

export function getPersistenceCapability(): {
  configured: boolean;
  expectedMode: "firestore" | "memory";
} {
  const configured = process.env.ENABLE_FIRESTORE === "true";
  return { configured, expectedMode: configured ? "firestore" : "memory" };
}
