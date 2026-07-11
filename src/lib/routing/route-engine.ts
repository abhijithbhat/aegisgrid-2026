import type {
  EdgeAccess,
  RouteLeg,
  RoutePath,
  RouteResult,
  ZoneEdge,
} from "../../types";
import { BinaryHeap } from "../incidents/binary-heap";
import { StadiumGraph, type DirectedZoneEdge } from "./graph";

export type RoutingAlgorithm = "dijkstra" | "a-star";

export interface RouteRequest {
  fromZoneId: string;
  toZoneId: string;
  algorithm?: RoutingAlgorithm;
  accessibilityRequired?: boolean;
  zoneCongestion?: Readonly<Record<string, number>>;
  zoneHazards?: Readonly<Record<string, number>>;
  blockedEdgeIds?: readonly string[];
  blockedZoneIds?: readonly string[];
  avoidZoneIds?: readonly string[];
  allowedAccess?: readonly EdgeAccess[];
}

interface RoutingContext {
  request: RouteRequest;
  blockedEdges: Set<string>;
  blockedZones: Set<string>;
  avoidedZones: Set<string>;
  allowedAccess: Set<EdgeAccess>;
}

interface EdgeCost {
  score: number;
  travelSeconds: number;
  congestionPenaltySeconds: number;
  hazardPenaltySeconds: number;
}

interface FrontierEntry {
  zoneId: string;
  priority: number;
  sequence: number;
}

interface Predecessor {
  from: string;
  edge: DirectedZoneEdge;
}

interface SearchResult {
  path: RoutePath;
  searchScore: number;
}

export class RouteNotFoundError extends Error {
  readonly code = "ROUTE_NOT_FOUND";

  constructor(
    readonly fromZoneId: string,
    readonly toZoneId: string,
  ) {
    super(`No safe route is currently available from ${fromZoneId} to ${toZoneId}.`);
    this.name = "RouteNotFoundError";
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

function createContext(
  request: RouteRequest,
  additionalBlockedEdges: Iterable<string> = [],
): RoutingContext {
  return {
    request,
    blockedEdges: new Set([...(request.blockedEdgeIds ?? []), ...additionalBlockedEdges]),
    blockedZones: new Set(request.blockedZoneIds ?? []),
    avoidedZones: new Set(request.avoidZoneIds ?? []),
    allowedAccess: new Set(
      request.allowedAccess ?? ["public", "staff", "emergency-only"],
    ),
  };
}

function isHardBlocked(
  graph: StadiumGraph,
  edge: DirectedZoneEdge,
  context: RoutingContext,
): boolean {
  const { request } = context;
  const destination = edge.traversalTo;
  const destinationZone = graph.getZone(destination);

  if (edge.blocked || context.blockedEdges.has(edge.id)) return true;
  if (!context.allowedAccess.has(edge.access)) return true;
  if (
    destination !== request.toZoneId &&
    (context.blockedZones.has(destination) || context.avoidedZones.has(destination))
  ) {
    return true;
  }
  if (destinationZone?.status === "closed") return true;
  if (
    request.accessibilityRequired &&
    (!edge.accessible || edge.hasStairs || destinationZone?.accessible === false)
  ) {
    return true;
  }
  return false;
}

function dynamicEdgeCost(
  graph: StadiumGraph,
  edge: DirectedZoneEdge,
  context: RoutingContext,
  mode: "dynamic" | "distance",
): EdgeCost | undefined {
  if (isHardBlocked(graph, edge, context)) return undefined;

  const congestionFrom = clamp(
    context.request.zoneCongestion?.[edge.traversalFrom] ?? 0,
    0,
    1.5,
  );
  const congestionTo = clamp(
    context.request.zoneCongestion?.[edge.traversalTo] ?? 0,
    0,
    1.5,
  );
  const congestion = (congestionFrom + congestionTo) / 2;
  const hazardFrom = clamp(
    context.request.zoneHazards?.[edge.traversalFrom] ?? 0,
    0,
    100,
  );
  const hazardTo = clamp(
    context.request.zoneHazards?.[edge.traversalTo] ?? 0,
    0,
    100,
  );
  const hazard = (hazardFrom + hazardTo) / 200;
  const congestionPenaltySeconds =
    edge.baseTravelSeconds * congestion * edge.crowdSensitivity * 1.6;
  const hazardPenaltySeconds =
    edge.baseTravelSeconds * hazard * edge.hazardExposure * 1.8;
  const travelSeconds =
    edge.baseTravelSeconds + congestionPenaltySeconds + hazardPenaltySeconds;

  return {
    score: mode === "distance" ? edge.distanceMeters : travelSeconds,
    travelSeconds,
    congestionPenaltySeconds,
    hazardPenaltySeconds,
  };
}

function heuristic(
  graph: StadiumGraph,
  from: string,
  to: string,
  mode: "dynamic" | "distance",
  algorithm: RoutingAlgorithm,
): number {
  if (algorithm === "dijkstra") return 0;
  const fromZone = graph.getZone(from);
  const toZone = graph.getZone(to);
  if (!fromZone || !toZone) return 0;

  const coordinateDistance = Math.hypot(
    fromZone.coordinates.x - toZone.coordinates.x,
    fromZone.coordinates.y - toZone.coordinates.y,
  );
  const lowerBoundMeters = coordinateDistance * graph.minimumMetersPerCoordinateUnit();
  return mode === "distance"
    ? lowerBoundMeters
    : lowerBoundMeters * graph.minimumSecondsPerMeter();
}

function reconstructPath(
  graph: StadiumGraph,
  request: RouteRequest,
  predecessors: Map<string, Predecessor>,
  context: RoutingContext,
  searchScore: number,
): SearchResult {
  const directedEdges: DirectedZoneEdge[] = [];
  let cursor = request.toZoneId;
  while (cursor !== request.fromZoneId) {
    const predecessor = predecessors.get(cursor);
    if (!predecessor) throw new RouteNotFoundError(request.fromZoneId, request.toZoneId);
    directedEdges.push(predecessor.edge);
    cursor = predecessor.from;
  }
  directedEdges.reverse();

  const legs: RouteLeg[] = directedEdges.map((edge) => {
    const cost = dynamicEdgeCost(graph, edge, context, "dynamic");
    if (!cost) throw new RouteNotFoundError(request.fromZoneId, request.toZoneId);
    return {
      edgeId: edge.id,
      from: edge.traversalFrom,
      to: edge.traversalTo,
      distanceMeters: edge.distanceMeters,
      travelSeconds: cost.travelSeconds,
      congestionPenaltySeconds: cost.congestionPenaltySeconds,
      hazardPenaltySeconds: cost.hazardPenaltySeconds,
    };
  });
  const zoneIds = [request.fromZoneId, ...legs.map((leg) => leg.to)];

  return {
    path: {
      zoneIds,
      edgeIds: legs.map((leg) => leg.edgeId),
      legs,
      distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
      travelSeconds: legs.reduce((sum, leg) => sum + leg.travelSeconds, 0),
      accessible: legs.every((leg) => graph.getEdge(leg.edgeId)?.accessible === true),
    },
    searchScore,
  };
}

function findPath(
  graph: StadiumGraph,
  request: RouteRequest,
  context: RoutingContext,
  mode: "dynamic" | "distance",
): SearchResult {
  if (!graph.getZone(request.fromZoneId) || !graph.getZone(request.toZoneId)) {
    throw new RouteNotFoundError(request.fromZoneId, request.toZoneId);
  }
  if (request.fromZoneId === request.toZoneId) {
    return {
      searchScore: 0,
      path: {
        zoneIds: [request.fromZoneId],
        edgeIds: [],
        legs: [],
        distanceMeters: 0,
        travelSeconds: 0,
        accessible: true,
      },
    };
  }

  const algorithm = request.algorithm ?? "a-star";
  let sequence = 0;
  const frontier = new BinaryHeap<FrontierEntry>((a, b) => {
    const priority = a.priority - b.priority;
    return priority === 0 ? a.sequence - b.sequence : priority;
  });
  const distance = new Map<string, number>([[request.fromZoneId, 0]]);
  const predecessors = new Map<string, Predecessor>();
  frontier.push({ zoneId: request.fromZoneId, priority: 0, sequence });

  while (!frontier.isEmpty) {
    const current = frontier.pop();
    if (!current) break;
    const known = distance.get(current.zoneId);
    if (known === undefined) continue;
    const expectedPriority =
      known +
      heuristic(graph, current.zoneId, request.toZoneId, mode, algorithm);
    if (current.priority > expectedPriority + 1e-9) continue;
    if (current.zoneId === request.toZoneId) {
      return reconstructPath(graph, request, predecessors, context, known);
    }

    for (const edge of graph.neighbours(current.zoneId)) {
      const edgeCost = dynamicEdgeCost(graph, edge, context, mode);
      if (!edgeCost) continue;
      const tentative = known + edgeCost.score;
      if (tentative >= (distance.get(edge.traversalTo) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      distance.set(edge.traversalTo, tentative);
      predecessors.set(edge.traversalTo, { from: current.zoneId, edge });
      sequence += 1;
      frontier.push({
        zoneId: edge.traversalTo,
        priority:
          tentative +
          heuristic(graph, edge.traversalTo, request.toZoneId, mode, algorithm),
        sequence,
      });
    }
  }

  throw new RouteNotFoundError(request.fromZoneId, request.toZoneId);
}

function pathSignature(path: RoutePath): string {
  return path.zoneIds.join(">");
}

function findAlternate(
  graph: StadiumGraph,
  request: RouteRequest,
  primary: RoutePath,
): RoutePath | undefined {
  const primarySignature = pathSignature(primary);
  const candidates: RoutePath[] = [];

  for (const edgeId of new Set(primary.edgeIds)) {
    const context = createContext(request, [edgeId]);
    try {
      const candidate = findPath(graph, request, context, "dynamic").path;
      if (pathSignature(candidate) !== primarySignature) candidates.push(candidate);
    } catch (error) {
      if (!(error instanceof RouteNotFoundError)) throw error;
    }
  }

  return candidates.sort((a, b) => a.travelSeconds - b.travelSeconds)[0];
}

function routeRationale(
  request: RouteRequest,
  primary: RoutePath,
  naive: RoutePath,
  alternate: RoutePath | undefined,
): string[] {
  const rationale = [
    "Primary route minimizes deterministic travel cost across distance, live congestion and incident hazard exposure.",
  ];
  if (request.accessibilityRequired) {
    rationale.push("Only step-free, accessible edges were eligible.");
  }
  if ((request.blockedEdgeIds?.length ?? 0) + (request.blockedZoneIds?.length ?? 0) > 0) {
    rationale.push("Operational closures were treated as hard constraints.");
  }
  if (pathSignature(primary) !== pathSignature(naive)) {
    rationale.push(
      "The physical shortest-distance path was slower after current congestion and hazard penalties were applied.",
    );
  }
  if (alternate) {
    rationale.push("An alternate path remains available if conditions change on the primary route.");
  }
  return rationale;
}

/**
 * Calculates the safest fast route, a distinct alternate, and the naive
 * shortest-distance comparator without using an LLM for any path decision.
 */
export function calculateResponderRoutes(
  graph: StadiumGraph,
  request: RouteRequest,
): RouteResult {
  const context = createContext(request);
  const primary = findPath(graph, request, context, "dynamic").path;
  const naive = findPath(graph, request, context, "distance").path;
  const alternate = findAlternate(graph, request, primary);
  const naiveDynamicSeconds = naive.travelSeconds;
  const timeSavedSeconds = Math.max(0, naiveDynamicSeconds - primary.travelSeconds);
  const avoidedZoneIds = [
    ...new Set([
      ...(request.blockedZoneIds ?? []),
      ...(request.avoidZoneIds ?? []),
      ...naive.zoneIds.filter((zoneId) => !primary.zoneIds.includes(zoneId)),
    ]),
  ];

  return {
    primary,
    alternate,
    naive,
    etaMinutes: Math.round((primary.travelSeconds / 60) * 10) / 10,
    alternateEtaMinutes: alternate
      ? Math.round((alternate.travelSeconds / 60) * 10) / 10
      : undefined,
    timeSavedSeconds: Math.round(timeSavedSeconds),
    avoidedZoneIds,
    rationale: routeRationale(request, primary, naive, alternate),
    algorithm: request.algorithm ?? "a-star",
  };
}

export function buildStadiumGraph(
  zones: ConstructorParameters<typeof StadiumGraph>[0],
  edges: readonly ZoneEdge[],
): StadiumGraph {
  return new StadiumGraph(zones, edges);
}

