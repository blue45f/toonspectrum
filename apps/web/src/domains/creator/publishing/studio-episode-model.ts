/**
 * 회차(episode) 발행 단위 모델.
 *
 * 작품 > 회차 > 페이지 계층에서 회차 메타데이터의 정규화와 페이지 순서 확정을
 * 담당한다. 렌더링·저장소·네트워크에 의존하지 않는 순수 모듈이며, 발행 검수
 * (`studio-publish-preflight`)가 이 모델을 소비한다.
 */

export const STUDIO_EPISODE_SCHEMA_VERSION = 1 as const;

export type StudioEpisodeStatus = "draft" | "ready";

export interface StudioEpisodeMetadata {
  readonly schemaVersion: typeof STUDIO_EPISODE_SCHEMA_VERSION;
  readonly id: string;
  /** 1부터 시작하는 회차 번호. 프롤로그·번외는 별도 회차로 번호를 부여한다. */
  readonly episodeNumber: number;
  readonly title: string;
  readonly synopsis: string | null;
  /** 배열 순서가 곧 발행 순서다. */
  readonly pageIds: readonly string[];
  readonly status: StudioEpisodeStatus;
}

export const STUDIO_EPISODE_ID_MAX_LENGTH = 200;
export const STUDIO_EPISODE_TITLE_MAX_LENGTH = 200;
export const STUDIO_EPISODE_SYNOPSIS_MAX_LENGTH = 2000;

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

/**
 * 영속화된 회차 기록을 정규화한다. id·회차 번호·제목이 유효하지 않으면 null을
 * 반환하고, 그 외에는 값을 버리지 않고 다듬는다. pageIds의 빈 문자열은 제거
 * 하지만 순서와 중복은 유지한다. 중복은 검수 단계에서 오류로 보고한다.
 */
export function normalizeStudioEpisodeMetadata(value: unknown): StudioEpisodeMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = cleanText(record.id, STUDIO_EPISODE_ID_MAX_LENGTH);
  if (!id) return null;
  const episodeNumber = record.episodeNumber;
  if (
    typeof episodeNumber !== "number"
    || !Number.isSafeInteger(episodeNumber)
    || episodeNumber <= 0
  ) {
    return null;
  }
  const title = cleanText(record.title, STUDIO_EPISODE_TITLE_MAX_LENGTH);
  if (!title) return null;
  const synopsis = cleanText(record.synopsis, STUDIO_EPISODE_SYNOPSIS_MAX_LENGTH);
  const pageIds: string[] = [];
  if (Array.isArray(record.pageIds)) {
    for (const candidate of record.pageIds) {
      if (typeof candidate !== "string") continue;
      const trimmed = candidate.trim();
      if (trimmed) pageIds.push(trimmed);
    }
  }
  return {
    schemaVersion: STUDIO_EPISODE_SCHEMA_VERSION,
    id,
    episodeNumber,
    title,
    synopsis: synopsis ? synopsis : null,
    pageIds,
    status: record.status === "ready" ? "ready" : "draft",
  };
}

export interface StudioEpisodePageOrderResolution {
  /** 입력 순서를 그대로 유지한 발행 순서. */
  readonly orderedPageIds: readonly string[];
  /** 패키지에 존재하지 않는 페이지 id. 입력 순서대로 보고한다. */
  readonly unknownPageIds: readonly string[];
  /** 두 번 이상 등장한 페이지 id. 최초 중복 순서대로 한 번씩 보고한다. */
  readonly duplicatePageIds: readonly string[];
}

/**
 * 회차가 선언한 페이지 순서를 패키지의 실제 페이지와 대조한다.
 * 이 함수는 순서를 바꾸지 않으며, 판정만 반환한다.
 */
export function resolveEpisodePageOrder(
  episode: Pick<StudioEpisodeMetadata, "pageIds">,
  knownPageIds: ReadonlySet<string>
): StudioEpisodePageOrderResolution {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const unknown: string[] = [];
  for (const pageId of episode.pageIds) {
    if (seen.has(pageId)) {
      if (!duplicates.includes(pageId)) duplicates.push(pageId);
      continue;
    }
    seen.add(pageId);
    if (!knownPageIds.has(pageId)) unknown.push(pageId);
  }
  return {
    orderedPageIds: [...episode.pageIds],
    unknownPageIds: unknown,
    duplicatePageIds: duplicates,
  };
}
