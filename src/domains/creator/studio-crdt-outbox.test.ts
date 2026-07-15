import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IndexedDbStudioCrdtOutbox,
  SerializedStudioCrdtOutbox,
  type StudioCrdtOutbox,
} from "./studio-crdt-outbox";
import {
  STUDIO_CRDT_PROTOCOL_VERSION,
  encodeStudioCrdtUpdate,
  type StudioCrdtUpdateRequest,
} from "./studio-crdt-protocol";

function request(workId: string, updateId: string): StudioCrdtUpdateRequest {
  return {
    protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
    workId,
    updateId,
    clientSequence: 1,
    update: encodeStudioCrdtUpdate(new Uint8Array([0, 0])),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Studio CRDT durable outbox", () => {
  it("retains a same-page emergency copy when IndexedDB is unavailable", async () => {
    const outbox = new SerializedStudioCrdtOutbox(new IndexedDbStudioCrdtOutbox());
    const scope = "memory-user-a";
    const workId = "memory-work-a";
    const pending = request(workId, "11111111-1111-4111-8111-111111111111");

    await expect(outbox.put(scope, pending)).rejects.toThrow("IndexedDB");
    await expect(outbox.list(scope, workId)).resolves.toEqual([pending]);

    await outbox.remove(scope, workId, pending.updateId);
    expect(outbox.listEmergency(scope, workId)).toEqual([]);
  });

  it("makes a replacement binding list wait for the previous binding's final put", async () => {
    const stored = new Map<string, StudioCrdtUpdateRequest>();
    let signalPutStarted: () => void = () => undefined;
    const putStarted = new Promise<void>((resolve) => {
      signalPutStarted = resolve;
    });
    let releasePut: () => void = () => undefined;
    const putGate = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    let listCalls = 0;
    const delegate: StudioCrdtOutbox = {
      async list(_scope, workId) {
        listCalls += 1;
        return [...stored.values()].filter((value) => value.workId === workId);
      },
      async put(_scope, value) {
        signalPutStarted();
        await putGate;
        stored.set(value.updateId, value);
      },
      async remove(_scope, _workId, updateId) {
        stored.delete(updateId);
      },
    };
    const previous = new SerializedStudioCrdtOutbox(delegate);
    const replacement = new SerializedStudioCrdtOutbox(delegate);
    const pending = request("barrier-work-a", "22222222-2222-4222-8222-222222222222");

    const writing = previous.put("barrier-user-a", pending);
    await putStarted;
    const listing = replacement.list("barrier-user-a", pending.workId);
    await Promise.resolve();

    expect(listCalls).toBe(0);
    releasePut();
    await writing;
    await expect(listing).resolves.toEqual([pending]);
    expect(listCalls).toBe(1);
  });

  it("releases the scoped queue when an IndexedDB operation never settles", async () => {
    let listCalls = 0;
    const delegate: StudioCrdtOutbox = {
      async list() {
        listCalls += 1;
        return [];
      },
      put: () => new Promise<void>(() => undefined),
      async remove() {
        return undefined;
      },
    };
    const previous = new SerializedStudioCrdtOutbox(delegate, { timeoutMs: 100 });
    const replacement = new SerializedStudioCrdtOutbox(delegate, { timeoutMs: 100 });
    const pending = request("timeout-work-a", "33333333-3333-4333-8333-333333333333");

    const writing = previous.put("timeout-user-a", pending);
    const listing = replacement.list("timeout-user-a", pending.workId);

    await expect(writing).rejects.toThrow("시간이 초과");
    await expect(listing).rejects.toThrow("복구 대기");
    expect(listCalls).toBe(0);
  });

  it("returns the emergency snapshot when an IndexedDB list never settles", async () => {
    const pending = request("emergency-work-a", "44444444-4444-4444-8444-444444444444");
    const delegate: StudioCrdtOutbox = {
      list: () => new Promise<StudioCrdtUpdateRequest[]>(() => undefined),
      listEmergency: () => [pending],
      async put() {
        return undefined;
      },
      async remove() {
        return undefined;
      },
    };
    const outbox = new SerializedStudioCrdtOutbox(delegate, { timeoutMs: 100 });

    await expect(outbox.list("emergency-user-a", pending.workId)).resolves.toEqual([pending]);
  });

  it("opens a circuit after one timeout instead of charging every queued put a timeout", async () => {
    vi.useFakeTimers();
    const emergency = new Map<string, StudioCrdtUpdateRequest>();
    let delegatePutCalls = 0;
    const delegate: StudioCrdtOutbox = {
      async list() {
        throw new Error("The open circuit must use the emergency snapshot.");
      },
      listEmergency: () => [...emergency.values()],
      putEmergency: (_scope, value) => {
        emergency.set(value.updateId, value);
      },
      put: () => {
        delegatePutCalls += 1;
        return new Promise<void>(() => undefined);
      },
      removeEmergency: (_scope, _workId, updateId) => {
        emergency.delete(updateId);
      },
      async remove() {
        return undefined;
      },
    };
    const outbox = new SerializedStudioCrdtOutbox(delegate, { timeoutMs: 100 });
    const writes = Array.from({ length: 20 }, (_, index) => {
      const suffix = String(index + 10).padStart(12, "0");
      return outbox.put(
        "circuit-user-a",
        request("circuit-work-a", `55555555-5555-4555-8555-${suffix}`)
      );
    });

    await vi.advanceTimersByTimeAsync(100);
    const results = await Promise.allSettled(writes);

    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(delegatePutCalls).toBe(1);
    await expect(outbox.list("circuit-user-a", "circuit-work-a")).resolves.toHaveLength(20);
  });
});
