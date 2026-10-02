import { evalCurve, gammaCurve, linearCurve } from "../core/curve";

import type { Curve } from "../core/curve";

/**
 * 디바이스 압력 프로파일. 값은 자체 정의 추정치이며 실측 데이터가 아니다(베타 표기).
 * `DeviceCalibrationIR`와 동형 필드를 두되 import하지 않는다.
 */
export interface DeviceProfile {
  id: string;
  label: string;
  /** 데드존·감마 적용 후 통과하는 LUT. */
  pressureCurve: Curve;
  /** 이 값 이하의 원시 압력은 0. */
  deadZone: number;
  pressureGamma: number;
  tiltXOffsetDeg: number;
  tiltYOffsetDeg: number;
}

export type DeviceProfileId = "generic" | "pen-soft" | "pen-firm" | "mouse";

export const DEVICE_PROFILES: Record<DeviceProfileId, DeviceProfile> = {
  generic: {
    id: "generic",
    label: "일반 펜(추정값)",
    pressureCurve: linearCurve(9),
    deadZone: 0.02,
    pressureGamma: 1,
    tiltXOffsetDeg: 0,
    tiltYOffsetDeg: 0,
  },
  "pen-soft": {
    id: "pen-soft",
    label: "부드러운 펜(가벼운 압력에 빨리 반응)",
    pressureCurve: gammaCurve(0.7, 9),
    deadZone: 0.015,
    pressureGamma: 1,
    tiltXOffsetDeg: 0,
    tiltYOffsetDeg: 0,
  },
  "pen-firm": {
    id: "pen-firm",
    label: "단단한 펜(강한 압력에 반응)",
    pressureCurve: gammaCurve(1.4, 9),
    deadZone: 0.04,
    pressureGamma: 1,
    tiltXOffsetDeg: 0,
    tiltYOffsetDeg: 0,
  },
  mouse: {
    // 필압 미지원 장치: 브라우저가 주는 상수 0.5를 0.7로 매핑(noPressureValue 규약).
    id: "mouse",
    label: "마우스(필압 없음)",
    pressureCurve: [0, 0.7, 1],
    deadZone: 0,
    pressureGamma: 1,
    tiltXOffsetDeg: 0,
    tiltYOffsetDeg: 0,
  },
};

/** 원시 압력 → 교정 압력. deadZone 아래 0, 단조, [0,1]. */
export function calibratePressure(raw: number, profile: DeviceProfile): number {
  const r = raw < 0 ? 0 : raw > 1 ? 1 : raw;
  if (r <= profile.deadZone) return 0;
  const span = 1 - profile.deadZone;
  const t = span > 0 ? (r - profile.deadZone) / span : 1;
  const g = profile.pressureGamma > 0 ? Math.pow(t, profile.pressureGamma) : t;
  const v = evalCurve(profile.pressureCurve, g);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** W3C Pointer Events 규약으로 tiltX/Y(deg) → altitude/azimuth(deg). */
export function tiltToSpherical(
  tiltXDeg: number,
  tiltYDeg: number,
): { altitudeDeg: number; azimuthDeg: number } {
  if (tiltXDeg === 0 && tiltYDeg === 0) return { altitudeDeg: 90, azimuthDeg: 0 };
  const tx = Math.tan((tiltXDeg * Math.PI) / 180);
  const ty = Math.tan((tiltYDeg * Math.PI) / 180);
  const altitude = Math.atan(1 / Math.sqrt(tx * tx + ty * ty));
  let azimuth = Math.atan2(ty, tx);
  if (azimuth < 0) azimuth += Math.PI * 2;
  return { altitudeDeg: (altitude * 180) / Math.PI, azimuthDeg: (azimuth * 180) / Math.PI };
}
