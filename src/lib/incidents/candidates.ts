import type { IncidentReport, ZoneEdge } from "../../types";

export interface DuplicateCandidateConfig {
  timeWindowMinutes: number;
  minimumCandidateScore: number;
  lexicalWeight: number;
  metadataWeight: number;
}

export const DEFAULT_DUPLICATE_CONFIG: Readonly<DuplicateCandidateConfig> =
  Object.freeze({
    timeWindowMinutes: 12,
    minimumCandidateScore: 0.34,
    lexicalWeight: 0.72,
    metadataWeight: 0.28,
  });

export interface DuplicateCandidate {
  pairKey: string;
  reportAId: string;
  reportBId: string;
  sourceIds: [string, string];
  timeDeltaMinutes: number;
  sameZone: boolean;
  neighbouringZones: boolean;
  lexicalSimilarity: number;
  metadataSimilarity: number;
  candidateScore: number;
  requiresSemanticComparison: true;
  reasons: string[];
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "de",
  "el",
  "en",
  "is",
  "la",
  "near",
  "of",
  "the",
  "to",
  "un",
  "una",
]);

export function normalizeReportText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeReportText(text)
      .split(" ")
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

export function jaccardSimilarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function reportPairKey(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join("::");
}

function buildNeighbourhood(edges: readonly ZoneEdge[]): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  const include = (from: string, to: string): void => {
    const neighbours = result.get(from) ?? new Set<string>([from]);
    neighbours.add(to);
    result.set(from, neighbours);
  };

  for (const edge of edges) {
    include(edge.from, edge.to);
    include(edge.to, edge.from);
  }
  return result;
}

function metadataSimilarity(a: IncidentReport, b: IncidentReport): number {
  let total = 0;
  let comparable = 0;

  if (a.incidentType && b.incidentType) {
    comparable += 2;
    if (a.incidentType === b.incidentType) total += 2;
  }
  if (a.peopleAffected !== undefined && b.peopleAffected !== undefined) {
    comparable += 1;
    const difference = Math.abs(a.peopleAffected - b.peopleAffected);
    if (difference === 0) total += 1;
    else if (difference === 1) total += 0.5;
  }
  comparable += 1;
  if (a.vulnerablePerson === b.vulnerablePerson) total += 1;

  return comparable === 0 ? 0 : total / comparable;
}

function assertCandidateConfig(config: DuplicateCandidateConfig): void {
  if (
    config.timeWindowMinutes <= 0 ||
    config.minimumCandidateScore < 0 ||
    config.minimumCandidateScore > 1 ||
    Math.abs(config.lexicalWeight + config.metadataWeight - 1) > 1e-9
  ) {
    throw new RangeError("Invalid duplicate-candidate configuration.");
  }
}

/**
 * Generates cheap candidate pairs only. The caller should invoke semantic AI
 * comparison for returned pairs and retain every original report afterward.
 * Reports are time-sorted, so comparisons stop once the configured window is
 * exceeded rather than evaluating every possible pair.
 */
export function generateDuplicateCandidates(
  reports: readonly IncidentReport[],
  edges: readonly ZoneEdge[],
  config: DuplicateCandidateConfig = DEFAULT_DUPLICATE_CONFIG,
): DuplicateCandidate[] {
  assertCandidateConfig(config);
  const sorted = [...reports]
    .filter((report) => !report.dismissed)
    .sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  const neighbourhood = buildNeighbourhood(edges);
  const windowMs = config.timeWindowMinutes * 60_000;
  const candidates: DuplicateCandidate[] = [];

  for (let left = 0; left < sorted.length; left += 1) {
    const a = sorted[left];
    const aTime = new Date(a.timestamp).getTime();
    if (!Number.isFinite(aTime)) continue;

    for (let right = left + 1; right < sorted.length; right += 1) {
      const b = sorted[right];
      const bTime = new Date(b.timestamp).getTime();
      if (!Number.isFinite(bTime)) continue;
      const deltaMs = bTime - aTime;
      if (deltaMs > windowMs) break;

      const sameZone = Boolean(a.zoneId && b.zoneId && a.zoneId === b.zoneId);
      const neighbouringZones = Boolean(
        a.zoneId &&
          b.zoneId &&
          !sameZone &&
          neighbourhood.get(a.zoneId)?.has(b.zoneId),
      );
      if (!sameZone && !neighbouringZones) continue;

      const lexical = jaccardSimilarity(a.rawText, b.rawText);
      const metadata = metadataSimilarity(a, b);
      const proximityBonus = sameZone ? 0.08 : 0;
      const score = Math.min(
        1,
        lexical * config.lexicalWeight + metadata * config.metadataWeight + proximityBonus,
      );
      if (score < config.minimumCandidateScore) continue;

      const reasons = [
        sameZone ? "same zone" : "neighbouring zones",
        `within ${(deltaMs / 60_000).toFixed(1)} minutes`,
      ];
      if (lexical >= 0.45) reasons.push("similar normalized wording");
      if (a.incidentType && a.incidentType === b.incidentType) {
        reasons.push("matching incident type metadata");
      }

      candidates.push({
        pairKey: reportPairKey(a.id, b.id),
        reportAId: a.id,
        reportBId: b.id,
        sourceIds: [a.sourceId, b.sourceId],
        timeDeltaMinutes: Math.round((deltaMs / 60_000) * 10) / 10,
        sameZone,
        neighbouringZones,
        lexicalSimilarity: Math.round(lexical * 1000) / 1000,
        metadataSimilarity: Math.round(metadata * 1000) / 1000,
        candidateScore: Math.round(score * 1000) / 1000,
        requiresSemanticComparison: true,
        reasons,
      });
    }
  }

  return candidates;
}

