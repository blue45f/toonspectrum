import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getStudioReliabilityStatusSnapshot,
  resetStudioReliabilityStatus,
} from "./studio-reliability-status-store";
import {
  configureStudioStorageRecovery,
  isStudioStorageQuotaPressure,
  noteStudioSaveSucceeded,
  reclaimStudioStorage,
  reportStudioAutosaveFailure,
  reportStudioSaveAuthorityDegraded,
  resetStudioStorageRecoveryRuntime,
} from "./studio-storage-recovery-runtime";

import type { StudioOpfsRecoveryRuntime } from "./studio-opfs-recovery-runtime";

function quotaError(): Error {
  const error = new Error("write failed");
  error.name = "QuotaExceededError";
  return error;
}

interface FakeRuntime {
  cleanupQuota: ReturnType<typeof vi.fn>;
  installPageHideFlush: ReturnType<typeof vi.fn>;
}

function createFakeRuntime(
  cleanup: () => Promise<{ removedPaths: string[]; freedBytes: number }>,
): FakeRuntime {
  return {
    cleanupQuota: vi.fn(cleanup),
    installPageHideFlush: vi.fn(() => () => undefined),
  };
}

function install(runtime: FakeRuntime | null): void {
  configureStudioStorageRecovery({
    createRuntime: async () => runtime as unknown as StudioOpfsRecoveryRuntime | null,
    pageHideTarget: null,
    now: () => 42,
  });
}

afterEach(() => {
  resetStudioStorageRecoveryRuntime();
  resetStudioReliabilityStatus();
});

describe("studio storage recovery runtime — no silent save failure", () => {
  it("classifies quota pressure across name, code, and message shapes", () => {
    expect(isStudioStorageQuotaPressure(quotaError())).toBe(true);
    expect(isStudioStorageQuotaPressure({ code: 22 })).toBe(true);
    expect(isStudioStorageQuotaPressure({ code: 1014 })).toBe(true);
    expect(isStudioStorageQuotaPressure(new Error("The quota has been exceeded"))).toBe(
      true,
    );
    expect(isStudioStorageQuotaPressure(new Error("network down"))).toBe(false);
  });

  it("surfaces an ordinary autosave failure to the user instead of only the console", async () => {
    install(createFakeRuntime(async () => ({ removedPaths: [], freedBytes: 0 })));

    await reportStudioAutosaveFailure(new Error("disk unplugged"));

    const snapshot = getStudioReliabilityStatusSnapshot();
    expect(snapshot.save?.level).toBe("failed");
    expect(snapshot.save?.title).toBe("임시저장에 실패했습니다");
    expect(snapshot.save?.detail).toContain("disk unplugged");
    // 쿼터가 아니면 Safe Mode 로 내려가지 않는다 — 품질 저하는 원인이 있을 때만.
    expect(snapshot.safeMode.active).toBe(false);
  });

  it("runs the previously dead cleanupQuota on quota pressure and reports the reclaim", async () => {
    const runtime = createFakeRuntime(async () => ({
      removedPaths: ["a", "b"],
      freedBytes: 2_400_000,
    }));
    install(runtime);

    await reportStudioAutosaveFailure(quotaError());

    expect(runtime.cleanupQuota).toHaveBeenCalledTimes(1);
    const snapshot = getStudioReliabilityStatusSnapshot();
    expect(snapshot.save?.level).toBe("failed");
    expect(snapshot.storage?.level).toBe("ok");
    expect(snapshot.storage?.title).toContain("2.4MB");
    // 회수에 성공했으므로 저장소 사유는 해소된다.
    expect(snapshot.safeMode.active).toBe(false);
  });

  it("stays in safe mode when there is nothing left to reclaim", async () => {
    install(createFakeRuntime(async () => ({ removedPaths: [], freedBytes: 0 })));

    await reportStudioAutosaveFailure(quotaError());

    const snapshot = getStudioReliabilityStatusSnapshot();
    expect(snapshot.storage?.level).toBe("failed");
    expect(snapshot.storage?.title).toContain("회수할 수 있는");
    expect(snapshot.safeMode.active).toBe(true);
    expect(snapshot.safeMode.reasons).toContain("storage-pressure");
    expect(snapshot.safeMode.quality.livingInkSuspended).toBe(true);
    // 저장소 압박은 GPU 레인을 끄지 않는다 — 원인에 맞는 저하만 건다.
    expect(snapshot.safeMode.quality.gpuLanesDisabled).toBe(false);
  });

  it("reports a failed reclaim rather than swallowing it", async () => {
    const runtime = createFakeRuntime(async () => {
      throw new Error("lease lost");
    });
    install(runtime);

    await reclaimStudioStorage();

    expect(getStudioReliabilityStatusSnapshot().storage?.title).toContain(
      "회수에 실패",
    );
    expect(getStudioReliabilityStatusSnapshot().storage?.detail).toContain("lease lost");
  });

  it("says so when no durable recovery backend exists at all", async () => {
    install(null);

    await reclaimStudioStorage();

    expect(getStudioReliabilityStatusSnapshot().storage?.level).toBe("failed");
    expect(getStudioReliabilityStatusSnapshot().storage?.title).toContain(
      "회수할 수 없습니다",
    );
  });

  it("reports a durable-authority demotion that used to be swallowed by an empty catch", () => {
    install(null);

    reportStudioSaveAuthorityDegraded(new Error("origin lock unavailable"));

    const snapshot = getStudioReliabilityStatusSnapshot();
    expect(snapshot.save?.level).toBe("degraded");
    expect(snapshot.save?.title).toContain("브라우저 임시 저장");
    expect(snapshot.save?.detail).toContain("origin lock unavailable");
  });

  it("clears the save channel once a durable save succeeds again", async () => {
    install(null);
    await reportStudioAutosaveFailure(new Error("transient"));
    expect(getStudioReliabilityStatusSnapshot().save).not.toBeNull();

    noteStudioSaveSucceeded("opfs-journal");
    expect(getStudioReliabilityStatusSnapshot().save).toBeNull();
  });

  it("does not let a fallback save erase the demotion notice it just raised", () => {
    install(null);
    reportStudioSaveAuthorityDegraded(new Error("origin lock unavailable"));

    // 폴백 저장은 성공하지만 내구성은 여전히 낮다 — 고지가 살아 있어야 한다.
    noteStudioSaveSucceeded("browser-storage-fallback");

    expect(getStudioReliabilityStatusSnapshot().save?.level).toBe("degraded");
  });

  it("installs a pagehide flush so a closing tab still lands its recovery record", async () => {
    const runtime = createFakeRuntime(async () => ({ removedPaths: [], freedBytes: 0 }));
    const target = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    configureStudioStorageRecovery({
      createRuntime: async () => runtime as unknown as StudioOpfsRecoveryRuntime,
      pageHideTarget: target,
      now: () => 1,
    });

    await reclaimStudioStorage();

    expect(runtime.installPageHideFlush).toHaveBeenCalledTimes(1);
    expect(runtime.installPageHideFlush.mock.calls[0]?.[0]).toBe(target);
  });
});
