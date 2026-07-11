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

AI calls use a short timeout, one bounded retry with jitter for transient failures, response-size limits, and structured errors. Validation failures are never retried. The public demo is intentionally synthetic and stores no biometric or identity data. Facial recognition, diagnosis, discriminatory profiling, and personal identity inference are out of scope and prohibited by the AI contract.

## Remaining production controls

The public hackathon deployment is deliberately zero-setup and synthetic. It applies same-origin audit writes, strict schemas, server-set actor roles, and bounded in-process throttling, but it is not a production identity boundary. Before a real venue pilot, add organization SSO, role-bound authorization, managed rate limiting, regional data-retention policy, incident-data encryption review, provider DPA review, security monitoring, backup/restore drills, and an operational approval policy signed by venue leadership.
