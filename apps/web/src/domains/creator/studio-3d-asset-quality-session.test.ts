// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("session-only high-quality model admission", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.resetModules();
  });

  it("starts a fresh page in auto even when the previous page had high enabled", async () => {
    const previous = await import("./studio-3d-asset-quality-session");
    previous.enableStudio3dHighAssetQuality();
    expect(previous.getStudio3dAssetQualityMode()).toBe("high");
    vi.resetModules();
    const reloaded = await import("./studio-3d-asset-quality-session");
    expect(reloaded.getStudio3dAssetQualityMode()).toBe("auto");
    reloaded.initializeStudio3dAssetQualitySession();
    expect(reloaded.getStudio3dAssetQualitySnapshot().notice).toContain("이전 실행");
    expect(reloaded.getStudio3dAssetQualityMode()).toBe("auto");
  });

  it("uses a stable snapshot and notifies only when state changes", async () => {
    const session = await import("./studio-3d-asset-quality-session");
    const listener = vi.fn();
    const unsubscribe = session.subscribeStudio3dAssetQuality(listener);
    const initial = session.getStudio3dAssetQualitySnapshot();
    expect(session.getStudio3dAssetQualitySnapshot()).toBe(initial);
    session.enableStudio3dHighAssetQuality();
    session.enableStudio3dHighAssetQuality();
    expect(listener).toHaveBeenCalledTimes(1);
    session.resetStudio3dAssetQualityMode("safe recovery");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    session.enableStudio3dHighAssetQuality();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not require session storage access for a safe initial mode or reset", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      const session = await import("./studio-3d-asset-quality-session");
      session.initializeStudio3dAssetQualitySession();
      expect(session.getStudio3dAssetQualityMode()).toBe("auto");
      session.enableStudio3dHighAssetQuality();
      session.resetStudio3dAssetQualityMode();
      expect(session.getStudio3dAssetQualityMode()).toBe("auto");
    } finally {
      get.mockRestore(); set.mockRestore(); remove.mockRestore();
    }
  });
});
