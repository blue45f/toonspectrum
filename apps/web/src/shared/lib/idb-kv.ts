/**
 * 공용 IndexedDB 키-값 저장소.
 *
 * localStorage에 쌓이던 큰·증가형 페이로드(원장·채팅·발행 이력 등 zustand
 * persist 스냅샷)를 IndexedDB로 옮기기 위한 가장 작은 래퍼다. 도메인마다
 * 제각각 open 로직을 복제하던 기존 IDB 소비처(bg3d 라이브러리, CRDT
 * 아웃박스 등)와 달리, "문자열 값 하나를 키로 읽고 쓰는" 용도에만 쓴다.
 *
 * 설계 원칙:
 * - 모든 연산은 실패해도 throw 하지 않는다. IndexedDB를 못 쓰는 환경
 *   (SSR, 테스트 jsdom, 프라이버시 모드, 쿼터 차단)에서는 null/false를
 *   돌려주고, 호출자가 localStorage 폴백 여부를 결정한다.
 * - 값은 문자열만 다룬다. 직렬화 포맷(JSON 등)은 호출자 책임이다.
 * - DB 연결은 모듈 단위로 캐시하되, 전역 indexedDB 객체가 교체되면
 *   (테스트의 fake-indexeddb 팩토리 교체 등) 다시 연다.
 */

export const IDB_KV_DATABASE_NAME = "toonstudio-kv";
export const IDB_KV_STORE_NAME = "kv";
const IDB_KV_DATABASE_VERSION = 1;

interface CachedConnection {
  readonly factory: IDBFactory;
  readonly promise: Promise<IDBDatabase | null>;
}

let cached: CachedConnection | null = null;

function currentFactory(): IDBFactory | null {
  try {
    return typeof indexedDB !== "undefined" ? indexedDB : null;
  } catch {
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  const factory = currentFactory();
  if (!factory) return Promise.resolve(null);
  if (cached && cached.factory === factory) return cached.promise;
  const promise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(IDB_KV_DATABASE_NAME, IDB_KV_DATABASE_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(IDB_KV_STORE_NAME)) {
        database.createObjectStore(IDB_KV_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  cached = { factory, promise };
  // 열기에 실패했으면 캐시를 비워 다음 호출이 재시도할 수 있게 한다.
  void promise.then((database) => {
    if (!database && cached?.promise === promise) cached = null;
  });
  return promise;
}

function runRequest<T>(
  mode: IDBTransactionMode,
  create: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDatabase().then(
    (database) =>
      new Promise<T | null>((resolve) => {
        if (!database) {
          resolve(null);
          return;
        }
        try {
          const transaction = database.transaction(IDB_KV_STORE_NAME, mode);
          const request = create(transaction.objectStore(IDB_KV_STORE_NAME));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          transaction.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/** 키의 문자열 값을 읽는다. 없거나 읽을 수 없으면 null. */
export function idbKvGet(key: string): Promise<string | null> {
  return runRequest("readonly", (store) => store.get(key)).then((value) =>
    typeof value === "string" ? value : null,
  );
}

/** 키에 문자열 값을 쓴다. 성공하면 true. */
export function idbKvSet(key: string, value: string): Promise<boolean> {
  return runRequest("readwrite", (store) => store.put(value, key)).then(
    (result) => result !== null,
  );
}

/** 키를 지운다. IDB를 못 쓰는 환경에서는 조용히 끝난다. */
export function idbKvRemove(key: string): Promise<void> {
  return runRequest("readwrite", (store) => store.delete(key)).then(() => undefined);
}

function defaultLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * 구 localStorage 값을 IndexedDB로 1회 이관한다.
 *
 * 데이터 유실 방지 순서: ① 구 값을 읽고 ② IDB에 쓴 뒤 ③ 다시 읽어
 * 일치하는지 검증하고 ④ 그때만 구 키를 제거한다. IDB를 못 쓰거나 검증이
 * 실패하면 구 키는 절대 건드리지 않는다. IDB에 이미 값이 있으면 그쪽이
 * 최신이므로 구 키(낡은 사본)만 제거한다.
 *
 * @returns 실제로 값을 복사했으면 true.
 */
export async function migrateLocalStorageValueToIdb(
  key: string,
  storage: Storage | null = defaultLocalStorage(),
): Promise<boolean> {
  if (!storage) return false;
  let legacy: string | null;
  try {
    legacy = storage.getItem(key);
  } catch {
    return false;
  }
  if (legacy === null) return false;
  const existing = await idbKvGet(key);
  if (existing !== null) {
    try {
      storage.removeItem(key);
    } catch {
      /* 제거 실패는 치명적이지 않다 — IDB 값이 우선한다. */
    }
    return false;
  }
  const written = await idbKvSet(key, legacy);
  if (!written) return false;
  const verified = await idbKvGet(key);
  if (verified !== legacy) return false;
  try {
    storage.removeItem(key);
  } catch {
    /* 검증까지 끝난 뒤의 제거 실패는 무시한다. */
  }
  return true;
}
