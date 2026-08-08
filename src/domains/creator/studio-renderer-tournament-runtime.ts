import {
  ProviderCostModel,
  RemoteKillSwitch,
  WinnerCache,
  createFuzzyNeighborhoodGate,
  runShadowComparison,
  type ShadowComparisonReport,
  type VisualEquivalenceGate,
  type WinnerCacheEntry,
} from "@toonspectrum/studio-engine-registry";

/**
 * V12 §5 runtime wiring — RUNTIME_RENDERER_TOURNAMENT + SHADOW_RENDERING.
 *
 * The tournament primitives (WinnerCache, ProviderCostModel, RemoteKillSwitch,
 * runShadowComparison) live in @toonspectrum/studio-engine-registry as pure
 * mechanisms. This module gives them a browser runtime without touching React:
 *
 * - winner decisions persist across sessions through an async
 *   TournamentPersistencePort (versioned schema, parse failures ignored —
 *   never throw). localStorage is only the fallback adapter of that port;
 *   richer stores (e.g. a SQLite/OPFS adapter) plug in via
 *   installDefaultTournamentPersistence without changes here;
 * - hydration is a one-shot boot step (`hydrate()`); every synchronous
 *   decision path — selectFilterLane included — reads only the already-loaded
 *   in-memory state;
 * - cost samples come exclusively from real measurements (recordRenderSample
 *   drops invalid values instead of fabricating estimates);
 * - the remote kill switch is fed by injected config (default: nothing killed)
 *   and killing a provider also evicts its cached wins;
 * - shadow samples run through an injected idle scheduler and can only observe
 *   the production result, never change it (exceptions surface as
 *   report.error only);
 * - selectFilterLane projects the winner cache + kill switch onto a filter
 *   lane ladder so the existing island plan (studio-filter-island-plan.ts)
 *   executes tournament conclusions on its real call path.
 *
 * Hot-path contract: everything here is pure functions or plain module state.
 * No React imports, no renders, no timers.
 */

/* ------------------------------------------------------------------ */
/* Persistence port — async, adapter-agnostic                          */
/* ------------------------------------------------------------------ */

export const STUDIO_TOURNAMENT_WINNER_STORAGE_KEY =
  "toonspectrum-studio-tournament-winners-v1";
export const STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION = 1;

export interface PersistedWinnerEntry extends WinnerCacheEntry {
  bucket: string;
  deviceHash: string;
}

export interface PersistedTournamentStateV1 {
  version: typeof STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION;
  entries: PersistedWinnerEntry[];
}

/**
 * Async persistence seam for tournament winner state. Adapters own the medium
 * (localStorage fallback below; SQLite/OPFS lives in its own module and is
 * injected at boot). `load` resolves null when nothing usable is stored;
 * `save` rejects on write failure — the runtime converts both into calm
 * booleans and never lets persistence throw into a render path.
 */
export interface TournamentPersistencePort {
  load(): Promise<PersistedTournamentStateV1 | null>;
  save(state: PersistedTournamentStateV1): Promise<void>;
}

export type TournamentPersistenceFactory = () => TournamentPersistencePort | null;

function isValidPersistedEntry(value: unknown): value is PersistedWinnerEntry {
  if (typeof value !== "object" || value === null) return false;
  const { bucket, deviceHash, providerId, expectedWarmMs, decidedAtSample } =
    value as Record<string, unknown>;
  return (
    typeof bucket === "string" &&
    bucket.length > 0 &&
    typeof deviceHash === "string" &&
    deviceHash.length > 0 &&
    typeof providerId === "string" &&
    providerId.length > 0 &&
    typeof expectedWarmMs === "number" &&
    Number.isFinite(expectedWarmMs) &&
    expectedWarmMs >= 0 &&
    typeof decidedAtSample === "number" &&
    Number.isFinite(decidedAtSample) &&
    decidedAtSample >= 0
  );
}

/**
 * Validates an untrusted payload (JSON, DB row, …) into persisted tournament
 * state. Foreign schema versions and malformed payloads resolve to null,
 * malformed entries are dropped — adapters share this instead of re-deriving
 * the schema. Never throws.
 */
export function parsePersistedTournamentState(
  payload: unknown,
): PersistedTournamentStateV1 | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { version, entries } = payload as { version?: unknown; entries?: unknown };
  if (version !== STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION) return null;
  if (!Array.isArray(entries)) return null;
  return {
    version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
    entries: entries.filter(isValidPersistedEntry).map((entry) => ({
      bucket: entry.bucket,
      deviceHash: entry.deviceHash,
      providerId: entry.providerId,
      expectedWarmMs: entry.expectedWarmMs,
      decidedAtSample: entry.decidedAtSample,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* localStorage fallback adapter                                       */
/* ------------------------------------------------------------------ */

/** Minimal synchronous storage surface the fallback adapter wraps. */
export interface TournamentWinnerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Default storage: `globalThis.localStorage` when it exists and is usable.
 * SSR (no localStorage) and privacy modes that throw on access both resolve
 * to null — the adapter then loads nothing and rejects saves.
 */
export function resolveDefaultTournamentStorage(): TournamentWinnerStorage | null {
  try {
    const storage = (globalThis as { localStorage?: TournamentWinnerStorage })
      .localStorage;
    if (
      !storage ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function"
    ) {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}

/**
 * Fallback adapter: the synchronous localStorage API wrapped behind the async
 * port. Unreadable/unparsable payloads load as null (ignored, never thrown);
 * saving without usable storage or over quota rejects, which the runtime
 * reports as `persist() === false`.
 */
export function createLocalStorageTournamentPersistence(
  storage?: TournamentWinnerStorage | null,
): TournamentPersistencePort {
  const resolved = storage === undefined ? resolveDefaultTournamentStorage() : storage;
  return {
    load: () => {
      if (!resolved) return Promise.resolve(null);
      let raw: string | null;
      try {
        raw = resolved.getItem(STUDIO_TOURNAMENT_WINNER_STORAGE_KEY);
      } catch {
        return Promise.resolve(null);
      }
      if (raw === null) return Promise.resolve(null);
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        return Promise.resolve(null);
      }
      return Promise.resolve(parsePersistedTournamentState(payload));
    },
    save: (state) => {
      if (!resolved) {
        return Promise.reject(new Error("tournament persistence storage unavailable"));
      }
      try {
        resolved.setItem(STUDIO_TOURNAMENT_WINNER_STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        return Promise.reject(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
      return Promise.resolve();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Default adapter injection point                                     */
/* ------------------------------------------------------------------ */

let defaultPersistenceFactory: TournamentPersistenceFactory | null = null;

/**
 * Boot-time injection point for the default persistence adapter: a richer
 * store (e.g. the SQLite/OPFS adapter in its own module) installs its factory
 * here and every runtime constructed afterwards without an explicit
 * `persistence` option uses it. `null` restores the localStorage fallback.
 */
export function installDefaultTournamentPersistence(
  factory: TournamentPersistenceFactory | null,
): void {
  defaultPersistenceFactory = factory;
}

/** Resolves the currently installed default adapter (localStorage fallback). */
export function resolveDefaultTournamentPersistence(): TournamentPersistencePort | null {
  if (defaultPersistenceFactory) return defaultPersistenceFactory();
  return createLocalStorageTournamentPersistence();
}

/* ------------------------------------------------------------------ */
/* Device identity                                                     */
/* ------------------------------------------------------------------ */

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface StudioDeviceIdentity {
  userAgent?: string;
  hardwareConcurrency?: number;
  devicePixelRatio?: number;
}

/** Stable winner-cache partition key; deterministic for a given identity. */
export function computeStudioDeviceHash(identity?: StudioDeviceIdentity): string {
  const nav = (
    globalThis as {
      navigator?: { userAgent?: string; hardwareConcurrency?: number };
    }
  ).navigator;
  const userAgent = identity?.userAgent ?? nav?.userAgent ?? "ssr";
  const cores = identity?.hardwareConcurrency ?? nav?.hardwareConcurrency ?? 0;
  const dpr =
    identity?.devicePixelRatio ??
    (globalThis as { devicePixelRatio?: number }).devicePixelRatio ??
    1;
  return fnv1a(`${userAgent}|c${cores}|d${dpr}`);
}

/* ------------------------------------------------------------------ */
/* Runtime — winner cache + cost model + kill switch, one seam         */
/* ------------------------------------------------------------------ */

export interface StudioTournamentKillEntry {
  providerId: string;
  reason: string;
}

/** One accepted real render measurement, as seen by recordRenderSample. */
export interface StudioTournamentRenderSampleEvent {
  providerId: string;
  bucket: string;
  ms: number;
}

export interface StudioTournamentRuntimeOptions {
  /**
   * Persistence port. `undefined` = currently installed default adapter
   * (localStorage fallback unless a richer adapter was installed);
   * `null` = in-memory only.
   */
  persistence?: TournamentPersistencePort | null;
  /** Injected remote kill config. Default: empty (nothing killed). */
  killList?: readonly StudioTournamentKillEntry[];
  deviceHash?: string;
  /**
   * Observer for samples the cost model accepted (e.g. the SQLite
   * cost_samples sink). Invalid samples are dropped before it fires, and
   * observer failures never affect the hot path or the recorded sample.
   */
  onRenderSample?: (sample: StudioTournamentRenderSampleEvent) => void;
}

export class StudioRendererTournamentRuntime {
  readonly winnerCache = new WinnerCache();
  readonly costModel = new ProviderCostModel();
  readonly killSwitch = new RemoteKillSwitch();
  readonly deviceHash: string;

  private readonly persistence: TournamentPersistencePort | null;
  private readonly persisted = new Map<string, PersistedWinnerEntry>();
  private readonly onRenderSample:
    | ((sample: StudioTournamentRenderSampleEvent) => void)
    | null;
  private hydration: Promise<boolean> | null = null;

  constructor(options?: StudioTournamentRuntimeOptions) {
    this.persistence =
      options?.persistence === undefined
        ? resolveDefaultTournamentPersistence()
        : options.persistence;
    this.onRenderSample = options?.onRenderSample ?? null;
    this.deviceHash = options?.deviceHash ?? computeStudioDeviceHash();
    const killList = options?.killList ?? [];
    for (const kill of killList) {
      this.applyKillList([kill.providerId], kill.reason);
    }
  }

  private static persistKey(bucket: string, deviceHash: string): string {
    return `${bucket}::${deviceHash}`;
  }

  /**
   * One-shot boot hydration: loads persisted winners into the in-memory cache
   * exactly once (repeat calls reuse the first load). Killed providers are
   * never resurrected, decisions recorded before the load resolved win over
   * stale disk state, and every load failure resolves false — never throws.
   */
  hydrate(): Promise<boolean> {
    this.hydration ??= this.hydrateOnce();
    return this.hydration;
  }

  private async hydrateOnce(): Promise<boolean> {
    if (!this.persistence) return false;
    let state: PersistedTournamentStateV1 | null;
    try {
      state = await this.persistence.load();
    } catch {
      return false;
    }
    if (!state) return false;
    let hydrated = false;
    for (const entry of state.entries) {
      // Ports are typed, but their bytes come from disk — revalidate.
      if (!isValidPersistedEntry(entry)) continue;
      if (this.killSwitch.isKilled(entry.providerId)) continue;
      if (this.winnerCache.get(entry.bucket, entry.deviceHash)) continue;
      this.persisted.set(
        StudioRendererTournamentRuntime.persistKey(entry.bucket, entry.deviceHash),
        entry,
      );
      this.winnerCache.set(entry.bucket, entry.deviceHash, {
        providerId: entry.providerId,
        expectedWarmMs: entry.expectedWarmMs,
        decidedAtSample: entry.decidedAtSample,
      });
      hydrated = true;
    }
    return hydrated;
  }

  /** Records a tournament decision in the cache and the persistable index. */
  recordWinner(bucket: string, deviceHash: string, entry: WinnerCacheEntry): void {
    this.winnerCache.set(bucket, deviceHash, entry);
    this.persisted.set(StudioRendererTournamentRuntime.persistKey(bucket, deviceHash), {
      bucket,
      deviceHash,
      ...entry,
    });
  }

  /**
   * Explicit persistence — the caller decides when (never a debounce inside
   * this module). Resolves false when there is no port or the adapter
   * rejected (quota, privacy mode, backend down); never throws.
   */
  async persist(): Promise<boolean> {
    if (!this.persistence) return false;
    const state: PersistedTournamentStateV1 = {
      version: STUDIO_TOURNAMENT_WINNER_SCHEMA_VERSION,
      entries: [...this.persisted.values()],
    };
    try {
      await this.persistence.save(state);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Accumulates one real warm-render measurement. Invalid values (NaN,
   * negative, Infinity) are dropped and reported as false — the cost model
   * only ever contains measurements, never fabricated estimates.
   */
  recordRenderSample(providerId: string, bucket: string, ms: number): boolean {
    if (!Number.isFinite(ms) || ms < 0) return false;
    this.costModel.record(providerId, bucket, { warmMs: ms });
    if (this.onRenderSample) {
      try {
        this.onRenderSample({ providerId, bucket, ms });
      } catch {
        // Observer hygiene never affects the hot path or the recorded sample.
      }
    }
    return true;
  }

  /**
   * Applies an injected remote kill list: the providers leave candidacy
   * immediately and every cached win they hold (in-memory and persistable)
   * is evicted so a stale winner cannot resurrect them.
   */
  applyKillList(
    providerIds: readonly string[],
    reason: string,
  ): { killed: string[]; evictedWinners: number } {
    const killed: string[] = [];
    let evictedWinners = 0;
    for (const providerId of providerIds) {
      this.killSwitch.kill(providerId, reason);
      killed.push(providerId);
      evictedWinners += this.winnerCache.evictProvider(providerId);
      for (const [key, entry] of this.persisted) {
        if (entry.providerId === providerId) this.persisted.delete(key);
      }
    }
    return { killed, evictedWinners };
  }
}

export function createStudioTournamentRuntime(
  options?: StudioTournamentRuntimeOptions,
): StudioRendererTournamentRuntime {
  return new StudioRendererTournamentRuntime(options);
}

/* ------------------------------------------------------------------ */
/* Shared runtime instance (module state, no React)                    */
/* ------------------------------------------------------------------ */

let sharedRuntime: StudioRendererTournamentRuntime | null = null;

/**
 * Lazily constructed shared runtime used by the studio's real call paths.
 * First access kicks off the one-shot async hydration; synchronous callers
 * keep reading the in-memory state and pick up persisted winners once the
 * load resolves (boot hydration pattern — no await on any decision path).
 */
export function getStudioTournamentRuntime(): StudioRendererTournamentRuntime {
  if (!sharedRuntime) {
    sharedRuntime = createStudioTournamentRuntime();
    void sharedRuntime.hydrate();
  }
  return sharedRuntime;
}

/**
 * Non-creating, non-hydrating view of the shared runtime — null until
 * something has actually booted it.
 *
 * Decision paths that must stay free of I/O use this instead of
 * {@link getStudioTournamentRuntime}: creating the runtime kicks off
 * hydration, and hydration is what pulls the persistence adapter (and, with
 * the SQLite/OPFS adapter installed, its ~865 KB wasm) over the network. A
 * null runtime is not a correctness problem — an unbooted tournament has an
 * empty winner cache and nothing killed, which is exactly the state the lane
 * ladder is contractually unchanged by.
 */
export function peekStudioTournamentRuntime(): StudioRendererTournamentRuntime | null {
  return sharedRuntime;
}

/**
 * Replaces the shared runtime (e.g. boot code injecting a remote kill list,
 * or tests injecting fake persistence). `null` restores lazy default
 * creation. The caller owns hydration of an injected runtime.
 */
export function installStudioTournamentRuntime(
  runtime: StudioRendererTournamentRuntime | null,
): void {
  sharedRuntime = runtime;
}

/* ------------------------------------------------------------------ */
/* Shadow sampling runner                                              */
/* ------------------------------------------------------------------ */

/** Idle-callback-shaped scheduler; injected so tests control timing. */
export type ShadowSampleScheduler = (task: () => void) => void;

export interface ScheduleShadowSampleOptions {
  scheduler: ShadowSampleScheduler;
  winnerRender: () => Uint8Array | Promise<Uint8Array>;
  shadowRender: () => Uint8Array | Promise<Uint8Array>;
  width: number;
  height: number;
  onReport: (report: ShadowComparisonReport) => void;
  /** Defaults to the registry's fuzzy neighborhood gate. */
  gate?: VisualEquivalenceGate;
}

/**
 * Runs the production (winner) render immediately and returns its pixels by
 * reference, untouched. The shadow comparison is deferred onto the injected
 * scheduler and reuses runShadowComparison, so shadow work can only observe
 * the winner; every shadow-side exception surfaces exclusively as
 * `report.error` — never as a thrown error and never as a change to the
 * production result.
 */
export function scheduleShadowSample(
  options: ScheduleShadowSampleOptions,
): Promise<Uint8Array> {
  const gate = options.gate ?? createFuzzyNeighborhoodGate();
  const winnerPixels = Promise.resolve().then(options.winnerRender);
  options.scheduler(() => {
    runShadowComparison({
      // Reuses the already-started production render — no double render, and
      // the gate sees the exact same buffer the caller received.
      winnerRender: () => winnerPixels,
      shadowRender: options.shadowRender,
      gate,
      width: options.width,
      height: options.height,
      onReport: options.onReport,
    }).catch((error: unknown) => {
      // Reached only when the production render itself rejected (the caller
      // already sees that rejection through the returned promise); the shadow
      // side still reports instead of throwing.
      try {
        options.onReport({
          gate: null,
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Observer hygiene never affects production output.
      }
    });
  });
  return winnerPixels;
}

/* ------------------------------------------------------------------ */
/* Filter lane selection — tournament conclusions on the real path     */
/* ------------------------------------------------------------------ */

export interface SelectFilterLaneInput<TLane extends string> {
  /** Planner-produced lane ladder (head lane first). */
  lanes: readonly TLane[];
  bucket: string;
  deviceHash: string;
  winnerCache: WinnerCache;
  killSwitch: RemoteKillSwitch;
  laneProviderId: (lane: TLane) => string;
}

export interface SelectFilterLaneResult<TLane extends string> {
  lanes: TLane[];
  /** Lanes whose providers are currently killed (even when the kill was ignored). */
  killedLanes: TLane[];
  /** Lane the winner cache moved (or confirmed) at the head, if any. */
  promotedLane: TLane | null;
  /** Non-null when the kill switch was ignored to avoid an empty chain. */
  killIgnoredReason: string | null;
}

/**
 * Pure projection of already-hydrated in-memory tournament state onto a lane
 * ladder (no I/O, no awaits — safe on synchronous decision paths):
 * 1. killed providers leave the ladder — unless that would empty it, in which
 *    case the kill is ignored, the original order survives, and the reason is
 *    returned for logging (a fallback chain must always remain);
 * 2. a cached winner for this bucket/device moves its lane to the head. A
 *    winner that is killed or not in the ladder promotes nothing.
 * With an empty cache and no kills the input order is returned unchanged.
 */
export function selectFilterLane<TLane extends string>(
  input: SelectFilterLaneInput<TLane>,
): SelectFilterLaneResult<TLane> {
  const killedLanes = input.lanes.filter((lane) =>
    input.killSwitch.isKilled(input.laneProviderId(lane)),
  );
  let lanes = input.lanes.filter(
    (lane) => !input.killSwitch.isKilled(input.laneProviderId(lane)),
  );

  if (lanes.length === 0 && input.lanes.length > 0) {
    const reasons = killedLanes
      .map((lane) => {
        const providerId = input.laneProviderId(lane);
        return `${providerId}: ${input.killSwitch.reasonFor(providerId) ?? "unknown"}`;
      })
      .join("; ");
    return {
      lanes: [...input.lanes],
      killedLanes,
      promotedLane: null,
      killIgnoredReason: `kill switch would empty the lane chain; keeping the original order [${reasons}]`,
    };
  }

  const winner = input.winnerCache.get(input.bucket, input.deviceHash);
  let promotedLane: TLane | null = null;
  if (winner) {
    const winnerLane = lanes.find(
      (lane) => input.laneProviderId(lane) === winner.providerId,
    );
    if (winnerLane !== undefined) {
      promotedLane = winnerLane;
      if (lanes[0] !== winnerLane) {
        lanes = [winnerLane, ...lanes.filter((lane) => lane !== winnerLane)];
      }
    }
  }

  return { lanes, killedLanes, promotedLane, killIgnoredReason: null };
}
