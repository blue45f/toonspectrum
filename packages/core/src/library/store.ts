// 내 서재 / 라이브러리 — 웹·토스가 공유하는 UI-비종속 스토어/파생 로직.
// (A) createBookmarkStore<T>: React 없는 제네릭 즐겨찾기 엔진(useSyncExternalStore용 안정 스냅샷).
//     토스는 이걸로 찜·구독을 굴리고, 웹은 zustand persist를 유지하되 (B)를 공유한다.
// (B) deriveSavedTitleIds: '내 찜·서재' 집합(읽음≠하차 + 구독 + 컬렉션 합집합)을 순수 함수로 산출.
//     웹 useSavedTitleIds·토스 양쪽이 동일 규칙을 쓴다.

import type { ReadState } from "../types";

/* ── (A) 제네릭 즐겨찾기 스토어 ──────────────────────────────────────────── */

export interface BookmarkStore<T> {
  /** 현재 항목 배열(안정 스냅샷 — useSyncExternalStore getSnapshot 으로 사용). */
  getSnapshot(): T[];
  /** 식별키가 저장돼 있는가. */
  has(key: string): boolean;
  /** 항목 토글 — 추가되면 true, 제거되면 false. */
  toggle(item: T): boolean;
  /** 식별키로 제거. */
  remove(key: string): void;
  /** 전체 비우기. */
  clear(): void;
  /** 변경 구독(해제 함수 반환). */
  subscribe(listener: () => void): () => void;
}

/**
 * 원격(DB) 동기 어댑터 — env 설정 시 주입. 오프라인-퍼스트: 로컬 캐시가 즉시 동작하고,
 * load 로 서버 상태를 받아 동기화, 쓰기마다 save 로 서버에 반영(실패는 조용히 무시).
 */
export interface RemoteBookmarkAdapter<T> {
  /** 서버 목록 로드(실패/없음이면 null → 로컬 유지). */
  load(): Promise<T[] | null>;
  /** 서버에 전체 목록 저장(fire-and-forget). */
  save(items: T[]): void;
}

/**
 * 즐겨찾기 스토어 제네릭 팩토리 — 웹·토스가 같은 메커니즘을 공유한다(중복 제거).
 * 의존성 0(React 없음). 각 앱은 자기 Bookmark 타입·storageKey·식별키 함수를 주입하고,
 * 얇은 React 훅(useSyncExternalStore)으로 감싸 쓴다. getSnapshot 은 쓰기 전까지 동일
 * 참조를 돌려줘 useSyncExternalStore 무한 루프를 막는다(쓰기/크로스탭 변경 시에만 무효화).
 *
 * @param storageKey  localStorage 키(앱별 고유)
 * @param getKey      항목 → 식별키(웹은 b.id, 토스는 `${b.type}:${b.id}` 등)
 * @param isValid     로드 시 항목 유효성 가드(손상 데이터 필터)
 * @param remote      선택 — 원격(DB) 어댑터. 주면 로컬 캐시 + 서버 동기화(오프라인-퍼스트).
 */
export function createBookmarkStore<T>(
  storageKey: string,
  getKey: (item: T) => string,
  isValid: (value: unknown) => value is T = (v): v is T =>
    typeof v === "object" && v !== null,
  remote?: RemoteBookmarkAdapter<T>,
): BookmarkStore<T> {
  const listeners = new Set<() => void>();
  // 직렬화 비교 캐시 — 매 read 마다 localStorage 를 보되, raw 문자열이 같으면 동일 배열
  // 참조를 돌려준다(useSyncExternalStore 무한 루프 방지 + 외부/직접 변경도 즉시 반영).
  let cachedRaw: string | null = null;
  let cachedValue: T[] = [];

  function read(): T[] {
    if (typeof window === "undefined") return cachedValue;
    let raw: string;
    try {
      raw = window.localStorage.getItem(storageKey) ?? "[]";
    } catch {
      raw = "[]";
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      try {
        const parsed: unknown = JSON.parse(raw);
        cachedValue = Array.isArray(parsed) ? parsed.filter(isValid) : [];
      } catch {
        cachedValue = [];
      }
    }
    return cachedValue;
  }

  // 로컬만 반영(서버 동기 없음) — init 로드·내부 동기화용.
  function writeLocal(items: T[]): void {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(items));
      } catch {
        /* 저장 실패(프라이빗 모드 등)는 무시 — 다음 read 가 기존 값을 돌려준다 */
      }
    }
    for (const listener of listeners) listener();
  }

  // 사용자 변경 — 로컬 + 서버(원격 어댑터 있을 때) 양쪽 반영.
  function write(items: T[]): void {
    writeLocal(items);
    remote?.save(items);
  }

  if (typeof window !== "undefined") {
    // 다른 탭 변경 — read 가 raw 비교로 감지하므로 알림만 보낸다.
    window.addEventListener("storage", (event) => {
      if (event.key === storageKey) for (const listener of listeners) listener();
    });
  }

  // 원격(DB) 초기 동기화 — 서버 목록과 로컬을 키 기준으로 병합(둘 다 보존하고 수렴).
  if (remote) {
    void remote.load().then((serverItems) => {
      if (!serverItems) return; // 로드 실패 → 로컬 유지(오프라인-퍼스트)
      const local = read();
      const seen = new Set(serverItems.map(getKey));
      const merged = [...serverItems, ...local.filter((item) => !seen.has(getKey(item)))];
      writeLocal(merged);
      // 로컬에만 있던 항목이 있으면 서버에도 올려 양쪽을 맞춘다.
      if (merged.length !== serverItems.length) remote.save(merged);
    });
  }

  return {
    getSnapshot: read,
    has: (key) => read().some((item) => getKey(item) === key),
    toggle: (item) => {
      const key = getKey(item);
      const items = read();
      const idx = items.findIndex((existing) => getKey(existing) === key);
      if (idx >= 0) {
        write(items.filter((_, i) => i !== idx));
        return false;
      }
      write([item, ...items]);
      return true;
    },
    remove: (key) => write(read().filter((item) => getKey(item) !== key)),
    clear: () => write([]),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/* ── (B) '내 찜·서재' 집합 파생 ─────────────────────────────────────────── */

/** deriveSavedTitleIds 가 읽는 컬렉션의 최소 구조(웹 Collection·토스 모두 할당 가능). */
export interface CollectionLike {
  titleIds: string[];
}

/**
 * '내 찜·서재' = 사용자가 저장/구독/컬렉션에 담은 모든 작품 id 집합(하차 제외).
 * 페이지 필터의 "내 찜만 보기"에 사용. 순수 함수 — React/스토어 의존 0.
 *  - reads: 읽음 상태가 있고 'dropped'(하차)가 아니면 포함
 *  - subscriptions: 연재 알림 on 이면 포함
 *  - collections: 모든 컬렉션의 titleIds 합집합
 */
export function deriveSavedTitleIds(
  reads: Record<string, ReadState | undefined>,
  subscriptions: Record<string, boolean>,
  collections: CollectionLike[],
): Set<string> {
  const set = new Set<string>();
  for (const [id, state] of Object.entries(reads)) if (state && state !== "dropped") set.add(id);
  for (const [id, on] of Object.entries(subscriptions)) if (on) set.add(id);
  for (const col of collections) for (const id of col.titleIds) set.add(id);
  return set;
}
