import {
  SqliteUnavailableError,
  openStudioLocalDatabase,
  type StudioLocalDatabase,
} from "./studio-local-database";
import {
  STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
  STUDIO_TOURNAMENT_WINNER_STORAGE_KEY,
  createLocalStorageTournamentPersistence,
  installDefaultTournamentPersistence,
  parsePersistedTournamentState,
  type PersistedTournamentStateV1,
  type StudioTournamentRenderSampleEvent,
  type TournamentPersistencePort,
} from "./studio-renderer-tournament-runtime";

/**
 * SQLite(OPFS) 어댑터를 토너먼트 영속 포트에 접합하는 글루.
 * 우선순위: SQLite(OPFS) → localStorage 폴백 → 무영속(null).
 * SQLite 개방은 첫 load/save 시점에 lazy 하게 1회 시도하며, 실패 시 그 포트
 * 인스턴스는 localStorage 어댑터로 영구 강등된다(요청마다 재시도로 인한
 * 반복 실패 비용 방지 — 다음 세션에서 다시 시도된다).
 *
 * V12 E25: 영속 매체가 kv JSON blob 에서 tournament_winners 구조화 테이블로
 * 승격됐다. load 는 raw 후보 행을 기존 검증기(parsePersistedTournamentState)에
 * 통과시켜 부분 필드가 오염된 행만 드롭하고, save 는 단일 트랜잭션 전체
 * 교체(upsert + 고아 삭제)라 실패 시 이전 상태가 그대로 남는다. 구버전
 * 세션이 남긴 kv blob 은 구조화 행이 하나도 없을 때만 1회성으로 읽히고,
 * 다음 save 가 구조화 테이블로 승격하면서 blob 을 지운다(스키마 버전 의미와
 * 파싱/검증 규약은 kv 시절과 동일).
 */

const TOURNAMENT_KV_NAMESPACE = "tournament";

export interface SqliteTournamentPersistenceOptions {
  /** 테스트 시임 — 기본은 openStudioLocalDatabase (OPFS). */
  openDatabase?: () => Promise<StudioLocalDatabase>;
  /** SQLite 불가 시 폴백 포트. 기본은 localStorage 어댑터, null이면 무영속. */
  fallback?: TournamentPersistencePort | null;
}

async function loadLegacyKvState(
  database: StudioLocalDatabase,
): Promise<PersistedTournamentStateV1 | null> {
  const payload = await database.kvGet(
    TOURNAMENT_KV_NAMESPACE,
    STUDIO_TOURNAMENT_WINNER_STORAGE_KEY,
  );
  if (payload === null) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(payload);
  } catch {
    return null;
  }
  return parsePersistedTournamentState(decoded);
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
  let database: Promise<StudioLocalDatabase | null> | null = null;

  function resolveDatabase(): Promise<StudioLocalDatabase | null> {
    database ??= openDatabase().then(
      (opened) => opened,
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
    return database;
  }

  return {
    async load(): Promise<PersistedTournamentStateV1 | null> {
      const db = await resolveDatabase();
      if (!db) return fallback ? fallback.load() : null;
      const candidates = await db.listTournamentWinnerCandidates();
      if (candidates.length === 0) {
        // 구조화 행이 전혀 없을 때만 구버전 kv blob 을 읽는다 — 마이그레이션
        // 경로. save 가 구조화 테이블을 채우고 blob 을 지우면 다시는 안 탄다.
        return loadLegacyKvState(db);
      }
      return parsePersistedTournamentState({
        version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
        entries: candidates,
      });
    },
    async save(state: PersistedTournamentStateV1): Promise<void> {
      const db = await resolveDatabase();
      if (!db) {
        if (fallback) await fallback.save(state);
        return;
      }
      await db.replaceTournamentWinners(state.entries);
      // 구조화 저장이 성공한 뒤에만 구버전 blob 을 지운다. 교체와 삭제 사이
      // 크래시가 나면 다음 load 는 여전히 구조화 행(권위 소스)을 보고, 다음
      // save 가 blob 삭제를 재시도한다.
      await db.kvDelete(TOURNAMENT_KV_NAMESPACE, STUDIO_TOURNAMENT_WINNER_STORAGE_KEY);
    },
  };
}

/**
 * recordRenderSample 이 수용한 실측 샘플을 영속 cost_samples 테이블로 흘리는
 * 싱크. StudioTournamentRuntimeOptions.onRenderSample 에 그대로 꽂힌다.
 * 쓰기 실패는 핫패스로 전파되지 않으며, 반복 스팸을 피해 첫 실패만 경고한다.
 * (recordRenderSample 은 warm 실측만 수용하므로 kind 는 항상 "warm".)
 */
export function createCostSampleSink(
  database: StudioLocalDatabase,
): (sample: StudioTournamentRenderSampleEvent) => Promise<void> {
  let warned = false;
  return async (sample) => {
    try {
      await database.recordCostSample(sample.providerId, sample.bucket, "warm", sample.ms);
    } catch (error) {
      if (!warned) {
        warned = true;
        console.warn("studio tournament cost sample sink degraded", error);
      }
    }
  };
}

let installed = false;

/** 제품 기본 영속화를 SQLite 우선 체인으로 설치한다(1회, idempotent). */
export function installStudioTournamentSqlitePersistence(): void {
  if (installed) return;
  installed = true;
  installDefaultTournamentPersistence(() => createSqliteTournamentPersistence());
}
