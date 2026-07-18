import type { IncidentReport, ZoneEdge } from "../../types";
import {
  DEFAULT_DUPLICATE_CONFIG,
  generateDuplicateCandidates,
  reportPairKey,
  type DuplicateCandidate,
  type DuplicateCandidateConfig,
} from "./candidates";

export interface SemanticFusionDecision {
  reportAId: string;
  reportBId: string;
  sameIncident: boolean;
  confidence: number;
  explanation: string;
  contradictions: string[];
}

export interface IncidentCluster {
  id: string;
  reportIds: string[];
  sourceIds: string[];
  reports: IncidentReport[];
  acceptedPairKeys: string[];
}

export interface FusionResult {
  candidates: DuplicateCandidate[];
  clusters: IncidentCluster[];
  acceptedDecisions: SemanticFusionDecision[];
  rejectedDecisions: SemanticFusionDecision[];
  pendingSemanticPairKeys: string[];
}

export interface FusionConfig {
  candidate: DuplicateCandidateConfig;
  semanticConfidenceThreshold: number;
  /** Exact same-zone near-verbatim reports can fuse without spending an AI call. */
  deterministicExactMatchThreshold: number;
}

export const DEFAULT_FUSION_CONFIG: Readonly<FusionConfig> = Object.freeze({
  candidate: DEFAULT_DUPLICATE_CONFIG,
  semanticConfidenceThreshold: 0.78,
  deterministicExactMatchThreshold: 0.9,
});

class DisjointSet {
  private readonly parent = new Map<string, string>();

  add(value: string): void {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }

  find(value: string): string {
    const parent = this.parent.get(value);
    if (!parent) {
      this.add(value);
      return value;
    }
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

function validateDecision(decision: SemanticFusionDecision): boolean {
  return (
    decision.reportAId !== decision.reportBId &&
    Number.isFinite(decision.confidence) &&
    decision.confidence >= 0 &&
    decision.confidence <= 1
  );
}

/**
 * Applies deterministic exact-match and validated semantic decisions. Source
 * reports remain embedded in every cluster and are never deleted or rewritten.
 */
export function fuseIncidentReports(
  reports: readonly IncidentReport[],
  edges: readonly ZoneEdge[],
  semanticDecisions: readonly SemanticFusionDecision[] = [],
  config: FusionConfig = DEFAULT_FUSION_CONFIG,
): FusionResult {
  if (
    config.semanticConfidenceThreshold < 0 ||
    config.semanticConfidenceThreshold > 1 ||
    config.deterministicExactMatchThreshold < 0 ||
    config.deterministicExactMatchThreshold > 1
  ) {
    throw new RangeError("Fusion confidence thresholds must be between 0 and 1.");
  }

  const reportById = new Map(reports.map((report) => [report.id, report]));
  const candidates = generateDuplicateCandidates(reports, edges, config.candidate);
  const decisionByKey = new Map(
    semanticDecisions
      .filter(validateDecision)
      .map((decision) => [reportPairKey(decision.reportAId, decision.reportBId), decision]),
  );
  const set = new DisjointSet();
  reports.forEach((report) => set.add(report.id));

  const acceptedDecisions: SemanticFusionDecision[] = [];
  const rejectedDecisions: SemanticFusionDecision[] = [];
  const acceptedPairKeys = new Set<string>();
  const pendingSemanticPairKeys: string[] = [];

  for (const candidate of candidates) {
    const reportA = reportById.get(candidate.reportAId);
    const reportB = reportById.get(candidate.reportBId);
    if (!reportA || !reportB) continue;

    const deterministicExactMatch =
      candidate.sameZone &&
      candidate.lexicalSimilarity >= config.deterministicExactMatchThreshold &&
      reportA.incidentType === reportB.incidentType;
    const decision = decisionByKey.get(candidate.pairKey);
    const semanticAccepted = Boolean(
      decision?.sameIncident && decision.confidence >= config.semanticConfidenceThreshold,
    );

    if (deterministicExactMatch || semanticAccepted) {
      set.union(candidate.reportAId, candidate.reportBId);
      acceptedPairKeys.add(candidate.pairKey);
      if (decision) acceptedDecisions.push(decision);
    } else if (decision) {
      rejectedDecisions.push(decision);
    } else {
      pendingSemanticPairKeys.push(candidate.pairKey);
    }
  }

  const grouped = new Map<string, IncidentReport[]>();
  for (const report of reports) {
    const root = set.find(report.id);
    const group = grouped.get(root) ?? [];
    group.push(report);
    grouped.set(root, group);
  }

  const clusters = [...grouped.values()].map((clusterReports): IncidentCluster => {
    const reportIds = clusterReports.map((report) => report.id).sort();
    const clusterPairKeys = candidates
      .filter(
        (candidate) =>
          reportIds.includes(candidate.reportAId) &&
          reportIds.includes(candidate.reportBId) &&
          acceptedPairKeys.has(candidate.pairKey),
      )
      .map((candidate) => candidate.pairKey);

    return {
      id: `cluster-${reportIds.join("-")}`,
      reportIds,
      sourceIds: [...new Set(clusterReports.map((report) => report.sourceId))].sort(),
      reports: [...clusterReports].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      acceptedPairKeys: clusterPairKeys,
    };
  });

  return {
    candidates,
    clusters,
    acceptedDecisions,
    rejectedDecisions,
    pendingSemanticPairKeys,
  };
}
