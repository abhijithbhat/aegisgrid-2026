# Prompt evolution

## v0.1 — free-form summary

Early exploration asked the model for a narrative incident summary. It was readable but could omit uncertainty and was difficult to validate.

## v0.2 — JSON fields

The prompt requested JSON and named evidence fields. This improved consistency but still allowed unsupported source IDs and mixed instructions with uploaded content.

## v1.0 — grounded contract

The shipped prompt separates policy, trusted context, and `<untrusted_data>`. It uses Gemini structured output plus Zod validation, verifies every evidence ID, constrains severity/team enumerations, mandates `requiresHumanApproval: true`, and forbids diagnosis, automatic dispatch, biometrics, identity inference, and invented sensor readings.

## v1.1 — repair and degraded mode

Invalid output gets one low-temperature constrained repair using only the invalid JSON and schema error paths. A second failure returns a typed unavailable state while preserving deterministic results. Provider text is never shown directly.

## Evaluation dimensions

- Source-grounded evidence precision
- False fusion rate, especially nearby simultaneous incidents
- Contradiction recall
- Schema-mapping calibration
- Minimum useful clarifying questions
- Announcement clarity, language, and urgency
- Unsupported action/dispatch claim rate (target: zero)
