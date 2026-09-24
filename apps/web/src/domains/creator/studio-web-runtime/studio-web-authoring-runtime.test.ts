import { describe, expect, it } from "vitest";

import {
  buildStudioWebAuthoringRuntimePlan,
  type StudioWebAuthoringCapabilityEvidence,
} from "./studio-web-authoring-runtime";

function evidence(
  patch: Partial<StudioWebAuthoringCapabilityEvidence> = {},
): StudioWebAuthoringCapabilityEvidence {
  return {
    secureContext: true,
    webAssembly: true,
    wasmSimd: true,
    wasmThreads: true,
    moduleWorker: true,
    offscreenCanvas: true,
    webgpu: true,
    webgl2: true,
    sharedArrayBuffer: true,
    crossOriginIsolated: true,
    opfs: true,
    indexedDb: true,
    webCrypto: true,
    mediaDevices: true,
    fileSystemAccess: true,
    ...patch,
  };
}

describe("Studio browser-first 3D runtime", () => {
  it("keeps every production kernel inside the browser even when it uses WASM", () => {
    const plan = buildStudioWebAuthoringRuntimePlan(evidence());

    expect(plan.primaryEnvironment).toBe("browser");
    expect(plan.nativeRequired).toBe(false);
    expect(plan.browserRunnable).toBe(true);
    expect(plan.offlineCapable).toBe(true);
    expect(plan.kernels.every((kernel) => kernel.nativeRequired === false)).toBe(true);
    expect(plan.kernels.find((kernel) => kernel.id === "mesh-boolean")).toMatchObject({
      providerId: "manifold-wasm-worker",
      execution: "browser-wasm-worker",
      status: "ready",
    });
    expect(plan.kernels.find((kernel) => kernel.id === "cad-brep")).toMatchObject({
      providerId: "occt-wasm-worker",
      execution: "browser-wasm-worker",
      status: "ready",
    });
  });

  it("uses web fallbacks instead of requiring a desktop host", () => {
    const plan = buildStudioWebAuthoringRuntimePlan(evidence({
      webgpu: false,
      moduleWorker: false,
      offscreenCanvas: false,
      opfs: false,
      wasmThreads: false,
      crossOriginIsolated: false,
      sharedArrayBuffer: false,
    }));

    expect(plan.nativeRequired).toBe(false);
    expect(plan.kernels.find((kernel) => kernel.id === "interactive-renderer")).toMatchObject({
      providerId: "three-webgl2",
      execution: "browser-webgl2",
    });
    expect(plan.kernels.find((kernel) => kernel.id === "cad-brep")).toMatchObject({
      providerId: "occt-wasm-main",
      execution: "browser-wasm-main",
    });
    expect(plan.kernels.find((kernel) => kernel.id === "persistent-storage")).toMatchObject({
      providerId: "indexeddb-project-store",
      execution: "browser-main",
    });
    expect(plan.kernels.find((kernel) => kernel.id === "semantic-output")).toMatchObject({
      providerId: "cooperative-main-thread-output",
      execution: "browser-main",
    });
  });

  it("fails closed only when the browser has no interactive GPU API", () => {
    const plan = buildStudioWebAuthoringRuntimePlan(evidence({
      webgpu: false,
      webgl2: false,
      indexedDb: false,
      opfs: false,
    }));

    expect(plan.browserRunnable).toBe(false);
    expect(plan.offlineCapable).toBe(false);
    expect(plan.kernels.find((kernel) => kernel.id === "interactive-renderer")?.status).toBe("unavailable");
    expect(plan.kernels.find((kernel) => kernel.id === "persistent-storage")?.status).toBe("unavailable");
  });
});
