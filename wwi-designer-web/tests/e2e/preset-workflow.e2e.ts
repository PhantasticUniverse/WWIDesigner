import { test, expect, type Page } from "@playwright/test";

/**
 * Wait for the app to be fully loaded and interactive.
 */
async function waitForAppReady(page: Page) {
  // Wait for the main heading to be visible (indicates app loaded)
  await expect(page.locator("h1")).toContainText("WWIDesigner", { timeout: 15000 });

  // Wait for sidebar categories to be visible (indicates presets loaded)
  await expect(page.locator('[data-category="instruments"]')).toBeVisible({ timeout: 10000 });
}

test.describe("Preset Browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await waitForAppReady(page);
  });

  test("loads preset lists on startup", async ({ page }) => {
    // Presets already loaded by waitForAppReady in beforeEach
    // Check that console shows success message
    await expect(page.locator("#console-content")).toContainText("Loaded");
    await expect(page.locator("#console-content")).toContainText("presets");
  });

  test("shows preset folders in sidebar", async ({ page }) => {
    // Expand instruments section - wait for button to be visible first
    const instrumentsBtn = page.locator('[data-category="instruments"]');
    await instrumentsBtn.waitFor({ state: "visible" });
    await instrumentsBtn.click();

    // Check preset folder exists
    await expect(page.locator(".preset-folder").first()).toBeVisible();
    await expect(
      page.locator(".preset-folder .folder-label").first()
    ).toContainText("Presets");
  });

  test("can expand and browse instrument presets", async ({ page }) => {
    // Expand instruments section
    const instrumentsBtn = page.locator('[data-category="instruments"]');
    await instrumentsBtn.waitFor({ state: "visible" });
    await instrumentsBtn.click();

    // Click to expand presets folder
    const presetFolder = page.locator("#instruments-list .preset-folder");
    await presetFolder.waitFor({ state: "visible" });
    await presetFolder.click();

    // Verify preset list is visible
    await expect(page.locator("#instruments-list .preset-list")).toBeVisible();
    await expect(
      page.locator("#instruments-list .preset-item").first()
    ).toBeVisible();
  });

  test("loads instrument preset into editor", async ({ page }) => {
    // Expand instruments section and preset folder
    const instrumentsBtn = page.locator('[data-category="instruments"]');
    await instrumentsBtn.waitFor({ state: "visible" });
    await instrumentsBtn.click();

    const presetFolder = page.locator("#instruments-list .preset-folder");
    await presetFolder.waitFor({ state: "visible" });
    await presetFolder.click();

    // Click first preset
    const presetItem = page.locator("#instruments-list .preset-item").first();
    await presetItem.waitFor({ state: "visible" });

    // Start waiting for response before clicking
    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/instruments/") && resp.status() === 200
    );
    await presetItem.click();
    await responsePromise;

    // Verify console shows success message
    await expect(page.locator("#console-content")).toContainText(
      "Loaded instrument preset"
    );

    // Verify editor tab opened (should have 2 tabs now: Welcome + preset)
    await expect(page.locator(".tab")).toHaveCount(2);
  });
});

test.describe("Tuning Presets", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await waitForAppReady(page);
  });

  test("can load tuning preset", async ({ page }) => {
    // Expand tunings section
    const tuningsBtn = page.locator('[data-category="tunings"]');
    await tuningsBtn.waitFor({ state: "visible" });
    await tuningsBtn.click();

    // Expand presets folder
    const presetFolder = page.locator("#tunings-list .preset-folder");
    await presetFolder.waitFor({ state: "visible" });
    await presetFolder.click();

    // Click first preset
    const presetItem = page.locator("#tunings-list .preset-item").first();
    await presetItem.waitFor({ state: "visible" });

    // Start waiting for response before clicking
    const responsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/tunings/") && resp.status() === 200
    );
    await presetItem.click();
    await responsePromise;

    // Verify success
    await expect(page.locator("#console-content")).toContainText(
      "Loaded tuning preset"
    );
  });
});

test.describe("Full Workflow", () => {
  test("load preset, calculate tuning, verify results", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await waitForAppReady(page);

    // Load instrument preset
    const instrumentsBtn = page.locator('[data-category="instruments"]');
    await instrumentsBtn.waitFor({ state: "visible" });
    await instrumentsBtn.click();

    const instFolder = page.locator("#instruments-list .preset-folder");
    await instFolder.waitFor({ state: "visible" });
    await instFolder.click();

    const instItem = page.locator("#instruments-list .preset-item").first();
    await instItem.waitFor({ state: "visible" });

    const instResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/instruments/") && resp.status() === 200
    );
    await instItem.click();
    await instResponse;

    // Load tuning preset
    const tuningsBtn = page.locator('[data-category="tunings"]');
    await tuningsBtn.waitFor({ state: "visible" });
    await tuningsBtn.click();

    const tuningFolder = page.locator("#tunings-list .preset-folder");
    await tuningFolder.waitFor({ state: "visible" });
    await tuningFolder.click();

    const tuningItem = page.locator("#tunings-list .preset-item").first();
    await tuningItem.waitFor({ state: "visible" });

    const tuningResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/tunings/") && resp.status() === 200
    );
    await tuningItem.click();
    await tuningResponse;

    // Click Calculate Tuning button (use the primary action button, not menu items)
    const calcBtn = page.locator('button.action-btn[data-action="calculate-tuning"]');
    await calcBtn.waitFor({ state: "visible" });

    const calcResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/calculate-tuning") && resp.status() === 200
    );
    await calcBtn.click();
    await calcResponse;

    // Verify calculation completed
    await expect(page.locator("#console-content")).toContainText("calculated");
  });
});

test.describe("API Health Checks", () => {
  test("presets API returns valid data", async ({ request }) => {
    const response = await request.get("/api/presets/instruments");
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.category).toBe("instruments");
    expect(Array.isArray(data.presets)).toBe(true);
    expect(data.presets.length).toBeGreaterThan(0);
  });

  test("tunings presets API works", async ({ request }) => {
    const response = await request.get("/api/presets/tunings");
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.category).toBe("tunings");
    expect(Array.isArray(data.presets)).toBe(true);
    expect(data.presets.length).toBeGreaterThan(0);
  });

  test("constraints presets API works", async ({ request }) => {
    const response = await request.get("/api/presets/constraints");
    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.category).toBe("constraints");
    // Constraints API returns groups (organized by objective function) instead of flat presets
    expect(Array.isArray(data.groups)).toBe(true);
    expect(data.groups.length).toBeGreaterThan(0);
  });

  test("individual preset loads correctly", async ({ request }) => {
    // First get the list
    const listResponse = await request.get("/api/presets/instruments");
    const listData = await listResponse.json();

    // Load first preset
    const firstPreset = listData.presets[0];
    const presetResponse = await request.get(
      `/api/presets/${firstPreset.path}`
    );
    expect(presetResponse.ok()).toBe(true);

    const presetData = await presetResponse.json();
    expect(presetData.name).toBeDefined();
    expect(presetData.borePoint).toBeDefined();
  });

  test("invalid category returns error", async ({ request }) => {
    const response = await request.get("/api/presets/invalid");
    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toContain("Invalid category");
  });
});

test.describe("Keyboard Shortcuts", () => {
  test("Escape closes modal", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await waitForAppReady(page);

    // Open Help menu first (About is inside dropdown)
    const helpMenuBtn = page.locator('[data-menu="help"]');
    await helpMenuBtn.waitFor({ state: "visible" });
    await helpMenuBtn.click();

    // Now click About button in the dropdown
    const aboutBtn = page.locator('[data-action="about"]');
    await aboutBtn.waitFor({ state: "visible" });
    await aboutBtn.click();

    // Wait for modal to open
    await expect(page.locator("#about-modal")).toHaveClass(/open/);

    // Press Escape
    await page.keyboard.press("Escape");

    // Modal should be closed
    await expect(page.locator("#about-modal")).not.toHaveClass(/open/);
  });
});
