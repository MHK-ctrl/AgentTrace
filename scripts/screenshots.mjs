#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = process.env.AGENTTRACE_DASHBOARD_URL ?? "http://localhost:3000";
const OUT = "docs/screenshots";

async function settle(page, text) {
  await page.locator("main").getByText(text, { exact: false }).first().waitFor({ state: "visible" });
  await page.waitForTimeout(700);
}

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, animations: "disabled" });
  console.log(`captured ${path}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  console.log("launching Chromium");
  const browser = await chromium.launch();
  console.log("Chromium launched");
  try {
    await capture(browser);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function capture(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await settle(page, "Support Copilot");
  await page.getByText("Streaming live").waitFor({ state: "visible", timeout: 15_000 });
  await shot(page, "overview");

  await page.goto(`${BASE}/traces`, { waitUntil: "domcontentloaded" });
  await settle(page, "Select two traces");
  await shot(page, "traces");

  const firstTrace = page.getByRole("link", { name: /Refund request/ }).first();
  await firstTrace.click();
  await page.waitForURL(/\/traces\/trace_/);
  await settle(page, "Waterfall");
  await shot(page, "trace-detail");

  await page.getByRole("tab", { name: "Graph" }).click();
  await settle(page, "nodes · drag to pan");
  await shot(page, "execution-graph");

  await page.getByRole("tab", { name: "Playback" }).click();
  await settle(page, "Read-only playback.");
  await shot(page, "trace-playback");

  await page.goto(`${BASE}/traces`, { waitUntil: "domcontentloaded" });
  await page.locator("table tbody tr").first().waitFor();
  const rows = await page.locator("table tbody tr").evaluateAll((elements) =>
    elements.map((row) => {
      const link = row.querySelector('a[href^="/traces/trace_"]');
      return { text: row.textContent ?? "", href: link?.getAttribute("href") ?? "" };
    }),
  );
  const idFor = (needle) => {
    const row = rows.find(
      (entry) => entry.text.includes(needle) && entry.href.includes("/traces/"),
    );
    return row?.href.split("/").pop() ?? null;
  };
  const visibleIds = [...new Set(rows.map((row) => row.href.split("/").pop()).filter(Boolean))];
  let a = idFor("Refund request");
  let b = idFor("Order status lookup");
  if (!a) a = visibleIds[0] ?? null;
  if (!b || b === a) b = visibleIds.find((id) => id !== a) ?? null;
  if (a && b) {
    await page.goto(`${BASE}/compare?a=${a}&b=${b}`, {
      waitUntil: "domcontentloaded",
    });
    await settle(page, "Operation sequence diff");
    await shot(page, "trace-compare");
  }

  await page.goto(`${BASE}/analytics`, { waitUntil: "domcontentloaded" });
  await settle(page, "Execution volume");
  await shot(page, "analytics");

  await page.goto(`${BASE}/errors`, { waitUntil: "domcontentloaded" });
  await settle(page, "Errors");
  await shot(page, "errors");

  await page.goto(`${BASE}/api-keys`, { waitUntil: "domcontentloaded" });
  await settle(page, "Connect your agent");
  await shot(page, "api-keys");

  await page.goto(`${BASE}/settings`, { waitUntil: "domcontentloaded" });
  await settle(page, "Model pricing");
  await shot(page, "settings");

  await page.getByLabel("Toggle theme").click();
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await settle(page, "Support Copilot");
  await shot(page, "overview-light");

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    isMobile: true,
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await settle(mobilePage, "Support Copilot");
  await mobilePage.screenshot({ path: `${OUT}/overview-mobile.png`, animations: "disabled" });
  console.log(`captured ${OUT}/overview-mobile.png`);

  await mobile.close();
  await context.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
