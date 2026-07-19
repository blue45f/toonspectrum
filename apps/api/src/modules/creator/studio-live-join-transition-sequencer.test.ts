import { describe, expect, it, vi } from "vitest";

import { StudioLiveJoinTransitionSequencer } from "./studio-live-join-transition-sequencer";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("StudioLiveJoinTransitionSequencer", () => {
  it("runs transitions for the same socket in FIFO order", async () => {
    const sequencer = new StudioLiveJoinTransitionSequencer();
    const firstGate = deferred<void>();
    const events: string[] = [];
    const first = sequencer.runLatest("socket-1", async () => {
      events.push("first:start");
      await firstGate.promise;
      events.push("first:end");
      return "first";
    });
    const second = sequencer.runLatest("socket-1", async () => {
      events.push("second:start");
      events.push("second:end");
      return "second";
    });

    await vi.waitFor(() => expect(events).toEqual(["first:start"]));
    firstGate.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("allows unrelated sockets to progress in parallel", async () => {
    const sequencer = new StudioLiveJoinTransitionSequencer();
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    const started = new Set<string>();
    const first = sequencer.runLatest("socket-1", async () => {
      started.add("socket-1");
      await firstGate.promise;
    });
    const second = sequencer.runLatest("socket-2", async () => {
      started.add("socket-2");
      await secondGate.promise;
    });

    await vi.waitFor(() => expect(started).toEqual(new Set(["socket-1", "socket-2"])));
    firstGate.resolve();
    secondGate.resolve();
    await Promise.all([first, second]);
  });

  it("marks a running generation stale as soon as a newer request is submitted", async () => {
    const sequencer = new StudioLiveJoinTransitionSequencer();
    const firstGate = deferred<void>();
    let firstGeneration = -1;
    let secondGeneration = -1;
    const first = sequencer.runLatest("socket-1", async (generation) => {
      firstGeneration = generation;
      await firstGate.promise;
      return sequencer.isCurrent("socket-1", generation);
    });
    await vi.waitFor(() => expect(firstGeneration).toBeGreaterThan(0));
    const second = sequencer.runLatest("socket-1", async (generation) => {
      secondGeneration = generation;
      return sequencer.isCurrent("socket-1", generation);
    });

    expect(sequencer.isCurrent("socket-1", firstGeneration)).toBe(false);
    firstGate.resolve();

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(secondGeneration).toBeGreaterThan(firstGeneration);
    expect(sequencer.isCurrent("socket-1", secondGeneration)).toBe(false);
  });

  it("continues the FIFO tail after a rejected transition", async () => {
    const sequencer = new StudioLiveJoinTransitionSequencer();
    const first = sequencer.runLatest("socket-1", async () => {
      throw new Error("adapter join failed");
    });
    const second = sequencer.runLatest("socket-1", async () => "recovered");

    await expect(first).rejects.toThrow("adapter join failed");
    await expect(second).resolves.toBe("recovered");
  });

  it("invalidates one socket without dropping its pending FIFO tail", async () => {
    const sequencer = new StudioLiveJoinTransitionSequencer();
    const firstGate = deferred<void>();
    const events: string[] = [];
    let generation = -1;
    const first = sequencer.runLatest("socket-1", async (value) => {
      generation = value;
      events.push("first:start");
      await firstGate.promise;
      events.push("first:end");
    });
    await vi.waitFor(() => expect(generation).toBeGreaterThan(0));
    sequencer.invalidate("socket-1");
    const second = sequencer.runLatest("socket-1", async () => {
      events.push("second:start");
    });

    expect(sequencer.isCurrent("socket-1", generation)).toBe(false);
    expect(events).toEqual(["first:start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("clears active generations and tails at teardown", async () => {
    const sequencer = new StudioLiveJoinTransitionSequencer();
    const gate = deferred<void>();
    const running = sequencer.runLatest("socket-1", async () => gate.promise);
    const internals = sequencer as unknown as {
      generations: Map<string, number>;
      tails: Map<string, Promise<void>>;
    };
    await vi.waitFor(() => expect(internals.tails.size).toBe(1));

    sequencer.clearAll();

    expect(internals.generations.size).toBe(0);
    expect(internals.tails.size).toBe(0);
    gate.resolve();
    await running;
    expect(internals.generations.size).toBe(0);
    expect(internals.tails.size).toBe(0);
  });

  it("does not let stale tail cleanup remove a newer queued tail", async () => {
    const sequencer = new StudioLiveJoinTransitionSequencer();
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    const events: string[] = [];
    const first = sequencer.runLatest("socket-1", async () => {
      events.push("first:start");
      await firstGate.promise;
      events.push("first:end");
    });
    const second = sequencer.runLatest("socket-1", async () => {
      events.push("second:start");
      await secondGate.promise;
      events.push("second:end");
    });
    await vi.waitFor(() => expect(events).toEqual(["first:start"]));
    firstGate.resolve();
    await vi.waitFor(() => expect(events).toContain("second:start"));

    const third = sequencer.runLatest("socket-1", async () => {
      events.push("third:start");
    });
    await Promise.resolve();
    expect(events).not.toContain("third:start");

    secondGate.resolve();
    await Promise.all([first, second, third]);
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
      "third:start",
    ]);
  });
});
