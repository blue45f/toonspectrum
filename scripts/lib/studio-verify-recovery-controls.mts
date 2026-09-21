import type { Page } from "playwright";

/** Passive document-local observation; never reads/writes autosave data or invokes product code. */
export function installStudioRecoveryObservation(): () => void {
  const state = { observed: false, automatic: false };
  const host = globalThis as typeof globalThis & { __studioRecoveryObservation?: typeof state };
  host.__studioRecoveryObservation = state;
  const inspect = (node: Node) => {
    if (!(node instanceof Element)) return;
    const notices = node.matches("[data-studio-recovery-notice]")
      ? [node] : Array.from(node.querySelectorAll("[data-studio-recovery-notice]"));
    for (const notice of notices) {
      state.observed = true;
      if (notice.getAttribute("data-studio-auto-resume") === "true") state.automatic = true;
    }
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      // Even a notice inserted and removed in the same task remains real observable evidence.
      for (const node of record.addedNodes) inspect(node);
      for (const node of record.removedNodes) inspect(node);
      if (record.type === "attributes") inspect(record.target);
    }
    if (document.documentElement) inspect(document.documentElement);
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true,
    attributeFilter: ["data-studio-recovery-notice", "data-studio-auto-resume"] });
  if (document.documentElement) inspect(document.documentElement);
  return () => observer.disconnect();
}

/** A current recoverable button is driven explicitly; blocked/back-up-only states stay failures. */
export async function completeObservedStudioRecovery(page: Page, timeout: number): Promise<{
  readonly observed: true; readonly mode: "automatic" | "manual";
}> {
  const state = await page.waitForFunction(() => {
    const evidence = (globalThis as typeof globalThis & {
      __studioRecoveryObservation?: { observed: boolean; automatic: boolean };
    }).__studioRecoveryObservation;
    if (!evidence?.observed) return false;
    const notice = document.querySelector("[data-studio-recovery-notice]");
    if (!notice) return { phase: "complete", automatic: evidence.automatic };
    if (notice.getAttribute("aria-busy") === "true") return false;
    const restore = Array.from(notice.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => /^(이어서 그리기|다시 이어 열기)$/u.test(button.textContent?.trim() ?? ""));
    return restore && !restore.disabled ? { phase: "manual", automatic: evidence.automatic }
      : { phase: "blocked", automatic: evidence.automatic };
  }, undefined, { timeout });
  const result = await state.jsonValue();
  await state.dispose();
  if (!result) throw new Error("Recovery observation did not reach a terminal state");
  if (result.phase === "complete" && !result.automatic) {
    throw new Error("Recovery notice disappeared without observed automatic recovery or an explicit restore action");
  }
  if (result.phase === "blocked") throw new Error("Recovery is blocked; backup-only or unknown recovery state is not a restore");
  if (result.phase === "manual") {
    await page.locator("[data-studio-recovery-notice]")
      .getByRole("button", { name: /^(이어서 그리기|다시 이어 열기)$/u }).click({ timeout });
    await page.locator("[data-studio-recovery-notice]").waitFor({ state: "detached", timeout });
  }
  // The caller must still prove unchanged document identity and pixel-identical PNG export.
  return { observed: true, mode: result.phase === "manual" ? "manual" : "automatic" };
}

/** tsx preserves names with a helper; preload it in the same init-script, before any callback. */
export function studioRecoveryObservationInitScript(): string {
  return `globalThis.__name ??= (target) => target;(${installStudioRecoveryObservation.toString()})();`;
}
