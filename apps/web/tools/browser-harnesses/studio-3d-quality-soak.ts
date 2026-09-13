import { VRMLoaderPlugin, VRMUtils, type MToonMaterial, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import {
  captureStudioVrmRgbaCooperatively,
  encodeStudioVrmCapturePngBlob,
} from "../../src/domains/creator/vrm/studio-vrm-raster-capture";

interface SoakOptions { durationMs: number; cycleMs: number; expectedRenderer: string }
interface ResourceCounts { textures: number; geometries: number; programs: number }
interface CycleReceipt {
  cycle: number; warmup: boolean; camera: string; elapsedMs: number; captureMs: number;
  encodeMs: number; tiles: number; foreground: number; pngBytes: number;
  cancelledAfterTiles: number; retryForeground: number; resources: ResourceCounts;
}
interface WorkerReceipt { created: number; terminated: number; active: number }
declare global {
  interface Window {
    __studio3dSoak: {
      status: string; gpu?: { renderer: string; vendor: string }; cycles: CycleReceipt[];
      elapsedMs: number; frames: number; contextLosses: number; warmupCycles: number;
      baseline?: ResourceCounts; finalResources?: ResourceCounts; disposedResources?: ResourceCounts; error?: string;
      longTasks: { count: number; totalMs: number; maxMs: number };
      frameGaps: { count: number; totalMs: number; maxMs: number };
      coverage: string; cleanupComplete: boolean;
    };
    __studio3dWorkers?: WorkerReceipt;
    runStudio3dQualitySoak: (options: SoakOptions) => Promise<void>;
  }
}
const invariant = (condition: boolean, message: string): void => { if (!condition) throw new Error(message); };
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const foreground = (rgba: Uint8ClampedArray): number => {
  let count = 0;
  for (let index = 3; index < rgba.length; index += 4) if (rgba[index] > 0) count += 1;
  return count;
};

window.runStudio3dQualitySoak = async ({ durationMs, cycleMs, expectedRenderer }) => {
  const report: Window["__studio3dSoak"] = {
    status: "initializing", cycles: [], elapsedMs: 0, frames: 0, contextLosses: 0,
    warmupCycles: 2, longTasks: { count: 0, totalMs: 0, maxMs: 0 },
    frameGaps: { count: 0, totalMs: 0, maxMs: 0 }, cleanupComplete: false,
    coverage: "Actual bundled VRM; production cooperative RGBA and PNG Worker APIs. No editor undo/save, PSD, BG3D engine replacement, physical mobile, or device-loss recovery claim.",
  };
  window.__studio3dSoak = report;
  let renderer: THREE.WebGLRenderer | undefined;
  let scene: THREE.Scene | undefined;
  let frame = 0;
  let frameError: Error | undefined;
  let running = false;
  let measuredStart = 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      report.longTasks.count += 1;
      report.longTasks.totalMs += entry.duration;
      report.longTasks.maxMs = Math.max(report.longTasks.maxMs, entry.duration);
    }
  });
  try {
    invariant(Number.isFinite(durationMs) && durationMs > 0, "Invalid soak duration");
    observer.observe({ type: "longtask", buffered: false });
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(768, 512);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor(0x344052, 1);
    document.body.appendChild(renderer.domElement);
    renderer.domElement.addEventListener("webglcontextlost", () => { report.contextLosses += 1; });
    const gl = renderer.getContext();
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    invariant(Boolean(debug), "Actual WebGL renderer identity unavailable");
    const gpu = { renderer: String(gl.getParameter(debug!.UNMASKED_RENDERER_WEBGL)),
      vendor: String(gl.getParameter(debug!.UNMASKED_VENDOR_WEBGL)) };
    report.gpu = gpu;
    invariant(!/swiftshader|llvmpipe|software/iu.test(gpu.renderer)
      && new RegExp(expectedRenderer, "iu").test(gpu.renderer), `Wrong native GPU: ${gpu.renderer}`);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x344052);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x526173, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2);
    key.position.set(2, 4, 5);
    scene.add(key);
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const asset = await loader.loadAsync("/vrm/sample.vrm");
    const vrm = asset.userData.vrm as VRM;
    invariant(Boolean(vrm), "Bundled actual VRM failed to load");
    scene.add(vrm.scene);
    VRMUtils.rotateVRM0(vrm);
    vrm.update(0);
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(vrm.scene, true);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const dimensions = { width: 1537, height: 1025 };
    const perspective = new THREE.PerspectiveCamera(35, dimensions.width / dimensions.height, 0.01, 100);
    perspective.position.copy(center).add(new THREE.Vector3(0, 0, size.y * 1.9));
    perspective.lookAt(center);
    perspective.setViewOffset(dimensions.width, dimensions.height, 23, -11, dimensions.width, dimensions.height);
    const span = size.y * 0.7;
    const ortho = new THREE.OrthographicCamera(-span * dimensions.width / dimensions.height,
      span * dimensions.width / dimensions.height, span, -span, 0.01, 100);
    ortho.position.copy(perspective.position);
    ortho.lookAt(center);
    ortho.setViewOffset(dimensions.width, dimensions.height, 23, -11, dimensions.width, dimensions.height);
    const cameras = [perspective, ortho];
    for (const camera of cameras) { camera.updateMatrixWorld(true); await renderer.compileAsync(scene, camera); }
    const liveCamera = perspective.clone();
    liveCamera.clearViewOffset();
    liveCamera.aspect = 768 / 512;
    liveCamera.updateProjectionMatrix();
    const outlineMaterials = new Set<MToonMaterial>();
    scene.traverse((object) => {
      const source = (object as THREE.Mesh).material;
      for (const material of Array.isArray(source) ? source : source ? [source] : []) {
        if ((material as MToonMaterial).isMToonMaterial) outlineMaterials.add(material as MToonMaterial);
      }
    });
    invariant([...outlineMaterials].some((material) => material.isOutline && material.outlineWidthFactor > 0),
      "Fixture must draw real MToon outlines");
    const resourceCounts = (): ResourceCounts => ({ textures: renderer!.info.memory.textures,
      geometries: renderer!.info.memory.geometries, programs: renderer!.info.programs?.length ?? 0 });
    const state = (camera: THREE.Camera) => JSON.stringify({
      target: renderer!.getRenderTarget()?.texture.uuid ?? null,
      viewport: renderer!.getViewport(new THREE.Vector4()).toArray(),
      scissor: renderer!.getScissor(new THREE.Vector4()).toArray(), scissorTest: renderer!.getScissorTest(),
      clear: renderer!.getClearColor(new THREE.Color()).getHex(), alpha: renderer!.getClearAlpha(),
      autoClear: renderer!.autoClear, toneMapping: renderer!.toneMapping,
      toneMappingExposure: renderer!.toneMappingExposure, colorSpace: renderer!.outputColorSpace,
      background: scene!.background instanceof THREE.Color ? scene!.background.getHex() : null,
      projection: camera.projectionMatrix.toArray(), inverse: camera.projectionMatrixInverse.toArray(),
      outlines: [...outlineMaterials].map((material) => [material.outlineWidthMode, material.outlineWidthFactor]),
    });
    let previousFrame = performance.now();
    running = true;
    const tick = () => {
      if (!running) return;
      try {
        const now = performance.now();
        const gap = now - previousFrame;
        previousFrame = now;
        if (measuredStart) {
          report.frameGaps.count += 1; report.frameGaps.totalMs += gap;
          report.frameGaps.maxMs = Math.max(report.frameGaps.maxMs, gap);
        }
        // Rendering the unchanged viewport between tiles verifies state restoration at real yields.
        renderer!.render(scene!, liveCamera);
        report.frames += 1;
      } catch (error) { frameError = error instanceof Error ? error : new Error(String(error)); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    let cycle = 0;
    do {
      cycle += 1;
      const warmup = cycle <= report.warmupCycles;
      const cycleStart = performance.now();
      const camera = cameras[(cycle - 1) % cameras.length];
      const beforeState = state(camera);
      const assertState = () => {
        invariant(!frameError, frameError?.message ?? "Viewport rendering failed");
        invariant(state(camera) === beforeState, "Capture state leaked across a tile yield or completion");
      };
      let tiles = 0;
      const captureStart = performance.now();
      const rgba = await captureStudioVrmRgbaCooperatively(renderer, scene, camera, dimensions, {}, {
        onProgress: ({ completedTiles }) => { tiles = completedTiles; assertState(); },
      });
      const captureMs = performance.now() - captureStart;
      assertState();
      const covered = foreground(rgba);
      invariant(covered > dimensions.width * dimensions.height * 0.01 && tiles === 4, "Blank or incomplete capture");
      const encodeStart = performance.now();
      const png = await encodeStudioVrmCapturePngBlob(rgba, dimensions);
      const encodeMs = performance.now() - encodeStart;
      invariant(rgba.byteLength === dimensions.width * dimensions.height * 4, "PNG Worker detached caller storage");
      const bitmap = await createImageBitmap(png);
      const decodedCanvas = new OffscreenCanvas(dimensions.width, dimensions.height);
      try {
        invariant(bitmap.width === dimensions.width && bitmap.height === dimensions.height, "PNG decoder dimensions mismatch");
        const context = decodedCanvas.getContext("2d");
        invariant(Boolean(context), "Decoded PNG pixel context unavailable");
        context!.drawImage(bitmap, 0, 0);
        const decoded = context!.getImageData(0, 0, dimensions.width, dimensions.height).data;
        invariant(foreground(decoded) > dimensions.width * dimensions.height * 0.01, "Encoded PNG has no visible pixels");
      } finally { bitmap.close(); decodedCanvas.width = 1; decodedCanvas.height = 1; }
      const controller = new AbortController();
      let cancelledAfterTiles = 0;
      let cancelled = false;
      try {
        await captureStudioVrmRgbaCooperatively(renderer, scene, camera, { width: 4096, height: 4096 }, {}, {
          signal: controller.signal,
          onProgress: ({ completedTiles }) => {
            cancelledAfterTiles = completedTiles; assertState();
            if (completedTiles === 1) setTimeout(() => controller.abort(), 0);
          },
        });
      } catch (error) { cancelled = error instanceof Error && error.name === "AbortError"; }
      invariant(cancelled && cancelledAfterTiles === 1, "4K cancellation did not settle before tile two");
      assertState();
      const retry = await captureStudioVrmRgbaCooperatively(renderer, scene, camera, { width: 512, height: 512 });
      const retryForeground = foreground(retry);
      invariant(retryForeground > 512 * 512 * 0.01, "Retry after cancellation produced blank pixels");
      assertState();
      invariant(!gl.isContextLost() && gl.getError() === gl.NO_ERROR && report.contextLosses === 0, "GPU/context error");
      const workers = window.__studio3dWorkers;
      invariant(Boolean(workers) && workers!.active === 0 && workers!.created === cycle && workers!.terminated === cycle,
        `PNG Worker lifetime mismatch: ${JSON.stringify(workers)}`);
      const resources = resourceCounts();
      if (cycle === report.warmupCycles) {
        report.baseline = resources;
        measuredStart = performance.now();
        report.status = "running";
      } else if (!warmup) {
        invariant(JSON.stringify(resources) === JSON.stringify(report.baseline),
          `Owned GPU resource count changed after two camera warmups: ${JSON.stringify(resources)}`);
      }
      report.elapsedMs = measuredStart ? performance.now() - measuredStart : 0;
      report.cycles.push({ cycle, warmup, camera: camera.type, elapsedMs: performance.now() - cycleStart,
        captureMs, encodeMs, tiles, foreground: covered, pngBytes: png.size,
        cancelledAfterTiles, retryForeground, resources });
      if (!warmup && performance.now() - measuredStart < durationMs) await delay(Math.max(0, cycleMs - (performance.now() - cycleStart)));
    } while (cycle < report.warmupCycles + 2 || performance.now() - measuredStart < durationMs);
    report.elapsedMs = performance.now() - measuredStart;
    report.finalResources = resourceCounts();
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.stack : String(error);
  } finally {
    running = false;
    cancelAnimationFrame(frame);
    observer.disconnect();
    try {
      if (scene) VRMUtils.deepDispose(scene);
      // Production captures retain Pass.js's module-shared triangle for later captures.
      // This isolated page is its sole owner; release it only after the last capture settles.
      const fullscreenOwner = new OutputPass();
      fullscreenOwner.dispose();
      renderer?.dispose();
      if (renderer) {
        report.disposedResources = { textures: renderer.info.memory.textures,
          geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? 0 };
        invariant(Object.values(report.disposedResources).every((value) => value === 0),
          `Owned GPU resources survived disposal: ${JSON.stringify(report.disposedResources)}`);
      }
    } catch (error) {
      report.status = "failed";
      report.error = `${report.error ?? ""} Cleanup: ${error instanceof Error ? error.message : String(error)}`;
    }
    report.cleanupComplete = true;
  }
};
