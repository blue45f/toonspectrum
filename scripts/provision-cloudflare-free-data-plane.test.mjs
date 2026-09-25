import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadCloudflareFreeDataPlaneManifest,
  parseCloudflareFreeDataPlaneArguments,
  provisionCloudflareFreeDataPlane,
} from "./provision-cloudflare-free-data-plane.mjs";

const NOW = Date.parse("2026-09-26T08:00:00Z");
const ACCOUNT = "a".repeat(32);
const environment = {
  CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
  CLOUDFLARE_API_TOKEN: "local-test-token",
  TOONSPECTRUM_CLOUDFLARE_FREE_DATA_CONFIRMATION: "APPLY-TOONSPECTRUM-CLOUDFLARE-FREE-DATA",
};
const freeSubscription = { rate_plan: { id: "workers_free", public_name: "Workers Free" }, price: 0 };
const openDatabases = [];

function review(overrides = {}) {
  return JSON.stringify({ accountId: ACCOUNT, workersPlan: "free",
    checkedAt: new Date(NOW).toISOString(), ...overrides });
}

function fakeCloudflare({ subscriptions = [freeSubscription], deniedPlan = false } = {}) {
  const calls = [];
  const databases = new Map();
  function addDatabase(name, sql = "") {
    const uuid = `00000000-0000-4000-8000-${String(databases.size + 1).padStart(12, "0")}`;
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(sql);
    openDatabases.push(sqlite);
    const database = { uuid, name, version: "production", file_size: 16_384, sqlite };
    databases.set(uuid, database);
    return database;
  }
  function metadata(database) {
    return { uuid: database.uuid, name: database.name,
      version: database.version, file_size: database.file_size };
  }
  async function fetchImpl(url, options) {
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://api.cloudflare.com");
    expect(parsed.pathname.startsWith(`/client/v4/accounts/${ACCOUNT}/`)).toBe(true);
    expect(options.headers.Authorization).toBe(`Bearer ${environment.CLOUDFLARE_API_TOKEN}`);
    expect(options.redirect).toBe("error");
    const path = parsed.pathname.slice(`/client/v4/accounts/${ACCOUNT}`.length);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method: options.method, body });
    let result;
    if (path === "/subscriptions") {
      if (deniedPlan) return Response.json({ success: false, errors: [{ code: 10000,
        message: `반환하면 안 되는 값 ${environment.CLOUDFLARE_API_TOKEN}` }] }, { status: 403 });
      result = subscriptions;
    } else if (path === "/d1/database" && options.method === "GET") {
      result = [...databases.values()].map(metadata);
    } else if (path === "/d1/database" && options.method === "POST") {
      expect(Object.keys(body).sort()).toEqual(["name", "primary_location_hint"]);
      expect(body.primary_location_hint).toBe("apac");
      result = metadata(addDatabase(body.name));
    } else {
      const match = path.match(/^\/d1\/database\/([^/]+)(\/query)?$/);
      if (!match || !databases.has(match[1])) throw new Error("예상하지 못한 API 요청");
      const database = databases.get(match[1]);
      if (!match[2]) result = metadata(database);
      else {
        const statements = body.batch ?? [body];
        if (body.batch) database.sqlite.exec("BEGIN");
        try {
          result = statements.map(({ sql, params }) => {
            if (params) {
              database.sqlite.prepare(sql).run(...params);
              return { success: true, results: [] };
            }
            if (/^SELECT/.test(sql)) {
              return { success: true, results: database.sqlite.prepare(sql).all() };
            }
            database.sqlite.exec(sql);
            return { success: true, results: [] };
          });
          if (body.batch) database.sqlite.exec("COMMIT");
        } catch (error) {
          if (body.batch) database.sqlite.exec("ROLLBACK");
          throw error;
        }
      }
    }
    return Response.json({ success: true, result });
  }
  return { calls, databases, addDatabase, fetchImpl };
}

function writes(calls) {
  return calls.filter((call) => call.method !== "GET"
    && !(call.path.endsWith("/query") && /^SELECT/.test(call.body?.sql ?? "")));
}

function installAnalyticsV1(api) {
  const definition = loadCloudflareFreeDataPlaneManifest().databases.find((entry) => entry.shardId === "d1-analytics-buffer");
  const from = definition.upgrade.from;
  const checkpoint = from.expectedSchema.find((entry) => entry.name === "_toonspectrum_d1_migration");
  const database = api.addDatabase(from.name, `${from.sql}\n${checkpoint.sql};`);
  database.sqlite.prepare("INSERT INTO _toonspectrum_d1_migration (migration_id, shard_id, schema_sha256) VALUES (?, ?, ?)")
    .run(from.migrationId, from.shardId, from.sha256);
  database.sqlite.exec("INSERT INTO traffic_analytics_maintenance VALUES ('retention', 0, 'local-validation')");
  return { database, definition };
}

function schemaRows(sqlite) {
  return sqlite.prepare("SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type, name").all();
}

afterEach(() => {
  for (const database of openDatabases.splice(0)) database.close();
});

describe("Cloudflare 무료 D1 구성", () => {
  it.each(["plan", "check", "apply"])("명시한 %s 모드 하나만 허용한다", (mode) => {
    expect(parseCloudflareFreeDataPlaneArguments([`--${mode}`])).toEqual({ mode, database: undefined });
  });

  it.each([[], ["--plan", "--apply"], ["--apply", "--force"], ["--upgrade"], ["--upgrade", "--database=edge-index"]])(
    "모호한 인자를 거부한다: %j", (...arguments_) => {
      expect(() => parseCloudflareFreeDataPlaneArguments(arguments_)).toThrow("중 하나와");
    },
  );

  it("업그레이드 대상은 분석 DB 하나로 명시한다", () => {
    expect(parseCloudflareFreeDataPlaneArguments(["--upgrade", "--database=analytics-buffer"]))
      .toEqual({ mode: "upgrade", database: "analytics-buffer" });
  });

  it("계정 공유 quota 아래 필요한 두 DB와 기존 SQL만 사용한다", () => {
    const manifest = loadCloudflareFreeDataPlaneManifest();
    expect(manifest.quotaScope).toBe("cloudflare-account");
    expect(manifest.databases.map((database) => database.name)).toEqual([
      "toonspectrum-edge-index", "toonspectrum-analytics-buffer",
    ]);
    expect(manifest.databases[0].expectedSchema.some((entry) => entry.name === "edge_catalog_sort_idx")).toBe(true);
  });

  it("v1 SQL 해시를 보존하고 로컬 SQLite에서 v2 계획과 새 baseline이 일치한다", () => {
    const definition = loadCloudflareFreeDataPlaneManifest().databases[1];
    expect(definition.migrationId).toBe("analytics-buffer-v2");
    expect(definition.upgrade.from.sha256).toBe("5fca80a5d267e9433224702f4f382a0a43df6184ab30670867e92609f31f85b3");
    const removed = definition.upgrade.from.expectedSchema.filter((entry) =>
      !definition.expectedSchema.some((current) => current.name === entry.name));
    expect(removed).toHaveLength(6);
    expect(removed.every((entry) => entry.type === "index")).toBe(true);
    expect(new Set(definition.upgrade.statements)).toEqual(new Set(removed.map((entry) => `DROP INDEX ${entry.name}`)));
    const sqlite = new DatabaseSync(":memory:"); openDatabases.push(sqlite);
    sqlite.exec(definition.upgrade.from.sql);
    sqlite.exec(definition.upgrade.statements.join(";"));
    expect(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name LIKE 'traffic_%'").all()).toHaveLength(5);
  });

  it("실제 소비자가 있는 analytics DB 하나만 선택해 생성한다", async () => {
    expect(parseCloudflareFreeDataPlaneArguments(["--apply", "--database=analytics-buffer"]))
      .toEqual({ mode: "apply", database: "analytics-buffer" });
    const api = fakeCloudflare();
    const options = { environment, fetchImpl: api.fetchImpl, database: "analytics-buffer" };
    const result = await provisionCloudflareFreeDataPlane("apply", options);
    expect(result.databases.map((entry) => entry.name)).toEqual(["toonspectrum-analytics-buffer"]);
    expect(api.databases.size).toBe(1);
    const sqlite = [...api.databases.values()][0].sqlite;
    expect(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'traffic_%'")
      .all()).toHaveLength(4);
    expect(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'traffic_%'")
      .all()).toHaveLength(2);
    expect(sqlite.prepare("SELECT migration_id FROM _toonspectrum_d1_migration").get().migration_id).toBe("analytics-buffer-v2");
    await provisionCloudflareFreeDataPlane("check", options);
  });

  it.each(["check", "apply"])("v1을 %s할 때 묵시적으로 업그레이드하지 않는다", async (mode) => {
    const api = fakeCloudflare(); installAnalyticsV1(api);
    await expect(provisionCloudflareFreeDataPlane(mode, {
      environment, fetchImpl: api.fetchImpl, database: "analytics-buffer",
    })).rejects.toThrow("--upgrade");
    expect(writes(api.calls)).toHaveLength(0);
  });

  it("검증한 v1만 원자 batch 한 번으로 v2로 바꾸며 데이터는 유지한다", async () => {
    const api = fakeCloudflare(); const { database, definition } = installAnalyticsV1(api);
    const options = { environment, fetchImpl: api.fetchImpl, database: "analytics-buffer" };
    const result = await provisionCloudflareFreeDataPlane("upgrade", options);
    expect(result.databases[0]).toMatchObject({ created: false, upgraded: true,
      migrationId: "analytics-buffer-v2", schemaSha256: definition.sha256 });
    expect(writes(api.calls)).toHaveLength(1);
    expect(writes(api.calls)[0].body.batch).toHaveLength(8);
    expect(writes(api.calls)[0].body.batch.slice(1, 7).map((entry) => entry.sql)).toEqual(definition.upgrade.statements);
    expect(database.sqlite.prepare("SELECT lease_token FROM traffic_analytics_maintenance").get().lease_token).toBe("local-validation");
    const calls = api.calls.length;
    await provisionCloudflareFreeDataPlane("check", options);
    const again = await provisionCloudflareFreeDataPlane("upgrade", options);
    expect(again.databases[0].upgraded).toBe(false);
    expect(writes(api.calls.slice(calls))).toHaveLength(0);
  });

  it.each(["schema", "checkpoint"])("v1의 전체 %s가 달라지면 upgrade도 쓰지 않는다", async (kind) => {
    const api = fakeCloudflare(); const { database } = installAnalyticsV1(api);
    database.sqlite.exec(kind === "schema" ? "CREATE TABLE unexpected_table (id TEXT)"
      : "UPDATE _toonspectrum_d1_migration SET schema_sha256 = 'stale'");
    await expect(provisionCloudflareFreeDataPlane("upgrade", {
      environment, fetchImpl: api.fetchImpl, database: "analytics-buffer",
    })).rejects.toThrow(kind === "schema" ? "schema가 manifest와" : "migration checkpoint");
    expect(writes(api.calls)).toHaveLength(0);
  });

  it.each(["index", "checkpoint"])("%s 변경이 실패하면 앞선 DDL과 checkpoint를 모두 롤백한다", async (stage) => {
    const api = fakeCloudflare(); const { database } = installAnalyticsV1(api);
    const before = schemaRows(database.sqlite);
    const checkpoint = database.sqlite.prepare("SELECT * FROM _toonspectrum_d1_migration").all();
    const fetchImpl = (url, options) => {
      const body = options.body ? JSON.parse(options.body) : null;
      if (body?.batch) {
        if (stage === "index") body.batch[3] = { sql: "DROP INDEX missing_index_for_rollback_validation" };
        else body.batch[body.batch.length - 1] = { sql: "UPDATE _toonspectrum_d1_migration SET schema_sha256 = NULL" };
        return api.fetchImpl(url, { ...options, body: JSON.stringify(body) });
      }
      return api.fetchImpl(url, options);
    };
    await expect(provisionCloudflareFreeDataPlane("upgrade", {
      environment, fetchImpl, database: "analytics-buffer",
    })).rejects.toThrow("자동 재시도하지 않았습니다");
    expect(schemaRows(database.sqlite)).toEqual(before);
    expect(database.sqlite.prepare("SELECT * FROM _toonspectrum_d1_migration").all()).toEqual(checkpoint);
    expect(writes(api.calls)).toHaveLength(1);
  });

  it.each([
    "DELETE FROM _toonspectrum_d1_migration",
    "UPDATE _toonspectrum_d1_migration SET schema_sha256 = 'stale'",
    "INSERT INTO _toonspectrum_d1_migration VALUES ('unexpected', 'other', 'stale', CURRENT_TIMESTAMP)",
  ])("사전 조회 후 checkpoint가 달라져도 batch 안에서 중단한다", async (staleSql) => {
    const api = fakeCloudflare(); const { database } = installAnalyticsV1(api);
    const before = schemaRows(database.sqlite);
    const fetchImpl = (url, options) => {
      if (options.body && JSON.parse(options.body).batch) database.sqlite.exec(staleSql);
      return api.fetchImpl(url, options);
    };
    await expect(provisionCloudflareFreeDataPlane("upgrade", {
      environment, fetchImpl, database: "analytics-buffer",
    })).rejects.toThrow("자동 재시도하지 않았습니다");
    expect(schemaRows(database.sqlite)).toEqual(before);
    expect(writes(api.calls)).toHaveLength(1);
  });

  it("upgrade는 빠진 DB를 생성하지 않으며 적용 확인도 요구한다", async () => {
    const api = fakeCloudflare();
    await expect(provisionCloudflareFreeDataPlane("upgrade", {
      environment: {}, fetchImpl: api.fetchImpl, database: "analytics-buffer",
    })).rejects.toThrow("APPLY-TOONSPECTRUM-CLOUDFLARE-FREE-DATA");
    expect(api.calls).toHaveLength(0);
    await expect(provisionCloudflareFreeDataPlane("upgrade", {
      environment, fetchImpl: api.fetchImpl, database: "analytics-buffer",
    })).rejects.toThrow("DB가 없습니다");
    expect(writes(api.calls)).toHaveLength(0);
  });

  it("적용 확인이나 계정 ID가 없으면 네트워크 호출 전에 거부한다", async () => {
    const api = fakeCloudflare();
    await expect(provisionCloudflareFreeDataPlane("apply", {
      environment: {}, fetchImpl: api.fetchImpl,
    })).rejects.toThrow("APPLY-TOONSPECTRUM-CLOUDFLARE-FREE-DATA");
    await expect(provisionCloudflareFreeDataPlane("check", {
      environment: {}, fetchImpl: api.fetchImpl,
    })).rejects.toThrow("CLOUDFLARE_ACCOUNT_ID");
    expect(api.calls).toHaveLength(0);
  });

  it("처음에는 두 schema를 적용하고 이후 apply/check는 읽기만 한다", async () => {
    const api = fakeCloudflare();
    const options = { environment, fetchImpl: api.fetchImpl, now: NOW };
    const created = await provisionCloudflareFreeDataPlane("apply", options);
    expect(created.databases.map((database) => database.created)).toEqual([true, true]);
    expect(created.accountDatabaseCount).toBe(2);
    expect(writes(api.calls)).toHaveLength(4);
    const previousCalls = api.calls.length;
    const again = await provisionCloudflareFreeDataPlane("apply", options);
    await provisionCloudflareFreeDataPlane("check", options);
    expect(again.databases.every((database) => !database.created)).toBe(true);
    expect(writes(api.calls.slice(previousCalls))).toHaveLength(0);
  });

  it("구독 목록이 비어 있으면 무료 플랜을 추정하지 않는다", async () => {
    const api = fakeCloudflare({ subscriptions: [] });
    await expect(provisionCloudflareFreeDataPlane("apply", {
      environment, fetchImpl: api.fetchImpl, now: NOW,
    })).rejects.toThrow("FREE_PLAN_REVIEW_JSON");
    expect(writes(api.calls)).toHaveLength(0);
  });

  it("플랜 권한 부족 때 해당 계정의 유효한 수동 검토만 허용한다", async () => {
    const api = fakeCloudflare({ deniedPlan: true });
    const result = await provisionCloudflareFreeDataPlane("apply", {
      environment: { ...environment, TOONSPECTRUM_CLOUDFLARE_FREE_PLAN_REVIEW_JSON: review() },
      fetchImpl: api.fetchImpl, now: NOW,
    });
    expect(result.plan.evidence).toBe("explicit-review");
    expect(JSON.stringify(result)).not.toContain(environment.CLOUDFLARE_API_TOKEN);
  });

  it.each([
    { accountId: "b".repeat(32) },
    { checkedAt: "2026-09-24T08:00:00Z" },
    { checkedAt: "2026-09-27T08:00:00Z" },
    { workersPlan: "paid" },
  ])("잘못된 수동 플랜 검토를 거부한다: %j", async (overrides) => {
    const api = fakeCloudflare({ deniedPlan: true });
    await expect(provisionCloudflareFreeDataPlane("apply", {
      environment: { ...environment, TOONSPECTRUM_CLOUDFLARE_FREE_PLAN_REVIEW_JSON: review(overrides) },
      fetchImpl: api.fetchImpl, now: NOW,
    })).rejects.toThrow("FREE_PLAN_REVIEW_JSON");
    expect(writes(api.calls)).toHaveLength(0);
  });

  it("유료 Workers 플랜은 수동 검토 입력으로 우회하지 못한다", async () => {
    const api = fakeCloudflare({ subscriptions: [{ rate_plan: { id: "WORKERS_PAID" }, price: 5 }] });
    await expect(provisionCloudflareFreeDataPlane("apply", {
      environment: { ...environment, TOONSPECTRUM_CLOUDFLARE_FREE_PLAN_REVIEW_JSON: review() },
      fetchImpl: api.fetchImpl, now: NOW,
    })).rejects.toThrow("Workers 유료");
    expect(writes(api.calls)).toHaveLength(0);
  });

  it("뒤쪽 DB에 이름 충돌이 있어도 앞쪽 DB를 먼저 생성하지 않는다", async () => {
    const api = fakeCloudflare();
    api.addDatabase("toonspectrum-analytics-buffer", "CREATE TABLE private_data (value TEXT)");
    await expect(provisionCloudflareFreeDataPlane("apply", {
      environment, fetchImpl: api.fetchImpl,
    })).rejects.toThrow("소유권 checkpoint 없는 동명 DB");
    expect(writes(api.calls)).toHaveLength(0);
  });

  it("빈 동명 DB도 소유권 증거 없이 인수하지 않는다", async () => {
    const api = fakeCloudflare();
    api.addDatabase("toonspectrum-edge-index");
    await expect(provisionCloudflareFreeDataPlane("apply", {
      environment, fetchImpl: api.fetchImpl,
    })).rejects.toThrow("소유권 checkpoint 없는 동명 DB");
    expect(writes(api.calls)).toHaveLength(0);
  });

  it.each(["schema", "checkpoint"])("기존 %s가 달라지면 SQL을 재적용하지 않는다", async (kind) => {
    const api = fakeCloudflare();
    const options = { environment, fetchImpl: api.fetchImpl };
    await provisionCloudflareFreeDataPlane("apply", options);
    const database = [...api.databases.values()][0];
    database.sqlite.exec(kind === "schema"
      ? "DROP INDEX edge_catalog_sort_idx"
      : "UPDATE _toonspectrum_d1_migration SET schema_sha256 = 'changed'");
    const previousCalls = api.calls.length;
    await expect(provisionCloudflareFreeDataPlane("apply", options)).rejects.toThrow(
      kind === "schema" ? "schema가 manifest와" : "migration checkpoint",
    );
    expect(writes(api.calls.slice(previousCalls))).toHaveLength(0);
  });

  it("계정의 다른 DB도 Free DB 개수 한도에 포함한다", async () => {
    const api = fakeCloudflare();
    for (let index = 0; index < 9; index += 1) api.addDatabase(`other-${index}`);
    await expect(provisionCloudflareFreeDataPlane("apply", {
      environment, fetchImpl: api.fetchImpl,
    })).rejects.toThrow("계정 공유 D1 Free DB 개수 한도");
    expect(writes(api.calls)).toHaveLength(0);
  });

  it("기존 DB 저장량을 확인할 수 없으면 생성하지 않는다", async () => {
    const api = fakeCloudflare();
    api.addDatabase("other").file_size = undefined;
    await expect(provisionCloudflareFreeDataPlane("apply", {
      environment, fetchImpl: api.fetchImpl,
    })).rejects.toThrow("Free 한도 검증");
    expect(writes(api.calls)).toHaveLength(0);
  });

  it("네트워크 실패 시 생성 재시도나 공급자 오류의 토큰 출력을 하지 않는다", async () => {
    const api = fakeCloudflare();
    let attemptedCreates = 0;
    const fetchImpl = async (url, options) => {
      if (options.method === "POST" && url.endsWith("/d1/database")) {
        attemptedCreates += 1;
        throw new Error(`sensitive ${environment.CLOUDFLARE_API_TOKEN}`);
      }
      return api.fetchImpl(url, options);
    };
    let failure;
    try {
      await provisionCloudflareFreeDataPlane("apply", { environment, fetchImpl });
    } catch (error) {
      failure = error;
    }
    expect(failure.message).toContain("자동 재시도하지 않았습니다");
    expect(failure.message).not.toContain(environment.CLOUDFLARE_API_TOKEN);
    expect(attemptedCreates).toBe(1);
  });

  it("check는 누락 DB를 생성하지 않는다", async () => {
    const api = fakeCloudflare();
    await expect(provisionCloudflareFreeDataPlane("check", {
      environment, fetchImpl: api.fetchImpl,
    })).rejects.toThrow("DB가 없습니다");
    expect(writes(api.calls)).toHaveLength(0);
  });
});
