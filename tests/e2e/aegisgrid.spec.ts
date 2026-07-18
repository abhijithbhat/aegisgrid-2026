import { expect, test } from "@playwright/test";

test.describe("AegisGrid operational workflows", () => {
  test("renders live deterministic decision support and an honest degraded AI state", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Live Command Center" })).toBeVisible();
    await expect(page.getByText("AI analysis unavailable.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Queue policy" })).toBeVisible();
    await page.getByRole("button", { name: "Queue policy" }).click();
    await expect(page.getByText("AI prose and recommendations cannot set queue order.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Priority 1:/ })).toHaveCount(1);
  });

  test("validates a canonical CSV before importing it into command state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Data Lab" }).click();
    const csv = [
      "timestamp,zone_id,occupancy,capacity,inflow_per_minute,outflow_per_minute,sensor_health,blocked,event_phase",
      "2026-07-11T02:30:00Z,W-CONC,3990,4200,210,45,degraded,false,live-match",
    ].join("\n");
    await page.locator('input[type="file"]').setInputFiles({ name: "judge-reading.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByText("judge-reading.csv")).toBeVisible();
    await page.getByRole("button", { name: "Validate approved mapping" }).click();
    await expect(page.getByText("Validation passed")).toBeVisible();
    const importButton = page.getByRole("button", { name: "Import 1 validated rows" });
    await expect(importButton).toBeEnabled();
    await importButton.click();
    await expect(page.getByRole("button", { name: "Imported" })).toBeDisabled();
    await page.getByRole("button", { name: "Command" }).click();
    await expect(page.getByText("Validated import · 2026-07-11T02:30:00Z")).toBeVisible();
  });

  test("never replaces unavailable AI interpretation with a canned direct-report result", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Data Lab" }).click();
    await page.getByRole("tab", { name: "Direct report" }).click();
    await page.getByLabel("Incident report text").fill("Thick smoke and visible flames reported near east kiosk 12.");
    await page.getByRole("button", { name: "Interpret report with AI" }).click();
    await expect(page.getByText("The report has not been interpreted or imported.")).toBeVisible();
    await expect(page.getByText("Likely medical · West Concourse · 82% mapping confidence")).toHaveCount(0);
  });

  test("keeps validated AI output stable while a supervisor edits operational fields", async ({ page }) => {
    let analyzeRequests = 0;
    const recommendation = {
      summary: "One synthetic medical report requires supervisor review near west stair W-3.",
      incidentType: "medical",
      severity: "high",
      confidence: 0.9,
      evidence: [{ sourceId: "STAFF-184", fact: "A steward reports an unresponsive adult near west stair W-3.", weight: 0.96 }],
      contradictions: [],
      missingInformation: ["Breathing status is unconfirmed."],
      clarifyingQuestions: ["Is the guest breathing?"],
      recommendedActions: [{ priority: 1, action: "Confirm breathing status.", ownerRole: "Medical Alpha", targetMinutes: 2, justification: "Medical triage requires confirmation.", requiresApproval: true }],
      recommendedTeamType: "medical",
      equipment: ["AED"],
      announcement: { language: "English", tone: "calm", text: "Please keep west stair W-3 clear for the medical team." },
      uncertaintyNote: "The guest's clinical status remains unconfirmed.",
      requiresHumanApproval: true,
    };
    await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ai: { available: true, status: "configured" } }) }));
    await page.route("**/api/audit", (route) => route.fulfill({ status: route.request().method() === "GET" ? 200 : 201, contentType: "application/json", body: JSON.stringify({ ok: true, events: [], persistence: { mode: "memory", durable: false } }) }));
    await page.route("**/api/incidents", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, persistence: { mode: "memory", durable: false } }) }));
    await page.route("**/api/analyze", (route) => {
      analyzeRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `event: result\ndata: ${JSON.stringify({ outcome: { status: "available", recommendation } })}\n\n`,
      });
    });

    await page.goto("/");
    await expect(page.getByText("Live provider output · strict contract validated")).toBeVisible();
    await expect.poll(() => analyzeRequests).toBe(1);

    await page.getByRole("tab", { name: "Response plan" }).click();
    await page.getByRole("combobox", { name: "Assign response team" }).selectOption("Medical Bravo");
    await expect.poll(() => analyzeRequests).toBe(1);
    await expect(page.getByText("Validating evidence with the AI provider…")).toHaveCount(0);

    await page.getByRole("tab", { name: "Communication" }).click();
    await page.getByRole("button", { name: "Edit draft" }).click();
    const draft = page.getByLabel("Edit announcement draft");
    await draft.fill("Please keep west stair W-3 clear; follow steward directions.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Please keep west stair W-3 clear; follow steward directions.")).toBeVisible();
    await expect.poll(() => analyzeRequests).toBe(1);
  });

  test("filters, exports, and records a supervisor resolution in the audit workflow", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Audit" }).click();

    const search = page.getByRole("searchbox", { name: "Search audit log" });
    await search.fill("INC-2045");
    await expect(page.getByText("Showing 1 of 4")).toBeVisible();
    await search.fill("");
    await page.getByRole("combobox", { name: "Filter by actor" }).selectOption("Routing Engine");
    await expect(page.getByText("Showing 1 of 4")).toBeVisible();
    await page.getByRole("combobox", { name: "Filter by actor" }).selectOption("All actors");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export audit log" }).click();
    await expect((await downloadPromise).suggestedFilename()).toBe("aegisgrid-audit-log.json");

    const resolve = page.getByRole("button", { name: "Mark resolved" });
    await expect(resolve).toBeDisabled();
    await page.getByRole("textbox", { name: "Resolution note" }).fill("Synthetic QA resolution verified; no dispatch occurred.");
    await expect(resolve).toBeEnabled();
    await resolve.click();
    await expect(page.getByText("Incident resolved", { exact: true }).first()).toBeVisible();
  });

  test("keeps mobile navigation off-canvas, focusable only when open, and Escape-closeable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const menu = page.getByRole("button", { name: "Toggle navigation" });
    await menu.click();
    await expect(page.getByRole("button", { name: "Command" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
