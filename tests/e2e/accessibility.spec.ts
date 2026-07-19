import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 800 },
]) {
  for (const view of ["Command", "Data Lab", "Simulator", "Audit"] as const) {
    test(`${view} has no automatically detectable WCAG A/AA violations at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      if (view !== "Command") {
        if (viewport.width < 821)
          await page.getByRole("button", { name: "Toggle navigation" }).click();
        await page.getByRole("button", { name: view, exact: true }).click();
      }
      await expect(page.getByRole("main")).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewport.width);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
}

test("skip navigation and roving tabs preserve a visible keyboard path", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();

  await page.getByRole("button", { name: "Data Lab" }).click();
  const uploadTab = page.getByRole("tab", { name: "File upload" });
  const directTab = page.getByRole("tab", { name: "Direct report" });
  await uploadTab.focus();
  await uploadTab.press("End");
  await expect(directTab).toBeFocused();
  await expect(directTab).toHaveAttribute("aria-selected", "true");
  await directTab.press("Home");
  await expect(uploadTab).toBeFocused();
  await expect(uploadTab).toHaveAttribute("aria-selected", "true");
});

test("reduced-motion preference disables operational animations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const marker = page.locator(".incident-marker circle").first();
  await expect(marker).toBeVisible();
  await expect
    .poll(() => marker.evaluate((element) => getComputedStyle(element).animationName))
    .toBe("none");
});

test("high-contrast preferences retain landmarks, names, and a visible focus indicator", async ({
  page,
}) => {
  await page.emulateMedia({ contrast: "more", forcedColors: "active" });
  await page.goto("/");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  const command = page.getByRole("button", { name: "Command", exact: true });
  await command.focus();
  await expect(command).toBeFocused();
  await expect(command).toHaveAttribute("aria-current", "page");
});

test("page landmarks and heading hierarchy expose the current workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Live Command Center" })).toBeVisible();

  await page.getByRole("button", { name: "Audit", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Audit/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Audit", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
