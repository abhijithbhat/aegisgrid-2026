import type { FusedIncident, IncidentStatus, Severity } from "../../types";
import { BinaryHeap } from "./binary-heap";

const SEVERITY_PRIORITY: Record<Severity, number> = {
  low: 0,
  moderate: 12,
  high: 28,
  critical: 48,
};

const STATUS_PRIORITY: Record<IncidentStatus, number> = {
  new: 12,
  assessing: 10,
  "awaiting-approval": 14,
  responding: 5,
  monitoring: 0,
  resolved: -100,
  dismissed: -100,
};

export interface PrioritizedIncident {
  incident: FusedIncident;
  priorityScore: number;
  enqueuedAt: string;
}

export function computeOperationalPriority(
  incident: FusedIncident,
  now: Date = new Date(),
): number {
  const ageMinutes = Math.max(0, (now.getTime() - new Date(incident.createdAt).getTime()) / 60_000);
  const ageEscalation = Math.min(20, ageMinutes * 0.5);
  const confidenceContribution = incident.confidence * 8;
  const contradictionAttention = Math.min(8, incident.contradictions.length * 2);
  const vulnerabilityEscalation = incident.vulnerablePerson ? 18 : 0;

  return (
    Math.round(
      (incident.riskScore +
        SEVERITY_PRIORITY[incident.severity] +
        STATUS_PRIORITY[incident.status] +
        ageEscalation +
        confidenceContribution +
        contradictionAttention +
        vulnerabilityEscalation) *
        10,
    ) / 10
  );
}

/**
 * Operational incident queue backed by a real binary heap.
 * enqueue and dequeue are O(log n); peek is O(1).
 */
export class IncidentPriorityQueue {
  private sequence = 0;

  private readonly heap = new BinaryHeap<PrioritizedIncident & { sequence: number }>((a, b) => {
    const byScore = b.priorityScore - a.priorityScore;
    return byScore === 0 ? a.sequence - b.sequence : byScore;
  });

  get size(): number {
    return this.heap.size;
  }

  enqueue(incident: FusedIncident, now: Date = new Date()): PrioritizedIncident {
    const entry = {
      incident,
      priorityScore: computeOperationalPriority(incident, now),
      enqueuedAt: now.toISOString(),
      sequence: this.sequence,
    };
    this.sequence += 1;
    this.heap.push(entry);
    return entry;
  }

  dequeue(): PrioritizedIncident | undefined {
    const entry = this.heap.pop();
    if (!entry) return undefined;
    return this.toPublicEntry(entry);
  }

  peek(): PrioritizedIncident | undefined {
    const entry = this.heap.peek();
    if (!entry) return undefined;
    return this.toPublicEntry(entry);
  }

  ordered(): PrioritizedIncident[] {
    return this.heap.toSortedArray().map((entry) => this.toPublicEntry(entry));
  }

  clear(): void {
    this.heap.clear();
  }

  private toPublicEntry(entry: PrioritizedIncident & { sequence: number }): PrioritizedIncident {
    return {
      incident: entry.incident,
      priorityScore: entry.priorityScore,
      enqueuedAt: entry.enqueuedAt,
    };
  }
}

export function prioritizeIncidents(
  incidents: Iterable<FusedIncident>,
  now: Date = new Date(),
): PrioritizedIncident[] {
  const queue = new IncidentPriorityQueue();
  for (const incident of incidents) {
    if (incident.status !== "resolved" && incident.status !== "dismissed") {
      queue.enqueue(incident, now);
    }
  }
  return queue.ordered();
}

export interface OperationalQueueSignals {
  riskScore: number;
  severity: Severity;
  confidence: number;
  contradictionCount: number;
  awaitingApproval: boolean;
  vulnerablePerson?: boolean;
}

/**
 * View-model adapter backed by the same binary heap as the domain queue.
 * It lets presentation records use deterministic priority ordering without
 * duplicating heap logic in React. Insertion/removal remain O(log n).
 */
export function rankOperationalItems<T>(
  items: readonly T[],
  signalsFor: (item: T) => OperationalQueueSignals,
): Array<{ item: T; priorityScore: number }> {
  let sequence = 0;
  const heap = new BinaryHeap<{ item: T; priorityScore: number; sequence: number }>((a, b) => {
    const byScore = b.priorityScore - a.priorityScore;
    return byScore === 0 ? a.sequence - b.sequence : byScore;
  });
  for (const item of items) {
    const signals = signalsFor(item);
    const priorityScore =
      Math.round(
        (Math.min(100, Math.max(0, signals.riskScore)) +
          SEVERITY_PRIORITY[signals.severity] +
          Math.min(1, Math.max(0, signals.confidence)) * 8 +
          Math.min(8, Math.max(0, signals.contradictionCount) * 2) +
          (signals.awaitingApproval ? 14 : 0) +
          (signals.vulnerablePerson ? 18 : 0)) *
          10,
      ) / 10;
    heap.push({ item, priorityScore, sequence });
    sequence += 1;
  }
  return heap
    .toSortedArray()
    .map((entry) => ({ item: entry.item, priorityScore: entry.priorityScore }));
}
