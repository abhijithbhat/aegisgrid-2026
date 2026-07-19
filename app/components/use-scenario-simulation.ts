"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { INITIAL_INCIDENTS, INITIAL_ZONES, type Incident, type Zone } from "./aegisData";

export interface SimulationState {
  running: boolean;
  name: string;
  event: string;
}

type AuditWriter = (
  action: string,
  note: string,
  incident?: string,
  previous?: string,
  next?: string,
  actor?: string,
) => void;

interface UseScenarioSimulationOptions {
  setZones: Dispatch<SetStateAction<Zone[]>>;
  setIncidents: Dispatch<SetStateAction<Incident[]>>;
  setSelectedId: Dispatch<SetStateAction<string>>;
  setSelectedZone: Dispatch<SetStateAction<string>>;
  setPhase: Dispatch<SetStateAction<string>>;
  addAudit: AuditWriter;
  onToast: (message: string) => void;
}

/** Owns deterministic, seeded scenario mutations and baseline restoration. */
export function useScenarioSimulation({
  setZones,
  setIncidents,
  setSelectedId,
  setSelectedZone,
  setPhase,
  addAudit,
  onToast,
}: UseScenarioSimulationOptions) {
  const [simulation, setSimulation] = useState<SimulationState>({
    running: false,
    name: "West Gate Surge",
    event: "Baseline loaded",
  });

  const handleSimulationEvent = useCallback(
    (incidentId: string, event: string, scenarioId: string, step: number, seed: number) => {
      const variation = seed % 7;
      setSelectedId(incidentId);
      const incident = INITIAL_INCIDENTS.find((item) => item.id === incidentId);
      if (incident) setSelectedZone(incident.zoneId);
      setSimulation((current) => ({ ...current, event }));
      setZones((current) =>
        current.map((zone) => {
          if (scenarioId === "west-surge" && zone.id === "west-concourse") {
            return {
              ...zone,
              occupancy: step >= 4 ? 89 + (variation % 3) : Math.min(98, 84 + variation + step * 3),
              flow: step >= 4 ? 42 + variation : 150 + variation + step * 18,
              state:
                step >= 4 ? "watch" : step >= 2 ? "degraded" : step >= 1 ? "critical" : "watch",
              detail: event,
            };
          }
          if (scenarioId === "smoke-conflict" && zone.id === "east-concourse") {
            return { ...zone, state: "watch", detail: event };
          }
          if (scenarioId === "medical-multilingual" && zone.id === "west-concourse") {
            return {
              ...zone,
              occupancy: Math.min(94, 88 + step),
              state: "critical",
              detail: event,
            };
          }
          if (scenarioId === "accessible-block" && zone.id === "accessible-corridor") {
            return { ...zone, state: "degraded", detail: event };
          }
          if (scenarioId === "false-duplicate" && zone.id === "south-stands") {
            return { ...zone, state: step > 2 ? "stable" : "watch", detail: event };
          }
          return zone;
        }),
      );
      setIncidents((current) => {
        let next = current.map((item) => {
          if (item.id !== incidentId) return item;
          if (scenarioId === "west-surge") {
            return {
              ...item,
              reports: Math.max(item.reports, 1 + Math.min(step, 3)),
              status: step >= 3 ? ("Awaiting approval" as const) : ("Monitoring" as const),
              team: "Crowd Team North",
              riskInputs: { ...item.riskInputs, hazardSeverity: step >= 4 ? 45 : 60 + step * 8 },
              summary: event,
            };
          }
          if (scenarioId === "smoke-conflict") {
            return {
              ...item,
              contradictions: Math.min(2, Math.max(0, step - 1)),
              reports: Math.max(1, Math.min(4, step + 1)),
              status: step >= 4 ? ("Awaiting approval" as const) : item.status,
              summary: event,
            };
          }
          if (scenarioId === "medical-multilingual") {
            return {
              ...item,
              reports: Math.max(1, Math.min(3, step + 1)),
              status: step >= 2 ? ("Awaiting approval" as const) : item.status,
              summary:
                step >= 1
                  ? "English and हिंदी reports use different landmarks for the same unconscious guest near west stair W-3."
                  : event,
              evidence:
                step >= 1 && !item.evidence.some((source) => source.source === "SIM-REPORT-HI")
                  ? [
                      ...item.evidence,
                      {
                        source: "SIM-REPORT-HI",
                        fact: "पश्चिमी भोजन क्षेत्र के पास एक व्यक्ति बेहोश है।",
                        weight: "0.84",
                        kind: "Hindi guest report",
                      },
                    ]
                  : item.evidence,
              announcement:
                step >= 2
                  ? {
                      language: "English · हिन्दी",
                      tone: "Calm / directive",
                      text: "Please keep west stair W-3 clear. कृपया पश्चिमी सीढ़ी W-3 को खाली रखें और कर्मचारियों के निर्देशों का पालन करें।",
                    }
                  : item.announcement,
            };
          }
          if (scenarioId === "accessible-block") {
            return {
              ...item,
              status: step >= 1 ? ("Awaiting approval" as const) : item.status,
              riskInputs: { ...item.riskInputs, hazardSeverity: 45 + step * 8 },
              summary: event,
            };
          }
          if (scenarioId === "false-duplicate") {
            return {
              ...item,
              title: "Person fall beside south service lift",
              type: "Medical",
              reports: 1,
              contradictions: 0,
              riskInputs: { hazardSeverity: 60, vulnerablePerson: true },
              summary:
                "One person fall remains a distinct incident from the nearby equipment event.",
              evidence: [
                {
                  source: "REPORT-A-FALL",
                  fact: "A person fell beside the south service lift.",
                  weight: "0.82",
                  kind: "Staff report",
                },
              ],
            };
          }
          return item;
        });
        if (
          scenarioId === "false-duplicate" &&
          step >= 1 &&
          !next.some((item) => item.id === "INC-2038-B")
        ) {
          const base = INITIAL_INCIDENTS.find((item) => item.id === "INC-2038");
          if (base) {
            next = [
              ...next,
              {
                ...base,
                id: "INC-2038-B",
                code: "RISK · PENDING",
                title: "Equipment case fell in service tunnel",
                type: "Infrastructure",
                severity: "moderate",
                confidence: 88,
                age: "now",
                reports: 1,
                contradictions: 0,
                status: "Monitoring",
                riskInputs: { hazardSeverity: 42, vulnerablePerson: false },
                summary:
                  "A falling equipment case in the adjacent tunnel remains separate from the reported person fall.",
                rationale:
                  "Distinct subject and precise location prevent a false merge despite temporal and geographic proximity.",
                evidence: [
                  {
                    source: "REPORT-B-EQUIPMENT",
                    fact: "An equipment case fell in the adjacent service tunnel.",
                    weight: "0.88",
                    kind: "Facilities report",
                  },
                ],
                contradictoryEvidence: [],
              },
            ];
          }
        }
        return next;
      });
      if (scenarioId === "accessible-block" && step >= 1) setPhase("Egress");
      if (scenarioId === "false-duplicate" && step === 3) {
        addAudit(
          "Fusion comparison rejected",
          "REPORT-A-FALL and REPORT-B-EQUIPMENT remain separate; both sources are preserved.",
          incidentId,
          "2 candidate reports",
          "2 distinct incidents",
          "Fusion Engine",
        );
      }
    },
    [addAudit, setIncidents, setPhase, setSelectedId, setSelectedZone, setZones],
  );

  const resetSimulation = useCallback(() => {
    setZones(INITIAL_ZONES);
    setIncidents(INITIAL_INCIDENTS);
    setPhase("Live match");
    setSimulation((current) => ({ ...current, running: false, event: "Baseline restored" }));
    onToast("Scenario baseline restored");
  }, [onToast, setIncidents, setPhase, setZones]);

  const handleSimulationStatus = useCallback((running: boolean, name: string) => {
    setSimulation((current) =>
      current.running === running && current.name === name
        ? current
        : { ...current, running, name },
    );
  }, []);

  return {
    simulation,
    handleSimulationEvent,
    resetSimulation,
    handleSimulationStatus,
  } as const;
}
