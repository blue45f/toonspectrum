import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const runtimePath = "src/domains/creator/render/studio-engine-webgpu-textured-brush-runtime.ts";
const testPath = "src/domains/creator/render/studio-engine-webgpu-textured-brush-runtime.test.ts";
const workflowPath = ".github/workflows/apply-webgpu-runtime-cache-v2-20260904.yml";
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
  `  #instanceBuffer: GPUBuffer | null = null;
  #instanceCapacity = 0;
  #residentAssetBytes = 0;`,
  `  #instanceBuffer: GPUBuffer | null = null;
  #instanceCapacity = 0;
  #instanceScratch: Float32Array | null = null;
  #residentAssetBytes = 0;`,
  "instance scratch field",
);
runtime = replaceOnce(
  runtime,
  `  #touchAssetTexture(key: string, resource: AssetTexture): AssetTexture {`,
  `  #ensureInstanceScratch(dabCount: number): Float32Array {
    const requiredFloats =
      dabCount * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS;
    if (
      this.#instanceScratch
      && this.#instanceScratch.length >= requiredFloats
    ) return this.#instanceScratch;
    let capacity = Math.min(256, this.#maximumDabs);
    while (capacity < dabCount) capacity = Math.min(this.#maximumDabs, capacity * 2);
    this.#instanceScratch = new Float32Array(
      capacity * STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_INSTANCE_FLOATS,
    );
    return this.#instanceScratch;
  }

  #touchAssetTexture(key: string, resource: AssetTexture): AssetTexture {`,
  "instance scratch allocator",
);
runtime = replaceOnce(
  runtime,
  `    const key = \`${"${batch.key}|${tip.key}|${grainKey}"}\`;`,
  `    // Bind groups depend only on captured GPU resources. A plan-local diagnostic batch key or
    // Porter-Duff pipeline change must not duplicate an otherwise identical texture binding.
    const key = \`${"${tip.key}|${grainKey}"}\`;`,
  "resource-only bind-group key",
);
runtime = replaceOnce(
  runtime,
  `      const packed = packStudioEngineWebGpuTexturedBrushDabs(
        frame.plan,
        undefined,
        nativeR8GrainLease ?? undefined,
      );`,
  `      const packed = packStudioEngineWebGpuTexturedBrushDabs(
        frame.plan,
        this.#ensureInstanceScratch(frame.plan.dabs.length),
        nativeR8GrainLease ?? undefined,
      );`,
  "instance scratch use",
);
runtime = replaceOnce(
  runtime,
  `    this.#instanceBuffer?.destroy();
    this.#uniformBuffer.destroy();`,
  `    this.#instanceBuffer?.destroy();
    this.#instanceScratch = null;
    this.#uniformBuffer.destroy();`,
  "instance scratch disposal",
);
writeFileSync(runtimePath, runtime);

let test = readFileSync(testPath, "utf8");
test = replaceOnce(
  test,
  `  it("does not evict a texture while submitted GPU work can still reference it", async () => {`,
  `  it("reuses content-addressed textures and bind groups across plan-local aliases", async () => {
    const harness = fakeGpuHarness();
    const target = runtime(harness);
    const values = [0, 32, 128, 255] as const;
    const planA = texturedPlanWithTip("alias-a", values);
    const planB = texturedPlanWithTip("alias-b", values);

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

    expect(harness.textures.filter((texture) => (
      String(texture.descriptor.label).startsWith("Studio textured brush tip ")
    ))).toHaveLength(1);
    expect(harness.bindGroupDescriptors).toHaveLength(1);
  });

  it("reuses the CPU dab staging allocation across sequential GPU submissions", async () => {
    const harness = fakeGpuHarness();
    const target = runtime(harness);

    expect((await target.execute({
      requestSequence: 1,
      deviceEpoch: 1,
      plan: texturedPlan(),
    })).status).toBe("completed");
    expect((await target.execute({
      requestSequence: 2,
      deviceEpoch: 1,
      plan: texturedPlan(),
    })).status).toBe("completed");

    const backingBuffers = harness.writeBuffer.mock.calls
      .filter((call) => (
        (call[0] as unknown as { descriptor?: GPUBufferDescriptor })
          .descriptor?.label === "Studio textured brush instance buffer"
      ))
      .map((call) => (
        (call[2] as unknown as Float32Array).buffer
      ));
    expect(backingBuffers).toHaveLength(2);
    expect(backingBuffers[0]).toBe(backingBuffers[1]);
  });

  it("does not evict a texture while submitted GPU work can still reference it", async () => {`,
  "cache reuse regression tests",
);
writeFileSync(testPath, test);

rmSync(scriptPath);
rmSync(workflowPath);
