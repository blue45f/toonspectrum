/**
 * Owns the background editor's interactive engine decision for one session.
 *
 * The hook is the only place that combines the four inputs the policy needs — the persisted artist
 * preference, the WebGPU adapter probe, the embedding host, and this session's WebGPU failure
 * count — and it is the only place that hands R3F an asynchronous renderer factory. Everything it
 * decides with is pure and separately tested; the hook itself owns effects, persistence, and the
 * canvas remount key.
 *
 * Switching backend remounts the R3F `Canvas`. That is deliberate: a renderer swap invalidates
 * every GPU resource in the tree, and the scene is rebuilt from the canonical SceneDocument, so a
 * remount is both cheaper and safer than trying to migrate live engine objects.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  normalizeStudioBg3dEnginePreference,
  recordStudioBg3dWebGpuFailure,
  resolveStudioBg3dEngineRuntime,
  type StudioBg3dEnginePreference,
  type StudioBg3dEngineSelectionPlan,
} from "./studio-bg3d-engine-selection";
import { classifyStudioBg3dInAppBrowser } from "./studio-bg3d-inapp-browser";
import { probeStudioBg3dWebGpuCapability } from "./studio-bg3d-webgpu-capability";

import type { StudioBg3dDeviceProfile } from "./studio-bg3d-device-quality";
import type { StudioBg3dInAppBrowserProfile } from "./studio-bg3d-inapp-browser";
import type { createStudioBg3dThreeWebGpuRenderer } from "./studio-bg3d-three-webgpu-renderer";
import type { StudioBg3dWebGpuProbeResult } from "./studio-bg3d-webgpu-capability";
// Type-only: erased at runtime, so the WebGPU renderer graph stays behind its dynamic import.

/** Renderer factory shape R3F accepts for its `gl` prop. */
export type StudioBg3dRendererFactory = (
  props: { readonly canvas: HTMLCanvasElement },
) => Promise<{ render: (scene: never, camera: never) => unknown }>;

export type StudioBg3dEngineRuntimePhase = "probing" | "ready";

/**
 * How long the viewport keeps announcing a device loss. The fallback itself is permanent for the
 * session; the banner is a notification, and a banner that never leaves stops being read.
 */
export const STUDIO_BG3D_DEVICE_LOSS_NOTICE_MS = 10_000;

export interface StudioBg3dEngineRuntimeState {
  readonly phase: StudioBg3dEngineRuntimePhase;
  readonly plan: StudioBg3dEngineSelectionPlan;
  readonly preference: StudioBg3dEnginePreference;
  readonly inApp: StudioBg3dInAppBrowserProfile;
  readonly probe: StudioBg3dWebGpuProbeResult;
  /**
   * Put this in the R3F `Canvas` key. It changes when the backend changes and again after every
   * recorded WebGPU failure, so a lost device is rebuilt even when the policy keeps the same
   * backend for one more attempt.
   */
  readonly canvasKey: string;
  /** Present only while the selected backend is WebGPU. */
  readonly glFactory: StudioBg3dRendererFactory | null;
  readonly deviceLostMessage: string | null;
  setPreference(next: StudioBg3dEnginePreference): void;
}

export interface UseStudioBg3dEngineRuntimeOptions {
  /** False while the editor is closed; probing is skipped so a closed editor never touches the GPU. */
  readonly enabled: boolean;
  readonly deviceProfile: StudioBg3dDeviceProfile;
  readonly antialias: boolean;
  readonly saveData?: boolean;
  readonly deviceMemoryGb?: number;
  /** Test seam; production reads the browser. */
  readonly probe?: typeof probeStudioBg3dWebGpuCapability;
  readonly loadPreference?: () => Promise<StudioBg3dEnginePreference>;
  readonly savePreference?: (preference: StudioBg3dEnginePreference) => Promise<void>;
  readonly createWebGpuRenderer?: typeof createStudioBg3dThreeWebGpuRenderer;
}

const PENDING_PROBE: StudioBg3dWebGpuProbeResult = Object.freeze({
  supported: false,
  reason: "api-unavailable",
  computeSupported: false,
  timestampQuerySupported: false,
  limits: Object.freeze({}),
});

async function loadPersistedPreference(): Promise<StudioBg3dEnginePreference> {
  const { acquireProductStudioUiPreferencesRepository } = await import(
    "../studio-ui-preferences-sqlite"
  );
  const repository = await acquireProductStudioUiPreferencesRepository();
  return repository.loadBg3dEnginePreference();
}

async function persistPreference(preference: StudioBg3dEnginePreference): Promise<void> {
  const { acquireProductStudioUiPreferencesRepository } = await import(
    "../studio-ui-preferences-sqlite"
  );
  const repository = await acquireProductStudioUiPreferencesRepository();
  await repository.saveBg3dEnginePreference(preference);
}

function readHostSignals(): { userAgent?: string; displayModeStandalone?: boolean } {
  if (typeof navigator === "undefined") return {};
  const standalone = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(display-mode: standalone)").matches
    : undefined;
  return { userAgent: navigator.userAgent, displayModeStandalone: standalone };
}

export function useStudioBg3dEngineRuntime(
  options: UseStudioBg3dEngineRuntimeOptions,
): StudioBg3dEngineRuntimeState {
  const {
    enabled,
    deviceProfile,
    antialias,
    saveData,
    deviceMemoryGb,
    probe: probeCapability = probeStudioBg3dWebGpuCapability,
    loadPreference = loadPersistedPreference,
    savePreference = persistPreference,
    createWebGpuRenderer,
  } = options;

  const [preference, setPreferenceState] = useState<StudioBg3dEnginePreference>("auto");
  const [probe, setProbe] = useState<StudioBg3dWebGpuProbeResult>(PENDING_PROBE);
  const [phase, setPhase] = useState<StudioBg3dEngineRuntimePhase>("probing");
  const [webgpuFailureCount, setWebgpuFailureCount] = useState(0);
  const [deviceLostMessage, setDeviceLostMessage] = useState<string | null>(null);
  const [recoveryGeneration, setRecoveryGeneration] = useState(0);

  const inApp = useMemo(() => classifyStudioBg3dInAppBrowser(readHostSignals()), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      const [restored, probed] = await Promise.all([
        loadPreference().catch(() => "auto" as StudioBg3dEnginePreference),
        probeCapability({
          secureContext: typeof window !== "undefined" && window.isSecureContext === true,
          gpu: (navigator as Navigator & { gpu?: Parameters<typeof probeCapability>[0]["gpu"] }).gpu,
          signal: controller.signal,
        }).catch(() => PENDING_PROBE),
      ]);
      if (cancelled) return;
      setPreferenceState(normalizeStudioBg3dEnginePreference(restored));
      setProbe(probed);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, loadPreference, probeCapability]);

  const plan = useMemo(
    () => resolveStudioBg3dEngineRuntime({
      preference,
      probe,
      inApp,
      deviceProfile,
      // The renderer module is a dynamic import that is present in every build that ships this
      // hook; a host without WebGPU is already refused by the probe.
      webgpuRuntimeAvailable: true,
      saveData,
      deviceMemoryGb,
      webgpuFailureCount,
    }),
    [preference, probe, inApp, deviceProfile, saveData, deviceMemoryGb, webgpuFailureCount],
  );

  const setPreference = useCallback((next: StudioBg3dEnginePreference) => {
    const normalized = normalizeStudioBg3dEnginePreference(next);
    setPreferenceState(normalized);
    setDeviceLostMessage(null);
    // An explicit choice is the artist telling us the previous failures are not the whole story.
    if (normalized !== "auto") setWebgpuFailureCount(0);
    void savePreference(normalized).catch(() => undefined);
  }, [savePreference]);

  const handleWebGpuFailure = useCallback((message: string) => {
    setDeviceLostMessage(message);
    setWebgpuFailureCount(recordStudioBg3dWebGpuFailure);
    // A lost device leaves the canvas holding an unusable renderer, so it is rebuilt even when the
    // policy is still willing to try WebGPU once more.
    setRecoveryGeneration((generation) => generation + 1);
  }, []);

  useEffect(() => {
    if (deviceLostMessage === null) return;
    const timer = setTimeout(() => setDeviceLostMessage(null), STUDIO_BG3D_DEVICE_LOSS_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [deviceLostMessage]);

  const glFactory = useMemo<StudioBg3dRendererFactory | null>(() => {
    if (plan.backend !== "webgpu") return null;
    return async ({ canvas }) => {
      const create = createWebGpuRenderer ?? (
        await import("./studio-bg3d-three-webgpu-entry")
      ).createStudioBg3dThreeWebGpuRenderer;
      try {
        const runtime = await create(canvas, {
          antialias,
          alpha: true,
          onDeviceLost: (loss) => handleWebGpuFailure(loss.message),
        });
        return runtime.renderer as unknown as { render: (scene: never, camera: never) => unknown };
      } catch (error) {
        handleWebGpuFailure(
          "WebGPU 엔진을 시작하지 못해 WebGL2로 전환합니다.",
        );
        throw error;
      }
    };
  }, [plan.backend, antialias, createWebGpuRenderer, handleWebGpuFailure]);

  return {
    phase,
    plan,
    preference,
    inApp,
    probe,
    canvasKey: `${plan.backend}#${recoveryGeneration}`,
    glFactory,
    deviceLostMessage,
    setPreference,
  };
}
