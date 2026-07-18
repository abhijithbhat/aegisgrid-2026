import { readFile, writeFile } from "node:fs/promises";

const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
const text = await readFile(new URL("./cases.jsonl", import.meta.url), "utf8");
const cases = text.split("\n").filter(Boolean).map((line) => JSON.parse(line));
const results = [];
const severityRank = { low: 0, moderate: 1, high: 2, critical: 3 };

function requestFor(testCase) {
  if (testCase.operation === "schema-map") {
    return { endpoint: "upload", body: { action: "map-columns", columns: testCase.columns } };
  }
  if (testCase.operation === "fuse") {
    return {
      endpoint: "fuse",
      body: {
        reports: testCase.reports.map((report) => ({
          sourceId: report.sourceId,
          zoneId: report.zoneId,
          timestamp: report.timestamp,
          text: report.text,
          language: report.language ?? "und",
          reliability: report.reliability ?? 0.5,
          vulnerablePerson: false,
        })),
      },
    };
  }
  const incident = testCase.incident;
  const occupancy = incident.telemetry?.occupancy ?? 0;
  const capacity = incident.telemetry?.capacity ?? 1;
  const provisionalScore = Math.max(0, Math.min(100, Math.round(occupancy / capacity * 60)));
  const provisionalSeverity = provisionalScore >= 75 ? "critical" : provisionalScore >= 55 ? "high" : provisionalScore >= 30 ? "moderate" : "low";
  return {
    endpoint: "analyze",
    body: {
      incidentId: incident.id,
      title: "Evaluation incident",
      incidentType: "other",
      zoneId: incident.zoneId,
      eventPhase: incident.telemetry?.eventPhase ?? "live-match",
      deterministicRisk: { score: provisionalScore, severity: provisionalSeverity, explanation: "Provisional deterministic evaluation score." },
      sources: incident.reports.map((report) => ({ sourceId: report.sourceId, sourceType: "evaluation-report", text: report.text, reliability: report.reliability })),
      route: { primaryZoneIds: [incident.zoneId], alternateZoneIds: [], etaMinutes: 0, avoidedZoneIds: [], rationale: "Route is outside this semantic evaluation." },
    },
  };
}

function judge(testCase, response, body) {
  if (!response.ok) return { passed: false, mode: "error" };
  if (testCase.operation === "schema-map") {
    const mappings = body.mappings ?? [];
    const unsafe = mappings.find((mapping) => mapping.sourceColumn === testCase.expected.mustNotMap);
    return { passed: body.requiresExplicitApproval === true && (!unsafe || unsafe.canonicalField === null), mode: body.aiAvailable ? "hybrid" : "deterministic" };
  }
  if (testCase.operation === "fuse") {
    const merged = (body.clusters ?? []).some((cluster) => cluster.sourceIds.length > 1);
    return { passed: merged === testCase.expected.shouldMerge && body.sourceReportsPreserved === true, mode: body.mode ?? "unknown" };
  }
  if (body.outcome?.status === "degraded") {
    return { passed: body.outcome.notice === "AI analysis unavailable", mode: "degraded" };
  }
  const recommendation = body.outcome?.recommendation;
  if (!recommendation) return { passed: false, mode: "invalid" };
  const cited = new Set(recommendation.evidence.map((item) => item.sourceId));
  const expected = testCase.expected;
  const passed = recommendation.incidentType === expected.incidentType
    && severityRank[recommendation.severity] >= severityRank[expected.minimumSeverity ?? "low"]
    && (expected.mustCite ?? []).every((sourceId) => cited.has(sourceId))
    && recommendation.requiresHumanApproval === expected.humanApproval;
  return { passed, mode: "hybrid" };
}

for (const testCase of cases) {
  const request = requestFor(testCase);
  try {
    const response = await fetch(`${origin}/api/${request.endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-eval-case": testCase.id },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json();
    const verdict = judge(testCase, response, body);
    results.push({ id: testCase.id, status: response.status, ...verdict });
  } catch {
    results.push({ id: testCase.id, passed: false, status: 0, mode: "unreachable" });
  }
}

console.log(JSON.stringify(results, null, 2));
if (results.every((result) => result.mode !== "unreachable")) {
  const generatedAt = new Date().toISOString();
  await writeFile(new URL("./results.json", import.meta.url), `${JSON.stringify({ generatedAt, origin, results }, null, 2)}\n`);
  const rows = results.map((result) => `| ${result.id} | ${result.passed ? "Pass" : "Fail"} | ${result.status} | ${result.mode} |`).join("\n");
  const table = `<!-- eval-results:start -->\n| Eval case | Result | HTTP | Mode |\n|---|---:|---:|---|\n${rows}\n\n_Last run: ${generatedAt.slice(0, 10)} · Source: [evals/results.json](evals/results.json)_\n<!-- eval-results:end -->`;
  const readmeUrl = new URL("../README.md", import.meta.url);
  const readme = await readFile(readmeUrl, "utf8");
  const updated = readme.replace(/<!-- eval-results:start -->[\s\S]*?<!-- eval-results:end -->/, table);
  await writeFile(readmeUrl, updated);
}
if (results.some((result) => !result.passed)) process.exit(1);
