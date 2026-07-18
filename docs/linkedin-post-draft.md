# LinkedIn post draft

I built **AegisGrid 2026** for PromptWars Virtual Challenge 4: an explainable incident-fusion and response copilot for stadium safety supervisors.

The difficult part of venue safety is rarely one clean alert. It is five imperfect signals: a degraded sensor, two reports in different languages, an uncertain location, a changing crowd flow, and a blocked corridor. AegisGrid combines them into a prioritized, evidence-grounded recommendation while making uncertainty visible.

Its architecture is deliberately hybrid. Deterministic code validates telemetry, calculates a transparent 0–100 risk score, maintains a real binary-heap priority queue, and computes accessible routes over a weighted stadium graph. Gemini handles the parts that require semantic understanding: unstructured reports, cross-language incident fusion, contradictions, unfamiliar upload schemas, clarifying questions, and context-sensitive announcements. Every AI response is structured, validated, source-checked, and gated by mandatory human approval.

The feature I am proudest of is the honest degraded mode. Disable the provider and risk, telemetry, validation, and routing keep working—while the app clearly marks semantic analysis and generated communication as unavailable. That boundary shows both why GenAI is essential and why it should not own deterministic safety logic.

“From fragmented signals to one safe, explainable decision.”

#GenAI #Gemini #GoogleCloud #PublicSafety #ResponsibleAI #PromptWars
