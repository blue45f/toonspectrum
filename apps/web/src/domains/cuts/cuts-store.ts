/**
 * 컷츠 스토어 — 조회수·좋아요 집계와 피드 상태.
 *
 * 게스트-퍼스트 정책:
 * - 둘러보기(피드 시청·미리보기)는 로그인 없이 동작하고, 조회수/좋아요는
 *   항상 로컬(localStorage)에 먼저 기록된다.
 * - 로그인 상태에서는 로컬 기록과 함께 서버(`/api/cuts/...`)에도 전송을
 *   시도한다. 서버가 없거나 실패하면 로컬 기록은 유지되고, 전송 큐는
 *   다음 기회에 재시도한다(게스트 기록 유실 없음).
 * - 좋아요·게시 같은 보호 동작은 게스트에게 로그인 유도를 반환한다.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { apiFetch } from "@/platform/api";

import { remixEpisodePolicyKey, remixTitlePolicyKey } from "./cuts-remix";
import type { CutsViewEvent } from "./cuts-rewards";
import type { CutsClip } from "./cuts-types";

const STORAGE_KEY = "toonstudio-cuts-store-v1";
const MAX_CLIPS = 200;
/** 리워드 정산용 조회 이벤트 원장 상한 — 오래된 이벤트부터 버린다. */
const MAX_VIEW_EVENTS = 1000;

export interface LikeResult {
  readonly liked: boolean;
  /** 게스트라서 로그인 유도가 필요한 경우 true. */
  readonly needsLogin: boolean;
}

export interface RemixToggleResult {
  /** 토글이 실제 반영됐는지. */
  readonly applied: boolean;
  /** 게스트라서 로그인 유도가 필요한 경우 true. */
  readonly needsLogin: boolean;
}

interface PendingSyncItem {
  readonly kind: "view" | "like" | "unlike";
  readonly clipId: string;
}

interface CutsState {
  /** 게시된 클립 (최신순). */
  readonly clips: readonly CutsClip[];
  /** 좋아요한 클립 ID. */
  readonly likedClipIds: readonly string[];
  /** 이 브라우저에서 조회수를 기록한 클립 ID (중복 집계 방지). */
  readonly viewedClipIds: readonly string[];
  /** 서버 전송 대기 큐 (로그인 시에만 소진). */
  readonly pendingSync: ReadonlyArray<PendingSyncItem>;
  /**
   * 팬 리믹스 허용 토글 오버라이드 (정책 키 → 허용 여부).
   * 회차 선언값보다 우선하며, 판정은 cuts-remix의 resolveRemixAllowed가 한다.
   */
  readonly remixPolicyOverrides: Readonly<Record<string, boolean>>;
  /**
   * 리워드 펀드 정산용 조회 이벤트 원장 — 실제로 본 시간까지 남긴다.
   * 유효 조회 판정(시청 비율·상한)은 cuts-rewards가 이 원장으로 한다.
   */
  readonly viewEvents: readonly CutsViewEvent[];

  publishClip: (clip: CutsClip) => void;
  /** 조회수 기록 — 이미 본 클립이면 false 반환. */
  recordView: (clipId: string) => boolean;
  /** 조회 이벤트를 원장에 쌓는다 (리워드 정산 입력). */
  recordViewEvent: (event: CutsViewEvent) => void;
  /** 좋아요 토글 — 게스트면 needsLogin=true. */
  toggleLike: (clipId: string, actorId: string | null) => LikeResult;
  /**
   * 팬 리믹스 허용 토글 — episodeNumber가 있으면 회차 단위, 없으면 작품 단위.
   * 게스트면 needsLogin=true를 반환하고 상태를 바꾸지 않는다.
   */
  setRemixAllowed: (
    target: { readonly titleId: string; readonly episodeNumber?: number },
    allowed: boolean,
    actorId: string | null,
  ) => RemixToggleResult;
  /** 서버 전송 큐 소진 — 로그인 사용자만 호출. */
  flushSyncQueue: () => Promise<void>;
  getClip: (clipId: string) => CutsClip | undefined;
  resetForTests: () => void;
}

function trimClips(clips: readonly CutsClip[]): CutsClip[] {
  return [...clips].slice(0, MAX_CLIPS);
}

function clipById(clips: readonly CutsClip[], clipId: string): CutsClip | undefined {
  return clips.find((clip) => clip.id === clipId);
}

/** 서버 전송 — 실패해도 로컬 상태에는 영향을 주지 않는다. */
async function sendCutsEvent(
  kind: PendingSyncItem["kind"],
  clipId: string,
): Promise<boolean> {
  try {
    const response = await apiFetch(`/api/cuts/${clipId}/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clipId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const useCutsStore = create<CutsState>()(
  persist(
    (set, get) => ({
      clips: [],
      likedClipIds: [],
      viewedClipIds: [],
      pendingSync: [],
      remixPolicyOverrides: {},
      viewEvents: [],

      publishClip: (clip) => {
        set((state) => {
          const withoutDuplicate = state.clips.filter((existing) => existing.id !== clip.id);
          return { clips: trimClips([clip, ...withoutDuplicate]) };
        });
      },

      recordView: (clipId) => {
        const state = get();
        if (state.viewedClipIds.includes(clipId)) return false;
        const clip = clipById(state.clips, clipId);
        if (!clip) return false;
        set({
          clips: state.clips.map((existing) =>
            existing.id === clipId ? { ...existing, views: existing.views + 1 } : existing,
          ),
          viewedClipIds: [...state.viewedClipIds, clipId],
          pendingSync: [...state.pendingSync, { kind: "view", clipId }],
        });
        return true;
      },

      recordViewEvent: (event) => {
        set((state) => ({
          viewEvents: [...state.viewEvents, event].slice(-MAX_VIEW_EVENTS),
        }));
      },

      toggleLike: (clipId, actorId) => {
        if (!actorId) return { liked: false, needsLogin: true };
        const state = get();
        const clip = clipById(state.clips, clipId);
        if (!clip) return { liked: false, needsLogin: false };
        const liked = state.likedClipIds.includes(clipId);
        const delta = liked ? -1 : 1;
        set({
          clips: state.clips.map((existing) =>
            existing.id === clipId
              ? { ...existing, likes: Math.max(0, existing.likes + delta) }
              : existing,
          ),
          likedClipIds: liked
            ? state.likedClipIds.filter((id) => id !== clipId)
            : [...state.likedClipIds, clipId],
          pendingSync: [
            ...state.pendingSync,
            { kind: liked ? "unlike" : "like", clipId },
          ],
        });
        return { liked: !liked, needsLogin: false };
      },

      setRemixAllowed: (target, allowed, actorId) => {
        if (!actorId) return { applied: false, needsLogin: true };
        const key =
          target.episodeNumber !== undefined
            ? remixEpisodePolicyKey(target.titleId, target.episodeNumber)
            : remixTitlePolicyKey(target.titleId);
        set((state) => ({
          remixPolicyOverrides: { ...state.remixPolicyOverrides, [key]: allowed },
        }));
        return { applied: true, needsLogin: false };
      },

      flushSyncQueue: async () => {
        const queue = get().pendingSync;
        if (queue.length === 0) return;
        const remaining: PendingSyncItem[] = [];
        for (const item of queue) {
          const ok = await sendCutsEvent(item.kind, item.clipId);
          if (!ok) remaining.push(item);
        }
        set({ pendingSync: remaining });
      },

      getClip: (clipId) => clipById(get().clips, clipId),

      resetForTests: () => {
        set({
          clips: [],
          likedClipIds: [],
          viewedClipIds: [],
          pendingSync: [],
          remixPolicyOverrides: {},
          viewEvents: [],
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        clips: state.clips,
        likedClipIds: state.likedClipIds,
        viewedClipIds: state.viewedClipIds,
        pendingSync: state.pendingSync,
        remixPolicyOverrides: state.remixPolicyOverrides,
        viewEvents: state.viewEvents,
      }),
    },
  ),
);

/** 피드용 클립 목록 (게시 최신순). */
export function selectCutsFeed(state: CutsState): readonly CutsClip[] {
  return state.clips;
}

/** 조회수·좋아요를 사람이 읽기 좋게 축약 (예: 1.2만). */
export function formatCutsCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 1000) return `${Math.floor(value)}`;
  if (value < 10000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}천`;
  return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}만`;
}
