import { describe, expect, it, vi } from "vitest";
import {
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
      upsertIncident: vi.fn(async () => { throw new Error("PERMISSION_DENIED"); }),
      appendAuditEvent: vi.fn(async () => { throw new Error("PERMISSION_DENIED"); }),
      listAuditEvents: vi.fn(async () => { throw new Error("PERMISSION_DENIED"); }),
    };
    const stored: PersistedAuditEvent[] = [];
    const fallback: OperationalRepository = {
      mode: "memory",
      durable: false,
      upsertIncident: vi.fn(async () => undefined),
      appendAuditEvent: vi.fn(async (item) => { stored.push(item); }),
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
});
