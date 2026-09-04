from pathlib import Path

path = Path("scripts/verify-studio-brushes.mts")
source = path.read_text(encoding="utf-8")

old_cast = "(performance as Performance & {"
new_cast = "(performance as unknown as Performance & {"
cast_count = source.count(old_cast)
if cast_count != 2:
    raise SystemExit(f"expected two generated browser performance casts, found {cast_count}")
source = source.replace(old_cast, new_cast)

old_activate = '''async function activateDesktopPen(page: Page): Promise<void> {
  const penRail = page.locator('button[data-studio-rail-tool-id="pen"]');
  if (await penRail.count() > 0) {
    await penRail.first().click();
  } else {
    await page.keyboard.press("b");
  }
  const toolbar = page.locator('[data-studio-draw-options="true"]');
  await toolbar.waitFor({ state: "visible", timeout: 8_000 });
  const pen = toolbar.getByRole("button", { name: "펜", exact: true });
  if (await pen.count() > 0 && (await pen.getAttribute("aria-pressed") !== "true")) {
    await pen.click();
  }
  await page.locator('[data-studio-brush-active-pill="true"]').waitFor({ state: "visible" });

  const inspectorNavigator = page.getByTestId("studio-inspector-navigator");
  await inspectorNavigator.waitFor({ state: "visible" });
  const propertiesTab = inspectorNavigator.locator(
    '[data-studio-inspector-primary-tab="properties"]',
  );
  if (await propertiesTab.getAttribute("aria-selected") !== "true") await propertiesTab.click();
}'''
new_activate = '''async function activateDesktopPen(page: Page): Promise<void> {
  if (FULLSCREEN_BRUSH_BENCHMARK) {
    // Headed SwiftShader keeps the animated tool rail in near-continuous layout motion while the
    // first GPU surface initializes. Keyboard activation is the product shortcut and avoids
    // weakening the benchmark with Playwright's visual-stability retry heuristics.
    await page.keyboard.press("b");
    await page.waitForFunction(() =>
      document.querySelector('[data-studio-draw-options="true"]')
        ?.getAttribute("data-studio-active-draw-mode") === "pen",
      undefined,
      { timeout: 15_000 },
    );
  } else {
    const penRail = page.locator('button[data-studio-rail-tool-id="pen"]');
    if (await penRail.count() > 0) {
      await penRail.first().click();
    } else {
      await page.keyboard.press("b");
    }
  }
  const toolbar = page.locator('[data-studio-draw-options="true"]');
  await toolbar.waitFor({ state: "visible", timeout: 15_000 });
  const pen = toolbar.getByRole("button", { name: "펜", exact: true });
  if (await pen.count() > 0 && (await pen.getAttribute("aria-pressed") !== "true")) {
    await pen.click({ force: FULLSCREEN_BRUSH_BENCHMARK });
  }
  await page.locator('[data-studio-brush-active-pill="true"]').waitFor({
    state: "visible",
    timeout: 15_000,
  });

  const inspectorNavigator = page.getByTestId("studio-inspector-navigator");
  await inspectorNavigator.waitFor({ state: "visible", timeout: 15_000 });
  const propertiesTab = inspectorNavigator.locator(
    '[data-studio-inspector-primary-tab="properties"]',
  );
  if (await propertiesTab.getAttribute("aria-selected") !== "true") {
    await propertiesTab.click({ force: FULLSCREEN_BRUSH_BENCHMARK });
  }
}'''
activate_count = source.count(old_activate)
if activate_count != 1:
    raise SystemExit(f"expected one desktop pen activation function, found {activate_count}")
source = source.replace(old_activate, new_activate, 1)

path.write_text(source, encoding="utf-8")
print("Normalized browser Performance.memory casts and deterministic full-screen pen activation")
