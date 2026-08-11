import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_WASM_PAGE_BYTES,
  type StudioWasmLinearMemoryRuntime,
} from "../studio-wasm64-memory-governor";

import {
  EPOCH16_MEMORY64_PRODUCT_WORKLOADS,
  Memory64WorkloadCoordinator,
  type Memory64WorkloadAllocationPort,
  type Memory64WorkloadRequest,
} from "./Memory64WorkloadCoordinator";
import {
  probeWasmMemory64Capability,
  WASM_MEMORY64_ACCELERATOR_POLICY,
  type WasmMemory64CapabilityReceipt,
  type WasmMemoryRuntimeSelection,
  type WasmScratchAllocationRequest,
} from "./WasmMemory64Capability";

const PAGE_BYTES = STUDIO_WASM_PAGE_BYTES;
const BASE_CAPABILITY = probeWasmMemory64Capability({ webAssembly: null });
const SOURCE = Object.freeze({
  authority: "opfs-cas-paging",
  access: "paged-range-only",
  objectDigest: "a".repeat(64),
} as const);

function capability(
  selectedRuntime: WasmMemoryRuntimeSelection,
): WasmMemory64CapabilityReceipt {
  return Object.freeze({
    ...BASE_CAPABILITY,
    selectedRuntime,
    isMemory64Supported: selectedRuntime === "memory64",
    isMemory32FallbackSupported:
      selectedRuntime === "memory64"
      || selectedRuntime === "memory32-fallback",
  });
}

function fakeRuntime(): StudioWasmLinearMemoryRuntime {
  return Object.freeze({}) as StudioWasmLinearMemoryRuntime;
}

function request(
  overrides: Partial<Memory64WorkloadRequest> = {},
): Memory64WorkloadRequest {
  return {
    workload: "project",
    logicalByteLength: PAGE_BYTES * BigInt(64),
    preferredChunkBytes: PAGE_BYTES * BigInt(8),
    minimumChunkBytes: PAGE_BYTES * BigInt(2),
    budget: {
      availableBytes: PAGE_BYTES * BigInt(16),
      availablePages: BigInt(16),
    },
    source: SOURCE,
    ...overrides,
  };
}

function coordinator(
  allocate: Memory64WorkloadAllocationPort["allocate"],
  selectedRuntime: WasmMemoryRuntimeSelection = "memory64",
) {
  const probe = vi.fn(() => capability(selectedRuntime));
  const release = vi.fn();
  const instance = new Memory64WorkloadCoordinator({
    capabilityProbe: probe,
    allocationPort: { allocate, release },
  });
  return { instance, probe, release };
}

describe("Memory64WorkloadCoordinator", () => {
  it("allocates a real bounded runtime through the default product port when Wasm is available", () => {
    const instance = new Memory64WorkloadCoordinator();
    const receipt = instance.coordinate(request({
      logicalByteLength: PAGE_BYTES * BigInt(2),
      preferredChunkBytes: PAGE_BYTES,
      minimumChunkBytes: PAGE_BYTES,
      budget: {
        availableBytes: PAGE_BYTES * BigInt(2),
        availablePages: BigInt(2),
      },
    }));

    if (!instance.capability.isMemory64Supported
      && !instance.capability.isMemory32FallbackSupported) {
      expect(receipt).toMatchObject({
        ok: false,
        selectedRuntime: "unavailable",
        opfsSpill: { disposition: "required" },
      });
      return;
    }

    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.selectedRuntime).toBe(
      instance.capability.isMemory64Supported
        ? "memory64"
        : "memory32-fallback",
    );
    expect(receipt.lease.runtime.currentPages).toBe(BigInt(1));
    expect(receipt.lease.runtime.maximumPages).toBe(BigInt(1));
    expect(receipt.lease.release()).toBe(true);
  });

  it("shares one Memory64-first capability probe across all Epoch16 product workloads", () => {
    const allocate = vi.fn((_: WasmScratchAllocationRequest) => fakeRuntime());
    const { instance, probe } = coordinator(allocate);

    for (const workload of EPOCH16_MEMORY64_PRODUCT_WORKLOADS) {
      const receipt = instance.coordinate(request({ workload }));
      expect(receipt).toMatchObject({
        ok: true,
        status: "allocated",
        workload,
        selectedRuntime: "memory64",
        materializesWholeDocument: false,
        materializesWholeJson: false,
        readsCanonicalProjectBytes: false,
      });
      if (receipt.ok) expect(receipt.lease.release()).toBe(true);
    }

    expect(EPOCH16_MEMORY64_PRODUCT_WORKLOADS).toEqual([
      "brush",
      "texture",
      "scene3d",
      "physics",
      "vision",
      "project",
      "animation",
    ]);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(allocate).toHaveBeenCalledTimes(
      EPOCH16_MEMORY64_PRODUCT_WORKLOADS.length,
    );
    expect(allocate.mock.calls.every(
      ([allocation]) => allocation.addressType === "i64",
    )).toBe(true);
  });

  it("accounts every live workload against one coordinator resident budget", () => {
    const allocate = vi.fn(() => fakeRuntime());
    const { instance } = coordinator(allocate);
    const sharedBudget = {
      availableBytes: PAGE_BYTES * BigInt(16),
      availablePages: BigInt(16),
      reservedBytes: PAGE_BYTES * BigInt(4),
    };

    const brush = instance.coordinate(request({
      workload: "brush",
      budget: sharedBudget,
    }));
    const scene = instance.coordinate(request({
      workload: "scene3d",
      budget: sharedBudget,
    }));
    const vision = instance.coordinate(request({
      workload: "vision",
      budget: sharedBudget,
    }));

    expect(brush.ok).toBe(true);
    expect(scene.ok).toBe(true);
    expect(vision).toMatchObject({
      ok: false,
      terminal: {
        reason: "insufficient-runtime-budget",
        action: "wait-for-budget",
      },
    });
    if (!brush.ok || !scene.ok) return;
    expect(brush.plan.workingSetPages).toBe(BigInt(8));
    expect(scene.plan.workingSetPages).toBe(BigInt(4));
    expect(scene.plan.budget.reservedBytes).toBe(PAGE_BYTES * BigInt(12));
    expect(instance.activeLeaseCount).toBe(2);
    expect(instance.activeResidentPages).toBe(BigInt(12));
    expect(instance.activeResidentBytes).toBe(PAGE_BYTES * BigInt(12));

    expect(brush.lease.release()).toBe(true);
    const retriedVision = instance.coordinate(request({
      workload: "vision",
      budget: sharedBudget,
    }));
    expect(retriedVision).toMatchObject({
      ok: true,
      plan: { workingSetPages: BigInt(8) },
    });
    expect(instance.activeResidentPages).toBe(BigInt(12));
  });

  it("retries geometrically smaller i64 windows before selecting memory32", () => {
    const allocate = vi.fn((allocation) => {
      if (allocation.addressType === "i64") {
        throw new RangeError(`deny i64 ${allocation.initialPages}`);
      }
      return fakeRuntime();
    });
    const { instance } = coordinator(allocate);

    const receipt = instance.coordinate(request());

    expect(allocate.mock.calls.map(([allocation]) => ({
      addressType: allocation.addressType,
      pages: allocation.initialPages,
    }))).toEqual([
      { addressType: "i64", pages: BigInt(8) },
      { addressType: "i64", pages: BigInt(4) },
      { addressType: "i64", pages: BigInt(2) },
      { addressType: "i32", pages: BigInt(2) },
    ]);
    expect(receipt).toMatchObject({
      ok: true,
      status: "feature-preserved-fallback",
      selectedRuntime: "memory32-fallback",
      fallback: {
        kind: "minimum-window-fallback",
        reason: "memory64-allocation-failed",
        nextRuntime: "memory32-fallback",
        allocation: {
          status: "fallback",
          recommendedPages: BigInt(2),
        },
      },
      opfsSpill: { disposition: "not-required" },
    });
    expect(receipt.attempts).toHaveLength(4);
    expect(Object.isFrozen(receipt.attempts)).toBe(true);
  });

  it("keeps Memory64 when a smaller i64 window succeeds", () => {
    const allocate = vi.fn()
      .mockImplementationOnce(() => {
        throw new RangeError("large i64 denied");
      })
      .mockImplementationOnce(() => fakeRuntime());
    const { instance } = coordinator(allocate);

    const receipt = instance.coordinate(request());

    expect(receipt).toMatchObject({
      ok: true,
      status: "allocated",
      selectedRuntime: "memory64",
      fallback: null,
      plan: { workingSetPages: BigInt(4) },
    });
    expect(allocate.mock.calls.map(([allocation]) => (
      allocation.addressType
    ))).toEqual(["i64", "i64"]);
  });

  it("uses an explicit feature-preservation receipt when Memory64 is unsupported", () => {
    const allocate = vi.fn((_: WasmScratchAllocationRequest) => fakeRuntime());
    const { instance, probe } = coordinator(allocate, "memory32-fallback");

    const receipt = instance.coordinate(request({ workload: "scene3d" }));

    expect(receipt).toMatchObject({
      ok: true,
      status: "feature-preserved-fallback",
      selectedRuntime: "memory32-fallback",
      fallback: {
        kind: "capability-fallback",
        reason: "memory64-unavailable",
        nextRuntime: "memory32-fallback",
      },
      plan: {
        runtime: "memory32-fallback",
        fallbackReason: "memory64-unavailable",
      },
    });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(allocate).toHaveBeenCalledWith(expect.objectContaining({
      runtime: "memory32-fallback",
      addressType: "i32",
    }));
  });

  it("preserves minimum-i64 fallback and final memory32 OPFS spill receipts", () => {
    const allocate = vi.fn(() => {
      throw new RangeError("resident allocation denied");
    });
    const { instance } = coordinator(allocate);

    const receipt = instance.coordinate(request({
      preferredChunkBytes: PAGE_BYTES,
      minimumChunkBytes: PAGE_BYTES,
    }));

    expect(receipt).toMatchObject({
      ok: false,
      status: "backpressure",
      selectedRuntime: "memory32-fallback",
      fallback: {
        kind: "minimum-window-fallback",
        allocation: {
          status: "fallback",
          nextRuntime: "memory32-fallback",
        },
      },
      terminal: {
        status: "backpressure",
        reason: "allocation-failed",
        action: "stream-through-opfs",
        retryRuntime: "memory32-fallback",
        recommendedPages: BigInt(0),
      },
      opfsSpill: {
        disposition: "required",
        authority: "opfs-cas-paging",
        access: "paged-range-only",
        action: "stream-through-opfs",
      },
    });
    expect(receipt.attempts).toHaveLength(2);
  });

  it("preserves planner backpressure and keeps OPFS available while waiting for budget", () => {
    const allocate = vi.fn(() => fakeRuntime());
    const { instance } = coordinator(allocate);

    const receipt = instance.coordinate(request({
      budget: { availableBytes: BigInt(0), availablePages: BigInt(0) },
    }));

    expect(receipt).toMatchObject({
      ok: false,
      status: "backpressure",
      terminal: {
        reason: "insufficient-runtime-budget",
        action: "wait-for-budget",
      },
      opfsSpill: {
        disposition: "available",
        action: "wait-for-budget",
      },
    });
    expect(receipt.attempts).toEqual([]);
    expect(allocate).not.toHaveBeenCalled();
  });

  it("requires OPFS paging when neither address mode is operational", () => {
    const allocate = vi.fn(() => fakeRuntime());
    const { instance } = coordinator(allocate, "unavailable");

    const receipt = instance.coordinate(request({ workload: "animation" }));

    expect(receipt).toMatchObject({
      ok: false,
      selectedRuntime: "unavailable",
      terminal: {
        reason: "accelerator-unavailable",
        action: "stream-through-opfs",
      },
      opfsSpill: { disposition: "required" },
    });
    expect(allocate).not.toHaveBeenCalled();
  });

  it("rejects whole-document fields and accepts only a strict paged source descriptor", () => {
    const allocate = vi.fn(() => fakeRuntime());
    const { instance } = coordinator(allocate);
    const unsafe = {
      ...request(),
      canonicalJson: "{\"pages\":[]}",
    } as Memory64WorkloadRequest;

    const receipt = instance.coordinate(unsafe);

    expect(receipt).toMatchObject({
      ok: false,
      terminal: {
        reason: "invalid-request",
        action: "stream-through-opfs",
      },
      materializesWholeDocument: false,
      materializesWholeJson: false,
      readsCanonicalProjectBytes: false,
      opfsSpill: { disposition: "required" },
    });
    expect(allocate).not.toHaveBeenCalled();

    const source = readFileSync(
      new URL("./Memory64WorkloadCoordinator.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/JSON\.(?:parse|stringify)/u);
    expect(source).not.toMatch(/CreatorProjectIRV16/u);
    expect(source).not.toMatch(/Uint8Array\[\]|ArrayBuffer\[\]/u);
    expect(WASM_MEMORY64_ACCELERATOR_POLICY).toMatchObject({
      selectionPriority: "memory64-first",
      wholeDocumentMaterializationAllowed: false,
      wholeJsonMaterializationAllowed: false,
    });
  });

  it("emits chunks lazily for an 8 GiB logical project without loading the whole IR", () => {
    const allocate = vi.fn(() => fakeRuntime());
    const { instance } = coordinator(allocate);
    const receipt = instance.coordinate(request({
      logicalByteLength:
        BigInt(8) * BigInt(1024) * BigInt(1024) * BigInt(1024),
      preferredChunkBytes: PAGE_BYTES * BigInt(2),
      minimumChunkBytes: PAGE_BYTES,
    }));
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;

    const chunks = receipt.lease.chunks();
    expect(chunks.next().value).toMatchObject({
      chunkIndex: BigInt(0),
      logicalByteOffset: BigInt(0),
      sourceAccess: "paged-range-only",
    });
    expect(chunks.next().value).toMatchObject({
      chunkIndex: BigInt(1),
      logicalByteOffset: PAGE_BYTES * BigInt(2),
    });
    expect(chunks.next().done).toBe(false);
  });

  it("releases active scratch leases on explicit release and close", () => {
    const allocate = vi.fn(() => fakeRuntime());
    const { instance, release } = coordinator(allocate);
    const first = instance.coordinate(request({ workload: "brush" }));
    const second = instance.coordinate(request({ workload: "vision" }));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(instance.activeLeaseCount).toBe(2);
    expect(instance.activeResidentPages).toBe(BigInt(16));

    expect(first.lease.release()).toBe(true);
    expect(first.lease.release()).toBe(false);
    expect(instance.activeLeaseCount).toBe(1);
    expect(instance.activeResidentPages).toBe(BigInt(8));
    instance.close();

    expect(instance.activeLeaseCount).toBe(0);
    expect(instance.activeResidentBytes).toBe(BigInt(0));
    expect(instance.activeResidentPages).toBe(BigInt(0));
    expect(release).toHaveBeenCalledTimes(2);
    expect(() => instance.coordinate(request())).toThrow(/closed/u);
  });
});
