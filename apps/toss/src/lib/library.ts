// 내 서재 / 라이브러리 — 찜·평점·구독·컬렉션의 토스 영속 레이어.
// 알고리즘/엔진은 전부 @toonspectrum/core 에서 가져온다(웹·토스 단일 소스, 로직 중복 금지):
//   createBookmarkStore<T> ... React 없는 제네릭 즐겨찾기 엔진(useSyncExternalStore 안정 스냅샷)
//   deriveSavedTitleIds .... '내 찜·서재' 집합(읽음≠하차 + 구독 + 컬렉션) 파생 — 웹 useSavedTitleIds 와 동일 규칙
// 웹 lib/store.ts(zustand+persist)의 ratings/reads/subscriptions/collections 모델을 그대로 미러링하되,
// 토스는 서버(/api/me/* + x-user-id)가 mTLS 미가동이라 write-through 를 빼고 '이 기기에만 저장'(localStorage)만 한다.
// remote 어댑터는 createBookmarkStore 가 받게 돼 있어 mTLS 라이브 후 주입만 하면 기기 간 동기화로 승격된다.
// 이 파일은 순수 상태/영속·React 훅 래퍼만 담당하고, 표시는 LibraryPage.tsx 가 한다.

import { createBookmarkStore, deriveSavedTitleIds, type ReadState } from '@toonspectrum/core';
import { useSyncExternalStore } from 'react';

/** 서재에 담긴 작품 1건(식별키 = id). 표지 원본 대신 그라디언트만 보관(저작권·표지 정책). */
export interface SavedTitle {
  id: string;
  title: string;
  author?: string;
  /** OKLCH/HEX 그라디언트 2색 — 카드 배경 폴백(표지 미노출 시). */
  cover?: [string, string];
  coverImage?: string;
  savedAt: number;
}

/** 별점 스케일 — 웹 lib/store.ts 의 RatingScale 과 동일. 토스 UI 는 표시 변환만 다르게 한다. */
export type RatingScale = 'star' | 'ten' | 'hundred';

/** 사용자 컬렉션(테마 묶음) — 웹 Collection 과 동일 shape(deriveSavedTitleIds 가 titleIds 만 읽음). */
export interface Collection {
  id: string;
  name: string;
  emoji: string;
  titleIds: string[];
  createdAt: number;
}

/* ── (A) 찜(서재) — core 즐겨찾기 스토어 위에 토스 타입만 주입 ───────────────── */

const savedStore = createBookmarkStore<SavedTitle>(
  'toonspectrum.library.v1',
  (b) => b.id,
  // 손상 데이터 가드 — id/title 이 있는 객체만 유효.
  (v): v is SavedTitle =>
    typeof v === 'object' && v !== null && typeof (v as SavedTitle).id === 'string',
  // remote: mTLS 라이브 후 createFavoritesRemote 류 어댑터 주입(현재는 로컬 전용). undefined.
);

export function getSaved(): SavedTitle[] {
  // 최근 담은 순(savedAt desc) — 토글 시 [item, ...] 로 앞에 붙지만 명시적으로 안정 정렬한다.
  return [...savedStore.getSnapshot()].sort((a, b) => b.savedAt - a.savedAt);
}
export function isSaved(id: string): boolean {
  return savedStore.has(id);
}
/** 토글 — 추가되면 true, 제거되면 false. savedAt 은 호출 시점으로 채운다. */
export function toggleSaved(item: Omit<SavedTitle, 'savedAt'>): boolean {
  return savedStore.toggle({ ...item, savedAt: Date.now() });
}
export function removeSaved(id: string): void {
  savedStore.remove(id);
}
export function clearSaved(): void {
  savedStore.clear();
}
export function useSaved(): SavedTitle[] {
  return useSyncExternalStore(savedStore.subscribe, getSaved, getSaved);
}
export function useIsSaved(id: string): boolean {
  return useSyncExternalStore(
    savedStore.subscribe,
    () => savedStore.has(id),
    () => false,
  );
}

/* ── (B) 키-값 localStorage 레코드(평점·읽음·구독) — 작은 공용 헬퍼 ─────────── */
// ratings/reads/subscriptions 는 모두 Record<id, value> 모양이라 같은 read/write/구독 메커니즘을 공유한다.

interface RecordStore<V> {
  get(): Record<string, V>;
  getOne(id: string): V | undefined;
  set(id: string, value: V | undefined): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

function createRecordStore<V>(storageKey: string): RecordStore<V> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null = null;
  let cachedValue: Record<string, V> = {};

  function read(): Record<string, V> {
    if (typeof window === 'undefined') return cachedValue;
    let raw: string;
    try {
      raw = window.localStorage.getItem(storageKey) ?? '{}';
    } catch {
      raw = '{}';
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        const parsed: unknown = JSON.parse(raw);
        cachedValue = parsed && typeof parsed === 'object' ? (parsed as Record<string, V>) : {};
      } catch {
        cachedValue = {};
      }
    }
    return cachedValue;
  }

  function write(next: Record<string, V>): void {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* 프라이빗 모드 등 — 무시 */
      }
    }
    cachedRaw = null; // 다음 read 가 재파싱하도록 무효화
    for (const l of listeners) l();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === storageKey) for (const l of listeners) l();
    });
  }

  return {
    get: read,
    getOne: (id) => read()[id],
    set: (id, value) => {
      const next = { ...read() };
      if (value === undefined) delete next[id];
      else next[id] = value;
      write(next);
    },
    clear: () => write({}),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/* ── 평점(0.5~5, .5 단위) — 웹 ratings 모델과 동일 ─────────────────────────── */

const ratingStore = createRecordStore<number>('toonspectrum.library.ratings.v1');

export function getRatings(): Record<string, number> {
  return ratingStore.get();
}
export function getRating(id: string): number {
  return ratingStore.getOne(id) ?? 0;
}
/** 별점 설정(0 이하면 제거). 0.5~5 로 클램프. */
export function setRating(id: string, value: number): void {
  if (value <= 0) ratingStore.set(id, undefined);
  else ratingStore.set(id, Math.min(5, Math.max(0.5, Math.round(value * 2) / 2)));
}
export function useRatings(): Record<string, number> {
  return useSyncExternalStore(ratingStore.subscribe, ratingStore.get, ratingStore.get);
}
export function useRating(id: string): number {
  return useSyncExternalStore(
    ratingStore.subscribe,
    () => getRating(id),
    () => 0,
  );
}

/* ── 읽음 상태(want/reading/done/dropped) — 웹 reads 모델과 동일 ───────────── */

const readStore = createRecordStore<ReadState>('toonspectrum.library.reads.v1');

export function getReads(): Record<string, ReadState> {
  return readStore.get();
}
export function getRead(id: string): ReadState | undefined {
  return readStore.getOne(id);
}
/** 읽음 상태 설정(null 이면 제거 — 같은 상태 재선택 시 토글 해제용). */
export function setRead(id: string, state: ReadState | null): void {
  readStore.set(id, state ?? undefined);
}
export function useReads(): Record<string, ReadState> {
  return useSyncExternalStore(readStore.subscribe, readStore.get, readStore.get);
}

/* ── 연재 구독(알림) — 웹 subscriptions 모델과 동일 ───────────────────────── */

const subStore = createRecordStore<boolean>('toonspectrum.library.subs.v1');

export function getSubscriptions(): Record<string, boolean> {
  return subStore.get();
}
export function isSubscribed(id: string): boolean {
  return subStore.getOne(id) === true;
}
export function toggleSubscription(id: string): void {
  subStore.set(id, subStore.getOne(id) === true ? undefined : true);
}
export function useSubscriptions(): Record<string, boolean> {
  return useSyncExternalStore(subStore.subscribe, subStore.get, subStore.get);
}

/* ── 컬렉션 CRUD — 웹 collections 모델과 동일(순수 로컬) ───────────────────── */

const collectionStore = createRecordStore<Collection>('toonspectrum.library.collections.v1');

/** 컬렉션 목록(생성 순). RecordStore 에 id→Collection 으로 보관한다. */
export function getCollections(): Collection[] {
  return Object.values(collectionStore.get()).sort((a, b) => a.createdAt - b.createdAt);
}
export function useCollections(): Collection[] {
  return useSyncExternalStore(collectionStore.subscribe, getCollections, getCollections);
}
function makeId(): string {
  return `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
export function createCollection(name: string, emoji: string): string {
  const clean = name.trim();
  if (!clean) return '';
  const id = makeId();
  collectionStore.set(id, { id, name: clean, emoji, titleIds: [], createdAt: Date.now() });
  return id;
}
export function renameCollection(id: string, name: string): void {
  const clean = name.trim();
  const c = collectionStore.getOne(id);
  if (!c || !clean) return;
  collectionStore.set(id, { ...c, name: clean });
}
export function deleteCollection(id: string): void {
  collectionStore.set(id, undefined);
}
export function toggleInCollection(collectionId: string, titleId: string): void {
  const c = collectionStore.getOne(collectionId);
  if (!c) return;
  const has = c.titleIds.includes(titleId);
  collectionStore.set(collectionId, {
    ...c,
    titleIds: has ? c.titleIds.filter((t) => t !== titleId) : [...c.titleIds, titleId],
  });
}

/* ── 파생 / 초기화 ────────────────────────────────────────────────────────── */

/**
 * '내 찜·서재' 집합(읽음≠하차 + 구독 + 컬렉션 합집합) — 웹 useSavedTitleIds 와 동일 규칙.
 * 합집합 규칙은 core 의 순수 deriveSavedTitleIds 가 단일 소스(웹·토스 공유).
 */
export function useSavedTitleIds(): Set<string> {
  const reads = useReads();
  const subscriptions = useSubscriptions();
  const collections = useCollections();
  return deriveSavedTitleIds(reads, subscriptions, collections);
}

/** 서재 전체 초기화(찜·평점·읽음·구독·컬렉션). */
export function resetLibrary(): void {
  clearSaved();
  ratingStore.clear();
  readStore.clear();
  subStore.clear();
  collectionStore.clear();
}
