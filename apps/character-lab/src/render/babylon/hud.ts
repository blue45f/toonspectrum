/**
 * HUD 프로브: SceneInstrumentation.drawCallsCounter + EngineInstrumentation.gpuFrameTimeCounter(timestamp query 지원 시).
 * 프레임 시간 p95는 render/frame-stats.ts(순수). 지원하지 않으면 gpuFrameMs=null과 사유를 보고한다.
 */
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation.js";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation.js";

import { featureActive, featureUnavailable } from "../scene-features";

import type { SceneFeatureState } from "../scene-features";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface HudProbe {
  drawCalls(): number;
  /** ms, 미지원이면 null */
  gpuFrameMs(): number | null;
  gpuTimerState(): SceneFeatureState;
  dispose(): void;
}

function timerSupported(engine: AbstractEngine): boolean {
  const hasCounter = typeof (engine as { getGPUFrameTimeCounter?: unknown }).getGPUFrameTimeCounter === "function";
  if (!hasCounter) return false;
  if (engine.isWebGPU) {
    const extensions = (engine as { enabledExtensions?: readonly string[] }).enabledExtensions ?? [];
    return extensions.includes("timestamp-query");
  }
  return Boolean(engine.getCaps().timerQuery);
}

export function createHudProbe(scene: Scene, engine: AbstractEngine): HudProbe {
  const sceneInstrumentation = new SceneInstrumentation(scene);
  let engineInstrumentation: EngineInstrumentation | null = null;
  let timerState: SceneFeatureState;
  if (timerSupported(engine)) {
    try {
      engineInstrumentation = new EngineInstrumentation(engine);
      engineInstrumentation.captureGPUFrameTime = true;
      timerState = featureActive("timestamp query");
    } catch {
      engineInstrumentation = null;
      timerState = featureUnavailable("GPU 타이머 계측을 켜지 못했습니다.");
    }
  } else {
    timerState = featureUnavailable("timestamp query 미지원(WebGL EXT_disjoint_timer_query 없음 또는 WebGPU timestamp-query 미활성).");
  }
  return {
    drawCalls: () => sceneInstrumentation.drawCallsCounter.current,
    gpuFrameMs: () => (engineInstrumentation ? engineInstrumentation.gpuFrameTimeCounter.lastSecAverage / 1e6 : null),
    gpuTimerState: () => timerState,
    dispose() {
      engineInstrumentation?.dispose();
      sceneInstrumentation.dispose();
    },
  };
}
