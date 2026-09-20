import assert from "node:assert/strict";

/** Exercise the real appearance authority in a disposable, local QA browser. */
export async function setWorkspaceQaTheme(page, preference) {
  await page.evaluate(async (next) => {
    const { useTheme } = await import("/src/shared/lib/theme.ts");
    useTheme.getState().setStudioPreference("inherit");
    useTheme.getState().setPreference(next);
  }, preference);
  await page.waitForFunction((next) => {
    const root = document.documentElement;
    const shell = document.querySelector(".workspace-shell");
    if (!shell || root.dataset.designTheme !== next) return false;
    const actual = getComputedStyle(shell);
    const expected = getComputedStyle(root);
    return actual.backgroundColor === expected.getPropertyValue("--color-canvas").trim()
      && actual.color === expected.getPropertyValue("--color-fg").trim();
  }, preference, { timeout: 10000 });
}

export async function readWorkspaceQaTheme(page) {
  return page.evaluate(() => ({
    designTheme: document.documentElement.dataset.designTheme,
    mode: document.documentElement.dataset.theme,
    background: getComputedStyle(document.querySelector(".workspace-shell")).backgroundColor,
    foreground: getComputedStyle(document.querySelector(".workspace-shell")).color,
  }));
}

export function assertWorkspaceQaThemeChanged(dark, light) {
  assert.equal(dark.designTheme, "dark");
  assert.equal(light.designTheme, "light");
  assert.notEqual(light.background, dark.background, "Light mode must change the computed workspace palette");
}
