import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";

/** 기존 제작 관리 화면의 번역 범위. 이미 번역된 문구의 키를 유지하려고 그대로 둔다. */
const HUB_SCOPE = "domains.creator.production.hub.ProductionHubPage";

/** 한국어로 쓴 기존 화면 문구를 현재 언어로 보여 준다(한국어면 원문 그대로). */
export function hubText(source: string): string {
  return translateCurrentStaticSourceText(HUB_SCOPE, "ko", source);
}

/** 영어로 쓴 기존 화면 문구(형식 문자열 포함)를 현재 언어로 보여 준다. */
export function hubEnText(source: string): string {
  return translateCurrentStaticSourceText(HUB_SCOPE, "en", source);
}
