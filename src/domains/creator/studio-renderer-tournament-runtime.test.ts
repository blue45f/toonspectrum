import { WinnerCache, RemoteKillSwitch } from "@toonspectrum/studio-engine-registry";
import { describe, expect, it } from "vitest";

import {
  STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
  STUDIO_TOURNAMENT_WINNER_STORAGE_KEY,
  computeStudioDeviceHash,
  createLocalStorageTournamentPersistence,
  createStudioTournamentRuntime,
  installDefaultTournamentPersistence,
  parsePersistedTournamentState,
  scheduleShadowSample,
  selectFilterLane,
  type PersistedTournamentStateV1,
  type TournamentPersistencePort,
  type TournamentWinnerStorage,
} from "./studio-renderer-tournament-runtime";

import type { ShadowComparisonReport } from "@toonspectrum/studio-engine-registry";

/**
 * V12 §5 runtime wiring contracts: winner persistence goes through the async
 * TournamentPersistencePort (localStorage is only the fallback adapter) and
 * survives sessions without ever throwing on bad data or missing storage;
 * hydration is a one-shot boot step; cost samples are real measurements only;
 * kills evict cached wins; shadow sampling can observe but never touch the
 * production result; lane selection is a pure in-memory projection that is
 * exactly the identity when the tournament has nothing to say.
 */

function createFakeStorage(initial?: Record<string, string>): TournamentWinnerStorage & {
  readonly data: Map<string, string>;
} {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const WINNER = {
  providerId: "filter-lane-worker",
  expectedWarmMs: 4.2,
  decidedAtSample: 3,
};

describe("winner cache persistence (async port + localStorage fallback adapter)", () => {
  it("round-trips winners through explicit persist into a freshly hydrated runtime", async () => {
    const storage = createFakeStorage();
    const port = createLocalStorageTournamentPersistence(storage);
    const first = createStudioTournamentRuntime({ persistence: port, deviceHash: "dev-a" });
    first.recordWinner("bucket-1", "dev-a", WINNER);
    first.recordWinner("bucket-2", "dev-b", {
      providerId: "filter-lane-gpu-chain",
      expectedWarmMs: 1.5,
      decidedAtSample: 8,
    });
    await expect(first.persist()).resolves.toBe(true);

    const second = createStudioTournamentRuntime({ persistence: port, deviceHash: "dev-a" });
    // Nothing is visible before the explicit boot hydration…
    expect(second.winnerCache.size).toBe(0);
    await expect(second.hydrate()).resolves.toBe(true);
    // …and everything is after.
    expect(second.winnerCache.get("bucket-1", "dev-a")).toEqual(WINNER);
    expect(second.winnerCache.get("bucket-2", "dev-b")?.providerId).toBe(
      "filter-lane-gpu-chain",
    );
    const raw = storage.data.get(STUDIO_TOURNAMENT_WINNER_STORAGE_KEY);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw ?? "{}").version).toBe(
      STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
    );
  });

  it("ignores unparsable payloads instead of throwing", async () => {
    const storage = createFakeStorage({
      [STUDIO_TOURNAMENT_WINNER_STORAGE_KEY]: "{not json!!",
    });
    const runtime = createStudioTournamentRuntime({
      persistence: createLocalStorageTournamentPersistence(storage),
      deviceHash: "dev-a",
    });
    await expect(runtime.hydrate()).resolves.toBe(false);
    expect(runtime.winnerCache.size).toBe(0);
  });

  it("ignores payloads with a foreign schema version", async () => {
    const storage = createFakeStorage({
      [STUDIO_TOURNAMENT_WINNER_STORAGE_KEY]: JSON.stringify({
        version: 999,
        entries: [{ bucket: "b", deviceHash: "d", ...WINNER }],
      }),
    });
    const runtime = createStudioTournamentRuntime({
      persistence: createLocalStorageTournamentPersistence(storage),
      deviceHash: "dev-a",
    });
    await expect(runtime.hydrate()).resolves.toBe(false);
    expect(runtime.winnerCache.size).toBe(0);
  });

  it("keeps well-formed entries and drops malformed ones from a mixed payload", async () => {
    const storage = createFakeStorage({
      [STUDIO_TOURNAMENT_WINNER_STORAGE_KEY]: JSON.stringify({
        version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
        entries: [
          { bucket: "good", deviceHash: "dev-a", ...WINNER },
          { bucket: "", deviceHash: "dev-a", ...WINNER },
          { bucket: "nan", deviceHash: "dev-a", ...WINNER, expectedWarmMs: "fast" },
          null,
          "junk",
        ],
      }),
    });
    const runtime = createStudioTournamentRuntime({
      persistence: createLocalStorageTournamentPersistence(storage),
      deviceHash: "dev-a",
    });
    await expect(runtime.hydrate()).resolves.toBe(true);
    expect(runtime.winnerCache.size).toBe(1);
    expect(runtime.winnerCache.get("good", "dev-a")).toEqual(WINNER);
  });

  it("SSR/in-memory guard: null persistence never throws; hydrate and persist report false", async () => {
    const runtime = createStudioTournamentRuntime({
      persistence: null,
      deviceHash: "dev-a",
    });
    await expect(runtime.hydrate()).resolves.toBe(false);
    runtime.recordWinner("bucket-1", "dev-a", WINNER);
    await expect(runtime.persist()).resolves.toBe(false);
    expect(runtime.winnerCache.get("bucket-1", "dev-a")).toEqual(WINNER);
  });

  it("treats a throwing synchronous storage (privacy mode / quota) as absent", async () => {
    const throwing: TournamentWinnerStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    const runtime = createStudioTournamentRuntime({
      persistence: createLocalStorageTournamentPersistence(throwing),
      deviceHash: "dev-a",
    });
    await expect(runtime.hydrate()).resolves.toBe(false);
    runtime.recordWinner("bucket-1", "dev-a", WINNER);
    await expect(runtime.persist()).resolves.toBe(false);
  });

  it("absorbs async port rejections into calm booleans (load and save)", async () => {
    const rejecting: TournamentPersistencePort = {
      load: () => Promise.reject(new Error("backend down")),
      save: () => Promise.reject(new Error("backend down")),
    };
    const runtime = createStudioTournamentRuntime({
      persistence: rejecting,
      deviceHash: "dev-a",
    });
    await expect(runtime.hydrate()).resolves.toBe(false);
    runtime.recordWinner("bucket-1", "dev-a", WINNER);
    await expect(runtime.persist()).resolves.toBe(false);
  });

  it("hydrate is one-shot: repeated calls reuse the first load", async () => {
    let loads = 0;
    const state: PersistedTournamentStateV1 = {
      version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
      entries: [{ bucket: "bucket-1", deviceHash: "dev-a", ...WINNER }],
    };
    const port: TournamentPersistencePort = {
      load: () => {
        loads += 1;
        return Promise.resolve(state);
      },
      save: () => Promise.resolve(),
    };
    const runtime = createStudioTournamentRuntime({
      persistence: port,
      deviceHash: "dev-a",
    });
    await expect(runtime.hydrate()).resolves.toBe(true);
    await expect(runtime.hydrate()).resolves.toBe(true);
    expect(loads).toBe(1);
  });

  it("hydration never resurrects a killed provider", async () => {
    const port: TournamentPersistencePort = {
      load: () =>
        Promise.resolve({
          version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
          entries: [{ bucket: "bucket-1", deviceHash: "dev-a", ...WINNER }],
        } satisfies PersistedTournamentStateV1),
      save: () => Promise.resolve(),
    };
    const runtime = createStudioTournamentRuntime({
      persistence: port,
      deviceHash: "dev-a",
      killList: [{ providerId: WINNER.providerId, reason: "remote flag" }],
    });
    await expect(runtime.hydrate()).resolves.toBe(false);
    expect(runtime.winnerCache.get("bucket-1", "dev-a")).toBeNull();
  });

  it("a decision recorded before the load resolves wins over stale disk state", async () => {
    const port: TournamentPersistencePort = {
      load: () =>
        Promise.resolve({
          version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
          entries: [
            {
              bucket: "bucket-1",
              deviceHash: "dev-a",
              providerId: "filter-lane-gpu-chain",
              expectedWarmMs: 99,
              decidedAtSample: 1,
            },
          ],
        } satisfies PersistedTournamentStateV1),
      save: () => Promise.resolve(),
    };
    const runtime = createStudioTournamentRuntime({
      persistence: port,
      deviceHash: "dev-a",
    });
    runtime.recordWinner("bucket-1", "dev-a", WINNER);
    await runtime.hydrate();
    expect(runtime.winnerCache.get("bucket-1", "dev-a")).toEqual(WINNER);
  });

  it("installDefaultTournamentPersistence swaps the default adapter for new runtimes", async () => {
    const state: PersistedTournamentStateV1 = {
      version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
      entries: [{ bucket: "bucket-1", deviceHash: "dev-a", ...WINNER }],
    };
    const saved: PersistedTournamentStateV1[] = [];
    installDefaultTournamentPersistence(() => ({
      load: () => Promise.resolve(state),
      save: (next) => {
        saved.push(next);
        return Promise.resolve();
      },
    }));
    try {
      const runtime = createStudioTournamentRuntime({ deviceHash: "dev-a" });
      await expect(runtime.hydrate()).resolves.toBe(true);
      expect(runtime.winnerCache.get("bucket-1", "dev-a")).toEqual(WINNER);
      await expect(runtime.persist()).resolves.toBe(true);
      expect(saved).toHaveLength(1);
      expect(saved[0]?.version).toBe(STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION);
    } finally {
      installDefaultTournamentPersistence(null);
    }
  });

  it("parsePersistedTournamentState validates untrusted payloads for any adapter", () => {
    expect(parsePersistedTournamentState(null)).toBeNull();
    expect(parsePersistedTournamentState({ version: 2, entries: [] })).toBeNull();
    expect(
      parsePersistedTournamentState({
        version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
        entries: [{ bucket: "b", deviceHash: "d", ...WINNER }, { bogus: true }],
      }),
    ).toEqual({
      version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
      entries: [{ bucket: "b", deviceHash: "d", ...WINNER }],
    });
  });
});

describe("cost model sampling", () => {
  it("accumulates only real measurements and rejects invalid values", () => {
    const runtime = createStudioTournamentRuntime({
      persistence: null,
      deviceHash: "dev-a",
    });
    expect(runtime.recordRenderSample("p1", "bucket", 4)).toBe(true);
    expect(runtime.recordRenderSample("p1", "bucket", 6)).toBe(true);
    expect(runtime.recordRenderSample("p1", "bucket", Number.NaN)).toBe(false);
    expect(runtime.recordRenderSample("p1", "bucket", -1)).toBe(false);
    expect(runtime.recordRenderSample("p1", "bucket", Number.POSITIVE_INFINITY)).toBe(
      false,
    );
    expect(runtime.costModel.sampleCount("p1", "bucket")).toBe(2);
    expect(runtime.costModel.estimate("p1", "bucket")?.warmP50Ms).toBe(5);
    // No measurement ⇒ no estimate — nothing is ever invented.
    expect(runtime.costModel.estimate("p2", "bucket")).toBeNull();
  });
});

describe("remote kill switch", () => {
  it("applyKillList kills providers and evicts their cached wins everywhere", async () => {
    const port = createLocalStorageTournamentPersistence(createFakeStorage());
    const runtime = createStudioTournamentRuntime({
      persistence: port,
      deviceHash: "dev-a",
    });
    runtime.recordWinner("bucket-1", "dev-a", WINNER);
    runtime.recordWinner("bucket-2", "dev-a", {
      providerId: "filter-lane-gpu-chain",
      expectedWarmMs: 2,
      decidedAtSample: 1,
    });

    const outcome = runtime.applyKillList(["filter-lane-worker"], "driver crash");
    expect(outcome).toEqual({ killed: ["filter-lane-worker"], evictedWinners: 1 });
    expect(runtime.killSwitch.isKilled("filter-lane-worker")).toBe(true);
    expect(runtime.killSwitch.reasonFor("filter-lane-worker")).toBe("driver crash");
    expect(runtime.winnerCache.get("bucket-1", "dev-a")).toBeNull();
    expect(runtime.winnerCache.get("bucket-2", "dev-a")).not.toBeNull();

    // The eviction also reaches the persisted payload: a fresh hydrated
    // runtime must not resurrect the killed provider's win.
    await expect(runtime.persist()).resolves.toBe(true);
    const reloaded = createStudioTournamentRuntime({
      persistence: port,
      deviceHash: "dev-a",
    });
    await reloaded.hydrate();
    expect(reloaded.winnerCache.get("bucket-1", "dev-a")).toBeNull();
    expect(reloaded.winnerCache.get("bucket-2", "dev-a")?.providerId).toBe(
      "filter-lane-gpu-chain",
    );
  });

  it("injected kill config applies at construction; default config kills nothing", () => {
    const configured = createStudioTournamentRuntime({
      persistence: null,
      deviceHash: "dev-a",
      killList: [{ providerId: "filter-lane-gpu-chain", reason: "remote flag" }],
    });
    expect(configured.killSwitch.isKilled("filter-lane-gpu-chain")).toBe(true);
    expect(configured.killSwitch.reasonFor("filter-lane-gpu-chain")).toBe("remote flag");

    const pristine = createStudioTournamentRuntime({
      persistence: null,
      deviceHash: "dev-a",
    });
    expect(pristine.killSwitch.listKilled()).toEqual([]);
  });
});

describe("selectFilterLane", () => {
  const laneProviderId = (lane: string): string => `filter-lane-${lane}`;
  const LANES = ["gpu-chain", "worker", "konva-native"] as const;

  function bareState(): { winnerCache: WinnerCache; killSwitch: RemoteKillSwitch } {
    return { winnerCache: new WinnerCache(), killSwitch: new RemoteKillSwitch() };
  }

  it("is the identity with an empty winner cache and no kills", () => {
    const selection = selectFilterLane({
      lanes: LANES,
      bucket: "bucket",
      deviceHash: "dev-a",
      ...bareState(),
      laneProviderId,
    });
    expect(selection.lanes).toEqual([...LANES]);
    expect(selection.killedLanes).toEqual([]);
    expect(selection.promotedLane).toBeNull();
    expect(selection.killIgnoredReason).toBeNull();
  });

  it("promotes the cached winner's lane to the head, keeping the rest stable", () => {
    const state = bareState();
    state.winnerCache.set("bucket", "dev-a", WINNER);
    const selection = selectFilterLane({
      lanes: LANES,
      bucket: "bucket",
      deviceHash: "dev-a",
      ...state,
      laneProviderId,
    });
    expect(selection.lanes).toEqual(["worker", "gpu-chain", "konva-native"]);
    expect(selection.promotedLane).toBe("worker");
  });

  it("excludes killed lanes while a fallback chain remains", () => {
    const state = bareState();
    state.killSwitch.kill("filter-lane-gpu-chain", "remote flag");
    const selection = selectFilterLane({
      lanes: LANES,
      bucket: "bucket",
      deviceHash: "dev-a",
      ...state,
      laneProviderId,
    });
    expect(selection.lanes).toEqual(["worker", "konva-native"]);
    expect(selection.killedLanes).toEqual(["gpu-chain"]);
    expect(selection.killIgnoredReason).toBeNull();
  });

  it("never empties the chain: killing every lane is ignored with a logged reason", () => {
    const state = bareState();
    for (const lane of LANES) state.killSwitch.kill(laneProviderId(lane), "panic");
    const selection = selectFilterLane({
      lanes: LANES,
      bucket: "bucket",
      deviceHash: "dev-a",
      ...state,
      laneProviderId,
    });
    expect(selection.lanes).toEqual([...LANES]);
    expect(selection.killedLanes).toEqual([...LANES]);
    expect(selection.killIgnoredReason).toContain("keeping the original order");
    expect(selection.killIgnoredReason).toContain("filter-lane-gpu-chain: panic");
  });

  it("a cached winner that is killed does not resurrect its lane", () => {
    const state = bareState();
    state.winnerCache.set("bucket", "dev-a", WINNER);
    state.killSwitch.kill("filter-lane-worker", "remote flag");
    const selection = selectFilterLane({
      lanes: LANES,
      bucket: "bucket",
      deviceHash: "dev-a",
      ...state,
      laneProviderId,
    });
    expect(selection.lanes).toEqual(["gpu-chain", "konva-native"]);
    expect(selection.promotedLane).toBeNull();
  });

  it("does not mutate the input lane ladder", () => {
    const state = bareState();
    state.winnerCache.set("bucket", "dev-a", WINNER);
    const lanes = [...LANES];
    selectFilterLane({
      lanes,
      bucket: "bucket",
      deviceHash: "dev-a",
      ...state,
      laneProviderId,
    });
    expect(lanes).toEqual([...LANES]);
  });
});

describe("scheduleShadowSample", () => {
  function manualScheduler(): { tasks: Array<() => void>; run: () => void } {
    const tasks: Array<() => void> = [];
    return {
      tasks,
      run: () => {
        for (const task of tasks.splice(0)) task();
      },
    };
  }

  const flushShadow = async (): Promise<void> => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  };

  it("returns the winner pixels by reference and gates against that exact buffer", async () => {
    const winnerPixels = new Uint8Array([1, 2, 3, 4]);
    const shadowPixels = new Uint8Array([1, 2, 3, 4]);
    const scheduler = manualScheduler();
    const reports: ShadowComparisonReport[] = [];
    const gateCalls: Array<{ candidate: Uint8Array; reference: Uint8Array }> = [];

    const resultPromise = scheduleShadowSample({
      scheduler: (task) => scheduler.tasks.push(task),
      winnerRender: () => winnerPixels,
      shadowRender: () => shadowPixels,
      width: 1,
      height: 1,
      gate: (candidate, reference) => {
        gateCalls.push({ candidate, reference });
        return { pass: true, mismatchPct: 0 };
      },
      onReport: (report) => reports.push(report),
    });

    const result = await resultPromise;
    expect(result).toBe(winnerPixels);
    // Nothing ran before the injected scheduler fires.
    expect(reports).toEqual([]);

    scheduler.run();
    await flushShadow();
    expect(reports).toEqual([{ gate: { pass: true, mismatchPct: 0 }, error: null }]);
    expect(gateCalls).toHaveLength(1);
    expect(gateCalls[0]?.reference).toBe(winnerPixels);
    expect(gateCalls[0]?.candidate).toBe(shadowPixels);
    expect([...winnerPixels]).toEqual([1, 2, 3, 4]);
  });

  it("shadow exceptions surface only as report.error; the winner is untouched", async () => {
    const winnerPixels = new Uint8Array([9, 9, 9, 9]);
    const scheduler = manualScheduler();
    const reports: ShadowComparisonReport[] = [];

    const result = await scheduleShadowSample({
      scheduler: (task) => scheduler.tasks.push(task),
      winnerRender: () => winnerPixels,
      shadowRender: () => {
        throw new Error("shadow exploded");
      },
      width: 1,
      height: 1,
      onReport: (report) => reports.push(report),
    });
    scheduler.run();
    await flushShadow();

    expect(result).toBe(winnerPixels);
    expect([...winnerPixels]).toEqual([9, 9, 9, 9]);
    expect(reports).toEqual([{ gate: null, error: "shadow exploded" }]);
  });

  it("a failing production render rejects for the caller and reports on the shadow side", async () => {
    const scheduler = manualScheduler();
    const reports: ShadowComparisonReport[] = [];

    const resultPromise = scheduleShadowSample({
      scheduler: (task) => scheduler.tasks.push(task),
      winnerRender: () => Promise.reject(new Error("winner failed")),
      shadowRender: () => new Uint8Array(4),
      width: 1,
      height: 1,
      onReport: (report) => reports.push(report),
    });

    await expect(resultPromise).rejects.toThrow("winner failed");
    scheduler.run();
    await flushShadow();
    expect(reports).toEqual([{ gate: null, error: "winner failed" }]);
  });
});

describe("device hash", () => {
  it("is deterministic for the same identity and differs across identities", () => {
    const identityA = { userAgent: "ua-a", hardwareConcurrency: 8, devicePixelRatio: 2 };
    expect(computeStudioDeviceHash(identityA)).toBe(computeStudioDeviceHash(identityA));
    expect(computeStudioDeviceHash(identityA)).not.toBe(
      computeStudioDeviceHash({ ...identityA, userAgent: "ua-b" }),
    );
  });
});
