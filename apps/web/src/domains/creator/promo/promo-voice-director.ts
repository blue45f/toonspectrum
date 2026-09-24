import {
  buildNaturalSpeechPlan,
  estimateNaturalSpeechDurationMs,
  type NaturalSpeechPlanOptions,
  type NaturalSpeechSegment,
  type NaturalSpeechStyle,
} from "../../../shared/lib/natural-browser-speech";

import type { PromoProject, PromoVoicePresetId } from "./promo-model";

export const PROMO_VOICE_PRESETS = [
  {
    id: "natural",
    label: "자연스러운 홍보",
    description: "친근하고 또렷하게, 과장하지 않는 소개형",
    style: "promo-natural",
    rate: 1,
    pitch: 1,
  },
  {
    id: "cinematic",
    label: "시네마틱 예고편",
    description: "낮고 여유 있게, 장면 사이의 여운을 강조",
    style: "promo-cinematic",
    rate: 1,
    pitch: 0.98,
  },
  {
    id: "calm",
    label: "차분한 설명",
    description: "운세·튜토리얼·스토리 요약에 어울리는 안정형",
    style: "calm",
    rate: 1,
    pitch: 1,
  },
  {
    id: "energetic",
    label: "밝고 경쾌하게",
    description: "쇼츠와 신작 공개에 어울리는 빠른 호흡",
    style: "energetic",
    rate: 1,
    pitch: 1,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  description: string;
  style: NaturalSpeechStyle;
  rate: number;
  pitch: number;
}[];

export type PromoVoicePlan = {
  plan: NaturalSpeechSegment[];
  rate: number;
  durationMs: number;
  overrunMs: number;
};

function endingPunctuation(value: string): string {
  const text = value.trim().replace(/[\r\n]+/gu, " ");
  if (!text) return "";
  return /[.!?。！？…]$/u.test(text) ? text : `${text}.`;
}

/** Builds an editable narration draft only from copy the author already supplied. */
export function buildPromoNarrationScript(project: PromoProject): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const line = endingPunctuation(value);
    const key = line.replace(/[\s.!?。！？…]+/gu, "").toLocaleLowerCase("ko-KR");
    if (!line || !key || seen.has(key)) return;
    seen.add(key);
    lines.push(line);
  };

  if (project.title && project.title !== "나의 웹툰") add(project.title);
  for (const panel of project.panels) add(panel.caption || panel.description);
  add(project.cta);
  return lines.join("\n").slice(0, 4_000);
}

export function promoVoicePreset(id: PromoVoicePresetId) {
  return PROMO_VOICE_PRESETS.find((preset) => preset.id === id) ?? PROMO_VOICE_PRESETS[0];
}

/**
 * Keeps delivery natural first, then increases rate only within a conservative
 * range when the authored script would run beyond the video duration.
 */
export function buildPromoVoicePlan(
  text: string,
  presetId: PromoVoicePresetId,
  seconds: PromoProject["seconds"],
  autoFit = true
): PromoVoicePlan {
  const preset = promoVoicePreset(presetId);
  const baseOptions: NaturalSpeechPlanOptions = {
    style: preset.style,
    rate: preset.rate,
    pitch: preset.pitch,
    maxSegmentChars: preset.id === "cinematic" ? 54 : 66,
  };
  let rate = preset.rate;
  let plan = buildNaturalSpeechPlan(text, baseOptions);
  let durationMs = estimateNaturalSpeechDurationMs(plan);
  const budgetMs = Math.max(1_000, seconds * 1_000 - 450);

  if (autoFit && durationMs > budgetMs) {
    const fitMultiplier = Math.min(1.24, Math.max(1, durationMs / budgetMs));
    rate = Math.round(preset.rate * fitMultiplier * 100) / 100;
    plan = buildNaturalSpeechPlan(text, { ...baseOptions, rate });
    durationMs = estimateNaturalSpeechDurationMs(plan);
  }

  return {
    plan,
    rate,
    durationMs,
    overrunMs: Math.max(0, durationMs - budgetMs),
  };
}
