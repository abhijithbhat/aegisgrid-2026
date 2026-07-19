const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
const requests = Number(process.env.LOAD_REQUESTS ?? 40);
const concurrency = Math.min(Number(process.env.LOAD_CONCURRENCY ?? 5), 20);
const durations = [];
let failures = 0;

async function worker() {
  while (durations.length + failures < requests) {
    const started = performance.now();
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) failures += 1;
      else durations.push(performance.now() - started);
    } catch {
      failures += 1;
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
durations.sort((a, b) => a - b);
const p95 = durations[Math.max(0, Math.ceil(durations.length * 0.95) - 1)] ?? 0;
console.log(
  JSON.stringify(
    { requests, successes: durations.length, failures, p95Ms: Math.round(p95) },
    null,
    2,
  ),
);
if (failures > 0) process.exit(1);
