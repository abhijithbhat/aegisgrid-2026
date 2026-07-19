"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import { SCENARIOS } from "./aegisData";

type ScenarioSimulatorProps = {
  onEvent: (
    incidentId: string,
    event: string,
    scenarioId: string,
    step: number,
    seed: number,
  ) => void;
  onReset: () => void;
  onStatus: (running: boolean, scenarioName: string) => void;
};

export function ScenarioSimulator({ onEvent, onReset, onStatus }: ScenarioSimulatorProps) {
  const [scenarioId, setScenarioId] = useState<(typeof SCENARIOS)[number]["id"]>(SCENARIOS[0].id);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [seed, setSeed] = useState(2026);

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];
  const progress = ((step + (running ? 0.45 : 0)) / (scenario.events.length - 1)) * 100;
  const elapsed = useMemo(() => {
    const total = Math.round(
      (step / (scenario.events.length - 1)) * Number(scenario.duration.split(":")[0]) * 60,
    );
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }, [step, scenario]);

  useEffect(() => {
    onStatus(running, scenario.name);
    if (!running) return;
    const timer = window.setInterval(
      () => {
        setStep((current) => {
          const next = current + 1;
          if (next >= scenario.events.length) {
            setRunning(false);
            return current;
          }
          onEvent(scenario.incidentId, scenario.events[next], scenario.id, next, seed);
          return next;
        });
      },
      Math.max(380, 1700 / speed),
    );
    return () => window.clearInterval(timer);
  }, [running, scenario, speed, seed, onEvent, onStatus]);

  const chooseScenario = (id: (typeof SCENARIOS)[number]["id"]) => {
    setRunning(false);
    setScenarioId(id);
    setStep(0);
    const next = SCENARIOS.find((item) => item.id === id) ?? SCENARIOS[0];
    onEvent(next.incidentId, next.events[0], next.id, 0, seed);
  };

  const resetSimulation = () => {
    setRunning(false);
    setStep(0);
    onReset();
  };

  const skip = () => {
    const next = Math.min(step + 1, scenario.events.length - 1);
    setStep(next);
    onEvent(scenario.incidentId, scenario.events[next], scenario.id, next, seed);
    if (next === scenario.events.length - 1) setRunning(false);
  };

  return (
    <main className="workspace-view simulator-view">
      <div className="view-heading">
        <div>
          <div className="eyebrow">DETERMINISTIC REHEARSAL ENVIRONMENT</div>
          <h1>Scenario Simulator</h1>
          <p>
            Stress-test fusion, prioritization, and routing with reproducible synthetic operational
            events.
          </p>
        </div>
        <div className="scenario-run-state">
          <span className={running ? "is-running" : ""}>
            <i />
            {running ? "Simulation running" : step ? "Simulation paused" : "Ready"}
          </span>
          <small>Seed {seed}</small>
        </div>
      </div>

      <div className="simulator-grid">
        <aside className="panel scenario-library" aria-label="Scenario library">
          <div className="panel-head">
            <div>
              <div className="eyebrow">5 VALIDATED DRILLS</div>
              <h2>Scenario library</h2>
            </div>
          </div>
          <div className="scenario-list">
            {SCENARIOS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={scenarioId === item.id ? "is-active" : ""}
                onClick={() => chooseScenario(item.id)}
                aria-pressed={scenarioId === item.id}
              >
                <span className="scenario-number">{item.number}</span>
                <span className="scenario-list-copy">
                  <strong>{item.name}</strong>
                  <small>
                    {item.category} · {item.duration}
                  </small>
                </span>
                <Icon name="chevron" size={15} />
              </button>
            ))}
          </div>
          <div className="scenario-library-note">
            <Icon name="shield" size={16} />
            <span>
              All scenarios use synthetic, non-personal data and update the same domain state as
              operator inputs.
            </span>
          </div>
        </aside>

        <section className="panel scenario-stage">
          <div className="scenario-stage-head">
            <div>
              <span className="scenario-large-number">{scenario.number}</span>
              <div>
                <div className="eyebrow">{scenario.category.toUpperCase()}</div>
                <h2>{scenario.name}</h2>
                <p>{scenario.description}</p>
              </div>
            </div>
            <span className="scenario-impact">{scenario.impact}</span>
          </div>

          <div className="simulation-monitor">
            <div className="sim-clock">
              <span>SIMULATION TIME</span>
              <strong>
                {elapsed}
                <small> / {scenario.duration}</small>
              </strong>
            </div>
            <div className="sim-progress">
              <span style={{ width: `${Math.min(100, progress)}%` }} />
              <i style={{ left: `calc(${Math.min(98, progress)}% - 6px)` }} />
            </div>
            <div className="sim-event-now">
              <span className={running ? "pulse" : ""} />
              <div>
                <small>
                  {running
                    ? "EVENT STREAM ACTIVE"
                    : step === scenario.events.length - 1
                      ? "SCENARIO COMPLETE"
                      : "CURRENT STATE"}
                </small>
                <strong>{scenario.events[step]}</strong>
              </div>
            </div>
          </div>

          <div className="sim-controls">
            <div className="transport-controls">
              <button
                type="button"
                className="transport-secondary"
                onClick={resetSimulation}
                aria-label="Reset scenario"
              >
                <Icon name="reset" size={18} />
              </button>
              <button
                type="button"
                className="transport-primary"
                onClick={() => {
                  if (!running && step === scenario.events.length - 1) setStep(0);
                  setRunning(!running);
                  if (!running)
                    onEvent(
                      scenario.incidentId,
                      scenario.events[step === scenario.events.length - 1 ? 0 : step],
                      scenario.id,
                      step === scenario.events.length - 1 ? 0 : step,
                      seed,
                    );
                }}
                aria-label={running ? "Pause scenario" : "Play scenario"}
              >
                {running ? <Icon name="pause" size={20} /> : <Icon name="play" size={20} />}
                <span>{running ? "Pause" : "Play"}</span>
              </button>
              <button
                type="button"
                className="transport-secondary"
                onClick={skip}
                aria-label="Advance to next event"
              >
                <Icon name="skip" size={18} />
              </button>
            </div>
            <label className="speed-control">
              Speed
              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
              </select>
            </label>
            <label className="seed-control">
              Random seed
              <div>
                <input
                  type="number"
                  value={seed}
                  onChange={(event) => setSeed(Number(event.target.value.slice(0, 8)))}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Generate new seed"
                  onClick={() => setSeed((current) => (current * 9301 + 49297) % 1000000)}
                >
                  <Icon name="reset" size={14} />
                </button>
              </div>
            </label>
          </div>

          <section className="timeline-section">
            <div className="section-title">
              <span className="section-icon cyan">
                <Icon name="clock" size={16} />
              </span>
              <div>
                <span>EVENT TIMELINE</span>
                <small>Events alter incident, telemetry, or route state</small>
              </div>
            </div>
            <ol className="timeline-list">
              {scenario.events.map((event, index) => (
                <li
                  key={event}
                  className={index < step ? "is-complete" : index === step ? "is-current" : ""}
                >
                  <span className="timeline-node">
                    {index < step ? (
                      <Icon name="check" size={13} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <div>
                    <small>T+{String(index).padStart(2, "0")}:00</small>
                    <strong>{event}</strong>
                  </div>
                  <span className="timeline-state">
                    {index < step
                      ? "Applied"
                      : index === step
                        ? running
                          ? "Streaming"
                          : "Current"
                        : "Pending"}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </section>

        <aside className="panel sim-inspector">
          <div className="panel-head">
            <div>
              <div className="eyebrow">STATE INSPECTOR</div>
              <h2>Expected behavior</h2>
            </div>
          </div>
          <div className="assertion-list">
            <article>
              <span className="assertion-icon">
                <Icon name="database" size={15} />
              </span>
              <div>
                <strong>Input mutation</strong>
                <p>Every event writes to shared telemetry or incident state.</p>
              </div>
              <span className="assertion-ok">
                <Icon name="check" size={12} />
                Linked
              </span>
            </article>
            <article>
              <span className="assertion-icon">
                <Icon name="spark" size={15} />
              </span>
              <div>
                <strong>Fusion behavior</strong>
                <p>
                  {scenario.id === "false-duplicate"
                    ? "Sources remain separate after semantic comparison."
                    : "Plausible reports preserve their original source IDs."}
                </p>
              </div>
              <span className="assertion-ok">
                <Icon name="check" size={12} />
                Asserted
              </span>
            </article>
            <article>
              <span className="assertion-icon">
                <Icon name="route" size={15} />
              </span>
              <div>
                <strong>Route constraint</strong>
                <p>
                  {scenario.id === "accessible-block"
                    ? "Blocked path and all stairs are excluded."
                    : "Congestion and hazards alter edge costs."}
                </p>
              </div>
              <span className="assertion-ok">
                <Icon name="check" size={12} />
                Asserted
              </span>
            </article>
          </div>
          <div className="seed-explanation">
            <Icon name="info" size={15} />
            <p>
              <strong>Reproducible by design.</strong> The same scenario and seed produce the same
              ordered events, letting evaluators compare decisions reliably.
            </p>
          </div>
          <div className="sim-output-card">
            <span>ACTIVE INCIDENT</span>
            <strong>{scenario.incidentId}</strong>
            <small>Open Command Center to inspect the updated assessment.</small>
          </div>
        </aside>
      </div>
    </main>
  );
}
