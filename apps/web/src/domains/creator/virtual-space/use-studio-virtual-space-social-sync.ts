import { useCallback, useEffect, useRef, useState } from "react";

import type { StudioGalleryStats } from "./studio-virtual-space-gallery";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
} from "./studio-virtual-space-space-booking";
import {
  acceptBookingsSnapshot,
  acceptGalleryLikeToggle,
  acceptGalleryLikes,
  createDefaultStudioVirtualSpaceSocialTransport,
  diffBookings,
  diffGalleryLikeToggles,
  diffWaitlist,
  type StudioVirtualSpaceSocialTransport,
} from "./studio-virtual-space-booking-sync";

export interface StudioVirtualSpaceSocialSyncInput {
  /** 예약·좋아요 범위 키의 재료. (projectId, worldScope) 조합이 월드 단위 정본을 가른다. */
  readonly projectId: string;
  readonly worldScope: string;
  /** 세션 사용자 id. 없으면(게스트) 동기화하지 않는다. */
  readonly userId: string | null;
  readonly enabled: boolean;
  /** 테스트 주입용. 미지정 시 기본 전송을 만든다. */
  readonly transport?: StudioVirtualSpaceSocialTransport;
}

export interface StudioVirtualSpaceSocialSync {
  readonly bookings: readonly StudioSpaceBooking[];
  readonly setBookings: (
    next:
      | readonly StudioSpaceBooking[]
      | ((prev: readonly StudioSpaceBooking[]) => readonly StudioSpaceBooking[]),
  ) => void;
  readonly waitlist: readonly StudioSpaceWaitlistEntry[];
  readonly setWaitlist: (
    next:
      | readonly StudioSpaceWaitlistEntry[]
      | ((prev: readonly StudioSpaceWaitlistEntry[]) => readonly StudioSpaceWaitlistEntry[]),
  ) => void;
  readonly galleryStats: StudioGalleryStats;
  readonly setGalleryStats: (
    next: StudioGalleryStats | ((prev: StudioGalleryStats) => StudioGalleryStats),
  ) => void;
}

/**
 * 예약·대기열·갤러리 좋아요를 서버 정본과 동기화하는 훅.
 *
 * 패널 계약(다음 전체 배열을 넘기는 콜백)은 그대로 두고, 이 훅이 차이만 서버에
 * 반영한다. 서버 응답 스냅샷으로 교체해 승격·거절을 자동 반영하고, 실패하면
 * 스냅샷 재읽기로 맞춘 뒤에도 안 되면 이 범위를 세션 모드로 강등한다.
 * 게스트(enabled=false)면 로드도 동기화도 하지 않아 기존 동작과 동일하다.
 */
export function useStudioVirtualSpaceSocialSync(
  input: StudioVirtualSpaceSocialSyncInput,
): StudioVirtualSpaceSocialSync {
  const { userId, enabled } = input;
  // 장식 배치의 개인 scopeKey와 달리 모드를 섞지 않는다 — 같은 월드의 예약은 하나다.
  const scopeKey = JSON.stringify([input.projectId, input.worldScope]);
  const [transport] = useState<StudioVirtualSpaceSocialTransport>(
    () => input.transport ?? createDefaultStudioVirtualSpaceSocialTransport(),
  );
  const [bookings, setBookingsState] = useState<readonly StudioSpaceBooking[]>([]);
  const [waitlist, setWaitlistState] = useState<readonly StudioSpaceWaitlistEntry[]>([]);
  const [galleryStats, setGalleryStatsState] = useState<StudioGalleryStats>({});

  const bookingsRef = useRef(bookings);
  const waitlistRef = useRef(waitlist);
  const galleryStatsRef = useRef(galleryStats);
  const readyRef = useRef(false);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;

  const applyBookingsSnapshot = useCallback((value: unknown): boolean => {
    const snapshot = acceptBookingsSnapshot(value, scopeRef.current);
    if (snapshot === null) return false;
    bookingsRef.current = snapshot.bookings;
    waitlistRef.current = snapshot.waitlist;
    setBookingsState(snapshot.bookings);
    setWaitlistState(snapshot.waitlist);
    return true;
  }, []);

  const applyGalleryLikes = useCallback((value: unknown): boolean => {
    const likes = acceptGalleryLikes(value, scopeRef.current);
    if (likes === null) return false;
    // 조회수(views)는 세션 통계라 서버 값으로 덮지 않고 현재 값을 이어 붙인다.
    const merged: Record<string, { views: number; likes: number; likedBy: readonly string[] }> = {
      ...galleryStatsRef.current,
    };
    for (const [frameId, frame] of Object.entries(likes)) {
      merged[frameId] = {
        views: merged[frameId]?.views ?? 0,
        likes: frame.likes,
        likedBy: frame.likedBy,
      };
    }
    galleryStatsRef.current = merged;
    setGalleryStatsState(merged);
    return true;
  }, []);

  /** 동기화 실패 시 서버 스냅샷으로 한 번 맞추고, 그것도 실패하면 세션 모드로 강등한다. */
  const resync = useCallback(async (): Promise<void> => {
    try {
      const value = await transport.loadBookings(scopeRef.current);
      if (!applyBookingsSnapshot(value)) readyRef.current = false;
    } catch {
      readyRef.current = false;
    }
  }, [applyBookingsSnapshot, transport]);

  const enqueue = useCallback(
    (task: () => Promise<void>): void => {
      queueRef.current = queueRef.current.then(task, task);
    },
    [],
  );

  // 범위·로그인 상태가 바뀌면 서버 정본을 읽어 교체한다. 외부 시스템 동기화 effect다.
  useEffect(() => {
    readyRef.current = false;
    if (!enabled || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const value = await transport.loadBookings(scopeKey);
        if (cancelled) return;
        if (applyBookingsSnapshot(value)) readyRef.current = true;
      } catch {
        // 서버에 닿지 않으면 세션 모드로 동작한다(기존 동작).
      }
      try {
        const likes = await transport.loadGalleryLikes(scopeKey);
        if (!cancelled) applyGalleryLikes(likes);
      } catch {
        // 좋아요 로드 실패는 예약 동기화를 막지 않는다.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyBookingsSnapshot, applyGalleryLikes, enabled, scopeKey, transport, userId]);

  const setBookings = useCallback<StudioVirtualSpaceSocialSync["setBookings"]>(
    (next) => {
      const prev = bookingsRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      bookingsRef.current = resolved;
      setBookingsState(resolved);
      if (!readyRef.current) return;
      const diff = diffBookings(prev, resolved);
      if (diff.created.length === 0 && diff.cancelledIds.length === 0) return;
      const activeScope = scopeRef.current;
      enqueue(async () => {
        try {
          let last: unknown = null;
          // 취소를 먼저 보내야 서버 승격이 일어나고, 로컬 승격 예약의 생성은
          // 같은 id의 멱등 생성으로 수렴한다(순서가 반대면 슬롯 충돌로 거절된다).
          for (const bookingId of diff.cancelledIds) {
            last = await transport.cancelBooking(activeScope, bookingId);
          }
          for (const booking of diff.created) {
            last = await transport.createBooking(activeScope, booking);
          }
          if (last !== null && scopeRef.current === activeScope) applyBookingsSnapshot(last);
        } catch {
          if (scopeRef.current === activeScope) await resync();
        }
      });
    },
    [applyBookingsSnapshot, enqueue, resync, transport],
  );

  const setWaitlist = useCallback<StudioVirtualSpaceSocialSync["setWaitlist"]>(
    (next) => {
      const prev = waitlistRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      waitlistRef.current = resolved;
      setWaitlistState(resolved);
      if (!readyRef.current) return;
      const diff = diffWaitlist(prev, resolved);
      if (diff.joined.length === 0 && diff.leftIds.length === 0) return;
      const activeScope = scopeRef.current;
      enqueue(async () => {
        try {
          let last: unknown = null;
          for (const entry of diff.joined) {
            last = await transport.joinWaitlist(activeScope, entry);
          }
          for (const entryId of diff.leftIds) {
            last = await transport.leaveWaitlist(activeScope, entryId);
          }
          if (last !== null && scopeRef.current === activeScope) applyBookingsSnapshot(last);
        } catch {
          if (scopeRef.current === activeScope) await resync();
        }
      });
    },
    [applyBookingsSnapshot, enqueue, resync, transport],
  );

  const setGalleryStats = useCallback<StudioVirtualSpaceSocialSync["setGalleryStats"]>(
    (next) => {
      const prev = galleryStatsRef.current;
      const resolved = typeof next === "function" ? next(prev) : next;
      galleryStatsRef.current = resolved;
      setGalleryStatsState(resolved);
      if (!readyRef.current || !userId) return;
      const toggled = diffGalleryLikeToggles(prev, resolved, userId);
      if (toggled.length === 0) return;
      const activeScope = scopeRef.current;
      enqueue(async () => {
        try {
          for (const frameId of toggled) {
            const value = await transport.toggleGalleryLike(activeScope, frameId);
            const accepted = acceptGalleryLikeToggle(value);
            if (accepted !== null && scopeRef.current === activeScope) {
              const current = galleryStatsRef.current;
              const merged = {
                ...current,
                [accepted.frameId]: {
                  views: current[accepted.frameId]?.views ?? 0,
                  likes: accepted.likes,
                  likedBy: accepted.likedBy,
                },
              };
              galleryStatsRef.current = merged;
              setGalleryStatsState(merged);
            }
          }
        } catch {
          try {
            const likes = await transport.loadGalleryLikes(activeScope);
            if (scopeRef.current === activeScope) applyGalleryLikes(likes);
          } catch {
            // 좋아요 재동기화 실패는 세션 통계를 유지한다.
          }
        }
      });
    },
    [applyGalleryLikes, enqueue, transport, userId],
  );

  return { bookings, setBookings, waitlist, setWaitlist, galleryStats, setGalleryStats };
}
