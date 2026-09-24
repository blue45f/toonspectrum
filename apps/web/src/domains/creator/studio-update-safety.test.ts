import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getStudioUpdateSafetySnapshot,
  refreshStudioUpdateSafety,
  registerStudioUpdateSafetySource,
  resetStudioUpdateSafetyForTest,
  subscribeStudioUpdateSafety,
} from "./studio-update-safety";

afterEach(resetStudioUpdateSafetyForTest);

describe("studio update safety", () => {
  it("aggregates live unsaved, save, and sync blockers", () => {
    let unsaved = true;
    const removeUnsaved = registerStudioUpdateSafetySource("document", () => ({
      safe: !unsaved,
      reason: "unsaved-work",
      message: "마지막 획이 아직 기기에 저장되지 않았습니다.",
    }));
    const removeSync = registerStudioUpdateSafetySource("sync", () => ({
      safe: false,
      reason: "sync-pending",
      pendingCount: 7,
      message: "서버 승인을 기다리는 변경이 있습니다.",
    }));

    expect(getStudioUpdateSafetySnapshot()).toMatchObject({
      safe: false,
      reason: "multiple",
      pendingCount: 7,
      sourceCount: 2,
      message: "마지막 획이 아직 기기에 저장되지 않았습니다.",
    });

    unsaved = false;
    removeSync();
    expect(refreshStudioUpdateSafety()).toMatchObject({
      safe: true,
      reason: null,
      pendingCount: 0,
      sourceCount: 1,
    });
    removeUnsaved();
  });

  it("notifies immediately and whenever sources change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioUpdateSafety(listener);
    const remove = registerStudioUpdateSafetySource("save", () => ({
      safe: false,
      reason: "save-in-progress",
      message: "저장 영수증을 기다리는 중입니다.",
    }));

    expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({ safe: true }));
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      safe: false,
      reason: "save-in-progress",
    }));
    remove();
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ safe: true }));
    unsubscribe();
  });

  it("fails closed when an evaluator throws", () => {
    registerStudioUpdateSafetySource("broken", () => {
      throw new Error("failed");
    });
    expect(getStudioUpdateSafetySnapshot()).toMatchObject({
      safe: false,
      reason: "unsaved-work",
    });
  });
});
