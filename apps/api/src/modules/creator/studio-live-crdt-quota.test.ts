import { describe, expect, it } from "vitest";

import { StudioLiveCrdtQuotaLimiter } from "./studio-live-crdt-quota";

describe("StudioLiveCrdtQuotaLimiter", () => {
  it("shares the default sync budget by user and work across reconstructed scopes", () => {
    let now = 1_000_000;
    const limiter = new StudioLiveCrdtQuotaLimiter({ now: () => now });
    const sharedScope = { userId: "artist-1", workId: "work-1" };

    for (let request = 0; request < 30; request += 1) {
      expect(limiter.consumeSync(sharedScope)).toBe(true);
    }
    expect(limiter.consumeSync({ ...sharedScope })).toBe(false);
    expect(limiter.consumeSync({ userId: "artist-1", workId: "work-2" })).toBe(
      true
    );
    expect(limiter.consumeSync({ userId: "artist-2", workId: "work-1" })).toBe(
      true
    );

    now += 60_000;
    expect(limiter.consumeSync({ ...sharedScope })).toBe(true);
  });

  it("refills operation tokens without spending byte tokens on rejected updates", () => {
    let now = 2_000_000;
    const limiter = new StudioLiveCrdtQuotaLimiter({
      now: () => now,
      operationBurst: 1,
      operationsPerSecond: 1,
      byteBurst: 10,
      bytesPerSecond: 0,
    });
    const scope = { userId: "artist", workId: "operation-limited" };

    expect(limiter.consumeUpdate(scope, 6)).toBe(true);
    expect(limiter.consumeUpdate({ ...scope }, 3)).toBe(false);
    now += 999;
    expect(limiter.consumeUpdate({ ...scope }, 4)).toBe(false);
    now += 1;
    expect(limiter.consumeUpdate({ ...scope }, 4)).toBe(true);
  });

  it("refills byte tokens without spending operation tokens on rejected updates", () => {
    let now = 3_000_000;
    const limiter = new StudioLiveCrdtQuotaLimiter({
      now: () => now,
      operationBurst: 2,
      operationsPerSecond: 0,
      byteBurst: 10,
      bytesPerSecond: 5,
    });
    const scope = { userId: "artist", workId: "byte-limited" };

    expect(limiter.consumeUpdate(scope, 8)).toBe(true);
    expect(limiter.consumeUpdate({ ...scope }, 3)).toBe(false);
    now += 199;
    expect(limiter.consumeUpdate({ ...scope }, 3)).toBe(false);
    now += 1;
    expect(limiter.consumeUpdate({ ...scope }, 3)).toBe(true);
  });

  it("fails closed at 4,096 sync and update scopes without evicting existing budgets", () => {
    const limiter = new StudioLiveCrdtQuotaLimiter({ now: () => 4_000_000 });

    for (let index = 0; index < 4_096; index += 1) {
      const scope = { userId: `artist-${index}`, workId: "work" };
      expect(limiter.consumeSync(scope)).toBe(true);
      expect(limiter.consumeUpdate(scope, 1)).toBe(true);
    }

    const overflowScope = { userId: "overflow", workId: "work" };
    expect(limiter.consumeSync(overflowScope)).toBe(false);
    expect(limiter.consumeUpdate(overflowScope, 1)).toBe(false);
    expect(limiter.consumeSync({ userId: "artist-0", workId: "work" })).toBe(
      true
    );
    expect(
      limiter.consumeUpdate({ userId: "artist-0", workId: "work" }, 1)
    ).toBe(true);
  });

  it("waits for the cleanup cadence before purging expired sync and idle update scopes", () => {
    let now = 5_000_000;
    const limiter = new StudioLiveCrdtQuotaLimiter({
      now: () => now,
      syncWindowMs: 50,
      bucketLimit: 2,
      cleanupIntervalMs: 100,
      idleTtlMs: 50,
    });
    const first = { userId: "first", workId: "work" };
    const second = { userId: "second", workId: "work" };
    const replacement = { userId: "replacement", workId: "work" };

    expect(limiter.consumeSync(first)).toBe(true);
    expect(limiter.consumeSync(second)).toBe(true);
    expect(limiter.consumeUpdate(first, 1)).toBe(true);
    expect(limiter.consumeUpdate(second, 1)).toBe(true);

    now += 50;
    expect(limiter.consumeSync(replacement)).toBe(false);
    expect(limiter.consumeUpdate(replacement, 1)).toBe(false);

    now += 50;
    expect(limiter.consumeSync(replacement)).toBe(true);
    expect(limiter.consumeUpdate(replacement, 1)).toBe(true);
  });

  it("clears both budgets and resets cleanup bookkeeping", () => {
    let now = 6_000_000;
    const limiter = new StudioLiveCrdtQuotaLimiter({
      now: () => now,
      bucketLimit: 1,
      cleanupIntervalMs: 10_000,
      idleTtlMs: 1,
    });
    const first = { userId: "first", workId: "work" };
    const replacement = { userId: "replacement", workId: "work" };

    expect(limiter.consumeSync(first)).toBe(true);
    expect(limiter.consumeUpdate(first, 1)).toBe(true);
    expect(limiter.consumeSync(replacement)).toBe(false);
    expect(limiter.consumeUpdate(replacement, 1)).toBe(false);

    limiter.clear();
    now += 1;

    expect(limiter.consumeSync(replacement)).toBe(true);
    expect(limiter.consumeUpdate(replacement, 1)).toBe(true);

    now += 9_999;
    expect(
      limiter.consumeUpdate({ userId: "after-clear", workId: "work" }, 1)
    ).toBe(false);
    now += 1;
    expect(
      limiter.consumeUpdate({ userId: "after-clear", workId: "work" }, 1)
    ).toBe(true);
  });

  it("rejects invalid decoded byte counts without allocating a scope", () => {
    const limiter = new StudioLiveCrdtQuotaLimiter({
      now: () => 7_000_000,
      bucketLimit: 1,
    });

    expect(
      limiter.consumeUpdate({ userId: "invalid", workId: "work" }, Number.NaN)
    ).toBe(false);
    expect(limiter.consumeUpdate({ userId: "invalid", workId: "work" }, -1)).toBe(
      false
    );
    expect(limiter.consumeUpdate({ userId: "valid", workId: "work" }, 1)).toBe(
      true
    );
  });
});
