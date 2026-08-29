/**
 * Next-generation 3D engine admission policy for the background editor.
 *
 * The editor ships two interactive backends: the long-standing Three/WebGL2 renderer and the
 * Three WebGPU renderer. This module is the single authority that decides which one owns the
 * interactive canvas for a given session, and it is deliberately pure — no `navigator`, no
 * `GPUAdapter`, no renderer construction. Adapters probe capabilities, classify the host, and hand
 * the observations in, so a unit test, a worker, and a real in-app WebView all reach the same
 * decision.
 *
 * Two properties matter more than raw capability here:
 *
 * 1. **Fail closed.** Anything unknown resolves to WebGL2, which every supported host already runs.
 *    A wrong "WebGPU is fine" answer costs the artist a dead viewport mid-drawing; a wrong "stay on
 *    WebGL2" answer costs some frame time.
 * 2. **Explain the decision.** Every plan carries a machine-readable reason and a Korean notice so
 *    the status surface can tell the artist why the engine they see is the engine they got.
 */

import {
  planStudioBg3dRuntimeTopology,
  type StudioBg3dRuntimeCapability,
  type StudioBg3dRuntimeId,
} from "./studio-bg3d-runtime-topology";

import type { StudioBg3dDeviceProfile } from "./studio-bg3d-device-quality";
import type { StudioBg3dInAppBrowserProfile } from "./studio-bg3d-inapp-browser";
import type { StudioBg3dWebGpuProbeResult } from "./studio-bg3d-webgpu-capability";

export type StudioBg3dEngineBackend = "webgl2" | "webgpu";
export type StudioBg3dEnginePreference = "auto" | StudioBg3dEngineBackend;

export type StudioBg3dEngineSelectionReason =
  | "auto-webgpu-promoted"
  | "auto-webgl2-baseline"
  | "user-webgpu-override"
  | "user-webgl2-override"
  | "webgpu-runtime-unavailable"
  | "webgpu-probe-unsupported"
  | "webgpu-compute-unavailable"
  | "inapp-browser-blocked"
  | "inapp-browser-opt-in-required"
  | "save-data-enabled"
  | "low-device-memory"
  | "repeated-webgpu-failure"
  | "runtime-capability-unavailable"
  | "webgl-only-webxr";

/**
 * Consecutive WebGPU initialization or device-loss failures after which `auto` stops retrying for
 * the rest of the session. One transient failure is worth a retry; a second is a pattern.
 */
export const STUDIO_BG3D_WEBGPU_FAILURE_LIMIT = 2;

/** A WebGPU device on a phone with less memory than this competes with the host app and loses. */
export const STUDIO_BG3D_WEBGPU_MIN_DEVICE_MEMORY_GB = 4;

/**
 * Editor features that only the WebGL2 renderer can serve today. These are not preferences: each
 * one would render incorrectly or fail to load on WebGPU, so any of them present forces the
 * baseline even when the artist explicitly asked for WebGPU.
 *
 * - `webxr`: the immersive session bridge drives `WebGLRenderer.xr`; Three's WebGPU XR path is not
 *   yet equivalent.
 *
 * VRM characters used to belong here, because MToon's appearance is a `ShaderMaterial` a WebGPU
 * renderer cannot build. They no longer do: the shared-character loader now asks
 * `@pixiv/three-vrm` for `MToonNodeMaterial` when a WebGPU renderer owns the canvas, and the
 * real-Chromium verifier renders the same VRM through both backends to the same silhouette.
 */
export interface StudioBg3dEngineWebglOnlyFeatures {
  readonly webxr: boolean;
}

export const EMPTY_STUDIO_BG3D_ENGINE_WEBGL_ONLY_FEATURES: StudioBg3dEngineWebglOnlyFeatures =
  Object.freeze({ webxr: false });

/**
 * Latches a WebGL-only demand for the rest of the session. Leaving an immersive session does not
 * release the latch on purpose: releasing it would swap the renderer and remount the canvas a
 * second time, so a session that is entered and left would rebuild the viewport every time.
 */
export function latchStudioBg3dWebglOnlyFeatures(
  current: StudioBg3dEngineWebglOnlyFeatures,
  observed: Partial<StudioBg3dEngineWebglOnlyFeatures>,
): StudioBg3dEngineWebglOnlyFeatures {
  const next = { webxr: current.webxr || observed.webxr === true };
  return next.webxr === current.webxr ? current : Object.freeze(next);
}

export interface StudioBg3dEngineSelectionRequest {
  readonly preference: StudioBg3dEnginePreference;
  readonly probe: StudioBg3dWebGpuProbeResult;
  readonly inApp: StudioBg3dInAppBrowserProfile;
  readonly deviceProfile: StudioBg3dDeviceProfile;
  /** True when the build actually emits the lazily loaded WebGPU renderer chunk. */
  readonly webgpuRuntimeAvailable: boolean;
  readonly saveData?: boolean;
  readonly deviceMemoryGb?: number;
  /** WebGPU initialization/device-loss failures already recorded for this session. */
  readonly webgpuFailureCount?: number;
  /** Features present in this session that only the WebGL2 renderer can serve. */
  readonly webglOnlyFeatures?: StudioBg3dEngineWebglOnlyFeatures;
}

export interface StudioBg3dEngineSelectionPlan {
  readonly backend: StudioBg3dEngineBackend;
  readonly runtimeId: StudioBg3dRuntimeId;
  /** Backend the editor must switch to when the selected backend fails at runtime. */
  readonly fallbackBackend: StudioBg3dEngineBackend | null;
  readonly reason: StudioBg3dEngineSelectionReason;
  /** True when WebGPU is reachable by an explicit user choice even if `auto` declined it. */
  readonly webgpuSelectable: boolean;
  /** Korean, user-facing, single sentence for the engine status surface. */
  readonly notice: string;
  /** Secondary observations worth surfacing in diagnostics; never a decision input. */
  readonly diagnostics: readonly StudioBg3dEngineSelectionReason[];
}

const BACKEND_RUNTIME_IDS: Readonly<Record<StudioBg3dEngineBackend, StudioBg3dRuntimeId>> =
  Object.freeze({
    webgl2: "three-webgl",
    webgpu: "three-webgpu",
  });

const NOTICES: Readonly<Record<StudioBg3dEngineSelectionReason, string>> = Object.freeze({
  "auto-webgpu-promoted": "차세대 WebGPU 엔진으로 실행 중입니다.",
  "auto-webgl2-baseline": "안정성 기준인 WebGL2 엔진으로 실행 중입니다.",
  "user-webgpu-override": "직접 선택한 WebGPU 엔진으로 실행 중입니다.",
  "user-webgl2-override": "직접 선택한 WebGL2 엔진으로 실행 중입니다.",
  "webgpu-runtime-unavailable": "이 빌드에는 WebGPU 엔진이 포함되어 있지 않아 WebGL2로 실행합니다.",
  "webgpu-probe-unsupported": "이 브라우저가 WebGPU를 지원하지 않아 WebGL2로 실행합니다.",
  "webgpu-compute-unavailable": "WebGPU 컴퓨트 기능을 쓸 수 없어 WebGL2로 실행합니다.",
  "inapp-browser-blocked": "이 인앱 브라우저에서는 WebGPU가 불안정해 WebGL2로 실행합니다.",
  "inapp-browser-opt-in-required":
    "인앱 브라우저에서는 WebGL2로 시작합니다. 필요하면 WebGPU를 직접 선택할 수 있습니다.",
  "save-data-enabled": "데이터 절약 모드가 켜져 있어 가벼운 WebGL2 엔진으로 실행합니다.",
  "low-device-memory": "기기 메모리가 충분하지 않아 WebGL2 엔진으로 실행합니다.",
  "repeated-webgpu-failure": "WebGPU 초기화가 반복 실패해 이번 세션은 WebGL2로 실행합니다.",
  "runtime-capability-unavailable":
    "선택한 엔진이 편집기에 필요한 기능을 모두 제공하지 않아 WebGL2로 실행합니다.",
  "webgl-only-webxr": "몰입형(WebXR) 보기를 사용하는 동안에는 WebGL2 엔진으로 실행합니다.",
});

export const STUDIO_BG3D_ENGINE_PREFERENCES: readonly StudioBg3dEnginePreference[] = Object.freeze([
  "auto",
  "webgpu",
  "webgl2",
]);

/** Korean labels for the engine preference control. */
export const STUDIO_BG3D_ENGINE_PREFERENCE_LABELS: Readonly<
  Record<StudioBg3dEnginePreference, string>
> = Object.freeze({
  auto: "자동",
  webgpu: "WebGPU",
  webgl2: "WebGL2",
});

/** Persisted values are user data; anything unrecognized restores the safe automatic policy. */
export function normalizeStudioBg3dEnginePreference(value: unknown): StudioBg3dEnginePreference {
  return STUDIO_BG3D_ENGINE_PREFERENCES.includes(value as StudioBg3dEnginePreference)
    ? (value as StudioBg3dEnginePreference)
    : "auto";
}

function plan(
  backend: StudioBg3dEngineBackend,
  reason: StudioBg3dEngineSelectionReason,
  webgpuSelectable: boolean,
  diagnostics: readonly StudioBg3dEngineSelectionReason[],
): StudioBg3dEngineSelectionPlan {
  return Object.freeze({
    backend,
    runtimeId: BACKEND_RUNTIME_IDS[backend],
    fallbackBackend: backend === "webgpu" ? "webgl2" : null,
    reason,
    webgpuSelectable,
    notice: NOTICES[reason],
    diagnostics: Object.freeze([...new Set(diagnostics)]),
  });
}

function normalizedFailureCount(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value ?? 0) : 0;
}

/**
 * Collects every reason WebGPU is not usable at all. An empty result means a WebGPU device can be
 * created; it does not yet mean `auto` should choose one.
 */
function collectHardBlocks(
  request: StudioBg3dEngineSelectionRequest,
): readonly StudioBg3dEngineSelectionReason[] {
  const blocks: StudioBg3dEngineSelectionReason[] = [];
  if (!request.webgpuRuntimeAvailable) blocks.push("webgpu-runtime-unavailable");
  if (!request.probe?.supported) blocks.push("webgpu-probe-unsupported");
  else if (!request.probe.computeSupported) blocks.push("webgpu-compute-unavailable");
  if (request.inApp?.gpuTrust === "blocked") blocks.push("inapp-browser-blocked");
  if (normalizedFailureCount(request.webgpuFailureCount) >= STUDIO_BG3D_WEBGPU_FAILURE_LIMIT) {
    blocks.push("repeated-webgpu-failure");
  }
  const features = request.webglOnlyFeatures;
  if (features?.webxr === true) blocks.push("webgl-only-webxr");
  return blocks;
}

/**
 * Collects reasons `auto` declines a WebGPU device that is otherwise available. These are advisory:
 * an explicit user choice still wins, because the artist can see the result and switch back.
 */
function collectAutoDeclines(
  request: StudioBg3dEngineSelectionRequest,
): readonly StudioBg3dEngineSelectionReason[] {
  const declines: StudioBg3dEngineSelectionReason[] = [];
  if (request.inApp?.gpuTrust === "opt-in") declines.push("inapp-browser-opt-in-required");
  if (request.saveData === true) declines.push("save-data-enabled");
  const memory = request.deviceMemoryGb;
  if (
    request.deviceProfile === "mobile" &&
    Number.isFinite(memory) &&
    (memory ?? 0) < STUDIO_BG3D_WEBGPU_MIN_DEVICE_MEMORY_GB
  ) {
    declines.push("low-device-memory");
  }
  return declines;
}

/**
 * Resolves the interactive backend for one editor session.
 *
 * A malformed request resolves to the WebGL2 baseline rather than throwing; the editor must always
 * be able to open a viewport.
 */
export function selectStudioBg3dEngine(
  request: StudioBg3dEngineSelectionRequest,
): StudioBg3dEngineSelectionPlan {
  if (!request || typeof request !== "object") {
    return plan("webgl2", "auto-webgl2-baseline", false, []);
  }
  const hardBlocks = collectHardBlocks(request);
  const autoDeclines = collectAutoDeclines(request);
  const webgpuSelectable = hardBlocks.length === 0;

  if (request.preference === "webgl2") {
    return plan("webgl2", "user-webgl2-override", webgpuSelectable, [
      ...hardBlocks,
      ...autoDeclines,
    ]);
  }
  if (!webgpuSelectable) {
    // The first hard block is the headline; the rest stay as diagnostics.
    return plan("webgl2", hardBlocks[0]!, false, [...hardBlocks, ...autoDeclines]);
  }
  if (request.preference === "webgpu") {
    return plan("webgpu", "user-webgpu-override", true, autoDeclines);
  }
  if (autoDeclines.length > 0) {
    return plan("webgl2", autoDeclines[0]!, true, autoDeclines);
  }
  return plan("webgpu", "auto-webgpu-promoted", true, []);
}

/**
 * Capabilities the interactive background editor cannot open without. `capture-rgba-depth` is on
 * the list because the line-and-tone pipeline and the studio insert flow both read the editor's
 * capture adapter; a renderer that cannot produce that raster is not a candidate, however fast it
 * draws.
 */
export const STUDIO_BG3D_EDITOR_REQUIRED_CAPABILITIES: readonly StudioBg3dRuntimeCapability[] =
  Object.freeze(["interactive-editing", "capture-rgba-depth"]);

/** Headroom for the largest single production runtime (`three-webgpu`, 210,000 gzip bytes). */
export const STUDIO_BG3D_EDITOR_ACTIVATION_BUDGET_GZIP_BYTES = 260_000;

const PRODUCTION_RUNTIME_IDS: readonly StudioBg3dRuntimeId[] = Object.freeze([
  "three-webgl",
  "three-webgpu",
]);

/**
 * Resolves the interactive engine and then confirms the choice against the runtime topology
 * policy, which owns capabilities, maturity, and the activation budget.
 *
 * Running both is the point: the selection policy knows about hosts and devices, the topology
 * policy knows what each runtime can actually do. If a runtime ever loses a capability the editor
 * depends on, this stops selecting it instead of opening a viewport that cannot capture.
 */
export function resolveStudioBg3dEngineRuntime(
  request: StudioBg3dEngineSelectionRequest,
): StudioBg3dEngineSelectionPlan {
  const selected = selectStudioBg3dEngine(request);
  const topology = planStudioBg3dRuntimeTopology({
    availableRuntimeIds: PRODUCTION_RUNTIME_IDS,
    primaryCapabilities: STUDIO_BG3D_EDITOR_REQUIRED_CAPABILITIES,
    allowLabRuntimes: false,
    // The device's real capability, not the choice: a WebGL2 session still confirms that the
    // WebGPU runtime it declined would have satisfied the editor's capability requirements.
    webgpuSupported: request.probe?.supported === true,
    maximumActivationGzipBytes: STUDIO_BG3D_EDITOR_ACTIVATION_BUDGET_GZIP_BYTES,
    preferredPrimaryRuntimeId: selected.runtimeId,
  });
  if (topology.ok && topology.primaryRuntimeId === selected.runtimeId) return selected;
  // Either the chosen runtime lost a capability the editor depends on, or the WebGL2 baseline
  // itself failed the check. Both resolve to the baseline, but the reason is reported rather than
  // swallowed, and WebGPU is withdrawn as a choice until the capability catalog agrees again.
  return plan("webgl2", "runtime-capability-unavailable", false, [
    ...selected.diagnostics,
    "runtime-capability-unavailable",
  ]);
}

/**
 * Records a runtime WebGPU failure and returns the next session failure count, saturating at the
 * limit so a long session cannot overflow the counter.
 */
export function recordStudioBg3dWebGpuFailure(current: number | undefined): number {
  return Math.min(STUDIO_BG3D_WEBGPU_FAILURE_LIMIT, normalizedFailureCount(current) + 1);
}
