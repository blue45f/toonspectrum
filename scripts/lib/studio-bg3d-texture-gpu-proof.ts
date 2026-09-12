import { createHash } from "node:crypto";

import { STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION, STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
  STUDIO_BG3D_DEPTH_FLOAT32_PROFILE, STUDIO_BG3D_STABLE_ID_PROFILE } from "../../apps/web/src/domains/creator/bg3d/studio-bg3d-artifact-capture-v2";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, normalizeStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument } from "../../apps/web/src/domains/creator/bg3d/studio-bg3d-scene-document";

import { createStudioBg3dTextureFixture } from "./studio-bg3d-texture-fixture";

import type { Page } from "playwright";

/** Actual production GLTFLoader and specialist captures; no test shader or decoder substitutes. */
export async function runStudioBg3dTextureGpuProof(page: Page, rootUrl: string, urls: {
  readonly three: string;
  readonly gltfLoader: string;
  readonly babylon: string;
}) {
  const cases = [
    { label: "nearest-clamp", minFilter: 9728, magFilter: 9728, wrapS: 33071, wrapT: 33071 },
    { label: "linear-clamp", minFilter: 9729, magFilter: 9729, wrapS: 33071, wrapT: 33071 },
    { label: "nearest-repeat", minFilter: 9984, magFilter: 9728, wrapS: 10497, wrapT: 10497, uvScale: 2 },
    { label: "linear-mirror", minFilter: 9985, magFilter: 9729, wrapS: 33648, wrapT: 33648, uvScale: 2 },
    { label: "nearest-mip-linear", minFilter: 9986, magFilter: 9728, wrapS: 33071, wrapT: 33071, width: 128, height: 128 },
    { label: "linear-mip-linear", minFilter: 9987, magFilter: 9729, wrapS: 33071, wrapT: 33071, width: 128, height: 128 },
    { label: "pbr-nearest-clamp", minFilter: 9728, magFilter: 9728, wrapS: 33071, wrapT: 33071, unlit: false },
  ].map((options) => {
    const fixture = createStudioBg3dTextureFixture(options);
    const hash = `sha256:${createHash("sha256").update(fixture.bytes).digest("hex")}`;
    const scene = normalizeStudioBg3dSceneDocument({
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      camera: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera, position: [0, 0, 4], target: [0, 0, 0],
        projection: "perspective", fovDegrees: 45, zoom: 1, rollDegrees: 0, nearClip: 0.01 },
      render: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.render, toneMapping: "none", exposure: 1 },
      background: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background, mode: "color", fogEnabled: false },
      output: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output, transparentBackground: false },
      attachments: [{ id: "png", name: "Texture proof.glb", mime: "model/gltf-binary", byteSize: fixture.bytes.length,
        hash, rights: { status: "owned", commercialUse: true, attributionRequired: false }, source: "upload" }],
      nodes: [{ id: "png-quad", name: "PNG quad", kind: "model", attachmentId: "png", visible: true, locked: false,
        castsShadow: false, receivesShadow: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }],
    });
    return { label: options.label, unlit: !("unlit" in options && options.unlit === false), bytes: Array.from(fixture.bytes), hash,
      canonicalDocumentJson: serializeStudioBg3dSceneDocument(scene)!, colors: fixture.colors };
  });
  await page.goto(rootUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate("globalThis.__name ??= (target) => target");
  const result = await page.evaluate(async ({ cases, urls, profiles }) => {
    const three = await import(urls.three) as Record<string, unknown>;
    const loaderModule = await import(urls.gltfLoader) as typeof import("three/examples/jsm/loaders/GLTFLoader.js");
    const specialist = await import(urls.babylon) as typeof import("../../apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-specialist-entry");
    const find = (identity: string) => {
      const candidate = Object.values(three).find((value) => typeof value === "function"
        && Function.prototype.toString.call(value).includes(identity));
      if (typeof candidate !== "function") throw new Error(`Missing production Three ${identity}`);
      return candidate;
    };
    const Renderer = find("this.isWebGLRenderer") as typeof import("three").WebGLRenderer;
    const Camera = find("this.isPerspectiveCamera") as typeof import("three").PerspectiveCamera;
    const Scene = find("this.isScene") as typeof import("three").Scene;
    const renderer = new Renderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(64, 64, false);
    renderer.outputColorSpace = "srgb";
    renderer.toneMapping = 0;
    renderer.setClearColor(0, 0);
    const camera = new Camera(45, 1, 0.01, 2000);
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);
    const reports = [];
    try {
      for (const fixture of cases) {
        const bytes = Uint8Array.from(fixture.bytes);
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        const actualHash = `sha256:${Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("")}`;
        if (actualHash !== fixture.hash) throw new Error("Texture fixture SHA drift");
        const gltf = await new loaderModule.GLTFLoader().parseAsync(bytes.buffer, "");
        const scene = new Scene();
        scene.add(gltf.scene);
        renderer.render(scene, camera);
        const bottomUp = new Uint8Array(64 * 64 * 4);
        const gl = renderer.getContext();
        gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);
        const oracle = new Uint8Array(bottomUp.length);
        for (let y = 0; y < 64; y += 1) oracle.set(bottomUp.subarray((63 - y) * 256, (64 - y) * 256), y * 256);
        try {
          for (const backend of ["webgl2", "webgpu"] as const) {
            const canvas = document.createElement("canvas");
            canvas.width = 64; canvas.height = 64;
            const diagnostics: unknown[] = [];
            const runtime = specialist.createStudioBg3dBabylonSpecialist({ backend, canvas,
              onDiagnostic: (diagnostic) => { diagnostics.push(diagnostic); },
              engineInitializationTimeoutMs: 60000, settings: { failIfMajorPerformanceCaveat: false } });
            try {
              const capture = await runtime.runIsolated({ id: `${fixture.label}-${backend}`,
                request: { kind: "artifact-capture-v2", version: profiles.version, width: 64, height: 64,
                  artifacts: [{ kind: "beauty", profile: profiles.beauty }, { kind: "depth", profile: profiles.depth },
                    { kind: "object-id", profile: profiles.id }, { kind: "material-id", profile: profiles.id }] },
                signal: new AbortController().signal,
                snapshot: { canonicalDocumentJson: fixture.canonicalDocumentJson, totalAssetBytes: bytes.length,
                  assets: [{ attachmentId: "png", hash: fixture.hash, byteSize: bytes.length, readVerifiedBytes: () => Uint8Array.from(bytes) }] },
              });
              if (capture.kind !== "studio-bg3d-artifact-capture") throw new Error("Missing artifact capture");
              const beauty = capture.artifacts.find((item) => item.kind === "beauty");
              const depth = capture.artifacts.find((item) => item.kind === "depth");
              const ids = capture.artifacts.find((item) => item.kind === "object-id");
              const materials = capture.artifacts.find((item) => item.kind === "material-id");
              if (!(beauty?.data instanceof Uint8Array) || !(depth?.data instanceof Float32Array)
                || !(ids?.data instanceof Uint32Array) || !(materials?.data instanceof Uint32Array)) throw new Error("Invalid texture artifact planes");
              const objectId = ids.legend.find((entry) => entry.stableId === "obj/png-quad")?.id;
              const materialId = materials.legend.find((entry) => entry.stableId === "mat/png-quad/gltf-material/0")?.id;
              if (!objectId || !materialId || ids.legend.length !== 1 || materials.legend.length !== 1) {
                throw new Error(`Texture canonical IDs changed: ${JSON.stringify([ids.legend, materials.legend])}`);
              }
              let maxDifference = 0;
              let comparedPixels = 0;
              for (let y = 17; y < 47; y += 1) {
                for (let x = 17; x < 47; x += 1) {
                  const pixel = y * 64 + x;
                  const offset = pixel * 4;
                  if (beauty.data[offset + 3] !== 255 || oracle[offset + 3] !== 255
                    || ids.data[pixel] !== objectId || materials.data[pixel] !== materialId || depth.data[pixel]! >= 0.999) {
                    throw new Error(`${backend} ${fixture.label}: opaque texture lost coverage at ${x},${y}`);
                  }
                  if (fixture.unlit) {
                    for (let channel = 0; channel < 3; channel += 1) maxDifference = Math.max(maxDifference,
                      Math.abs(beauty.data[offset + channel]! - oracle[offset + channel]!));
                  }
                  comparedPixels += 1;
                }
              }
              if (maxDifference > 1) throw new Error(`${backend} ${fixture.label}: Three color/UV/sampler difference ${maxDifference}`);
              const samples = [[20, 20], [44, 20], [20, 44], [44, 44]].map(([x, y]) =>
                Array.from(beauty.data.subarray((y! * 64 + x!) * 4, (y! * 64 + x!) * 4 + 4)));
              if (fixture.label === "nearest-clamp") {
                for (let quadrant = 0; quadrant < 4; quadrant += 1) {
                  for (let channel = 0; channel < 3; channel += 1) {
                    if (Math.abs(samples[quadrant]![channel]! - fixture.colors[quadrant]![channel]!) > 1) {
                      throw new Error(`${backend}: PNG sRGB/flipV/zero-alpha RGB mismatch ${JSON.stringify(samples)}`);
                    }
                  }
                }
              }
              // PBR lighting differs between the engines. Prove texture color ordering and full
              // OPAQUE coverage without claiming photometric equality to an unlit color oracle.
              if (!fixture.unlit) {
                for (let quadrant = 0; quadrant < 4; quadrant += 1) {
                  const order = [0, 1, 2].sort((a, b) => fixture.colors[quadrant]![b]! - fixture.colors[quadrant]![a]!);
                  const sample = samples[quadrant]!;
                  if (!(sample[order[0]!]! > sample[order[1]!]! + 8
                    && sample[order[1]!]! > sample[order[2]!]! + 3)) {
                    throw new Error(`${backend}: PBR texture colors missing/reordered ${JSON.stringify(samples)}`);
                  }
                }
              }
              if (ids.data.some((id, index) => (id > 0) !== (materials.data[index]! > 0))) throw new Error("Texture ID planes diverged");
              reports.push({ backend, label: fixture.label, comparedPixels, maxDifference: fixture.unlit ? maxDifference : null,
                samples, objectId, materialId,
                state: runtime.getState(), diagnostics });
            } catch (cause) {
              const chain: string[] = [];
              let next: unknown = cause;
              for (let depth = 0; next instanceof Error && depth < 6; depth += 1) {
                chain.push(`${next.name}: ${next.message}`);
                next = next.cause;
              }
              throw new Error(`${backend} ${fixture.label}: ${chain.join(" <- ")}`, { cause });
            } finally { await runtime.dispose(); }
          }
        } finally {
          gltf.scene.traverse((object) => {
            const mesh = object as import("three").Mesh;
            mesh.geometry?.dispose();
            for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
              if (!material) continue;
              (material as import("three").MeshBasicMaterial).map?.dispose();
              material.dispose();
            }
          });
        }
      }
    } finally { renderer.dispose(); renderer.forceContextLoss(); }
    return reports;
  }, { cases, urls, profiles: { version: STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION, beauty: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
    depth: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE, id: STUDIO_BG3D_STABLE_ID_PROFILE } });
  console.log(`[verify-studio-3d-console] embedded PNG texture PASS ${JSON.stringify(result)}`);
  return result;
}
