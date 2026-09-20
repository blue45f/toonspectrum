import type { Page } from "playwright";

/** Runs in the page: SQLite is already populated before the active document is hydrated. */
export function studioRecoveredStrokeLayerState(expectedIds: readonly string[]): "ready" | "manual" | null {
  const recovery = document.querySelector("[data-studio-recovery-notice]");
  if (!recovery && expectedIds.length > 0 && expectedIds.every((id) =>
    document.getElementById(`studio-layer-${id}`)?.matches('[data-studio-layer-row="true"]')
  )) return "ready";
  if (recovery?.getAttribute("aria-busy") === "true") return null;
  const manual = recovery && [...recovery.querySelectorAll<HTMLButtonElement>("button")]
    .find((button) => /^(이어서 그리기|다시 이어 열기)$/u.test(button.textContent?.trim() ?? ""));
  return manual && !manual.disabled ? "manual" : null;
}

/** Wait for the exact restored strokes in the live layer tree, including a late recovery notice. */
export async function waitForStudioRecoveredStrokeLayers(
  page: Page,
  expectedIds: readonly string[],
  timeoutMs = 8_000,
): Promise<void> {
  const started = performance.now();
  const state = await page.waitForFunction(studioRecoveredStrokeLayerState, expectedIds, { timeout: timeoutMs });
  const value = await state.jsonValue();
  await state.dispose();
  if (value === "manual") {
    await page.locator("[data-studio-recovery-notice]").getByRole("button", {
      name: /^(이어서 그리기|다시 이어 열기)$/u,
    }).click({ timeout: Math.max(1, timeoutMs - (performance.now() - started)) });
    // One explicit recovery request only. A failed restore must not be retried by the verifier.
    const restored = await page.waitForFunction((ids) => !document.querySelector("[data-studio-recovery-notice]")
      && ids.length > 0 && ids.every((id) =>
        document.getElementById(`studio-layer-${id}`)?.matches('[data-studio-layer-row="true"]')
      ), expectedIds, { timeout: Math.max(1, timeoutMs - (performance.now() - started)) });
    await restored.dispose();
  }
}

/** ArrowDown opens or focuses a group without a second pointer click toggling it closed. */
export async function openStudioShapeCorrectionMenu(page: Page): Promise<void> {
  const trigger = page.locator('[data-studio-main-menu="true"]')
    .getByRole("menuitem", { name: /^(창작|Create)$/u });
  await trigger.focus();
  await trigger.press("ArrowDown");
  await page.getByRole("menu", { name: /^(창작|Create)$/u }).waitFor({ state: "visible" });
}

export async function studioShapeLiveReadinessEvidence(page: Page) {
  return page.evaluate(() => ({
    liveLayerIds: [...document.querySelectorAll('[data-studio-layer-row="true"]')]
      .map((row) => row.id.replace(/^studio-layer-/u, "")),
    recovery: [...document.querySelectorAll("[data-studio-recovery-notice]")].map((notice) => ({
      busy: notice.getAttribute("aria-busy"), text: notice.textContent?.trim(),
    })),
    menus: [...document.querySelectorAll("[data-studio-main-menu-trigger]")].map((trigger) => ({
      id: trigger.getAttribute("data-studio-main-menu-trigger"), expanded: trigger.getAttribute("aria-expanded"),
    })),
  }));
}
