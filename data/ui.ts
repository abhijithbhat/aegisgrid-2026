export type Severity = "critical" | "high" | "moderate" | "low";

export type IncidentStatus =
  "Awaiting approval" | "Plan approved" | "Monitoring" | "Resolved" | "Dismissed";

export type Incident = {
  id: string;
  code: string;
  title: string;
  type: string;
  zone: string;
  zoneId: string;
  severity: Severity;
  confidence: number;
  age: string;
  reports: number;
  contradictions: number;
  status: IncidentStatus;
  team: string;
  eta: string;
  risk: number;
  riskInputs: { hazardSeverity: number; vulnerablePerson: boolean };
  riskContributions?: { label: string; normalized: number; contribution: number }[];
  riskFormula?: string;
  aiSeverity: string;
  summary: string;
  rationale: string;
  evidence: { source: string; fact: string; weight: string; kind: string }[];
  contradictoryEvidence: { sources: string; description: string; impact: string }[];
  missing: string[];
  questions: string[];
  affectedZones: string[];
  equipment: string[];
  actions: { text: string; owner: string; target: string; approval: boolean }[];
  route: {
    from: string;
    path: string[];
    alternate: string[];
    eta: string;
    alternateEta: string;
    avoided: string[];
    saved: string;
    rationale: string;
  };
  announcement: { language: string; tone: string; text: string };
  uncertainty: string;
};

export type ZoneState = "critical" | "watch" | "stable" | "degraded";

export type Zone = {
  id: string;
  short: string;
  name: string;
  occupancy: number;
  capacity: number;
  state: ZoneState;
  flow: number;
  sensor: string;
  detail: string;
};

export type AuditEvent = {
  id: number | string;
  timestamp: string;
  actor: string;
  action: string;
  incident: string;
  previous: string;
  next: string;
  note: string;
  version: string;
};

export const INITIAL_ZONES: Zone[] = [
  {
    id: "west-concourse",
    short: "WC",
    name: "West Concourse",
    occupancy: 91,
    capacity: 4200,
    state: "critical",
    flow: 184,
    sensor: "4 / 5 online",
    detail: "Density rising near stair W-3",
  },
  {
    id: "north-stands",
    short: "NS",
    name: "North Seating",
    occupancy: 73,
    capacity: 11200,
    state: "stable",
    flow: -26,
    sensor: "8 / 8 online",
    detail: "Normal live-match movement",
  },
  {
    id: "east-concourse",
    short: "EC",
    name: "East Concourse",
    occupancy: 66,
    capacity: 3900,
    state: "watch",
    flow: 54,
    sensor: "6 / 6 online",
    detail: "Food court queue at 11 minutes",
  },
  {
    id: "south-stands",
    short: "SS",
    name: "South Seating",
    occupancy: 78,
    capacity: 10800,
    state: "stable",
    flow: -12,
    sensor: "8 / 8 online",
    detail: "Normal live-match movement",
  },
  {
    id: "accessible-corridor",
    short: "AC",
    name: "Accessible Corridor",
    occupancy: 39,
    capacity: 700,
    state: "degraded",
    flow: 9,
    sensor: "2 / 3 online",
    detail: "Door contact sensor intermittent",
  },
  {
    id: "transit-plaza",
    short: "TP",
    name: "Transit Plaza",
    occupancy: 58,
    capacity: 5800,
    state: "stable",
    flow: 37,
    sensor: "5 / 5 online",
    detail: "Inbound rail volume within plan",
  },
];

export const INITIAL_INCIDENTS: Incident[] = [
  {
    id: "INC-2047",
    code: "P0 · 98.4",
    title: "Unconscious guest near west stairs",
    type: "Medical",
    zone: "West Concourse · W-3",
    zoneId: "west-concourse",
    severity: "critical",
    confidence: 94,
    age: "2m 14s",
    reports: 3,
    contradictions: 0,
    status: "Awaiting approval",
    team: "Medical Alpha",
    eta: "2m 40s",
    risk: 86,
    riskInputs: { hazardSeverity: 100, vulnerablePerson: true },
    aiSeverity: "Critical",
    summary:
      "Three independent reports likely describe one unconscious guest beside stair W-3. High crowd density is reducing access; no injury mechanism is confirmed.",
    rationale:
      "West Concourse occupancy is 91%, inflow remains positive, three independent sources describe a collapsed guest, and Medical Alpha is available nearby.",
    evidence: [
      {
        source: "STAFF-184",
        fact: "Steward reports an unresponsive adult beside stair W-3.",
        weight: "0.96",
        kind: "Staff radio",
      },
      {
        source: "GUEST-ES-72",
        fact: "हिंदी अतिथि रिपोर्ट: पश्चिम भोजन क्षेत्र के पीछे एक व्यक्ति बेहोश हो गया है। (A person is unconscious behind the west food area.)",
        weight: "0.82",
        kind: "Hindi · translated text",
      },
      {
        source: "CAM-DENS-W4",
        fact: "Anonymous density sensor reads 3.8 people/m² and rising.",
        weight: "0.91",
        kind: "Telemetry",
      },
    ],
    contradictoryEvidence: [],
    missing: [
      "Guest breathing status",
      "Exact obstruction width around W-3",
      "Whether an AED is already present",
    ],
    questions: [
      "Can the nearest steward confirm normal breathing?",
      "Is the west-side AED cabinet accessible?",
    ],
    affectedZones: ["West Concourse", "Stair W-3", "Food Court West"],
    equipment: ["Trauma bag", "AED", "Portable screen", "Crowd-control tape"],
    actions: [
      {
        text: "Send Medical Alpha via service corridor W-2",
        owner: "Medical dispatcher",
        target: "Now",
        approval: true,
      },
      {
        text: "Create a 3-metre access lane around stair W-3",
        owner: "Steward lead",
        target: "1 min",
        approval: true,
      },
      {
        text: "Pause west food-court inflow at junction C-7",
        owner: "Crowd control",
        target: "2 min",
        approval: true,
      },
      {
        text: "Confirm breathing status and AED availability",
        owner: "Nearest steward",
        target: "1 min",
        approval: false,
      },
    ],
    route: {
      from: "Medical Room M-1",
      path: ["M-1", "Service S-2", "Junction C-7", "W-3"],
      alternate: ["M-1", "Inner C-4", "Food West", "W-3"],
      eta: "2m 40s",
      alternateEta: "3m 25s",
      avoided: ["West Gate surge", "Stair W-4", "Dense food queue"],
      saved: "1m 12s",
      rationale:
        "The service corridor is 58 metres longer but avoids the highest-density west gate flow and preserves a clear return path for the stretcher.",
    },
    announcement: {
      language: "English · हिन्दी",
      tone: "Calm / directive",
      text: "Please keep west stair W-3 clear and follow steward directions. कृपया पश्चिमी सीढ़ी W-3 को खाली रखें और स्टेडियम कर्मचारियों के निर्देशों का पालन करें।",
    },
    uncertainty:
      "Location confidence is high. Medical condition and breathing status remain unverified; this system does not provide a diagnosis.",
  },
  {
    id: "INC-2045",
    code: "P1 · 84.1",
    title: "Conflicting smoke reports",
    type: "Fire / environmental",
    zone: "East Concourse · E-2",
    zoneId: "east-concourse",
    severity: "high",
    confidence: 68,
    age: "4m 08s",
    reports: 4,
    contradictions: 2,
    status: "Plan approved",
    team: "Fire Safety 1",
    eta: "3m 10s",
    risk: 72,
    riskInputs: { hazardSeverity: 65, vulnerablePerson: false },
    aiSeverity: "High",
    summary:
      "Two reports describe smoke near E-2; a production runner identifies theatrical haze and the air-quality sensor remains normal. Physical verification is required before escalation.",
    rationale:
      "Independent visual reports justify rapid inspection, while normal particulate readings and a credible production note lower confidence that combustion is present.",
    evidence: [
      {
        source: "GUEST-401",
        fact: "Visible grey haze near east kiosk 12.",
        weight: "0.74",
        kind: "Guest text",
      },
      {
        source: "STAFF-196",
        fact: "Usher reports a smoke smell at E-2.",
        weight: "0.88",
        kind: "Staff radio",
      },
      {
        source: "AQ-E2",
        fact: "PM2.5 and CO remain inside event baseline.",
        weight: "0.93",
        kind: "Telemetry",
      },
    ],
    contradictoryEvidence: [
      {
        sources: "GUEST-401 ↔ PROD-22",
        description: "Smoke reported; production runner says theatrical haze.",
        impact: "Source must be visually verified.",
      },
      {
        sources: "STAFF-196 ↔ AQ-E2",
        description: "Odour reported while particulate and CO sensors remain normal.",
        impact: "Sensor cannot rule out an early or localized event.",
      },
    ],
    missing: ["Thermal reading at kiosk 12", "Production haze release log"],
    questions: ["Can Fire Safety 1 confirm heat, flame, or a combustion odour?"],
    affectedZones: ["East Concourse E-2", "Kiosk 12"],
    equipment: ["Thermal camera", "Radio", "Portable air monitor"],
    actions: [
      {
        text: "Verify kiosk 12 with thermal camera",
        owner: "Fire Safety 1",
        target: "3 min",
        approval: true,
      },
      {
        text: "Hold nonessential haze effects",
        owner: "Production control",
        target: "Now",
        approval: true,
      },
      {
        text: "Keep E-2 egress path unobstructed",
        owner: "Steward E-2",
        target: "Now",
        approval: false,
      },
    ],
    route: {
      from: "Security Control",
      path: ["SC-1", "Inner C-3", "E-2"],
      alternate: ["SC-1", "Service S-1", "Kiosk 12"],
      eta: "3m 10s",
      alternateEta: "3m 48s",
      avoided: ["Food Court queue"],
      saved: "0m 42s",
      rationale:
        "Inner concourse C-3 has lower density and direct access to the affected kiosk face.",
    },
    announcement: {
      language: "English",
      tone: "Calm / standby",
      text: "Please keep the area around east kiosk 12 clear while stadium staff complete a safety check. Follow nearby steward directions.",
    },
    uncertainty: "The presence of haze is credible; its source is not yet established.",
  },
  {
    id: "INC-2043",
    code: "P2 · 65.7",
    title: "Accessible corridor door fault",
    type: "Accessibility",
    zone: "South-east corridor · AC-2",
    zoneId: "accessible-corridor",
    severity: "moderate",
    confidence: 89,
    age: "7m 31s",
    reports: 2,
    contradictions: 0,
    status: "Monitoring",
    team: "Accessibility Rover",
    eta: "4m 20s",
    risk: 58,
    riskInputs: { hazardSeverity: 45, vulnerablePerson: true },
    aiSeverity: "Moderate",
    summary:
      "The AC-2 powered door is intermittent. A step-free alternate is open, but the fault would constrain egress if conditions change.",
    rationale:
      "Door telemetry and a steward report agree; low current occupancy limits immediate risk, but step-free route resilience is reduced.",
    evidence: [
      {
        source: "DOOR-AC2",
        fact: "Three incomplete open cycles in five minutes.",
        weight: "0.98",
        kind: "Telemetry",
      },
      {
        source: "STAFF-170",
        fact: "Door requires manual assistance.",
        weight: "0.92",
        kind: "Staff radio",
      },
    ],
    contradictoryEvidence: [],
    missing: ["Repair time estimate"],
    questions: ["Can maintenance place the door in a safe held-open state?"],
    affectedZones: ["Accessible Corridor AC-2", "South-east landing"],
    equipment: ["Door override key", "Portable wayfinding sign"],
    actions: [
      {
        text: "Station accessibility rover at AC-2",
        owner: "Accessibility lead",
        target: "4 min",
        approval: true,
      },
      {
        text: "Post step-free diversion signage",
        owner: "Steward AC-1",
        target: "3 min",
        approval: true,
      },
    ],
    route: {
      from: "Accessibility Point A-1",
      path: ["A-1", "Lift L-2", "South C-6", "AC-2"],
      alternate: ["A-1", "Ramp R-4", "South C-5", "AC-2"],
      eta: "4m 20s",
      alternateEta: "5m 05s",
      avoided: ["Stairs S-6"],
      saved: "0m 55s",
      rationale: "The selected route is fully step-free and avoids the AC-3 pinch point.",
    },
    announcement: {
      language: "English",
      tone: "Calm / informative",
      text: "Step-free access remains available via lift L-2. Please follow the blue accessibility signs or ask a steward for assistance.",
    },
    uncertainty: "Door failure is confirmed; duration and repair window are unknown.",
  },
  {
    id: "INC-2040",
    code: "P3 · 51.2",
    title: "North gate queue crossover",
    type: "Crowd",
    zone: "North Gate · N-1",
    zoneId: "north-stands",
    severity: "moderate",
    confidence: 83,
    age: "11m 02s",
    reports: 2,
    contradictions: 0,
    status: "Monitoring",
    team: "Crowd Team North",
    eta: "1m 55s",
    risk: 51,
    riskInputs: { hazardSeverity: 55, vulnerablePerson: false },
    aiSeverity: "Moderate",
    summary:
      "Two ticketing queues are crossing at North Gate N-1. Throughput is stable but the crossover reduces emergency-lane width.",
    rationale:
      "Queue geometry is verified and the emergency lane is partially constrained, though overall density remains below intervention threshold.",
    evidence: [
      {
        source: "STAFF-155",
        fact: "Queues A and B intersect beside barrier N-14.",
        weight: "0.91",
        kind: "Staff radio",
      },
      {
        source: "FLOW-N1",
        fact: "Gate throughput remains 46 entries/min.",
        weight: "0.95",
        kind: "Telemetry",
      },
    ],
    contradictoryEvidence: [],
    missing: ["Current emergency lane width"],
    questions: ["Can North lead confirm a 2.5-metre clear lane?"],
    affectedZones: ["North Gate N-1"],
    equipment: ["Retractable barriers", "Direction paddles"],
    actions: [
      {
        text: "Separate queues with barrier N-14",
        owner: "Crowd Team North",
        target: "2 min",
        approval: false,
      },
    ],
    route: {
      from: "North Steward Post",
      path: ["N-Post", "Gate N-2", "N-1"],
      alternate: ["N-Post", "Transit Plaza", "N-1"],
      eta: "1m 55s",
      alternateEta: "2m 35s",
      avoided: ["Queue A crossover"],
      saved: "0m 40s",
      rationale: "The gate-side lane remains clear and avoids walking against inbound flow.",
    },
    announcement: {
      language: "English",
      tone: "Calm / directive",
      text: "North Gate guests: please remain in your marked queue and keep the blue emergency lane clear.",
    },
    uncertainty: "Lane clearance has not been physically measured.",
  },
  {
    id: "INC-2038",
    code: "P4 · 33.9",
    title: "Service lift temperature alert",
    type: "Infrastructure",
    zone: "Service Tunnel · L-4",
    zoneId: "south-stands",
    severity: "low",
    confidence: 76,
    age: "18m 45s",
    reports: 1,
    contradictions: 1,
    status: "Plan approved",
    team: "Facilities 2",
    eta: "6m 15s",
    risk: 34,
    riskInputs: { hazardSeverity: 35, vulnerablePerson: false },
    aiSeverity: "Low",
    summary:
      "A brief motor-temperature spike has cleared. Facilities is checking lift L-4 before it returns to service.",
    rationale:
      "The alert was isolated, current readings are normal, and a parallel service route remains available.",
    evidence: [
      {
        source: "LIFT-L4",
        fact: "Motor reached 78°C for 42 seconds and returned to baseline.",
        weight: "0.94",
        kind: "Telemetry",
      },
    ],
    contradictoryEvidence: [
      {
        sources: "LIFT-L4 ↔ MAINT-08",
        description: "Sensor shows a spike; remote panel recorded no fault code.",
        impact: "Inspect locally before return to service.",
      },
    ],
    missing: ["Physical inspection result"],
    questions: ["Is there any odour or abnormal vibration at L-4?"],
    affectedZones: ["Service Lift L-4"],
    equipment: ["Thermal probe", "Lockout tag"],
    actions: [
      {
        text: "Inspect and hold lift L-4 out of service",
        owner: "Facilities 2",
        target: "6 min",
        approval: true,
      },
    ],
    route: {
      from: "Facilities Workshop",
      path: ["Workshop", "Service S-5", "L-4"],
      alternate: ["Workshop", "South Dock", "L-4"],
      eta: "6m 15s",
      alternateEta: "7m 05s",
      avoided: ["Public concourse"],
      saved: "0m 48s",
      rationale: "Service S-5 avoids public traffic and supports equipment access.",
    },
    announcement: {
      language: "Not required",
      tone: "Internal",
      text: "No public announcement recommended at current risk level.",
    },
    uncertainty: "Cause of the short temperature excursion is unknown.",
  },
];

export const INITIAL_AUDIT: AuditEvent[] = [
  {
    id: 4,
    timestamp: "19:42:18",
    actor: "Safety Supervisor",
    action: "Plan viewed",
    incident: "INC-2047",
    previous: "New",
    next: "Awaiting approval",
    note: "AI recommendation opened for review.",
    version: "incident-analysis v2.4.1",
  },
  {
    id: 3,
    timestamp: "19:40:51",
    actor: "Fusion Engine",
    action: "Reports fused",
    incident: "INC-2047",
    previous: "2 sources",
    next: "3 sources",
    note: "STAFF-184 matched GUEST-ES-72 within zone/time window.",
    version: "incident-fusion v1.8.0",
  },
  {
    id: 2,
    timestamp: "19:39:33",
    actor: "Safety Supervisor",
    action: "Response plan approved",
    incident: "INC-2045",
    previous: "Awaiting approval",
    next: "Plan approved",
    note: "Inspection only; no evacuation instruction issued.",
    version: "incident-analysis v2.4.1",
  },
  {
    id: 1,
    timestamp: "19:37:06",
    actor: "Routing Engine",
    action: "Route recalculated",
    incident: "INC-2043",
    previous: "Route AC-2A",
    next: "Route AC-2B",
    note: "Step-free path retained after door sensor degradation.",
    version: "deterministic-route v3.1.0",
  },
];

export const SCENARIOS = [
  {
    id: "west-surge",
    number: "01",
    name: "West Gate Surge",
    category: "Crowd dynamics",
    duration: "04:30",
    description:
      "Occupancy rises quickly, inflow exceeds outflow, and one density sensor degrades.",
    impact: "+14% west occupancy",
    incidentId: "INC-2040",
    events: [
      "West Gate inflow rises above 170/min",
      "Queue spills toward transit plaza",
      "Density sensor WG-03 enters degraded state",
      "Crowd Team West becomes recommended",
      "Emergency lane diversion stabilizes flow",
    ],
  },
  {
    id: "smoke-conflict",
    number: "02",
    name: "Conflicting Smoke Reports",
    category: "Evidence conflict",
    duration: "03:45",
    description:
      "Smoke, theatrical fog, and normal air-quality signals arrive from independent sources.",
    impact: "+2 contradictions",
    incidentId: "INC-2045",
    events: [
      "Guest text mentions grey smoke at E-2",
      "Usher reports an unusual odour",
      "Production runner reports theatrical haze",
      "AQ-E2 remains within normal baseline",
      "Thermal inspection requested for kiosk 12",
    ],
  },
  {
    id: "medical-multilingual",
    number: "03",
    name: "Multilingual Medical Incident",
    category: "Semantic fusion",
    duration: "03:10",
    description:
      "English and Hindi reports use different scripts and location wording for one unconscious guest.",
    impact: "+3 fused reports",
    incidentId: "INC-2047",
    events: [
      "हिंदी guest report rendered near food area",
      "English steward report references stair W-3",
      "Semantic fusion proposes a shared incident",
      "Location confidence reaches 94%",
      "Medical Alpha route is recalculated",
    ],
  },
  {
    id: "accessible-block",
    number: "04",
    name: "Accessible Corridor Blockage",
    category: "Inclusive routing",
    duration: "05:15",
    description:
      "A step-free corridor becomes unavailable during egress; stairs and blocked edges are excluded.",
    impact: "Route AC-2B active",
    incidentId: "INC-2043",
    events: [
      "Event phase changes to egress",
      "Powered door AC-2 fails open cycle",
      "Route engine excludes stairs S-6",
      "Step-free diversion via lift L-2 selected",
      "Accessibility rover position confirmed",
    ],
  },
  {
    id: "false-duplicate",
    number: "05",
    name: "False Duplicate Challenge",
    category: "Fusion precision",
    duration: "04:05",
    description:
      "Two nearby, similarly timed incidents must remain distinct despite lexical similarity.",
    impact: "2 incidents preserved",
    incidentId: "INC-2038",
    events: [
      "Report A: fall beside south service lift",
      "Report B: equipment fall in adjacent tunnel",
      "Candidate pair passes zone/time blocking",
      "Semantic comparison finds different subjects",
      "Fusion rejected; source records preserved",
    ],
  },
] as const;

export const CANONICAL_FIELDS = [
  "timestamp",
  "zone_id",
  "occupancy",
  "capacity",
  "inflow_per_minute",
  "outflow_per_minute",
  "queue_minutes",
  "sensor_health",
  "blocked",
  "event_phase",
  "Ignore field",
];

export const SAMPLE_ROWS = [
  ["2026-07-10T19:41:00Z", "WEST_CONC", "3820", "4200", "184", "51", "degraded"],
  ["2026-07-10T19:42:00Z", "EAST_CONC", "2574", "3900", "54", "67", "healthy"],
  ["2026-07-10T19:43:00Z", "ACCESS_02", "273", "700", "9", "12", "degraded"],
];

export const SAMPLE_HEADERS = [
  "recorded_at",
  "area_code",
  "people_now",
  "max_safe",
  "entries_pm",
  "exits_pm",
  "device_state",
];
