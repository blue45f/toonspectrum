import { useRef } from "react";

import type { AmbientScene } from "./ambient-engine";
import type { AmbientTone } from "./ambient-layers";
import type { AmbientSurfaceSize } from "./ambient-renderer";
import {
  useAmbientAppearance,
  useAmbientCanvas,
  useAmbientPreferences,
  useAmbientScene,
  useReducedMotionPreference,
} from "./useAmbientExperience";

import "./ambient-effects.css";

/** 배경 캔버스는 화면(큰 뷰포트) 크기를 따른다. 모바일 주소창이 오르내려도 크기가 흔들리지 않는다. */
function measureViewport(canvas: HTMLCanvasElement): AmbientSurfaceSize {
  return {
    width: canvas.clientWidth || window.innerWidth,
    height: canvas.clientHeight || window.innerHeight,
  };
}

function AmbientBackdropCanvas({ scene, tone }: { readonly scene: AmbientScene; readonly tone: AmbientTone }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useAmbientCanvas(canvasRef, { scene, tone, animate: true, measure: measureViewport });
  return (
    <canvas
      ref={canvasRef}
      className="ambient-backdrop"
      data-ambient-surface="backdrop"
      data-ambient-scene={scene.kind}
      aria-hidden="true"
    />
  );
}

/**
 * 앱 셸에 마운트하는 날씨·계절 배경 호스트.
 *
 * - 화면 전체 색을 바꾸는 틴트 없이, 콘텐츠 뒤 캔버스 한 장에만 효과를 그린다.
 * - 강도 끔·움직임 줄이기·고대비에서는 아무것도 그리지 않는다(날씨 요청도 하지 않는다).
 * - 경로별 끄기(작업 집중 화면)는 AppShell이 ambient-routes 규칙으로 판단해 마운트하지 않는다.
 *
 * AppShell에서 lazy + Suspense로 감싸 main의 형제로 마운트한다.
 */
export function AmbientExperienceHost() {
  const preferences = useAmbientPreferences();
  const reducedMotion = useReducedMotionPreference();
  const { tone, highContrast } = useAmbientAppearance();
  const visible = preferences.intensity !== "off" && !reducedMotion && !highContrast;
  const { scene } = useAmbientScene(preferences, visible);

  if (!visible || !scene) return null;
  return <AmbientBackdropCanvas scene={scene} tone={tone} />;
}

export default AmbientExperienceHost;
