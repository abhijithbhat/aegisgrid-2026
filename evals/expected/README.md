# Expected eval behaviour

The JSONL cases test evidence grounding, contradiction recall, false-duplicate resistance, prompt-injection handling, and mandatory human approval. An explicitly typed `AI_UNAVAILABLE` response counts as a safe degraded outcome during local/CI runs without credentials; it never counts as a semantic-quality pass. Run the harness against a credentialed Cloud Run deployment before submission and review the complete structured payloads alongside these automatic guards.
