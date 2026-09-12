import { VRMLoaderPlugin, VRMUtils, type MToonMaterial, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { captureStudioVrmRgba, captureStudioVrmRgbaCooperatively } from "../../src/domains/creator/vrm/studio-vrm-raster-capture";

function invariant(value: boolean, message: string): void {
  if (!value) throw new Error(message);
}

function compare(a: Uint8ClampedArray, b: Uint8ClampedArray, width: number) {
  let alphaSum = 0;
  let compositeSum = 0;
  let overFour = 0;
  let foreground = 0;
  let seamSum = 0;
  let seamChannels = 0;
  let maxAlpha = 0;
  let maxComposite = 0;
  for (let i = 0; i < a.length; i += 4) {
    const pixel = i / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const seam = (x >= 1022 && x <= 1026) || (x >= 2046 && x <= 2049) || (y >= 1022 && y <= 1026);
    const alpha = Math.abs(a[i + 3] - b[i + 3]);
    alphaSum += alpha;
    maxAlpha = Math.max(maxAlpha, alpha);
    if (a[i + 3] > 0) foreground += 1;
    for (let c = 0; c < 3; c += 1) {
      const delta = Math.abs(a[i + c] * a[i + 3] / 255 - b[i + c] * b[i + 3] / 255);
      compositeSum += delta;
      maxComposite = Math.max(maxComposite, delta);
      if (delta > 4) overFour += 1;
      if (seam) { seamSum += delta; seamChannels += 1; }
    }
  }
  const pixels = a.length / 4;
  return { pixels, foreground, meanAlpha: alphaSum / pixels, maxAlpha,
    meanComposite: compositeSum / (pixels * 3), maxComposite,
    overFourShare: overFour / (pixels * 3), seamMean: seamSum / seamChannels };
}

async function verify() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(768, 512);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);
  const gl = renderer.getContext();
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  if (!debug) throw new Error("GPU identity must be available");
  const gpu = { renderer: String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)),
    vendor: String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL)) };
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x526173, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(2, 4, 5);
  scene.add(key);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const asset = await loader.loadAsync("/vrm/sample.vrm");
  const vrm = asset.userData.vrm as VRM;
  invariant(Boolean(vrm), "Bundled actual VRM must load");
  scene.add(vrm.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.update(0);
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vrm.scene, true);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const width = 2050;
  const height = 1025;
  const perspective = new THREE.PerspectiveCamera(35, width / height, 0.01, 100);
  perspective.position.copy(center).add(new THREE.Vector3(0, 0, size.y * 1.9));
  perspective.lookAt(center);
  perspective.setViewOffset(width, height, 31, -13, width, height);
  const span = size.y * 1.2;
  const ortho = new THREE.OrthographicCamera(-span, span, span / 2, -span / 2, 0.01, 100);
  ortho.position.copy(perspective.position);
  ortho.lookAt(center);
  ortho.setViewOffset(width, height, 31, -13, width, height);
  const results: unknown[] = [];
  const outlineMaterials = new Map<MToonMaterial, { mode: MToonMaterial["outlineWidthMode"]; factor: number }>();
  scene.traverse((object) => {
    const source = (object as THREE.Mesh).material;
    for (const material of Array.isArray(source) ? source : source ? [source] : []) {
      const toon = material as MToonMaterial;
      if (toon.isMToonMaterial && toon.outlineWidthMode !== "none" && toon.outlineWidthFactor > 0) {
        outlineMaterials.set(toon, { mode: toon.outlineWidthMode, factor: toon.outlineWidthFactor });
      }
    }
  });
  const outlineDrawMaterials = [...outlineMaterials.keys()].filter((material) => material.isOutline).length;
  invariant(outlineMaterials.size > 0 && outlineDrawMaterials > 0, "Fixture must contain actual MToon outline draw materials");
  const screenOutlineFactor = 0.003;
  const worldBaselines = new Map<string, Uint8ClampedArray>();
  try {
    for (const outlineMode of ["worldCoordinates", "screenCoordinates"] as const) {
      for (const [material, original] of outlineMaterials) {
        material.outlineWidthMode = outlineMode === "screenCoordinates" ? outlineMode : original.mode;
        material.outlineWidthFactor = outlineMode === "screenCoordinates" ? screenOutlineFactor : original.factor;
        material.needsUpdate = true;
      }
      vrm.update(0);
      const appliedMaterials = [...outlineMaterials.keys()].filter((material) => material.outlineWidthMode === outlineMode
        && material.outlineWidthFactor > 0).length;
      invariant(appliedMaterials > 0, `${outlineMode}: no outline material uses the intended shader branch`);
      for (const [name, camera] of [["perspective", perspective], ["orthographic", ortho]] as const) {
        camera.updateMatrixWorld(true);
        await renderer.compileAsync(scene, camera);
        const baseline = captureStudioVrmRgba(renderer, scene, camera, { width, height });
        if (outlineMode === "worldCoordinates") worldBaselines.set(name, baseline);
        const outlineChange = outlineMode === "screenCoordinates" ? compare(worldBaselines.get(name)!, baseline, width) : null;
        invariant(outlineChange === null || outlineChange.maxComposite > 4 || outlineChange.maxAlpha > 4,
          `${name}: switching to a visible screen outline did not change the actual rendered pixels`);
        const start = performance.now();
        const progress: number[] = [];
        let heartbeat = 0;
        const heartbeatId = setInterval(() => { heartbeat += 1; }, 0);
        let tiled: Uint8ClampedArray;
        try {
          tiled = await captureStudioVrmRgbaCooperatively(renderer, scene, camera, { width, height }, {}, {
            onProgress: ({ completedTiles }) => { progress.push(completedTiles); },
          });
        } finally { clearInterval(heartbeatId); }
        const parity = compare(baseline, tiled, width);
        invariant(parity.foreground > width * height * 0.01, `${name}: blank capture`);
        invariant(parity.meanAlpha <= 0.1 && parity.meanComposite <= 0.25
          && parity.overFourShare <= 0.001 && parity.seamMean <= 0.35, `${name}: tiled output mismatch ${JSON.stringify(parity)}`);
        invariant(progress.length === 6 && heartbeat >= 2, `${name}: no cooperative event turns`);
        results.push({ name, outlineMode, appliedMaterials, outlineDrawMaterials,
          screenOutlineFactor: outlineMode === "screenCoordinates" ? screenOutlineFactor : null,
          outlineChange, width, height, parity, progress, heartbeat, elapsedMs: performance.now() - start });
      }
    }
    worldBaselines.clear();
    const controller = new AbortController();
    let completed = 0;
    let cancelled = false;
    const before = renderer.info.memory.textures;
    try {
      await captureStudioVrmRgbaCooperatively(renderer, scene, perspective, { width: 4096, height: 4096 }, {}, {
        signal: controller.signal,
        onProgress: ({ completedTiles }) => {
          completed = completedTiles;
          if (completedTiles === 1) setTimeout(() => controller.abort(), 0);
        },
      });
    } catch (error) { cancelled = error instanceof Error && error.name === "AbortError"; }
    invariant(cancelled && completed === 1, "Cancellation must stop before tile two");
    invariant(renderer.info.memory.textures === before, "Cancelled capture leaked GPU targets");
    const retry = await captureStudioVrmRgbaCooperatively(renderer, scene, perspective, { width: 512, height: 512 });
    invariant(retry.some((value, index) => index % 4 === 3 && value > 0), "Retry is empty");
    invariant(!gl.isContextLost() && gl.getError() === gl.NO_ERROR, "GPU error after capture");
    renderer.setSize(768, 512);
    renderer.render(scene, perspective);
    return { status: "passed", gpu, model: "/vrm/sample.vrm", results,
      cancellation: { completedTiles: completed, cancelled, texturesBefore: before, texturesAfter: renderer.info.memory.textures, retry: true } };
  } finally {
    for (const [material, original] of outlineMaterials) {
      material.outlineWidthMode = original.mode;
      material.outlineWidthFactor = original.factor;
    }
    VRMUtils.deepDispose(scene);
    renderer.dispose();
  }
}

void verify().then((result) => {
  Object.assign(window, { __vrmCaptureResult: result });
}).catch((error: unknown) => {
  Object.assign(window, { __vrmCaptureResult: { status: "failed", error: error instanceof Error ? error.stack : String(error) } });
});
