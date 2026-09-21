import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

import { observeStudioRecovery, studioRecoveryReceiptIsComplete } from "./studio-verify-recovery";

import type { BrowserContext } from "playwright";

const automatic = { recoveryMode: "automatic", recoveryBannerObserved: true,
  automaticRestoreObserved: true, automaticRestoreCompleted: true, restoreActionCompleted: false };
const explicit = { recoveryMode: "explicit", recoveryBannerObserved: true,
  automaticRestoreObserved: false, automaticRestoreCompleted: false, restoreActionCompleted: true };

describe("actual Studio recovery receipts", () => {
  it("accepts observed, completed automatic recovery without claiming a click", () => {
    expect(studioRecoveryReceiptIsComplete(automatic)).toBe(true);
  });
  it("accepts an actual explicit restore", () => { expect(studioRecoveryReceiptIsComplete(explicit)).toBe(true); });
  it("retains confirmed manual-mode receipts from the preceding main verifier", () => {
    expect(studioRecoveryReceiptIsComplete({ ...explicit, recoveryMode: "manual" })).toBe(true);
    expect(studioRecoveryReceiptIsComplete({ ...explicit, recoveryMode: "manual", restoreActionCompleted: false })).toBe(false);
  });
  it("retains historical explicit-action receipts", () => {
    expect(studioRecoveryReceiptIsComplete({ recoveryBannerObserved: true, restoreActionCompleted: true })).toBe(true);
  });
  it.each([
    null, {}, { ...automatic, recoveryBannerObserved: false },
    { ...automatic, automaticRestoreObserved: false }, { ...automatic, automaticRestoreCompleted: false },
    { ...automatic, restoreActionCompleted: true }, { ...automatic, recoveryMode: "assumed" },
    { ...explicit, restoreActionCompleted: false }, { ...explicit, automaticRestoreCompleted: true },
    { recoveryBannerObserved: true, automaticRestoreCompleted: true },
  ])("rejects absent, transient, unconfirmed or contradictory evidence %#", (value) => {
    expect(studioRecoveryReceiptIsComplete(value)).toBe(false);
  });
});


it("installs standalone JavaScript without TypeScript or transpiler helper dependencies", async () => {
  let content = "";
  const context = { addInitScript: async (script: { content: string }) => { content = script.content; } } as unknown as BrowserContext;
  await observeStudioRecovery(context);
  expect(content).toContain("MutationObserver");
  expect(content).not.toContain("__name");
  expect(() => new Script(content)).not.toThrow();
});
