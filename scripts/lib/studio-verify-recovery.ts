import assert from "node:assert/strict";

import type { BrowserContext, Page } from "playwright";

export interface StudioRecoveryReceipt {
  recoveryMode: "automatic" | "explicit";
  recoveryBannerObserved: boolean;
  automaticRestoreObserved: boolean;
  automaticRestoreCompleted: boolean;
  restoreActionCompleted: boolean;
}

/** Only the UI recovery receipt: callers must still verify durable storage and exact pixels. */
export function studioRecoveryReceiptIsComplete(value: Record<string, unknown> | null | undefined): boolean {
  if (value?.recoveryBannerObserved !== true) return false;
  if (value.recoveryMode === "automatic") {
    return value.automaticRestoreObserved === true && value.automaticRestoreCompleted === true
      && value.restoreActionCompleted === false;
  }
  // Older reports contain explicit-button receipts without a mode; preserve their strict contract.
  if (value.recoveryMode === undefined || value.recoveryMode === "explicit") {
    return value.restoreActionCompleted === true && value.automaticRestoreCompleted !== true;
  }
  return false;
}

/** Observe only the real DOM. No autosave, lease, project or application state is injected. */
export async function observeStudioRecovery(context: BrowserContext): Promise<void> {
  // Literal browser JavaScript avoids tsx/esbuild helper references in serialized callbacks.
  await context.addInitScript({ content: `(() => {
    const receipt = { bannerObserved: false, automaticObserved: false };
    Object.assign(window, { __toonstudioRecoveryVerifier: receipt });
    const observeElement = (element) => {
      if (element.matches("[data-studio-recovery-notice]")) receipt.bannerObserved = true;
      if (element.matches('[data-studio-auto-resume="true"]')) receipt.automaticObserved = true;
      for (const notice of element.querySelectorAll("[data-studio-recovery-notice]")) {
        receipt.bannerObserved = true;
        if (notice.getAttribute("data-studio-auto-resume") === "true") receipt.automaticObserved = true;
      }
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof Element) observeElement(record.target);
        // Retain an observed transient notice even if automatic restore removed it in this batch.
        for (const node of record.addedNodes) if (node instanceof Element) observeElement(node);
      }
    });
    observer.observe(document, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["data-studio-recovery-notice", "data-studio-auto-resume"] });
    if (document.documentElement) observeElement(document.documentElement);
    window.addEventListener("pagehide", () => observer.disconnect(), { once: true });
  })();` });
}

/** Distinguish successful automatic resume from an actual explicit user recovery action. */
export async function completeStudioRecovery(page: Page, timeout: number): Promise<StudioRecoveryReceipt> {
  await page.waitForFunction(() => {
    const evidence = (window as unknown as { __toonstudioRecoveryVerifier?: { automaticObserved: boolean } })
      .__toonstudioRecoveryVerifier;
    const notice = document.querySelector("[data-studio-recovery-notice]");
    if (evidence?.automaticObserved && !notice) return true;
    return notice ? Array.from(notice.querySelectorAll("button")).some((button) =>
      /^(이어서 그리기|다시 이어 열기)$/u.test(button.textContent?.trim() ?? "") && !button.disabled) : false;
  }, undefined, { timeout }).catch(async (cause: unknown) => {
    const diagnosis = await page.evaluate(() => ({
      observation: (window as unknown as { __toonstudioRecoveryVerifier?: unknown }).__toonstudioRecoveryVerifier,
      notices: Array.from(document.querySelectorAll("[data-studio-recovery-notice]"), (node) => node.textContent),
      status: Array.from(document.querySelectorAll('[role="status"],[role="alert"]'), (node) => node.textContent),
      buttons: Array.from(document.querySelectorAll("button"), (node) => node.textContent?.trim()).filter((text) => /복원|복구|이어|저장/u.test(text ?? "")),
    }));
    throw new Error(`Recovery did not finish: ${JSON.stringify(diagnosis)}`, { cause });
  });
  const notice = page.locator("[data-studio-recovery-notice]");
  let explicit = false;
  if (await notice.count()) {
    const action = notice.getByRole("button", { name: /^(이어서 그리기|다시 이어 열기)$/u });
    assert.equal(await action.count(), 1, "Recovery must have exactly one safe restore action");
    await action.click({ timeout });
    explicit = true;
  }
  await notice.waitFor({ state: "detached", timeout });
  const observation = await page.evaluate(() =>
    (window as unknown as { __toonstudioRecoveryVerifier: { bannerObserved: boolean; automaticObserved: boolean } })
      .__toonstudioRecoveryVerifier);
  const result: StudioRecoveryReceipt = {
    recoveryMode: explicit ? "explicit" : "automatic",
    recoveryBannerObserved: observation.bannerObserved,
    automaticRestoreObserved: observation.automaticObserved,
    automaticRestoreCompleted: !explicit && observation.automaticObserved,
    restoreActionCompleted: explicit,
  };
  assert.ok(studioRecoveryReceiptIsComplete({ ...result }), "No confirmed UI recovery receipt was observed");
  return result;
}
