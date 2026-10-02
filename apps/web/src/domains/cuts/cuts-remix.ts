/**
 * 컷츠 팬 리믹스 — 허용 정책·게시 가드·리믹스 빌더·목록 선택자.
 *
 * 작가가 작품(시리즈/에피소드) 단위로 "리믹스 허용"을 켜면(opt-in, 기본 꺼짐)
 * 팬이 해당 작품 회차로 새 컷츠를 만들 수 있다. 리믹스 클립에는 원작 표시
 * (작품명·원작자·원작 링크)가 빌드 시점에 강제 삽입되며 지울 수 없다.
 * 허용이 꺼진 작품은 피드에 "리믹스 만들기" 진입 자체가 노출되지 않는다.
 *
 * 이 모듈은 순수 로직만 담는다. 상태 보관(토글 오버라이드)은 cuts-store,
 * 화면 연결은 CutsFeedPage/CutsStudioPage가 담당한다.
 * 수익 배분은 컷츠 리워드 펀드와 정산 창구를 공유할 예정이라 여기서는 다루지 않는다.
 */

import { buildCutsClip } from "./cuts-clip-builder";
import type {
  CutsBuildOptions,
  CutsClip,
  CutsRemixOrigin,
  EpisodeSource,
} from "./cuts-types";

/** 허용 정책 판정에 필요한 최소 회차 정보. */
export type RemixPolicySource = Pick<
  EpisodeSource,
  "titleId" | "episodeNumber" | "remixAllowed"
>;

/** 스토어가 보관하는 정책 오버라이드 맵. 키는 아래 정책 키, 값은 명시적 허용/차단. */
export type RemixPolicyOverrides = Readonly<Record<string, boolean>>;

/** 작품(시리즈) 단위 정책 키. */
export function remixTitlePolicyKey(titleId: string): string {
  return `title:${titleId}`;
}

/** 회차 단위 정책 키. */
export function remixEpisodePolicyKey(titleId: string, episodeNumber: number): string {
  return `episode:${titleId}:${episodeNumber}`;
}

/**
 * 허용 여부 판정.
 *
 * 우선순위: 회차 오버라이드 > 작품 오버라이드 > 회차 선언값 > 기본 꺼짐(opt-in).
 * 오버라이드는 작가가 앱에서 방금 바꾼 값이라 선언값보다 항상 우선한다.
 */
export function resolveRemixAllowed(
  source: RemixPolicySource,
  overrides: RemixPolicyOverrides = {},
): boolean {
  const episodeOverride = overrides[remixEpisodePolicyKey(source.titleId, source.episodeNumber)];
  if (episodeOverride !== undefined) return episodeOverride;
  const titleOverride = overrides[remixTitlePolicyKey(source.titleId)];
  if (titleOverride !== undefined) return titleOverride;
  return source.remixAllowed ?? false;
}

/**
 * 피드 클립 기준 허용 여부 — 클립에 대응하는 회차 선언값을 찾아 판정한다.
 * 선언값을 모르는 작품(목록에 없는 titleId)은 기본 꺼짐으로 본다.
 */
export function isClipRemixAllowed(
  clip: Pick<CutsClip, "titleId" | "episodeNumber">,
  sources: readonly RemixPolicySource[],
  overrides: RemixPolicyOverrides = {},
): boolean {
  const declared = sources.find(
    (source) => source.titleId === clip.titleId && source.episodeNumber === clip.episodeNumber,
  );
  return resolveRemixAllowed(
    { titleId: clip.titleId, episodeNumber: clip.episodeNumber, remixAllowed: declared?.remixAllowed },
    overrides,
  );
}

/** 리믹스 게시 가드 결과. */
export type RemixPublishDecision =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "needs-login" | "not-allowed" };

/**
 * 리믹스 게시 가드 — 게시 직전에 반드시 다시 판정한다.
 * 미리보기 시점에 허용이었어도, 그 사이 작가가 허용을 껐으면 게시를 막는다.
 */
export function guardRemixPublish(
  source: RemixPolicySource,
  overrides: RemixPolicyOverrides,
  actorId: string | null,
): RemixPublishDecision {
  if (!actorId) return { ok: false, reason: "needs-login" };
  if (!resolveRemixAllowed(source, overrides)) return { ok: false, reason: "not-allowed" };
  return { ok: true };
}

/** 원작 클립/회차에서 강제 원작 메타를 만든다. */
export function buildRemixOrigin(
  original: Pick<
    CutsClip,
    "id" | "titleId" | "title" | "author" | "episodeNumber" | "episodeTitle"
  >,
): CutsRemixOrigin {
  return {
    originalClipId: original.id,
    titleId: original.titleId,
    title: original.title,
    author: original.author,
    episodeNumber: original.episodeNumber,
    episodeTitle: original.episodeTitle,
    originalHref: `/title/${original.titleId}`,
  };
}

/**
 * 클립에 원작 메타를 강제한다 — 입력 클립이 들고 있던 remix 값은 신뢰하지 않고
 * 원작 기준으로 다시 쓴다. 팬이 메타를 지우거나 바꾸는 경로를 원천 차단한다.
 */
export function withRemixOrigin(
  clip: CutsClip,
  original: Pick<
    CutsClip,
    "id" | "titleId" | "title" | "author" | "episodeNumber" | "episodeTitle"
  >,
): CutsClip {
  return { ...clip, remix: buildRemixOrigin(original) };
}

/**
 * 회차로 팬 리믹스 클립을 만든다.
 * 일반 클립 빌더를 그대로 쓰고(패널이 없으면 null), 원작 메타와 리믹스 ID
 * 접두(`cuts-remix-`)를 강제한다.
 */
export function buildRemixClip(
  episode: EpisodeSource,
  fanId: string,
  originalClipId: string,
  options: CutsBuildOptions = {},
): CutsClip | null {
  const clip = buildCutsClip(episode, fanId, { ...options, idPrefix: "cuts-remix" });
  if (!clip) return null;
  return withRemixOrigin(clip, {
    id: originalClipId,
    titleId: episode.titleId,
    title: episode.title,
    author: episode.author,
    episodeNumber: episode.episodeNumber,
    episodeTitle: episode.episodeTitle,
  });
}

/** 팬 리믹스 클립인지 판정. */
export function isFanRemix(clip: Pick<CutsClip, "remix">): boolean {
  return clip.remix !== undefined;
}

/**
 * 특정 작품의 팬 리믹스 목록 — 피드 순서(최신순)를 그대로 유지한다.
 * 원작자 작품 페이지의 "팬 리믹스" 목록이 이 선택자를 쓴다.
 */
export function selectFanRemixes(
  clips: readonly CutsClip[],
  titleId: string,
): CutsClip[] {
  return clips.filter((clip) => clip.remix?.titleId === titleId);
}

/** 특정 작품의 팬 리믹스 수. */
export function countFanRemixes(clips: readonly CutsClip[], titleId: string): number {
  return selectFanRemixes(clips, titleId).length;
}
