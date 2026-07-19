import type { StadiumZone, ZoneEdge } from "../../src/types";

const zone = (
  id: string,
  name: string,
  shortName: string,
  kind: StadiumZone["kind"],
  capacity: number,
  x: number,
  y: number,
  options: Partial<
    Pick<StadiumZone, "level" | "accessible" | "status" | "description" | "tags">
  > = {},
): StadiumZone => ({
  id,
  name,
  shortName,
  kind,
  capacity,
  coordinates: { x, y },
  level: options.level ?? 0,
  accessible: options.accessible ?? true,
  status: options.status ?? "normal",
  description: options.description,
  tags: options.tags ?? [],
});

export const STADIUM_ZONES: readonly StadiumZone[] = Object.freeze([
  zone("transit-plaza", "Unity Transit Plaza", "Transit", "transit-plaza", 8_000, 50, 98, {
    tags: ["arrival", "public"],
  }),
  zone("gate-north", "North Gate", "N Gate", "gate", 3_200, 50, 7, { tags: ["entry", "exit"] }),
  zone("gate-east", "East Gate", "E Gate", "gate", 3_200, 93, 50, { tags: ["entry", "exit"] }),
  zone("gate-south", "South Gate", "S Gate", "gate", 3_200, 50, 91, { tags: ["entry", "exit"] }),
  zone("gate-west", "West Gate", "W Gate", "gate", 3_200, 7, 50, { tags: ["entry", "exit"] }),
  zone("concourse-north", "North Inner Concourse", "N Concourse", "concourse", 4_200, 50, 24, {
    tags: ["circulation"],
  }),
  zone("concourse-east", "East Inner Concourse", "E Concourse", "concourse", 4_200, 76, 50, {
    tags: ["circulation"],
  }),
  zone("concourse-south", "South Inner Concourse", "S Concourse", "concourse", 4_200, 50, 76, {
    tags: ["circulation"],
  }),
  zone("concourse-west", "West Inner Concourse", "W Concourse", "concourse", 4_200, 24, 50, {
    tags: ["circulation"],
  }),
  zone("seating-nw", "North-West Seating", "NW Seats", "seating", 11_500, 36, 36, {
    level: 1,
    tags: ["spectator"],
  }),
  zone("seating-ne", "North-East Seating", "NE Seats", "seating", 11_500, 64, 36, {
    level: 1,
    tags: ["spectator"],
  }),
  zone("seating-se", "South-East Seating", "SE Seats", "seating", 11_500, 64, 64, {
    level: 1,
    tags: ["spectator"],
  }),
  zone("seating-sw", "South-West Seating", "SW Seats", "seating", 11_500, 36, 64, {
    level: 1,
    tags: ["spectator"],
  }),
  zone("food-west", "West Food Court", "W Food", "food", 1_600, 17, 68, {
    tags: ["food", "high-dwell"],
  }),
  zone("medical-room", "Medical Response Room", "Medical", "medical", 180, 82, 68, {
    tags: ["staff", "response-base"],
  }),
  zone("security-control", "Security Control Point", "Control", "control", 120, 72, 87, {
    tags: ["staff", "response-base"],
  }),
  zone(
    "accessible-corridor",
    "Step-Free South Corridor",
    "Access Way",
    "accessible-corridor",
    1_200,
    31,
    83,
    { tags: ["step-free", "egress"] },
  ),
  zone("service-tunnel", "Responder Service Tunnel", "Tunnel", "service-tunnel", 600, 68, 80, {
    tags: ["staff", "emergency"],
  }),
  zone("exit-west", "West Emergency Exit", "W Exit", "exit", 2_000, 2, 72, {
    tags: ["emergency-exit"],
  }),
  zone("exit-east", "East Emergency Exit", "E Exit", "exit", 2_000, 98, 72, {
    tags: ["emergency-exit"],
  }),
  zone("pitch", "Unity Stadium Pitch", "Pitch", "pitch", 250, 50, 50, {
    accessible: false,
    tags: ["restricted"],
  }),
]);

type EdgeOptions = Partial<
  Pick<
    ZoneEdge,
    | "bidirectional"
    | "accessible"
    | "hasStairs"
    | "access"
    | "crowdSensitivity"
    | "hazardExposure"
    | "blocked"
    | "label"
  >
>;

const edge = (
  id: string,
  from: string,
  to: string,
  distanceMeters: number,
  baseTravelSeconds: number,
  options: EdgeOptions = {},
): ZoneEdge => ({
  id,
  from,
  to,
  distanceMeters,
  baseTravelSeconds,
  bidirectional: options.bidirectional ?? true,
  accessible: options.accessible ?? true,
  hasStairs: options.hasStairs ?? false,
  access: options.access ?? "public",
  crowdSensitivity: options.crowdSensitivity ?? 1,
  hazardExposure: options.hazardExposure ?? 1,
  blocked: options.blocked ?? false,
  label: options.label,
});

export const ZONE_EDGES: readonly ZoneEdge[] = Object.freeze([
  edge("e-plaza-south", "transit-plaza", "gate-south", 120, 75, { crowdSensitivity: 1.4 }),
  edge("e-gate-north", "gate-north", "concourse-north", 85, 55),
  edge("e-gate-east", "gate-east", "concourse-east", 85, 55),
  edge("e-gate-south", "gate-south", "concourse-south", 85, 55),
  edge("e-gate-west", "gate-west", "concourse-west", 85, 55, { crowdSensitivity: 1.5 }),
  edge("e-concourse-ne", "concourse-north", "concourse-east", 145, 92),
  edge("e-concourse-es", "concourse-east", "concourse-south", 145, 92),
  edge("e-concourse-sw", "concourse-south", "concourse-west", 145, 92),
  edge("e-concourse-wn", "concourse-west", "concourse-north", 145, 92),
  edge("e-n-nw", "concourse-north", "seating-nw", 70, 55, { accessible: false, hasStairs: true }),
  edge("e-n-ne", "concourse-north", "seating-ne", 70, 55, { accessible: false, hasStairs: true }),
  edge("e-e-ne", "concourse-east", "seating-ne", 70, 55, { accessible: false, hasStairs: true }),
  edge("e-e-se", "concourse-east", "seating-se", 70, 55, { accessible: false, hasStairs: true }),
  edge("e-s-se", "concourse-south", "seating-se", 70, 55, { accessible: false, hasStairs: true }),
  edge("e-s-sw", "concourse-south", "seating-sw", 70, 55, { accessible: false, hasStairs: true }),
  edge("e-w-sw", "concourse-west", "seating-sw", 70, 55, { accessible: false, hasStairs: true }),
  edge("e-w-nw", "concourse-west", "seating-nw", 70, 55, { accessible: false, hasStairs: true }),
  edge("e-west-food", "concourse-west", "food-west", 72, 48, { crowdSensitivity: 1.7 }),
  edge("e-food-exit", "food-west", "exit-west", 68, 46, { crowdSensitivity: 1.2 }),
  edge("e-east-medical", "concourse-east", "medical-room", 74, 44, {
    access: "staff",
    crowdSensitivity: 0.4,
  }),
  edge("e-medical-exit", "medical-room", "exit-east", 72, 43, {
    access: "staff",
    crowdSensitivity: 0.3,
  }),
  edge("e-south-access", "concourse-south", "accessible-corridor", 92, 58, {
    crowdSensitivity: 0.6,
    label: "step-free",
  }),
  edge("e-access-west", "accessible-corridor", "concourse-west", 105, 66, {
    crowdSensitivity: 0.5,
    label: "step-free",
  }),
  edge("e-access-gate", "accessible-corridor", "gate-south", 70, 45, {
    crowdSensitivity: 0.5,
    label: "step-free",
  }),
  edge("e-control-tunnel", "security-control", "service-tunnel", 55, 34, {
    access: "emergency-only",
    crowdSensitivity: 0.1,
  }),
  edge("e-tunnel-medical", "service-tunnel", "medical-room", 68, 39, {
    bidirectional: false,
    access: "emergency-only",
    crowdSensitivity: 0.1,
  }),
  edge("e-tunnel-south", "service-tunnel", "concourse-south", 60, 37, {
    access: "emergency-only",
    crowdSensitivity: 0.2,
  }),
  edge("e-control-plaza", "security-control", "transit-plaza", 90, 54, {
    access: "staff",
    crowdSensitivity: 0.2,
  }),
  edge("e-pitch-north", "concourse-north", "pitch", 95, 65, {
    accessible: false,
    access: "emergency-only",
    hazardExposure: 1.5,
  }),
  edge("e-pitch-south", "concourse-south", "pitch", 95, 65, {
    accessible: false,
    access: "emergency-only",
    hazardExposure: 1.5,
  }),
]);

export const UNITY_STADIUM = Object.freeze({
  id: "unity-stadium-2026",
  name: "UNITY STADIUM 2026",
  capacity: STADIUM_ZONES.filter((item) => item.kind === "seating").reduce(
    (total, item) => total + item.capacity,
    0,
  ),
  zones: STADIUM_ZONES,
  edges: ZONE_EDGES,
});
