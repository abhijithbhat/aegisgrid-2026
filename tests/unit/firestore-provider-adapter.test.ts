import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncidentRecord, PersistedAuditEvent } from "../../src/lib/firestore/repository";

const firestore = vi.hoisted(() => {
  const incidentSet = vi.fn();
  const auditCreate = vi.fn();
  const queryGet = vi.fn();
  const queryWhere = vi.fn();
  const unsubscribeIncidents = vi.fn();
  const unsubscribeAudit = vi.fn();
  let incidentSnapshot:
    ((snapshot: { docChanges: () => Array<Record<string, unknown>> }) => void) | undefined;
  let incidentError: (() => void) | undefined;
  let auditSnapshot:
    ((snapshot: { docChanges: () => Array<Record<string, unknown>> }) => void) | undefined;
  let auditError: (() => void) | undefined;

  const auditQuery = {
    orderBy: vi.fn(),
    limit: vi.fn(),
    where: queryWhere,
    get: queryGet,
    onSnapshot: vi.fn(
      (
        listener: (snapshot: { docChanges: () => Array<Record<string, unknown>> }) => void,
        onError: () => void,
      ) => {
        auditSnapshot = listener;
        auditError = onError;
        return unsubscribeAudit;
      },
    ),
  };
  auditQuery.orderBy.mockReturnValue(auditQuery);
  auditQuery.limit.mockReturnValue(auditQuery);
  queryWhere.mockReturnValue(auditQuery);

  const incidentsCollection = {
    doc: vi.fn(() => ({ set: incidentSet })),
    onSnapshot: vi.fn(
      (
        listener: (snapshot: { docChanges: () => Array<Record<string, unknown>> }) => void,
        onError: () => void,
      ) => {
        incidentSnapshot = listener;
        incidentError = onError;
        return unsubscribeIncidents;
      },
    ),
  };
  const auditCollection = {
    doc: vi.fn(() => ({ create: auditCreate })),
    orderBy: auditQuery.orderBy,
  };
  const database = {
    collection: vi.fn((name: string) =>
      name === "incidents" ? incidentsCollection : auditCollection,
    ),
  };

  return {
    incidentSet,
    auditCreate,
    queryGet,
    queryWhere,
    unsubscribeIncidents,
    unsubscribeAudit,
    incidentsCollection,
    auditQuery,
    database,
    getIncidentSnapshot: () => incidentSnapshot,
    getIncidentError: () => incidentError,
    getAuditSnapshot: () => auditSnapshot,
    getAuditError: () => auditError,
  };
});

const admin = vi.hoisted(() => ({
  applicationDefault: vi.fn(() => ({ credential: "application-default" })),
  initializeApp: vi.fn(() => ({ name: "aegisgrid-test" })),
  getApps: vi.fn(() => [] as Array<{ name: string }>),
  getFirestore: vi.fn(() => firestore.database),
}));

vi.mock("firebase-admin/app", () => ({
  applicationDefault: admin.applicationDefault,
  initializeApp: admin.initializeApp,
  getApps: admin.getApps,
}));

vi.mock("firebase-admin/firestore", () => ({ getFirestore: admin.getFirestore }));

const event: PersistedAuditEvent = {
  id: "c934c895-7fe5-46f5-8c64-424af09d6c0a",
  timestamp: "2026-07-19T06:30:00.000Z",
  actorRole: "stadium-safety-supervisor",
  action: "recommendation-approved",
  incidentId: "INC-FIRESTORE",
  previousStatus: "awaiting-approval",
  newStatus: "plan-approved",
  note: "Supervisor approved the validated response plan.",
  aiRecommendationVersion: "aegis-ai-contract-1.0.0",
};

const record: IncidentRecord = {
  id: "INC-FIRESTORE",
  updatedAt: "2026-07-19T06:30:00.000Z",
  payload: { status: "plan-approved", risk: 72 },
};

describe("Firestore operational repository adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENABLE_FIRESTORE = "true";
    process.env.FIREBASE_PROJECT_ID = "aegisgrid-test";
    firestore.queryGet.mockResolvedValue({ docs: [{ data: () => event }] });
    firestore.auditQuery.orderBy.mockReturnValue(firestore.auditQuery);
    firestore.auditQuery.limit.mockReturnValue(firestore.auditQuery);
    firestore.queryWhere.mockReturnValue(firestore.auditQuery);
  });

  afterAll(() => {
    delete process.env.ENABLE_FIRESTORE;
    delete process.env.FIREBASE_PROJECT_ID;
  });

  it("persists incident and append-only audit records through the provider boundary", async () => {
    const { getOperationalRepository, getPersistenceCapability } =
      await import("../../src/lib/firestore/repository");
    expect(getPersistenceCapability()).toEqual({
      configured: true,
      expectedMode: "firestore",
    });

    const repository = await getOperationalRepository();
    expect(repository).toMatchObject({ mode: "firestore", durable: true });
    expect(admin.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "aegisgrid-test" }),
    );

    await repository.upsertIncident(record);
    expect(firestore.incidentSet).toHaveBeenCalledWith(record, { merge: true });

    await repository.appendAuditEvent(event);
    expect(firestore.auditCreate).toHaveBeenCalledWith(event);

    await expect(repository.listAuditEvents()).resolves.toEqual([event]);
    await expect(repository.listAuditEvents("INC-FIRESTORE")).resolves.toEqual([event]);
    expect(firestore.queryWhere).toHaveBeenCalledWith("incidentId", "==", "INC-FIRESTORE");
  });

  it("streams non-removed incidents and newly appended audit events, then unsubscribes", async () => {
    const { getOperationalRepository } = await import("../../src/lib/firestore/repository");
    const repository = await getOperationalRepository();
    const listener = vi.fn();
    const onError = vi.fn();
    const unsubscribe = repository.subscribe?.(listener, onError);

    firestore.getIncidentSnapshot()?.({
      docChanges: () => [
        { type: "added", doc: { data: () => record } },
        { type: "removed", doc: { data: () => record } },
      ],
    });
    firestore.getAuditSnapshot()?.({
      docChanges: () => [
        { type: "added", doc: { data: () => event } },
        { type: "modified", doc: { data: () => event } },
      ],
    });

    expect(listener).toHaveBeenNthCalledWith(1, { type: "incident", record });
    expect(listener).toHaveBeenNthCalledWith(2, { type: "audit", event });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe?.();
    expect(firestore.unsubscribeIncidents).toHaveBeenCalledOnce();
    expect(firestore.unsubscribeAudit).toHaveBeenCalledOnce();

    firestore.getAuditError()?.();
    expect(onError).toHaveBeenCalledOnce();
    expect(repository).toMatchObject({ mode: "memory", durable: false });
    expect(repository.subscribe?.(listener, onError)).toBeTypeOf("function");
  });
});
