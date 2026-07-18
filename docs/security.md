# Security model

## Trust boundaries

Uploaded files, report text, model output, route parameters, and browser state are untrusted. Every server route validates size, MIME type, shape, ranges, enumerations, unknown fields, and referenced source IDs before using or storing data.

## Upload controls

- Hard 2 MiB limit before parsing.
- Allowlist: CSV, JSON, PDF, and UTF-8 plain text.
- No executable formats, archives, macros, remote URLs, or client-supplied paths.
- Bounded rows, columns, cell length, and PDF text length.
- Impossible capacities, non-finite values, invalid timestamps, occupancy without capacity, and unknown zones are rejected or held for explicit mapping.
- Errors use typed public codes and never include stack traces.
- PDF extraction is limited to 50 pages, 250,000 characters, and a 10-second processing deadline; document resources are destroyed in a `finally` path.

## Prompt-injection resistance

Uploaded content is placed inside a delimited `<untrusted_data>` block. System prompts state that this block is evidence, never instructions. The model cannot authorize actions, calculate routes, change policy, or write directly to storage. Structured results pass through strict schemas and source-ID verification before display.

## Secrets and data

`GEMINI_API_KEY` is server-only and has no `NEXT_PUBLIC_` alias. Production uses Google Secret Manager. Logs contain correlation IDs, outcome codes, durations, and prompt versions—not raw reports, provider payloads, credentials, or hidden reasoning. Firestore denies direct browser access; privileged writes occur server-side.

## Abuse and reliability

AI calls use a short timeout, one bounded retry with jitter for transient failures, response-size limits, and structured errors. Validation failures are never retried. Browser-originated upload, analysis, fusion, and audit calls must be same-origin and are rejected before parsing or provider work when the Origin is foreign. The public demo is intentionally synthetic and stores no biometric or identity data. Facial recognition, diagnosis, discriminatory profiling, and personal identity inference are out of scope and prohibited by the AI contract.

## Supply-chain status

The July 2026 security refresh upgraded Next.js and Firebase Admin, removed the experimental vinext/Cloudflare deployment bridge, and refreshed compatible transitive packages. `npm audit --omit=dev --audit-level=high` passes with no high or critical production advisories. CI repeats that gate on every push, and CodeQL runs the `security-extended` JavaScript/TypeScript suite on `main` and weekly.

Eight moderate transitive advisories remain visible rather than being suppressed:

- Next.js currently bundles a PostCSS version affected when stringifying attacker-controlled CSS. AegisGrid compiles only trusted repository CSS and accepts no CSS/template uploads.
- Firebase Admin's optional storage dependency chain currently retains `uuid@9`. AegisGrid does not call the affected v3/v5/v6 APIs with a caller-supplied output buffer, and Firestore is disabled by default.

npm's proposed forced resolution would downgrade core frameworks and is not a safe fix. Reassess these transitive versions when compatible upstream releases become available.

## Remaining production controls

The public hackathon deployment is deliberately zero-setup and synthetic. It applies same-origin browser APIs, strict schemas, server-set actor roles, bounded in-process throttling, CSP/HSTS/frame denial, and restricted browser permissions, but it is not a production identity boundary. The CSP currently permits framework-required inline scripts/styles; a real pilot should move to request nonces or hashes after validating the deployment runtime. Before a real venue pilot, add organization SSO, role-bound authorization, managed rate limiting, regional data-retention policy, incident-data encryption review, provider DPA review, security monitoring, backup/restore drills, and an operational approval policy signed by venue leadership.
