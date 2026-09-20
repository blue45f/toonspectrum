import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene,
  DirectionalLight, AmbientLight, WebGPURenderer, RenderTarget } from "three/webgpu";

import { StudioBg3dGpuDiagnostics } from "../../src/domains/creator/bg3d/StudioBg3dGpuDiagnostics";
import { createStudioScene3dGpuDiagnostics } from "../../src/domains/creator/scene3d/studio-scene3d-gpu-diagnostics";

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
const wait = async (test: () => boolean) => {
  const until = performance.now() + 10_000;
  while (!test()) { if (performance.now() > until) throw new Error("Proof timed out");
    await new Promise((resolve) => setTimeout(resolve, 10)); }
};
async function run() {
  if (!navigator.gpu) return { status: "unsupported", reason: "no-webgpu" };
  const renderer = new WebGPURenderer({ antialias: true, trackTimestamp: false });
  await renderer.init();
  renderer.setSize(320, 240);
  document.body.append(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 4 / 3, 0.1, 100);
  camera.position.set(3, 2, 4); camera.lookAt(0, 0, 0);
  const geometry = new BoxGeometry(); const material = new MeshStandardMaterial();
  const mesh = new Mesh(geometry, material); scene.add(mesh);
  const light = new DirectionalLight(0xffffff, 2); light.position.set(3, 4, 2);
  scene.add(light, new AmbientLight(0xffffff, 0.4));
  const backend = renderer.backend as unknown as {
    isWebGPUBackend?: boolean; trackTimestamp: boolean; device: GPUDevice;
    resolveTimestampsAsync(type: string): Promise<unknown>;
    timestampQueryPool: { render?: { timestamps: Map<string, number>; currentQueryIndex: number } };
  };
  const trace: unknown[] = [];
  Object.assign(window, { __gpuTrace: trace });
  const nativeResolve = backend.resolveTimestampsAsync;
  backend.resolveTimestampsAsync = function (type: string) {
    const snap = () => {
      const pool = this.timestampQueryPool.render as unknown as Record<string, unknown>;
      return { count: pool?.currentQueryIndex, offsets: pool?.queryOffsets instanceof Map ? [...pool.queryOffsets] : null,
        times: pool?.timestamps instanceof Map ? [...pool.timestamps] : null, pending: Boolean(pool?.pendingResolve) };
    };
    trace.push({ phase: "before-resolve", ...snap() });
    const pending = nativeResolve.call(this, type);
    trace.push({ phase: "after-start", ...snap() });
    return pending.then((value) => { trace.push({ phase: "resolved", value, ...snap() }); return value; });
  };
  const diagnostics = createStudioScene3dGpuDiagnostics();
  const original = renderer.render;
  const detach = diagnostics.attach(renderer, () => { renderer.render(scene, camera); });
  const host = document.createElement("div"); document.body.append(host);
  const ui = createRoot(host); ui.render(createElement(StudioBg3dGpuDiagnostics, { diagnostics }));
  const target = new RenderTarget(32, 32);
  try {
    if (!diagnostics.getSnapshot().canRequest) return { status: "unsupported", reason: diagnostics.getSnapshot().reason };
    assert(backend.isWebGPUBackend === true, "Actual backend must be WebGPU");
    for (let i = 0; i < 4; i++) renderer.render(scene, camera);
    await wait(() => host.querySelector("button") !== null);
    (host.querySelector("button") as HTMLButtonElement).click();
    await wait(() => !diagnostics.getSnapshot().busy);
    assert(diagnostics.getSnapshot().sample, `No UI GPU sample: ${diagnostics.getSnapshot().reason}`);
    const samples = [diagnostics.getSnapshot().sample];
    for (let i = 0; i < 12; i++) {
      mesh.rotation.y += 0.05;
      diagnostics.request(); await wait(() => !diagnostics.getSnapshot().busy);
      assert(diagnostics.getSnapshot().sample, `No repeat sample: ${diagnostics.getSnapshot().reason}`);
      samples.push(diagnostics.getSnapshot().sample);
      assert(backend.timestampQueryPool.render?.timestamps.size === 0, "Retained timestamp keys");
      assert(renderer.render === original && !backend.trackTimestamp, "Instrumentation was not restored");
    }
    renderer.setRenderTarget(target);
    diagnostics.request();
    assert(diagnostics.getSnapshot().reason === "waiting-for-frame", "Capture was incorrectly measured");
    diagnostics.cancel(); renderer.setRenderTarget(null);
    diagnostics.setPaused(true); diagnostics.request();
    assert(diagnostics.getSnapshot().reason === "paused", "Paused viewport allowed a sample");
    diagnostics.setPaused(false); diagnostics.request();
    await wait(() => !diagnostics.getSnapshot().busy);
    await wait(() => host.textContent?.includes("GPU 패스 합계") === true);
    const info = backend.device.adapterInfo;
    return { status: "ok", samples, repeats: samples.length,
      actualDevice: { vendor: info.vendor, architecture: info.architecture, description: info.description },
      retainedTimestampKeys: backend.timestampQueryPool.render?.timestamps.size,
      rendererRestored: renderer.render === original, trackTimestamp: backend.trackTimestamp,
      capturedTargetsSkipped: true, pausedSamplesBlocked: true, uiSampleDisplayed: true };
  } finally {
    detach(); ui.unmount(); target.dispose(); geometry.dispose(); material.dispose(); renderer.dispose();
  }
}
void run().then((proof) => {
  Object.assign(window, { __scene3dGpuProof: proof });
}, (error: unknown) => {
  Object.assign(window, { __scene3dGpuProof: { status: "failed", error: String(error) } });
});
