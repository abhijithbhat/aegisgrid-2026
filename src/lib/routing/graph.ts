import type { StadiumZone, ZoneEdge } from "../../types";

export interface DirectedZoneEdge extends ZoneEdge {
  traversalFrom: string;
  traversalTo: string;
}

/** Weighted adjacency-list stadium graph. */
export class StadiumGraph {
  private readonly zones = new Map<string, StadiumZone>();
  private readonly adjacency = new Map<string, DirectedZoneEdge[]>();
  private readonly edges = new Map<string, ZoneEdge>();

  constructor(zones: readonly StadiumZone[] = [], edges: readonly ZoneEdge[] = []) {
    zones.forEach((zone) => this.addZone(zone));
    edges.forEach((edge) => this.addEdge(edge));
  }

  addZone(zone: StadiumZone): void {
    if (this.zones.has(zone.id)) throw new Error(`Duplicate stadium zone: ${zone.id}`);
    if (!Number.isFinite(zone.capacity) || zone.capacity < 0) {
      throw new RangeError(`Zone ${zone.id} has an invalid capacity.`);
    }
    this.zones.set(zone.id, zone);
    this.adjacency.set(zone.id, []);
  }

  addEdge(edge: ZoneEdge): void {
    if (this.edges.has(edge.id)) throw new Error(`Duplicate stadium edge: ${edge.id}`);
    if (!this.zones.has(edge.from) || !this.zones.has(edge.to)) {
      throw new Error(`Edge ${edge.id} references an unknown stadium zone.`);
    }
    if (
      !Number.isFinite(edge.distanceMeters) ||
      edge.distanceMeters <= 0 ||
      !Number.isFinite(edge.baseTravelSeconds) ||
      edge.baseTravelSeconds <= 0 ||
      edge.crowdSensitivity < 0 ||
      edge.hazardExposure < 0
    ) {
      throw new RangeError(`Edge ${edge.id} contains invalid weights.`);
    }

    this.edges.set(edge.id, edge);
    this.adjacency.get(edge.from)?.push({
      ...edge,
      traversalFrom: edge.from,
      traversalTo: edge.to,
    });
    if (edge.bidirectional) {
      this.adjacency.get(edge.to)?.push({
        ...edge,
        traversalFrom: edge.to,
        traversalTo: edge.from,
      });
    }
  }

  getZone(id: string): StadiumZone | undefined {
    return this.zones.get(id);
  }

  getEdge(id: string): ZoneEdge | undefined {
    return this.edges.get(id);
  }

  neighbours(zoneId: string): readonly DirectedZoneEdge[] {
    return this.adjacency.get(zoneId) ?? [];
  }

  zoneIds(): string[] {
    return [...this.zones.keys()];
  }

  allZones(): StadiumZone[] {
    return [...this.zones.values()];
  }

  allEdges(): ZoneEdge[] {
    return [...this.edges.values()];
  }

  /** Lower-bound metres per map-coordinate unit, used for an admissible A* heuristic. */
  minimumMetersPerCoordinateUnit(): number {
    let minimum = Number.POSITIVE_INFINITY;
    for (const edge of this.edges.values()) {
      const from = this.zones.get(edge.from);
      const to = this.zones.get(edge.to);
      if (!from || !to) continue;
      const coordinateDistance = Math.hypot(
        from.coordinates.x - to.coordinates.x,
        from.coordinates.y - to.coordinates.y,
      );
      if (coordinateDistance > 0) {
        minimum = Math.min(minimum, edge.distanceMeters / coordinateDistance);
      }
    }
    return Number.isFinite(minimum) ? minimum : 0;
  }

  minimumSecondsPerMeter(): number {
    let minimum = Number.POSITIVE_INFINITY;
    for (const edge of this.edges.values()) {
      minimum = Math.min(minimum, edge.baseTravelSeconds / edge.distanceMeters);
    }
    return Number.isFinite(minimum) ? minimum : 0;
  }
}
