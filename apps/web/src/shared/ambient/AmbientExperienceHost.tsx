import { useEffect, useRef, useState } from "react";

import {
  isLowPowerEnvironment,
  prefersReducedMotion,
  readAmbientPreferences,
  resolveAmbientScene,
  type AmbientScene,
} from "./ambient-engine";
import { AmbientParticleRenderer } from "./ambient-particles";
import { ambientWeatherProvider } from "./ambient-weather";

import "./ambient-effects.css";

/**
 * 앱 셸에 마운트하는 앰비언트 연출 호스트.
 *
 * - 시간대 틴트 오버레이 (CSS transition으로 부드럽게 전환)
 * - 날씨/계절 파티클 캔버스
 * - 강도 설정·reduced-motion·저사양을 모두 반영
 * - 최소 침습: fixed 레이어 3개만 렌더, pointer-events 없음
 *
 * AppShell에서 lazy + Suspense로 감싸서 마운트한다.
 */
export function AmbientExperienceHost() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<AmbientParticleRenderer | null>(null);
  const [scene, setScene] = useState<AmbientScene | null>(null);
  const [intensity, setIntensity] = useState(() => readAmbientPreferences().intensity);

  // 강도 변경 감지 (다른 탭/설정 페이지에서 변경 시)
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "toonstudio.ambient.intensity.v1") {
        setIntensity(readAmbientPreferences().intensity);
      }
    };
    // 같은 탭 내 변경도 감지 (커스텀 이벤트)
    const onCustom = () => setIntensity(readAmbientPreferences().intensity);
    window.addEventListener("storage", onStorage);
    window.addEventListener("toonstudio:ambient-intensity", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("toonstudio:ambient-intensity", onCustom);
    };
  }, []);

  // 장면 계산: 1분마다 + 날씨 변경 시
  useEffect(() => {
    const compute = () => {
      const snapshot = ambientWeatherProvider.snapshot();
      const next = resolveAmbientScene({
        intensity,
        reducedMotion: prefersReducedMotion(),
        lowPower: isLowPowerEnvironment(),
        weather: snapshot.reading?.condition ?? null,
        date: new Date(),
      });
      setScene(next);
    };

    compute();
    ambientWeatherProvider.start();
    const unsubscribe = ambientWeatherProvider.subscribe(compute);
    const timer = window.setInterval(compute, 60_000); // 1분마다 시간대 체크
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [intensity]);

  // 파티클 렌더러 생명주기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;

    if (!scene.particlesEnabled || scene.particles.length === 0) {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      return undefined;
    }

    if (rendererRef.current) {
      rendererRef.current.setSpecs(scene.particles);
    } else {
      const renderer = new AmbientParticleRenderer(canvas, scene.particles);
      rendererRef.current = renderer;
      renderer.start();
    }
  }, [scene]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  if (!scene || intensity === "off") return null;

  const showTint = scene.tintEnabled;
  const tintStyle = showTint
    ? {
        backgroundColor: scene.tint.tintColor,
        opacity: scene.tint.tintOpacity,
      }
    : undefined;
  const gradientStyle = showTint
    ? {
        background: `linear-gradient(to bottom, ${scene.tint.gradient[0]}, ${scene.tint.gradient[1]})`,
        opacity: scene.tint.gradientOpacity,
      }
    : undefined;
  const weatherTintStyle =
    scene.weatherTintColor && showTint
      ? {
          backgroundColor: scene.weatherTintColor,
          opacity: scene.weatherTintOpacity,
        }
      : undefined;

  return (
    <>
      {showTint ? (
        <div className="ambient-tint" style={tintStyle} aria-hidden="true" />
      ) : null}
      {showTint ? (
        <div className="ambient-tint-gradient" style={gradientStyle} aria-hidden="true" />
      ) : null}
      {scene.weatherTintColor && showTint ? (
        <div className="ambient-tint" style={weatherTintStyle} aria-hidden="true" />
      ) : null}
      {scene.particlesEnabled ? (
        <canvas ref={canvasRef} className="ambient-canvas" aria-hidden="true" />
      ) : null}
    </>
  );
}

export default AmbientExperienceHost;
