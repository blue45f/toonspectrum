import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const runtimePath = "src/domains/creator/render/studio-engine-webgpu-textured-brush-runtime.ts";
const testPath = "src/domains/creator/render/studio-engine-webgpu-textured-brush-runtime.test.ts";
const workflowPath = ".github/workflows/apply-webgpu-texture-residency-20260904.yml";
const scriptPath = fileURLToPath(import.meta.url);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Ambiguous patch anchor: ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let runtime = readFileSync(runtimePath, "utf8");
runtime = replaceOnce(
  runtime,
  `interface AssetTexture {
  readonly key: string;
  readonly role: "tip" | "grain" | "dummy-grain";
  readonly byteLength: number;
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly width: number;
  readonly height: number;
}
`,
  `interface AssetTexture {
  readonly key: string;
  readonly role: "tip" | "grain" | "dummy-grain";
  readonly byteLength: number;
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly width: number;
  readonly height: number;
}

interface CachedBindGroup {
  readonly bindGroup: GPUBindGroup;
  readonly assetKeys: readonly string[];
}
`,
  "cached bind-group contract",
);
runtime = replaceOnce(
  runtime,
  `  readonly #assetTextures = new Map<string, AssetTexture>();
  readonly #bindGroups = new Map<string, GPUBindGroup>();`,
  `  readonly #assetTextures = new Map<string, AssetTexture>();
  readonly #bindGroups = new Map<string, CachedBindGroup>();`,
  "bind-group cache type",
);
runtime = replaceOnce(
  runtime,
  `  #uploadAsset(
`,
  `  #touchAssetTexture(key: string, resource: AssetTexture): AssetTexture {
    this.#assetTextures.delete(key);
    this.#assetTextures.set(key, resource);
    return resource;
  }

  #dropBindGroupsReferencingAsset(assetKey: string): void {
    for (const [key, cached] of this.#bindGroups) {
      if (cached.assetKeys.includes(assetKey)) this.#bindGroups.delete(key);
    }
  }

  #reserveGenericAssetResidency(
    requiredAdditionalBytes: number,
    protectedKeys: ReadonlySet<string>,
  ): boolean {
    if (
      !Number.isSafeInteger(requiredAdditionalBytes)
      || requiredAdditionalBytes < 0
      || requiredAdditionalBytes > this.#maximumResidentAssetBytes
    ) return false;
    const fits = () => (
      this.#residentAssetBytes + requiredAdditionalBytes
      <= this.#maximumResidentAssetBytes
    );
    if (fits()) return true;
    /*
     * Bind groups capture texture views. Reclaim generic textures only while no execution can
     * still reference them; sequential long-session brush switches can then make progress without
     * invalidating submitted or queued GPU work.
     */
    if (this.#inFlight !== 0) return false;
    for (const [key, resource] of this.#assetTextures) {
      if (resource.role === "dummy-grain" || protectedKeys.has(key)) continue;
      this.#assetTextures.delete(key);
      this.#dropBindGroupsReferencingAsset(key);
      try {
        resource.texture.destroy();
      } catch {
        // Device loss may retire a resource concurrently; logical residency is still released.
      }
      this.#residentAssetBytes = Math.max(
        0,
        this.#residentAssetBytes - resource.byteLength,
      );
      if (fits()) return true;
    }
    return fits();
  }

  #uploadAsset(
`,
  "resident asset LRU methods",
);
runtime = replaceOnce(
  runtime,
  `    const cached = this.#assetTextures.get(key);
    if (cached) return cached;`,
  `    const cached = this.#assetTextures.get(key);
    if (cached) return this.#touchAssetTexture(key, cached);`,
  "asset recency touch",
);
runtime = replaceOnce(
  runtime,
  `      const cached = this.#bindGroups.get(key);
      if (cached) return cached;`,
  `      const cached = this.#bindGroups.get(key);
      if (cached) return cached.bindGroup;`,
  "cached bind-group read",
);
runtime = replaceOnce(
  runtime,
  `    if (!nativeR8Grain) this.#bindGroups.set(key, bindGroup);`,
  `    if (!nativeR8Grain) {
      this.#bindGroups.set(key, {
        bindGroup,
        assetKeys: [tip.key, grain!.key],
      });
    }`,
  "cached bind-group assets",
);
runtime = replaceOnce(
  runtime,
  `    const uncachedBytes = frame.plan.assets.reduce((total, asset) => {
      // A durable R8 asset is resident in the strict native cache, never duplicated in the
      // generic textured-asset cache.
      if (asset.assetIndex === nativeR8AssetIndex) return total;
      const role = asset.role;
      return total + (
        this.#assetTextures.has(assetTextureIdentity(asset, role))
          ? 0
          : asset.byteLength
      );
    }, 0);
    if (
      this.#residentAssetBytes + uncachedBytes > this.#maximumResidentAssetBytes
    ) {
      return Object.freeze({ status: "rejected", reason: "resident-asset-budget" });
    }`,
  `    const protectedGenericAssetKeys = new Set<string>();
    const uncachedGenericAssets = new Map<string, number>();
    for (const asset of frame.plan.assets) {
      // A durable R8 asset is resident in the strict native cache, never duplicated in the
      // generic textured-asset cache.
      if (asset.assetIndex === nativeR8AssetIndex) continue;
      const key = assetTextureIdentity(asset, asset.role);
      protectedGenericAssetKeys.add(key);
      if (!this.#assetTextures.has(key) && !uncachedGenericAssets.has(key)) {
        uncachedGenericAssets.set(key, asset.byteLength);
      }
    }
    const uncachedBytes = Array.from(uncachedGenericAssets.values()).reduce(
      (total, byteLength) => total + byteLength,
      0,
    );
    if (!this.#reserveGenericAssetResidency(
      uncachedBytes,
      protectedGenericAssetKeys,
    )) {
      return Object.freeze({ status: "rejected", reason: "resident-asset-budget" });
    }`,
  "resident asset admission",
);
writeFileSync(runtimePath, runtime);

let test = readFileSync(testPath, "utf8");
test = replaceOnce(
  test,
  `function runtime(harness: FakeGpuHarness, overrides = {}) {`,
  `function texturedPlanWithTip(
  assetId: string,
  values: readonly number[],
): StudioEngineWebGpuTexturedBrushPlan {
  if (values.length !== 4) throw new RangeError("test tip must remain 2x2");
  const base = texturedPlan();
  const bytes = new Uint8Array(values);
  return texturedPlan({
    assets: [{
      ...base.assets[0]!,
      assetId,
      contentHash: \`sha256:\${sha256HexPortable(bytes)}\`,
      byteLength: bytes.byteLength,
      bytes,
    }],
    batches: [{
      ...base.batches[0]!,
      key: assetId + "|none|source-over",
    }],
  });
}

function runtime(harness: FakeGpuHarness, overrides = {}) {`,
  "test plan helper",
);
test = replaceOnce(
  test,
  `  it("rejects cancellation, stale request/device epochs and resident asset overflow", async () => {`,
  `  it("reclaims least-recently-used idle textures during long brush-switch sessions", async () => {
    const harness = fakeGpuHarness();
    const target = runtime(harness, { maximumResidentAssetBytes: 8 });
    const planA = texturedPlanWithTip("tip-a", [0, 32, 128, 255]);
    const planB = texturedPlanWithTip("tip-b", [255, 128, 32, 0]);
    const planC = texturedPlanWithTip("tip-c", [0, 255, 64, 192]);
    const tipTextures = () => harness.textures.filter((texture) => (
      String(texture.descriptor.label).startsWith("Studio textured brush tip ")
    ));
    const textureFor = (plan: StudioEngineWebGpuTexturedBrushPlan) => (
      tipTextures().find((texture) => (
        String(texture.descriptor.label).includes(plan.assets[0]!.contentHash)
      ))
    );

    expect((await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: planA,
    })).status).toBe("completed");
    expect((await target.execute({
      requestSequence: 2,
      deviceEpoch: 1,
      plan: planB,
    })).status).toBe("completed");
    const textureA = textureFor(planA)!;
    const textureB = textureFor(planB)!;
    expect(tipTextures()).toHaveLength(2);

    expect((await target.execute({
      requestSequence: 3,
      deviceEpoch: 1,
      plan: planC,
    })).status).toBe("completed");
    const textureC = textureFor(planC)!;
    expect(textureA.destroy).toHaveBeenCalledTimes(1);
    expect(textureB.destroy).not.toHaveBeenCalled();
    expect(textureC.destroy).not.toHaveBeenCalled();
    expect(tipTextures()).toHaveLength(3);
    expect(harness.bindGroupDescriptors).toHaveLength(3);

    const texturesBeforeBReplay = tipTextures().length;
    expect((await target.execute({
      requestSequence: 4,
      deviceEpoch: 1,
      plan: planB,
    })).status).toBe("completed");
    expect(tipTextures()).toHaveLength(texturesBeforeBReplay);
    expect(harness.bindGroupDescriptors).toHaveLength(3);

    expect((await target.execute({
      requestSequence: 5,
      deviceEpoch: 1,
      plan: planA,
    })).status).toBe("completed");
    expect(textureC.destroy).toHaveBeenCalledTimes(1);
    expect(textureB.destroy).not.toHaveBeenCalled();
    expect(tipTextures()).toHaveLength(texturesBeforeBReplay + 1);
    expect(harness.bindGroupDescriptors).toHaveLength(4);
  });

  it("does not evict a texture while submitted GPU work can still reference it", async () => {
    const gate = deferred<void>();
    const harness = fakeGpuHarness(() => gate.promise);
    const target = runtime(harness, {
      maximumInFlightSubmissions: 2,
      maximumResidentAssetBytes: 4,
    });
    const planA = texturedPlanWithTip("in-flight-a", [0, 64, 128, 255]);
    const planB = texturedPlanWithTip("in-flight-b", [255, 128, 64, 0]);
    const first = target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: planA,
    });
    await vi.waitFor(() => expect(harness.submitted).toHaveBeenCalledTimes(1));
    const textureA = harness.textures.find((texture) => (
      String(texture.descriptor.label).includes(planA.assets[0]!.contentHash)
    ))!;

    expect(await target.execute({
      requestSequence: 2,
      deviceEpoch: 1,
      plan: planB,
    })).toEqual({ status: "rejected", reason: "resident-asset-budget" });
    expect(textureA.destroy).not.toHaveBeenCalled();

    gate.resolve();
    expect((await first).status).toBe("completed");
    expect((await target.execute({
      requestSequence: 2,
      deviceEpoch: 1,
      plan: planB,
    })).status).toBe("completed");
    expect(textureA.destroy).toHaveBeenCalledTimes(1);
  });

  it("rejects cancellation, stale request/device epochs and resident asset overflow", async () => {`,
  "LRU residency tests",
);
writeFileSync(testPath, test);

rmSync(scriptPath);
rmSync(workflowPath);
