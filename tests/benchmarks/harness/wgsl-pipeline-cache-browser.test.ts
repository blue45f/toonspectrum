import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  composeWgslVariant,
  identityWgslLut3,
} from "../../../packages/studio-engine-registry/src/wgsl-variants";

import {
  WGSL_PIPELINE_CACHE_BENCHMARK_SAMPLES,
  validateWgslPipelineCacheArtifact,
} from "./wgsl-pipeline-cache-browser";

import type { WgslFilterOpSpec } from "../../../packages/studio-engine-registry/src/wgsl-variants";

const RESULT_URL = new URL(
  "../results/wgsl-pipeline-cache.json",
  import.meta.url,
);

function readArtifact(): Record<string, any> {
  return JSON.parse(readFileSync(RESULT_URL, "utf8")) as Record<string, any>;
}

function representativeOps(): readonly WgslFilterOpSpec[] {
  return [
    { op: "brightness-contrast", brightness: -0.8, contrast: -40 },
    { op: "hsl", hue: 0, saturation: -1, luminance: -1 },
    { op: "levels", lut: identityWgslLut3() },
    { op: "curves", lut: identityWgslLut3() },
    {
      op: "color-balance",
      shadows: [0, 0, -5],
      midtones: [0, 0, 0],
      highlights: [20, 8, 0],
    },
  ];
}

describe("committed WGSL pipeline-cache browser evidence", () => {
  it("passes the schema and every raw-sample recomputation gate", () => {
    const artifact = readArtifact();
    expect(validateWgslPipelineCacheArtifact(artifact)).toEqual([]);
    expect(
      artifact.benchmark.approaches.uncachedRepeatedCreation.operation.samplesMs,
    ).toHaveLength(WGSL_PIPELINE_CACHE_BENCHMARK_SAMPLES);
    expect(
      artifact.benchmark.approaches.cachedValueUpdates.operation.samplesMs,
    ).toHaveLength(WGSL_PIPELINE_CACHE_BENCHMARK_SAMPLES);
  });

  it("is traceable to the existing composeWgslVariant generator byte-for-byte", () => {
    const artifact = readArtifact();
    const variant = composeWgslVariant(representativeOps());
    const sha256 = createHash("sha256").update(variant.wgsl).digest("hex");

    expect(artifact.benchmark.workload).toMatchObject({
      generator: "composeWgslVariant",
      representativeVariantKey: variant.variantKey,
      representativeShaderId: variant.shaderId,
      representativeStructure: variant.structure,
      representativeWgslSha256: sha256,
    });
  });

  it("rejects percentile tampering and missing control evidence", () => {
    const timingTamper = structuredClone(readArtifact());
    timingTamper.benchmark.approaches.cachedValueUpdates.operation.p95Ms += 1;
    expect(validateWgslPipelineCacheArtifact(timingTamper)).toContain(
      "cachedValueUpdates lacks recomputable p50/p95/p99 or jank samples",
    );

    const controlTamper = structuredClone(readArtifact());
    controlTamper.benchmark.controls.inFlight.compileInvocations = 2;
    expect(validateWgslPipelineCacheArtifact(controlTamper)).toContain(
      "in-flight dedup or revisioned remote control evidence failed",
    );
  });
});
