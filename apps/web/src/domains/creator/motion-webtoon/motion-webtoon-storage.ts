/**
 * 모션 웹툰 회차 로컬 저장소.
 *
 * 공유 링크(#motion-episode=<id>)가 실제로 동작하도록 회차를
 * localStorage에 저장·복원한다. 공유는 같은 브라우저 안에서만
 * 복원된다는 점을 UI 문구로 정직하게 안내한다.
 */

import type { MotionEpisode } from "./motion-webtoon-model";

export const MOTION_EPISODE_SHARE_HASH_PREFIX = "#motion-episode=";

/** 공유 해시에서 회차 ID를 추출한다. */
export function parseShareHashId(hash: string): string | null {
  if (!hash.startsWith(MOTION_EPISODE_SHARE_HASH_PREFIX)) return null;
  const id = decodeURIComponent(hash.slice(MOTION_EPISODE_SHARE_HASH_PREFIX.length));
  return id.trim() ? id : null;
}

/** 회차 ID로 공유 해시를 만든다. */
export function buildShareHashId(episodeId: string): string {
  return `${MOTION_EPISODE_SHARE_HASH_PREFIX}${encodeURIComponent(episodeId)}`;
}

function storageKey(episodeId: string): string {
  return `toonstudio:motion-webtoon:episode:${episodeId}`;
}

function readStorage(key: string, storage: Storage | null): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** 저장에 성공하면 true. 저장 공간 부족·비공개 모드에서도 편집은 계속되고, 실패 사실만 호출자에게 알린다. */
function writeStorage(key: string, value: string, storage: Storage | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key: string, storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // 무시
  }
}

/** 저장된 회차인지 가볍게 확인한다. */
export function isStoredMotionEpisode(value: unknown): value is MotionEpisode {
  if (typeof value !== "object" || value === null) return false;
  const episode = value as Partial<MotionEpisode>;
  return (
    typeof episode.id === "string" &&
    typeof episode.titleKo === "string" &&
    Array.isArray(episode.cuts) &&
    Array.isArray(episode.characters)
  );
}

/**
 * 회차를 저장한다 (에디터 onChange에서 호출).
 * 회차 본문 저장에 성공했는지 돌려준다 — 실패하면 화면이 "이 탭에서만 유지됨"을 알릴 수 있다.
 */
export function saveMotionEpisode(episode: MotionEpisode, storage: Storage | null = defaultStorage()): boolean {
  const saved = writeStorage(storageKey(episode.id), JSON.stringify(episode), storage);
  if (saved) writeStorage("toonstudio:motion-webtoon:last-episode-id", episode.id, storage);
  return saved;
}

/** ID로 회차를 복원한다. 없거나 손상되면 null. */
export function loadMotionEpisode(episodeId: string, storage: Storage | null = defaultStorage()): MotionEpisode | null {
  const raw = readStorage(storageKey(episodeId), storage);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredMotionEpisode(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 마지막으로 편집하던 회차 ID. */
export function loadLastEpisodeId(storage: Storage | null = defaultStorage()): string | null {
  return readStorage("toonstudio:motion-webtoon:last-episode-id", storage);
}

/** 저장된 회차를 삭제한다. */
export function deleteMotionEpisode(episodeId: string, storage: Storage | null = defaultStorage()): void {
  removeStorage(storageKey(episodeId), storage);
}

function defaultStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
