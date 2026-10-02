/**
 * 타임랩스 공유 클립 스토어 — 게스트-퍼스트 로컬 집계.
 *
 * - 게스트·로그인 사용자 모두: zustand persist(localStorage)에 메타데이터·좋아요·조회수를
 *   보관한다. 영상 Blob은 세션 휘발성이라 인메모리 레지스트리(URL.createObjectURL)에만 둔다.
 * - 로그인 사용자: serverAdapter가 연결되면 좋아요·조회수를 서버에도 미러링한다
 *   (낙관적 로컬 반영 → 서버 reconcile, CreateWorkPage의 toggleWorkLike 패턴과 동일).
 *   apps/api에 /timelapse-clips 계열 엔드포인트가 생기면 @/platform/creator-client 경유
 *   구현을 setServerAdapter로 연결하면 된다. 어댑터가 없으면 로컬 전용으로 동작한다.
 */

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

import {
  MAX_TIMELAPSE_CLIPS,
  buildTimelapseSharedClip,
  type TimelapsePublishInput,
  type TimelapseSharedClip,
} from "./timelapse-share-model";

export const TIMELAPSE_SHARE_STORAGE_KEY = "toonstudio:timelapse-share-v1";

/** 로그인 사용자용 서버 집계 어댑터(미구현 시 null — 로컬 전용). */
export interface TimelapseClipServerAdapter {
  readonly pushClip: (clip: TimelapseSharedClip) => Promise<void>;
  readonly toggleLike: (
    clipId: string,
    liked: boolean,
  ) => Promise<{ liked: boolean; likes: number }>;
  readonly recordView: (clipId: string) => Promise<void>;
}

// ── Blob 레지스트리(세션 휘발성 — persist 대상 아님) ──────────────────

const clipBlobRegistry = new Map<string, { blob: Blob; objectUrl: string }>();

function revokeEntry(clipId: string): void {
  const entry = clipBlobRegistry.get(clipId);
  if (!entry) return;
  try {
    URL.revokeObjectURL(entry.objectUrl);
  } catch {
    // 이미 해제된 URL — 무시
  }
  clipBlobRegistry.delete(clipId);
}

/** 게시된 클립의 영상 Blob을 세션 레지스트리에 등록하고 재생용 object URL을 돌려준다. */
export function registerTimelapseClipBlob(clipId: string, blob: Blob): string {
  revokeEntry(clipId);
  const objectUrl = URL.createObjectURL(blob);
  clipBlobRegistry.set(clipId, { blob, objectUrl });
  return objectUrl;
}

/** 이 세션에 등록된 클립의 재생 URL. 새로고침 후에는 null(썸네일·메타만 표시). */
export function getTimelapseClipObjectUrl(clipId: string): string | null {
  return clipBlobRegistry.get(clipId)?.objectUrl ?? null;
}

/** 클립 삭제 시 Blob URL을 해제한다. */
export function revokeTimelapseClipBlob(clipId: string): void {
  revokeEntry(clipId);
}

// ── 스토어 ──────────────────────────────────────────────────────────

const MAX_VIEWED_IDS = 500;

export interface TimelapseShareState {
  readonly clips: readonly TimelapseSharedClip[];
  /** 조회수 중복 집계를 막는 본인 조회 기록(클립 id 집합). */
  readonly viewedClipIds: readonly string[];
  /** 로그인 사용자용 서버 어댑터. 휘발성이라 persist에서 제외한다. */
  readonly serverAdapter: TimelapseClipServerAdapter | null;

  readonly setServerAdapter: (adapter: TimelapseClipServerAdapter | null) => void;
  /** 클립 게시 → 저장된 클립 반환. 서버 어댑터가 있으면 best-effort로 미러링한다. */
  readonly publishClip: (input: TimelapsePublishInput) => TimelapseSharedClip;
  readonly removeClip: (id: string) => void;
  /**
   * 좋아요 낙관적 토글 — 바뀐 liked를 반환한다.
   * 호출부(카드)가 로그인 상태 + 어댑터가 있을 때 서버 reconcile을 이어서 수행한다.
   */
  readonly toggleLike: (id: string) => boolean;
  /** 서버 좋아요 응답으로 로컬 상태를 맞춤(로그인 사용자). */
  readonly applyServerLike: (id: string, liked: boolean, likes: number) => void;
  /** 조회수 집계 — 본인이 이미 본 클립은 다시 세지 않는다. 서버 미러는 best-effort. */
  readonly recordView: (id: string) => void;
  /** 서버 조회수 응답으로 로컬 상태를 맞춤(로그인 사용자). */
  readonly applyServerView: (id: string, views: number) => void;
}

function updateClip(
  clips: readonly TimelapseSharedClip[],
  id: string,
  patch: (clip: TimelapseSharedClip) => TimelapseSharedClip,
): TimelapseSharedClip[] {
  return clips.map((clip) => (clip.id === id ? patch(clip) : clip));
}

export function createTimelapseShareStore(storage: () => StateStorage) {
  return create<TimelapseShareState>()(
    persist(
      (set, get) => ({
        clips: [],
        viewedClipIds: [],
        serverAdapter: null,

        setServerAdapter: (adapter) => set({ serverAdapter: adapter }),

        publishClip: (input) => {
          const clip = buildTimelapseSharedClip(input);
          set((state) => ({
            clips: [clip, ...state.clips].slice(0, MAX_TIMELAPSE_CLIPS),
          }));
          const adapter = get().serverAdapter;
          if (adapter) {
            // 서버 미러는 best-effort — 실패해도 로컬 게시는 유지된다.
            void adapter.pushClip(clip).catch(() => undefined);
          }
          return clip;
        },

        removeClip: (id) => {
          revokeTimelapseClipBlob(id);
          set((state) => ({
            clips: state.clips.filter((clip) => clip.id !== id),
            viewedClipIds: state.viewedClipIds.filter((viewedId) => viewedId !== id),
          }));
        },

        toggleLike: (id) => {
          let nextLiked = false;
          set((state) => ({
            clips: updateClip(state.clips, id, (clip) => {
              nextLiked = !clip.liked;
              return {
                ...clip,
                liked: nextLiked,
                likes: Math.max(0, clip.likes + (nextLiked ? 1 : -1)),
              };
            }),
          }));
          return nextLiked;
        },

        applyServerLike: (id, liked, likes) =>
          set((state) => ({
            clips: updateClip(state.clips, id, (clip) => ({
              ...clip,
              liked,
              likes: Math.max(0, Math.round(likes)),
            })),
          })),

        recordView: (id) => {
          const state = get();
          if (state.viewedClipIds.includes(id)) return;
          set((current) => ({
            clips: updateClip(current.clips, id, (clip) => ({
              ...clip,
              views: clip.views + 1,
            })),
            viewedClipIds: [...current.viewedClipIds, id].slice(-MAX_VIEWED_IDS),
          }));
          const adapter = get().serverAdapter;
          if (adapter) {
            void adapter.recordView(id).catch(() => undefined);
          }
        },

        applyServerView: (id, views) =>
          set((state) => ({
            clips: updateClip(state.clips, id, (clip) => ({
              ...clip,
              views: Math.max(0, Math.round(views)),
            })),
          })),
      }),
      {
        name: TIMELAPSE_SHARE_STORAGE_KEY,
        version: 1,
        storage: createJSONStorage(storage),
        partialize: (state) => ({
          clips: state.clips,
          viewedClipIds: state.viewedClipIds,
        }),
      },
    ),
  );
}

export const useTimelapseShareStore = createTimelapseShareStore(() => localStorage);
