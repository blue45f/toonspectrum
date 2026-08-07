import {
  SqliteUnavailableError,
  openStudioLocalDatabase,
  type StudioAsyncKeyValueStore,
  type StudioLocalDatabase,
} from "./studio-local-database";
import {
  STUDIO_TOURNAMENT_WINNER_STORAGE_KEY,
  createLocalStorageTournamentPersistence,
  installDefaultTournamentPersistence,
  parsePersistedTournamentState,
  type PersistedTournamentStateV1,
  type TournamentPersistencePort,
} from "./studio-renderer-tournament-runtime";

/**
 * SQLite(OPFS) 어댑터를 토너먼트 영속 포트에 접합하는 글루.
 * 우선순위: SQLite(OPFS) → localStorage 폴백 → 무영속(null).
 * SQLite 개방은 첫 load/save 시점에 lazy 하게 1회 시도하며, 실패 시 그 포트
 * 인스턴스는 localStorage 어댑터로 영구 강등된다(요청마다 재시도로 인한
 * 반복 실패 비용 방지 — 다음 세션에서 다시 시도된다).
 */

const TOURNAMENT_KV_NAMESPACE = "tournament";

export interface SqliteTournamentPersistenceOptions {
  /** 테스트 시임 — 기본은 openStudioLocalDatabase (OPFS). */
  openDatabase?: () => Promise<StudioLocalDatabase>;
  /** SQLite 불가 시 폴백 포트. 기본은 localStorage 어댑터, null이면 무영속. */
  fallback?: TournamentPersistencePort | null;
}

export function createSqliteTournamentPersistence(
  options: SqliteTournamentPersistenceOptions = {},
): TournamentPersistencePort {
  const openDatabase =
    options.openDatabase ?? (() => openStudioLocalDatabase({ vfs: "opfs" }));
  const fallback =
    options.fallback !== undefined
      ? options.fallback
      : createLocalStorageTournamentPersistence();
  let store: Promise<StudioAsyncKeyValueStore | null> | null = null;

  function resolveStore(): Promise<StudioAsyncKeyValueStore | null> {
    store ??= openDatabase().then(
      (database) => database.asAsyncKeyValueStore(TOURNAMENT_KV_NAMESPACE),
      (error: unknown) => {
        if (!(error instanceof SqliteUnavailableError)) {
          // 개방 실패 원인이 무엇이든 영속화는 폴백으로 계속한다. 원인은
          // 삼키지 않고 조용히 강등된 사실을 콘솔로 남긴다(런타임 계약상
          // 영속 실패는 비치명).
          console.warn("studio tournament sqlite persistence degraded", error);
        }
        return null;
      },
    );
    return store;
  }

  return {
    async load(): Promise<PersistedTournamentStateV1 | null> {
      const kv = await resolveStore();
      if (!kv) return fallback ? fallback.load() : null;
      const payload = await kv.get(STUDIO_TOURNAMENT_WINNER_STORAGE_KEY);
      if (payload === null) return null;
      let decoded: unknown;
      try {
        decoded = JSON.parse(payload);
      } catch {
        return null;
      }
      return parsePersistedTournamentState(decoded);
    },
    async save(state: PersistedTournamentStateV1): Promise<void> {
      const kv = await resolveStore();
      if (!kv) {
        if (fallback) await fallback.save(state);
        return;
      }
      await kv.set(STUDIO_TOURNAMENT_WINNER_STORAGE_KEY, JSON.stringify(state));
    },
  };
}

let installed = false;

/** 제품 기본 영속화를 SQLite 우선 체인으로 설치한다(1회, idempotent). */
export function installStudioTournamentSqlitePersistence(): void {
  if (installed) return;
  installed = true;
  installDefaultTournamentPersistence(() => createSqliteTournamentPersistence());
}
