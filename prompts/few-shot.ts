export const INCIDENT_ANALYSIS_FEW_SHOT = Object.freeze([
  {
    input: {
      sources: [
        { sourceId: "STAFF-17", text: "Person collapsed behind west food kiosks." },
        { sourceId: "RADIO-04", text: "Medical help needed by West Food Court; person unresponsive." },
      ],
      deterministicRisk: { score: 68, severity: "high" },
    },
    expectedTraits: {
      incidentType: "medical",
      severity: "critical",
      evidenceSourceIds: ["STAFF-17", "RADIO-04"],
      disagreementReason: "Unresponsiveness warrants immediate medical escalation.",
      requiresHumanApproval: true,
    },
  },
  {
    input: {
      sources: [
        { sourceId: "STAFF-21", text: "Smoke near East Concourse." },
        { sourceId: "SHOW-02", text: "Scheduled theatrical fog active near pitch east." },
        { sourceId: "AQI-EAST", text: "AQI 42; sensor healthy." },
      ],
    },
    expectedTraits: {
      contradictionSourceIds: ["STAFF-21", "SHOW-02", "AQI-EAST"],
      uncertainty: "Smoke is not yet confirmed; investigate without declaring certainty.",
    },
  },
]);

export const FUSION_FEW_SHOT = Object.freeze([
  {
    reports: [
      { id: "R1", zoneId: "west-food", text: "Someone fainted behind the west stairs." },
      { id: "R2", zoneId: "west-food", text: "Una persona está inconsciente cerca del patio de comidas oeste." },
    ],
    sameIncident: true,
    reason: "Compatible location, timing and medical event despite different wording/language.",
  },
  {
    reports: [
      { id: "R3", zoneId: "west-concourse", text: "A child fell near section 119." },
      { id: "R4", zoneId: "west-food", text: "An adult slipped beside kiosk W4." },
    ],
    sameIncident: false,
    reason: "Distinct people and precise locations outweigh temporal proximity.",
  },
]);

