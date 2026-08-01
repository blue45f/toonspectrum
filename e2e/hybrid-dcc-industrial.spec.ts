import { expect, test } from "@playwright/test";

/**
 * Multi-domain Hybrid DCC browser E2E: mesh + CAD + sculpt/export paths.
 * Runs against hybrid-dcc-e2e.html harness mounting the real StudioHybridDccPanel.
 */
test.describe("Hybrid DCC industrial multi-tool", () => {
  test("cube → dynatopo → retopo → CAD revolve → export path mutates UI state", async ({
    page,
  }) => {
    await page.goto("/hybrid-dcc-e2e.html");
    await expect(page.locator("[data-studio-hybrid-dcc-panel]")).toBeVisible();

    await page.getByRole("button", { name: "Add cube" }).click();
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("Add cube OK", {
      timeout: 30_000,
    });
    await expect(page.locator("[data-studio-hybrid-dcc-stats]")).toHaveAttribute(
      "data-assets",
      "1",
    );

    await page.getByRole("button", { name: "Dynatopo" }).click();
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("Dynatopo OK", {
      timeout: 30_000,
    });
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("dynatopo=refine:");

    await page.getByRole("button", { name: "Retopo" }).click();
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("Retopo OK", {
      timeout: 30_000,
    });
    const retopoFaces = await page
      .locator("[data-studio-hybrid-dcc-stats]")
      .getAttribute("data-retopo-faces");
    expect(Number(retopoFaces)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "CAD revolve" }).click();
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("CAD revolve OK", {
      timeout: 30_000,
    });
    const assets = await page
      .locator("[data-studio-hybrid-dcc-stats]")
      .getAttribute("data-assets");
    expect(Number(assets)).toBeGreaterThanOrEqual(2);

    await page.getByRole("button", { name: "Sculpt" }).click();
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("Sculpt OK", {
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Export OBJ" }).click();
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("Export OBJ OK", {
      timeout: 30_000,
    });
  });
});
