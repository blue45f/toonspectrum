// 작가 성장·IP 작업대 공통 — 이중 언어 변환, 입력 도우미, 섹션 공용 props, 스타일 클래스.
import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

import type { AgePolicyDecision, AssistantMatch, CreatorGrowthIpState } from "./creator-growth-ip-model";
import type { LabelPair } from "./growth-ip-labels";

/** 기존 번역 키와 이어지도록 페이지 범위("CreatorGrowthIpPage")를 그대로 쓴다. */
export const bi = <T,>(ko: T, en: T): T => translateBilingualValueForActiveLocale("CreatorGrowthIpPage", ko, en);
export const biLabel = (pair: LabelPair): string => bi(pair[0], pair[1]);

export const GROWTH_CARD = "rounded-2xl border border-line bg-card p-4 sm:p-5";
export const GROWTH_INPUT = "mt-1.5 block min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm font-normal text-fg outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/40";
const BUTTON_BASE = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const GROWTH_BUTTON = `${BUTTON_BASE} border-line bg-card text-fg-2 hover:bg-raised hover:text-fg`;
export const GROWTH_PRIMARY = `${BUTTON_BASE} border-accent/40 bg-accent text-on-accent hover:bg-accent-2`;
export const GROWTH_ITEM = "rounded-xl border border-line bg-panel p-3";

/** 섹션 컴포넌트 공용 props — 상태 갱신과 "그 섹션 바로 아래"에 보일 안내를 페이지가 넘겨 준다. */
export interface GrowthSectionProps {
  readonly state: CreatorGrowthIpState;
  readonly update: (recipe: (current: CreatorGrowthIpState) => CreatorGrowthIpState) => void;
  readonly notify: (message: string) => void;
  readonly notice: string | null;
}

/** 쉼표·줄바꿈으로 구분한 태그를 중복 없이 최대 20개로 정리한다. */
export function splitTags(value: string): string[] {
  return [...new Set(value.split(/[,\n]/u).map((item) => item.trim()).filter(Boolean))].slice(0, 20);
}

export function safeUuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

/** 숫자 입력을 범위 안 값으로 — 빈 값·NaN은 fallback. */
export function clampNumber(value: string | number, min: number, max: number, fallback = min): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

/** 사용자가 적은 외부 링크는 http(s)만 남긴다 — 저장 전에도 화면에 javascript: 같은 주소가 링크로 걸리지 않게. */
export function safeExternalUrl(value: string): string {
  const raw = value.trim().slice(0, 1000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function policyReason(decision: AgePolicyDecision): string {
  return bi(decision.reason, decision.reasonEn);
}

/** 어시스트 후보 적합도 근거를 현재 언어로. */
export function assistantMatchReasons(match: AssistantMatch): string[] {
  const { fit } = match;
  return [
    fit.roles.length ? `${bi("역할 일치", "Role match")}: ${fit.roles.join(", ")}` : bi("역할 일치 없음", "No role match"),
    fit.languages.length ? `${bi("언어 일치", "Language match")}: ${fit.languages.join(", ")}` : bi("언어 일치 없음", "No language match"),
    fit.timezone ? bi("겹치는 시간 충족", "Enough time overlap") : bi("겹치는 시간 부족", "Not enough time overlap"),
    fit.budget ? bi("예산 범위 내", "Within budget") : bi("예산 초과", "Over budget"),
  ];
}
