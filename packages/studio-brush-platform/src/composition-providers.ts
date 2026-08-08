import {
  composeMat2d,
  pathBounds,
  rotateMat2d,
  scaleMat2d,
  transformPathIR,
  translateMat2d,
} from "@toonspectrum/studio-project-model";

import type {
  ModeledSampleIR,
  PathIR,
  PathVerbIR,
} from "@toonspectrum/studio-project-model";

/**
 * Composition geometry providers — V12 §12.2 rows 9–12 (장식·패턴 / 파티클 /
 * 리본·헤어·로프 / 텍스트 브러시).
 *
 * Each provider turns the stabilized stroke samples into a single PathIR that
 * the existing `vector-fill` engine stage renders through Vello CPU, so the
 * rows produce REAL pixels on the same canvas, through the same composite
 * stage, as the eight rows that shipped first. No new runtime dependency is
 * introduced: the arc-length walker, the seeded PRNG and the XPBD solver are
 * self-contained, and the glyph shaper is injected through the engine boundary
 * (studio-engine-vello's parley lane).
 *
 * Contracts shared by every provider here:
 * - Deterministic. The only stochastic provider (particles) draws from a
 *   seeded mulberry32 stream whose draw ORDER is fixed by emission order;
 *   `Math.random` is never called.
 * - Pressure-aware. Every provider maps sample pressure onto an ink-mass
 *   dimension (instance scale / splat radius / ribbon width / glyph scale) so
 *   the §12.2 필압 응답 gate holds.
 * - Loud. A provider that cannot produce geometry returns an empty verb list
 *   and lets the executor's zero-ink contract fail the chain — never a
 *   silent fallback shape.
 */

// ---------------------------------------------------------------------------
// Shared arc-length machinery
// ---------------------------------------------------------------------------

/** A point resolved at some arc-length position along the sample polyline. */
export interface ArcPoint {
  x: number;
  y: number;
  /** Unit tangent (px-space, y-down). */
  tx: number;
  ty: number;
  /** Pressure carried from the driving samples (linear in arc length). */
  pressure: number;
}

export interface ArcTable {
  samples: readonly ModeledSampleIR[];
  /** cumulative[i] = arc length from sample 0 to sample i. */
  cumulative: number[];
  totalLength: number;
}

/** Cumulative arc-length table over the stabilized sample polyline. */
export function buildArcTable(samples: readonly ModeledSampleIR[]): ArcTable {
  const cumulative: number[] = [0];
  let total = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (previous === undefined || current === undefined) continue;
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
    cumulative.push(total);
  }
  return { samples, cumulative, totalLength: total };
}

/**
 * Resolve position, unit tangent and pressure at arc length `s`. The tangent
 * comes from the containing segment; degenerate (zero-length) segments walk
 * forward to the next segment that has a direction, and a fully degenerate
 * polyline reports the fixed +x tangent so callers stay deterministic.
 */
export function arcPointAt(table: ArcTable, s: number): ArcPoint {
  const { samples, cumulative } = table;
  const clamped = Math.min(Math.max(s, 0), table.totalLength);
  let index = 0;
  // Linear scan is intentional: callers walk s monotonically and the sample
  // counts here are in the hundreds; a binary search would not change the
  // measured throughput but would add an off-by-one surface.
  while (index < cumulative.length - 2 && (cumulative[index + 1] ?? 0) < clamped) {
    index += 1;
  }
  const from = samples[index] ?? samples[0];
  const to = samples[index + 1] ?? from;
  if (from === undefined || to === undefined) {
    return { x: 0, y: 0, tx: 1, ty: 0, pressure: 0 };
  }
  const s0 = cumulative[index] ?? 0;
  const s1 = cumulative[index + 1] ?? s0;
  const span = s1 - s0;
  const t = span > 0 ? Math.min(1, Math.max(0, (clamped - s0) / span)) : 0;
  let tx = to.x - from.x;
  let ty = to.y - from.y;
  let length = Math.hypot(tx, ty);
  for (let probe = index + 1; length <= 1e-9 && probe < samples.length - 1; probe += 1) {
    const a = samples[probe];
    const b = samples[probe + 1];
    if (a === undefined || b === undefined) break;
    tx = b.x - a.x;
    ty = b.y - a.y;
    length = Math.hypot(tx, ty);
  }
  if (length <= 1e-9) {
    tx = 1;
    ty = 0;
    length = 1;
  }
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    tx: tx / length,
    ty: ty / length,
    pressure: Math.min(1, Math.max(0, from.pressure + (to.pressure - from.pressure) * t)),
  };
}

/** Deterministic 32-bit PRNG (mulberry32) — integer ops only, no platform drift. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function appendPath(target: PathVerbIR[], path: PathIR): void {
  for (const verb of path.verbs) target.push(verb);
}

/** Regular N-gon approximating a disc — the CPU particle splat primitive. */
function appendDisc(
  target: PathVerbIR[],
  cx: number,
  cy: number,
  radius: number,
  sides: number,
): void {
  for (let step = 0; step < sides; step += 1) {
    const angle = (2 * Math.PI * step) / sides;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    target.push(step === 0 ? { v: "M", x, y } : { v: "L", x, y });
  }
  target.push({ v: "Z" });
}

/**
 * Ribbon polygon around a strand polyline: left offsets forward, right offsets
 * backward, closed. Per-point half-widths let pressure taper the ribbon.
 */
function appendRibbon(
  target: PathVerbIR[],
  points: ReadonlyArray<{ x: number; y: number; halfWidth: number }>,
): boolean {
  if (points.length < 2) return false;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    if (current === undefined) continue;
    const previous = points[Math.max(0, index - 1)] ?? current;
    const next = points[Math.min(points.length - 1, index + 1)] ?? current;
    let dx = next.x - previous.x;
    let dy = next.y - previous.y;
    const length = Math.hypot(dx, dy);
    if (length <= 1e-9) {
      dx = 1;
      dy = 0;
    } else {
      dx /= length;
      dy /= length;
    }
    const nx = -dy;
    const ny = dx;
    left.push([current.x + nx * current.halfWidth, current.y + ny * current.halfWidth]);
    right.push([current.x - nx * current.halfWidth, current.y - ny * current.halfWidth]);
  }
  if (left.length < 2) return false;
  const first = left[0];
  if (first === undefined) return false;
  target.push({ v: "M", x: first[0], y: first[1] });
  for (let index = 1; index < left.length; index += 1) {
    const point = left[index];
    if (point !== undefined) target.push({ v: "L", x: point[0], y: point[1] });
  }
  for (let index = right.length - 1; index >= 0; index -= 1) {
    const point = right[index];
    if (point !== undefined) target.push({ v: "L", x: point[0], y: point[1] });
  }
  target.push({ v: "Z" });
  return true;
}

/** Composed placement transform: motif-local origin → rotated, scaled path point. */
function placementMatrix(
  point: ArcPoint,
  scale: number,
  alignToTangent: boolean,
  originX: number,
  originY: number,
): ReturnType<typeof translateMat2d> {
  const angleDeg = alignToTangent
    ? (Math.atan2(point.ty, point.tx) * 180) / Math.PI
    : 0;
  let matrix = translateMat2d(point.x, point.y);
  matrix = composeMat2d(matrix, rotateMat2d(angleDeg));
  matrix = composeMat2d(matrix, scaleMat2d(scale, scale));
  matrix = composeMat2d(matrix, translateMat2d(-originX, -originY));
  return matrix;
}

/** Every provider reports what it produced so the layer report stays honest. */
export interface ProviderGeometry {
  path: PathIR;
  /** Stamps / particles / strands / glyphs actually emitted. */
  instances: number;
}

// ---------------------------------------------------------------------------
// 장식·패턴 — arc-length pattern stamping
// ---------------------------------------------------------------------------

export interface PatternStampParams {
  /** Motif outline in any coordinate frame; normalized by its own bounds. */
  motif: PathIR;
  spacingPx: number;
  sizePx: number;
  sizePressure: number;
  alignToTangent: boolean;
  phase: number;
}

/**
 * Re-sample the stroke by arc length and stamp one motif instance per site,
 * rotated onto the local tangent and scaled by pressure. The motif is
 * normalized so `sizePx` always means "bounding-box height at pressure 1",
 * which makes SVG-authored motifs (studio-format-gateway `parseSvgToScene` →
 * `PathIR`) drop in without hand-tuned scale factors.
 */
export function stampPatternAlongPath(
  samples: readonly ModeledSampleIR[],
  params: PatternStampParams,
): ProviderGeometry {
  const verbs: PathVerbIR[] = [];
  const bounds = pathBounds(params.motif);
  const table = buildArcTable(samples);
  if (bounds === null || table.totalLength <= 0) {
    return { path: { verbs }, instances: 0 };
  }
  const extent = Math.max(bounds.maxY - bounds.minY, bounds.maxX - bounds.minX);
  if (!(extent > 0)) return { path: { verbs }, instances: 0 };
  const originX = (bounds.minX + bounds.maxX) / 2;
  const originY = (bounds.minY + bounds.maxY) / 2;
  const unitScale = params.sizePx / extent;
  let instances = 0;
  for (
    let s = params.phase * params.spacingPx;
    s <= table.totalLength;
    s += params.spacingPx
  ) {
    const point = arcPointAt(table, s);
    const pressureScale =
      1 - params.sizePressure + params.sizePressure * point.pressure;
    const scale = unitScale * pressureScale;
    if (!(scale > 0)) continue;
    appendPath(
      verbs,
      transformPathIR(
        params.motif,
        placementMatrix(point, scale, params.alignToTangent, originX, originY),
      ),
    );
    instances += 1;
  }
  return { path: { verbs }, instances };
}

// ---------------------------------------------------------------------------
// 파티클 — deterministic CPU reference particle system
// ---------------------------------------------------------------------------

export interface ParticleSplatParams {
  emissionSpacingPx: number;
  particlesPerSite: number;
  lifetimeMs: number;
  stepMs: number;
  gravityPxPerMs2: number;
  drag: number;
  speedPxPerMs: number;
  /** How much pressure widens the spray cone (0 = pressure-independent). */
  speedPressure: number;
  radiusPx: number;
  radiusPressure: number;
  seed: number;
}

const PARTICLE_SPLAT_SIDES = 8;

/**
 * CPU reference of the §12.2 particle lane: emit at fixed arc-length sites,
 * integrate each particle semi-implicitly (gravity + linear drag) over its own
 * lifetime with a fixed step, then splat the end-of-life position.
 *
 * Fixed step + fixed emission order + a seeded PRNG make this bit-exact and
 * portable, which is exactly the reference a GPU compute port has to match;
 * the WGSL lane (studio-engine-registry `wgsl-variants`) can be validated
 * against these positions before it is allowed to replace anything.
 */
export function simulateParticleSplats(
  samples: readonly ModeledSampleIR[],
  params: ParticleSplatParams,
): ProviderGeometry {
  const verbs: PathVerbIR[] = [];
  const table = buildArcTable(samples);
  if (table.totalLength <= 0) return { path: { verbs }, instances: 0 };
  const random = mulberry32(params.seed);
  const steps = Math.max(1, Math.round(params.lifetimeMs / params.stepMs));
  let instances = 0;
  for (let s = 0; s <= table.totalLength; s += params.emissionSpacingPx) {
    const site = arcPointAt(table, s);
    // Normal of the local tangent — the spray plane of the emitter.
    const nx = -site.ty;
    const ny = site.tx;
    for (let slot = 0; slot < params.particlesPerSite; slot += 1) {
      const lateral = random() * 2 - 1;
      const along = random() * 2 - 1;
      const lifeScale = 0.35 + 0.65 * random();
      // Size jitter stays narrow on purpose: it is grain, not mass. A wide
      // band drowns the pressure→ink-mass signal in per-particle noise (the
      // §12.2 필압 gate measured 0.60 correlation at ±55%, 0.9+ at ±15%).
      const sizeJitter = 0.85 + 0.3 * random();
      // Pressure widens the cone as well as fattening the grain. Without it
      // the spray band stays a fixed height, high-pressure splats saturate it
      // and column mass plateaus — measured 0.80 correlation on the §12.2
      // ramp, versus 0.9+ once the band grows with pressure.
      const speed =
        params.speedPxPerMs *
        (1 - params.speedPressure + params.speedPressure * site.pressure);
      let x = site.x;
      let y = site.y;
      let vx = (nx * lateral + site.tx * along * 0.5) * speed;
      let vy = (ny * lateral + site.ty * along * 0.5) * speed;
      const liveSteps = Math.max(1, Math.round(steps * lifeScale));
      for (let step = 0; step < liveSteps; step += 1) {
        vy += params.gravityPxPerMs2 * params.stepMs;
        vx *= 1 - params.drag;
        vy *= 1 - params.drag;
        x += vx * params.stepMs;
        y += vy * params.stepMs;
      }
      const pressureScale =
        1 - params.radiusPressure + params.radiusPressure * site.pressure;
      const radius = params.radiusPx * pressureScale * sizeJitter;
      if (!(radius > 0)) continue;
      appendDisc(verbs, x, y, radius, PARTICLE_SPLAT_SIDES);
      instances += 1;
    }
  }
  return { path: { verbs }, instances };
}

// ---------------------------------------------------------------------------
// 리본·헤어·로프 — XPBD guide-curve solver
// ---------------------------------------------------------------------------

export interface RibbonXpbdParams {
  strands: number;
  restLengthPx: number;
  iterations: number;
  compliance: number;
  gravityPxPerMs2: number;
  damping: number;
  widthPx: number;
  widthPressure: number;
  taper: number;
  substepMs: number;
}

/**
 * Position-based dynamics (XPBD, Macklin et al. 2016) over a guide curve.
 *
 * Node 0 is kinematic: it is pinned to the stroke sample of the current step,
 * so the stroke IS the guide curve. Nodes 1..n-1 are free, integrated
 * semi-implicitly, then corrected by `iterations` Gauss–Seidel projections of
 * the distance constraint with the XPBD compliance term
 * `α̃ = compliance / dt²` and a per-constraint Lagrange multiplier reset each
 * substep. Velocities are recovered from the positional delta, which is what
 * makes the trailing strands lag and swing like hair or rope.
 *
 * Every node's track is recorded per step, so the provider paints N lagging
 * strands rather than a single final pose. Fully deterministic: no random
 * numbers, fixed iteration order, fixed hang-down initial state.
 */
export function solveRibbonStrands(
  samples: readonly ModeledSampleIR[],
  params: RibbonXpbdParams,
): ProviderGeometry {
  const verbs: PathVerbIR[] = [];
  const first = samples[0];
  if (first === undefined || samples.length < 2) {
    return { path: { verbs }, instances: 0 };
  }
  const nodeCount = params.strands;
  const positionX = new Float64Array(nodeCount);
  const positionY = new Float64Array(nodeCount);
  const velocityX = new Float64Array(nodeCount);
  const velocityY = new Float64Array(nodeCount);
  for (let node = 0; node < nodeCount; node += 1) {
    positionX[node] = first.x;
    // Hang the chain downward so the first distance projection has a defined
    // direction — a coincident initial state would be a degenerate normal.
    positionY[node] = first.y + node * params.restLengthPx;
  }
  const tracks: Array<Array<{ x: number; y: number; halfWidth: number }>> = [];
  for (let node = 0; node < nodeCount; node += 1) tracks.push([]);

  const dt = params.substepMs;
  const alphaTilde = params.compliance / (dt * dt);
  const lambda = new Float64Array(Math.max(0, nodeCount - 1));
  const predictedX = new Float64Array(nodeCount);
  const predictedY = new Float64Array(nodeCount);

  for (const sample of samples) {
    lambda.fill(0);
    for (let node = 0; node < nodeCount; node += 1) {
      predictedX[node] = positionX[node] ?? 0;
      predictedY[node] = positionY[node] ?? 0;
    }
    // Kinematic head: the guide curve drives node 0 exactly.
    predictedX[0] = sample.x;
    predictedY[0] = sample.y;
    for (let node = 1; node < nodeCount; node += 1) {
      const vx = (velocityX[node] ?? 0) * (1 - params.damping);
      const vy =
        ((velocityY[node] ?? 0) + params.gravityPxPerMs2 * dt) * (1 - params.damping);
      predictedX[node] = (positionX[node] ?? 0) + vx * dt;
      predictedY[node] = (positionY[node] ?? 0) + vy * dt;
    }
    for (let iteration = 0; iteration < params.iterations; iteration += 1) {
      for (let constraint = 0; constraint < nodeCount - 1; constraint += 1) {
        const a = constraint;
        const b = constraint + 1;
        // Node 0 is kinematic (infinite mass), every other node has w = 1.
        const wa = a === 0 ? 0 : 1;
        const wb = 1;
        let dx = (predictedX[b] ?? 0) - (predictedX[a] ?? 0);
        let dy = (predictedY[b] ?? 0) - (predictedY[a] ?? 0);
        let distance = Math.hypot(dx, dy);
        if (distance <= 1e-9) {
          dx = 0;
          dy = 1;
          distance = 1;
        } else {
          dx /= distance;
          dy /= distance;
        }
        const error = distance - params.restLengthPx;
        const denominator = wa + wb + alphaTilde;
        if (denominator <= 0) continue;
        const deltaLambda =
          (-error - alphaTilde * (lambda[constraint] ?? 0)) / denominator;
        lambda[constraint] = (lambda[constraint] ?? 0) + deltaLambda;
        predictedX[a] = (predictedX[a] ?? 0) - wa * deltaLambda * dx;
        predictedY[a] = (predictedY[a] ?? 0) - wa * deltaLambda * dy;
        predictedX[b] = (predictedX[b] ?? 0) + wb * deltaLambda * dx;
        predictedY[b] = (predictedY[b] ?? 0) + wb * deltaLambda * dy;
      }
    }
    for (let node = 0; node < nodeCount; node += 1) {
      velocityX[node] = ((predictedX[node] ?? 0) - (positionX[node] ?? 0)) / dt;
      velocityY[node] = ((predictedY[node] ?? 0) - (positionY[node] ?? 0)) / dt;
      positionX[node] = predictedX[node] ?? 0;
      positionY[node] = predictedY[node] ?? 0;
      const strandTaper =
        nodeCount > 1 ? 1 - (params.taper * node) / (nodeCount - 1) : 1;
      const pressureScale =
        1 - params.widthPressure + params.widthPressure * sample.pressure;
      tracks[node]?.push({
        x: positionX[node] ?? 0,
        y: positionY[node] ?? 0,
        halfWidth: Math.max(0.05, (params.widthPx * strandTaper * pressureScale) / 2),
      });
    }
  }

  let instances = 0;
  for (const track of tracks) {
    if (appendRibbon(verbs, track)) instances += 1;
  }
  return { path: { verbs }, instances };
}

// ---------------------------------------------------------------------------
// 텍스트 브러시 — glyph run laid on the brush path
// ---------------------------------------------------------------------------

/** One shaped glyph: outline already offset to (x, y) in layout space. */
export interface CompositionShapedGlyph {
  x: number;
  y: number;
  path: PathIR;
}

export interface CompositionShapedText {
  width: number;
  height: number;
  lineCount: number;
  glyphs: readonly CompositionShapedGlyph[];
}

/**
 * Structural glyph-shaper boundary. `shapeTextToGlyphPaths` (parley + skrifa,
 * studio-engine-vello) satisfies it directly; the host closes over the font
 * bytes and may front it with the package's LRU (`shapeTextCached`).
 */
export interface CompositionTextEngine {
  shapeText(
    text: string,
    options: { fontSizePx: number; maxWidthPx: number },
  ): CompositionShapedText;
}

export interface TextOnPathParams {
  text: string;
  fontSizePx: number;
  letterSpacingPx: number;
  repeat: boolean;
  alignToTangent: boolean;
  sizePressure: number;
  baselineOffsetPx: number;
}

export interface TextOnPathResult extends ProviderGeometry {
  /** Lines the shaper produced — > 1 means the run was wrapped, not laid out. */
  lineCount: number;
  /** Glyphs the shaper emitted for one run (blanks included). */
  runGlyphs: number;
}

/** Single-line shaping width: the run is laid on the path, never wrapped. */
const TEXT_RUN_MAX_WIDTH_PX = 1e6;

/**
 * Lay a shaped glyph run along the stroke by arc length.
 *
 * Each glyph keeps its font-metric advance (`glyph.x` from the shaper) as its
 * arc-length offset, so kerning and shaping survive the bend; the glyph is
 * moved from its layout pen origin to the path point, rotated onto the local
 * tangent and scaled by pressure. Glyphs with empty outlines (spaces) advance
 * without stamping. With `repeat`, runs are chained until the path is covered.
 */
export function layTextOnPath(
  samples: readonly ModeledSampleIR[],
  engine: CompositionTextEngine,
  params: TextOnPathParams,
): TextOnPathResult {
  const verbs: PathVerbIR[] = [];
  const table = buildArcTable(samples);
  const shaped = engine.shapeText(params.text, {
    fontSizePx: params.fontSizePx,
    maxWidthPx: TEXT_RUN_MAX_WIDTH_PX,
  });
  const runGlyphs = shaped.glyphs.length;
  if (table.totalLength <= 0 || runGlyphs === 0) {
    return {
      path: { verbs },
      instances: 0,
      lineCount: shaped.lineCount,
      runGlyphs,
    };
  }
  const runAdvance =
    Math.max(shaped.width, 1) + params.letterSpacingPx * (runGlyphs + 1);
  const runCount = params.repeat
    ? Math.max(1, Math.ceil(table.totalLength / runAdvance))
    : 1;
  let instances = 0;
  for (let run = 0; run < runCount; run += 1) {
    const runOrigin = run * runAdvance;
    for (const [index, glyph] of shaped.glyphs.entries()) {
      const s = runOrigin + glyph.x + params.letterSpacingPx * index;
      if (s > table.totalLength) break;
      if (glyph.path.verbs.length === 0) continue;
      const point = arcPointAt(table, s);
      const scale =
        1 - params.sizePressure + params.sizePressure * point.pressure;
      if (!(scale > 0)) continue;
      // Baseline offset rides the path normal so it stays perpendicular
      // through the bends instead of drifting in screen space.
      const offset: ArcPoint = {
        ...point,
        x: point.x + -point.ty * params.baselineOffsetPx,
        y: point.y + point.tx * params.baselineOffsetPx,
      };
      appendPath(
        verbs,
        transformPathIR(
          glyph.path,
          placementMatrix(
            offset,
            scale,
            params.alignToTangent,
            glyph.x,
            glyph.y,
          ),
        ),
      );
      instances += 1;
    }
  }
  return { path: { verbs }, instances, lineCount: shaped.lineCount, runGlyphs };
}
