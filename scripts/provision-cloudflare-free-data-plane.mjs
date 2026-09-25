#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1_DIRECTORY = resolve(ROOT, "deploy/federated-data-plane/d1");
const API_ORIGIN = "https://api.cloudflare.com/client/v4";
const CONFIRMATION = "APPLY-TOONSPECTRUM-CLOUDFLARE-FREE-DATA";
const CHECKPOINT_TABLE = "_toonspectrum_d1_migration";
const MAX_REVIEW_AGE_MS = 24 * 60 * 60 * 1000;
const FREE_DATABASE_LIMIT = 10;
const FREE_DATABASE_BYTES = 500_000_000;
const FREE_ACCOUNT_BYTES = 5_000_000_000;
const ANALYTICS_V1_SHA256 = "5fca80a5d267e9433224702f4f382a0a43df6184ab30670867e92609f31f85b3";
const ANALYTICS_UNUSED_INDEXES = [
  "traffic_page_view_session_occurred_idx",
  "traffic_page_view_visitor_occurred_idx",
  "traffic_page_view_path_occurred_idx",
  "traffic_share_event_session_occurred_idx",
  "traffic_share_event_path_occurred_idx",
  "traffic_share_event_channel_occurred_idx",
];
const UUID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const CHECKPOINT_SQL = `CREATE TABLE IF NOT EXISTS ${CHECKPOINT_TABLE} (
  migration_id TEXT PRIMARY KEY,
  shard_id TEXT NOT NULL,
  schema_sha256 TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) WITHOUT ROWID;`;
const SCHEMA_QUERY = "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV' ORDER BY type, name";

function fail(message) {
  throw new Error(message);
}

export function parseCloudflareFreeDataPlaneArguments(argv) {
  if (argv.length < 1 || argv.length > 2 || !["--plan", "--check", "--apply", "--upgrade"].includes(argv[0])
    || (argv[1] && !/^--database=(?:edge-index|analytics-buffer)$/.test(argv[1]))
    || (argv[0] === "--upgrade" && argv[1] !== "--database=analytics-buffer")) {
    fail("--plan, --check, --apply 중 하나와 선택적 DB를 지정하거나 --upgrade --database=analytics-buffer를 명시하세요.");
  }
  return { mode: argv[0].slice(2), database: argv[1]?.slice("--database=".length) };
}

function normalizedSchema(rows) {
  return rows.map(({ type, name, tbl_name: tableName, sql }) => ({
    type,
    name,
    tableName,
    sql: String(sql).replace(/\bIF NOT EXISTS\s*/gi, "")
      .replace(/\s+/g, " ").replace(/;$/, "").trim(),
  })).sort((left, right) => `${left.type}:${left.name}`.localeCompare(
    `${right.type}:${right.name}`, "en",
  ));
}

function loadSchemaDefinition(entry) {
  const sql = entry.schemaFiles.map((file) =>
    readFileSync(resolve(D1_DIRECTORY, file), "utf8")).join("\n");
  const withoutComments = sql.replace(/--[^\n]*/g, "");
  const creates = [...withoutComments.matchAll(
    /\bCREATE\s+(?:TABLE|INDEX|TRIGGER)\s+(IF\s+NOT\s+EXISTS\s+)?/gi,
  )];
  if (creates.length === 0 || creates.some((match) => !match[1])
    || /^\s*(?:DROP|ALTER|ATTACH|DETACH|VACUUM)\b/im.test(withoutComments)
    || Buffer.byteLength(sql, "utf8") > 100_000) {
    fail("초기 D1 schema는 100KB 이하의 멱등 CREATE 구성이어야 합니다. schema 파일을 검토하세요.");
  }
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`${sql}\n${CHECKPOINT_SQL}`);
    return { ...entry, sql, sha256: createHash("sha256").update(sql).digest("hex"),
      expectedSchema: normalizedSchema(database.prepare(SCHEMA_QUERY).all()) };
  } finally { database.close(); }
}

function analyticsUpgrade(definition) {
  const from = loadSchemaDefinition({ ...definition, migrationId: "analytics-buffer-v1",
    schemaFiles: ["migrations/analytics-buffer-v1.sql", "migrations/traffic-analytics-v1.sql"] });
  if (from.sha256 !== ANALYTICS_V1_SHA256) fail("이미 적용한 analytics v1 SQL 스냅샷이 변경되었습니다. 업그레이드를 중단합니다.");
  const sql = readFileSync(resolve(D1_DIRECTORY, "migrations/analytics-buffer-v2.sql"), "utf8");
  const statements = sql.replace(/--[^\n]*/g, "").split(";").map((part) => part.trim()).filter(Boolean);
  if (JSON.stringify(statements) !== JSON.stringify(ANALYTICS_UNUSED_INDEXES.map((name) => `DROP INDEX ${name}`))) {
    fail("analytics v2는 검토한 미사용 인덱스 6개만 제거할 수 있습니다.");
  }
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`${from.sql}\n${CHECKPOINT_SQL}\n${sql}`);
    if (JSON.stringify(normalizedSchema(database.prepare(SCHEMA_QUERY).all())) !== JSON.stringify(definition.expectedSchema)) {
      fail("analytics v1에서 v2로의 업그레이드 결과와 새 DB 스키마가 다릅니다.");
    }
  } finally { database.close(); }
  return { from, statements };
}

export function loadCloudflareFreeDataPlaneManifest() {
  const manifest = JSON.parse(readFileSync(resolve(D1_DIRECTORY, "databases.json"), "utf8"));
  const expected = [
    ["d1-edge-index", "toonspectrum-edge-index", ["edge-index.sql"], "edge-index-v1"],
    ["d1-analytics-buffer", "toonspectrum-analytics-buffer", ["analytics-buffer.sql", "traffic-analytics.sql"], "analytics-buffer-v2"],
  ];
  if (manifest.version !== "toonspectrum.cloudflare-free-data-plane.v1"
    || manifest.quotaScope !== "cloudflare-account"
    || manifest.primaryLocationHint !== "apac"
    || JSON.stringify(manifest.databases?.map((entry) => [
      entry.shardId, entry.name, entry.schemaFiles, entry.migrationId,
    ])) !== JSON.stringify(expected)) {
    fail("D1 manifest가 승인된 두 DB 구성과 다릅니다. databases.json을 검토하세요.");
  }
  return {
    ...manifest,
    databases: manifest.databases.map((entry) => {
      const definition = loadSchemaDefinition(entry);
      return entry.shardId === "d1-analytics-buffer"
        ? { ...definition, upgrade: analyticsUpgrade(definition) } : definition;
    }),
  };
}

class CloudflareRequestError extends Error {
  constructor(operation, status, codes = []) {
    // 공급자 오류 본문에는 요청 내용이 포함될 수 있어 숫자 코드만 보존한다.
    super(`Cloudflare ${operation} 실패 (HTTP ${status}, 코드 ${codes.join(",") || "없음"}). 자동 재시도하지 않았습니다. 원격 상태를 확인한 뒤 --check로 검증하세요.`);
    this.status = status;
    this.codes = codes;
  }
}

function createClient(environment, fetchImpl) {
  const accountId = environment.CLOUDFLARE_ACCOUNT_ID;
  const token = environment.CLOUDFLARE_API_TOKEN;
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? "")) {
    fail("명시적인 CLOUDFLARE_ACCOUNT_ID 환경변수에 32자리 계정 ID를 설정하세요.");
  }
  if (!token?.trim() || /\s/.test(token)) {
    fail("CLOUDFLARE_API_TOKEN 환경변수에 유효한 API token을 설정하세요.");
  }
  const basePath = `/accounts/${accountId}`;
  return {
    accountId,
    async request(path, { method = "GET", body, operation = "조회" } = {}) {
      let response;
      let envelope;
      try {
        response = await fetchImpl(`${API_ORIGIN}${basePath}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(30_000),
          redirect: "error",
        });
        envelope = await response.json();
      } catch {
        throw new CloudflareRequestError(operation, response?.status ?? "연결 불명");
      }
      const codes = Array.isArray(envelope?.errors)
        ? envelope.errors.map((entry) => entry?.code).filter(Number.isInteger)
        : [];
      if (!response.ok || envelope?.success !== true) {
        throw new CloudflareRequestError(operation, response.status, codes);
      }
      return envelope;
    },
  };
}

function reviewedFreePlan(environment, accountId, now) {
  let review;
  try {
    review = JSON.parse(environment.TOONSPECTRUM_CLOUDFLARE_FREE_PLAN_REVIEW_JSON ?? "null");
  } catch {
    fail("Workers Free 검토 JSON이 잘못되었습니다. token이나 사용자 데이터를 넣지 마세요.");
  }
  const checkedAt = Date.parse(review?.checkedAt);
  if (review?.accountId !== accountId || review?.workersPlan !== "free"
    || typeof review?.checkedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(review.checkedAt)
    || !Number.isFinite(checkedAt) || checkedAt > now || now - checkedAt > MAX_REVIEW_AGE_MS) {
    fail("Workers Free 플랜을 API로 확인하지 못했습니다. 계정 dashboard를 검토하고 TOONSPECTRUM_CLOUDFLARE_FREE_PLAN_REVIEW_JSON에 accountId, workersPlan=free, 24시간 이내 checkedAt을 명시한 뒤 다시 실행하세요.");
  }
  return { workersPlan: "free", evidence: "explicit-review", checkedAt: new Date(checkedAt).toISOString() };
}

async function verifyFreePlan(client, environment, now) {
  let subscriptions;
  try {
    const envelope = await client.request("/subscriptions", { operation: "플랜 조회" });
    if (!Array.isArray(envelope.result)) fail("Cloudflare 플랜 응답 형식이 잘못되었습니다.");
    subscriptions = envelope.result;
  } catch (error) {
    if (!(error instanceof CloudflareRequestError)
      || !([401, 403].includes(error.status) || error.codes.includes(10000))) throw error;
    return reviewedFreePlan(environment, client.accountId, now);
  }
  const workers = subscriptions.filter((entry) => {
    const plan = entry?.rate_plan ?? {};
    return /workers/i.test([plan.id, plan.public_name, plan.scope, ...(plan.sets ?? [])].join(" "));
  });
  if (workers.some((entry) => entry.price > 0
    || /paid|bundled|unbound|enterprise|(?:^|_)ent(?:_|$)|workers_basic|workers_ss/i.test(
      [entry.rate_plan?.id, entry.rate_plan?.public_name].join(" "),
    ))) {
    fail("Workers 유료 또는 확인되지 않은 Workers 구독을 발견했습니다. 이 스크립트는 플랜을 변경하지 않습니다. 무료 전용 계정을 확인하세요.");
  }
  if (workers.length > 0 && workers.every((entry) =>
    ["free", "workers_free"].includes(String(entry.rate_plan?.id).toLowerCase()))) {
    return { workersPlan: "free", evidence: "subscriptions-api" };
  }
  // 구독이 비어 있다는 사실만으로 Workers Free를 추정하지 않는다.
  return reviewedFreePlan(environment, client.accountId, now);
}

async function listDatabases(client) {
  const databases = [];
  for (let page = 1; page <= 100; page += 1) {
    const envelope = await client.request(`/d1/database?per_page=100&page=${page}`, {
      operation: "D1 목록 조회",
    });
    if (!Array.isArray(envelope.result)) fail("D1 목록 응답 형식이 잘못되었습니다.");
    databases.push(...envelope.result);
    if (envelope.result.length < 100
      || (Number.isInteger(envelope.result_info?.total_pages)
        && page >= envelope.result_info.total_pages)) return databases;
  }
  fail("D1 전체 목록을 확인하지 못했습니다. 아무 DB도 생성하지 않았습니다.");
}

function validateDatabaseIdentity(database, expectedName) {
  if (!UUID_PATTERN.test(database?.uuid ?? "")
    || (expectedName && database.name !== expectedName)
    || database.version !== "production") {
    fail("D1 이름·UUID·production 버전이 기대와 다릅니다. 원격 DB를 수동 확인하세요.");
  }
}

async function query(client, databaseId, body) {
  const envelope = await client.request(`/d1/database/${databaseId}/query`, {
    method: "POST", body, operation: "D1 schema 검증/적용",
  });
  if (!Array.isArray(envelope.result) || envelope.result.length === 0
    || envelope.result.some((entry) => entry.success !== true || !Array.isArray(entry.results))) {
    fail("D1 query 결과가 불완전합니다. 자동 재시도하지 않았습니다. --check로 원격 상태를 확인하세요.");
  }
  return envelope.result;
}

async function verifyDatabase(client, database, definition, allowUpgrade = false) {
  const schema = (await query(client, database.uuid, { sql: SCHEMA_QUERY }))[0].results;
  if (!schema.some((entry) => entry.name === CHECKPOINT_TABLE && entry.type === "table")) {
    fail(`${definition.name}: 소유권 checkpoint 없는 동명 DB입니다. 기존 데이터를 자동으로 인수하거나 덮어쓰지 않습니다.`);
  }
  const candidates = [definition, ...(allowUpgrade && definition.upgrade ? [definition.upgrade.from] : [])];
  const actualSchema = JSON.stringify(normalizedSchema(schema));
  const matched = candidates.find((candidate) => actualSchema === JSON.stringify(candidate.expectedSchema));
  if (!matched) {
    fail(`${definition.name}: schema가 manifest와 다릅니다. 수정하거나 재적용하지 않았습니다. 기존 analytics v1은 --upgrade --database=analytics-buffer로만 갱신합니다.`);
  }
  const checkpoints = (await query(client, database.uuid, {
    sql: `SELECT migration_id, shard_id, schema_sha256 FROM ${CHECKPOINT_TABLE} LIMIT 2`,
  }))[0].results;
  if (checkpoints.length !== 1
    || checkpoints[0].migration_id !== matched.migrationId
    || checkpoints[0].shard_id !== matched.shardId
    || checkpoints[0].schema_sha256 !== matched.sha256) {
    fail(`${definition.name}: migration checkpoint가 일치하지 않습니다. SQL을 자동 재실행하지 않았습니다.`);
  }
  return matched.migrationId;
}

async function upgradeDatabase(client, database, definition) {
  const from = definition.upgrade.from;
  // 사전 조회 뒤 checkpoint가 바뀌었으면 NOT NULL 위반으로 batch 전체를 중단한다.
  // 정상 경로에서는 INSERT가 0행을 써서 별도 guard 테이블이나 인덱스를 만들지 않는다.
  const assertCheckpoint = `INSERT INTO ${CHECKPOINT_TABLE} (migration_id, shard_id, schema_sha256)
SELECT NULL, NULL, NULL WHERE
(SELECT COUNT(*) FROM ${CHECKPOINT_TABLE}) <> 1 OR NOT EXISTS
(SELECT 1 FROM ${CHECKPOINT_TABLE} WHERE migration_id = ? AND shard_id = ? AND schema_sha256 = ?)`;
  const results = await query(client, database.uuid, { batch: [
    { sql: assertCheckpoint, params: [from.migrationId, from.shardId, from.sha256] },
    ...definition.upgrade.statements.map((sql) => ({ sql })),
    { sql: `UPDATE ${CHECKPOINT_TABLE} SET migration_id = ?, schema_sha256 = ?, applied_at = CURRENT_TIMESTAMP
WHERE migration_id = ? AND shard_id = ? AND schema_sha256 = ?`,
    params: [definition.migrationId, definition.sha256, from.migrationId, from.shardId, from.sha256] },
  ] });
  if (results.length !== definition.upgrade.statements.length + 2) {
    fail("D1 upgrade batch 응답이 불완전합니다. 재시도하지 말고 --check로 원격 상태를 확인하세요.");
  }
  await verifyDatabase(client, database, definition);
}

async function inspect(client, definitions, mode) {
  const databases = await listDatabases(client);
  const missing = definitions.filter((definition) =>
    !databases.some((database) => database.name === definition.name));
  if (databases.length + (mode === "apply" ? missing.length : 0) > FREE_DATABASE_LIMIT) {
    fail("계정 공유 D1 Free DB 개수 한도를 넘습니다. 기존 DB를 삭제하거나 유료 플랜으로 바꾸지 않습니다.");
  }
  let totalBytes = 0;
  const byName = new Map();
  const seenIds = new Set();
  for (const listed of databases) {
    if (seenIds.has(listed.uuid) || byName.has(listed.name)) {
      fail("D1 목록에 중복 이름 또는 UUID가 있습니다. 생성·수정하지 않았습니다.");
    }
    validateDatabaseIdentity(listed);
    seenIds.add(listed.uuid);
    const database = (await client.request(`/d1/database/${listed.uuid}`, {
      operation: "D1 저장량 조회",
    })).result;
    validateDatabaseIdentity(database, listed.name);
    if (database.uuid !== listed.uuid || !Number.isSafeInteger(database.file_size)
      || database.file_size < 0 || database.file_size > FREE_DATABASE_BYTES) {
      fail("기존 D1 크기 또는 식별자를 확인할 수 없습니다. Free 한도 검증 후 다시 실행하세요.");
    }
    totalBytes += database.file_size;
    byName.set(database.name, database);
  }
  // 생성할 두 schema의 작은 저장 공간도 계정 한도에 여유가 있어야 한다.
  if (totalBytes + missing.length * 1_000_000 > FREE_ACCOUNT_BYTES) {
    fail("계정 공유 D1 Free 저장공간 여유가 부족합니다. 기존 데이터는 변경하지 않았습니다.");
  }
  const versions = new Map();
  for (const definition of definitions) {
    const existing = byName.get(definition.name);
    if (existing) versions.set(definition.name, await verifyDatabase(client, existing, definition, mode === "upgrade"));
    else if (mode !== "apply") fail(`${definition.name}: DB가 없습니다. --plan을 검토한 뒤 --apply를 실행하세요.`);
  }
  return { byName, versions, existingCount: databases.length };
}

export async function provisionCloudflareFreeDataPlane(mode, {
  environment = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  database: selectedDatabase,
} = {}) {
  if (!["check", "apply", "upgrade"].includes(mode)) fail("원격 실행은 check, apply 또는 upgrade만 허용됩니다.");
  if (mode === "upgrade" && selectedDatabase !== "analytics-buffer") {
    fail("업그레이드 대상은 --upgrade --database=analytics-buffer로 명시하세요.");
  }
  if (mode !== "check" && environment.TOONSPECTRUM_CLOUDFLARE_FREE_DATA_CONFIRMATION !== CONFIRMATION) {
    fail(`적용하려면 TOONSPECTRUM_CLOUDFLARE_FREE_DATA_CONFIRMATION=${CONFIRMATION}을 명시하세요.`);
  }
  const manifest = loadCloudflareFreeDataPlaneManifest();
  if (selectedDatabase && !["edge-index", "analytics-buffer"].includes(selectedDatabase)) {
    fail("선택한 D1 DB가 승인된 manifest에 없습니다.");
  }
  const definitions = manifest.databases.filter((entry) =>
    !selectedDatabase || entry.shardId === `d1-${selectedDatabase}`);
  const client = createClient(environment, fetchImpl);
  const plan = await verifyFreePlan(client, environment, now);
  const state = await inspect(client, definitions, mode);
  const result = [];
  for (const definition of definitions) {
    let database = state.byName.get(definition.name);
    const created = !database;
    const upgraded = mode === "upgrade" && state.versions.get(definition.name) !== definition.migrationId;
    if (!database) {
      database = (await client.request("/d1/database", {
        method: "POST",
        body: { name: definition.name, primary_location_hint: manifest.primaryLocationHint },
        operation: "D1 생성",
      })).result;
      validateDatabaseIdentity(database, definition.name);
      const schema = (await query(client, database.uuid, { sql: SCHEMA_QUERY }))[0].results;
      if (schema.length !== 0) fail(`${definition.name}: 새 DB가 비어 있지 않습니다. SQL 적용을 중단했습니다.`);
      await query(client, database.uuid, { batch: [
        { sql: definition.sql },
        { sql: CHECKPOINT_SQL },
        {
          sql: `INSERT INTO ${CHECKPOINT_TABLE} (migration_id, shard_id, schema_sha256) VALUES (?, ?, ?)`,
          params: [definition.migrationId, definition.shardId, definition.sha256],
        },
      ] });
      await verifyDatabase(client, database, definition);
    } else if (upgraded) {
      await upgradeDatabase(client, database, definition);
    }
    result.push({ shardId: definition.shardId, name: definition.name,
      databaseId: database.uuid, schemaSha256: definition.sha256, migrationId: definition.migrationId, created, upgraded });
  }
  return { mode, quotaScope: manifest.quotaScope, plan,
    accountDatabaseCount: state.existingCount + result.filter((entry) => entry.created).length,
    databases: result };
}

function planText(selectedDatabase) {
  const manifest = loadCloudflareFreeDataPlaneManifest();
  const definitions = manifest.databases.filter((entry) =>
    !selectedDatabase || entry.shardId === `d1-${selectedDatabase}`);
  return [
    `Cloudflare Workers Free 확인 후 선택한 D1 ${definitions.length}개만 생성하거나 검증합니다.`,
    ...definitions.map((entry) => `${entry.name}: ${entry.schemaFiles.join(", ")} (${entry.migrationId})`),
    ...definitions.filter((entry) => entry.upgrade).map((entry) =>
      `명시적 upgrade: ${entry.upgrade.from.migrationId} (${entry.upgrade.from.sha256}) → ${entry.migrationId} (${entry.sha256}), 미사용 인덱스 ${entry.upgrade.statements.length}개 제거`),
    "실제 소비자가 준비된 DB만 --database=analytics-buffer 또는 --database=edge-index로 선택할 수 있습니다.",
    "무료 quota는 계정 공유입니다. DB 수를 늘려도 읽기·쓰기 무료량이 늘지 않습니다.",
    "--check는 목록·설정·schema/checkpoint만 읽고, --apply는 새 DB에만 schema를 적용합니다.",
    "기존 analytics v1은 --upgrade --database=analytics-buffer로 전체 DDL·checkpoint를 검증한 뒤 원자 batch 한 번으로 v2로 갱신합니다.",
    "CLOUDFLARE_ACCOUNT_ID와 CLOUDFLARE_API_TOKEN 환경변수가 필요합니다.",
    `적용 확인: TOONSPECTRUM_CLOUDFLARE_FREE_DATA_CONFIRMATION=${CONFIRMATION}`,
    "플랜 API로 확인할 수 없으면 TOONSPECTRUM_CLOUDFLARE_FREE_PLAN_REVIEW_JSON에 검토한 accountId, workersPlan=free, checkedAt(24시간 이내)을 명시하세요.",
    "플랜 변경·원격 자동 재시도·기존 동명 DB 인수·사용자 데이터 출력은 수행하지 않습니다.",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { mode, database } = parseCloudflareFreeDataPlaneArguments(process.argv.slice(2));
    if (mode === "plan") process.stdout.write(`${planText(database)}\n`);
    else process.stdout.write(`Cloudflare 무료 데이터 구성 검증 완료: ${JSON.stringify(await provisionCloudflareFreeDataPlane(mode, { database }))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "구성 검증 중 오류가 발생했습니다."}\n`);
    process.exitCode = 1;
  }
}
