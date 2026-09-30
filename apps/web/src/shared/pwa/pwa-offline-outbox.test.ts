// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryOutboxStorage,
  PwaOfflineOutbox,
  PwaOutboxConflictError,
} from "./pwa-offline-outbox";

describe("pwa-offline-outbox", () => {
  let outbox: PwaOfflineOutbox;
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    outbox = new PwaOfflineOutbox(createMemoryOutboxStorage(), () => now);
  });

  it("오프라인 작업을 큐에 쌓는다", () => {
    const item = outbox.enqueue("note", "에피소드 3 메모", { text: "hello" });
    expect(item.status).toBe("queued");
    expect(item.attempts).toBe(0);
    expect(outbox.pending()).toHaveLength(1);
  });

  it("동기화 성공 시 큐에서 제거한다", async () => {
    outbox.enqueue("note", "메모", { text: "a" });
    outbox.enqueue("comment", "댓글", { text: "b" });
    const progress: Array<[number, number]> = [];
    const report = await outbox.syncAll(
      async () => undefined,
      (done, total) => {
        progress.push([done, total]);
      },
    );
    expect(report).toMatchObject({ synced: 2, failed: 0, conflicted: 0, remaining: 0 });
    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(outbox.list()).toHaveLength(0);
  });

  it("실패 시 failed로 두고 attempts를 올린다", async () => {
    outbox.enqueue("note", "메모", { text: "a" });
    const report = await outbox.syncAll(async () => {
      throw new Error("network down");
    });
    expect(report.failed).toBe(1);
    const [item] = outbox.pending();
    expect(item.status).toBe("failed");
    expect(item.attempts).toBe(1);
    expect(item.lastError).toBe("network down");
  });

  it("충돌 시 conflicted 상태로 두고 양쪽 시간을 보관한다", async () => {
    outbox.enqueue("note", "메모", { text: "a" });
    const report = await outbox.syncAll(async () => {
      throw new PwaOutboxConflictError(2_000_000, "서버 버전");
    });
    expect(report.conflicted).toBe(1);
    const [item] = outbox.list();
    expect(item.status).toBe("conflicted");
    expect(item.conflict?.remoteUpdatedAt).toBe(2_000_000);
    expect(item.conflict?.remoteLabel).toBe("서버 버전");
  });

  it("'내 것 유지'를 선택하면 다시 큐에 들어간다", async () => {
    outbox.enqueue("note", "메모", { text: "a" });
    await outbox.syncAll(async () => {
      throw new PwaOutboxConflictError(2_000_000);
    });
    const [conflicted] = outbox.list();
    outbox.resolveConflict(conflicted.id, "mine");
    const [queued] = outbox.pending();
    expect(queued.status).toBe("queued");
    expect(queued.attempts).toBe(0);
    expect(queued.conflict).toBeUndefined();
  });

  it("'서버 것 사용'을 선택하면 항목을 버린다", async () => {
    outbox.enqueue("note", "메모", { text: "a" });
    await outbox.syncAll(async () => {
      throw new PwaOutboxConflictError(2_000_000);
    });
    const [conflicted] = outbox.list();
    outbox.resolveConflict(conflicted.id, "theirs");
    expect(outbox.list()).toHaveLength(0);
  });

  it("구독자에게 상태 변화를 알린다", () => {
    const listener = vi.fn();
    const unsubscribe = outbox.subscribe(listener);
    outbox.enqueue("note", "메모", {});
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    outbox.enqueue("note", "메모2", {});
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("5회 실패하면 루프를 중단한다", async () => {
    outbox.enqueue("note", "메모", {});
    for (let i = 0; i < 6; i += 1) {
      await outbox.syncAll(async () => {
        throw new Error("down");
      });
    }
    const [item] = outbox.list();
    expect(item.attempts).toBe(5);
  });
});
