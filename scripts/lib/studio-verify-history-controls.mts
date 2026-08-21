/**
 * Locale-independent handles for the Studio undo/redo controls.
 *
 * The menubar command bar renders its slot labels from the locale packs, so a verifier
 * running under the default en-US browser locale sees "Undo", not "실행취소" — keying on
 * the translated string made three browser gates fail the moment the strip was localized
 * (2026-08-21). The slot buttons carry a stable `data-studio-command-bar-command`
 * attribute for exactly this reason; the Korean aria-label stays in the selector so the
 * mobile dock and any other fixed control still match.
 */
import type { Locator, Page } from "playwright";

export type StudioHistoryControlKind = "undo" | "redo";

const KOREAN_LABEL: Record<StudioHistoryControlKind, string> = {
  undo: "실행취소",
  redo: "다시실행",
};

/** CSS matching every shipped control that performs the given history command. */
export function studioHistoryControlSelector(kind: StudioHistoryControlKind): string {
  return [
    `button[data-studio-command-bar-command="${kind}"]`,
    `button[aria-label="${KOREAN_LABEL[kind]}"]`,
  ].join(", ");
}

/**
 * Resolves the first visible, enabled control for the command, waiting for the history
 * state that enables it. Throws with the caller's vocabulary when none appears.
 */
export async function enabledStudioHistoryControl(
  page: Page,
  kind: StudioHistoryControlKind,
  timeoutMs = 8_000,
): Promise<Locator> {
  const selector = studioHistoryControlSelector(kind);
  await page.waitForFunction(
    (css) => [...document.querySelectorAll<HTMLButtonElement>(css)]
      .some((button) => !button.disabled && button.getClientRects().length > 0),
    selector,
    { timeout: timeoutMs },
  );
  const candidates = page.locator(`${selector}`).locator("visible=true");
  const count = await candidates.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isEnabled()) return candidate;
  }
  throw new Error(`${KOREAN_LABEL[kind]} button did not become enabled`);
}
