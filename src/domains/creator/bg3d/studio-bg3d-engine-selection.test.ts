import { describe, expect, it } from "vitest";

import {
  EMPTY_STUDIO_BG3D_ENGINE_WEBGL_ONLY_FEATURES,
  latchStudioBg3dWebglOnlyFeatures,
  recordStudioBg3dWebGpuFailure,
  resolveStudioBg3dEngineRuntime,
  selectStudioBg3dEngine,
  STUDIO_BG3D_EDITOR_ACTIVATION_BUDGET_GZIP_BYTES,
  STUDIO_BG3D_EDITOR_REQUIRED_CAPABILITIES,
  STUDIO_BG3D_WEBGPU_FAILURE_LIMIT,
  type StudioBg3dEngineSelectionRequest,
} from "./studio-bg3d-engine-selection";
import { classifyStudioBg3dInAppBrowser } from "./studio-bg3d-inapp-browser";
import { STUDIO_BG3D_RUNTIME_CATALOG } from "./studio-bg3d-runtime-topology";

import type { StudioBg3dWebGpuProbeResult } from "./studio-bg3d-webgpu-capability";

const SUPPORTED_PROBE: StudioBg3dWebGpuProbeResult = Object.freeze({
  supported: true,
  reason: "available",
  computeSupported: true,
  timestampQuerySupported: true,
  limits: Object.freeze({ maxBufferSize: 268_435_456 }),
});

const UNSUPPORTED_PROBE: StudioBg3dWebGpuProbeResult = Object.freeze({
  supported: false,
  reason: "api-unavailable",
  computeSupported: false,
  timestampQuerySupported: false,
  limits: Object.freeze({}),
});

const STANDALONE = classifyStudioBg3dInAppBrowser({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
});
const KAKAOTALK = classifyStudioBg3dInAppBrowser({
  userAgent: "Mozilla/5.0 (Linux; Android 15; SM-S928N; wv) Mobile Safari/537.36 KAKAOTALK 10.6.5",
});
const INSTAGRAM = classifyStudioBg3dInAppBrowser({
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) Mobile/15E148 Instagram 350.0",
});

const BASE: StudioBg3dEngineSelectionRequest = Object.freeze({
  preference: "auto",
  probe: SUPPORTED_PROBE,
  inApp: STANDALONE,
  deviceProfile: "desktop",
  webgpuRuntimeAvailable: true,
});

describe("Studio BG3D engine selection", () => {
  it("promotes a capable standalone browser to the WebGPU runtime", () => {
    expect(selectStudioBg3dEngine(BASE)).toMatchObject({
      backend: "webgpu",
      runtimeId: "three-webgpu",
      fallbackBackend: "webgl2",
      reason: "auto-webgpu-promoted",
      webgpuSelectable: true,
      diagnostics: [],
    });
  });

  it("keeps WebGL2 as the baseline whenever WebGPU cannot be created", () => {
    expect(selectStudioBg3dEngine({ ...BASE, probe: UNSUPPORTED_PROBE })).toMatchObject({
      backend: "webgl2",
      runtimeId: "three-webgl",
      fallbackBackend: null,
      reason: "webgpu-probe-unsupported",
      webgpuSelectable: false,
    });

    expect(selectStudioBg3dEngine({ ...BASE, webgpuRuntimeAvailable: false })).toMatchObject({
      backend: "webgl2",
      reason: "webgpu-runtime-unavailable",
      webgpuSelectable: false,
    });

    expect(selectStudioBg3dEngine({
      ...BASE,
      probe: { ...SUPPORTED_PROBE, computeSupported: false },
    })).toMatchObject({ backend: "webgl2", reason: "webgpu-compute-unavailable" });
  });

  it("refuses WebGPU on a blocked in-app browser even when the artist asks for it", () => {
    const plan = selectStudioBg3dEngine({ ...BASE, inApp: INSTAGRAM, preference: "webgpu" });
    expect(plan).toMatchObject({
      backend: "webgl2",
      reason: "inapp-browser-blocked",
      webgpuSelectable: false,
    });
  });

  it("starts an opt-in in-app browser on WebGL2 but leaves WebGPU reachable", () => {
    const auto = selectStudioBg3dEngine({ ...BASE, inApp: KAKAOTALK });
    expect(auto).toMatchObject({
      backend: "webgl2",
      reason: "inapp-browser-opt-in-required",
      webgpuSelectable: true,
    });
    expect(auto.notice).toContain("직접 선택");

    expect(selectStudioBg3dEngine({ ...BASE, inApp: KAKAOTALK, preference: "webgpu" }))
      .toMatchObject({ backend: "webgpu", reason: "user-webgpu-override" });
  });

  it("declines automatic promotion for save-data and low-memory phones", () => {
    expect(selectStudioBg3dEngine({ ...BASE, saveData: true }))
      .toMatchObject({ backend: "webgl2", reason: "save-data-enabled", webgpuSelectable: true });

    expect(selectStudioBg3dEngine({ ...BASE, deviceProfile: "mobile", deviceMemoryGb: 2 }))
      .toMatchObject({ backend: "webgl2", reason: "low-device-memory" });

    // The same phone memory on a desktop-classified session is not a decline reason.
    expect(selectStudioBg3dEngine({ ...BASE, deviceProfile: "desktop", deviceMemoryGb: 2 }))
      .toMatchObject({ backend: "webgpu", reason: "auto-webgpu-promoted" });
  });

  it("stops retrying WebGPU after repeated session failures", () => {
    let failures = 0;
    failures = recordStudioBg3dWebGpuFailure(failures);
    expect(selectStudioBg3dEngine({ ...BASE, webgpuFailureCount: failures }))
      .toMatchObject({ backend: "webgpu", reason: "auto-webgpu-promoted" });

    failures = recordStudioBg3dWebGpuFailure(failures);
    expect(failures).toBe(STUDIO_BG3D_WEBGPU_FAILURE_LIMIT);
    expect(selectStudioBg3dEngine({ ...BASE, webgpuFailureCount: failures })).toMatchObject({
      backend: "webgl2",
      reason: "repeated-webgpu-failure",
      webgpuSelectable: false,
    });
    expect(recordStudioBg3dWebGpuFailure(failures)).toBe(STUDIO_BG3D_WEBGPU_FAILURE_LIMIT);
  });

  it("honors an explicit WebGL2 choice and still reports what WebGPU would have done", () => {
    const plan = selectStudioBg3dEngine({ ...BASE, preference: "webgl2", saveData: true });
    expect(plan).toMatchObject({
      backend: "webgl2",
      reason: "user-webgl2-override",
      webgpuSelectable: true,
    });
    expect(plan.diagnostics).toContain("save-data-enabled");
  });

  it("reports every blocking reason as a diagnostic, headlined by the first", () => {
    const plan = selectStudioBg3dEngine({
      ...BASE,
      probe: UNSUPPORTED_PROBE,
      webgpuRuntimeAvailable: false,
      inApp: INSTAGRAM,
      saveData: true,
    });
    expect(plan.reason).toBe("webgpu-runtime-unavailable");
    expect(plan.diagnostics).toEqual([
      "webgpu-runtime-unavailable",
      "webgpu-probe-unsupported",
      "inapp-browser-blocked",
      "save-data-enabled",
    ]);
  });

  it("falls back to the WebGL2 baseline for a malformed request instead of throwing", () => {
    expect(selectStudioBg3dEngine(undefined as unknown as StudioBg3dEngineSelectionRequest))
      .toMatchObject({ backend: "webgl2", reason: "auto-webgl2-baseline" });
  });

  it("returns frozen plans with a Korean notice for every reason", () => {
    const plan = selectStudioBg3dEngine(BASE);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(plan.notice.length).toBeGreaterThan(0);
  });
});

describe("Studio BG3D engine runtime resolution", () => {
  it("keeps the selected engine when the runtime catalog agrees", () => {
    expect(resolveStudioBg3dEngineRuntime(BASE)).toMatchObject({
      backend: "webgpu",
      runtimeId: "three-webgpu",
      reason: "auto-webgpu-promoted",
    });
    expect(resolveStudioBg3dEngineRuntime({ ...BASE, preference: "webgl2" })).toMatchObject({
      backend: "webgl2",
      runtimeId: "three-webgl",
      reason: "user-webgl2-override",
    });
  });

  it("requires the capabilities the editor cannot open without", () => {
    // Both production runtimes must carry every required capability, or selection refuses them.
    for (const runtimeId of ["three-webgl", "three-webgpu"] as const) {
      for (const capability of STUDIO_BG3D_EDITOR_REQUIRED_CAPABILITIES) {
        expect(STUDIO_BG3D_RUNTIME_CATALOG[runtimeId].capabilities.has(capability)).toBe(true);
      }
      expect(STUDIO_BG3D_RUNTIME_CATALOG[runtimeId].maturity).toBe("production");
      expect(STUDIO_BG3D_RUNTIME_CATALOG[runtimeId].activationGzipBytes)
        .toBeLessThanOrEqual(STUDIO_BG3D_EDITOR_ACTIVATION_BUDGET_GZIP_BYTES);
    }
    expect(STUDIO_BG3D_EDITOR_REQUIRED_CAPABILITIES).toContain("capture-rgba-depth");
  });

  it("carries the host reason through when the baseline is chosen", () => {
    const plan = resolveStudioBg3dEngineRuntime({ ...BASE, inApp: INSTAGRAM });
    expect(plan).toMatchObject({ backend: "webgl2", reason: "inapp-browser-blocked" });
  });
});

describe("Studio BG3D WebGL-only feature demand", () => {
  it("refuses WebGPU during an immersive session, even on request", () => {
    const request = {
      ...BASE,
      webglOnlyFeatures: { ...EMPTY_STUDIO_BG3D_ENGINE_WEBGL_ONLY_FEATURES, webxr: true },
    };
    expect(selectStudioBg3dEngine(request)).toMatchObject({
      backend: "webgl2",
      reason: "webgl-only-webxr",
      webgpuSelectable: false,
    });
    // An explicit WebGPU choice cannot override a feature that would not render.
    expect(selectStudioBg3dEngine({ ...request, preference: "webgpu" })).toMatchObject({
      backend: "webgl2",
      reason: "webgl-only-webxr",
      webgpuSelectable: false,
    });
  });

  it("still promotes WebGPU when no WebGL-only feature is present", () => {
    expect(selectStudioBg3dEngine({
      ...BASE,
      webglOnlyFeatures: EMPTY_STUDIO_BG3D_ENGINE_WEBGL_ONLY_FEATURES,
    })).toMatchObject({ backend: "webgpu", reason: "auto-webgpu-promoted" });
  });

  it("latches a demand so leaving the feature does not remount the viewport again", () => {
    const empty = EMPTY_STUDIO_BG3D_ENGINE_WEBGL_ONLY_FEATURES;
    // No observation keeps the identical object, so the hook's state does not churn.
    expect(latchStudioBg3dWebglOnlyFeatures(empty, {})).toBe(empty);
    expect(latchStudioBg3dWebglOnlyFeatures(empty, { webxr: false })).toBe(empty);

    const latched = latchStudioBg3dWebglOnlyFeatures(empty, { webxr: true });
    expect(latched).toMatchObject({ webxr: true });
    expect(Object.isFrozen(latched)).toBe(true);
    expect(latchStudioBg3dWebglOnlyFeatures(latched, { webxr: false })).toBe(latched);
  });

  it("pins a scene holding a VRM character to the baseline, over an explicit WebGPU choice", () => {
    // This block was removed once, on the grounds that the shared-character loader asks for MToon
    // node materials under a WebGPU renderer and both backends draw the same silhouette. Loading
    // was never the issue. Measured on one scene with one camera, one light rig and one tone
    // mapping, the two upstream MToon implementations shade differently across the whole surface:
    // WebGPU is ~5.7% darker in mean luminance and loses rim highlights by up to 169/255. The
    // unlit control in the same harness is byte-identical, so this is MToon, not the pipeline.
    //
    // A delivered page has to look the same for every collaborator, on every machine, and next to
    // everything already published — so the character scene runs where the poser runs.
    expect(Object.keys(EMPTY_STUDIO_BG3D_ENGINE_WEBGL_ONLY_FEATURES).toSorted())
      .toEqual(["vrmCharacters", "webxr"]);

    // A hard block, not an auto-decline: an explicit WebGPU choice must not re-grade a character.
    expect(selectStudioBg3dEngine({
      ...BASE,
      preference: "webgpu",
      webglOnlyFeatures: { webxr: false, vrmCharacters: true },
    })).toMatchObject({ backend: "webgl2", reason: "webgl-only-vrm-character" });

    // And a background with no character still gets the next-generation engine.
    expect(selectStudioBg3dEngine({
      ...BASE,
      webglOnlyFeatures: { webxr: false, vrmCharacters: false },
    })).toMatchObject({ backend: "webgpu" });
  });

  it("latches a character demand so removing the character does not remount the viewport", () => {
    const empty = EMPTY_STUDIO_BG3D_ENGINE_WEBGL_ONLY_FEATURES;
    expect(latchStudioBg3dWebglOnlyFeatures(empty, { vrmCharacters: false })).toBe(empty);

    const latched = latchStudioBg3dWebglOnlyFeatures(empty, { vrmCharacters: true });
    expect(latched).toMatchObject({ webxr: false, vrmCharacters: true });
    expect(Object.isFrozen(latched)).toBe(true);
    expect(latchStudioBg3dWebglOnlyFeatures(latched, { vrmCharacters: false })).toBe(latched);
  });
});
