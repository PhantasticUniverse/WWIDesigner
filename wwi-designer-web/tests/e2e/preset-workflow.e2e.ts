import { test, expect } from "@playwright/test";

test.describe("Preset Browser", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to initialize
    await expect(page.locator("h1")).toContainText("WWIDesigner");
  });

  test("loads preset lists on startup", async ({ page }) => {
    // Wait for presets to load
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/instruments") && resp.status() === 200
    );

    // Check that console shows success message
    await expect(page.locator("#console-content")).toContainText(
      "Loaded"
    );
    await expect(page.locator("#console-content")).toContainText("presets");
  });

  test("shows preset folders in sidebar", async ({ page }) => {
    // Wait for presets to load
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/instruments") && resp.status() === 200
    );

    // Expand instruments section
    await page.click('[data-category="instruments"]');

    // Check preset folder exists
    await expect(page.locator(".preset-folder").first()).toBeVisible();
    await expect(page.locator(".preset-folder .folder-label").first()).toContainText("Presets");
  });

  test("can expand and browse instrument presets", async ({ page }) => {
    // Wait for presets to load
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/instruments") && resp.status() === 200
    );

    // Expand instruments section
    await page.click('[data-category="instruments"]');

    // Click to expand presets folder
    await page.click("#instruments-list .preset-folder");

    // Verify preset list is visible
    await expect(page.locator("#instruments-list .preset-list")).toBeVisible();
    await expect(page.locator("#instruments-list .preset-item").first()).toBeVisible();
  });

  test("loads instrument preset into editor", async ({ page }) => {
    // Wait for presets to load
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/instruments") && resp.status() === 200
    );

    // Expand instruments section and preset folder
    await page.click('[data-category="instruments"]');
    await page.click("#instruments-list .preset-folder");

    // Click first preset
    const presetItem = page.locator("#instruments-list .preset-item").first();
    await presetItem.click();

    // Wait for preset to load
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/instruments/") && resp.status() === 200
    );

    // Verify console shows success message
    await expect(page.locator("#console-content")).toContainText(
      "Loaded instrument preset"
    );

    // Verify editor tab opened (look for a tab)
    await expect(page.locator(".tab")).toBeVisible();
  });
});

test.describe("Tuning Presets", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/tunings") && resp.status() === 200
    );
  });

  test("can load tuning preset", async ({ page }) => {
    // Expand tunings section
    await page.click('[data-category="tunings"]');

    // Expand presets folder
    await page.click("#tunings-list .preset-folder");

    // Click first preset
    await page.locator("#tunings-list .preset-item").first().click();

    // Wait for load
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/tunings/") && resp.status() === 200
    );

    // Verify success
    await expect(page.locator("#console-content")).toContainText(
      "Loaded tuning preset"
    );
  });
});

test.describe("Full Workflow", () => {
  test("load preset, calculate tuning, verify results", async ({ page }) => {
    await page.goto("/");

    // Wait for presets
    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/instruments") && resp.status() === 200
    );

    // Load instrument preset
    await page.click('[data-category="instruments"]');
    await page.click("#instruments-list .preset-folder");
    await page.locator("#instruments-list .preset-item").first().click();

    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/instruments/") && resp.status() === 200
    );

    // Load tuning preset
    await page.click('[data-category="tunings"]');
    await page.click("#tunings-list .preset-folder");
    await page.locator("#tunings-list .preset-item").first().click();

    await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/presets/tunings/") && resp.status() === 200
    );

    // Click Calculate Tuning button
    await page.click('[data-action="calculate-tuning"]');

    // Wait for calculation API call
    const response = await page.waitForResponse(
      (resp) =>
        resp.url().includes("/api/calculate-tuning") && resp.status() === 200
    );

    // Verify calculation completed
    await expect(page.locator("#console-content")).toContainText(
      "calculated"
    );
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
    expect(Array.isArray(data.presets)).toBe(true);
    expect(data.presets.length).toBeGreaterThan(0);
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
    await page.goto("/");

    // Open about modal
    await page.click('[data-action="about"]');
    await expect(page.locator("#about-modal")).toHaveClass(/open/);

    // Press Escape
    await page.keyboard.press("Escape");

    // Modal should be closed
    await expect(page.locator("#about-modal")).not.toHaveClass(/open/);
  });
});
