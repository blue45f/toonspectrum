import { reflectanceToKsRatio } from "./kubelka-munk";

import type { KS } from "./kubelka-munk";

/**
 * 안료 8종 자체 합성 K/S 계수(측정 데이터 아님, `synthetic: true`).
 * 각 안료는 선형 RGB 무한 두께 반사율에서 K = F(R)·S로 역산했고 S는 안료 종류별 산란 추정치다.
 */
export type PigmentId =
  | "titanium-white"
  | "ivory-black"
  | "cadmium-yellow"
  | "cadmium-red"
  | "ultramarine"
  | "phthalo-green"
  | "yellow-ochre"
  | "burnt-sienna";

export interface PigmentEntry {
  name: string;
  /** 선형 RGB 무한 두께 반사율(합성값). */
  reflectance: [number, number, number];
  ks: KS;
  synthetic: true;
}

function entry(name: string, reflectance: [number, number, number], scatter: number): PigmentEntry {
  const s: [number, number, number] = [scatter, scatter, scatter];
  const k: [number, number, number] = [
    reflectanceToKsRatio(reflectance[0]) * scatter,
    reflectanceToKsRatio(reflectance[1]) * scatter,
    reflectanceToKsRatio(reflectance[2]) * scatter,
  ];
  return { name, reflectance, ks: { k, s }, synthetic: true };
}

export const PIGMENTS: Record<PigmentId, PigmentEntry> = {
  "titanium-white": entry("티타늄 화이트", [0.95, 0.95, 0.94], 1.0),
  "ivory-black": entry("아이보리 블랙", [0.02, 0.02, 0.02], 0.2),
  "cadmium-yellow": entry("카드뮴 옐로", [0.9, 0.85, 0.12], 0.6),
  "cadmium-red": entry("카드뮴 레드", [0.8, 0.08, 0.05], 0.5),
  ultramarine: entry("울트라마린", [0.12, 0.28, 0.82], 0.35),
  "phthalo-green": entry("프탈로 그린", [0.03, 0.45, 0.3], 0.25),
  "yellow-ochre": entry("옐로 오커", [0.65, 0.45, 0.12], 0.6),
  "burnt-sienna": entry("번트 시에나", [0.35, 0.14, 0.06], 0.45),
};

export const PIGMENT_IDS = Object.keys(PIGMENTS) as PigmentId[];
