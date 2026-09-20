/** Provenance is separate from hiring. Birth, gender, names and scores never enter matching. */
export const FORTUNE_SIGNS = { aries: "양자리", taurus: "황소자리", gemini: "쌍둥이자리", cancer: "게자리", leo: "사자자리", virgo: "처녀자리", libra: "천칭자리", scorpio: "전갈자리", sagittarius: "사수자리", capricorn: "염소자리", aquarius: "물병자리", pisces: "물고기자리" } as const;
export type FortuneSign = keyof typeof FORTUNE_SIGNS;
export interface FortuneProvenance {
  provider: string; source: "local-deterministic" | "external-licensed";
  sourceDate: string; timeZone: "Asia/Seoul"; generatedAt: string;
  status: "local-default" | "external-current" | "local-after-provider-failure";
  externalStatus: "disabled" | "current" | "unavailable" | "circuit-open";
}
export interface SourcedFortune { sign: FortuneSign; text: string; provenance: FortuneProvenance; }
