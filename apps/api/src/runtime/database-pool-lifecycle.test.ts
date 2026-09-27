import { readFileSync } from "node:fs";

import { Global, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabasePoolLifecycle, DatabasePoolShutdownTimeoutError } from "./database-pool-lifecycle";

afterEach(() => vi.useRealTimers());

describe("주 DB 풀 종료", () => {
  it("반복 호출에서 end를 정확히 한 번 실행한다", async () => {
    const pool = { end: vi.fn().mockResolvedValue(undefined) };
    const lifecycle = new DatabasePoolLifecycle(pool, 1_000);
    const first = lifecycle.onApplicationShutdown();
    expect(lifecycle.onApplicationShutdown()).toBe(first);
    await first;
    await lifecycle.onApplicationShutdown();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it("연결 반납을 기다리고 성공하면 타이머를 정리한다", async () => {
    vi.useFakeTimers();
    let complete: (() => void) | undefined;
    const pool = { end: () => new Promise<void>((resolve) => { complete = resolve; }) };
    const lifecycle = new DatabasePoolLifecycle(pool, 1_000);
    const pending = lifecycle.onApplicationShutdown();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);
    complete?.();
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("반납되지 않는 연결을 무한 대기하지 않고 실패로 보고한다", async () => {
    vi.useFakeTimers();
    const lifecycle = new DatabasePoolLifecycle({ end: () => new Promise<void>(() => {}) }, 1_000);
    const pending = lifecycle.onApplicationShutdown();
    const assertion = expect(pending).rejects.toBeInstanceOf(DatabasePoolShutdownTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(lifecycle.onApplicationShutdown()).toBe(pending);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("실패는 전파하되 원본 드라이버 메시지와 cause는 제외한다", async () => {
    const privateMessage = "database connection contains private credentials";
    const lifecycle = new DatabasePoolLifecycle({ end: () => Promise.reject(new Error(privateMessage)) }, 1_000);
    const error = await lifecycle.onApplicationShutdown().catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("DB 풀 종료에 실패");
    expect(String(error)).not.toContain(privateMessage);
    expect(error).not.toHaveProperty("cause");
  });

  it("동기 오류도 안전한 종료 실패로 변환한다", async () => {
    const lifecycle = new DatabasePoolLifecycle({ end: () => { throw new Error("private connection"); } }, 1_000);
    await expect(lifecycle.onApplicationShutdown()).rejects.toThrow("DB 풀 종료에 실패");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("잘못된 제한 시간 %s를 거부한다", (timeout) => {
    expect(() => new DatabasePoolLifecycle({ end: async () => {} }, timeout)).toThrow("양수");
  });

  it("Core API의 HTTP 종료 이후 훅에만 연결한다", () => {
    const runtime = readFileSync(new URL("./database-pool-lifecycle.ts", import.meta.url), "utf8");
    const app = readFileSync(new URL("../app.module.ts", import.meta.url), "utf8");
    const worker = readFileSync(new URL("../capability-worker-app.module.ts", import.meta.url), "utf8");
    expect(runtime).toContain("implements OnApplicationShutdown");
    expect(runtime).not.toContain("onModuleDestroy");
    expect(runtime).not.toContain("beforeApplicationShutdown");
    expect(app).toContain("DatabaseLifecycleModule");
    expect(worker).not.toContain("DatabaseLifecycleModule");
  });
});

it("실제 Nest 종료에서 하위 모듈 정리 후 전역 DB 풀을 닫는다", async () => {
  const order: string[] = [];
  class ChildModule {}
  Module({ providers: [{ provide: "child-cleanup", useValue: {
    onApplicationShutdown: async () => { order.push("child"); },
  } }] })(ChildModule);
  class DatabaseModule {}
  Global()(DatabaseModule);
  Module({ providers: [{
    provide: DatabasePoolLifecycle,
    useFactory: () => new DatabasePoolLifecycle({ end: async () => { order.push("pool"); } }, 1_000),
  }] })(DatabaseModule);
  class RootModule {}
  Module({ imports: [DatabaseModule, ChildModule] })(RootModule);
  const app = await NestFactory.createApplicationContext(RootModule, { logger: false });
  await app.close();
  expect(order).toEqual(["child", "pool"]);
});
