"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { INITIAL_AUDIT, type AuditEvent, type Incident } from "./aegisData";
import {
  AUDIT_ACTION_BY_LABEL,
  AUDIT_LABEL_BY_ACTION,
  auditStatus,
  nowTime,
} from "./operational-model";

export type AuditPersistence = "checking" | "firestore" | "memory" | "error";

interface UseAuditPersistenceOptions {
  setIncidents: Dispatch<SetStateAction<Incident[]>>;
  onToast: (message: string) => void;
}

/**
 * Owns the durable audit boundary and server-sent persistence updates.
 * UI components receive typed events and capabilities, never provider records.
 */
export function useAuditPersistence({ setIncidents, onToast }: UseAuditPersistenceOptions) {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(INITIAL_AUDIT);
  const [auditPersistence, setAuditPersistence] = useState<AuditPersistence>("checking");

  useEffect(() => {
    if (auditPersistence !== "firestore") return;
    const stream = new EventSource("/api/live");
    stream.addEventListener("incident", (event) => {
      try {
        const update = JSON.parse((event as MessageEvent<string>).data) as {
          record?: { id?: unknown; payload?: unknown };
        };
        const id = typeof update.record?.id === "string" ? update.record.id : "";
        const payload = update.record?.payload;
        if (!id || !payload || typeof payload !== "object" || Array.isArray(payload)) return;
        setIncidents((current) =>
          current.map((incident) =>
            incident.id === id ? { ...incident, ...(payload as Partial<Incident>), id } : incident,
          ),
        );
      } catch {
        // Provider state is untrusted and may not cross the typed UI boundary.
      }
    });
    stream.addEventListener("audit", (event) => {
      try {
        const update = JSON.parse((event as MessageEvent<string>).data) as {
          event?: Record<string, unknown>;
        };
        const item = update.event;
        if (
          !item ||
          typeof item.id !== "string" ||
          typeof item.timestamp !== "string" ||
          typeof item.action !== "string" ||
          typeof item.incidentId !== "string"
        ) {
          return;
        }
        const mapped: AuditEvent = {
          id: item.id,
          timestamp: new Date(item.timestamp).toLocaleTimeString("en-GB", { hour12: false }),
          actor: item.actorRole === "stadium-safety-supervisor" ? "Safety Supervisor" : "System",
          action: AUDIT_LABEL_BY_ACTION[item.action] ?? item.action,
          incident: item.incidentId,
          previous: String(item.previousStatus ?? "—"),
          next: String(item.newStatus ?? "—"),
          note: String(item.note ?? ""),
          version: String(item.aiRecommendationVersion ?? ""),
        };
        setAuditEvents((current) =>
          current.some((existing) => existing.id === mapped.id) ? current : [mapped, ...current],
        );
      } catch {
        // Provider state is untrusted and may not cross the typed UI boundary.
      }
    });
    stream.addEventListener("sync-error", () => setAuditPersistence("error"));
    stream.onerror = () => stream.close();
    return () => stream.close();
  }, [auditPersistence, setIncidents]);

  useEffect(() => {
    let active = true;
    fetch("/api/audit", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("audit unavailable");
        const body = (await response.json()) as {
          persistence?: { mode?: "firestore" | "memory" };
        };
        if (active) setAuditPersistence(body.persistence?.mode ?? "memory");
      })
      .catch(() => {
        if (active) setAuditPersistence("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const addAudit = useCallback(
    (
      action: string,
      note: string,
      incident = "SYSTEM",
      previous = "—",
      next = "—",
      actor = "Safety Supervisor",
    ) => {
      setAuditEvents((current) => [
        {
          id: Date.now() + Math.random(),
          timestamp: nowTime(),
          actor,
          action,
          incident,
          previous,
          next,
          note,
          version:
            actor === "Routing Engine" ? "deterministic-route v3.1.0" : "incident-analysis v2.4.1",
        },
        ...current,
      ]);
      onToast(action);
      const apiAction = AUDIT_ACTION_BY_LABEL[action];
      if (!apiAction || incident === "SYSTEM") return;
      void fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: apiAction,
          incidentId: incident,
          previousStatus: auditStatus(previous),
          newStatus: auditStatus(next),
          note,
          aiRecommendationVersion: "aegis-ai-contract-1.0.0",
        }),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("audit write failed");
          const body = (await response.json()) as {
            persistence?: { mode?: "firestore" | "memory" };
          };
          setAuditPersistence(body.persistence?.mode ?? "memory");
        })
        .catch(() => setAuditPersistence("error"));
    },
    [onToast],
  );

  const syncIncident = useCallback(
    (patch: {
      id: string;
      status?: Incident["status"];
      team?: string;
      actions?: Incident["actions"];
      announcement?: Incident["announcement"];
    }) => {
      void fetch("/api/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => undefined);
    },
    [],
  );

  return { auditEvents, auditPersistence, addAudit, syncIncident } as const;
}
