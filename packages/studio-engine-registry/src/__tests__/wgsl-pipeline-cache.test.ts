import { describe, expect, it, vi } from "vitest";

import {
  WgslPipelineCompileError,
  WgslPipelineInvalidatedError,
  WgslPipelineKeyCollisionError,
  WgslPipelineKilledError,
  createWgslPipelineCache,
  createWgslWebGpuPipelineCompiler,
  estimateWgslPipelineRetainedBytes,
} from "../wgsl-pipeline-cache";
import { composeWgslVariant } from "../wgsl-variants";

import type { ComposedWgslVariant } from "../wgsl-variants";

interface FakePipeline {
  readonly id: number;
  readonly key: string;
}

function brightness(value: number): ComposedWgslVariant {
  return composeWgslVariant([
    { op: "brightness-contrast", brightness: value },
  ]);
}

function hsl(value: number): ComposedWgslVariant {
  return composeWgslVariant([{ op: "hsl", hue: value }]);
}

function levels(): ComposedWgslVariant {
  const table = Uint8Array.from({ length: 256 }, (_, index) => index);
  return composeWgslVariant([
    { op: "levels", lut: { r: table, g: table, b: table } },
  ]);
}

function compiler() {
  let id = 0;
  const compile = vi.fn((variant: ComposedWgslVariant): FakePipeline => ({
    id: ++id,
    key: variant.variantKey,
  }));
  return compile;
}

describe("WgslPipelineCache value/structure identity", () => {
  it("reuses one compiled pipeline for value-only changes", async () => {
    const compile = compiler();
    const cache = createWgslPipelineCache({
      maxEntries: 8,
      maxEstimatedBytes: 1_000_000,
      compile,
    });
    const low = brightness(-0.4);
    const high = brightness(0.7);
    expect(low.variantKey).toBe(high.variantKey);

    const first = await cache.getOrCompile(low);
    const second = await cache.getOrCompile(high);

    expect(second).toBe(first);
    expect(compile).toHaveBeenCalledTimes(1);
    expect(cache.stats()).toMatchObject({
      requests: 2,
      hits: 1,
      misses: 1,
      compileAttempts: 1,
      entries: 1,
    });
  });

  it("maps structural changes to distinct keys and pipelines", async () => {
    const compile = compiler();
    const cache = createWgslPipelineCache({
      maxEntries: 8,
      maxEstimatedBytes: 1_000_000,
      compile,
    });
    const brightnessOnly = brightness(0.2);
    const brightnessAndContrast = composeWgslVariant([
      { op: "brightness-contrast", brightness: 0.2, contrast: 10 },
    ]);

    const first = await cache.getOrCompile(brightnessOnly);
    const second = await cache.getOrCompile(brightnessAndContrast);

    expect(brightnessOnly.variantKey).not.toBe(brightnessAndContrast.variantKey);
    expect(second).not.toBe(first);
    expect(compile).toHaveBeenCalledTimes(2);
    expect(cache.stats().entries).toBe(2);
  });

  it("rejects a caller-supplied source collision for an occupied variantKey", async () => {
    const cache = createWgslPipelineCache({
      maxEntries: 2,
      maxEstimatedBytes: 1_000_000,
      compile: compiler(),
    });
    const variant = brightness(0.2);
    await cache.getOrCompile(variant);
    const corrupt = {
      ...variant,
      wgsl: `${variant.wgsl}\n// corrupt source collision`,
    };
    await expect(cache.getOrCompile(corrupt)).rejects.toBeInstanceOf(
      WgslPipelineKeyCollisionError,
    );
  });
});

describe("WgslPipelineCache bounded LRU", () => {
  it("refreshes recency on a hit and evicts the least-recently-used entry", async () => {
    const disposed: Array<[number, string]> = [];
    const cache = createWgslPipelineCache<FakePipeline>({
      maxEntries: 2,
      maxEstimatedBytes: 1_000,
      compile: compiler(),
      estimateBytes: () => 10,
      dispose: (pipeline, reason) => disposed.push([pipeline.id, reason]),
    });
    const a = brightness(0.2);
    const b = hsl(30);
    const c = levels();
    const pipelineA = await cache.getOrCompile(a);
    const pipelineB = await cache.getOrCompile(b);
    await cache.getOrCompile(a);
    await cache.getOrCompile(c);

    expect(cache.has(a.variantKey)).toBe(true);
    expect(cache.has(b.variantKey)).toBe(false);
    expect(cache.has(c.variantKey)).toBe(true);
    expect(disposed).toContainEqual([pipelineB.id, "evicted"]);
    expect(disposed).not.toContainEqual([pipelineA.id, "evicted"]);
    expect(cache.stats()).toMatchObject({ entries: 2, estimatedBytes: 20, evictions: 1 });
  });

  it("enforces the byte budget independently from the entry budget", async () => {
    const cache = createWgslPipelineCache({
      maxEntries: 10,
      maxEstimatedBytes: 25,
      compile: compiler(),
      estimateBytes: () => 10,
    });
    const a = brightness(0.2);
    const b = hsl(30);
    const c = levels();
    await cache.getOrCompile(a);
    await cache.getOrCompile(b);
    await cache.getOrCompile(c);

    expect(cache.has(a.variantKey)).toBe(false);
    expect(cache.stats()).toMatchObject({ entries: 2, estimatedBytes: 20, evictions: 1 });
  });

  it("returns but does not retain a pipeline larger than the byte budget", async () => {
    const compile = compiler();
    const cache = createWgslPipelineCache({
      maxEntries: 2,
      maxEstimatedBytes: 9,
      compile,
      estimateBytes: () => 10,
    });
    const variant = brightness(0.2);
    const first = await cache.getOrCompile(variant);
    const second = await cache.getOrCompile(variant);

    expect(first).not.toBe(second);
    expect(compile).toHaveBeenCalledTimes(2);
    expect(cache.stats()).toMatchObject({ entries: 0, oversizedBypasses: 2 });
  });

  it("uses a deterministic positive source-aware default estimate", () => {
    const oneStage = estimateWgslPipelineRetainedBytes(brightness(0.2));
    const twoStages = estimateWgslPipelineRetainedBytes(
      composeWgslVariant([
        { op: "brightness-contrast", brightness: 0.2 },
        { op: "hsl", hue: 30 },
      ]),
    );
    expect(oneStage).toBeGreaterThan(16 * 1024);
    expect(twoStages).toBeGreaterThan(oneStage);
  });
});

describe("WgslPipelineCache concurrency and recovery", () => {
  it("deduplicates every concurrent request onto one in-flight compile", async () => {
    let release!: (pipeline: FakePipeline) => void;
    const deferred = new Promise<FakePipeline>((resolve) => {
      release = resolve;
    });
    const compile = vi.fn(() => deferred);
    const cache = createWgslPipelineCache({
      maxEntries: 4,
      maxEstimatedBytes: 1_000_000,
      compile,
    });
    const variant = brightness(0.2);
    const requests = Array.from({ length: 32 }, () => cache.getOrCompile(variant));
    await Promise.resolve();
    expect(compile).toHaveBeenCalledTimes(1);
    release({ id: 1, key: variant.variantKey });

    const pipelines = await Promise.all(requests);
    expect(new Set(pipelines).size).toBe(1);
    expect(cache.stats()).toMatchObject({
      requests: 32,
      misses: 1,
      inFlightHits: 31,
      compileAttempts: 1,
    });
  });

  it("does not cache a rejected compile and succeeds on the next request", async () => {
    let attempts = 0;
    const cache = createWgslPipelineCache<FakePipeline>({
      maxEntries: 2,
      maxEstimatedBytes: 1_000_000,
      compile: (variant) => {
        attempts += 1;
        if (attempts === 1) throw new Error("transient driver failure");
        return { id: attempts, key: variant.variantKey };
      },
    });
    const variant = brightness(0.2);

    await expect(cache.getOrCompile(variant)).rejects.toThrow("transient driver failure");
    await expect(cache.getOrCompile(variant)).resolves.toMatchObject({ id: 2 });
    expect(cache.stats()).toMatchObject({
      compileAttempts: 2,
      compileFailures: 1,
      entries: 1,
    });
  });

  it("rejects and discards a compile that finishes after invalidation", async () => {
    let release!: (pipeline: FakePipeline) => void;
    const deferred = new Promise<FakePipeline>((resolve) => {
      release = resolve;
    });
    const disposed: string[] = [];
    const cache = createWgslPipelineCache<FakePipeline>({
      maxEntries: 2,
      maxEstimatedBytes: 1_000_000,
      compile: () => deferred,
      dispose: (_pipeline, reason) => disposed.push(reason),
    });
    const variant = brightness(0.2);
    const pending = cache.getOrCompile(variant);
    await Promise.resolve();
    expect(cache.invalidate(variant.variantKey, "shader hot reload")).toBe(true);
    release({ id: 1, key: variant.variantKey });

    await expect(pending).rejects.toBeInstanceOf(WgslPipelineInvalidatedError);
    expect(cache.has(variant.variantKey)).toBe(false);
    expect(disposed).toContain("compile-invalidated");
  });

  it("prevents an in-flight compile from repopulating a disposed cache", async () => {
    let release!: (pipeline: FakePipeline) => void;
    const deferred = new Promise<FakePipeline>((resolve) => {
      release = resolve;
    });
    const cache = createWgslPipelineCache<FakePipeline>({
      maxEntries: 2,
      maxEstimatedBytes: 1_000_000,
      compile: () => deferred,
    });
    const variant = brightness(0.2);
    const pending = cache.getOrCompile(variant);
    await Promise.resolve();
    cache.dispose();
    release({ id: 1, key: variant.variantKey });

    await expect(pending).rejects.toBeInstanceOf(WgslPipelineInvalidatedError);
    expect(cache.stats()).toMatchObject({ entries: 0, inFlight: 0 });
    await expect(cache.getOrCompile(variant)).rejects.toThrow("cache is disposed");
  });
});

describe("WgslPipelineCache kill and remote invalidation", () => {
  it("evicts and blocks a killed key until it is explicitly revived", async () => {
    const compile = compiler();
    const cache = createWgslPipelineCache({
      maxEntries: 4,
      maxEstimatedBytes: 1_000_000,
      compile,
    });
    const variant = brightness(0.2);
    await cache.getOrCompile(variant);
    cache.kill(variant.variantKey, "driver regression 1842");

    expect(cache.has(variant.variantKey)).toBe(false);
    await expect(cache.getOrCompile(variant)).rejects.toMatchObject({
      name: "WgslPipelineKilledError",
      reason: "driver regression 1842",
    });
    expect(cache.revive(variant.variantKey)).toBe(true);
    await expect(cache.getOrCompile(variant)).resolves.toMatchObject({ id: 2 });
  });

  it("applies monotonic remote kill snapshots and one-shot invalidations", async () => {
    const compile = compiler();
    const cache = createWgslPipelineCache({
      maxEntries: 4,
      maxEstimatedBytes: 1_000_000,
      compile,
    });
    const killed = brightness(0.2);
    const invalidated = hsl(30);
    await cache.getOrCompile(killed);
    await cache.getOrCompile(invalidated);

    const receipt = cache.applyRemoteControl({
      revision: 7,
      killed: [{ variantKey: killed.variantKey, reason: "remote crash rate" }],
      invalidate: [
        { variantKey: invalidated.variantKey, reason: "driver rollout changed" },
      ],
    });
    expect(receipt).toEqual({
      applied: true,
      revision: 7,
      newlyKilled: [killed.variantKey],
      revived: [],
      invalidated: [invalidated.variantKey],
    });
    await expect(cache.getOrCompile(killed)).rejects.toBeInstanceOf(
      WgslPipelineKilledError,
    );
    await expect(cache.getOrCompile(invalidated)).resolves.toMatchObject({ id: 3 });

    expect(
      cache.applyRemoteControl({ revision: 6, killed: [], invalidate: [] }),
    ).toMatchObject({ applied: false, revision: 7 });
    expect(cache.isKilled(killed.variantKey)).toBe(true);

    expect(
      cache.applyRemoteControl({ revision: 8, killed: [] }),
    ).toMatchObject({
      applied: true,
      revived: [killed.variantKey],
    });
    await expect(cache.getOrCompile(killed)).resolves.toMatchObject({ id: 4 });
  });

  it("rejects malformed or duplicate remote control entries", () => {
    const cache = createWgslPipelineCache({
      maxEntries: 2,
      maxEstimatedBytes: 1_000,
      compile: compiler(),
    });
    expect(() => cache.applyRemoteControl({ revision: -1, killed: [] })).toThrow(
      RangeError,
    );
    expect(() =>
      cache.applyRemoteControl({
        revision: 1,
        killed: [
          { variantKey: "same", reason: "a" },
          { variantKey: "same", reason: "b" },
        ],
      }),
    ).toThrow(/duplicate variantKey/);
  });
});

describe("createWgslWebGpuPipelineCompiler", () => {
  it("checks diagnostics and prefers asynchronous pipeline creation", async () => {
    const module = {
      getCompilationInfo: vi.fn(async () => ({ messages: [] })),
    };
    const pipeline = { id: 1, key: "gpu" };
    const device = {
      createShaderModule: vi.fn(() => module),
      createComputePipelineAsync: vi.fn(async () => pipeline),
    };
    const variant = brightness(0.2);
    const compile = createWgslWebGpuPipelineCompiler(device);
    const result = await compile(variant, { signal: new AbortController().signal });

    expect(result).toBe(pipeline);
    expect(device.createShaderModule).toHaveBeenCalledWith({
      label: variant.shaderId,
      code: variant.wgsl,
    });
    expect(device.createComputePipelineAsync).toHaveBeenCalledWith({
      label: variant.shaderId,
      layout: "auto",
      compute: { module, entryPoint: variant.entryPoint },
    });
  });

  it("surfaces shader diagnostics and never creates a failed pipeline", async () => {
    const createComputePipelineAsync = vi.fn();
    const compile = createWgslWebGpuPipelineCompiler({
      createShaderModule: () => ({
        getCompilationInfo: async () => ({
          messages: [
            { type: "error", message: "expected expression", lineNum: 12, linePos: 4 },
          ],
        }),
      }),
      createComputePipelineAsync,
    });

    await expect(
      compile(brightness(0.2), { signal: new AbortController().signal }),
    ).rejects.toMatchObject({
      name: WgslPipelineCompileError.name,
      message: expect.stringContaining("12:4"),
    });
    expect(createComputePipelineAsync).not.toHaveBeenCalled();
  });
});
