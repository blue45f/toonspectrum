import { describe, expect, it, vi } from "vitest";
import { createStudioScene3dResourcePool } from "./studio-scene3d-resource-pool";

function fixture() {
  const dispose = vi.fn();
  const pool = createStudioScene3dResourcePool<object>({
    maxBytes: 100, maxIdleBytes: 60, maxIdleEntries: 2, dispose,
  });
  return { pool, dispose };
}

describe("Scene3D runtime resource ownership", () => {
  it("reuses matching idle resources, but never lends an in-flight resource twice", () => {
    const { pool } = fixture();
    const a = pool.acquire("frame", 30, () => ({}));
    const b = pool.acquire("frame", 30, () => ({}));
    expect(a.value).not.toBe(b.value);
    a.release();
    const create = vi.fn(() => ({}));
    const c = pool.acquire("frame", 30, create);
    expect(c.value).toBe(a.value);
    expect(create).not.toHaveBeenCalled();
    b.release(); c.release(); pool.dispose();
  });
  it("refuses over-budget allocation before calling the GPU allocator", () => {
    const { pool } = fixture();
    const a = pool.acquire("large", 90, () => ({}));
    const create = vi.fn(() => ({}));
    expect(() => pool.acquire("next", 11, create)).toThrow(/budget/);
    expect(create).not.toHaveBeenCalled();
    a.release();
    expect(pool.snapshot().activeBytes).toBe(0);
    expect(pool.snapshot().idleBytes).toBe(0);
  });
  it("evicts idle resources before allocation and bounds retained memory", () => {
    const { pool, dispose } = fixture();
    const a = pool.acquire("a", 30, () => ({})); a.release();
    const b = pool.acquire("b", 30, () => ({})); b.release();
    const c = pool.acquire("c", 60, () => ({}));
    expect(dispose).toHaveBeenCalledWith(a.value);
    c.release();
    expect(dispose).toHaveBeenCalledWith(b.value);
    expect(pool.snapshot()).toMatchObject({ activeBytes: 0, idleBytes: 60, idleCount: 1 });
  });
  it("defers disposal of active buffers until their GPU fence is released", () => {
    const { pool, dispose } = fixture();
    const a = pool.acquire("pending", 30, () => ({}));
    const b = pool.acquire("idle", 30, () => ({})); b.release();
    pool.dispose(); pool.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(b.value);
    expect(() => pool.acquire("closed", 1, () => ({}))).toThrow(/disposed/);
    a.release(); a.release();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(pool.snapshot()).toMatchObject({ activeBytes: 0, idleBytes: 0, closed: true });
  });
  it("discards failed resources rather than returning them to the warm pool", () => {
    const { pool, dispose } = fixture();
    const a = pool.acquire("failed", 30, () => ({})); a.release(true);
    expect(dispose).toHaveBeenCalledWith(a.value);
    expect(pool.snapshot().idleCount).toBe(0);
  });
  it("rolls back failed allocation and survives disposal errors", () => {
    const dispose = vi.fn(() => { throw new Error("lost device"); });
    const pool = createStudioScene3dResourcePool<object>({ maxBytes: 100,
      maxIdleBytes: 50, maxIdleEntries: 1, dispose });
    expect(() => pool.acquire("oom", 30, () => { throw new Error("oom"); })).toThrow("oom");
    expect(pool.snapshot().activeBytes).toBe(0);
    const lease = pool.acquire("allocated", 30, () => ({}));
    lease.release(true);
    expect(pool.snapshot()).toMatchObject({ activeCount: 0, disposalFailures: 1 });
  });
  it("validates unsafe byte counts and does not overflow on optional resources", () => {
    const { pool } = fixture();
    for (const bytes of [-1, 0, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => pool.acquire("bad", bytes, () => ({}))).toThrow(RangeError);
    }
    expect(() => createStudioScene3dResourcePool({ maxBytes: 5, maxIdleBytes: 6,
      maxIdleEntries: 1, dispose() {} })).toThrow(RangeError);
  });
  it("cleans up a resource if its pool is closed inside the allocator", () => {
    const { pool, dispose } = fixture(); const value = {};
    expect(() => pool.acquire("race", 30, () => { pool.dispose(); return value; }))
      .toThrow(/disposed/);
    expect(dispose).toHaveBeenCalledWith(value);
    expect(pool.snapshot().activeBytes).toBe(0);
  });
});


it("does not retain a lease if an eviction callback closes the pool", () => {
  let close = () => {};
  const dispose = vi.fn(() => close());
  const pool = createStudioScene3dResourcePool<object>({ maxBytes: 100,
    maxIdleBytes: 30, maxIdleEntries: 1, dispose });
  const first = pool.acquire("first", 30, () => ({}));
  const second = pool.acquire("second", 30, () => ({}));
  first.release(); close = () => pool.dispose(); second.release();
  expect(pool.snapshot()).toMatchObject({ activeCount: 0, idleCount: 0, idleBytes: 0, closed: true });
  expect(dispose).toHaveBeenCalledTimes(2);
});
