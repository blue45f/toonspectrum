import { createHash } from "node:crypto";

import {
  STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION, STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
  STUDIO_BG3D_DEPTH_FLOAT32_PROFILE, STUDIO_BG3D_NORMAL_PROFILE, STUDIO_BG3D_STABLE_ID_PROFILE,
} from "../../apps/web/src/domains/creator/bg3d/studio-bg3d-artifact-capture-v2";
import { resolveStudioBg3dCameraDistanceLimits } from "../../apps/web/src/domains/creator/bg3d/studio-bg3d-camera-orientation";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, normalizeStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "../../apps/web/src/domains/creator/bg3d/studio-bg3d-scene-document";

import { createStudioBg3dTextureFixture } from "./studio-bg3d-texture-fixture";

import type { Page } from "playwright";

/** Real production Three oracle and Babylon five-pass captures. No substitute shaders or engines. */
export async function runStudioBg3dCameraGpuProof(page: Page, rootUrl: string, urls: {
  readonly three: string;
  readonly gltfLoader: string;
  readonly babylon: string;
}) {
  const texture = createStudioBg3dTextureFixture();
  const hash = `sha256:${createHash("sha256").update(texture.bytes).digest("hex")}`;
  const cases = [
    { label: "portrait-shift", width: 63, height: 112, distance: 4, scale: 1, shift: [0.2, -0.17] },
    { label: "wide-shift-far300", width: 192, height: 65, distance: 300, scale: 75, shift: [-0.2, 0.12] },
    { label: "portrait-shift-far10000", width: 65, height: 113, distance: 10_000, scale: 1000, shift: [0.12, -0.1] },
  ].map((fixture) => {
    const scene = normalizeStudioBg3dSceneDocument({
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      camera: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
        position: [0, 0, fixture.distance], target: [0, 0, 0], projection: "perspective",
        fovDegrees: 45, zoom: 1.2, nearClip: 0.01, lensShift: fixture.shift, up: [0, 1, 0] },
      render: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.render, toneMapping: "none", exposure: 1 },
      background: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background, mode: "color", color: "#ffffff", fogEnabled: false },
      output: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output, transparentBackground: false },
      attachments: [{ id: "camera-quad", name: "Projection proof.glb", mime: "model/gltf-binary",
        byteSize: texture.bytes.length, hash, source: "upload",
        rights: { status: "owned", commercialUse: true, attributionRequired: false } }],
      nodes: [{ id: "camera-quad", name: "Projection quad", kind: "model", attachmentId: "camera-quad",
        visible: true, locked: false, castsShadow: false, receivesShadow: false,
        transform: { position: [0, 0, 0], rotation: [-0.16, 0.22, 0], scale: [fixture.scale, fixture.scale, fixture.scale] } }],
    });
    return { ...fixture, camera: scene.camera, transform: scene.nodes[0]!.transform,
      far: resolveStudioBg3dCameraDistanceLimits(scene.camera.position, scene.camera.target).farClip,
      canonicalDocumentJson: serializeStudioBg3dSceneDocument(scene)! };
  });
  await page.goto(rootUrl, { waitUntil: "domcontentloaded" });
  await page.evaluate("globalThis.__name ??= (target) => target");
  const reports = await page.evaluate(async ({ cases, urls, bytes: rawBytes, hash, profiles }) => {
    const three = await import(urls.three) as Record<string, unknown>;
    const { GLTFLoader } = await import(urls.gltfLoader) as typeof import("three/examples/jsm/loaders/GLTFLoader.js");
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
    renderer.outputColorSpace = "srgb";
    renderer.toneMapping = 0;
    renderer.setClearColor(0, 0);
    const gl = renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const webglRenderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unavailable";
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) throw new Error("Native camera proof requires an actual WebGPU adapter");
    const adapterInfo = { vendor: adapter.info.vendor, architecture: adapter.info.architecture,
      device: adapter.info.device, description: adapter.info.description };
    const results = [];
    try {
      for (const fixture of cases) {
        const bytes = Uint8Array.from(rawBytes);
        const gltf = await new GLTFLoader().parseAsync(bytes.buffer, "");
        const scene = new Scene();
        scene.add(gltf.scene);
        gltf.scene.scale.set(...fixture.transform.scale);
        gltf.scene.rotation.set(...fixture.transform.rotation);
        const camera = new Camera(fixture.camera.fovDegrees, fixture.width / fixture.height,
          fixture.camera.nearClip, fixture.far);
        camera.position.set(...fixture.camera.position);
        camera.zoom = fixture.camera.zoom ?? 1;
        camera.lookAt(...fixture.camera.target);
        camera.setViewOffset(fixture.width, fixture.height,
          fixture.camera.lensShift![0] * fixture.width, fixture.camera.lensShift![1] * fixture.height,
          fixture.width, fixture.height);
        camera.updateMatrixWorld();
        renderer.setSize(fixture.width, fixture.height, false);
        renderer.render(scene, camera);
        const bottomUp = new Uint8Array(fixture.width * fixture.height * 4);
        gl.readPixels(0, 0, fixture.width, fixture.height, gl.RGBA, gl.UNSIGNED_BYTE, bottomUp);
        const oracle = new Uint8Array(bottomUp.length);
        for (let y = 0; y < fixture.height; y += 1) {
          const row = fixture.width * 4;
          oracle.set(bottomUp.subarray((fixture.height - 1 - y) * row, (fixture.height - y) * row), y * row);
        }
        const planeNormal = gltf.scene.position.clone().set(0, 0, 1).applyEuler(gltf.scene.rotation).normalize();
        const viewNormal = planeNormal.clone().transformDirection(camera.matrixWorldInverse);
        const octDenom = Math.abs(viewNormal.x) + Math.abs(viewNormal.y) + Math.abs(viewNormal.z);
        const expectedNormal = [Math.round((viewNormal.x / octDenom * 0.5 + 0.5) * 255),
          Math.round((viewNormal.y / octDenom * 0.5 + 0.5) * 255)];
        try {
          for (const backend of ["webgl2", "webgpu"] as const) {
            const canvas = document.createElement("canvas");
            const diagnostics: unknown[] = [];
            const runtime = specialist.createStudioBg3dBabylonSpecialist({ backend, canvas,
              engineInitializationTimeoutMs: 60_000, settings: { failIfMajorPerformanceCaveat: false },
              onDiagnostic: (value) => { diagnostics.push(value); } });
            try {
              const capture = await runtime.runIsolated({ id: `${fixture.label}-${backend}`,
                request: { kind: "artifact-capture-v2", version: profiles.version,
                  width: fixture.width, height: fixture.height,
                  artifacts: [{ kind: "beauty", profile: profiles.beauty }, { kind: "depth", profile: profiles.depth },
                    { kind: "normal", profile: profiles.normal }, { kind: "object-id", profile: profiles.id },
                    { kind: "material-id", profile: profiles.id }] },
                signal: new AbortController().signal,
                snapshot: { canonicalDocumentJson: fixture.canonicalDocumentJson, totalAssetBytes: bytes.length,
                  assets: [{ attachmentId: "camera-quad", hash, byteSize: bytes.length, readVerifiedBytes: () => Uint8Array.from(bytes) }] },
              });
              if (capture.kind !== "studio-bg3d-artifact-capture") throw new Error("Missing projection artifacts");
              const beauty = capture.artifacts.find((item) => item.kind === "beauty");
              const depth = capture.artifacts.find((item) => item.kind === "depth");
              const normal = capture.artifacts.find((item) => item.kind === "normal");
              const ids = capture.artifacts.find((item) => item.kind === "object-id");
              const materials = capture.artifacts.find((item) => item.kind === "material-id");
              if (!(beauty?.data instanceof Uint8Array) || !(depth?.data instanceof Float32Array)
                || !(normal?.data instanceof Uint8Array) || !(ids?.data instanceof Uint32Array)
                || !(materials?.data instanceof Uint32Array)) throw new Error("Invalid projection planes");
              const objectId = ids.legend.find((item) => item.stableId === "obj/camera-quad")?.id;
              const materialId = materials.legend.find((item) => item.stableId === "mat/camera-quad/gltf-material/0")?.id;
              if (!objectId || !materialId) throw new Error("Missing canonical projection IDs");
              let foreground = 0; let background = 0; let maxRgbError = 0; let maxDepthError = 0; let maxNormalError = 0;
              for (let y = 1; y < fixture.height - 1; y += 1) for (let x = 1; x < fixture.width - 1; x += 1) {
                const pixel = y * fixture.width + x;
                const offset = pixel * 4;
                // Exclude only a one-pixel raster edge or color discontinuity; all remaining
                // coverage comes from independent Three pixels, never Babylon's own mask.
                const stable = [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => {
                  const neighbor = ((y + dy) * fixture.width + x + dx) * 4;
                  return [0, 1, 2, 3].every((channel) => oracle[neighbor + channel] === oracle[offset + channel]);
                }));
                if (!stable) continue;
                if (oracle[offset + 3] === 0) {
                  if (ids.data[pixel] !== 0 || materials.data[pixel] !== 0 || depth.data[pixel] !== 1
                    || [0, 1, 2, 3].some((channel) => beauty.data[offset + channel] !== 255)) {
                    throw new Error(`${backend} ${fixture.label}: background pass mismatch at ${x},${y}: ${JSON.stringify({ beauty: Array.from(beauty.data.subarray(offset, offset + 4)), object: ids.data[pixel], material: materials.data[pixel], depth: depth.data[pixel] })}`);
                  }
                  background += 1;
                  continue;
                }
                if (ids.data[pixel] !== objectId || materials.data[pixel] !== materialId || beauty.data[offset + 3] !== 255) {
                  throw new Error(`${backend} ${fixture.label}: lost/misaligned foreground at ${x},${y}`);
                }
                for (let channel = 0; channel < 3; channel += 1) maxRgbError = Math.max(maxRgbError,
                  Math.abs(beauty.data[offset + channel]! - oracle[offset + channel]!));
                const ray = gltf.scene.position.clone().set((x + 0.5) / fixture.width * 2 - 1,
                  1 - (y + 0.5) / fixture.height * 2, 0).unproject(camera).sub(camera.position).normalize();
                const hitDistance = -planeNormal.dot(camera.position) / planeNormal.dot(ray);
                const hit = camera.position.clone().addScaledVector(ray, hitDistance).applyMatrix4(camera.matrixWorldInverse);
                const expectedDepth = (-hit.z - camera.near) / (camera.far - camera.near);
                maxDepthError = Math.max(maxDepthError, Math.abs(depth.data[pixel]! - expectedDepth));
                for (let channel = 0; channel < 2; channel += 1) maxNormalError = Math.max(maxNormalError,
                  Math.abs(normal.data[pixel * 2 + channel]! - expectedNormal[channel]!));
                foreground += 1;
              }
              if (foreground < 100 || background < 100 || maxRgbError > 1 || maxDepthError > 2e-6 || maxNormalError > 1) {
                throw new Error(`${backend} ${fixture.label}: projection parity ${JSON.stringify({ foreground, background, maxRgbError, maxDepthError, maxNormalError })}`);
              }
              results.push({ label: fixture.label, backend, width: fixture.width, height: fixture.height,
                distance: fixture.distance, farClip: fixture.far, foreground, background,
                maxRgbError, maxDepthError, maxNormalError, expectedNormal, diagnostics });
            } finally { await runtime.dispose(); }
          }
        } finally {
          gltf.scene.traverse((object) => {
            const mesh = object as import("three").Mesh;
            mesh.geometry?.dispose();
            for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
              if (!material) continue;
              (material as import("three").MeshBasicMaterial).map?.dispose(); material.dispose();
            }
          });
        }
      }
    } finally { renderer.dispose(); renderer.forceContextLoss(); }
    return { webglRenderer, adapterInfo, results };
  }, { cases, urls, bytes: Array.from(texture.bytes), hash,
    profiles: { version: STUDIO_BG3D_ARTIFACT_CAPTURE_VERSION, beauty: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
      depth: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE, normal: STUDIO_BG3D_NORMAL_PROFILE, id: STUDIO_BG3D_STABLE_ID_PROFILE } });
  console.log(`[verify-studio-bg3d-camera] projection PASS ${JSON.stringify(reports)}`);
  return reports;
}
