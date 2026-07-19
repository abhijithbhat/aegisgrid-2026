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
- Reworked the desktop command experience around a single decision brief, clearer next-action hierarchy, premium high-contrast surfaces, and a readable operational type scale.
- Polished Data Lab, Simulator, Audit, stadium map, incident queue, and intelligence panels into one consistent visual system without moving deterministic decisions into AI code.
- Added an interaction-readiness guard so pre-hydration navigation clicks cannot be lost, corrected the brand landmark ARIA contract, and removed mobile horizontal overflow as a defensive safeguard.
- Final refinement gate: 30 unit/integration tests, 6 Playwright workflow/accessibility tests, typecheck, lint, environment verification, production build, and 1.85 MiB repository payload.
- Upgraded the public README with a judge path, architecture flow, local setup, security status, production/developer links, and CI badges.
- Upgraded Next.js and Firebase Admin, removed the experimental vinext/Cloudflare deployment bridge, and refreshed compatible transitive packages; the production audit now has no high or critical advisories.
- Centralized same-origin enforcement across upload, analysis, fusion, and audit APIs; added regression coverage, a private vulnerability-reporting policy, a high-severity dependency CI gate, and weekly CodeQL `security-extended` analysis.
- Documented eight moderate upstream transitive advisories and their constrained reach instead of applying npm's unsafe forced framework downgrade.

## 2026-07-19

- Centralized score-to-severity mapping in the deterministic risk engine and extracted the operational adapters and incident-analysis lifecycle from the command-center component.
- Enabled stricter TypeScript checks for unused code, casing, overrides, and switch fallthrough to catch maintainability regressions during CI.
- Added an explicit production response-header policy: CSP, HSTS, frame denial, MIME sniffing prevention, opener/resource isolation, referrer restrictions, and a restrictive permissions policy.
- Hardened the production same-origin boundary so spoofed forwarded-host headers cannot expand a configured `APP_ORIGIN` allowlist.
- Made browser tests independent of developer credentials, added an adversarial prompt-injection UI path, deterministic simulator reset coverage, and response-header assertions.
- Expanded accessibility automation across every primary view at desktop, mobile, and 320 px; added keyboard, skip-link, reduced-motion, increased-contrast, and forced-colours coverage/support.
- Final release gate passed after all changes: strict typecheck, lint, 42 unit/integration tests, environment validation, production build, 23 Playwright checks, repository-size enforcement at 5.81 MiB, and no high or critical production dependency advisories.
