/**
 * 전시관 뷰어 상태 (트랙 B 고도화).
 *
 * `studio-virtual-space-gallery.ts`의 근접 판정·집계 위에 뷰어가 바로 쓸
 * 상태 해석을 얹는다.
 * - 현재 작품: 근접 액자가 우선, 없으면 고정(pin)한 액자.
 * - 좋아요: 기존 `toggleGalleryLike`는 빈 userId에서 예외를 던지므로,
 *   게스트를 예외가 아닌 `login-required` 결과로 분기한다(관람은 무로그인).
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  studioGalleryFrameNear,
  toggleGalleryLike,
  type StudioGalleryFrame,
  type StudioGalleryFrameStats,
  type StudioGalleryStats,
} from "./studio-virtual-space-gallery";

const EMPTY_FRAME_STATS: StudioGalleryFrameStats = Object.freeze({ views: 0, likes: 0, likedBy: [] });

/** 액자 집계를 읽는다. 기록이 없으면 0으로 채운 기본값. */
export function galleryFrameStatsOf(
  stats: StudioGalleryStats,
  frameId: string,
): StudioGalleryFrameStats {
  return stats[frameId] ?? EMPTY_FRAME_STATS;
}

/** 현재 사용자가 이 액자에 좋아요를 눌렀는지. 게스트는 항상 false. */
export function galleryFrameLikedBy(
  stats: StudioGalleryStats,
  frameId: string,
  userId: string | null,
): boolean {
  if (!userId || !userId.trim()) return false;
  return galleryFrameStatsOf(stats, frameId).likedBy.includes(userId);
}

/**
 * 지금 보여 줄 액자. 근접 범위 안의 액자가 있으면 그쪽이 우선이고,
 * 없으면 사용자가 목록에서 고정(pin)한 액자를 보여 준다.
 */
export function resolveGalleryCurrentFrame(
  frames: readonly StudioGalleryFrame[],
  position: StudioVirtualSpacePoint | null,
  pinnedFrameId: string | null,
): StudioGalleryFrame | null {
  if (position) {
    const near = studioGalleryFrameNear(frames, position);
    if (near) return near;
  }
  if (pinnedFrameId) {
    return frames.find((frame) => frame.id === pinnedFrameId) ?? null;
  }
  return null;
}

export type GalleryLikeResult =
  | { readonly ok: true; readonly stats: StudioGalleryStats; readonly liked: boolean }
  | { readonly ok: false; readonly reason: "login-required" };

/**
 * 좋아요 토글(게스트 안전). 로그인하지 않았으면 상태를 바꾸지 않고
 * `login-required`를 돌려준다 — 호출자가 로그인 안내로 분기한다.
 */
export function applyGalleryLike(
  stats: StudioGalleryStats,
  frameId: string,
  userId: string | null,
): GalleryLikeResult {
  if (!userId || !userId.trim()) return { ok: false, reason: "login-required" };
  const next = toggleGalleryLike(stats, frameId, userId);
  return { ok: true, stats: next, liked: galleryFrameLikedBy(next, frameId, userId) };
}
