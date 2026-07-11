# AEGISGRID 2026

**Explainable Incident Fusion & Response Copilot for Stadium Safety Supervisors**

> From fragmented signals to one safe, explainable decision.

AegisGrid converts noisy crowd telemetry, multilingual reports, venue topology, team availability, and uncertain observations into one prioritized, evidence-grounded recommendation for a trained **stadium safety supervisor**. It supports Operational Intelligence and Real-Time Decision Support; it does not autonomously dispatch responders or replace venue procedures.

The product uses a synthetic venue—**Unity Stadium 2026**—and original interface assets. It contains no official tournament, venue, club, or federation branding.

## What judges can prove

- A synthetic scenario feed drives readiness, occupancy, flows, incidents, and sensor health from shared application state.
- A real binary max-priority queue orders incidents (`peek O(1)`, insert/remove `O(log n)`).
- The incident intelligence view separates a transparent deterministic risk score from AI severity and explains disagreement.
- Supporting source IDs, contradictions, missing information, clarifying questions, uncertainty, team/equipment, action order, and communication remain inspectable.
- CSV, JSON, PDF, and direct text enter a staged Data Injection Lab: inspect → map → approve → edit → validate → import.
- Every mapping is visible; uncertain mappings are never silently applied. Validation reports are downloadable.
- A*/Dijkstra routing over a weighted adjacency-list graph calculates primary, alternate, and naive-distance routes. The LLM never invents a path.
- Five reproducible scenarios mutate the same state: West Gate Surge, Conflicting Smoke Reports, Multilingual Medical Incident, Accessible Corridor Blockage, and False Duplicate Challenge.
- Accept/Modify/Dismiss, team assignment, step completion, notes, and resolution create append-only audit events. “Accept” means supervisor approval—not dispatch.

## Hybrid AI architecture

| Deterministic code owns | Gemini owns |
|---|---|
| Numeric validation and normalization | Interpreting unstructured incident reports |
| 0–100 risk arithmetic and factor breakdown | Comparing plausible cross-language duplicates |
| Binary-heap ordering | Synthesizing contradictions and uncertainty |
| Graph routing and dynamic edge costs | Proposing unfamiliar-schema mappings |
| File limits, server-set audit actors, persistence | Drafting audience- and urgency-aware announcements |
| Runtime schema validation and source-ID checks | Producing minimum high-value clarifying questions |

AI responses use a strict structured contract, current official `@google/genai`, JSON-schema constrained output, independent runtime validation, evidence-ID verification, and exactly one constrained repair attempt. `GEMINI_MODEL` controls the model; the documented default is the stable, cost-efficient `gemini-2.5-flash-lite` verified from [Google's model guide](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite).

When the provider or key is unavailable, the UI says **“AI analysis unavailable.”** Risk, priority ordering, telemetry, upload validation, and routing continue. Semantic fusion, contradiction synthesis, AI confidence, and generated announcements are marked unavailable rather than replaced with canned output.

See [architecture](docs/architecture.md), [security](docs/security.md), [accessibility](docs/accessibility.md), and [prompt evolution](docs/prompt-evolution.md).

## Run locally

Requirements: Node.js 22+, npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. A Gemini key is optional for deterministic and scenario workflows. To enable live semantic analysis, set the server-only `GEMINI_API_KEY`; never use a `NEXT_PUBLIC_` key.

### Environment

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Server-only Gemini API credential |
| `GEMINI_MODEL` | Provider model, default `gemini-2.5-flash-lite` |
| `AI_TIMEOUT_MS` | Per-request provider deadline (bounded in code) |
| `AI_MAX_RETRIES` | Transient retries; maximum one retry |
| `ENABLE_FIRESTORE` | Enables durable server-side incidents/audit persistence |
| `FIREBASE_PROJECT_ID` | Firestore project when Application Default Credentials are used |
| `APP_ORIGIN` | Absolute production origin and script target |

## Verify

```bash
npm run typecheck
npm test
npm run build
npm run check:size
```

The complete local gate is `npm run verify`. Browser checks use `npm run test:e2e`; the AI eval harness uses `npm run evals` against `APP_ORIGIN`.

Tests cover risk boundaries, heap order/complexity behaviour, duplicate blocking, false-duplicate preservation, accessible routing, strict AI contracts, repair/fail-safe behavior, malformed/adversarial imports, oversized files, unknown zones, typed APIs, and degraded mode.

## Data Injection Lab contract

- Maximum file size: 2 MiB on client and server.
- Allowlisted formats: CSV, JSON, selectable-text PDF, and plain text.
- PDF limits: 50 pages and 250,000 extracted characters. Scanned/encrypted PDFs fail with a useful message instead of pretending OCR succeeded.
- Canonical telemetry includes timestamp, zone, occupancy/capacity, flows, queue, temperature, AQI, noise, sensor health, blockage, and event phase.
- Negative/impossible values, missing capacity, invalid timestamps, NaN/infinity, nested JSON, malformed rows, duplicate headers, and unknown zones fail strict normalization.
- Uploaded text is delimited as untrusted data, cannot change instructions, and is discarded after processing; only normalized approved values may be stored.

## Cloud deployment

`Dockerfile` targets Node 22 and the injected Cloud Run `PORT`. Configure Firestore through Application Default Credentials and place `GEMINI_API_KEY` in Google Secret Manager; Google recommends server-side Admin initialization and managed secrets for Cloud Run. The same UI can publish through Codex Sites in honest no-credential/degraded mode.

Firestore rules deny all direct browser access. Audit events are created through a server-set supervisor role and use create-only document identities. The public no-credential demo keeps scenario/telemetry state intentionally ephemeral; enabling Firestore makes audit storage durable. A real venue pilot still requires organization SSO and formal role authorization.

## Demo and operating assumptions

Follow [the seven-minute judge demo](docs/judge-demo.md) with seed `2026`. All venue records and performance numbers are synthetic and make no claim about real-world impact. Before a real pilot, add venue SSO, formal authorization roles, managed rate limiting, regional retention policy, security review, operator training, and approved incident procedures.

## Repository rules

- One application, one branch, no secrets.
- `.env.example` is committed; `.env*` remains ignored.
- `scripts/check-repo-size.mjs` verifies the submission payload remains under 10 MiB.
- Source reports are preserved after fusion; hidden reasoning is never stored.
- No facial recognition, biometrics, medical diagnosis, discriminatory profiling, or personal identity inference.

MIT licensed. Built for PromptWars Virtual Challenge 4: Smart Stadiums & Tournament Operations.
