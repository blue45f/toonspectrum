import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleAnalyticsRequest, type AnalyticsEnvironment } from "../../../../../deploy/cloudflare-analytics/src/index";
import { TrafficAnalyticsController } from "./traffic-analytics.controller";
import { TrafficD1HttpExecutor } from "./traffic-analytics-d1.client";
import { D1TrafficAnalyticsRepository } from "./traffic-analytics-d1.repository";
import { TrafficAnalyticsService } from "./traffic-analytics.service";

import type { Request as ExpressRequest } from "express";

type SqlValue = string | number | null;
const schema = readFileSync(new URL("../../../../../deploy/federated-data-plane/d1/traffic-analytics.sql", import.meta.url), "utf8");
const fixtures: Array<{ database: DatabaseSync; cleanup: Promise<void>[] }> = [];

function fixture() {
  const database = new DatabaseSync(":memory:");
  database.exec(schema);
  const cleanup: Promise<void>[] = [];
  fixtures.push({ database, cleanup });
  vi.stubEnv("TRAFFIC_ANALYTICS_HASH_SECRET", "local-share-contract-hash-fixture");
  class PreparedStatement {
    constructor(readonly sql: string, readonly params: SqlValue[] = []) {}
    bind(...params: SqlValue[]) { return new PreparedStatement(this.sql, params); }
    all() {
      const statement = database.prepare(this.sql);
      return /\?\d/u.test(this.sql)
        ? statement.all(Object.fromEntries(this.params.map((value, index) => [String(index + 1), value])))
        : statement.all(...this.params);
    }
  }
  const environment: AnalyticsEnvironment = {
    ANALYTICS_RPC_TOKEN: "local-share-contract-rpc-fixture-only",
    ANALYTICS_DB: {
      prepare: (sql) => new PreparedStatement(sql),
      async batch(statements) {
        database.exec("BEGIN");
        try {
          const results = statements.map((statement) => {
            if (!(statement instanceof PreparedStatement)) throw new Error("알 수 없는 SQL fixture");
            return { success: true, results: statement.all(), meta: {} };
          });
          database.exec("COMMIT");
          return results;
        } catch (error) { database.exec("ROLLBACK"); throw error; }
      },
    },
  };
  const network = vi.fn<typeof fetch>((url, init) => handleAnalyticsRequest(new Request(url, init), environment));
  const repository = new D1TrafficAnalyticsRepository(new TrafficD1HttpExecutor({
    url: "https://analytics.example/query", token: environment.ANALYTICS_RPC_TOKEN, timeoutMs: 5_000,
  }, network));
  const retention = repository.cleanup.bind(repository);
  vi.spyOn(repository, "cleanup").mockImplementation((...args) => {
    const pending = retention(...args);
    cleanup.push(pending);
    return pending;
  });
  const controller = new TrafficAnalyticsController(new TrafficAnalyticsService(repository));
  const request = {
    headers: { host: "www.toonstudio.cloud", origin: "https://www.toonstudio.cloud", "user-agent": "Mozilla/5.0 Chrome/140.0.0.0" },
  } as ExpressRequest;
  return { database, repository, controller, request, network, cleanup };
}

afterEach(async () => {
  for (const { database, cleanup } of fixtures.splice(0)) {
    await Promise.allSettled(cleanup);
    database.close();
  }
  vi.unstubAllEnvs();
});

const identifiers = { visitorId: "visitor_share_contract_01", sessionId: "session_share_contract_01" };

describe("공유 수집 API와 Worker SQLite 저장 계약", () => {
  it("브라우저의 path와 네 결과를 저장하고 기존 success를 completed로 집계한다", async () => {
    const { database, repository, controller, request, cleanup } = fixture();
    const start = new Date(Date.now() - 60_000);
    for (const outcome of ["opened", "completed", "cancelled", "failed"] as const) {
      await expect(controller.recordShareEvent(request, "1", {
        ...identifiers, path: "/library", channel: "copy", outcome,
      })).resolves.toEqual({ accepted: true });
    }
    await expect(controller.recordShareEvent(request, "1", {
      ...identifiers, sourcePath: "/library?private=value#ignored", channel: "copy", outcome: "success",
    })).resolves.toEqual({ accepted: true });
    await Promise.all(cleanup);
    expect(database.prepare("SELECT path, outcome FROM traffic_share_event ORDER BY outcome").all()).toEqual([
      { path: "/library", outcome: "cancelled" },
      { path: "/library", outcome: "completed" },
      { path: "/library", outcome: "completed" },
      { path: "/library", outcome: "failed" },
      { path: "/library", outcome: "opened" },
    ]);
    const report = await repository.overview({ start, now: new Date(), days: 1, bucketSeconds: 3600, retentionDays: 90 });
    expect(report.sharing).toMatchObject({ attempts: 5, completed: 2, opened: 1, failed: 1, cancelled: 1 });
  });

  it("두 경로는 정규화 후 같을 때만 허용하고 잘못된 결과는 DB에 전달하지 않는다", async () => {
    const { controller, request, network, cleanup } = fixture();
    const payload = { ...identifiers, path: "/library?private=1", sourcePath: "/library#private", channel: "copy", outcome: "completed" };
    await expect(controller.recordShareEvent(request, "1", payload)).resolves.toEqual({ accepted: true });
    await Promise.all(cleanup);
    const calls = network.mock.calls.length;
    await expect(controller.recordShareEvent(request, "1", { ...payload, sourcePath: "/other" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.recordShareEvent(request, "1", { ...payload, outcome: "unknown" })).rejects.toBeInstanceOf(BadRequestException);
    expect(network).toHaveBeenCalledTimes(calls);
  });

  it.each(["dnt", "sec-gpc"])("%s 거부 신호가 있으면 공유를 저장하지 않는다", async (header) => {
    const { controller, request, network } = fixture();
    request.headers[header] = "1";
    await expect(controller.recordShareEvent(request, "1", {
      ...identifiers, path: "/library", channel: "copy", outcome: "completed",
    })).resolves.toEqual({ accepted: false, excluded: true });
    expect(network).not.toHaveBeenCalled();
  });

  it("Worker 저장 실패를 성공으로 응답하거나 자동 재실행하지 않는다", async () => {
    const { database, controller, request, network } = fixture();
    database.exec("CREATE TRIGGER fail_share BEFORE INSERT ON traffic_share_event BEGIN SELECT RAISE(ABORT, 'fixture_failure'); END");
    await expect(controller.recordShareEvent(request, "1", {
      ...identifiers, path: "/library", channel: "copy", outcome: "completed",
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(network).toHaveBeenCalledTimes(1);
    expect(database.prepare("SELECT count(*) AS count FROM traffic_share_event").get()?.count).toBe(0);
  });
});
