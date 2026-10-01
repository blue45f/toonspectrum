/**
 * 헤어 스타일 스펙 7종(스펙 §5.4 HAIR_STYLE_SPECS): Blender kit HairStyle 6 + twin-tail(절차 전용).
 * 앞·옆·뒷머리·정수리·묶음 구역별 앵커 배치(두피 구면 좌표)·카드/스트랜드 번들 선택·체인 여부를 데이터로 둔다.
 * 길이·폭은 머리 반경 배수이며 각도는 도(°)다. 생성 자체는 hair-builder.ts가 한다.
 */
import { SLOT_PRESET_IDS } from "../../contracts";

import type { HairStyleId } from "../../contracts";

export type HairZoneKind = "card" | "bundle";

export interface HairZoneSpec {
  readonly id: string;
  readonly kind: HairZoneKind;
  /** 방위각 범위(°). 0 = 앞, 90 = +X(캐릭터 왼쪽), 180 = 뒤 */
  readonly azimuthStart: number;
  readonly azimuthEnd: number;
  /** 고도각(°). 0 = 정수리, 90 = 적도 */
  readonly elevation: number;
  readonly count: number;
  /** 길이(머리 반경 배수) */
  readonly length: number;
  /** 카드 폭 또는 번들 반경(머리 반경 배수) */
  readonly width: number;
  /** 세그먼트 수(입자 수 = segments + 1 ≤ 16) */
  readonly segments: number;
  /** 늘어짐 0..1(끝으로 갈수록 중력 방향으로) */
  readonly droop: number;
  /** 바깥 벌어짐(머리 반경 배수, 끝에서) */
  readonly flare: number;
  /** 끝으로 가는 비틀림 각(°) */
  readonly curl: number;
  /** 결정적 흔들림(길이·방위 비율 0..1) */
  readonly jitter: number;
  /** 체인(물리) 생성 여부 */
  readonly chain: boolean;
  /** 체인 파라미터 덮어쓰기(VRMC_springBone 호환) */
  readonly spring?: { readonly stiffness?: number; readonly damping?: number; readonly gravityScale?: number };
  /** 번들: 모든 스트랜드가 모이는 묶음점(두피 구면 좌표) */
  readonly gather?: { readonly azimuth: number; readonly elevation: number };
}

export interface HairSpec {
  readonly id: HairStyleId;
  readonly labelKo: string;
  /** Blender kit HairStyle과 동일 id */
  readonly blenderKit: boolean;
  /** 캡(두피 덮개) 헤어라인 고도각(°): 앞·뒤 */
  readonly cap: { readonly frontHairline: number; readonly backHairline: number };
  readonly zones: readonly HairZoneSpec[];
}

const BASE_ZONE: Omit<HairZoneSpec, "id" | "kind" | "azimuthStart" | "azimuthEnd" | "elevation" | "count" | "length"> = {
  width: 0.28,
  segments: 3,
  droop: 0.55,
  flare: 0.05,
  curl: 0,
  jitter: 0.08,
  chain: false,
};

function zone(partial: Partial<HairZoneSpec> & Pick<HairZoneSpec, "id" | "azimuthStart" | "azimuthEnd" | "elevation" | "count" | "length">): HairZoneSpec {
  return { ...BASE_ZONE, kind: "card", ...partial };
}

const FRINGE = (count = 8, length = 0.6, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({ id: "fringe", azimuthStart: -45, azimuthEnd: 45, elevation: 62, count, length, segments: 4, droop: 0.6, ...extra });
const CROWN = (count = 8, length = 0.5, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({ id: "crown", azimuthStart: 0, azimuthEnd: 360, elevation: 22, count, length, droop: 0.35, flare: 0.08, ...extra });
const SIDE = (side: "left" | "right", count: number, length: number, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({
    id: side === "left" ? "side-left" : "side-right",
    azimuthStart: side === "left" ? 45 : 225,
    azimuthEnd: side === "left" ? 135 : 315,
    elevation: 64,
    count,
    length,
    ...extra,
  });
const BACK = (count: number, length: number, extra: Partial<HairZoneSpec> = {}): HairZoneSpec =>
  zone({ id: "back", azimuthStart: 140, azimuthEnd: 220, elevation: 55, count, length, ...extra });

export const HAIR_STYLE_SPECS: Readonly<Record<HairStyleId, HairSpec>> = {
  "short-layered": {
    id: "short-layered",
    labelKo: "숏 레이어드",
    blenderKit: true,
    cap: { frontHairline: 66, backHairline: 100 },
    zones: [
      FRINGE(7, 0.55, { segments: 3, droop: 0.55 }),
      CROWN(10, 0.5),
      SIDE("left", 5, 0.6, { elevation: 68, droop: 0.6 }),
      SIDE("right", 5, 0.6, { elevation: 68, droop: 0.6 }),
      BACK(8, 0.75, { elevation: 60, segments: 5, droop: 0.7, chain: true }),
    ],
  },
  "soft-bob": {
    id: "soft-bob",
    labelKo: "소프트 보브",
    blenderKit: true,
    cap: { frontHairline: 66, backHairline: 100 },
    zones: [
      FRINGE(8, 0.65, { width: 0.26 }),
      CROWN(8, 0.5),
      SIDE("left", 7, 1.4, { elevation: 62, segments: 6, droop: 0.8, width: 0.3, chain: true }),
      SIDE("right", 7, 1.4, { elevation: 62, segments: 6, droop: 0.8, width: 0.3, chain: true }),
      BACK(10, 1.45, { segments: 6, droop: 0.85, chain: true }),
    ],
  },
  "romance-long": {
    id: "romance-long",
    labelKo: "로맨스 롱",
    blenderKit: true,
    cap: { frontHairline: 66, backHairline: 100 },
    zones: [
      FRINGE(8, 0.6),
      CROWN(8, 0.5),
      SIDE("left", 8, 3.2, { elevation: 62, segments: 10, droop: 0.9, width: 0.3, curl: 30, chain: true, spring: { damping: 0.45 } }),
      SIDE("right", 8, 3.2, { elevation: 62, segments: 10, droop: 0.9, width: 0.3, curl: 30, chain: true, spring: { damping: 0.45 } }),
      BACK(12, 3.4, { elevation: 50, segments: 10, droop: 0.92, width: 0.3, curl: 20, chain: true, spring: { damping: 0.45 } }),
    ],
  },
  "action-pony": {
    id: "action-pony",
    labelKo: "액션 포니",
    blenderKit: true,
    cap: { frontHairline: 66, backHairline: 100 },
    zones: [
      FRINGE(7, 0.55, { segments: 3 }),
      CROWN(10, 0.6, { droop: 0.25, flare: 0.02 }),
      SIDE("left", 5, 0.6, { elevation: 65 }),
      SIDE("right", 5, 0.6, { elevation: 65 }),
      BACK(8, 0.8, { droop: 0.4, flare: 0 }),
      zone({
        id: "ponytail",
        kind: "bundle",
        azimuthStart: 0,
        azimuthEnd: 360,
        elevation: 50,
        count: 5,
        length: 2.6,
        width: 0.14,
        segments: 9,
        droop: 0.85,
        flare: 0.1,
        curl: 10,
        jitter: 0.05,
        chain: true,
        spring: { stiffness: 0.8, damping: 0.4, gravityScale: 0.08 },
        gather: { azimuth: 180, elevation: 50 },
      }),
    ],
  },
  "hime-cut": {
    id: "hime-cut",
    labelKo: "히메 컷",
    blenderKit: true,
    cap: { frontHairline: 64, backHairline: 100 },
    zones: [
      FRINGE(10, 0.68, { azimuthStart: -50, azimuthEnd: 50, width: 0.22, droop: 0.65, flare: 0, jitter: 0.02 }),
      CROWN(8, 0.5),
      zone({ id: "hime-left", azimuthStart: 70, azimuthEnd: 100, elevation: 78, count: 3, length: 1.5, width: 0.3, segments: 7, droop: 0.95, flare: 0, jitter: 0.02, chain: true }),
      zone({ id: "hime-right", azimuthStart: 260, azimuthEnd: 290, elevation: 78, count: 3, length: 1.5, width: 0.3, segments: 7, droop: 0.95, flare: 0, jitter: 0.02, chain: true }),
      BACK(12, 3.4, { azimuthStart: 130, azimuthEnd: 230, elevation: 50, segments: 10, droop: 0.92, width: 0.3, chain: true, spring: { damping: 0.45 } }),
    ],
  },
  "wolf-layered": {
    id: "wolf-layered",
    labelKo: "울프 레이어드",
    blenderKit: true,
    cap: { frontHairline: 66, backHairline: 100 },
    zones: [
      FRINGE(8, 0.6, { curl: 15, flare: 0.1, droop: 0.55 }),
      zone({ id: "top-layer", azimuthStart: 0, azimuthEnd: 360, elevation: 32, count: 12, length: 0.75, width: 0.26, segments: 4, droop: 0.45, flare: 0.18, curl: 20 }),
      zone({ id: "mid-layer", azimuthStart: 30, azimuthEnd: 330, elevation: 60, count: 12, length: 1.3, width: 0.28, segments: 6, droop: 0.65, flare: 0.22, curl: 25, chain: true }),
      zone({ id: "bottom-long", azimuthStart: 120, azimuthEnd: 240, elevation: 78, count: 8, length: 2.4, width: 0.3, segments: 8, droop: 0.85, flare: 0.15, curl: 15, chain: true }),
    ],
  },
  "twin-tail": {
    id: "twin-tail",
    labelKo: "트윈 테일",
    blenderKit: false,
    cap: { frontHairline: 66, backHairline: 100 },
    zones: [
      FRINGE(8, 0.6),
      CROWN(8, 0.5),
      SIDE("left", 6, 0.7, { elevation: 65 }),
      SIDE("right", 6, 0.7, { elevation: 65 }),
      BACK(8, 0.8, { droop: 0.6 }),
      zone({
        id: "tail-left",
        kind: "bundle",
        azimuthStart: 0,
        azimuthEnd: 360,
        elevation: 48,
        count: 4,
        length: 2.8,
        width: 0.12,
        segments: 9,
        droop: 0.88,
        flare: 0.08,
        curl: 10,
        jitter: 0.05,
        chain: true,
        spring: { stiffness: 0.8, damping: 0.4, gravityScale: 0.08 },
        gather: { azimuth: 115, elevation: 48 },
      }),
      zone({
        id: "tail-right",
        kind: "bundle",
        azimuthStart: 0,
        azimuthEnd: 360,
        elevation: 48,
        count: 4,
        length: 2.8,
        width: 0.12,
        segments: 9,
        droop: 0.88,
        flare: 0.08,
        curl: 10,
        jitter: 0.05,
        chain: true,
        spring: { stiffness: 0.8, damping: 0.4, gravityScale: 0.08 },
        gather: { azimuth: 245, elevation: 48 },
      }),
    ],
  },
};

export const HAIR_STYLE_IDS: readonly HairStyleId[] = SLOT_PRESET_IDS.hair;

/** 스펙의 체인 수·입자 수(예산 검증용) */
export function hairChainBudget(spec: HairSpec): { chains: number; particles: number } {
  let chains = 0;
  let particles = 0;
  for (const z of spec.zones) {
    if (!z.chain) continue;
    chains += z.count;
    particles += z.count * (z.segments + 1);
  }
  return { chains, particles };
}
