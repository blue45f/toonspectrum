import { describe, expect, it } from "vitest";

import {
  checkStudioWasm64Capability,
  StudioWasm64MemoryManager,
} from "./studio-wasm64-memory-governor";

describe("studio-wasm64-memory-governor", () => {
  it("checks environment Wasm64 & SIMD capabilities", () => {
    const report = checkStudioWasm64Capability();
    expect(typeof report.isWasm64Supported).toBe("boolean");
    expect(typeof report.isSimdSupported).toBe("boolean");
    expect(report.maxAllocatableMemoryGiB).toBeGreaterThanOrEqual(4);
  });

  it("allocates 64-bit aligned memory for large layers", () => {
    const manager = new StudioWasm64MemoryManager();
    const alloc1 = manager.allocateLayerMemory("layer-1", 1000);
    const alloc2 = manager.allocateLayerMemory("layer-2", 2000);

    expect(alloc1.addressI64).toBeGreaterThan(BigInt(0));
    expect(alloc2.addressI64).toBeGreaterThan(alloc1.addressI64);
    expect(manager.getTotalAllocatedBytes()).toBe(3000);
    expect(manager.getAllocation("layer-1")).toEqual(alloc1);
  });
});
