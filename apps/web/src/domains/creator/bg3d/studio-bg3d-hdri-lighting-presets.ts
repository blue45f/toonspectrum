/**
 * Studio BG3D HDRI 느낌 조명 프리셋 (Team D).
 *
 * 데생 인형 라이팅의 시간대 프리셋(새벽/정오/황혼/밤, studio-mannequin-lighting.ts)과
 * 같은 발상이지만, BG3D 장면 문서(StudioBg3dLightingSettings + 렌더 노출)에 직접
 * 적용할 수 있는 형태입니다. 각 프리셋은 날씨/시간대(선 리그 시각)와 함께
 * 연동되도록 설계되어 있습니다.
 *
 * Three.js 조명 객체를 직접 다루지 않는 순수 데이터 모듈입니다.
 */

import { studioBg3dLightAnglesToDirection } from "./studio-bg3d-light-direction";

import type { StudioBg3dLightingSettings } from "./studio-bg3d-scene-document";
import type { WeatherPresetId } from "../scene-3d/studio-3d-atmosphere-weather";

export type StudioBg3dHdriLightingPresetId = "daylight" | "twilight" | "night" | "studio";

export interface StudioBg3dHdriLightingPreset {
  readonly id: StudioBg3dHdriLightingPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly tooltipKo: string;
  readonly tooltipEn: string;
  /** 미리보기 스와치에 쓰는 대표 그라디언트 색상 3종(하늘·키라이트·주변광). */
  readonly swatch: readonly [string, string, string];
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
  /** 이 조명과 어울리는 대기 날씨 프리셋. */
  readonly weatherPresetId: WeatherPresetId;
  /** 연동 선 리그 시각(0–24시). */
  readonly sunTimeHours: number;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const STUDIO_BG3D_HDRI_LIGHTING_PRESETS: readonly StudioBg3dHdriLightingPreset[] =
  deepFreeze([
    {
      id: "daylight",
      labelKo: "낮",
      labelEn: "Day",
      descriptionKo: "맑은 한낮의 직사광선. 형태와 색이 가장 또렷하게 읽힙니다.",
      descriptionEn: "Bright midday sunlight. Shapes and colors read most clearly.",
      tooltipKo: "낮 — HDRI 느낌의 한낮 조명. 키 라이트를 위에서 강하게, 그림자는 짧고 선명하게.",
      tooltipEn: "Day — HDRI-style midday lighting. Strong overhead key light, short crisp shadows.",
      swatch: ["#7db9e8", "#ffffff", "#dbe5f0"],
      lighting: {
        ambientColor: "#cfdcec",
        ambientIntensity: 0.55,
        key: {
          color: "#fff6e6",
          direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 35, elevationDeg: 62 }),
          intensity: 1.6,
          castsShadow: true,
        },
        fill: {
          color: "#bcd4f5",
          direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -140, elevationDeg: 30 }),
          intensity: 0.45,
          castsShadow: false,
        },
      },
      exposure: 1.0,
      weatherPresetId: "clear-noon",
      sunTimeHours: 12,
    },
    {
      id: "twilight",
      labelKo: "황혼",
      labelEn: "Twilight",
      descriptionKo: "낮게 깔리는 주황빛 사광선. 감성적인 역광과 긴 그림자.",
      descriptionEn: "Low orange raking light. Emotional backlight and long shadows.",
      tooltipKo: "황혼 — HDRI 느낌의 노을 조명. 따뜻한 키 라이트를 옆에서 낮게 비춥니다.",
      tooltipEn: "Twilight — HDRI-style sunset lighting. Warm low key light from the side.",
      swatch: ["#ff7b00", "#ff9e00", "#4a3b32"],
      lighting: {
        ambientColor: "#8a6f5c",
        ambientIntensity: 0.5,
        key: {
          color: "#ff9e50",
          direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 80, elevationDeg: 18 }),
          intensity: 1.9,
          castsShadow: true,
        },
        fill: {
          color: "#7a6ff0",
          direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -100, elevationDeg: 22 }),
          intensity: 0.5,
          castsShadow: false,
        },
      },
      exposure: 1.08,
      weatherPresetId: "golden-hour",
      sunTimeHours: 17.6,
    },
    {
      id: "night",
      labelKo: "밤",
      labelEn: "Night",
      descriptionKo: "차가운 달빛과 낮은 환경광. 네온·발광 오브젝트가 돋보입니다.",
      descriptionEn: "Cold moonlight and low ambient. Neon and emissive objects pop.",
      tooltipKo: "밤 — HDRI 느낌의 야간 조명. 달빛 키 라이트와 짙은 파란 주변광.",
      tooltipEn: "Night — HDRI-style night lighting. Moonlight key and deep blue ambient.",
      swatch: ["#0d1b2a", "#9db8ff", "#1b263b"],
      lighting: {
        ambientColor: "#26314a",
        ambientIntensity: 0.42,
        key: {
          color: "#a9c4ff",
          direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -30, elevationDeg: 55 }),
          intensity: 0.85,
          castsShadow: true,
        },
        fill: {
          color: "#4cc9f0",
          direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 150, elevationDeg: 18 }),
          intensity: 0.35,
          castsShadow: false,
        },
      },
      exposure: 1.25,
      weatherPresetId: "cyberpunk-neon-night",
      sunTimeHours: 22,
    },
    {
      id: "studio",
      labelKo: "스튜디오",
      labelEn: "Studio",
      descriptionKo: "부드러운 3점 조명. 인물·제품 컷의 표준 스튜디오 세팅.",
      descriptionEn: "Soft three-point lighting. The standard setup for character shots.",
      tooltipKo: "스튜디오 — HDRI 느낌의 실내 스튜디오 조명. 부드러운 키·필·주변광 3점 구성.",
      tooltipEn: "Studio — HDRI-style indoor studio lighting. Soft key/fill/ambient three-point rig.",
      swatch: ["#f4f6fb", "#ffe8d1", "#eee4df"],
      lighting: {
        ambientColor: "#e8e2da",
        ambientIntensity: 0.8,
        key: {
          color: "#ffe9d2",
          direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 40, elevationDeg: 42 }),
          intensity: 1.25,
          castsShadow: true,
        },
        fill: {
          color: "#d7e3f5",
          direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -130, elevationDeg: 30 }),
          intensity: 0.55,
          castsShadow: false,
        },
      },
      exposure: 1.05,
      weatherPresetId: "clear-noon",
      sunTimeHours: 12,
    },
  ]);

/** ID로 HDRI 조명 프리셋을 찾습니다. 없으면 undefined를 돌립니다. */
export function getStudioBg3dHdriLightingPreset(
  id: string,
): StudioBg3dHdriLightingPreset | undefined {
  return STUDIO_BG3D_HDRI_LIGHTING_PRESETS.find((preset) => preset.id === id);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 현재 조명+노출이 어느 HDRI 프리셋과 일치하는지 찾습니다.
 * 키 라이트 색상·세기, 주변광 세기, 노출을 소수점 2자리까지 비교합니다.
 * 사용자 조정 상태면 null을 돌립니다.
 */
export function resolveStudioBg3dHdriLightingPreset(
  lighting: StudioBg3dLightingSettings,
  exposure: number,
): StudioBg3dHdriLightingPreset | null {
  for (const preset of STUDIO_BG3D_HDRI_LIGHTING_PRESETS) {
    const same =
      preset.lighting.key.color.toLowerCase() === lighting.key.color.toLowerCase() &&
      round2(preset.lighting.key.intensity) === round2(lighting.key.intensity) &&
      round2(preset.lighting.ambientIntensity) === round2(lighting.ambientIntensity) &&
      round2(preset.exposure) === round2(exposure);
    if (same) return preset;
  }
  return null;
}
