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
  subscribe?(
    listener: (
      update:
        | { type: "incident"; record: IncidentRecord }
        | { type: "audit"; event: PersistedAuditEvent },
    ) => void,
    onError: () => void,
  ): () => void;
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

/**
 * Keeps decision support available when Firestore is configured but cannot be
 * reached (for example, when a Cloud Run service account is missing a role).
 * The first provider failure permanently degrades this process to the bounded
 * in-memory repository, and the public mode/durability flags change with it.
 */
export function withRepositoryFallback(
  primary: OperationalRepository,
  fallback: OperationalRepository = memoryRepository,
): OperationalRepository {
  let degraded = false;
  const enterFallback = () => {
    degraded = true;
  };

  return {
    get mode() {
      return degraded ? fallback.mode : primary.mode;
    },
    get durable() {
      return degraded ? fallback.durable : primary.durable;
    },
    async upsertIncident(record) {
      if (degraded) return fallback.upsertIncident(record);
      try {
        await primary.upsertIncident(record);
      } catch {
        enterFallback();
        await fallback.upsertIncident(record);
      }
    },
    async appendAuditEvent(event) {
      if (degraded) return fallback.appendAuditEvent(event);
      try {
        await primary.appendAuditEvent(event);
      } catch {
        enterFallback();
        await fallback.appendAuditEvent(event);
      }
    },
    async listAuditEvents(incidentId) {
      if (degraded) return fallback.listAuditEvents(incidentId);
      try {
        return await primary.listAuditEvents(incidentId);
      } catch {
        enterFallback();
        return fallback.listAuditEvents(incidentId);
      }
    },
    subscribe(listener, onError) {
      if (degraded || !primary.subscribe) return () => {};
      return primary.subscribe(listener, () => {
        enterFallback();
        onError();
      });
    },
  };
}

let firestoreRepository: Promise<OperationalRepository> | undefined;

async function createFirestoreRepository(): Promise<OperationalRepository> {
  const [{ getApps, initializeApp, applicationDefault }, { getFirestore }] = await Promise.all([
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

  return withRepositoryFallback({
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
    subscribe(listener, onError) {
      const unsubscribeIncidents = database.collection("incidents").onSnapshot((snapshot) => {
        for (const change of snapshot.docChanges()) {
          if (change.type !== "removed")
            listener({ type: "incident", record: change.doc.data() as IncidentRecord });
        }
      }, onError);
      const unsubscribeAudit = database
        .collection("auditEvents")
        .orderBy("timestamp", "desc")
        .limit(200)
        .onSnapshot((snapshot) => {
          for (const change of snapshot.docChanges()) {
            if (change.type === "added")
              listener({ type: "audit", event: change.doc.data() as PersistedAuditEvent });
          }
        }, onError);
      return () => {
        unsubscribeIncidents();
        unsubscribeAudit();
      };
    },
  });
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
