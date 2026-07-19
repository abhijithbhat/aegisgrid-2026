import { describe, expect, it, vi } from "vitest";
import {
  getOperationalRepository,
  getPersistenceCapability,
  withRepositoryFallback,
  type OperationalRepository,
  type PersistedAuditEvent,
} from "../../src/lib/firestore/repository";

const event: PersistedAuditEvent = {
  id: "2de3bc0d-a457-4a78-896a-46b1b39a342f",
  timestamp: "2026-07-18T07:00:00.000Z",
  actorRole: "stadium-safety-supervisor",
  action: "note-added",
  incidentId: "INC-QA",
  previousStatus: "monitoring",
  newStatus: "monitoring",
  note: "Fallback behavior verified.",
  aiRecommendationVersion: "aegis-ai-contract-1.0.0",
};

describe("operational repository failover", () => {
  it("degrades once to an honest in-memory mode after a provider operation fails", async () => {
    const primary: OperationalRepository = {
      mode: "firestore",
      durable: true,
      upsertIncident: vi.fn(async () => {
        throw new Error("PERMISSION_DENIED");
      }),
      appendAuditEvent: vi.fn(async () => {
        throw new Error("PERMISSION_DENIED");
      }),
      listAuditEvents: vi.fn(async () => {
        throw new Error("PERMISSION_DENIED");
      }),
    };
    const stored: PersistedAuditEvent[] = [];
    const fallback: OperationalRepository = {
      mode: "memory",
      durable: false,
      upsertIncident: vi.fn(async () => undefined),
      appendAuditEvent: vi.fn(async (item) => {
        stored.push(item);
      }),
      listAuditEvents: vi.fn(async () => [...stored]),
    };
    const repository = withRepositoryFallback(primary, fallback);

    expect(repository.mode).toBe("firestore");
    expect(repository.durable).toBe(true);
    await repository.appendAuditEvent(event);
    expect(repository.mode).toBe("memory");
    expect(repository.durable).toBe(false);
    expect(await repository.listAuditEvents()).toEqual([event]);
    expect(primary.listAuditEvents).not.toHaveBeenCalled();
    expect(fallback.appendAuditEvent).toHaveBeenCalledWith(event);
  });

  it("uses a healthy primary and degrades subscriptions only after their error callback", async () => {
    const unsubscribe = vi.fn();
    let subscriptionFailure: (() => void) | undefined;
    const primary: OperationalRepository = {
      mode: "firestore",
      durable: true,
      upsertIncident: vi.fn(async () => undefined),
      appendAuditEvent: vi.fn(async () => undefined),
      listAuditEvents: vi.fn(async () => [event]),
      subscribe: vi.fn((_listener, onError) => {
        subscriptionFailure = onError;
        return unsubscribe;
      }),
    };
    const fallback: OperationalRepository = {
      mode: "memory",
      durable: false,
      upsertIncident: vi.fn(async () => undefined),
      appendAuditEvent: vi.fn(async () => undefined),
      listAuditEvents: vi.fn(async () => []),
    };
    const onError = vi.fn();
    const repository = withRepositoryFallback(primary, fallback);

    await repository.upsertIncident({ id: "INC-1", updatedAt: event.timestamp, payload: {} });
    await repository.appendAuditEvent(event);
    expect(await repository.listAuditEvents()).toEqual([event]);
    expect(repository.subscribe?.(() => undefined, onError)).toBe(unsubscribe);
    subscriptionFailure?.();
    expect(onError).toHaveBeenCalledOnce();
    expect(repository.mode).toBe("memory");
    expect(repository.subscribe?.(() => undefined, onError)).toBeTypeOf("function");
  });

  it("falls back independently when upsert or listing fails", async () => {
    const fallback: OperationalRepository = {
      mode: "memory",
      durable: false,
      upsertIncident: vi.fn(async () => undefined),
      appendAuditEvent: vi.fn(async () => undefined),
      listAuditEvents: vi.fn(async () => [event]),
    };
    const failingUpsert = withRepositoryFallback(
      {
        mode: "firestore",
        durable: true,
        upsertIncident: vi.fn(async () => {
          throw new Error("offline");
        }),
        appendAuditEvent: vi.fn(async () => undefined),
        listAuditEvents: vi.fn(async () => []),
      },
      fallback,
    );
    const record = { id: "INC-2", updatedAt: event.timestamp, payload: {} };
    await failingUpsert.upsertIncident(record);
    expect(fallback.upsertIncident).toHaveBeenCalledWith(record);

    const failingList = withRepositoryFallback(
      {
        mode: "firestore",
        durable: true,
        upsertIncident: vi.fn(async () => undefined),
        appendAuditEvent: vi.fn(async () => undefined),
        listAuditEvents: vi.fn(async () => {
          throw new Error("offline");
        }),
      },
      fallback,
    );
    expect(await failingList.listAuditEvents("INC-QA")).toEqual([event]);
    expect(fallback.listAuditEvents).toHaveBeenCalledWith("INC-QA");
  });

  it("exposes honest in-memory persistence capability when Firestore is disabled", async () => {
    delete process.env.ENABLE_FIRESTORE;
    expect(getPersistenceCapability()).toEqual({ configured: false, expectedMode: "memory" });
    const repository = await getOperationalRepository();
    expect(repository).toMatchObject({ mode: "memory", durable: false });

    const uniqueEvent = { ...event, id: crypto.randomUUID(), incidentId: "INC-MEMORY" };
    await repository.appendAuditEvent(uniqueEvent);
    expect(await repository.listAuditEvents("INC-MEMORY")).toEqual([uniqueEvent]);
    await expect(repository.appendAuditEvent(uniqueEvent)).rejects.toThrow(
      "AUDIT_EVENT_ALREADY_EXISTS",
    );
  });
});
