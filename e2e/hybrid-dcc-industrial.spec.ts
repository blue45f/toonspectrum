import { expect, test } from "@playwright/test";

/**
 * Multi-domain Hybrid DCC browser E2E: industrial OCCT + mesh + CAD + export.
 * Runs against hybrid-dcc-e2e.html harness mounting the real StudioHybridDccPanel.
 */
test.describe("Hybrid DCC industrial multi-tool", () => {
  test("OCCT box → cube → dynatopo → retopo → CAD revolve → export mutates UI", async ({
    page,
  }) => {
    // OCCT WASM is ~63MB; allow long first load on cold cache.
    test.setTimeout(180_000);
    await page.goto("/hybrid-dcc-e2e.html");
    await expect(page.locator("[data-studio-hybrid-dcc-panel]")).toBeVisible();

    // Industrial WASM OCCT on the real browser product surface (not pure-TS CAD-lite).
    await page.getByRole("button", { name: "OCCT box" }).click();
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("OCCT box OK", {
      timeout: 120_000,
    });
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText(
      "BRepPrimAPI_MakeBox",
    );
    await expect(page.locator("[data-studio-hybrid-dcc-stats]")).toHaveAttribute(
      "data-occt-path",
      "browser",
    );
    const occtTris = await page
      .locator("[data-studio-hybrid-dcc-stats]")
      .getAttribute("data-occt-tris");
    expect(Number(occtTris)).toBeGreaterThan(0);

    // Optional boolean cut still on industrial WASM path
    await page.getByRole("button", { name: "OCCT boolean" }).click();
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("OCCT cut OK", {
      timeout: 120_000,
    });
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("BRepAlgoAPI_Cut");
    const cutTris = await page
      .locator("[data-studio-hybrid-dcc-stats]")
      .getAttribute("data-occt-tris");
    expect(Number(cutTris)).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Add cube" }).click();
    await expect(page.locator("[data-studio-hybrid-dcc-log]")).toContainText("Add cube OK", {
      timeout: 30_000,
    });

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
