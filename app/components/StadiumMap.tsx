"use client";

import { Icon } from "./Icon";
import type { Incident, Zone } from "./aegisData";

type StadiumMapProps = {
  zones: Zone[];
  selectedZone: string;
  selectedIncident: Incident;
  onSelectZone: (id: string) => void;
};

const statusLabel: Record<Zone["state"], string> = {
  critical: "Intervention",
  watch: "Watch",
  stable: "Stable",
  degraded: "Sensor degraded",
};

export function StadiumMap({ zones, selectedZone, selectedIncident, onSelectZone }: StadiumMapProps) {
  const zoneById = (id: string) => zones.find((zone) => zone.id === id) ?? zones[0];
  const west = zoneById("west-concourse");
  const north = zoneById("north-stands");
  const east = zoneById("east-concourse");
  const south = zoneById("south-stands");
  const accessible = zoneById("accessible-corridor");
  const transit = zoneById("transit-plaza");

  const interactive = (zone: Zone) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `${zone.name}, ${statusLabel[zone.state]}, ${zone.occupancy}% occupied`,
    className: `map-zone zone-${zone.state}${selectedZone === zone.id ? " is-selected" : ""}`,
    onClick: () => onSelectZone(zone.id),
    onKeyDown: (event: React.KeyboardEvent<SVGGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelectZone(zone.id);
      }
    },
  });

  return (
    <section className="panel stadium-panel" aria-labelledby="stadium-title">
      <div className="panel-head map-head">
        <div>
          <div className="eyebrow"><span className="live-dot" /> SYNTHETIC SCENARIO FEED</div>
          <h2 id="stadium-title">Unity Stadium 2026</h2>
        </div>
        <div className="map-legend" aria-label="Map legend">
          <span><i className="legend-mark stable" /> Stable</span>
          <span><i className="legend-mark watch" /> Watch</span>
          <span><i className="legend-mark critical" /> Intervention</span>
          <span><i className="legend-mark degraded" /> Degraded</span>
        </div>
      </div>

      <div className="stadium-canvas">
        <svg viewBox="0 0 760 500" className="stadium-svg" aria-label="Interactive operations plan of Unity Stadium 2026">
          <defs>
            <pattern id="criticalPattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="#54292d" />
              <line x1="0" y1="0" x2="0" y2="8" stroke="#ef6a61" strokeWidth="2" />
            </pattern>
            <pattern id="watchPattern" width="9" height="9" patternUnits="userSpaceOnUse">
              <rect width="9" height="9" fill="#43361e" />
              <circle cx="4.5" cy="4.5" r="1.4" fill="#f0b44a" />
            </pattern>
            <pattern id="degradedPattern" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="#273449" />
              <path d="M0 8 8 0" stroke="#7f91a9" strokeWidth="1.2" />
            </pattern>
            <filter id="incidentPulse" x="-60%" y="-60%" width="220%" height="220%">
              <feFlood floodColor="#ff716a" floodOpacity=".3" />
              <feComposite in2="SourceGraphic" operator="in" />
              <feGaussianBlur stdDeviation="6" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <rect className="map-ground" x="5" y="5" width="750" height="490" rx="28" />
          <path className="map-road" d="M45 102C130 25 615 25 710 105M45 398C150 475 610 475 710 395" />
          <path className="map-road road-vertical" d="M72 125V372M688 125V372" />

          <g {...interactive(transit)}>
            <path className="zone-shape transit-shape" d="M210 431h340l-38 43H248Z" />
            <text className="map-label" x="380" y="451" textAnchor="middle">TRANSIT PLAZA · {transit.occupancy}%</text>
            <text className="map-status" x="380" y="467" textAnchor="middle">↗ {Math.abs(transit.flow)}/min · {statusLabel[transit.state]}</text>
          </g>

          <g className="stadium-shell">
            <path className="outer-shell" d="M166 77C242 34 518 34 594 77c68 39 100 109 100 173s-32 134-100 173c-76 43-352 43-428 0-68-39-100-109-100-173S98 116 166 77Z" />
            <path className="concourse-ring" d="M198 104c66-35 298-35 364 0 55 30 82 88 82 146s-27 116-82 146c-66 35-298 35-364 0-55-30-82-88-82-146s27-116 82-146Z" />

            <g {...interactive(north)}>
              <path className="zone-shape seating-shape" d="M205 115c61-28 289-28 350 0l-54 72c-48-17-194-17-242 0Z" />
              <path className="seat-lines" d="M245 132c55-18 215-18 270 0M229 153c58-22 244-22 302 0" />
              <text className="map-label" x="380" y="127" textAnchor="middle">NORTH SEATING</text>
              <text className="map-status" x="380" y="145" textAnchor="middle">{north.occupancy}% · {statusLabel[north.state]}</text>
            </g>

            <g {...interactive(south)}>
              <path className="zone-shape seating-shape" d="M259 313c48 17 194 17 242 0l54 72c-61 28-289 28-350 0Z" />
              <path className="seat-lines" d="M245 368c55 18 215 18 270 0M229 347c58 22 244 22 302 0" />
              <text className="map-label" x="380" y="366" textAnchor="middle">SOUTH SEATING</text>
              <text className="map-status" x="380" y="384" textAnchor="middle">{south.occupancy}% · {statusLabel[south.state]}</text>
            </g>

            <g {...interactive(west)}>
              <path className="zone-shape concourse-shape" d="M187 119 250 190c-27 32-27 88 0 120l-63 71c-40-31-61-79-61-131s21-100 61-131Z" />
              <path className="flow-arrow" d="M170 210v80M160 222l10-12 10 12M160 278l10 12 10-12" />
              <text className="map-label vertical-label" x="159" y="251" textAnchor="middle" transform="rotate(-90 159 251)">WEST CONCOURSE</text>
              <text className="map-status vertical-label" x="179" y="251" textAnchor="middle" transform="rotate(-90 179 251)">{west.occupancy}% · ↑ {west.flow}/MIN</text>
            </g>

            <g {...interactive(east)}>
              <path className="zone-shape concourse-shape" d="m573 119-63 71c27 32 27 88 0 120l63 71c40-31 61-79 61-131s-21-100-61-131Z" />
              <text className="map-label vertical-label" x="601" y="251" textAnchor="middle" transform="rotate(90 601 251)">EAST CONCOURSE</text>
              <text className="map-status vertical-label" x="581" y="251" textAnchor="middle" transform="rotate(90 581 251)">{east.occupancy}% · {statusLabel[east.state]}</text>
            </g>

            <path className="pitch" d="M280 194h200v112H280Z" />
            <circle className="pitch-line" cx="380" cy="250" r="24" />
            <path className="pitch-line" d="M380 194v112M280 225h24v50h-24M480 225h-24v50h24" />
            <text className="pitch-label" x="380" y="255" textAnchor="middle">PITCH</text>

            <g className="poi food" aria-label="Food court west">
              <rect x="212" y="191" width="54" height="30" rx="5" />
              <text x="239" y="204" textAnchor="middle">FOOD</text><text x="239" y="215" textAnchor="middle">W-12</text>
            </g>
            <g className="poi medical" aria-label="Medical room">
              <rect x="494" y="284" width="54" height="30" rx="5" />
              <path d="M516 291v16M508 299h16" />
              <text x="535" y="302">M-1</text>
            </g>
            <g className="poi security" aria-label="Security control point">
              <rect x="490" y="188" width="58" height="30" rx="5" />
              <path d="m506 194 6 2v5c0 4-2 7-6 9-4-2-6-5-6-9v-5Z" />
              <text x="529" y="207">CTRL</text>
            </g>

            <g {...interactive(accessible)}>
              <path className="zone-shape accessible-path" d="M267 326h42v32h142v-32h42" />
              <circle cx="286" cy="342" r="12" className="access-icon-bg" />
              <text x="286" y="346" textAnchor="middle" className="access-icon">A</text>
              <text className="map-status" x="380" y="349" textAnchor="middle">STEP-FREE AC-2 · {statusLabel[accessible.state]}</text>
            </g>

            <path className="service-tunnel" d="M306 170h148" />
            <text className="tiny-label" x="380" y="164" textAnchor="middle">SERVICE TUNNEL S-2</text>

            <g className="gates">
              <g transform="translate(347 57)"><rect width="66" height="25" rx="5"/><text x="33" y="17" textAnchor="middle">GATE N</text></g>
              <g transform="translate(347 418)"><rect width="66" height="25" rx="5"/><text x="33" y="17" textAnchor="middle">GATE S</text></g>
              <g transform="translate(72 238)"><rect width="66" height="25" rx="5"/><text x="33" y="17" textAnchor="middle">GATE W</text></g>
              <g transform="translate(622 238)"><rect width="66" height="25" rx="5"/><text x="33" y="17" textAnchor="middle">GATE E</text></g>
            </g>

            <g className="exits" aria-label="Emergency exits">
              <path d="M201 96h22M537 96h22M201 404h22M537 404h22" />
              <text x="206" y="91">EXIT</text><text x="537" y="91">EXIT</text><text x="206" y="419">EXIT</text><text x="537" y="419">EXIT</text>
            </g>

            <path className="active-route" d="M521 299C470 319 429 319 380 327S302 316 248 270" />
            <g className="incident-marker" transform="translate(236 249)" filter="url(#incidentPulse)">
              <circle r="18" /><path d="M0-9 9 7H-9Z" /><path d="M0-4v5M0 4h.01" />
            </g>
          </g>

          <g className="map-compass" transform="translate(705 432)">
            <circle r="21" /><path d="m0-15 5 14-5-3-5 3Z" /><text y="-25" textAnchor="middle">N</text>
          </g>
        </svg>

        <div className="map-incident-label">
          <span className="map-incident-code">{selectedIncident.id}</span>
          <strong>{selectedIncident.title}</strong>
          <span>{selectedIncident.zone} · {selectedIncident.eta} ETA</span>
        </div>
      </div>

      <div className="map-footer">
        <div className="selected-zone-summary">
          <span className={`zone-status-icon ${zoneById(selectedZone).state}`} aria-hidden="true">
            {zoneById(selectedZone).state === "critical" ? "!" : zoneById(selectedZone).state === "degraded" ? "×" : "✓"}
          </span>
          <div><span>SELECTED ZONE</span><strong>{zoneById(selectedZone).name}</strong></div>
        </div>
        <dl className="zone-mini-stats">
          <div><dt>Occupancy</dt><dd>{zoneById(selectedZone).occupancy}%</dd></div>
          <div><dt>Live flow</dt><dd>{zoneById(selectedZone).flow > 0 ? "+" : ""}{zoneById(selectedZone).flow}/min</dd></div>
          <div><dt>Sensors</dt><dd>{zoneById(selectedZone).sensor}</dd></div>
          <div><dt>Readout</dt><dd>{zoneById(selectedZone).detail}</dd></div>
        </dl>
        <button className="text-button" type="button" onClick={() => onSelectZone(selectedIncident.zoneId)}>
          Focus incident <Icon name="chevron" size={15} />
        </button>
      </div>
    </section>
  );
}
