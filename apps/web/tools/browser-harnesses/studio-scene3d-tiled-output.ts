import * as THREE from "three";

import { captureStudioBg3dRaster } from "../../src/domains/creator/bg3d/studio-bg3d-capture-adapter";
import { createStudioBg3dDepthRasterLayer } from "../../src/domains/creator/bg3d/studio-bg3d-depth-pass";
import { renderStudioBg3dLtLayers } from "../../src/domains/creator/bg3d/studio-bg3d-lt-render";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../../src/domains/creator/bg3d/studio-bg3d-scene-document";
import { selectStudioBg3dShotPassLayers } from "../../src/domains/creator/bg3d/studio-bg3d-shot-pass-layers";
import { createStudioBg3dThreeWebglCaptureAdapter } from "../../src/domains/creator/bg3d/studio-bg3d-three-webgl-capture";
import { createStudioBg3dThreeWebGpuCaptureAdapter } from "../../src/domains/creator/bg3d/studio-bg3d-three-webgpu-capture";
import { createStudioBg3dThreeWebGpuRenderer } from "../../src/domains/creator/bg3d/studio-bg3d-three-webgpu-renderer";
import { buildStudioBg3dTiledImages } from "../../src/domains/creator/bg3d/studio-bg3d-tiled-artifact-client";

import type { StudioBg3dCaptureAdapter } from "../../src/domains/creator/bg3d/studio-bg3d-capture-adapter";
import type { StudioBg3dLtRasterLayer } from "../../src/domains/creator/bg3d/studio-bg3d-lt-render";
import type { StudioBg3dShotBatchPass } from "../../src/domains/creator/bg3d/studio-bg3d-shot-batch-pass-catalog";
import type { StudioBg3dTiledArtifactResult } from "../../src/domains/creator/bg3d/studio-bg3d-tiled-artifact-contract";

declare global {
  interface Window {
    __scene3dTiledProof?: unknown;
  }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function decodePng(png: Blob) {
  const bytes = new Uint8Array(await png.arrayBuffer()),
    view = new DataView(bytes.buffer);
  const width = view.getUint32(16),
    height = view.getUint32(20),
    idat: Uint8Array<ArrayBuffer>[] = [];
  assert(bytes[24] === 8 && bytes[25] === 6, "Expected RGBA8 PNG.");
  for (let offset = 8; offset < bytes.length; ) {
    const size = view.getUint32(offset);
    if (view.getUint32(offset + 4) === 0x49444154)
      idat.push(bytes.slice(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const stream = new Blob(idat)
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  const rgba = new Uint8ClampedArray(width * height * 4);
  assert(raw.length === (width * 4 + 1) * height, "Invalid PNG row stream.");
  for (let y = 0; y < height; y++) {
    const stride = width * 4;
    assert(raw[y * (stride + 1)] === 1, "Unexpected PNG filter.");
    for (let x = 0; x < stride; x++)
      rgba[y * stride + x] =
        (raw[y * (stride + 1) + 1 + x]! +
          (x >= 4 ? rgba[y * stride + x - 4]! : 0)) &
        255;
  }
  return { width, height, rgba };
}
function composite(
  layers: readonly StudioBg3dLtRasterLayer[],
  width: number,
  height: number,
) {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < output.length; p += 4) {
    let a = 0;
    const color = [0, 0, 0];
    for (const layer of layers) {
      const alpha = layer.data[p + 3]! / 255;
      for (let c = 0; c < 3; c++)
        color[c] = layer.data[p + c]! * alpha + color[c]! * (1 - alpha);
      a = alpha + a * (1 - alpha);
    }
    if (a) {
      for (let c = 0; c < 3; c++) output[p + c] = Math.round(color[c]! / a);
      output[p + 3] = Math.round(a * 255);
    }
  }
  return output;
}
async function run() {
  if (!navigator.gpu)
    return { status: "unsupported", reason: "WebGPU unavailable" };
  const workerUrl = new URL(location.href).searchParams.get("worker");
  if (
    workerUrl &&
    !/^\/assets\/studio-bg3d-tiled-artifact\.worker-[A-Za-z0-9_-]+\.js$/.test(
      workerUrl,
    )
  )
    throw new Error("Invalid production worker path.");
  let activeWorkers = 0,
    peakWorkers = 0,
    workersCreated = 0;
  const workerFactory = () => {
    const worker = new Worker(
      workerUrl ??
        new URL(
          "../../src/domains/creator/bg3d/studio-bg3d-tiled-artifact.worker.ts",
          import.meta.url,
        ),
      { type: "module" },
    );
    activeWorkers++;
    workersCreated++;
    peakWorkers = Math.max(peakWorkers, activeWorkers);
    const terminate = worker.terminate.bind(worker);
    let closed = false;
    worker.terminate = () => {
      if (!closed) {
        closed = true;
        activeWorkers--;
      }
      terminate();
    };
    return worker;
  };
  const gpuCanvas = document.createElement("canvas"),
    glCanvas = document.createElement("canvas");
  document.body.append(gpuCanvas, glCanvas);
  const gpuRuntime = await createStudioBg3dThreeWebGpuRenderer(gpuCanvas, {
    antialias: false,
  });
  const gpu = gpuRuntime.renderer;
  const gl = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: false,
    alpha: true,
  });
  for (const renderer of [gpu, gl]) {
    renderer.setSize(321, 239);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1;
  }
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  const materials = [
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(4, 1, 0.25),
    }),
    new THREE.MeshBasicMaterial({ color: 0x5577ee }),
  ];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(geometry, materials[i % 2]);
    mesh.position.set((i - 1) * 0.85, (i % 2) * 0.35, 0);
    mesh.rotation.set(0.2 + i * 0.1, 0.35 + i * 0.4, 0.12);
    scene.add(mesh);
  }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ color: 0x778899 }),
  );
  floor.position.z = -1.2;
  scene.add(floor);
  const base = {
    line: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line,
      enabled: true,
      strength: 1,
      depthEnabled: true,
      depthStrength: 1,
      depthOutlineOnly: false,
      widthPx: 3,
      smoothing: 0.5,
      textureLineEnabled: true,
      textureLineStrength: 0.9,
      creaseAngleDegrees: 25,
    },
    tone: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone,
      mode: "screentone" as const,
      type: "pattern" as const,
      pattern: "crosshatch" as const,
      angleDegrees: 37,
      opacity: 0.85,
    },
  };
  const passes: StudioBg3dShotBatchPass[] = [
    "beauty",
    "main-line",
    "texture-line",
    "tone",
    "lt-composite",
    "depth",
  ];
  const comparisons = [];
  const targets = new Set<THREE.RenderTarget>(),
    disposed = new Set<THREE.RenderTarget>();
  let largestTargetPixels = 0;
  for (const renderer of [gl, gpu]) {
    const original = renderer.setRenderTarget.bind(renderer);
    renderer.setRenderTarget = ((
      target: THREE.RenderTarget | null,
      ...args: unknown[]
    ) => {
      if (target) {
        largestTargetPixels = Math.max(
          largestTargetPixels,
          target.width * target.height,
        );
        if (!targets.has(target)) {
          targets.add(target);
          target.addEventListener("dispose", () => disposed.add(target));
        }
      }
      return (
        original as (
          target: THREE.RenderTarget | null,
          ...args: unknown[]
        ) => void
      )(target, ...args);
    }) as typeof renderer.setRenderTarget;
  }
  const adapters: StudioBg3dCaptureAdapter[] = [];
  let largeResult: StudioBg3dTiledArtifactResult | undefined;
  try {
    for (const backend of ["webgl2", "webgpu"] as const)
      for (const projection of ["perspective", "orthographic"] as const) {
        const camera =
          projection === "perspective"
            ? new THREE.PerspectiveCamera(48, 321 / 239, 0.1, 30)
            : new THREE.OrthographicCamera(-2.3, 2.3, 1.7, -1.7, 0.1, 30);
        camera.zoom = 1.15;
        if (camera instanceof THREE.PerspectiveCamera) camera.filmOffset = 2.2;
        camera.setViewOffset(500, 400, 17, 23, 440, 340);
        camera.updateProjectionMatrix();
        const parent = new THREE.Group();
        parent.position.set(0.1, 0.2, 0.3);
        parent.add(camera);
        camera.position.set(0.2, 0.2, 4.8);
        camera.lookAt(0, 0, 0);
        parent.updateMatrixWorld(true);
        scene.updateMatrixWorld(true);
        const adapter =
          backend === "webgpu"
            ? createStudioBg3dThreeWebGpuCaptureAdapter({
                renderer: gpu,
                scene,
                camera,
              })
            : createStudioBg3dThreeWebglCaptureAdapter({
                renderer: gl,
                scene,
                camera,
              });
        adapters.push(adapter);
        // Tiled first deliberately exercises the first WebGPU frame of a GL-coordinate camera.
        const original = JSON.stringify(camera.toJSON());
        const events: number[] = [];
        const tiled = await buildStudioBg3dTiledImages({
          adapter,
          options: {
            width: 321,
            height: 239,
            tileWidth: 101,
            bandHeight: 73,
            settings: base,
            passes,
          },
          background: { color: "#000000", alpha: 0 },
          includeDepth: true,
          includeNormals: true,
          workerFactory,
          onProgress: (completed) => events.push(completed),
        });
        assert(
          JSON.stringify(camera.toJSON()) === original,
          "Tiled capture mutated live camera state.",
        );
        const request = {
          width: 321,
          height: 239,
          background: { color: "#000000", alpha: 0 },
          includeDepth: true,
          includeNormals: true,
        };
        const full = await captureStudioBg3dRaster(adapter, request);
        const reference = renderStudioBg3dLtLayers(full, base);
        const metrics = [];
        for (const image of tiled.images) {
          const raw = await decodePng(image.png);
          const selected = selectStudioBg3dShotPassLayers(
            image.pass,
            full,
            reference,
            base,
            createStudioBg3dDepthRasterLayer,
          );
          assert(
            selected.layers,
            "Tiled output returned a pass absent from full-frame reference.",
          );
          const expected = composite(selected.layers, 321, 239);
          let max = 0,
            sum = 0,
            different = 0;
          for (let pixel = 0; pixel < 321 * 239; pixel++) {
            let delta = 0;
            for (let c = 0; c < 4; c++) {
              const d = Math.abs(
                raw.rgba[pixel * 4 + c]! - expected[pixel * 4 + c]!,
              );
              max = Math.max(max, d);
              sum += d;
              delta = Math.max(delta, d);
            }
            if (delta > 2) different++;
          }
          // Raster boundary tie-breaking may differ by one pixel. Report, do not hide, the difference.
          const changedFraction = different / (321 * 239);
          assert(
            changedFraction < 0.005 && sum / raw.rgba.length < 0.4,
            `${backend}/${projection}/${image.pass} full/tile mismatch: ${changedFraction}, max=${max}, mean=${sum / raw.rgba.length}`,
          );
          metrics.push({
            pass: image.pass,
            maxChannelDelta: max,
            pixelsOver2: different,
            meanChannelDelta: sum / raw.rgba.length,
          });
        }
        assert(
          events.length === 16 && events.at(-1) === 16,
          "Progress did not reflect actual tile completion.",
        );
        comparisons.push({
          backend,
          projection,
          metrics,
          skipped: tiled.skipped,
          tileCount: events.length,
          cameraUnchanged: true,
        });
      }
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 30);
    camera.position.set(0.1, 0.2, 4.5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const adapter = createStudioBg3dThreeWebGpuCaptureAdapter({
      renderer: gpu,
      scene,
      camera,
    });
    adapters.push(adapter);
    const largeProgress: number[] = [];
    const started = performance.now();
    largeResult = await buildStudioBg3dTiledImages({
      adapter,
      options: {
        width: 4096,
        height: 4096,
        settings: base,
        passes: ["beauty", "main-line", "tone", "lt-composite", "depth"],
      },
      background: { color: "#000000", alpha: 0 },
      includeDepth: true,
      includeNormals: true,
      workerFactory,
      onProgress: (completed) => largeProgress.push(completed),
    });
    const largeElapsedMs = performance.now() - started;
    assert(
      largeProgress.length === 32 && largeProgress.at(-1) === 32,
      "4096 output did not use the bounded tile plan.",
    );
    const large = [];
    for (const image of largeResult.images) {
      const bitmap = await createImageBitmap(image.png);
      assert(
        bitmap.width === 4096 && bitmap.height === 4096,
        "PNG output silently changed dimensions.",
      );
      const preview = document.createElement("canvas");
      preview.width = 384;
      preview.height = 384;
      preview.dataset.pass = image.pass;
      const ctx = preview.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, 384, 384);
      bitmap.close();
      const title = document.createElement("h2");
      title.textContent = image.pass;
      document.body.append(title, preview);
      large.push({
        pass: image.pass,
        width: 4096,
        height: 4096,
        bytes: image.png.size,
      });
    }
    assert(
      largestTargetPixels <= 1048 * 536,
      "A full-frame or oversized target was allocated in tiled output.",
    );
    const abort = new AbortController();
    let cancelled = false;
    try {
      await buildStudioBg3dTiledImages({
        adapter,
        options: {
          width: 321,
          height: 239,
          tileWidth: 101,
          bandHeight: 73,
          settings: base,
          passes: ["beauty"],
        },
        background: { color: "#000000", alpha: 0 },
        includeDepth: true,
        includeNormals: true,
        workerFactory,
        signal: abort.signal,
        onProgress: (completed) => {
          if (completed === 1) abort.abort();
        },
      });
    } catch (error) {
      cancelled = error instanceof Error && error.name === "AbortError";
    }
    assert(cancelled, "Tile cancellation did not abort output.");
    const psdWorkerUrl = new URL(location.href).searchParams.get("psdWorker");
    if (
      psdWorkerUrl &&
      !/^\/assets\/studio-bg3d-shot-psd\.worker-[A-Za-z0-9_-]+\.js$/.test(
        psdWorkerUrl,
      )
    )
      throw new Error("Invalid production PSD worker path.");
    const originalWorker = window.Worker;
    if (workerUrl)
      window.Worker = class extends originalWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(
            String(url).includes("/studio-bg3d-tiled-artifact.worker.ts")
              ? workerUrl!
              : psdWorkerUrl &&
                  String(url).includes("/studio-bg3d-shot-psd.worker.ts")
                ? psdWorkerUrl
                : url,
            options,
          );
        }
      };
    let savedShotFlow;
    try {
      gpu.setSize(256, 256);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      const { verifyScene3dTiledSavedShotFlow } = await import(
        "./studio-scene3d-tiled-batch-proof"
      );
      savedShotFlow = await verifyScene3dTiledSavedShotFlow(adapter, camera);
    } finally {
      window.Worker = originalWorker;
    }
    for (const adapter of adapters) adapter.dispose?.();
    assert(
      activeWorkers === 0 && peakWorkers === 1,
      "Tiled output leaked or overlapped processing Workers.",
    );
    assert(
      targets.size === disposed.size,
      "Captured renderer resources were not all disposed.",
    );
    const device = (
      gpu.backend as unknown as {
        device?: {
          adapterInfo?: {
            vendor?: string;
            architecture?: string;
            isFallbackAdapter?: boolean;
          };
        };
      }
    ).device;
    return {
      status: "ok",
      comparisons,
      savedShotFlow,
      largeOutput: {
        passes: large,
        tiles: 32,
        maxCaptureTargetPixels: largestTargetPixels,
        elapsedMs: largeElapsedMs,
        psd: "not-requested-not-certified",
      },
      cancellation: cancelled,
      workers: {
        created: workersCreated,
        active: activeWorkers,
        peak: peakWorkers,
      },
      targets: { created: targets.size, disposed: disposed.size },
      actualDevice: device?.adapterInfo
        ? {
            vendor: device.adapterInfo.vendor,
            architecture: device.adapterInfo.architecture,
            isFallbackAdapter: device.adapterInfo.isFallbackAdapter,
          }
        : null,
      productionWorker: workerUrl,
    };
  } finally {
    for (const adapter of adapters) adapter.dispose?.();
    await gpuRuntime.dispose();
    gl.dispose();
    gl.forceContextLoss();
    geometry.dispose();
    materials.forEach((material) => material.dispose());
    floor.geometry.dispose();
    (floor.material as THREE.Material).dispose();
  }
}
void run()
  .then((proof) => {
    window.__scene3dTiledProof = proof;
  })
  .catch((error: unknown) => {
    window.__scene3dTiledProof = {
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    };
  });
