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
 * 브랜드 예시 일러스트(사용자 작품 아님)는 320·640px 파생본이 함께 배포된다.
 * 카드 크기에 맞는 파일만 받게 한다.
 */
export function studioLobbyArtSource(fileName: string): StudioLobbyArtSource {
  const base = fileName.replace(/\.webp$/u, "");
  return {
    src: `${ILLUSTRATION_ROOT}/${base}-640.webp`,
    srcSet: `${ILLUSTRATION_ROOT}/${base}-320.webp 320w, ${ILLUSTRATION_ROOT}/${base}-640.webp 640w`,
  };
}
