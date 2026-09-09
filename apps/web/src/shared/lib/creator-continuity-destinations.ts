import type {
  CreatorContinuityLocale,
  CreatorDestinationId,
} from "./creator-continuity-model";

export interface CreatorDestinationDefinition {
  readonly id: CreatorDestinationId;
  readonly pathname: string;
  readonly label: Record<CreatorContinuityLocale, string>;
  readonly description: Record<CreatorContinuityLocale, string>;
}

// Specific nested paths come first so they never collapse into a parent route.
export const CREATOR_DESTINATIONS: readonly CreatorDestinationDefinition[] = [
  { id: "comic", pathname: "/studio/comic", label: { ko: "컷툰 작업", en: "Comic workspace" }, description: { ko: "컷과 대사를 이어서 구성하기", en: "Continue arranging panels and dialogue" } },
  { id: "reference-atlas", pathname: "/research/assets", label: { ko: "레퍼런스 아틀라스", en: "Reference atlas" }, description: { ko: "복식·소품·미술 자료 이어보기", en: "Continue exploring costume, prop and art references" } },
  { id: "opportunities", pathname: "/opportunities", label: { ko: "작가 기회센터", en: "Creator opportunities" }, description: { ko: "공모전과 지원사업 이어보기", en: "Continue reviewing contests and support programs" } },
  { id: "research", pathname: "/research", label: { ko: "리서치 데스크", en: "Research desk" }, description: { ko: "출처와 판단 노트 이어서 정리하기", en: "Continue organizing sources and decision notes" } },
  { id: "studio", pathname: "/studio", label: { ko: "창작 스튜디오", en: "Creative studio" }, description: { ko: "마지막 창작 흐름으로 돌아가기", en: "Return to your creative workspace" } },
  { id: "shaper", pathname: "/shaper", label: { ko: "캐릭터 셰이퍼", en: "Character shaper" }, description: { ko: "캐릭터와 포즈 구상 이어가기", en: "Continue shaping characters and poses" } },
  { id: "market", pathname: "/market", label: { ko: "에셋 마켓", en: "Asset market" }, description: { ko: "브러시·배경·소품 다시 살펴보기", en: "Return to brushes, backgrounds and props" } },
  { id: "daily", pathname: "/now", label: { ko: "오늘의 영감", en: "Daily inspiration" }, description: { ko: "오늘의 소재와 5컷 미션 이어보기", en: "Continue today's prompt and five-panel mission" } },
  { id: "gallery", pathname: "/create", label: { ko: "창작 갤러리", en: "Creator gallery" }, description: { ko: "다른 창작자의 작품과 흐름 보기", en: "Continue discovering other creators" } },
  { id: "explore", pathname: "/explore", label: { ko: "작품 탐색", en: "Story discovery" }, description: { ko: "장르와 태그 탐색 이어보기", en: "Continue exploring genres and tags" } },
  { id: "ranking", pathname: "/ranking", label: { ko: "통합 랭킹", en: "Rankings" }, description: { ko: "지금 움직이는 작품 다시 보기", en: "Return to stories gaining momentum" } },
  { id: "calendar", pathname: "/calendar", label: { ko: "연재 캘린더", en: "Release calendar" }, description: { ko: "요일별 연재 일정 다시 보기", en: "Return to the release schedule" } },
  { id: "community", pathname: "/community", label: { ko: "커뮤니티", en: "Community" }, description: { ko: "작품과 창작 이야기를 이어가기", en: "Continue the conversation around stories and making" } },
] as const;

const BY_ID = new Map(CREATOR_DESTINATIONS.map((item) => [item.id, item] as const));
const SAFE_STUDIO_PRESETS = new Set(["webtoon", "4cut", "illustration"]);

export function isCreatorDestinationId(value: unknown): value is CreatorDestinationId {
  return typeof value === "string" && BY_ID.has(value as CreatorDestinationId);
}

export function matchCreatorDestination(pathname: string): CreatorDestinationDefinition | undefined {
  return CREATOR_DESTINATIONS.find(
    (item) => pathname === item.pathname || pathname.startsWith(`${item.pathname}/`),
  );
}

export function safeCreatorDestinationHref(
  destination: CreatorDestinationDefinition,
  search = "",
): string {
  if (destination.id !== "studio") return destination.pathname;
  try {
    const preset = new URLSearchParams(search).get("preset");
    return preset && SAFE_STUDIO_PRESETS.has(preset)
      ? `${destination.pathname}?preset=${encodeURIComponent(preset)}`
      : destination.pathname;
  } catch {
    return destination.pathname;
  }
}

export function creatorDestinationLabel(
  id: CreatorDestinationId,
  locale: CreatorContinuityLocale,
): string {
  return BY_ID.get(id)?.label[locale] ?? id;
}

export function creatorDestinationDescription(
  id: CreatorDestinationId,
  locale: CreatorContinuityLocale,
): string {
  return BY_ID.get(id)?.description[locale] ?? "";
}

export function formatCreatorRelativeTime(
  visitedAt: number,
  locale: CreatorContinuityLocale,
  now = Date.now(),
): string {
  const minutes = Math.floor(Math.max(0, now - visitedAt) / 60_000);
  if (minutes < 1) return locale === "ko" ? "방금 전" : "Just now";
  if (minutes < 60) return locale === "ko" ? `${minutes}분 전` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === "ko" ? `${hours}시간 전` : `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return locale === "ko" ? "어제" : "Yesterday";
  if (days < 30) return locale === "ko" ? `${days}일 전` : `${days} days ago`;
  const months = Math.floor(days / 30);
  return locale === "ko" ? `${months}개월 전` : `${months} mo ago`;
}
