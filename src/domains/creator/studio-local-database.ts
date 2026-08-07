/**
 * V12 E25 — Studio 로컬 SQL 데이터베이스(OPFS + SQLite WASM).
 *
 * localStorage 키-밸류 산탄 대신 단일 SQLite 파일("studio-local.db")을
 * opfs-sahpool VFS 위에 둔다. React 의존이 없는 순수 모듈이며,
 * `@sqlite.org/sqlite-wasm` 은 반드시 dynamic import 로만 로드한다
 * (check:studio-bundle 이 정적 eager 포함을 잡는다).
 *
 * OPFS 를 못 쓰는 환경에서는 조용히 인메모리로 다운그레이드하지 않고
 * {@link SqliteUnavailableError} 를 던진다 — 폴백 여부는 호출자가 결정한다.
 * `vfs: "memory"` 는 테스트/노드에서 스키마·쿼리 로직 검증용으로만 쓴다.
 *
 * OPFS 디렉터리 {@link STUDIO_SQLITE_OPFS_DIRECTORY} 는
 * studio-data-destruction.ts 의 파괴 인벤토리에 등록된다(드리프트 계약은
 * studio-data-destruction.test.ts).
 */

/** opfs-sahpool VFS 메타데이터+DB 파일이 사는 OPFS 루트 디렉터리. */
export const STUDIO_SQLITE_OPFS_DIRECTORY = "toonspectrum-studio-sqlite";

/** SAH pool 네임스페이스 안의 DB 파일명(절대 경로 "/studio-local.db"로 개방). */
export const STUDIO_SQLITE_DATABASE_FILENAME = "studio-local.db";

export type StudioSqliteBindValue = string | number | null;

/**
 * sqlite-wasm oo1 API 중 이 모듈이 실제로 쓰는 표면만 구조적으로 고정한 핸들.
 * 실 모듈(Sqlite3Static)이 그대로 만족하며, 테스트는 이 표면만 스텁하면 된다.
 */
export interface StudioSqliteStatementHandle {
  bind(values: readonly StudioSqliteBindValue[]): unknown;
  step(): boolean;
  get(columnIndex: number): unknown;
  reset(): unknown;
  finalize(): unknown;
}

export interface StudioSqliteDatabaseHandle {
  exec(sql: string): unknown;
  prepare(sql: string): StudioSqliteStatementHandle;
  changes(): number;
  close(): void;
}

export interface StudioSqlitePoolUtilHandle {
  OpfsSAHPoolDb: new (filename: string) => StudioSqliteDatabaseHandle;
}

export interface StudioSqliteApiHandle {
  oo1: { DB: new (filename: string, flags?: string) => StudioSqliteDatabaseHandle };
  installOpfsSAHPoolVfs(options: {
    directory?: string;
    name?: string;
  }): Promise<StudioSqlitePoolUtilHandle>;
}

/**
 * SQLite 를 열 수 없는 환경(모듈 로드 실패·OPFS 부재·VFS 설치 실패)을 알리는
 * 명시적 실패. 인메모리 다운그레이드 같은 조용한 폴백은 하지 않는다.
 */
export class SqliteUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string, options?: { cause?: unknown }) {
    super(`studio local sqlite unavailable: ${reason}`, options);
    this.name = "SqliteUnavailableError";
    this.reason = reason;
  }
}

export interface StudioLocalDatabaseMigration {
  /** 이 마이그레이션 적용 후의 PRAGMA user_version 값(1부터 순차). */
  toVersion: number;
  statements: readonly string[];
}

/**
 * 스키마 마이그레이션 체인.
 * - v1: kv·tournament_winners·cost_samples(+조회 인덱스).
 * - v2: CommandBus 저널 영속(journal_entries)·two-slot 스냅샷(snapshots).
 *   기존 v1 DB 는 재개방 시 러너가 v2 로 자동 전진시킨다.
 */
export const STUDIO_LOCAL_DATABASE_MIGRATIONS: readonly StudioLocalDatabaseMigration[] =
  Object.freeze([
    {
      toVersion: 1,
      statements: Object.freeze([
        `CREATE TABLE IF NOT EXISTS kv (
          namespace TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (namespace, key)
        )`,
        `CREATE TABLE IF NOT EXISTS tournament_winners (
          bucket TEXT NOT NULL,
          device_hash TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          expected_warm_ms REAL NOT NULL,
          decided_at_sample INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (bucket, device_hash)
        )`,
        `CREATE TABLE IF NOT EXISTS cost_samples (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider_id TEXT NOT NULL,
          bucket TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('warm', 'cold')),
          ms REAL NOT NULL,
          recorded_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS cost_samples_provider_bucket
          ON cost_samples (provider_id, bucket)`,
      ]),
    },
    {
      toVersion: 2,
      statements: Object.freeze([
        `CREATE TABLE IF NOT EXISTS journal_entries (
          project_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          payload TEXT NOT NULL,
          crc32 INTEGER NOT NULL,
          PRIMARY KEY (project_id, seq)
        )`,
        `CREATE TABLE IF NOT EXISTS snapshots (
          project_id TEXT NOT NULL,
          slot INTEGER NOT NULL CHECK (slot IN (0, 1)),
          seq INTEGER NOT NULL,
          payload TEXT NOT NULL,
          crc32 INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (project_id, slot)
        )`,
      ]),
    },
  ]);

function readUserVersion(handle: StudioSqliteDatabaseHandle): number {
  const statement = handle.prepare("PRAGMA user_version");
  try {
    if (!statement.step()) {
      throw new Error("PRAGMA user_version returned no row");
    }
    const value = statement.get(0);
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error(`PRAGMA user_version returned a non-integer: ${String(value)}`);
    }
    return value;
  } finally {
    statement.finalize();
  }
}

/**
 * PRAGMA user_version 기반 순차 마이그레이션 러너. 각 버전은 단일 트랜잭션으로
 * 적용되고, 중간 실패 시 그 버전 전체가 롤백된 뒤 에러가 전파된다.
 * 이미 적용된 버전은 건너뛰므로 재개방 시 idempotent 하다.
 */
export function runStudioLocalDatabaseMigrations(
  handle: StudioSqliteDatabaseHandle,
  migrations: readonly StudioLocalDatabaseMigration[] = STUDIO_LOCAL_DATABASE_MIGRATIONS,
): number {
  let version = readUserVersion(handle);
  for (const migration of migrations) {
    if (migration.toVersion <= version) continue;
    if (migration.toVersion !== version + 1) {
      throw new Error(
        `studio local database migration chain is broken: at v${version}, ` +
          `next migration targets v${migration.toVersion}`,
      );
    }
    handle.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of migration.statements) {
        handle.exec(statement);
      }
      handle.exec(`PRAGMA user_version = ${migration.toVersion}`);
      handle.exec("COMMIT");
    } catch (error) {
      try {
        handle.exec("ROLLBACK");
      } catch {
        // 트랜잭션이 이미 SQLite 쪽에서 자동 롤백된 경우 — 원 에러가 우선한다.
      }
      throw error;
    }
    version = migration.toVersion;
  }
  return version;
}

export type StudioCostSampleKind = "warm" | "cold";

export interface StudioTournamentWinnerRecord {
  bucket: string;
  deviceHash: string;
  providerId: string;
  expectedWarmMs: number;
  decidedAtSample: number;
  updatedAt: number;
}

export interface StudioCostSampleRecord {
  id: number;
  providerId: string;
  bucket: string;
  kind: StudioCostSampleKind;
  ms: number;
  recordedAt: number;
}

/**
 * 구조화 로드용 raw 토너먼트 우승 후보 행 — 이 계층은 타입을 단정하지 않는다.
 * 오염 행의 드롭 정책은 호출자 검증기(parsePersistedTournamentState)가
 * 소유한다(부분 필드 오염이 전체 로드를 못 깨뜨리게).
 */
export interface StudioTournamentWinnerCandidate {
  bucket: unknown;
  deviceHash: unknown;
  providerId: unknown;
  expectedWarmMs: unknown;
  decidedAtSample: unknown;
}

/** two-slot 스냅샷 슬롯 컬럼 값(0=A, 1=B) — 스키마 CHECK 와 동일한 도메인. */
export type StudioJournalSnapshotSlot = 0 | 1;

export interface StudioJournalEntryRecord {
  seq: number;
  /** 저장 계층이 해석하지 않는 직렬화된 저널 엔트리(JSON). */
  payload: string;
  /** 엔트리가 이미 지니고 있는 CRC32(기존 entryCrc 산출값의 사본). */
  crc32: number;
}

export interface StudioJournalSnapshotRecord {
  slot: StudioJournalSnapshotSlot;
  seq: number;
  /** 저장 계층이 해석하지 않는 직렬화된 스냅샷(JSON). */
  payload: string;
  /** 스냅샷이 이미 지니고 있는 CRC32(기존 snapshotCrc 산출값의 사본). */
  crc32: number;
  updatedAt: number;
}

/** 코디네이터가 토너먼트 영속 포트에 접합하는 최소 async KV 어댑터. */
export interface StudioAsyncKeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface StudioLocalDatabase {
  kvGet(namespace: string, key: string): Promise<string | null>;
  kvSet(namespace: string, key: string, value: string): Promise<void>;
  kvDelete(namespace: string, key: string): Promise<void>;
  putTournamentWinner(
    winner: Omit<StudioTournamentWinnerRecord, "updatedAt">,
  ): Promise<void>;
  getTournamentWinner(
    bucket: string,
    deviceHash: string,
  ): Promise<StudioTournamentWinnerRecord | null>;
  listTournamentWinners(): Promise<StudioTournamentWinnerRecord[]>;
  /** 검증 없는 raw 우승 후보 행 — 오염 행 드롭 정책은 호출자 검증기 몫. */
  listTournamentWinnerCandidates(): Promise<StudioTournamentWinnerCandidate[]>;
  /**
   * 우승 테이블 전체를 단일 트랜잭션으로 교체한다(upsert + 고아 삭제).
   * 중간 실패 시 전체가 롤백되어 이전 상태가 그대로 남는다.
   */
  replaceTournamentWinners(
    winners: readonly Omit<StudioTournamentWinnerRecord, "updatedAt">[],
  ): Promise<void>;
  /** provider 의 우승 기록 전부 삭제. 삭제된 행 수를 돌려준다. */
  evictTournamentProvider(providerId: string): Promise<number>;
  recordCostSample(
    providerId: string,
    bucket: string,
    kind: StudioCostSampleKind,
    ms: number,
  ): Promise<void>;
  listCostSamples(
    providerId: string,
    bucket: string,
    limit?: number,
  ): Promise<StudioCostSampleRecord[]>;
  /**
   * 프로젝트 저널에 엔트리 1개를 단일 트랜잭션으로 추가한다. 같은 seq 이상에
   * 남아 있던 잔여 꼬리(복구가 논리적으로 잘라낸 torn/부패 엔트리)는 같은
   * 트랜잭션 안에서 물리 삭제되므로, 재개 후 replay 가 두 seq 를 볼 수 없다.
   */
  appendJournalEntry(projectId: string, entry: StudioJournalEntryRecord): Promise<void>;
  /** 프로젝트의 저널 엔트리 전부(seq 오름차순). */
  listJournalEntries(projectId: string): Promise<StudioJournalEntryRecord[]>;
  /** 스냅샷이 덮은 seq 미만 엔트리 삭제(compaction). 삭제 행 수를 돌려준다. */
  deleteJournalEntriesBefore(projectId: string, seq: number): Promise<number>;
  /** (project, slot) 기준 upsert — two-slot A/B 교대는 호출자가 결정한다. */
  putJournalSnapshot(
    projectId: string,
    snapshot: Omit<StudioJournalSnapshotRecord, "updatedAt">,
  ): Promise<void>;
  /** 프로젝트의 스냅샷 슬롯 전부(slot 오름차순, 최대 2행). */
  listJournalSnapshots(projectId: string): Promise<StudioJournalSnapshotRecord[]>;
  asAsyncKeyValueStore(namespace: string): StudioAsyncKeyValueStore;
  close(): Promise<void>;
}

export interface OpenStudioLocalDatabaseOptions {
  /**
   * "opfs"(기본, 브라우저 전용) 또는 "memory"(테스트/노드에서 스키마·쿼리
   * 검증용 ":memory:" DB).
   */
  vfs?: "opfs" | "memory";
  /** 테스트 시임 — sqlite-wasm 로더 대체(실패 주입 포함). */
  loadSqlite?: () => Promise<StudioSqliteApiHandle>;
  /** updated_at/recorded_at 스탬프 클럭(기본 Date.now). */
  now?: () => number;
}

export interface StudioSqliteSupportProbe {
  wasm: boolean;
  opfs: boolean;
  reason?: string;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const DEFAULT_COST_SAMPLE_LIMIT = 100;

const KV_GET_SQL = "SELECT value FROM kv WHERE namespace = ? AND key = ?";
const KV_SET_SQL = `INSERT INTO kv (namespace, key, value, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT (namespace, key)
  DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;
const KV_DELETE_SQL = "DELETE FROM kv WHERE namespace = ? AND key = ?";
const WINNER_PUT_SQL = `INSERT INTO tournament_winners
  (bucket, device_hash, provider_id, expected_warm_ms, decided_at_sample, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (bucket, device_hash)
  DO UPDATE SET
    provider_id = excluded.provider_id,
    expected_warm_ms = excluded.expected_warm_ms,
    decided_at_sample = excluded.decided_at_sample,
    updated_at = excluded.updated_at`;
const WINNER_COLUMNS =
  "bucket, device_hash, provider_id, expected_warm_ms, decided_at_sample, updated_at";
const WINNER_GET_SQL = `SELECT ${WINNER_COLUMNS} FROM tournament_winners
  WHERE bucket = ? AND device_hash = ?`;
const WINNER_LIST_SQL = `SELECT ${WINNER_COLUMNS} FROM tournament_winners
  ORDER BY bucket, device_hash`;
const WINNER_EVICT_SQL = "DELETE FROM tournament_winners WHERE provider_id = ?";
const WINNER_DELETE_ALL_SQL = "DELETE FROM tournament_winners";
const COST_SAMPLE_INSERT_SQL = `INSERT INTO cost_samples
  (provider_id, bucket, kind, ms, recorded_at) VALUES (?, ?, ?, ?, ?)`;
const COST_SAMPLE_LIST_SQL = `SELECT id, provider_id, bucket, kind, ms, recorded_at
  FROM cost_samples WHERE provider_id = ? AND bucket = ?
  ORDER BY recorded_at DESC, id DESC LIMIT ?`;
const JOURNAL_DELETE_TAIL_SQL =
  "DELETE FROM journal_entries WHERE project_id = ? AND seq >= ?";
const JOURNAL_INSERT_SQL = `INSERT INTO journal_entries
  (project_id, seq, payload, crc32) VALUES (?, ?, ?, ?)`;
const JOURNAL_LIST_SQL = `SELECT seq, payload, crc32 FROM journal_entries
  WHERE project_id = ? ORDER BY seq`;
const JOURNAL_COMPACT_SQL =
  "DELETE FROM journal_entries WHERE project_id = ? AND seq < ?";
const SNAPSHOT_PUT_SQL = `INSERT INTO snapshots
  (project_id, slot, seq, payload, crc32, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT (project_id, slot)
  DO UPDATE SET
    seq = excluded.seq,
    payload = excluded.payload,
    crc32 = excluded.crc32,
    updated_at = excluded.updated_at`;
const SNAPSHOT_LIST_SQL = `SELECT slot, seq, payload, crc32, updated_at
  FROM snapshots WHERE project_id = ? ORDER BY slot`;

function expectString(value: unknown, column: string): string {
  if (typeof value !== "string") {
    throw new Error(`studio local database: column ${column} is not TEXT`);
  }
  return value;
}

function expectNumber(value: unknown, column: string): number {
  if (typeof value !== "number") {
    throw new Error(`studio local database: column ${column} is not numeric`);
  }
  return value;
}

function rowToWinner(row: readonly unknown[]): StudioTournamentWinnerRecord {
  return {
    bucket: expectString(row[0], "bucket"),
    deviceHash: expectString(row[1], "device_hash"),
    providerId: expectString(row[2], "provider_id"),
    expectedWarmMs: expectNumber(row[3], "expected_warm_ms"),
    decidedAtSample: expectNumber(row[4], "decided_at_sample"),
    updatedAt: expectNumber(row[5], "updated_at"),
  };
}

function rowToWinnerCandidate(row: readonly unknown[]): StudioTournamentWinnerCandidate {
  return {
    bucket: row[0],
    deviceHash: row[1],
    providerId: row[2],
    expectedWarmMs: row[3],
    decidedAtSample: row[4],
  };
}

function rowToJournalEntry(row: readonly unknown[]): StudioJournalEntryRecord {
  return {
    seq: expectNumber(row[0], "seq"),
    payload: expectString(row[1], "payload"),
    crc32: expectNumber(row[2], "crc32"),
  };
}

function rowToJournalSnapshot(row: readonly unknown[]): StudioJournalSnapshotRecord {
  const slot = expectNumber(row[0], "slot");
  if (slot !== 0 && slot !== 1) {
    throw new Error(`studio local database: unexpected snapshot slot ${slot}`);
  }
  return {
    slot,
    seq: expectNumber(row[1], "seq"),
    payload: expectString(row[2], "payload"),
    crc32: expectNumber(row[3], "crc32"),
    updatedAt: expectNumber(row[4], "updated_at"),
  };
}

function rowToCostSample(row: readonly unknown[]): StudioCostSampleRecord {
  const kind = expectString(row[3], "kind");
  if (kind !== "warm" && kind !== "cold") {
    throw new Error(`studio local database: unexpected cost sample kind ${kind}`);
  }
  return {
    id: expectNumber(row[0], "id"),
    providerId: expectString(row[1], "provider_id"),
    bucket: expectString(row[2], "bucket"),
    kind,
    ms: expectNumber(row[4], "ms"),
    recordedAt: expectNumber(row[5], "recorded_at"),
  };
}

class SqliteStudioLocalDatabase implements StudioLocalDatabase {
  private readonly statements = new Map<string, StudioSqliteStatementHandle>();
  private closed = false;

  constructor(
    private readonly handle: StudioSqliteDatabaseHandle,
    private readonly now: () => number,
  ) {}

  private statement(sql: string): StudioSqliteStatementHandle {
    if (this.closed) {
      throw new Error("studio local database is closed");
    }
    let statement = this.statements.get(sql);
    if (statement === undefined) {
      statement = this.handle.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  private run(sql: string, params: readonly StudioSqliteBindValue[]): void {
    const statement = this.statement(sql);
    try {
      if (params.length > 0) statement.bind(params);
      while (statement.step()) {
        // 이 경로의 SQL 은 행을 돌려주지 않는다 — 완료까지 소진만 한다.
      }
    } finally {
      statement.reset();
    }
  }

  /**
   * BEGIN IMMEDIATE 트랜잭션 안에서 여러 statement 를 실행한다.
   * 중간 실패 시 ROLLBACK 후 원 에러를 전파한다(마이그레이션 러너와 동일 규약).
   */
  private transaction(work: () => void): void {
    if (this.closed) {
      throw new Error("studio local database is closed");
    }
    this.handle.exec("BEGIN IMMEDIATE");
    try {
      work();
      this.handle.exec("COMMIT");
    } catch (error) {
      try {
        this.handle.exec("ROLLBACK");
      } catch {
        // 트랜잭션이 이미 SQLite 쪽에서 자동 롤백된 경우 — 원 에러가 우선한다.
      }
      throw error;
    }
  }

  private selectRows(
    sql: string,
    params: readonly StudioSqliteBindValue[],
    columnCount: number,
  ): unknown[][] {
    const statement = this.statement(sql);
    const rows: unknown[][] = [];
    try {
      if (params.length > 0) statement.bind(params);
      while (statement.step()) {
        const row: unknown[] = [];
        for (let index = 0; index < columnCount; index += 1) {
          row.push(statement.get(index));
        }
        rows.push(row);
      }
    } finally {
      statement.reset();
    }
    return rows;
  }

  async kvGet(namespace: string, key: string): Promise<string | null> {
    const rows = this.selectRows(KV_GET_SQL, [namespace, key], 1);
    const first = rows[0];
    if (first === undefined) return null;
    return expectString(first[0], "value");
  }

  async kvSet(namespace: string, key: string, value: string): Promise<void> {
    this.run(KV_SET_SQL, [namespace, key, value, this.now()]);
  }

  async kvDelete(namespace: string, key: string): Promise<void> {
    this.run(KV_DELETE_SQL, [namespace, key]);
  }

  async putTournamentWinner(
    winner: Omit<StudioTournamentWinnerRecord, "updatedAt">,
  ): Promise<void> {
    this.run(WINNER_PUT_SQL, [
      winner.bucket,
      winner.deviceHash,
      winner.providerId,
      winner.expectedWarmMs,
      winner.decidedAtSample,
      this.now(),
    ]);
  }

  async getTournamentWinner(
    bucket: string,
    deviceHash: string,
  ): Promise<StudioTournamentWinnerRecord | null> {
    const rows = this.selectRows(WINNER_GET_SQL, [bucket, deviceHash], 6);
    const first = rows[0];
    if (first === undefined) return null;
    return rowToWinner(first);
  }

  async listTournamentWinners(): Promise<StudioTournamentWinnerRecord[]> {
    return this.selectRows(WINNER_LIST_SQL, [], 6).map(rowToWinner);
  }

  async listTournamentWinnerCandidates(): Promise<StudioTournamentWinnerCandidate[]> {
    return this.selectRows(WINNER_LIST_SQL, [], 6).map(rowToWinnerCandidate);
  }

  async replaceTournamentWinners(
    winners: readonly Omit<StudioTournamentWinnerRecord, "updatedAt">[],
  ): Promise<void> {
    const updatedAt = this.now();
    this.transaction(() => {
      // 전체 교체 = 새 집합의 upsert + 새 집합에 없는 고아 행 삭제. 두 단계를
      // 개별 SQL 로 흉내내는 대신 전삭제+재삽입으로 같은 결과를 원자적으로
      // 만든다(updated_at 은 어차피 매 save 마다 새로 스탬프된다).
      this.run(WINNER_DELETE_ALL_SQL, []);
      for (const winner of winners) {
        this.run(WINNER_PUT_SQL, [
          winner.bucket,
          winner.deviceHash,
          winner.providerId,
          winner.expectedWarmMs,
          winner.decidedAtSample,
          updatedAt,
        ]);
      }
    });
  }

  async evictTournamentProvider(providerId: string): Promise<number> {
    this.run(WINNER_EVICT_SQL, [providerId]);
    return this.handle.changes();
  }

  async recordCostSample(
    providerId: string,
    bucket: string,
    kind: StudioCostSampleKind,
    ms: number,
  ): Promise<void> {
    // kind 는 JS 에서 선검증하지 않는다 — 스키마의 CHECK 제약이 단일 진실이다.
    this.run(COST_SAMPLE_INSERT_SQL, [providerId, bucket, kind, ms, this.now()]);
  }

  async listCostSamples(
    providerId: string,
    bucket: string,
    limit: number = DEFAULT_COST_SAMPLE_LIMIT,
  ): Promise<StudioCostSampleRecord[]> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(`studio local database: limit must be a positive integer, got ${limit}`);
    }
    return this.selectRows(COST_SAMPLE_LIST_SQL, [providerId, bucket, limit], 6).map(
      rowToCostSample,
    );
  }

  async appendJournalEntry(
    projectId: string,
    entry: StudioJournalEntryRecord,
  ): Promise<void> {
    this.transaction(() => {
      // 복구가 논리적으로 잘라낸 seq 이상의 잔여 꼬리를 물리 삭제한 뒤 새
      // 엔트리를 넣는다 — replay 가 같은 seq 의 부패본/재기록본을 동시에
      // 보는 일이 구조적으로 불가능해진다.
      this.run(JOURNAL_DELETE_TAIL_SQL, [projectId, entry.seq]);
      this.run(JOURNAL_INSERT_SQL, [projectId, entry.seq, entry.payload, entry.crc32]);
    });
  }

  async listJournalEntries(projectId: string): Promise<StudioJournalEntryRecord[]> {
    return this.selectRows(JOURNAL_LIST_SQL, [projectId], 3).map(rowToJournalEntry);
  }

  async deleteJournalEntriesBefore(projectId: string, seq: number): Promise<number> {
    this.run(JOURNAL_COMPACT_SQL, [projectId, seq]);
    return this.handle.changes();
  }

  async putJournalSnapshot(
    projectId: string,
    snapshot: Omit<StudioJournalSnapshotRecord, "updatedAt">,
  ): Promise<void> {
    this.run(SNAPSHOT_PUT_SQL, [
      projectId,
      snapshot.slot,
      snapshot.seq,
      snapshot.payload,
      snapshot.crc32,
      this.now(),
    ]);
  }

  async listJournalSnapshots(projectId: string): Promise<StudioJournalSnapshotRecord[]> {
    return this.selectRows(SNAPSHOT_LIST_SQL, [projectId], 5).map(rowToJournalSnapshot);
  }

  asAsyncKeyValueStore(namespace: string): StudioAsyncKeyValueStore {
    return {
      get: (key) => this.kvGet(namespace, key),
      set: (key, value) => this.kvSet(namespace, key, value),
      delete: (key) => this.kvDelete(namespace, key),
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const statement of this.statements.values()) {
      try {
        statement.finalize();
      } catch {
        // finalize 는 사실상 소멸자 — 실패해도 나머지 정리와 close 를 계속한다.
      }
    }
    this.statements.clear();
    this.handle.close();
  }
}

async function loadSqliteApi(
  load?: () => Promise<StudioSqliteApiHandle>,
): Promise<StudioSqliteApiHandle> {
  try {
    if (load) return await load();
    const module = await import("@sqlite.org/sqlite-wasm");
    const sqlite3 = await module.default();
    return sqlite3 as unknown as StudioSqliteApiHandle;
  } catch (error) {
    throw new SqliteUnavailableError(
      `sqlite wasm module failed to load or initialize: ${describeError(error)}`,
      { cause: error },
    );
  }
}

type OpfsSupportCheck = { supported: true } | { supported: false; reason: string };

function detectOpfsSupport(): OpfsSupportCheck {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
    return {
      supported: false,
      reason: "navigator.storage.getDirectory is unavailable (no OPFS in this environment)",
    };
  }
  const fileHandleClass = (
    globalThis as {
      FileSystemFileHandle?: { prototype?: { createSyncAccessHandle?: unknown } };
    }
  ).FileSystemFileHandle;
  if (typeof fileHandleClass?.prototype?.createSyncAccessHandle !== "function") {
    return {
      supported: false,
      reason:
        "FileSystemFileHandle.createSyncAccessHandle is unavailable " +
        "(opfs-sahpool requires sync access handles)",
    };
  }
  return { supported: true };
}

async function openOpfsDatabaseHandle(
  api: StudioSqliteApiHandle,
): Promise<StudioSqliteDatabaseHandle> {
  const opfs = detectOpfsSupport();
  if (!opfs.supported) {
    throw new SqliteUnavailableError(opfs.reason);
  }
  try {
    const pool = await api.installOpfsSAHPoolVfs({
      directory: STUDIO_SQLITE_OPFS_DIRECTORY,
    });
    return new pool.OpfsSAHPoolDb(`/${STUDIO_SQLITE_DATABASE_FILENAME}`);
  } catch (error) {
    throw new SqliteUnavailableError(
      `opfs-sahpool vfs install or database open failed: ${describeError(error)}`,
      { cause: error },
    );
  }
}

function closeQuietly(handle: StudioSqliteDatabaseHandle): void {
  try {
    handle.close();
  } catch {
    // 개방 직후 마이그레이션 실패 정리 경로 — 원 에러가 우선한다.
  }
}

/**
 * Studio 로컬 SQLite DB 를 열고 스키마를 최신 버전으로 마이그레이션한다.
 * OPFS/wasm 을 못 쓰면 {@link SqliteUnavailableError} 로 명시 실패한다.
 */
export async function openStudioLocalDatabase(
  options: OpenStudioLocalDatabaseOptions = {},
): Promise<StudioLocalDatabase> {
  const vfs = options.vfs ?? "opfs";
  const api = await loadSqliteApi(options.loadSqlite);
  const handle =
    vfs === "memory" ? new api.oo1.DB(":memory:", "c") : await openOpfsDatabaseHandle(api);
  try {
    runStudioLocalDatabaseMigrations(handle);
  } catch (error) {
    closeQuietly(handle);
    throw error;
  }
  return new SqliteStudioLocalDatabase(handle, options.now ?? Date.now);
}

/** 환경 실측 프로브 — wasm 로드 가능 여부와 OPFS(sahpool) 지원 여부. */
export async function probeSqliteSupport(
  options: { loadSqlite?: () => Promise<StudioSqliteApiHandle> } = {},
): Promise<StudioSqliteSupportProbe> {
  const opfs = detectOpfsSupport();
  let wasm = false;
  let wasmReason: string | undefined;
  try {
    await loadSqliteApi(options.loadSqlite);
    wasm = true;
  } catch (error) {
    wasmReason =
      error instanceof SqliteUnavailableError ? error.reason : describeError(error);
  }
  const reasons: string[] = [];
  if (wasmReason !== undefined) reasons.push(`wasm: ${wasmReason}`);
  if (!opfs.supported) reasons.push(`opfs: ${opfs.reason}`);
  const probe: StudioSqliteSupportProbe = { wasm, opfs: opfs.supported };
  if (reasons.length > 0) probe.reason = reasons.join("; ");
  return probe;
}
