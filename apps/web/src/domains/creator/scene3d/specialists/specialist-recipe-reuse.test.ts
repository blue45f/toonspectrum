import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createSpecialistRecipeIdentity,
  SpecialistRecipeReuseCache,
} from "./specialist-recipe-reuse";
import type {
  SpecialistRequest,
  SpecialistResult,
} from "./specialist-contract";

export const testDigest = (bytes: Uint8Array): string =>
  "sha256:" + createHash("sha256").update(bytes).digest("hex");
function request(value = 0): SpecialistRequest {
  const source = new Uint8Array(24);
  source[0] = value;
  return {
    version: 1,
    id: value + 1,
    source: source.buffer,
    options: { kind: "compress" },
  };
}
export function recipeResult(
  input: SpecialistRequest,
  size = 24,
): SpecialistResult {
  const bytes = new Uint8Array(size);
  bytes[0] = 17;
  return {
    version: 1,
    operation: input.options.kind,
    sourceSha256: testDigest(new Uint8Array(input.source)),
    before: {
      triangles: 1,
      vertices: 3,
      nodes: 1,
      animations: 0,
      animationKeys: 0,
      tangentPrimitives: 0,
    },
    artifacts: [
      {
        name: "derived.glb",
        mime: "model/gltf-binary",
        bytes,
        sha256: testDigest(bytes),
      },
    ],
    sourceNodeNames: ["source-node"],
    warnings: ["Review before applying"],
    provenance: { fixture: "test-only" },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("specialist recipe identity", () => {
  it("uses normalized defaults and canonical property ordering, not job id or object identity", async () => {
    const a = {
      ...request(),
      options: { kind: "release" },
    } as SpecialistRequest;
    const b = {
      ...request(),
      id: 99,
      options: {
        error: 0.01,
        maxTextureSize: 2048,
        textureMode: "uastc",
        kind: "release",
      },
    } as SpecialistRequest;
    expect(await createSpecialistRecipeIdentity(a)).toEqual(
      await createSpecialistRecipeIdentity(b),
    );
  });
  it("separates different input bytes, operation options and runtime versions", async () => {
    const a = request();
    const one = await createSpecialistRecipeIdentity(a);
    const two = await createSpecialistRecipeIdentity(request(1));
    const three = await createSpecialistRecipeIdentity({
      ...a,
      options: { kind: "lod", error: 0.01 },
    });
    const four = await createSpecialistRecipeIdentity({
      ...a,
      options: { kind: "lod", error: 0.02 },
    });
    const five = await createSpecialistRecipeIdentity(a, {
      revision: "runtime-v2",
    });
    expect(
      new Set([one.key, two.key, three.key, four.key, five.key]).size,
    ).toBe(5);
  });
  it("includes CSG operand order and the second source but ignores unrelated secondary input", async () => {
    const a = request(1);
    const b = request(2);
    const plain = await createSpecialistRecipeIdentity(a);
    expect(
      await createSpecialistRecipeIdentity({ ...a, secondary: b.source }),
    ).toEqual(plain);
    const csg = {
      ...a,
      secondary: b.source,
      options: { kind: "csg", operation: "subtract", backend: "solid" },
    } as SpecialistRequest;
    const first = await createSpecialistRecipeIdentity(csg);
    const swapped = await createSpecialistRecipeIdentity({
      ...csg,
      source: b.source,
      secondary: a.source,
    });
    const changed = await createSpecialistRecipeIdentity({
      ...csg,
      secondary: request(3).source,
    });
    expect(new Set([first.key, swapped.key, changed.key]).size).toBe(3);
    expect(first.secondarySha256).toBe(testDigest(new Uint8Array(b.source)));
  });
});

describe("bounded verified ephemeral recipe results", () => {
  it("executes once and returns independent verified bytes and metadata on every hit", async () => {
    const cache = new SpecialistRecipeReuseCache();
    const source = request();
    const original = recipeResult(source);
    const execute = vi.fn(async () => original);
    const first = await cache.run(source, { execute });
    first.result.artifacts[0]!.bytes.fill(255);
    (first.result.sourceNodeNames as string[])[0] = "caller-mutated";
    const second = await cache.run({ ...source, id: 7 }, { execute });
    expect(second.reused).toBe(true);
    expect(execute).toHaveBeenCalledOnce();
    expect(second.result.artifacts[0]!.bytes[0]).toBe(17);
    expect(second.result.sourceNodeNames).toEqual(["source-node"]);
    expect(testDigest(second.result.artifacts[0]!.bytes)).toBe(
      second.result.artifacts[0]!.sha256,
    );
    second.result.artifacts[0]!.bytes.fill(88);
    expect(
      (await cache.run(source, { execute })).result.artifacts[0]!.bytes[0],
    ).toBe(17);
    expect(cache.snapshot()).toMatchObject({ entries: 1, hits: 2 });
  });
  it("does not retain a huge hidden backing buffer for a small admitted artifact view", async () => {
    const cache = new SpecialistRecipeReuseCache({
      limits: { maxBytes: 4096, maxEntryBytes: 4096 },
    });
    const source = request();
    const metadata = recipeResult(source);
    const large = new Uint8Array(1024 * 1024);
    large.fill(21);
    const view = large.subarray(100, 124);
    const execute = vi.fn(async () => ({
      ...metadata,
      artifacts: [
        { ...metadata.artifacts[0]!, bytes: view, sha256: testDigest(view) },
      ],
    }));
    await cache.run(source, { execute });
    const next = await cache.run(source, { execute });
    expect(next.reused).toBe(true);
    expect(next.result.artifacts[0]!.bytes.buffer.byteLength).toBe(24);
    expect(cache.snapshot().bytes).toBeLessThan(4096);
  });
  it("evicts least recently used entries and enforces independent entry-count limits", async () => {
    const cache = new SpecialistRecipeReuseCache({ limits: { maxEntries: 2 } });
    const a = request(1);
    const b = request(2);
    const c = request(3);
    const executeA = vi.fn(async () => recipeResult(a));
    const executeB = vi.fn(async () => recipeResult(b));
    await cache.run(a, { execute: executeA });
    await cache.run(b, { execute: executeB });
    await cache.run(a, { execute: executeA });
    await cache.run(c, { execute: async () => recipeResult(c) });
    expect((await cache.run(a, { execute: executeA })).reused).toBe(true);
    expect((await cache.run(b, { execute: executeB })).reused).toBe(false);
    expect(executeA).toHaveBeenCalledOnce();
    expect(executeB).toHaveBeenCalledTimes(2);
    expect(cache.snapshot().entries).toBe(2);
  });
  it("enforces aggregate bytes and bypasses oversized single results without invalidating output", async () => {
    const cache = new SpecialistRecipeReuseCache({
      limits: { maxBytes: 1800, maxEntryBytes: 1400 },
    });
    for (const value of [1, 2, 3])
      await cache.run(request(value), {
        execute: async () => recipeResult(request(value), 700),
      });
    expect(cache.snapshot().bytes).toBeLessThanOrEqual(1800);
    expect(cache.snapshot().entries).toBe(1);
    const execute = vi.fn(async () => recipeResult(request(9), 1500));
    expect((await cache.run(request(9), { execute })).reused).toBe(false);
    expect((await cache.run(request(9), { execute })).reused).toBe(false);
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("expires by age rather than extending TTL indefinitely on every hit", async () => {
    let clock = 100;
    const cache = new SpecialistRecipeReuseCache({
      clock: () => clock,
      limits: { ttlMs: 10 },
    });
    const source = request();
    const execute = vi.fn(async () => recipeResult(source));
    await cache.run(source, { execute });
    clock = 109;
    expect((await cache.run(source, { execute })).reused).toBe(true);
    clock = 110;
    expect(cache.snapshot().entries).toBe(0);
    expect((await cache.run(source, { execute })).reused).toBe(false);
    clock = 50;
    expect(cache.snapshot().entries).toBe(0);
  });
  it("does not cache rejected work or misidentified source results", async () => {
    const cache = new SpecialistRecipeReuseCache();
    const execute = vi.fn(async () => {
      throw new Error("worker failure");
    });
    for (let i = 0; i < 2; i++)
      await expect(cache.run(request(), { execute })).rejects.toThrow(
        "worker failure",
      );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(cache.snapshot().entries).toBe(0);
    await expect(
      cache.run(request(), { execute: async () => recipeResult(request(1)) }),
    ).rejects.toThrow("does not belong");
    expect(cache.snapshot().entries).toBe(0);
  });
  it("rejects corrupted artifact bytes before they can populate reuse storage", async () => {
    const cache = new SpecialistRecipeReuseCache();
    const result = recipeResult(request());
    result.artifacts[0]!.bytes[0] ^= 1;
    await expect(
      cache.run(request(), { execute: async () => result }),
    ).rejects.toThrow("SHA-256 verification");
    expect(cache.snapshot().entries).toBe(0);
  });
  it("does not cache metadata that exceeds its separate budget", async () => {
    const cache = new SpecialistRecipeReuseCache({
      limits: { maxMetadataBytes: 100 },
    });
    const execute = vi.fn(async () => recipeResult(request()));
    await cache.run(request(), { execute });
    await cache.run(request(), { execute });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(cache.snapshot().entries).toBe(0);
  });
  it("runs existing processing without reuse when hashing is unavailable or input is too large", async () => {
    const execute = vi.fn(async () => recipeResult(request()));
    const digest = vi.fn(async () => {
      throw new Error("No crypto");
    });
    const unavailable = new SpecialistRecipeReuseCache({ digest });
    await unavailable.run(request(), { execute });
    expect(unavailable.snapshot().entries).toBe(0);
    const oversized = new SpecialistRecipeReuseCache({
      digest,
      limits: { maxSourceBytes: 23 },
    });
    await oversized.run(request(), { execute });
    expect(digest).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("returns uncached processing output if optional cache integrity hashing fails", async () => {
    let calls = 0;
    const cache = new SpecialistRecipeReuseCache({
      digest: async (bytes) => {
        if (++calls === 3) throw new Error("Native digest failed");
        return testDigest(bytes);
      },
    });
    const result = await cache.run(request(), {
      execute: async () => recipeResult(request()),
    });
    expect(result.reused).toBe(false);
    expect(cache.snapshot().entries).toBe(0);
  });
  it("clearing during native hashing cannot resurrect entries or reuse pre-clear results", async () => {
    const pending = deferred<string>();
    let calls = 0;
    const cache = new SpecialistRecipeReuseCache({
      digest: (bytes) =>
        ++calls === 1 ? pending.promise : Promise.resolve(testDigest(bytes)),
    });
    const source = request();
    const execute = vi.fn(async () => recipeResult(source));
    const job = cache.run(source, { execute });
    cache.clear();
    pending.resolve(testDigest(new Uint8Array(source.source)));
    expect((await job).reused).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
    expect(cache.snapshot()).toMatchObject({ entries: 0, bytes: 0, epoch: 1 });
  });
  it("clearing during a Worker job still returns its valid result but does not repopulate memory", async () => {
    const cache = new SpecialistRecipeReuseCache();
    const pending = deferred<SpecialistResult>();
    const execute = vi.fn(() => pending.promise);
    const job = cache.run(request(), { execute });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    cache.clear();
    pending.resolve(recipeResult(request()));
    await job;
    expect(cache.snapshot()).toMatchObject({ entries: 0, bytes: 0 });
  });
  it("observes cancellation after native hashing settles and never starts its Worker", async () => {
    const pending = deferred<string>();
    const abort = new AbortController();
    const source = request();
    const cache = new SpecialistRecipeReuseCache({
      digest: () => pending.promise,
    });
    const execute = vi.fn(async () => recipeResult(source));
    const job = cache.run(source, { signal: abort.signal, execute });
    const rejected = expect(job).rejects.toMatchObject({ code: "cancelled" });
    abort.abort();
    expect(execute).not.toHaveBeenCalled();
    pending.resolve(testDigest(new Uint8Array(source.source)));
    await rejected;
    expect(cache.snapshot().entries).toBe(0);
  });
  it("does not store a result after its Worker was cancelled", async () => {
    const cache = new SpecialistRecipeReuseCache();
    const abort = new AbortController();
    await expect(
      cache.run(request(), {
        signal: abort.signal,
        execute: async () => {
          abort.abort();
          return recipeResult(request());
        },
      }),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(cache.snapshot().entries).toBe(0);
  });
  it("validates limits and isolates faulty progress observers", async () => {
    expect(
      () => new SpecialistRecipeReuseCache({ limits: { maxEntries: 0 } }),
    ).toThrow();
    expect(
      () => new SpecialistRecipeReuseCache({ limits: { maxBytes: 1 } }),
    ).toThrow();
    const cache = new SpecialistRecipeReuseCache();
    await expect(
      cache.run(request(), {
        execute: async () => recipeResult(request()),
        onCheck: () => {
          throw new Error("UI");
        },
      }),
    ).resolves.toMatchObject({ reused: false });
  });
});

it("does not repopulate a cleared cache after an output digest already in flight completes", async () => {
  const pending = deferred<string>();
  let calls = 0;
  const source = request();
  const output = recipeResult(source);
  const cache = new SpecialistRecipeReuseCache({
    digest: (bytes) =>
      ++calls === 3 ? pending.promise : Promise.resolve(testDigest(bytes)),
  });
  const run = cache.run(source, { execute: async () => output });
  await vi.waitFor(() => expect(calls).toBe(3));
  cache.clear();
  pending.resolve(output.artifacts[0]!.sha256);
  await run;
  expect(cache.snapshot()).toMatchObject({ entries: 0, bytes: 0, epoch: 1 });
});
it("rejects cancellation triggered while checking a warm result before returning any bytes", async () => {
  const source = request();
  const cache = new SpecialistRecipeReuseCache();
  const execute = vi.fn(async () => recipeResult(source));
  await cache.run(source, { execute });
  const abort = new AbortController();
  await expect(
    cache.run(source, {
      signal: abort.signal,
      execute,
      onCheck: () => abort.abort(),
    }),
  ).rejects.toMatchObject({ code: "cancelled" });
  expect(execute).toHaveBeenCalledOnce();
  expect(cache.snapshot().hits).toBe(0);
});


it("suspends reuse/retention after page departure without preventing processing, then resumes from an empty cache", async () => {
  const cache = new SpecialistRecipeReuseCache(); const source = request();
  const execute = vi.fn(async () => recipeResult(source));
  await cache.run(source, { execute }); cache.suspend();
  await cache.run(source, { execute }); await cache.run(source, { execute });
  expect(execute).toHaveBeenCalledTimes(3); expect(cache.snapshot().entries).toBe(0);
  cache.resume(); await cache.run(source, { execute });
  expect((await cache.run(source, { execute })).reused).toBe(true); expect(execute).toHaveBeenCalledTimes(4);
});
it("a departed and resumed page cannot retain an old in-flight result", async () => {
  const cache = new SpecialistRecipeReuseCache(); const pending = deferred<SpecialistResult>();
  const execute = vi.fn(() => pending.promise); const job = cache.run(request(), { execute });
  await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
  cache.suspend(); cache.resume(); pending.resolve(recipeResult(request())); await job;
  expect(cache.snapshot().entries).toBe(0);
});
