/**
 * 전시관 뷰어 React 바인딩 (트랙 B 고도화).
 *
 * 근접/고정 액자 해석, 조회수 1회 집계(다가갈 때마다), 좋아요(게스트는
 * 로그인 nudge), 도슨트 투어 진행을 묶는다. 집계는 제어 모드(stats +
 * onStatsChange)나 내부 상태로 들고 있으며, 영속화는 호출자 몫이다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  advanceDocentTour,
  createDocentTour,
  docentTourCurrent,
  docentTourProgress,
  recordGalleryView,
  studioGalleryPopularFrameIds,
  type StudioDocentTour,
  type StudioGalleryFrame,
  type StudioGalleryFrameStats,
  type StudioGalleryStats,
} from "./studio-virtual-space-gallery";
import {
  applyGalleryLike,
  galleryFrameStatsOf,
  resolveGalleryCurrentFrame,
} from "./studio-virtual-space-gallery-viewer-state";

export interface UseStudioVirtualSpaceGalleryViewerInput {
  readonly frames: readonly StudioGalleryFrame[];
  readonly position: StudioVirtualSpacePoint | null;
  /** null이면 게스트(관람 가능, 좋아요는 로그인 안내). */
  readonly userId: string | null;
  readonly stats?: StudioGalleryStats;
  readonly onStatsChange?: (stats: StudioGalleryStats) => void;
  readonly onRequireLogin?: () => void;
}

export interface StudioGalleryDocentBinding {
  /** 0부터 시작하는 현재 순서. */
  readonly index: number;
  readonly total: number;
  readonly progress: number;
}

export interface StudioGalleryPopularEntry {
  readonly frame: StudioGalleryFrame;
  readonly views: number;
  readonly likes: number;
}

export type StudioGalleryLikeOutcome = "liked" | "unliked" | "login-required" | "no-frame";

export interface StudioVirtualSpaceGalleryViewerBinding {
  readonly currentFrame: StudioGalleryFrame | null;
  readonly currentStats: StudioGalleryFrameStats;
  readonly liked: boolean;
  readonly isGuest: boolean;
  readonly popularIds: readonly string[];
  /** 인기순 작품과 집계. 점수가 0인 작품도 순위는 매겨지므로 표시 여부는 호출자가 가른다. */
  readonly popularFrames: readonly StudioGalleryPopularEntry[];
  readonly docent: StudioGalleryDocentBinding | null;
  readonly selectFrame: (frameId: string) => void;
  readonly closeViewer: () => void;
  readonly toggleLike: () => StudioGalleryLikeOutcome;
  readonly startTour: () => void;
  readonly nextTourFrame: () => void;
  readonly stopTour: () => void;
}

export function useStudioVirtualSpaceGalleryViewer(
  input: UseStudioVirtualSpaceGalleryViewerInput,
): StudioVirtualSpaceGalleryViewerBinding {
  const { frames, position, userId, onRequireLogin } = input;
  const controlledStats = input.stats;
  const onStatsChange = input.onStatsChange;

  const [internalStats, setInternalStats] = useState<StudioGalleryStats>({});
  const stats = controlledStats ?? internalStats;
  const updateStats = useCallback((updater: (previous: StudioGalleryStats) => StudioGalleryStats) => {
    if (controlledStats !== undefined) {
      onStatsChange?.(updater(controlledStats));
    } else {
      setInternalStats((previous) => updater(previous));
    }
  }, [controlledStats, onStatsChange]);

  const [pinnedFrameId, setPinnedFrameId] = useState<string | null>(null);
  const [closedFrameId, setClosedFrameId] = useState<string | null>(null);
  const [tour, setTour] = useState<StudioDocentTour | null>(null);

  const resolved = useMemo(
    () => resolveGalleryCurrentFrame(frames, position, tour ? null : pinnedFrameId),
    [frames, position, pinnedFrameId, tour],
  );
  const tourFrame = tour ? docentTourCurrent(tour, frames) : null;
  const shown = tourFrame ?? resolved;
  const currentFrame = shown && shown.id !== closedFrameId ? shown : null;

  // 작품이 바뀔 때마다 조회수를 한 번 올린다. 멀어졌다가 다시 다가오면
  // 마지막 집계 id가 비워져 다시 집계된다.
  const updateStatsRef = useRef(updateStats);
  updateStatsRef.current = updateStats;
  const lastCountedRef = useRef<string | null>(null);
  const currentFrameId = currentFrame?.id ?? null;
  useEffect(() => {
    if (currentFrameId === null) {
      lastCountedRef.current = null;
      return;
    }
    if (lastCountedRef.current === currentFrameId) return;
    lastCountedRef.current = currentFrameId;
    updateStatsRef.current((previous) => recordGalleryView(previous, currentFrameId));
  }, [currentFrameId]);

  const currentStats = currentFrame
    ? galleryFrameStatsOf(stats, currentFrame.id)
    : galleryFrameStatsOf(stats, "");
  const liked = currentFrame ? currentStats.likedBy.includes(userId ?? "") : false;
  const popularIds = useMemo(
    () => studioGalleryPopularFrameIds(frames, stats, 3),
    [frames, stats],
  );
  const popularFrames = useMemo<readonly StudioGalleryPopularEntry[]>(
    () => popularIds.flatMap((id) => {
      const frame = frames.find((item) => item.id === id);
      if (!frame) return [];
      const entry = galleryFrameStatsOf(stats, id);
      return [{ frame, views: entry.views, likes: entry.likes }];
    }),
    [frames, popularIds, stats],
  );

  const selectFrame = useCallback((frameId: string) => {
    setTour(null);
    setPinnedFrameId(frameId);
    setClosedFrameId(null);
  }, []);

  const closeViewer = useCallback(() => {
    if (currentFrame) setClosedFrameId(currentFrame.id);
  }, [currentFrame]);

  const toggleLike = useCallback((): StudioGalleryLikeOutcome => {
    if (!currentFrame) return "no-frame";
    const result = applyGalleryLike(stats, currentFrame.id, userId);
    if (!result.ok) {
      onRequireLogin?.();
      return "login-required";
    }
    updateStats(() => result.stats);
    return result.liked ? "liked" : "unliked";
  }, [updateStats, currentFrame, onRequireLogin, stats, userId]);

  const startTour = useCallback(() => {
    try {
      setTour(createDocentTour(frames));
      setClosedFrameId(null);
    } catch {
      // 전시할 액자가 없으면 투어를 시작하지 않는다.
    }
  }, [frames]);

  const nextTourFrame = useCallback(() => {
    setTour((current) => {
      if (!current) return current;
      return advanceDocentTour(current);
    });
  }, []);

  const stopTour = useCallback(() => setTour(null), []);

  const docent: StudioGalleryDocentBinding | null = tour
    ? { index: tour.currentIndex, total: tour.frameIds.length, progress: docentTourProgress(tour) }
    : null;

  return {
    currentFrame,
    currentStats,
    liked,
    isGuest: !userId,
    popularIds,
    popularFrames,
    docent,
    selectFrame,
    closeViewer,
    toggleLike,
    startTour,
    nextTourFrame,
    stopTour,
  };
}
