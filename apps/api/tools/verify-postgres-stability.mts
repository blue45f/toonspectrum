import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import { Pool } from "pg";

import { resolvePgPoolOptions } from "../src/platform/database/pg-connection";
import { DatabasePoolLifecycle } from "../src/runtime/database-pool-lifecycle";

// 운영 DB/기존 개발 DB를 대상으로 장애를 주입하지 않는다. 별도 로컬 테스트 DB만 허용한다.
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error("격리된 로컬 TEST_DATABASE_URL을 지정하세요.");
const target = new URL(connectionString);
assert(["postgres:", "postgresql:"].includes(target.protocol), "PostgreSQL URL만 허용합니다.");
assert(["127.0.0.1", "[::1]"].includes(target.hostname), "명시적인 loopback 주소만 허용합니다.");
assert(/^\/toonstudio_stability_[a-z0-9_]+$/u.test(target.pathname), "전용 안정성 테스트 DB 이름이 필요합니다.");
assert.equal(target.search, "", "연결 대상 우회를 막기 위해 URL 옵션을 허용하지 않습니다.");
const poolErrors: string[] = [];
const results: string[] = [];
function makePool(overrides: Record<string, string> = {}) {
  const pool = new Pool({ connectionString, ...resolvePgPoolOptions({
    WEBDEX_PG_STATEMENT_MS: "1000", WEBDEX_PG_LOCK_MS: "200",
    WEBDEX_PG_IDLE_TRANSACTION_MS: "1000", WEBDEX_PG_CONNECT_MS: "1000",
    ...overrides,
  }, connectionString) });
  pool.on("error", () => poolErrors.push("unexpected idle pool error"));
  return pool;
}
async function check(name: string, operation: () => Promise<void>) {
  await operation();
  results.push(name);
  console.log(`PASS: ${name}`);
}

await check("서버 실행 제한과 취소 후 재연결", async () => {
  const pool = makePool();
  try {
    const settings = await pool.query("SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock");
    assert.equal(settings.rows[0].statement, "1s");
    assert.equal(settings.rows[0].lock, "200ms");
    await assert.rejects(pool.query("SELECT pg_sleep(5)"), { code: "57014" });
    assert.equal((await pool.query("SELECT 1 AS ready")).rows[0].ready, 1);
  } finally { await pool.end(); }
});

await check("잠금 경합 제한과 롤백 복구", async () => {
  const pool = makePool({ WEBDEX_PG_STATEMENT_MS: "10000", WEBDEX_PG_IDLE_TRANSACTION_MS: "10000" });
  const owner = await pool.connect();
  const waiter = await pool.connect();
  try {
    await owner.query("BEGIN");
    await owner.query("SELECT pg_advisory_xact_lock(9272026, 55437)");
    await waiter.query("BEGIN");
    await assert.rejects(waiter.query("SELECT pg_advisory_xact_lock(9272026, 55437)"), { code: "55P03" });
    await waiter.query("ROLLBACK");
    await owner.query("ROLLBACK");
    assert.equal((await waiter.query("SELECT 1 AS ready")).rows[0].ready, 1);
  } finally { owner.release(true); waiter.release(true); await pool.end(); }
});

await check("유휴 트랜잭션 종료와 새 연결 복구", async () => {
  const pool = makePool();
  const client = await pool.connect();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const failure = new Promise<Error>((resolve, reject) => {
      client.once("error", resolve);
      timer = setTimeout(() => reject(new Error("유휴 트랜잭션 종료가 관측되지 않았습니다.")), 10000);
    });
    await client.query("BEGIN");
    await client.query("SELECT 1");
    const error = await failure;
    assert.equal(Reflect.get(error, "code"), "25P03");
  } finally { if (timer) clearTimeout(timer); client.release(true); }
  try { assert.equal((await pool.query("SELECT 1 AS ready")).rows[0].ready, 1); }
  finally { await pool.end(); }
});

await check("풀 포화 시 대기 제한과 연결 반납 후 복구", async () => {
  const pool = makePool({ WEBDEX_PG_POOL_MAX: "1" });
  const held = await pool.connect();
  try { await assert.rejects(pool.connect(), /timeout/iu); }
  finally { held.release(); }
  try { assert.equal((await pool.query("SELECT 1 AS ready")).rows[0].ready, 1); }
  finally { await pool.end(); }
});

await check("transaction pooler 호환 모드의 클라이언트 대기 제한", async () => {
  const pool = makePool({ WEBDEX_PG_CONNECTION_MODE: "transaction", WEBDEX_PG_QUERY_MS: "1000" });
  try {
    assert.equal((await pool.query("SHOW statement_timeout")).rows[0].statement_timeout, "0");
    await assert.rejects(pool.query("SELECT pg_sleep(5)"), /timeout/iu);
    assert.equal((await pool.query("SELECT 1 AS ready")).rows[0].ready, 1);
  } finally { await pool.end(); }
});

await check("체크아웃 연결 반납 후 멱등 종료", async () => {
  const pool = makePool();
  const client = await pool.connect();
  const lifecycle = new DatabasePoolLifecycle(pool, 10_000);
  let completed = false;
  const pending = lifecycle.onApplicationShutdown();
  const watched = pending.then(() => { completed = true; });
  try { await delay(30); assert.equal(completed, false); }
  finally { client.release(); }
  await watched;
  assert.equal(lifecycle.onApplicationShutdown(), pending);
  await assert.rejects(pool.query("SELECT 1"), /end/iu);
});
assert.deepEqual(poolErrors, []);
console.log(JSON.stringify({ passed: results.length, productionTouched: false }));
