import {
  AI_DIRECTOR_SUGGESTIONS,
  type AiDirectorSuggestion,
  type AiDirectorSuggestionId,
} from "../ai/ai-creative-director";
import { AI_DIRECTOR_ANCHOR, AI_HUB_PATH } from "../ai/ai-studio-hub";
import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import { normalizeStudioProjectTitleDraft } from "./studio-project-title";

/** 작품 홈 아래쪽 전체 목록(내 작업) 영역. 로비의 "전체 작업 보기"가 이 영역으로 이동한다. */
export const STUDIO_LIBRARY_SECTION_ID = "studio-my-work";
/** 참고 보드처럼 최근 작품 다섯 개와 새 작품 칸 하나를 한 줄에 둔다. */
export const STUDIO_LOBBY_RECENT_LIMIT = 5;

const ILLUSTRATION_ROOT = "/brand/illustrated-20260928";
const LOBBY_HQ_ROOT = "/brand/lobby-hq-20261003";

/**
 * 로비 전용 고해상도 세트(brand/lobby-hq-20261003)가 제공하는 아트와 파생 너비(px).
 * 구 세트(20260928)는 2048×1360 시트를 3×2로 나눈 것이라 셀 원본이 최대 677px에
 * 머물러 히어로(약 600 CSS px 표시)가 레티나에서 크게 확대 표시됐다. 이 세트는
 * 히어로 2048px·카드 최대 1440px까지 파생본을 제공한다. 사이트 전역이 공유하는
 * 구 세트 자체는 건드리지 않는다.
 */
const LOBBY_HQ_ART_WIDTHS: Readonly<Record<string, readonly number[]>> = {
  hero: [640, 1024, 1600, 2048],
  materials: [480, 960, 1440],
  "project-crimson": [480, 960, 1440],
  "canvas-noir": [480, 768],
  storyboard: [480, 768],
  "character-pink": [480, 768],
  "background-city": [480, 768],
  "blank-canvas": [480, 768],
  "background-classroom": [480, 768],
  "project-romance": [480, 768],
  "character-blue": [480, 768],
};

/** 로비에서 바로 고를 수 있는 AI 디렉터 제안(실제 디렉터 제안 목록의 앞 세 가지와 같은 항목). */
export const STUDIO_LOBBY_DIRECTOR_SUGGESTION_IDS = [
  "story-expand",
  "character-analysis",
  "scene-composition",
] as const satisfies readonly AiDirectorSuggestionId[];

/**
 * AI 크리에이티브 디렉터(AI 허브의 디렉터 영역)로 가는 주소.
 * 제안을 넘기면 `?suggestion=`에 싣는다. 허브가 이 값을 읽으면 해당 제안이 미리 선택된다.
 */
export function studioLobbyDirectorHref(suggestionId?: AiDirectorSuggestionId): string {
  const query = suggestionId ? `?suggestion=${encodeURIComponent(suggestionId)}` : "";
  return `${AI_HUB_PATH}${query}#${AI_DIRECTOR_ANCHOR}`;
}

/** 로비 빠른 요청에 쓸 제안. 이름·설명은 디렉터 화면과 같은 원본을 그대로 쓴다. */
export function studioLobbyDirectorSuggestions(): readonly AiDirectorSuggestion[] {
  const wanted = new Set<AiDirectorSuggestionId>(STUDIO_LOBBY_DIRECTOR_SUGGESTION_IDS);
  return AI_DIRECTOR_SUGGESTIONS.filter((suggestion) => wanted.has(suggestion.id));
}

/** 새 작품 화면이 `?start=`로 받는 시작점 중 한 줄 아이디어에 해당하는 값. */
export const STUDIO_NEW_IDEA_START_POINT = "idea";

/**
 * 한 줄 아이디어를 새 작품 화면으로 넘긴다. 제목 초안으로 채우고 '아이디어부터' 시작점을 고른다.
 * 빈 값이면 일반 새 작품 화면을 연다.
 */
export function studioLobbyIdeaHref(idea: string): string {
  const title = normalizeStudioProjectTitleDraft(idea);
  if (!title) return "/studio/new";
  const search = new URLSearchParams({ title, start: STUDIO_NEW_IDEA_START_POINT });
  return `/studio/new?${search.toString()}`;
}

function openedAt(project: StudioProjectLibraryEntry): number {
  const value = Date.parse(project.lastOpenedAt);
  return Number.isFinite(value) ? value : 0;
}

/** 활성 작품만 마지막으로 연 순서대로 고른다(원본 배열은 바꾸지 않는다). */
export function studioLobbyRecentProjects(
  projects: readonly StudioProjectLibraryEntry[],
  limit: number = STUDIO_LOBBY_RECENT_LIMIT,
): readonly StudioProjectLibraryEntry[] {
  return projects
    .filter((project) => project.status === "active")
    .toSorted((left, right) => openedAt(right) - openedAt(left))
    .slice(0, limit);
}

export interface StudioLobbyArtSource {
  readonly src: string;
  readonly srcSet: string;
}

/**
 * 로비 아트의 전송 소스. 고해상도 세트에 있는 아트는 그 파생본을, 없는 아트
 * (luna — 표시 64 CSS px이라 구 세트 해상도로 충분하고 마스코트 정체성을 유지한다)는
 * 구 세트의 320·640px 파생본을 쓴다. 어느 쪽이든 카드 크기에 맞는 파일만 받게 한다.
 */
export function studioLobbyArtSource(fileName: string): StudioLobbyArtSource {
  const base = fileName.replace(/\.webp$/u, "");
  const hqWidths = LOBBY_HQ_ART_WIDTHS[base];
  if (hqWidths && hqWidths.length > 0) {
    let largest = 0;
    for (const width of hqWidths) largest = Math.max(largest, width);
    return {
      src: `${LOBBY_HQ_ROOT}/${base}-${largest}.webp`,
      srcSet: hqWidths.map((width) => `${LOBBY_HQ_ROOT}/${base}-${width}.webp ${width}w`).join(", "),
    };
  }
  return {
    src: `${ILLUSTRATION_ROOT}/${base}-640.webp`,
    srcSet: `${ILLUSTRATION_ROOT}/${base}-320.webp 320w, ${ILLUSTRATION_ROOT}/${base}-640.webp 640w`,
  };
}
