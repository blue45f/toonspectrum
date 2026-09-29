/**
 * Studio 3D 데생 인형 — Magic Poser 벤치마크: 라이팅 스튜디오 (MP3).
 *
 * 데생 인형 장면의 조명을 웹툰 명암 레퍼런스 용도로 다룹니다.
 * Directional/Spot/Point 3종, 장면당 최대 4개(웹 성능 고려)입니다.
 * 시간대 프리셋(새벽/정오/황혼/밤)과 그림자 on/off를 제공하고,
 * LT 변환과 연동할 때 조명 기반 명암 양자화 힌트를 뽑을 수 있습니다.
 *
 * Three.js 조명 객체를 직접 다루지 않는 순수 데이터+로직 모듈입니다.
 * (실제 R3F 조명 마운트는 이 스펙을 읽는 별도 뷰 컴포넌트가 담당합니다.)
 */

import type { StudioMannequinVec3 } from "./studio-mannequin-model";

/** 장면당 최대 조명 수(웹 성능 예산). */
export const STUDIO_MANNEQUIN_MAX_LIGHTS = 4 as const;

export type StudioMannequinLightKind = "directional" | "spot" | "point";

export interface StudioMannequinLight {
  readonly id: string;
  readonly kind: StudioMannequinLightKind;
  /** 밝기 0~10. */
  readonly intensity: number;
  /** 16진 색상 문자열(#rrggbb). */
  readonly color: string;
  /** 조명 위치(모델 기준 미터). */
  readonly position: StudioMannequinVec3;
  /** spot 전용: 조사각(rad). */
  readonly angle?: number;
  /** point/spot 전용: 도달 반경(m). */
  readonly distance?: number;
}

export interface StudioMannequinLightingRig {
  readonly lights: readonly StudioMannequinLight[];
  /** 그림자 렌더링 여부. */
  readonly shadowsEnabled: boolean;
}

export type StudioMannequinTimeOfDay = "dawn" | "noon" | "dusk" | "night";

export const STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS: Record<StudioMannequinTimeOfDay, string> =
  Object.freeze({
    dawn: "새벽",
    noon: "정오",
    dusk: "황혼",
    night: "밤",
  });

export class StudioMannequinLightingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioMannequinLightingError";
  }
}

function clampIntensity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(10, Math.max(0, value));
}

function normalizeColor(value: unknown): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return "#ffffff";
}

let lightSequence = 0;

function nextLightId(): string {
  lightSequence += 1;
  return `light-${lightSequence}`;
}

/** 빈 라이팅 릭을 만듭니다. */
export function createStudioMannequinLightingRig(): StudioMannequinLightingRig {
  return { lights: [], shadowsEnabled: true };
}

/** 조명을 추가합니다. 4개를 초과하면 오류를 던집니다. */
export function addStudioMannequinLight(
  rig: StudioMannequinLightingRig,
  spec: Omit<StudioMannequinLight, "id"> & { readonly id?: string },
): StudioMannequinLightingRig {
  if (rig.lights.length >= STUDIO_MANNEQUIN_MAX_LIGHTS) {
    throw new StudioMannequinLightingError(
      `조명은 최대 ${STUDIO_MANNEQUIN_MAX_LIGHTS}개까지 추가할 수 있습니다.`,
    );
  }
  const light: StudioMannequinLight = {
    id: spec.id ?? nextLightId(),
    kind: spec.kind,
    intensity: clampIntensity(spec.intensity),
    color: normalizeColor(spec.color),
    position: spec.position,
    ...(spec.angle !== undefined ? { angle: spec.angle } : {}),
    ...(spec.distance !== undefined ? { distance: spec.distance } : {}),
  };
  return { ...rig, lights: [...rig.lights, light] };
}

/** 조명을 제거합니다. 없는 ID면 그대로 돌립니다. */
export function removeStudioMannequinLight(
  rig: StudioMannequinLightingRig,
  id: string,
): StudioMannequinLightingRig {
  return { ...rig, lights: rig.lights.filter((light) => light.id !== id) };
}

/** 조명 파라미터를 부분 업데이트합니다. */
export function updateStudioMannequinLight(
  rig: StudioMannequinLightingRig,
  id: string,
  patch: Partial<Omit<StudioMannequinLight, "id">>,
): StudioMannequinLightingRig {
  return {
    ...rig,
    lights: rig.lights.map((light) =>
      light.id === id
        ? {
            ...light,
            ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
            ...(patch.intensity !== undefined ? { intensity: clampIntensity(patch.intensity) } : {}),
            ...(patch.color !== undefined ? { color: normalizeColor(patch.color) } : {}),
            ...(patch.position !== undefined ? { position: patch.position } : {}),
            ...(patch.angle !== undefined ? { angle: patch.angle } : {}),
            ...(patch.distance !== undefined ? { distance: patch.distance } : {}),
          }
        : light,
    ),
  };
}

/** 그림자를 켜거나 끕니다. */
export function setStudioMannequinShadows(
  rig: StudioMannequinLightingRig,
  enabled: boolean,
): StudioMannequinLightingRig {
  return { ...rig, shadowsEnabled: enabled };
}

/**
 * 시간대 프리셋으로 릭을 통째로 교체합니다.
 * 웹툰 명암 레퍼런스용 대표 조명 배치입니다.
 */
export function applyStudioMannequinTimeOfDay(
  preset: StudioMannequinTimeOfDay,
): StudioMannequinLightingRig {
  const base = createStudioMannequinLightingRig();
  switch (preset) {
    case "dawn":
      return {
        ...addStudioMannequinLight(
          addStudioMannequinLight(base, {
            kind: "directional",
            intensity: 2.2,
            color: "#ffb37a",
            position: [-3, 1.5, 4],
          }),
          { kind: "point", intensity: 0.6, color: "#7a9bff", position: [2, 2, -2], distance: 8 },
        ),
        shadowsEnabled: true,
      };
    case "noon":
      return {
        ...addStudioMannequinLight(base, {
          kind: "directional",
          intensity: 3.5,
          color: "#ffffff",
          position: [0.5, 5, 1],
        }),
        shadowsEnabled: true,
      };
    case "dusk":
      return {
        ...addStudioMannequinLight(
          addStudioMannequinLight(base, {
            kind: "directional",
            intensity: 2.8,
            color: "#ff7a4d",
            position: [-4, 1, 2],
          }),
          { kind: "spot", intensity: 1.2, color: "#ffd9a0", position: [3, 2.5, 3], angle: 0.5, distance: 10 },
        ),
        shadowsEnabled: true,
      };
    case "night":
      return {
        ...addStudioMannequinLight(
          addStudioMannequinLight(base, {
            kind: "point",
            intensity: 1.5,
            color: "#9db8ff",
            position: [1.5, 2.5, 2],
            distance: 6,
          }),
          { kind: "directional", intensity: 0.4, color: "#33415e", position: [0, 4, -3] },
        ),
        shadowsEnabled: false,
      };
  }
}

export interface StudioMannequinToneHint {
  /** 주광 방향(정규화 벡터). */
  readonly keyLightDirection: StudioMannequinVec3;
  /** 명암 대비 0~1. */
  readonly contrast: number;
  /** 그림자 사용 여부. */
  readonly shadows: boolean;
}

/**
 * LT 변환 연동용 명암 양자화 힌트를 뽑습니다.
 * 가장 밝은 directional/spot을 주광으로 간주합니다.
 */
export function studioMannequinLightingToToneHint(
  rig: StudioMannequinLightingRig,
): StudioMannequinToneHint {
  const key = [...rig.lights]
    .filter((light) => light.kind !== "point")
    .sort((a, b) => b.intensity - a.intensity)[0];
  const total = rig.lights.reduce((sum, light) => sum + light.intensity, 0);
  const keyIntensity = key?.intensity ?? 0;
  const contrast = total <= 0 ? 0 : Math.min(1, keyIntensity / total);
  const position = key?.position ?? [0, 1, 0];
  const length = Math.hypot(position[0], position[1], position[2]) || 1;
  return {
    keyLightDirection: [position[0] / length, position[1] / length, position[2] / length],
    contrast: Math.round(contrast * 100) / 100,
    shadows: rig.shadowsEnabled,
  };
}
