import { describe, expect, it, vi } from "vitest";

import {
  captureStudioLayerCompLeaseRelease,
  captureStudioLayerCompSynchronization,
} from "./studio-layer-comp-synchronization";

describe("layer comp synchronization ownership", () => {
  it("permits a standalone editor without a collaboration document", async () => {
    const synchronize = captureStudioLayerCompSynchronization(() => ({
      room: null, document: null, runtime: null,
    }));
    await expect(synchronize()).resolves.toBeUndefined();
  });

  it("uses the same live delivery barrier before and after the edit", async () => {
    const runtime = { flushAndWaitForDelivery: vi.fn().mockResolvedValue(undefined) };
    const snapshot = { room: {}, document: {}, runtime };
    const synchronize = captureStudioLayerCompSynchronization(() => ({ ...snapshot }));
    await synchronize();
    await synchronize();
    expect(runtime.flushAndWaitForDelivery).toHaveBeenCalledTimes(2);
  });

  it.each(["room", "document"] as const)("refuses an incomplete live %s without its runtime", async (key) => {
    const snapshot = {
      room: null, document: null, runtime: null, [key]: {},
    };
    const synchronize = captureStudioLayerCompSynchronization(() => snapshot);
    await expect(synchronize()).rejects.toThrow("아직 준비되지");
  });

  it.each(["room", "document", "runtime"] as const)("never drains a replacement %s", async (key) => {
    const runtime = { flushAndWaitForDelivery: vi.fn().mockResolvedValue(undefined) };
    const replacementRuntime = { flushAndWaitForDelivery: vi.fn().mockResolvedValue(undefined) };
    let snapshot = { room: {}, document: {}, runtime };
    const synchronize = captureStudioLayerCompSynchronization(() => snapshot);
    snapshot = { ...snapshot, [key]: key === "runtime" ? replacementRuntime : {} };
    await expect(synchronize()).rejects.toThrow("문서가 바뀌어");
    expect(runtime.flushAndWaitForDelivery).not.toHaveBeenCalled();
    expect(replacementRuntime.flushAndWaitForDelivery).not.toHaveBeenCalled();
  });

  it("rejects a late delivery completion after the document changed", async () => {
    const delivery = Promise.withResolvers<void>();
    const runtime = { flushAndWaitForDelivery: vi.fn(() => delivery.promise) };
    let snapshot = { room: {}, document: {}, runtime };
    const synchronize = captureStudioLayerCompSynchronization(() => snapshot);
    const pending = synchronize();
    snapshot = { ...snapshot, document: {} };
    delivery.resolve();
    await expect(pending).rejects.toThrow("문서가 바뀌어");
  });

  it("preserves a delivery failure for the transaction to report without discarding edits", async () => {
    const failure = new Error("server acknowledgement unavailable");
    const snapshot = {
      room: {}, document: {},
      runtime: { flushAndWaitForDelivery: () => Promise.reject(failure) },
    };
    const synchronize = captureStudioLayerCompSynchronization(() => snapshot);
    await expect(synchronize()).rejects.toBe(failure);
  });
});

describe("layer comp lease ownership", () => {
  const initial = () => ({ room: {}, document: {}, pageId: "page", generation: 1, resources: ["page:page"] });

  it("releases the captured resources once", () => {
    const snapshot = initial();
    const release = vi.fn();
    const capturedRelease = captureStudioLayerCompLeaseRelease(() => snapshot, release);
    capturedRelease();
    capturedRelease();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each(["room", "document", "pageId", "generation", "resources"] as const)(
    "preserves a replacement operation after its %s changed", (key) => {
      let snapshot = initial();
      const release = vi.fn();
      const capturedRelease = captureStudioLayerCompLeaseRelease(() => snapshot, release);
      const replacement = { ...initial(), pageId: "next-page", generation: 2 };
      snapshot = { ...snapshot, [key]: replacement[key] };
      capturedRelease();
      expect(release).not.toHaveBeenCalled();
    },
  );

  it("does not alter the shared lease controller for a standalone editor", () => {
    const snapshot = { ...initial(), room: null };
    const release = vi.fn();
    captureStudioLayerCompLeaseRelease(() => snapshot, release)();
    expect(release).not.toHaveBeenCalled();
  });
});
