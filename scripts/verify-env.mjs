const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
const timeout = Number(process.env.AI_TIMEOUT_MS ?? 12_000);
const retries = Number(process.env.AI_MAX_RETRIES ?? 1);
const invalid = [];
if (!Number.isFinite(timeout) || timeout < 2_000 || timeout > 30_000) invalid.push("AI_TIMEOUT_MS must be between 2000 and 30000");
if (!Number.isInteger(retries) || retries < 0 || retries > 1) invalid.push("AI_MAX_RETRIES must be 0 or 1");

console.log(JSON.stringify({
  model,
  modelSource: process.env.GEMINI_MODEL ? "environment" : "documented-default",
  geminiAvailable: Boolean(process.env.GEMINI_API_KEY),
  firestoreEnabled: process.env.ENABLE_FIRESTORE === "true",
  firebaseProjectConfigured: Boolean(process.env.FIREBASE_PROJECT_ID),
}, null, 2));

if (invalid.length) {
  console.error(invalid.join("\n"));
  process.exit(1);
}
