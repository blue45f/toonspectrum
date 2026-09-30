/**
 * Studio 3D 포즈 프리셋 즐겨찾기(핀)·최근 사용 목록 localStorage 저장소 팩토리.
 *
 * 웹툰 포즈·데생 인형 포즈·손 프리셋 등 "id 목록" 기반 갤러리라면 네임스페이스만
 * 바꿔 같은 계약으로 재사용한다. 방어 패턴은 기존과 동일하다: 인앱 WebView·
 * 시크릿 모드에서는 localStorage 접근 자체가 throw 하거나 quota를 초과할 수
 * 있으므로 모든 읽기/쓰기는 try/catch 로 감싸고, 실패 시에는 메모리 상태로만
 * 동작한다(호출자는 boolean 반환값으로 저장 실패를 알 수 있다).
 */

export interface StudioPosePresetStorage {
  /** 즐겨찾기(핀) 프리셋 id 목록을 읽는다. */
  readonly readFavorites: () => string[];
  /** 즐겨찾기를 토글하고 갱신된 id 목록을 돌려준다. */
  readonly toggleFavorite: (presetId: string) => string[];
  /** 즐겨찾기 목록을 통째로 덮어쓴다(공유 가져오기용). */
  readonly writeFavorites: (presetIds: readonly string[]) => boolean;
  /** 최근 사용 프리셋 id 목록(최신 순)을 읽는다. */
  readonly readRecent: () => string[];
  /** 최근 사용 목록 맨 앞에 기록하고 갱신된 목록을 돌려준다. */
  readonly recordRecent: (presetId: string) => string[];
  /** 최근 사용 목록을 비운다. */
  readonly clearRecent: () => boolean;
}

/** 최근 사용 목록 기본 최대 보관 개수. */
export const STUDIO_POSE_PRESET_MAX_RECENT_DEFAULT = 8;

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

/**
 * 네임스페이스별 즐겨찾기·최근 사용 저장소를 만든다.
 * 예: createStudioPosePresetStorage("webtoon-pose-preset").
 */
export function createStudioPosePresetStorage(
  namespace: string,
  maxRecent: number = STUDIO_POSE_PRESET_MAX_RECENT_DEFAULT,
): StudioPosePresetStorage {
  const favoritesKey = `toonstudio.${namespace}.favorites.v1`;
  const recentKey = `toonstudio.${namespace}.recent.v1`;
  const recentLimit = Number.isFinite(maxRecent) && maxRecent > 0 ? Math.floor(maxRecent) : STUDIO_POSE_PRESET_MAX_RECENT_DEFAULT;

  return {
    readFavorites() {
      return readStringArray(favoritesKey);
    },
    toggleFavorite(presetId: string) {
      const next = readStringArray(favoritesKey);
      const index = next.indexOf(presetId);
      if (index >= 0) {
        next.splice(index, 1);
      } else {
        next.unshift(presetId);
      }
      writeStringArray(favoritesKey, next);
      return next;
    },
    writeFavorites(presetIds: readonly string[]) {
      return writeStringArray(favoritesKey, presetIds);
    },
    readRecent() {
      return readStringArray(recentKey).slice(0, recentLimit);
    },
    recordRecent(presetId: string) {
      const next = readStringArray(recentKey)
        .filter((id) => id !== presetId);
      next.unshift(presetId);
      const trimmed = next.slice(0, recentLimit);
      writeStringArray(recentKey, trimmed);
      return trimmed;
    },
    clearRecent() {
      return writeStringArray(recentKey, []);
    },
  };
}
