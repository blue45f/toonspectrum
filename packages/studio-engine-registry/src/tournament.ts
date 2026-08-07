import type { SceneIR, SceneNodeIR } from "@toonspectrum/studio-project-model";

/**
 * Renderer Tournament (V12 §5).
 *
 * Candidates are never chosen by name: the tournament measures real render
 * timings per scene-complexity bucket, caches the winner per device, applies
 * hysteresis (<12% expected gain = no switch; never switch while pen-down),
 * verifies challengers through a visual equivalence gate, runs shadow renders
 * that can never affect production output, and gates promotion on evidence.
 * A remote kill switch removes a provider from candidacy immediately.
 */

/* ------------------------------------------------------------------ */
/* §5.1 SceneFingerprint                                               */
/* ------------------------------------------------------------------ */

export interface SceneFingerprint {
  nodeCount: number;
  pathCount: number;
  pathSegmentCount: number;
  strokeCount: number;
  fillCount: number;
  gradientCount: number;
  blendLayerCount: number;
  groupDepth: number;
  textCount: number;
  canvasArea: number;
  /**
   * Quantized complexity key used by WinnerCache/ProviderCostModel. Same
   * scene always maps to the same bucket; scenes in the same power-of-two
   * complexity class intentionally share a bucket so measurements pool.
   */
  bucket: string;
}

/** Power-of-two quantizer: 0→0, 1→1, 2→2, 3..4→3, 5..8→4, … (deterministic). */
function pow2Bucket(value: number): number {
  if (value <= 0) return 0;
  return Math.floor(Math.log2(value)) + 1;
}

export function computeSceneFingerprint(scene: SceneIR): SceneFingerprint {
  let nodeCount = 0;
  let pathCount = 0;
  let pathSegmentCount = 0;
  let strokeCount = 0;
  let fillCount = 0;
  let gradientCount = 0;
  let blendLayerCount = 0;
  let groupDepth = 0;
  let textCount = 0;

  const visit = (nodes: SceneNodeIR[], depth: number): void => {
    for (const node of nodes) {
      nodeCount += 1;
      if (node.blend !== "src-over") blendLayerCount += 1;
      switch (node.kind) {
        case "fill-path":
        case "stroke-path": {
          pathCount += 1;
          if (node.kind === "stroke-path") strokeCount += 1;
          else fillCount += 1;
          for (const verb of node.path.verbs) {
            if (verb.v === "L" || verb.v === "Q" || verb.v === "C") {
              pathSegmentCount += 1;
            }
          }
          if (node.paint.kind !== "solid") gradientCount += 1;
          break;
        }
        case "text":
          textCount += 1;
          break;
        case "group":
          groupDepth = Math.max(groupDepth, depth + 1);
          visit(node.children, depth + 1);
          break;
      }
    }
  };
  visit(scene.nodes, 0);

  const canvasArea = scene.width * scene.height;
  const bucket = [
    `a${pow2Bucket(canvasArea)}`,
    `n${pow2Bucket(nodeCount)}`,
    `s${pow2Bucket(pathSegmentCount)}`,
    `g${pow2Bucket(gradientCount)}`,
    `b${pow2Bucket(blendLayerCount)}`,
    `t${pow2Bucket(textCount)}`,
    `d${groupDepth}`,
  ].join("|");

  return {
    nodeCount,
    pathCount,
    pathSegmentCount,
    strokeCount,
    fillCount,
    gradientCount,
    blendLayerCount,
    groupDepth,
    textCount,
    canvasArea,
    bucket,
  };
}

/* ------------------------------------------------------------------ */
/* §5.2 DeviceWorkloadProfile                                          */
/* ------------------------------------------------------------------ */

export interface DeviceWorkloadProfile {
  /** Stable hash of device/browser identity (winner cache partition key). */
  deviceHash: string;
  gpu: boolean;
  /** Hash of the engine build set, so upgrades invalidate stale conclusions. */
  engineHash: string;
}

/* ------------------------------------------------------------------ */
/* §5.3 ProviderCostModel — measured timings only, no fabrication      */
/* ------------------------------------------------------------------ */

export interface CostSample {
  coldMs?: number;
  warmMs?: number;
}

export interface CostEstimate {
  /** Median of measured warm renders, or null when none were measured. */
  warmP50Ms: number | null;
  /** Median of measured cold renders, or null when none were measured. */
  coldP50Ms: number | null;
  samples: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[mid - 1] ?? 0) + upper) / 2;
}

function assertValidMs(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number, got ${value}`);
  }
}

export class ProviderCostModel {
  private readonly samples = new Map<string, { cold: number[]; warm: number[] }>();

  private static key(providerId: string, bucket: string): string {
    return `${providerId}::${bucket}`;
  }

  record(providerId: string, bucket: string, sample: CostSample): void {
    if (sample.coldMs === undefined && sample.warmMs === undefined) {
      throw new RangeError("cost sample must carry coldMs and/or warmMs");
    }
    const key = ProviderCostModel.key(providerId, bucket);
    const entry = this.samples.get(key) ?? { cold: [], warm: [] };
    if (sample.coldMs !== undefined) {
      assertValidMs("coldMs", sample.coldMs);
      entry.cold.push(sample.coldMs);
    }
    if (sample.warmMs !== undefined) {
      assertValidMs("warmMs", sample.warmMs);
      entry.warm.push(sample.warmMs);
    }
    this.samples.set(key, entry);
  }

  /** Returns null when nothing was measured — estimates are never invented. */
  estimate(providerId: string, bucket: string): CostEstimate | null {
    const entry = this.samples.get(ProviderCostModel.key(providerId, bucket));
    if (!entry) return null;
    const samples = entry.cold.length + entry.warm.length;
    if (samples === 0) return null;
    return {
      warmP50Ms: median(entry.warm),
      coldP50Ms: median(entry.cold),
      samples,
    };
  }

  sampleCount(providerId: string, bucket: string): number {
    const entry = this.samples.get(ProviderCostModel.key(providerId, bucket));
    return entry ? entry.cold.length + entry.warm.length : 0;
  }
}

/* ------------------------------------------------------------------ */
/* §5.4 WinnerCache                                                    */
/* ------------------------------------------------------------------ */

export interface WinnerCacheEntry {
  providerId: string;
  expectedWarmMs: number;
  /** Cost-model sample count for the winner at decision time (audit trail). */
  decidedAtSample: number;
}

export class WinnerCache {
  private readonly entries = new Map<string, WinnerCacheEntry>();

  private static key(bucket: string, deviceHash: string): string {
    return `${bucket}::${deviceHash}`;
  }

  get(bucket: string, deviceHash: string): WinnerCacheEntry | null {
    return this.entries.get(WinnerCache.key(bucket, deviceHash)) ?? null;
  }

  set(bucket: string, deviceHash: string, entry: WinnerCacheEntry): void {
    this.entries.set(WinnerCache.key(bucket, deviceHash), entry);
  }

  delete(bucket: string, deviceHash: string): boolean {
    return this.entries.delete(WinnerCache.key(bucket, deviceHash));
  }

  /** Drops every cached decision won by `providerId` (kill-switch cleanup). */
  evictProvider(providerId: string): number {
    let evicted = 0;
    for (const [key, entry] of this.entries) {
      if (entry.providerId === providerId) {
        this.entries.delete(key);
        evicted += 1;
      }
    }
    return evicted;
  }

  get size(): number {
    return this.entries.size;
  }
}

/* ------------------------------------------------------------------ */
/* §5.5 HysteresisPolicy — <12% expected gain holds; pen-down holds    */
/* ------------------------------------------------------------------ */

export const DEFAULT_HYSTERESIS_MIN_GAIN_PCT = 12;

export type SwitchHoldReason =
  | "pen-down"
  | "no-gain"
  | "below-hysteresis-threshold"
  | "gain-above-threshold";

export interface SwitchDecision {
  allow: boolean;
  expectedGainPct: number;
  reason: SwitchHoldReason;
}

export class HysteresisPolicy {
  constructor(readonly minGainPct: number = DEFAULT_HYSTERESIS_MIN_GAIN_PCT) {
    if (!Number.isFinite(minGainPct) || minGainPct <= 0) {
      throw new RangeError(`minGainPct must be positive, got ${minGainPct}`);
    }
  }

  evaluate(input: {
    incumbentWarmMs: number;
    challengerWarmMs: number;
    penDown: boolean;
  }): SwitchDecision {
    const expectedGainPct =
      input.incumbentWarmMs > 0
        ? ((input.incumbentWarmMs - input.challengerWarmMs) / input.incumbentWarmMs) * 100
        : 0;
    if (expectedGainPct <= 0) {
      return { allow: false, expectedGainPct, reason: "no-gain" };
    }
    // The winner never switches mid-stroke, no matter how large the gain.
    if (input.penDown) {
      return { allow: false, expectedGainPct, reason: "pen-down" };
    }
    if (expectedGainPct < this.minGainPct) {
      return { allow: false, expectedGainPct, reason: "below-hysteresis-threshold" };
    }
    return { allow: true, expectedGainPct, reason: "gain-above-threshold" };
  }
}

/* ------------------------------------------------------------------ */
/* §5.6 VisualEquivalenceGate                                          */
/* ------------------------------------------------------------------ */

export interface VisualGateResult {
  pass: boolean;
  mismatchPct: number;
}

export type VisualEquivalenceGate = (
  candidatePixels: Uint8Array,
  referencePixels: Uint8Array,
  width: number,
  height: number,
) => VisualGateResult;

export const DEFAULT_GATE_FUZZY_DELTA = 48;
export const DEFAULT_GATE_MISMATCH_PCT = 0.5;

/**
 * Same algorithm as tests/visual/cross-renderer-diff.test.ts: a pixel matches
 * if any pixel of the other image within Chebyshev radius 1 agrees within
 * `fuzzyDelta` per channel, checked in both directions so extra ink and
 * missing ink both fail. AA phase shifts pass; structural divergence trips.
 */
function directionalMismatches(
  from: Uint8Array,
  to: Uint8Array,
  width: number,
  height: number,
  fuzzyDelta: number,
): number {
  let mismatches = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 4;
      let matched = false;
      for (let dy = -1; dy <= 1 && !matched; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1 && !matched; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const other = (ny * width + nx) * 4;
          let channelMax = 0;
          for (let c = 0; c < 4; c += 1) {
            const delta = Math.abs((from[base + c] ?? 0) - (to[other + c] ?? 0));
            if (delta > channelMax) channelMax = delta;
          }
          if (channelMax <= fuzzyDelta) matched = true;
        }
      }
      if (!matched) mismatches += 1;
    }
  }
  return mismatches;
}

export function createFuzzyNeighborhoodGate(options?: {
  fuzzyDelta?: number;
  mismatchPctGate?: number;
}): VisualEquivalenceGate {
  const fuzzyDelta = options?.fuzzyDelta ?? DEFAULT_GATE_FUZZY_DELTA;
  const mismatchPctGate = options?.mismatchPctGate ?? DEFAULT_GATE_MISMATCH_PCT;
  return (candidatePixels, referencePixels, width, height) => {
    const expected = width * height * 4;
    if (candidatePixels.length !== expected || referencePixels.length !== expected) {
      throw new Error(
        `pixel buffer size mismatch: expected ${expected}, got candidate=${candidatePixels.length} reference=${referencePixels.length}`,
      );
    }
    const worst = Math.max(
      directionalMismatches(candidatePixels, referencePixels, width, height, fuzzyDelta),
      directionalMismatches(referencePixels, candidatePixels, width, height, fuzzyDelta),
    );
    const mismatchPct = (worst / (width * height)) * 100;
    return { pass: mismatchPct <= mismatchPctGate, mismatchPct };
  };
}

/* ------------------------------------------------------------------ */
/* §5.7 ShadowRenderer orchestration — production output untouchable   */
/* ------------------------------------------------------------------ */

export interface ShadowComparisonReport {
  /** Gate verdict when the shadow render completed, null on shadow failure. */
  gate: VisualGateResult | null;
  /** Shadow failure message — surfaced, never swallowed silently. */
  error: string | null;
}

export interface ShadowComparisonOptions {
  winnerRender: () => Uint8Array | Promise<Uint8Array>;
  shadowRender: () => Uint8Array | Promise<Uint8Array>;
  gate: VisualEquivalenceGate;
  width: number;
  height: number;
  onReport: (report: ShadowComparisonReport) => void;
}

/**
 * Returns the winner's pixels untouched (production contract). The shadow
 * render and comparison run asynchronously and report only via `onReport`;
 * shadow exceptions become `report.error` and can never affect the winner.
 */
export async function runShadowComparison(
  options: ShadowComparisonOptions,
): Promise<Uint8Array> {
  const winnerPixels = await options.winnerRender();
  void (async () => {
    let report: ShadowComparisonReport;
    try {
      const shadowPixels = await options.shadowRender();
      report = {
        gate: options.gate(shadowPixels, winnerPixels, options.width, options.height),
        error: null,
      };
    } catch (error) {
      report = {
        gate: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    try {
      options.onReport(report);
    } catch {
      // A throwing report sink must not surface as an unhandled rejection —
      // the production-unaffected contract outranks observer hygiene.
    }
  })();
  return winnerPixels;
}

/* ------------------------------------------------------------------ */
/* §5.8 PromotionRegistry + RemoteKillSwitch                           */
/* ------------------------------------------------------------------ */

export interface PromotionEvidence {
  /** Visual equivalence gate passed against the reference renderer. */
  visualGate: boolean;
  /** Measured expected gain (percent) that beat the hysteresis threshold. */
  hysteresisGain: number;
  /** Shadow soak completed without divergence or errors. */
  soakPassed: boolean;
}

export type PromotionOutcome =
  | { promoted: true }
  | { promoted: false; reasons: string[] };

export class PromotionRegistry {
  private readonly promoted = new Map<string, PromotionEvidence>();

  constructor(readonly minGainPct: number = DEFAULT_HYSTERESIS_MIN_GAIN_PCT) {}

  promote(providerId: string, evidence: PromotionEvidence): PromotionOutcome {
    const reasons: string[] = [];
    if (!evidence.visualGate) {
      reasons.push("visual equivalence gate not passed");
    }
    if (!Number.isFinite(evidence.hysteresisGain) || evidence.hysteresisGain < this.minGainPct) {
      reasons.push(
        `hysteresis gain ${evidence.hysteresisGain}% is below the required ${this.minGainPct}%`,
      );
    }
    if (!evidence.soakPassed) {
      reasons.push("shadow soak not passed");
    }
    if (reasons.length > 0) {
      return { promoted: false, reasons };
    }
    this.promoted.set(providerId, evidence);
    return { promoted: true };
  }

  isPromoted(providerId: string): boolean {
    return this.promoted.has(providerId);
  }

  evidenceFor(providerId: string): PromotionEvidence | null {
    return this.promoted.get(providerId) ?? null;
  }

  demote(providerId: string): boolean {
    return this.promoted.delete(providerId);
  }
}

export class RemoteKillSwitch {
  private readonly killed = new Map<string, string>();

  kill(providerId: string, reason: string): void {
    this.killed.set(providerId, reason);
  }

  revive(providerId: string): boolean {
    return this.killed.delete(providerId);
  }

  isKilled(providerId: string): boolean {
    return this.killed.has(providerId);
  }

  reasonFor(providerId: string): string | null {
    return this.killed.get(providerId) ?? null;
  }

  listKilled(): Array<{ providerId: string; reason: string }> {
    return [...this.killed.entries()].map(([providerId, reason]) => ({
      providerId,
      reason,
    }));
  }
}

/* ------------------------------------------------------------------ */
/* §5.9 runTournament                                                  */
/* ------------------------------------------------------------------ */

export interface TournamentCandidate {
  providerId: string;
  render: () => Uint8Array;
}

export type TournamentDecision = "cached" | "cold-race" | "hysteresis-hold" | "switched";

export interface RaceTiming {
  providerId: string;
  warmMs: number;
  gate: VisualGateResult | null;
}

export interface TournamentStats {
  fingerprint: SceneFingerprint;
  bucket: string;
  excludedByKillSwitch: string[];
  /** Non-empty only on cold races (cached decisions never re-render). */
  raceTimings: RaceTiming[];
  /** Candidates disqualified by the visual equivalence gate this run. */
  gateFailures: string[];
  challengerId: string | null;
  expectedGainPct: number | null;
}

export interface TournamentRequest {
  scene: SceneIR;
  profile: DeviceWorkloadProfile;
  candidates: TournamentCandidate[];
  costModel: ProviderCostModel;
  winnerCache: WinnerCache;
  killSwitch: RemoteKillSwitch;
  /** Optional visual gate; requires `referenceRender` to take effect. */
  gate?: VisualEquivalenceGate;
  referenceRender?: () => Uint8Array;
  penDown?: boolean;
  hysteresis?: HysteresisPolicy;
  /** Clock injection for deterministic measurement in tests. */
  now?: () => number;
}

export interface TournamentResult {
  winnerId: string;
  decision: TournamentDecision;
  stats: TournamentStats;
}

export class TournamentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TournamentError";
  }
}

function runColdRace(
  request: TournamentRequest,
  eligible: TournamentCandidate[],
  fingerprint: SceneFingerprint,
  excludedByKillSwitch: string[],
  now: () => number,
): TournamentResult {
  const { bucket } = fingerprint;
  const referencePixels =
    request.gate && request.referenceRender ? request.referenceRender() : null;
  const raceTimings: RaceTiming[] = [];
  const gateFailures: string[] = [];
  let winner: { providerId: string; warmMs: number } | null = null;

  for (const candidate of eligible) {
    const start = now();
    const pixels = candidate.render();
    const warmMs = Math.max(0, now() - start);
    // Measurements accumulate whether or not the candidate wins — the cached
    // path later compares challengers using exactly these real samples.
    request.costModel.record(candidate.providerId, bucket, { warmMs });
    let gateResult: VisualGateResult | null = null;
    if (referencePixels && request.gate) {
      gateResult = request.gate(
        pixels,
        referencePixels,
        request.scene.width,
        request.scene.height,
      );
    }
    raceTimings.push({ providerId: candidate.providerId, warmMs, gate: gateResult });
    if (gateResult && !gateResult.pass) {
      gateFailures.push(candidate.providerId);
      continue;
    }
    if (!winner || warmMs < winner.warmMs) {
      winner = { providerId: candidate.providerId, warmMs };
    }
  }

  if (!winner) {
    throw new TournamentError(
      `bucket ${bucket}: every candidate failed the visual equivalence gate [${gateFailures.join(", ")}]`,
    );
  }

  request.winnerCache.set(bucket, request.profile.deviceHash, {
    providerId: winner.providerId,
    expectedWarmMs: winner.warmMs,
    decidedAtSample: request.costModel.sampleCount(winner.providerId, bucket),
  });

  return {
    winnerId: winner.providerId,
    decision: "cold-race",
    stats: {
      fingerprint,
      bucket,
      excludedByKillSwitch,
      raceTimings,
      gateFailures,
      challengerId: null,
      expectedGainPct: null,
    },
  };
}

export function runTournament(request: TournamentRequest): TournamentResult {
  const penDown = request.penDown ?? false;
  const hysteresis = request.hysteresis ?? new HysteresisPolicy();
  const now = request.now ?? ((): number => performance.now());
  const fingerprint = computeSceneFingerprint(request.scene);
  const { bucket } = fingerprint;

  const excludedByKillSwitch = request.candidates
    .filter((candidate) => request.killSwitch.isKilled(candidate.providerId))
    .map((candidate) => candidate.providerId);
  const eligible = request.candidates.filter(
    (candidate) => !request.killSwitch.isKilled(candidate.providerId),
  );
  if (eligible.length === 0) {
    throw new TournamentError(
      `bucket ${bucket}: no eligible candidates (kill switch removed [${excludedByKillSwitch.join(", ")}])`,
    );
  }

  const cached = request.winnerCache.get(bucket, request.profile.deviceHash);
  const incumbent =
    cached && eligible.some((candidate) => candidate.providerId === cached.providerId)
      ? cached
      : null;

  // No usable cached winner (first sight of this bucket/device, or the cached
  // winner was killed/withdrawn) → cold race with real measurements.
  if (!incumbent) {
    return runColdRace(request, eligible, fingerprint, excludedByKillSwitch, now);
  }

  const baseStats: TournamentStats = {
    fingerprint,
    bucket,
    excludedByKillSwitch,
    raceTimings: [],
    gateFailures: [],
    challengerId: null,
    expectedGainPct: null,
  };

  // Challengers compete only with real accumulated measurements; a candidate
  // without samples in this bucket has no estimate and cannot challenge.
  const incumbentWarmMs =
    request.costModel.estimate(incumbent.providerId, bucket)?.warmP50Ms ??
    incumbent.expectedWarmMs;
  let challenger: { providerId: string; warmMs: number } | null = null;
  for (const candidate of eligible) {
    if (candidate.providerId === incumbent.providerId) continue;
    const warmP50Ms = request.costModel.estimate(candidate.providerId, bucket)?.warmP50Ms;
    if (warmP50Ms === null || warmP50Ms === undefined) continue;
    if (!challenger || warmP50Ms < challenger.warmMs) {
      challenger = { providerId: candidate.providerId, warmMs: warmP50Ms };
    }
  }

  if (!challenger) {
    return { winnerId: incumbent.providerId, decision: "cached", stats: baseStats };
  }

  const decision = hysteresis.evaluate({
    incumbentWarmMs,
    challengerWarmMs: challenger.warmMs,
    penDown,
  });
  const stats: TournamentStats = {
    ...baseStats,
    challengerId: challenger.providerId,
    expectedGainPct: decision.expectedGainPct,
  };

  if (decision.allow) {
    request.winnerCache.set(bucket, request.profile.deviceHash, {
      providerId: challenger.providerId,
      expectedWarmMs: challenger.warmMs,
      decidedAtSample: request.costModel.sampleCount(challenger.providerId, bucket),
    });
    return { winnerId: challenger.providerId, decision: "switched", stats };
  }

  // Not switching. A challenger that is not actually faster is just the
  // cached steady state; a faster-but-held challenger is a hysteresis hold
  // (either <12% expected gain or pen-down).
  if (decision.reason === "no-gain") {
    return { winnerId: incumbent.providerId, decision: "cached", stats };
  }
  return { winnerId: incumbent.providerId, decision: "hysteresis-hold", stats };
}
