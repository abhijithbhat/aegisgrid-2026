import type { ScenarioDefinition, ScenarioEvent } from "../../src/types";

const event = (
  id: string,
  atSeconds: number,
  kind: ScenarioEvent["kind"],
  label: string,
  payload: unknown,
): ScenarioEvent => ({ id, atSeconds, kind, label, payload });

export const SCENARIOS: readonly ScenarioDefinition[] = Object.freeze([
  {
    id: "west-gate-surge",
    name: "West Gate Surge",
    description: "Ingress accelerates at West Gate while one occupancy sensor degrades.",
    seed: 26001,
    durationSeconds: 90,
    initialEventPhase: "ingress",
    events: [
      event("wgs-1", 0, "telemetry", "West Gate at 78%", { zoneId: "gate-west", occupancy: 2496, capacity: 3200, inflowPerMinute: 82, outflowPerMinute: 48, sensorHealth: "healthy" }),
      event("wgs-2", 20, "telemetry", "Net inflow accelerates", { zoneId: "gate-west", occupancy: 2784, capacity: 3200, inflowPerMinute: 111, outflowPerMinute: 43, sensorHealth: "healthy" }),
      event("wgs-3", 38, "telemetry", "Sensor becomes degraded", { zoneId: "gate-west", occupancy: 2940, capacity: 3200, inflowPerMinute: 118, outflowPerMinute: 42, sensorHealth: "degraded" }),
      event("wgs-4", 44, "report", "Steward reports compression", { id: "sim-wgs-report", sourceId: "SIM-STEWARD-WG", zoneId: "gate-west", incidentType: "crowd", language: "en", text: "Crowd compression increasing beside the West Gate bag-check lane." }),
      event("wgs-5", 65, "team-status", "Crowd team ready for approval", { teamId: "team-crowd-bravo", status: "available" }),
    ],
  },
  {
    id: "conflicting-smoke",
    name: "Conflicting Smoke Reports",
    description: "Human observations conflict with a scheduled fog effect and normal air data.",
    seed: 26002,
    durationSeconds: 75,
    initialEventPhase: "live-match",
    events: [
      event("csr-1", 5, "report", "Steward reports smoke", { id: "sim-smoke-1", sourceId: "SIM-STEWARD-E", zoneId: "concourse-east", incidentType: "fire", text: "Light smoke visible near the East Concourse." }),
      event("csr-2", 14, "report", "Second smoke report", { id: "sim-smoke-2", sourceId: "SIM-SPECTATOR-E", zoneId: "concourse-east", incidentType: "fire", text: "There is a smoky haze by the east entrance." }),
      event("csr-3", 21, "report", "Show control reports theatrical fog", { id: "sim-smoke-3", sourceId: "SIM-SHOW-CONTROL", zoneId: "concourse-east", incidentType: "other", text: "Scheduled theatrical fog effect active on the east pitch boundary." }),
      event("csr-4", 28, "telemetry", "Air sensor remains normal", { zoneId: "concourse-east", airQualityIndex: 42, sensorHealth: "healthy" }),
    ],
  },
  {
    id: "multilingual-medical",
    name: "Multilingual Medical Incident",
    description: "English and Hindi reports describe one unconscious person with different landmarks and scripts.",
    seed: 26003,
    durationSeconds: 65,
    initialEventPhase: "halftime",
    events: [
      event("mmi-1", 4, "report", "English report", { id: "sim-med-en", sourceId: "SIM-STAFF-WF", zoneId: "food-west", language: "en", incidentType: "medical", text: "Someone fainted behind the food kiosks by the west stairs." }),
      event("mmi-2", 13, "report", "Hindi guest report", { id: "sim-med-hi", sourceId: "SIM-REPORT-HI", zoneId: "food-west", language: "hi", incidentType: "medical", text: "पश्चिमी भोजन क्षेत्र के पास एक व्यक्ति बेहोश है।" }),
      event("mmi-3", 31, "team-status", "Medical Alpha available", { teamId: "team-med-alpha", status: "available" }),
    ],
  },
  {
    id: "accessible-corridor-blockage",
    name: "Accessible Corridor Blockage",
    description: "A step-free corridor closes during egress, forcing an accessible alternate route.",
    seed: 26004,
    durationSeconds: 80,
    initialEventPhase: "egress",
    events: [
      event("acb-1", 0, "phase-change", "Egress begins", { eventPhase: "egress" }),
      event("acb-2", 12, "edge-status", "Step-free corridor closes", { edgeId: "e-south-access", blocked: true, reason: "temporary infrastructure obstruction" }),
      event("acb-3", 18, "report", "Wheelchair user requires alternate egress", { id: "sim-access-1", sourceId: "SIM-ACCESS-STEWARD", zoneId: "concourse-south", language: "en", incidentType: "accessibility", text: "Wheelchair user at South Concourse needs a step-free route; accessible corridor entrance is blocked." }),
      event("acb-4", 34, "team-status", "Access Delta available", { teamId: "team-access-delta", status: "available" }),
    ],
  },
  {
    id: "false-duplicate-challenge",
    name: "False Duplicate Challenge",
    description: "Two falls occur close in time but involve different people and precise locations.",
    seed: 26005,
    durationSeconds: 60,
    initialEventPhase: "live-match",
    events: [
      event("fdc-1", 7, "report", "Child falls near seating", { id: "sim-fall-child", sourceId: "SIM-USHER-119", zoneId: "concourse-west", language: "en", incidentType: "medical", peopleAffected: 1, text: "A child fell near section 119 at the north end of West Concourse." }),
      event("fdc-2", 10, "report", "Adult slips near kiosk", { id: "sim-fall-adult", sourceId: "SIM-KIOSK-W4", zoneId: "food-west", language: "en", incidentType: "medical", peopleAffected: 1, text: "An adult slipped beside kiosk W4 in the West Food Court." }),
      event("fdc-3", 35, "team-status", "Two-event assessment required", { teamId: "team-med-alpha", status: "available", note: "Do not merge solely on time and generic fall wording." }),
    ],
  },
]);

export const SCENARIO_BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));
