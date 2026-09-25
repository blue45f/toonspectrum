import { describe, expect, it } from "vitest";

import {
  decideStudioOfflineAutomaticPreparation,
  isStudioOfflineAutomationDetail,
  studioOfflineStorageRatio,
  type StudioOfflineAutomationDecisionInput,
} from "./studio-offline-automation";

const readyInput: StudioOfflineAutomationDecisionInput = {
  browserOnline: true,
  controlled: true,
  documentVisible: true,
  offlineReady: false,
  quota: 1_000,
  saveData: false,
  supported: true,
  usage: 100,
};

function decide(
  override: Partial<StudioOfflineAutomationDecisionInput> = {},
) {
  return decideStudioOfflineAutomaticPreparation({ ...readyInput, ...override });
}

describe("automatic Studio offline preparation policy", () => {
  it("prepares without a user setting when the device can accept the pack", () => {
    expect(decide()).toEqual({ action: "prepare" });
  });
  it.each([
    ["unsupported", { supported: false }],
    ["uncontrolled", { controlled: false }],
    ["already-ready", { offlineReady: true }],
    ["offline", { browserOnline: false }],
    ["document-hidden", { documentVisible: false }],
    ["data-saver", { saveData: true }],
    ["storage-pressure", { usage: 900 }],
  ] as const)("skips %s environments", (reason, override) => {
    expect(decide(override)).toEqual({ action: "skip", reason });
  });

  it("does not reject unknown quota or healthy storage", () => {
    expect(decide({ quota: null, usage: null })).toEqual({ action: "prepare" });
    expect(decide({ usage: 899 })).toEqual({ action: "prepare" });
  });

  it("normalizes storage estimates safely", () => {
    expect(studioOfflineStorageRatio(450, 1_000)).toBe(0.45);
    expect(studioOfflineStorageRatio(null, 1_000)).toBeNull();
    expect(studioOfflineStorageRatio(1, 0)).toBeNull();
  });

  it("validates runtime status events before the UI consumes them", () => {
    expect(isStudioOfflineAutomationDetail({
      phase: "preparing",
      message: "준비 중",
    })).toBe(true);
    expect(isStudioOfflineAutomationDetail({ phase: "unknown", message: "x" })).toBe(false);
    expect(isStudioOfflineAutomationDetail(null)).toBe(false);
  });
});
