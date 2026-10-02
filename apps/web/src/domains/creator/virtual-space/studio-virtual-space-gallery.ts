/**
 * 전시관 (Track 4 · 벤치마크 gap 3, 웹툰 특화)
 *
 * 작품 액자 오브젝트 → 근접 시 고해상도 뷰어 + 작가 노트,
 * 도슨트 모드(따라가기+메가폰 조합), 조회수/좋아요 집계.
 *
 * 이 모듈은 데이터·근접 판정·도슨트 투어 순서·집계 순수 로직까지만 다룬다.
 *
 * 범위 명시 (후속 작업):
 * - 고해상도 뷰어 UI: 미구현 (프레임 데이터의 imageUrl을 쓴다).
 * - 도슨트 자동 추적 이동: 트랙8 따라가기 연동 필요.
 * - 메가폰 음성: 트랙7 메가폰 연동 필요.
 * - 전시 예약제 오픈·게스트 코드: 트랙5/트랙6 연동 필요.
 * - 집계 영속화: 서버/DB 연동 필요 (여기는 메모리 집계).
 */

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/** 작품 액자 오브젝트. */
export interface StudioGalleryFrame {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  /** 작가 노트. */
  readonly artistNoteKo: string;
  readonly artistNoteEn: string;
  /** 고해상도 이미지 URL (뷰어가 쓴다). */
  readonly imageUrl: string;
  readonly thumbnailUrl?: string;
  /** 액자 위치 (월드 좌표 px). */
  readonly position: StudioVirtualSpacePoint;
  /** 액자 크기(px). */
  readonly width?: number;
  readonly height?: number;
  /** 전시장 구역 이름. */
  readonly hall?: string;
}

/** 액자 목록 검증. */
export function validateStudioGalleryFrames(frames: readonly StudioGalleryFrame[]): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const frame of frames) {
    const prefix = frame?.id ? `gallery frame ${frame.id}` : "gallery frame";
    if (!frame || typeof frame !== "object") { errors.push("gallery frame is invalid"); continue; }
    if (typeof frame.id !== "string" || !frame.id.trim() || ids.has(frame.id)) {
      errors.push(`${prefix}: id가 비었거나 중복이다`);
    }
    ids.add(frame.id);
    if (!frame.titleKo.trim() || !frame.titleEn.trim()) errors.push(`${prefix}: 제목이 비었다`);
    if (!frame.artistNoteKo.trim() || !frame.artistNoteEn.trim()) errors.push(`${prefix}: 작가 노트가 비었다`);
    if (!/^https:\/\//.test(frame.imageUrl) && !frame.imageUrl.startsWith("/")) {
      errors.push(`${prefix}: imageUrl은 https:// 또는 / 로 시작해야 한다`);
    }
    if (!Number.isFinite(frame.position?.x) || !Number.isFinite(frame.position?.y)) {
      errors.push(`${prefix}: position이 올바르지 않다`);
    }
  }
  return Object.freeze(errors);
}

/** 기본 근접 반경(px). */
export const STUDIO_GALLERY_PROXIMITY_RADIUS = 140;

/**
 * 점에서 가장 가까운 근접 범위 안의 액자를 찾는다.
 * 뷰어를 열 대상 (없으면 null).
 */
export function studioGalleryFrameNear(
  frames: readonly StudioGalleryFrame[],
  point: StudioVirtualSpacePoint,
  radius: number = STUDIO_GALLERY_PROXIMITY_RADIUS,
): StudioGalleryFrame | null {
  let best: StudioGalleryFrame | null = null;
  let bestDistance = radius;
  for (const frame of frames) {
    const distance = Math.hypot(frame.position.x - point.x, frame.position.y - point.y);
    if (distance <= bestDistance) {
      best = frame;
      bestDistance = distance;
    }
  }
  return best;
}

/** 도슨트 투어 상태. */
export interface StudioDocentTour {
  /** 순회할 액자 id 순서. */
  readonly frameIds: readonly string[];
  /** 현재 액자 인덱스. */
  readonly currentIndex: number;
}

/** 도슨트 투어를 만든다. order가 없으면 액자 배열 순서. */
export function createDocentTour(
  frames: readonly StudioGalleryFrame[],
  order?: readonly string[],
): StudioDocentTour {
  const ids = frames.map((frame) => frame.id);
  const frameIds = order ? order.filter((id) => ids.includes(id)) : ids;
  if (frameIds.length === 0) throw new Error("투어할 액자가 없다");
  return { frameIds: Object.freeze([...frameIds]), currentIndex: 0 };
}

/** 투어의 현재 액자. */
export function docentTourCurrent(
  tour: StudioDocentTour,
  frames: readonly StudioGalleryFrame[],
): StudioGalleryFrame | null {
  const id = tour.frameIds[tour.currentIndex];
  return frames.find((frame) => frame.id === id) ?? null;
}

/** 다음 액자로 이동. 끝에 도달하면 null (투어 종료). */
export function advanceDocentTour(tour: StudioDocentTour): StudioDocentTour | null {
  if (tour.currentIndex + 1 >= tour.frameIds.length) return null;
  return { ...tour, currentIndex: tour.currentIndex + 1 };
}

/** 투어 진행률 0~1. */
export function docentTourProgress(tour: StudioDocentTour): number {
  if (tour.frameIds.length <= 1) return 1;
  return tour.currentIndex / (tour.frameIds.length - 1);
}

/** 액자별 집계. */
export interface StudioGalleryFrameStats {
  readonly views: number;
  readonly likes: number;
  readonly likedBy: readonly string[];
}

export type StudioGalleryStats = Readonly<Record<string, StudioGalleryFrameStats>>;

const EMPTY_STATS: StudioGalleryFrameStats = { views: 0, likes: 0, likedBy: [] };

/** 액자 조회수를 1 올린다. */
export function recordGalleryView(stats: StudioGalleryStats, frameId: string): StudioGalleryStats {
  const current = stats[frameId] ?? EMPTY_STATS;
  return { ...stats, [frameId]: { ...current, views: current.views + 1 } };
}

/** 좋아요 토글. 이미 눌렀으면 취소한다. */
export function toggleGalleryLike(
  stats: StudioGalleryStats,
  frameId: string,
  userId: string,
): StudioGalleryStats {
  if (!userId.trim()) throw new Error("userId가 비었다");
  const current = stats[frameId] ?? EMPTY_STATS;
  const liked = current.likedBy.includes(userId);
  const likedBy = liked
    ? current.likedBy.filter((id) => id !== userId)
    : [...current.likedBy, userId];
  return {
    ...stats,
    [frameId]: { ...current, likes: liked ? current.likes - 1 : current.likes + 1, likedBy: Object.freeze(likedBy) },
  };
}

/** 인기순 액자 id (조회수+좋아요 가중). */
export function studioGalleryPopularFrameIds(
  frames: readonly StudioGalleryFrame[],
  stats: StudioGalleryStats,
  limit = 5,
): readonly string[] {
  const score = (id: string) => {
    const entry = stats[id] ?? EMPTY_STATS;
    return entry.views + entry.likes * 3;
  };
  return Object.freeze(
    [...frames]
      .sort((a, b) => score(b.id) - score(a.id))
      .slice(0, Math.max(0, limit))
      .map((frame) => frame.id),
  );
}
