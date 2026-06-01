"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useSyncExternalStore } from "react";
import type { ReadState, UserReview } from "./types";

// 로그인 시 변경을 DB API로 write-through (게스트는 localStorage만)
function apiPost(path: string, body: unknown, method = "POST") {
  if (typeof window === "undefined") return;
  fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}

export interface HydratePayload {
  ratings: Record<string, number>;
  reads: Record<string, ReadState>;
  subscriptions: Record<string, boolean>;
  reviews: Record<string, UserReview>;
  likedReviews: Record<string, boolean>;
  collections: Collection[];
}

export type RatingScale = "star" | "ten" | "hundred";

export interface Collection {
  id: string;
  name: string;
  emoji: string;
  titleIds: string[];
  createdAt: string;
}

interface AppState {
  ratings: Record<string, number>; // titleId -> 0.5~5
  reviews: Record<string, UserReview>; // titleId -> review
  reads: Record<string, ReadState>; // titleId -> 상태
  likedReviews: Record<string, boolean>; // reviewId -> liked
  subscriptions: Record<string, boolean>; // titleId -> 연재 알림 구독
  adultVerified: boolean; // 성인(만 19세+) 자가 인증 — 19금 콘텐츠 표시
  collections: Collection[];
  ratingScale: RatingScale;
  userId: string | null; // 로그인 사용자 (있으면 DB write-through)
  setUserId: (id: string | null) => void;
  hydrateFromServer: (data: HydratePayload) => void;

  setRating: (titleId: string, rating: number) => void;
  clearRating: (titleId: string) => void;
  setRead: (titleId: string, state: ReadState | null) => void;
  upsertReview: (review: UserReview) => void;
  deleteReview: (titleId: string) => void;
  toggleLikeReview: (reviewId: string) => void;
  toggleSubscription: (titleId: string) => void;
  setAdultVerified: (v: boolean) => void;
  setRatingScale: (s: RatingScale) => void;

  createCollection: (name: string, emoji: string) => string;
  deleteCollection: (id: string) => void;
  toggleInCollection: (collectionId: string, titleId: string) => void;

  resetAll: () => void;
}

const seedCollections: Collection[] = [];

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ratings: {},
      reviews: {},
      reads: {},
      likedReviews: {},
      subscriptions: {},
      adultVerified: false,
      collections: seedCollections,
      ratingScale: "star",
      userId: null,

      setUserId: (userId) => set({ userId }),
      // 서버를 진실원천으로 교체(replace). 게스트 데이터는 로그인 시 /api/me/merge 가 먼저 서버로
      // 병합하므로 여기서 덮어써도 손실이 없고, 다른 기기에서의 삭제·변경도 정확히 반영된다.
      hydrateFromServer: (d) =>
        set({
          ratings: d.ratings,
          reads: d.reads,
          subscriptions: d.subscriptions,
          reviews: d.reviews,
          likedReviews: d.likedReviews,
          collections: d.collections,
        }),

      setRating: (titleId, rating) => {
        set((s) => ({ ratings: { ...s.ratings, [titleId]: rating } }));
        if (get().userId) apiPost("/api/me/rating", { titleId, value: rating });
      },
      clearRating: (titleId) => {
        set((s) => {
          const next = { ...s.ratings };
          delete next[titleId];
          return { ratings: next };
        });
        if (get().userId) apiPost("/api/me/rating", { titleId, value: null });
      },
      setRead: (titleId, state) => {
        set((s) => {
          const next = { ...s.reads };
          if (state === null) delete next[titleId];
          else next[titleId] = state;
          return { reads: next };
        });
        if (get().userId) apiPost("/api/me/read", { titleId, state });
      },
      upsertReview: (review) => {
        set((s) => ({
          reviews: { ...s.reviews, [review.titleId]: review },
          ratings: { ...s.ratings, [review.titleId]: review.rating },
        }));
        if (get().userId)
          apiPost("/api/me/review", {
            titleId: review.titleId,
            rating: review.rating,
            text: review.text,
            tags: review.tags,
            spoiler: review.spoiler,
          });
      },
      deleteReview: (titleId) => {
        set((s) => {
          const next = { ...s.reviews };
          delete next[titleId];
          return { reviews: next };
        });
        if (get().userId) apiPost("/api/me/review", { titleId }, "DELETE");
      },
      toggleLikeReview: (reviewId) => {
        set((s) => ({
          likedReviews: { ...s.likedReviews, [reviewId]: !s.likedReviews[reviewId] },
        }));
        if (get().userId) apiPost("/api/me/review-like", { reviewId });
      },
      toggleSubscription: (titleId) => {
        set((s) => ({
          subscriptions: { ...s.subscriptions, [titleId]: !s.subscriptions[titleId] },
        }));
        if (get().userId) apiPost("/api/me/subscription", { titleId });
      },
      setAdultVerified: (adultVerified) => set({ adultVerified }),
      setRatingScale: (ratingScale) => set({ ratingScale }),

      createCollection: (name, emoji) => {
        const id = `col-${Math.abs(hashStr(name + emoji + Object.keys(get().collections).length))}`;
        set((s) => ({
          collections: [
            ...s.collections,
            { id, name, emoji, titleIds: [], createdAt: "2025-05-29T00:00:00Z" },
          ],
        }));
        if (get().userId) apiPost("/api/me/collection", { action: "create", name, emoji });
        return id;
      },
      deleteCollection: (id) => {
        set((s) => ({ collections: s.collections.filter((c) => c.id !== id) }));
        if (get().userId) apiPost("/api/me/collection", { action: "delete", id });
      },
      toggleInCollection: (collectionId, titleId) => {
        set((s) => ({
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c;
            const has = c.titleIds.includes(titleId);
            return {
              ...c,
              titleIds: has
                ? c.titleIds.filter((t) => t !== titleId)
                : [...c.titleIds, titleId],
            };
          }),
        }));
        if (get().userId) apiPost("/api/me/collection", { action: "toggle", id: collectionId, titleId });
      },

      resetAll: () =>
        set({
          ratings: {},
          reviews: {},
          reads: {},
          likedReviews: {},
          subscriptions: {},
          collections: seedCollections,
        }),
    }),
    {
      name: "webdex-store",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

// SSR/CSR 하이드레이션 가드 — persist 가 클라이언트에서 채워질 때까지 false.
// useSyncExternalStore 로 외부(persist) 상태를 구독 (effect 내 setState 없이 SSR 안전).
export function useHydrated(): boolean {
  return useSyncExternalStore(
    (cb) => useApp.persist.onFinishHydration(cb),
    () => useApp.persist.hasHydrated(),
    () => false
  );
}

// 파생 셀렉터 헬퍼 — '관심(want)'만 북마크로 간주
export function useIsBookmarked(titleId: string): boolean {
  return useApp((s) => s.reads[titleId] === "want");
}
