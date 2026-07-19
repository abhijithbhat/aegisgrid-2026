import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
const subdir = process.env.SCREENSHOT_SUBDIR ? `${process.env.SCREENSHOT_SUBDIR}/` : "";
const output = new URL(`../artifacts/screenshots/${subdir}`, import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch();

async function selectView(page, name, mobile) {
  if (mobile) await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function capture(page, path) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.waitForTimeout(250);
  await page.screenshot({
    path,
    type: "jpeg",
    quality: 85,
    fullPage: true,
    animations: "disabled",
    style:
      ".topbar{position:relative!important}.sidebar{position:absolute!important}.skip-link{display:none!important}",
  });
}

for (const viewport of [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
]) {
  const page = await browser.newPage({ viewport });
  await page.goto(origin);
  await page.getByRole("heading", { name: "Live Command Center" }).waitFor();

  const screenshotPath = (name) => fileURLToPath(new URL(`${name}-${viewport.label}.jpg`, output));
  await capture(page, screenshotPath("command"));

  await page.getByRole("switch", { name: "Compare paths" }).click();
  await capture(page, screenshotPath("intelligence"));

  await selectView(page, "Data Lab", viewport.label === "mobile");
  await capture(page, screenshotPath("data-lab"));

  await selectView(page, "Simulator", viewport.label === "mobile");
  await capture(page, screenshotPath("simulator"));

  await selectView(page, "Audit", viewport.label === "mobile");
  await capture(page, screenshotPath("audit"));
  await page.close();
}

await browser.close();
console.log("Captured 10 full-page AegisGrid view screenshots at 1440×900 and 390×844.");
