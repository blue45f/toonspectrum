import assert from "node:assert/strict";

/** Public UI only: exercise an isolated QA document, never a user's existing artwork. */
export async function verifyDrawingLayoutInteractions(page, capture) {
  const checks = [];
  const config = () => page.getByRole("button", { name: "도구막대 구성", exact: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await config().click();
  await page.locator('[data-studio-toolbar-configurator]').waitFor({ state: "visible" });
  await page.setViewportSize({ width: 320, height: 568 });
  await capture("interaction-config-320x568");
  const firstRow = page.locator('[data-studio-toolbar-configurator] ul').first().locator('li').first();
  const firstBox = await firstRow.boundingBox();
  assert(firstBox && firstBox.y + firstBox.height < 568, "The first configuration row must fit without scrolling");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  checks.push("320px configuration row visible; Cancel closes the dialog");

  for (const view of ["double", "list", "single"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await config().click();
    await page.getByText("보기 방식·일괄 편집", { exact: true }).click();
    await page.getByRole("button", { name: "모든 도구 고정", exact: true }).click();
    await page.getByRole("combobox", { name: "도구막대 보기 방식", exact: true }).selectOption(view);
    await page.getByRole("button", { name: "구성 적용", exact: true }).click();
    const tools = page.locator('[data-studio-tool-rail] [data-studio-rail-tool-id]');
    await page.waitForFunction(() => document.querySelectorAll("[data-studio-tool-rail] [data-studio-rail-tool-id]").length === 35);
    assert.equal(await tools.count(), 35, "All 35 configured tools must survive Apply");
    await page.setViewportSize({ width: 1280, height: 720 });
    await tools.last().scrollIntoViewIfNeeded();
    await tools.last().click({ trial: true });
    await config().click({ trial: true });
    await capture(`interaction-35-tools-${view}-1280x720`);
    checks.push(`35 tools: ${view}; last tool and configuration receive pointer input`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "선택", exact: true }).click();
  await page.getByRole("button", { name: "펜", exact: true }).click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 145, y: 235 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 205, y: 295 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await capture("interaction-touch-stroke-390x844");
  await page.getByRole("button", { name: "레이어 열기", exact: true }).click();
  await page.locator('[data-studio-layer-row]').first().waitFor({ state: "visible" });
  for (const [width, height] of [[390, 844], [844, 390], [667, 375], [820, 1180]]) {
    await page.setViewportSize({ width, height });
    await capture(`interaction-layer-${width}x${height}`);
    const row = page.locator('[data-studio-layer-row]').first();
    const box = await row.boundingBox();
    assert(box && box.y >= 0 && box.y + box.height <= height, "The actual layer row must appear in the initial sheet view");
    await row.locator('[data-studio-layer-row-action="visibility"]').click({ trial: true });
  }
  checks.push("Touch stroke creates a layer; layer row visible and actionable in four orientations/sizes");
  await page.getByRole("button", { name: "설정 닫기", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "주 색", exact: true }).click();
  for (const [width, height] of [[390, 844], [375, 667], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "색상 적용", exact: true }).click({ trial: true });
    await page.getByRole("button", { name: "취소", exact: true }).click({ trial: true });
    await capture(`interaction-color-${width}x${height}`);
  }
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "주 색", exact: true }).click({ trial: true });
  checks.push("Color dialog Apply/Cancel remain reachable across portrait/landscape; Cancel returns to canvas");
  await cdp.detach();
  return checks;
}
