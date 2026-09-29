/**
 * 웹툰 포즈 프리셋 즐겨찾기(핀)·최근 사용 목록 localStorage 저장소.
 *
 * 방어 패턴: 인앱 WebView·시크릿 모드에서는 localStorage 접근 자체가 throw 하거나
 * quota를 초과할 수 있다. 모든 읽기/쓰기는 try/catch 로 감싸고, 실패 시에는
 * 메모리 상태로만 동작한다(호출자는 boolean 반환값으로 저장 실패를 알 수 있다).
 */

const FAVORITES_STORAGE_KEY = "toonstudio.webtoon-pose-preset.favorites.v1";
const RECENT_STORAGE_KEY = "toonstudio.webtoon-pose-preset.recent.v1";

/** 최근 사용 목록 최대 보관 개수. */
export const WEBTOON_POSE_PRESET_MAX_RECENT = 8;

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStringArray(key: string): string[] {
  const storage = getLocalStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of parsed) {
      if (typeof value !== "string" || value.length === 0 || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
    }
    return result;
  } catch {
    return [];
  }
}

function writeStringArray(key: string, values: readonly string[]): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(values.slice(0, 64)));
    return true;
  } catch {
    return false;
  }
}

/** 즐겨찾기(핀) 프리셋 id 목록을 읽는다. */
export function readWebtoonPosePresetFavorites(): string[] {
  return readStringArray(FAVORITES_STORAGE_KEY);
}

/**
 * 즐겨찾기를 토글하고 갱신된 id 목록을 돌려준다.
 * 저장 실패 시에도 반환 목록은 메모리 상태를 반영한다.
 */
export function toggleWebtoonPosePresetFavorite(presetId: string): string[] {
  const next = readWebtoonPosePresetFavorites();
  const index = next.indexOf(presetId);
  if (index >= 0) {
    next.splice(index, 1);
  } else {
    next.unshift(presetId);
  }
  writeStringArray(FAVORITES_STORAGE_KEY, next);
  return next;
}

/** 즐겨찾기 목록을 통째로 덮어쓴다(공유 가져오기용). */
export function writeWebtoonPosePresetFavorites(presetIds: readonly string[]): boolean {
  return writeStringArray(FAVORITES_STORAGE_KEY, presetIds);
}

/** 최근 사용 프리셋 id 목록(최신 순)을 읽는다. */
export function readWebtoonPosePresetRecent(): string[] {
  return readStringArray(RECENT_STORAGE_KEY).slice(0, WEBTOON_POSE_PRESET_MAX_RECENT);
}

/** 최근 사용 목록 맨 앞에 기록하고 갱신된 목록을 돌려준다. */
export function recordWebtoonPosePresetRecent(presetId: string): string[] {
  const next = readWebtoonPosePresetRecent().filter((id) => id !== presetId);
  next.unshift(presetId);
  const trimmed = next.slice(0, WEBTOON_POSE_PRESET_MAX_RECENT);
  writeStringArray(RECENT_STORAGE_KEY, trimmed);
  return trimmed;
}

/** 최근 사용 목록을 비운다. */
export function clearWebtoonPosePresetRecent(): boolean {
  return writeStringArray(RECENT_STORAGE_KEY, []);
}
