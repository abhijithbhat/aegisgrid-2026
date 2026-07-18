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
