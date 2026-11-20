import { expect, test } from "@playwright/test";

test("overview renders live demo data and supports theme switching", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Support Copilot/ })).toBeVisible();
  await expect(page.getByText("Streaming live")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Total traces", { exact: true })).toBeVisible();
  await expect(page.getByText("Success rate", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trace volume" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent traces" })).toBeVisible();
  await expect(page.getByText("NaN")).toHaveCount(0);

  const html = page.locator("html");
  await page.getByLabel("Toggle theme").click();
  await expect(html).toHaveClass(/light/);
  await page.getByLabel("Toggle theme").click();
  await expect(html).not.toHaveClass(/light/);
});

test("sidebar navigation reaches every major page", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator("aside").first();
  const destinations: Array<[string, RegExp]> = [
    ["Traces", /^Traces$/],
    ["Errors", /^Errors$/],
    ["Analytics", /^Analytics$/],
    ["Projects", /^Projects$/],
    ["Compare", /Compare traces/],
    ["API keys", /^API keys$/],
    ["Settings", /^Settings$/],
    ["Overview", /Support Copilot/],
  ];

  for (const [link, heading] of destinations) {
    await sidebar.getByRole("link", { name: link, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("trace explorer searches, filters, paginates and compares two traces", async ({ page }) => {
  await page.goto("/traces");
  await expect(page.getByRole("heading", { level: 1, name: "Traces" })).toBeVisible();
  await expect(page.locator("table tbody tr").first()).toBeVisible();

  const search = page.locator("main").getByLabel("Search traces");
  await search.fill("Refund");
  await expect(page.getByRole("link", { name: /Refund request/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(search).toHaveValue("");

  await page.getByLabel("Filter by status").selectOption("error");
  await expect(page.locator("table tbody").getByText("Failed").first()).toBeVisible({
    timeout: 15_000,
  });
  const clearFilters = page.getByRole("button", { name: "Clear", exact: true });
  if (await clearFilters.isVisible()) await clearFilters.click();

  const checkboxes = page.getByLabel(/Select .* for comparison/);
  await expect(checkboxes.nth(1)).toBeVisible();
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await page.getByRole("button", { name: "Compare selected" }).click();
  await expect(page).toHaveURL(/\/compare\?a=.+&b=.+/);
  await expect(page.getByRole("heading", { name: "Compare traces" })).toBeVisible();
  await expect(page.getByText("Operation sequence diff")).toBeVisible();
  await expect(page.getByText("Est. cost", { exact: true }).first()).toBeVisible();
});

test("trace detail exposes waterfall, hierarchy, graph, playback, export and sharing", async ({
  page,
}) => {
  await page.goto("/traces");
  await page.getByRole("link", { name: /Refund request/ }).first().click();
  await expect(page).toHaveURL(/\/traces\/trace_/);
  await expect(page.getByRole("tab", { name: "Waterfall" })).toBeVisible();

  await page.getByRole("button", { name: /plan-resolution/ }).first().click();
  await expect(page.getByRole("tab", { name: "Input" })).toBeVisible();

  await page.getByRole("tab", { name: /Span tree/ }).click();
  await expect(page.getByText(/parent-child hierarchy/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Expand all/ })).toBeVisible();

  await page.getByRole("tab", { name: "Graph" }).click();
  await expect(page.getByLabel("Fit to screen")).toBeVisible();
  await expect(page.getByText(/nodes · drag to pan/)).toBeVisible();
  await page.getByLabel("Zoom in").click();
  await page.getByRole("button", { name: /^Inspect / }).first().click();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();

  await page.getByRole("tab", { name: "Playback" }).click();
  await expect(page.getByText("Read-only playback.")).toBeVisible();
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(page.getByText(/ops revealed/)).toBeVisible();

  await page.getByRole("button", { name: /^Export/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Markdown report" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.md$/);

  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Share trace snapshot" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
});

test("run sample agent creates a real trace and opens it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run sample agent" }).first().click();
  await page.waitForURL(/\/traces\/trace_/, { timeout: 20_000 });
  await expect(page.getByRole("tab", { name: "Waterfall" })).toBeVisible();
  await expect(page.getByText("Sample data").first()).toBeVisible();
  await expect(page.getByText("Duration", { exact: true }).first()).toBeVisible();
});

test("API keys can be created once and revoked", async ({ page }) => {
  await page.goto("/api-keys");
  await expect(page.getByRole("heading", { level: 1, name: "API keys" })).toBeVisible();

  const keyName = `E2E key ${Date.now()}`;
  await page.getByRole("button", { name: "Create key" }).first().click();
  const createDialog = page.getByRole("dialog", { name: "Create API key" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByPlaceholder("production").fill(keyName);
  await createDialog.getByRole("button", { name: "Create key", exact: true }).click();

  const copyDialog = page.getByRole("dialog", { name: "Copy your API key" });
  await expect(copyDialog).toBeVisible();
  const rawKey = await copyDialog.locator("code").innerText();
  expect(rawKey.startsWith("at_live_")).toBe(true);
  await page.getByRole("button", { name: "I have copied it" }).click();

  const row = page.getByRole("row", { name: new RegExp(keyName) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Revoke" }).click();
  await row.getByRole("button", { name: "Confirm revoke" }).click();
  await expect(row.getByText("revoked", { exact: true })).toBeVisible();
});

test("pricing rules can be added and deleted in settings", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByText("Model pricing")).toBeVisible();

  await page.getByRole("button", { name: "Add model" }).click();
  const dialog = page.getByRole("dialog", { name: "Add pricing rule" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("gpt-4o").fill("e2e-priced-model");
  await dialog.getByPlaceholder("openai").fill("e2e-provider");
  await dialog.getByPlaceholder("2.50").fill("1.25");
  await dialog.getByPlaceholder("10.00").fill("5.5");
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("row", { name: /e2e-priced-model/ });
  await expect(row).toBeVisible();
  await row.getByLabel("Delete pricing").click();
  await row.getByLabel("Delete pricing").click();
  await expect(page.getByText("e2e-priced-model")).toHaveCount(0);
});

test("analytics and error analytics render real aggregates with filters", async ({ page }) => {
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Execution volume" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Model performance" })).toBeVisible();
  await expect(page.getByText("NaN")).toHaveCount(0);

  await page.goto("/errors");
  await expect(page.getByRole("heading", { level: 1, name: "Errors" })).toBeVisible();
  await expect(page.getByLabel("Search errors")).toBeVisible();
  await page.getByLabel("Search errors").fill("connection reset");
  await expect(page.getByText(/connection reset/i).first()).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Sort errors").selectOption("last_seen");
  await expect(page.getByText(/groups/)).toBeVisible();
});

test("mobile navigation opens and navigates", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Support Copilot/ })).toBeVisible();

  await page.getByLabel("Open navigation").click();
  await expect(page.getByLabel("Close navigation")).toBeVisible();
  const overlay = page.locator("div.fixed.z-50");
  await overlay.getByRole("link", { name: "Traces", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Traces" })).toBeVisible();
});
