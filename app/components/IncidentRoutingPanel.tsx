"use client";

import type { Incident } from "./aegisData";
import { Icon } from "./Icon";

export function IncidentRoutingPanel({ incident }: { incident: Incident }) {
  return (
    <div
      id="incident-panel-routing"
      aria-labelledby="incident-tab-routing"
      className="tab-content routing-content"
      role="tabpanel"
    >
      <div className="route-summary-grid">
        <div>
          <span>PRIMARY ETA</span>
          <strong>{incident.route.eta}</strong>
          <small>Dynamic weighted route</small>
        </div>
        <div>
          <span>ALTERNATE ETA</span>
          <strong>{incident.route.alternateEta}</strong>
          <small>Continuously available</small>
        </div>
        <div>
          <span>TIME SAVED</span>
          <strong>{incident.route.saved}</strong>
          <small>vs distance-only route</small>
        </div>
      </div>
      <section className="route-diagram" aria-label="Responder route diagram">
        <div className="route-line primary-route-line">
          {incident.route.path.map((node, index) => (
            <span key={node}>
              <i>
                {index === 0 ? (
                  <Icon name="team" size={14} />
                ) : index === incident.route.path.length - 1 ? (
                  <Icon name="alert" size={14} />
                ) : (
                  index
                )}
              </i>
              <b>{node}</b>
            </span>
          ))}
        </div>
        <div className="route-label">
          <span className="line-swatch primary" />
          Primary · lower congestion cost
        </div>
        <div className="route-line alternate-route-line">
          {incident.route.alternate.map((node, index) => (
            <span key={node}>
              <i>{index === 0 ? "A" : index}</i>
              <b>{node}</b>
            </span>
          ))}
        </div>
        <div className="route-label">
          <span className="line-swatch alternate" />
          Alternate · held in reserve
        </div>
      </section>
      <div className="route-explanation">
        <div className="section-title">
          <span className="section-icon cyan">
            <Icon name="route" size={16} />
          </span>
          <div>
            <span>DETERMINISTIC ROUTE RATIONALE</span>
            <small>Dijkstra · weighted adjacency list</small>
          </div>
        </div>
        <p>{incident.route.rationale}</p>
        <div className="avoided-zones">
          <span>AVOIDED</span>
          {incident.route.avoided.map((zone) => (
            <strong key={zone}>
              <Icon name="x" size={12} />
              {zone}
            </strong>
          ))}
        </div>
      </div>
      <div className="route-factors">
        {[
          "Physical distance",
          "Crowd congestion",
          "Blocked corridors",
          "Accessibility",
          "Hazard exposure",
          "One-way controls",
        ].map((factor, index) => (
          <span key={factor}>
            <i className={index < 5 ? "active" : ""} />
            {factor}
          </span>
        ))}
      </div>
      <div className="deterministic-notice">
        <Icon name="shield" size={17} />
        <span>
          <strong>Path integrity protected.</strong> Routes are calculated by the deterministic
          graph engine; AI explains but cannot create or alter path nodes.
        </span>
      </div>
    </div>
  );
}
