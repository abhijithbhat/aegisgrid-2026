# Build log

## 2026-07-10

- Chose a one-persona command-center product focused on Operational Intelligence and Real-Time Decision Support.
- Verified Google's current GA JavaScript SDK (`@google/genai`), stable low-cost Gemini model, JSON-schema structured output, timeout configuration, Firestore server authentication, and Cloud Run secret handling against official documentation.
- Preserved deterministic ownership of risk, routing, priority ordering, validation, persistence, and authorization boundaries.
- Added explicit AI degraded-mode semantics rather than fabricated fallback analysis.
- Added repository-size, environment, load, CI, accessibility, Docker, Firestore, and audit safeguards.

Detailed verification results are appended before release.

## 2026-07-11

- Connected the command center to deterministic risk, binary-heap priority, A* routing, shared scenario state, server upload validation, strict AI analysis/fusion contracts, and server audit writes.
- Replaced fabricated PDF/direct-report behavior with real parsing and an explicit AI-unavailable state.
- Added malformed-JSON repair coverage, upload boundary tests, fusion preservation tests, responsive keyboard navigation, Playwright workflows, and axe checks.
- Added a project-specific 1200×630 social preview and request-host-derived Open Graph metadata.
- Local release gate: typecheck, lint, 30 unit/integration tests, environment verification, production build, eval harness, and repository-size check.
