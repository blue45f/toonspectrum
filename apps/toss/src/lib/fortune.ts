// 운세 — 토스 영속 레이어(생년월일·성별·방문 스트릭).
// 명리/타로/별자리/오늘의 운세 엔진은 @toonspectrum/core/fortune(순수, async)을 그대로 공유한다.
// 이 파일은 사용자 프로필과 스트릭만 작은 localStorage 헬퍼로 영속(SSR 안전·오프라인-퍼스트).

import { useSyncExternalStore } from 'react';

export type FortuneGender = 'none' | 'male' | 'female';

export interface FortuneProfile {
  /** "YYYY-MM-DD" — 빈 문자열이면 익명(생년월일 없는 일반 운세). */
  birthDate: string;
  /** "HH:MM" 또는 빈 문자열(모름). */
  birthTime: string;
  gender: FortuneGender;
  /** 궁합 상대 생년월일 "YYYY-MM-DD"(빈 문자열=미입력). */
  partnerBirthDate: string;
  /** 궁합 상대 출생시 "HH:MM"(빈 문자열=모름). */
  partnerBirthTime: string;
  /** 마지막으로 고른 화자 캐릭터 id(없으면 빈 문자열 → 기본 'ara'). */
  characterId: string;
}

export interface FortuneStreak {
  /** 마지막 방문일 "YYYY-MM-DD". */
  lastVisit: string;
  /** 연속 방문일 수. */
  count: number;
  /** 누적 방문 횟수. */
  total: number;
}

/** 보관함 한 건 — 탭/요약/점수와 입력 컨텍스트만 저장(결과는 코어로 결정적 재계산). */
export interface FortuneHistoryEntry {
  /** 고유 id(타임스탬프 기반). */
  id: string;
  /** 운세 종류 키. */
  tab: string;
  /** 화자 캐릭터 id. */
  characterId: string;
  /** 보관함 카드에 보일 한 줄 요약. */
  summary: string;
  /** 기록 시각 "YYYY-MM-DD". */
  dateLabel: string;
}

const PROFILE_KEY = 'toonspectrum.fortune.profile.v1';
const STREAK_KEY = 'toonspectrum.fortune.streak.v1';
const HISTORY_KEY = 'toonspectrum.fortune.history.v1';
const HISTORY_MAX = 12;

const EMPTY_PROFILE: FortuneProfile = {
  birthDate: '',
  birthTime: '',
  gender: 'none',
  partnerBirthDate: '',
  partnerBirthTime: '',
  characterId: '',
};
const EMPTY_STREAK: FortuneStreak = { lastVisit: '', count: 0, total: 0 };
const EMPTY_HISTORY: FortuneHistoryEntry[] = [];

const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}

// 스냅샷 안정 캐시 — useSyncExternalStore 는 getSnapshot 결과를 참조 비교한다. 매 호출
// localStorage 를 재파싱해 새 객체/배열을 돌려주면 무한 루프(React #185)가 난다. 그래서 raw
// 문자열이 같으면 직전에 파싱한 동일 참조를 돌려준다(쓰기/크로스탭 변경 시에만 무효화).
const snapshotCache = new Map<string, { raw: string | null; value: unknown }>();

function readCached<T>(key: string, fallback: T, parse: (parsed: unknown) => T): T {
  if (typeof window === 'undefined') return fallback;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const cached = snapshotCache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;
  let value: T;
  if (raw == null) {
    value = fallback;
  } else {
    try {
      value = parse(JSON.parse(raw));
    } catch {
      value = fallback;
    }
  }
  snapshotCache.set(key, { raw, value });
  return value;
}

function readJson<T>(key: string, fallback: T): T {
  return readCached(key, fallback, (parsed) =>
    parsed && typeof parsed === 'object' ? { ...fallback, ...(parsed as object) } : fallback,
  );
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 비공개 모드 등 — 무시 */
  }
  // 다음 read 가 재파싱하도록 캐시 무효화(쓴 값과 직렬화 차이가 있을 수 있어 raw 를 비운다).
  snapshotCache.delete(key);
  notify();
}

/* ── 프로필 ──────────────────────────────────────────────────────────────── */

export function getProfile(): FortuneProfile {
  return readJson(PROFILE_KEY, EMPTY_PROFILE);
}
export function setProfile(patch: Partial<FortuneProfile>): void {
  writeJson(PROFILE_KEY, { ...getProfile(), ...patch });
}
export function useProfile(): FortuneProfile {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getProfile,
    () => EMPTY_PROFILE,
  );
}

/* ── 스트릭 ──────────────────────────────────────────────────────────────── */

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function getStreak(): FortuneStreak {
  return readJson(STREAK_KEY, EMPTY_STREAK);
}

/** 오늘 방문을 기록하고 갱신된 스트릭을 반환(같은 날 재호출은 멱등). */
export function recordVisit(): FortuneStreak {
  const prev = getStreak();
  const today = todayStr();
  if (prev.lastVisit === today) return prev;
  const gap = prev.lastVisit ? dayDiff(prev.lastVisit, today) : 0;
  const next: FortuneStreak = {
    lastVisit: today,
    count: gap === 1 ? prev.count + 1 : 1,
    total: prev.total + 1,
  };
  writeJson(STREAK_KEY, next);
  return next;
}

export function useStreak(): FortuneStreak {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getStreak,
    () => EMPTY_STREAK,
  );
}

/* ── 보관함(최근 본 운세) ─────────────────────────────────────────────────── */

function readArray<T>(key: string): T[] {
  return readCached<T[]>(key, EMPTY_HISTORY as unknown as T[], (parsed) =>
    Array.isArray(parsed) ? (parsed as T[]) : (EMPTY_HISTORY as unknown as T[]),
  );
}

export function getHistory(): FortuneHistoryEntry[] {
  return readArray<FortuneHistoryEntry>(HISTORY_KEY);
}

/** 보관함에 한 건 추가(최신순, 같은 탭·캐릭터의 같은 날 기록은 갱신, 최대 HISTORY_MAX). */
export function addHistory(entry: Omit<FortuneHistoryEntry, 'id' | 'dateLabel'>): void {
  const dateLabel = todayStr();
  const next: FortuneHistoryEntry = { ...entry, id: `${Date.now()}`, dateLabel };
  const deduped = getHistory().filter(
    (h) => !(h.tab === entry.tab && h.characterId === entry.characterId && h.dateLabel === dateLabel),
  );
  writeJson(HISTORY_KEY, [next, ...deduped].slice(0, HISTORY_MAX));
}

export function removeHistory(id: string): void {
  writeJson(HISTORY_KEY, getHistory().filter((h) => h.id !== id));
}

export function clearHistory(): void {
  writeJson(HISTORY_KEY, EMPTY_HISTORY);
}

export function useHistory(): FortuneHistoryEntry[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getHistory,
    () => EMPTY_HISTORY,
  );
}
