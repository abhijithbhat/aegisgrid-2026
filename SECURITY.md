# Security policy

## Supported version

Security fixes are applied to the current `main` branch. This repository is a
synthetic hackathon demonstration, not an authorized emergency-dispatch or
medical system.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include secrets,
personal data, provider responses, or operational incident data in a report.
Use the repository's private [GitHub security advisory form](https://github.com/abhijithbhat/aegisgrid-2026/security/advisories/new).

Include the affected route or component, reproduction conditions, potential
impact, and a minimal proof of concept that uses synthetic data only. Do not
test against a real venue, third-party account, or production credential.

## Security boundaries

- The browser never receives Gemini or Google Cloud credentials.
- Uploaded files and report text are untrusted, bounded, and validated before use.
- Browser-originated API access is same-origin only.
- AI output cannot calculate risk, choose routes, order incidents, authorize actions, or write directly to storage.
- The demonstration does not perform autonomous dispatch, diagnosis, facial recognition, biometrics, or identity inference.

The detailed threat model, controls, and residual production requirements are
documented in [`docs/security.md`](docs/security.md).
