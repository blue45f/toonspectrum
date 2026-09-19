

import "../../src/styles/globals.css";
import { createRoot } from "react-dom/client";

import { runScene3dSpecialistInWorker } from "../../src/domains/creator/scene3d/specialists/specialist-client";
import { createSpecialistFixture } from "../../src/domains/creator/scene3d/specialists/specialist-fixtures";
import { inspectSpecialistGlbImages } from "../../src/domains/creator/scene3d/specialists/specialist-image-budget";
import { createTexturedSpecialistFixture } from "../../src/domains/creator/scene3d/specialists/specialist-texture-fixtures";
import { StudioScene3dAssetToolsPanel } from "../../src/domains/creator/scene3d/specialists/StudioScene3dAssetToolsPanel";
import { StudioScene3dSplatReferencePanel } from "../../src/domains/creator/scene3d/specialists/StudioScene3dSplatReferencePanel";

import { verifySpecialistTexturePixels } from "./studio-scene3d-texture-proof";

import type { SpecialistOptions } from "../../src/domains/creator/scene3d/specialists/specialist-contract";

declare global {
  interface Window {
    __scene3dSpecialistProof?: unknown;
    __scene3dSpecialistFixture?: number[];
    __scene3dSplatFixture?: number[];
    __scene3dTexturedFixture?: number[];
  }
}
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
async function verify() {
  const bundle = new URL(location.href).searchParams.get("worker");
  let bundleRequests = 0;
  if (bundle) {
    if (!/^\/assets\/specialist\.worker-[a-zA-Z0-9_-]+\.js$/.test(bundle))
      throw new Error("Invalid built worker artifact.");
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        const built = String(url).includes("/specialist.worker.ts");
        super(built ? bundle! : url, options);
        if (built) bundleRequests++;
      }
    };
  }
  const sphere = await createSpecialistFixture("sphere");
  const floor = await createSpecialistFixture("floor");
  const cube = await createSpecialistFixture("cube");
  const second = await createSpecialistFixture("offset-cube");
  const animated = await createSpecialistFixture("animated");
  const rig = await createSpecialistFixture("rig");
  const textured = await createTexturedSpecialistFixture(true);
  const jobs: {
    source: Uint8Array<ArrayBuffer>;
    secondary?: Uint8Array<ArrayBuffer>;
    options: SpecialistOptions;
  }[] = [
    { source: textured, options: { kind: "textures", textureMode: "uastc", maxTextureSize: 512 } },
    { source: textured, options: { kind: "textures", textureMode: "etc1s", maxTextureSize: 512 } },
    { source: textured, options: { kind: "release", textureMode: "uastc", maxTextureSize: 512, error: 0.03 } },
    { source: rig, options: { kind: "inspect" } },
    {
      source: rig,
      options: {
        kind: "ik",
        rootName: "upper-arm",
        tipName: "hand",
        target: [1, 1.2, 0.3],
        angleLimitDegrees: 150,
        tolerance: 0.005,
      },
    },
    { source: sphere, options: { kind: "compress" } },
    { source: sphere, options: { kind: "lod", error: 0.03 } },
    { source: floor, options: { kind: "tangents" } },
    { source: animated, options: { kind: "animation" } },
    {
      source: cube,
      secondary: second,
      options: { kind: "csg", operation: "subtract", backend: "preview" },
    },
    {
      source: cube,
      secondary: second,
      options: { kind: "csg", operation: "subtract", backend: "solid" },
    },
    {
      source: floor,
      options: {
        kind: "navigation",
        start: [-2, 0, -2],
        end: [2, 0, 2],
        cellSize: 0.2,
        agentRadius: 0.3,
        agentHeight: 1.8,
      },
    },
  ];
  const outcomes = [];
  for (const [index, job] of jobs.entries()) {
    const result = await runScene3dSpecialistInWorker({
      version: 1,
      id: index + 1,
      source: job.source.buffer,
      ...(job.secondary ? { secondary: job.secondary.buffer } : {}),
      options: job.options,
    });
    assert(result.artifacts.length > 0, "No real artifacts returned.");
    assert(job.source.byteLength > 0, "Canonical input was detached.");
    if (job.options.kind === "lod")
      assert(
        result.artifacts[2]!.stats!.triangles < result.before.triangles,
        "LOD did not reduce geometry.",
      );
    if (job.options.kind === "tangents")
      assert(
        result.artifacts[0]!.stats!.tangentPrimitives === 1,
        "No tangent output.",
      );
    if (job.options.kind === "animation")
      assert(
        result.artifacts[0]!.stats!.animationKeys < result.before.animationKeys,
        "No keyframe reduction.",
      );
    if (job.options.kind === "ik")
      assert(
        JSON.parse(new TextDecoder().decode(result.artifacts[1]!.bytes))
          .persistedError <= 0.005,
        "IK persisted pose missed target.",
      );
    if (job.options.kind === "navigation")
      assert(
        JSON.parse(new TextDecoder().decode(result.artifacts[2]!.bytes)).path
          .length >= 2,
        "No actual path.",
      );
    let texturePixels: Record<string, unknown> | undefined;
    if (job.options.kind === "textures" || job.options.kind === "release") {
      for (const artifact of result.artifacts.filter(({mime}) => mime === "model/gltf-binary")) {
        assert(inspectSpecialistGlbImages(artifact.bytes).every(({mime}) => mime === "image/ktx2"), "Texture release contains an unconverted image.");
      }
      texturePixels = await verifySpecialistTexturePixels(job.source, result.artifacts[0]!.bytes);
    }
    outcomes.push({
      ...(texturePixels ? { texturePixels } : {}),
      options: job.options,
      sourceByteLength: job.source.length,
      ...(job.options.kind === "ik"
        ? {
            ikReceipt: JSON.parse(
              new TextDecoder().decode(result.artifacts[1]!.bytes),
            ),
          }
        : {}),
      before: result.before,
      artifacts: result.artifacts.map(({ bytes, ...artifact }) => ({
        ...artifact,
        byteLength: bytes.length,
      })),
      warnings: result.warnings,
    });
  }
  const controller = new AbortController();
  controller.abort();
  let cancelled = false;
  try {
    await runScene3dSpecialistInWorker(
      {
        version: 1,
        id: 10,
        source: sphere.buffer,
        options: { kind: "compress" },
      },
      controller.signal,
    );
  } catch {
    cancelled = true;
  }
  assert(cancelled, "Cancellation failed.");
  const host = document.createElement("main");
  host.style.cssText = "max-width:640px;margin:16px auto;font-family:system-ui";
  document.body.append(host);
  createRoot(host).render(
    <>
      <StudioScene3dAssetToolsPanel />
      <StudioScene3dSplatReferencePanel />
    </>,
  );
  const splats = new Uint8Array(256 * 32);
  const view = new DataView(splats.buffer);
  for (let index = 0; index < 256; index++) {
    const theta = index * Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (2 * (index + 0.5)) / 256;
    const radial = Math.sqrt(1 - y * y);
    const center = [Math.cos(theta) * radial, y, Math.sin(theta) * radial];
    for (let axis = 0; axis < 3; axis++) {
      view.setFloat32(index * 32 + axis * 4, center[axis]!, true);
      view.setFloat32(index * 32 + 12 + axis * 4, 0.075, true);
    }
    splats.set(
      [200, 80 + (index % 120), 160, 255, 255, 128, 128, 128],
      index * 32 + 24,
    );
  }
  window.__scene3dSplatFixture = Array.from(splats);
  window.__scene3dSpecialistFixture = Array.from(sphere);
  window.__scene3dTexturedFixture = Array.from(textured);
  if (bundle)
    assert(
      bundleRequests === jobs.length,
      "Not all jobs used the production-built worker.",
    );
  return {
    status: "ok",
    outcomes,
    cancellation: "passed",
    productionWorkerJobs: bundleRequests,
  };
}
void verify()
  .then((value) => {
    window.__scene3dSpecialistProof = value;
  })
  .catch((error: unknown) => {
    window.__scene3dSpecialistProof = {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    };
  });
