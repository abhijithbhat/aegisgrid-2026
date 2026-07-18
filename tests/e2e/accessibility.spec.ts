import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const view of ["Command", "Data Lab", "Simulator", "Audit"] as const) {
  test(`${view} has no automatically detectable WCAG A/AA violations at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    if (view !== "Command") {
      if (viewport.width < 821) await page.getByRole("button", { name: "Toggle navigation" }).click();
      await page.getByRole("button", { name: view, exact: true }).click();
    }
    await expect(page.getByRole("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
  });
  }
}
