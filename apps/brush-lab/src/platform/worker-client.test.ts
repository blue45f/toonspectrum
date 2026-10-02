import { describe, expect, it } from "vitest";

import { GalleryWorkerClient } from "./worker-client";

import type { GalleryRenderRequestMessage, GalleryRenderResponseMessage, WorkerLike } from "./worker-client";

/** 메시지를 기록하고 테스트가 응답을 주입하는 모의 Worker. */
class MockWorker implements WorkerLike {
  readonly sent: GalleryRenderRequestMessage[] = [];
  terminated = false;
  private messageListeners: ((ev: MessageEvent) => void)[] = [];
  private errorListeners: ((ev: ErrorEvent) => void)[] = [];

  postMessage(message: GalleryRenderRequestMessage): void {
    this.sent.push(message);
  }

  addEventListener(type: "message" | "error", listener: ((ev: MessageEvent) => void) | ((ev: ErrorEvent) => void)): void {
    if (type === "message") this.messageListeners.push(listener as (ev: MessageEvent) => void);
    else this.errorListeners.push(listener as (ev: ErrorEvent) => void);
  }

  removeEventListener(type: "message" | "error", listener: ((ev: MessageEvent) => void) | ((ev: ErrorEvent) => void)): void {
    if (type === "message") this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    else this.errorListeners = this.errorListeners.filter((l) => l !== listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(msg: GalleryRenderResponseMessage): void {
    for (const l of this.messageListeners) l({ data: msg } as MessageEvent);
  }

  fail(message: string): void {
    for (const l of this.errorListeners) l({ message } as ErrorEvent);
  }
}

describe("GalleryWorkerClient", () => {
  it("요청 id로 응답을 매칭해 LabImage와 해시를 돌려준다", async () => {
    const worker = new MockWorker();
    const client = new GalleryWorkerClient(worker);
    const p1 = client.render("pencil-hb", "zigzag", 256);
    const p2 = client.render("ink-g-pen", "zigzag", 256);
    expect(worker.sent.map((m) => [m.id, m.presetId])).toEqual([
      [1, "pencil-hb"],
      [2, "ink-g-pen"],
    ]);
    worker.reply({
      type: "result",
      id: 2,
      presetId: "ink-g-pen",
      fixtureId: "zigzag",
      width: 1,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255]),
      pixelHash: "abc",
      renderMs: 3,
      dabCount: 7,
      family: [],
    });
    const r2 = await p2;
    expect(r2.image.width).toBe(1);
    expect(r2.pixelHash).toBe("abc");
    expect(client.pendingCount()).toBe(1);
    worker.reply({ type: "error", id: 1, code: "unknown-preset", message: "없는 프리셋" });
    await expect(p1).rejects.toMatchObject({ code: "unknown-preset", message: "없는 프리셋" });
  });

  it("Worker 오류는 대기 중인 요청 전부를 reject하고(무음 대체 없음) dispose는 terminate한다", async () => {
    const worker = new MockWorker();
    const client = new GalleryWorkerClient(worker);
    const p = client.render("a", "zigzag", 64);
    worker.fail("worker crashed");
    await expect(p).rejects.toMatchObject({ code: "worker-error", message: "worker crashed" });
    client.dispose();
    expect(worker.terminated).toBe(true);
    await expect(client.render("b", "zigzag", 64)).rejects.toMatchObject({ code: "worker-disposed" });
  });
});
