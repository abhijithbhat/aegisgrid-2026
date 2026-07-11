# AegisGrid architecture

## Product boundary

AegisGrid serves one operator: the stadium safety supervisor. It is a decision-support surface, not an autonomous dispatcher. Every operational recommendation remains pending until a supervisor accepts or edits it.

## Input → reasoning → action

```mermaid
flowchart LR
  A[Telemetry, reports, uploads, topology, teams] --> B[Strict validation and normalization]
  B --> C[Deterministic engines]
  C --> D[Gemini grounded interpretation]
  D --> E[Validated recommendation contract]
  E --> F[Priority queue, route, plan, communication]
  F --> G[Human approval]
  G --> H[Append-only audit event]
```

Deterministic code owns arithmetic, validation, route calculation, heap ordering, authorization boundaries, persistence, and file limits. Gemini owns semantic interpretation, plausible-duplicate comparison, contradiction synthesis, context-sensitive communication, unfamiliar-schema proposals, and uncertainty-reducing questions. The model receives only source IDs and normalized facts; output is rejected when it cites a source that was not supplied.

## Runtime surfaces

- `app/` contains the operator experience and typed server routes.
- `src/lib/risk` calculates the transparent 0–100 baseline.
- `src/lib/incidents` blocks and ranks duplicate candidates, then maintains the binary heap.
- `src/lib/routing` calculates primary, alternate, and naive routes over an adjacency list.
- `app/api/analyze`, `app/api/fuse`, and `app/api/upload` invoke `@google/genai` only on the server; `src/lib/ai` validates output, attempts one constrained repair, and returns an explicit degraded result when unavailable.
- `src/lib/data`, `src/lib/telemetry`, and `src/lib/validation` treat uploads and free text as untrusted data.
- `src/lib/firestore` persists incidents and append-only audit events when Firestore is enabled; in-browser scenario state remains intentionally non-durable in the public no-credential demo.

## Provider choices verified July 2026

The app uses Google's GA [`@google/genai`](https://ai.google.dev/gemini-api/docs/libraries) package and configures the stable, cost-efficient [`gemini-2.5-flash-lite`](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite) through `GEMINI_MODEL`. Structured output uses `responseMimeType: application/json` plus `responseJsonSchema`, then Zod validation. Per-request `httpOptions.timeout` and bounded retry settings are explicit.

Firestore uses Firebase Admin with Application Default Credentials on Google Cloud, as recommended by the [server setup guide](https://firebase.google.com/docs/admin/setup). Cloud Run deployment stores `GEMINI_API_KEY` in Secret Manager and injects it server-side.

## Risk formula

Each component is normalized to 0–100, then combined from central named weights:

`risk = Σ(component × weight)`

Event phase is one visible normalized component with a configured weight, not a hidden multiplier. The final value is clamped and rounded to 0–100. The interface shows every component and does not overwrite the score with the AI severity. If they disagree, it explains the evidence-grounded reason.

## Complexity

- Binary-heap insert: `O(log n)`
- Binary-heap removal: `O(log n)`
- Peek: `O(1)`
- Candidate blocking: neighbourhood/time-window filtering before semantic comparison
- Dijkstra/A*: `O((V + E) log V)` with adjacency-list edges and the same heap implementation

## Failure semantics

AI failure never fabricates an answer. Risk, telemetry, heap ordering, validation, and routing stay available. Semantic fusion, contradiction synthesis, generated announcements, and AI summaries display “AI analysis unavailable.” Provider messages and secrets are never returned to the browser.
