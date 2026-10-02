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

import type { CutsClip } from "./cuts-types";

const STORAGE_KEY = "toonstudio-cuts-store-v1";
const MAX_CLIPS = 200;

export interface LikeResult {
  readonly liked: boolean;
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

  publishClip: (clip: CutsClip) => void;
  /** 조회수 기록 — 이미 본 클립이면 false 반환. */
  recordView: (clipId: string) => boolean;
  /** 좋아요 토글 — 게스트면 needsLogin=true. */
  toggleLike: (clipId: string, actorId: string | null) => LikeResult;
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
        set({ clips: [], likedClipIds: [], viewedClipIds: [], pendingSync: [] });
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
