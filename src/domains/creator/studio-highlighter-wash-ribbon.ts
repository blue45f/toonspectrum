/**
 * One-wash highlighter geometry shared by active Canvas, retained Canvas and SVG export.
 *
 * A translucent marker must not be painted as a chain of independently alpha-blended capsules:
 * every joint and self-intersection then receives pigment more than once. A single outline is not
 * sufficient either: a retrace or tight U-turn can make its two sides cross/cancel under the
 * non-zero winding rule. This planner instead emits same-winding segment bodies, joins and caps as
 * one compound path. The renderer still submits exactly one fill operation, so every point in one
 * gesture receives at most one wash while separate DrawEls retain normal multiply glazing.
 */

import type {
  StudioFxPressurePathPlan,
  StudioFxPressurePathSegment,
} from "./studio-fx-brush";

export const STUDIO_HIGHLIGHTER_WASH_RIBBON_VERSION =
  "highlighter-wash-ribbon-v2" as const;

export type StudioHighlighterWashBrushId =
  | "highlighter"
  | "chisel-highlighter"
  | "pastel-highlighter";

export type StudioHighlighterCapProfile =
  | "round-superellipse"
  | "soft-flat"
  | "pastel-natural";

export function resolveStudioHighlighterWashBrushId(
  value: unknown,
): StudioHighlighterWashBrushId {
  return value === "chisel-highlighter" || value === "pastel-highlighter"
    ? value
    : "highlighter";
}

export interface StudioHighlighterWashRun {
  /** One same-winding closed coverage polygon inside the gesture's compound fill. */
  readonly outlinePoints: readonly number[];
  readonly flattenedSegmentCount: number;
  readonly role: "body" | "join" | "start-cap" | "end-cap" | "tap";
}

export interface StudioHighlighterWashPlan {
  readonly version: typeof STUDIO_HIGHLIGHTER_WASH_RIBBON_VERSION;
  readonly brushId: StudioHighlighterWashBrushId;
  readonly capProfile: StudioHighlighterCapProfile;
  readonly gesture: "stroke" | "tap";
  readonly sourceSegmentCount: number;
  readonly flattenedSegmentCount: number;
  readonly capped: boolean;
  /**
   * Whole-gesture pigment response. Width remains local, but alpha is intentionally one wash
   * value so self-crossings cannot build up inside a single DrawEl.
   */
  readonly opacityScale: number;
  readonly runs: readonly StudioHighlighterWashRun[];
}

export interface StudioHighlighterWashPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface FlatSection {
  readonly from: Point;
  readonly to: Point;
  readonly halfWidth: number;
  readonly opacityScale: number;
}

interface Direction {
  readonly x: number;
  readonly y: number;
}

interface CapSettings {
  readonly extensionScale: number;
  readonly exponent: number;
  readonly roughness: number;
}

const COORDINATE_LIMIT = 1_000_000_000;
const WIDTH_LIMIT = 4_096;
const POINT_EPSILON = 1e-6;
const CONTINUITY_EPSILON = 1e-4;
const MAX_FLATTENED_SEGMENTS = 262_144;
const MAX_SUBDIVISIONS_PER_SEGMENT = 16;
const CAP_STEPS = 18;
const JOIN_STEPS = 12;
const TAP_STEPS = 28;
const QUANTIZE_SCALE = 10_000;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantize(value: number): number {
  const result = Math.round(value * QUANTIZE_SCALE) / QUANTIZE_SCALE;
  return Object.is(result, -0) ? 0 : result;
}

function finiteCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    : null;
}

function finiteWidth(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? clamp(value, 0.5, WIDTH_LIMIT)
    : null;
}

function normalizedDirection(from: Point, to: Point): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= POINT_EPSILON) return null;
  return Object.freeze({ x: dx / length, y: dy / length });
}

function samePoint(left: Point, right: Point): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) <= CONTINUITY_EPSILON;
}

function highlighterCapProfile(
  brushId: StudioHighlighterWashBrushId,
): StudioHighlighterCapProfile {
  if (brushId === "chisel-highlighter") return "soft-flat";
  if (brushId === "pastel-highlighter") return "pastel-natural";
  return "round-superellipse";
}

function capSettings(profile: StudioHighlighterCapProfile): CapSettings {
  switch (profile) {
    case "soft-flat":
      return Object.freeze({
        // A compact outward bulge keeps the broad nib readable without a hard rectangular seam.
        extensionScale: 0.2,
        exponent: 3.6,
        roughness: 0,
      });
    case "pastel-natural":
      return Object.freeze({
        extensionScale: 0.68,
        exponent: 1.9,
        roughness: 0.055,
      });
    case "round-superellipse":
      return Object.freeze({
        // Slightly flatter than a circle, like a compressed felt nib rather than a UI capsule.
        extensionScale: 0.76,
        exponent: 2.25,
        roughness: 0,
      });
  }
}

function signedUnitNoise(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt + 17, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return ((value >>> 0) / 0xffff_ffff) * 2 - 1;
}

function roughScale(
  profile: StudioHighlighterCapProfile,
  index: number,
  salt: number,
): number {
  const amount = capSettings(profile).roughness;
  return amount === 0 ? 1 : 1 + signedUnitNoise(index, salt) * amount;
}

function pointAt(
  segment: StudioFxPressurePathSegment,
  progress: number,
): Point {
  const t = clamp(progress, 0, 1);
  const inverse = 1 - t;
  if (segment.command === "cubic") {
    return Object.freeze({
      x: inverse ** 3 * segment.moveX
        + 3 * inverse * inverse * t * segment.control1X
        + 3 * inverse * t * t * segment.control2X
        + t ** 3 * segment.endX,
      y: inverse ** 3 * segment.moveY
        + 3 * inverse * inverse * t * segment.control1Y
        + 3 * inverse * t * t * segment.control2Y
        + t ** 3 * segment.endY,
    });
  }
  if (segment.command === "quadratic") {
    return Object.freeze({
      x: inverse * inverse * segment.moveX
        + 2 * inverse * t * segment.controlX
        + t * t * segment.endX,
      y: inverse * inverse * segment.moveY
        + 2 * inverse * t * segment.controlY
        + t * t * segment.endY,
    });
  }
  return Object.freeze({
    x: segment.moveX + (segment.endX - segment.moveX) * t,
    y: segment.moveY + (segment.endY - segment.moveY) * t,
  });
}

function pointLineDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= POINT_EPSILON) return Math.hypot(point.x - start.x, point.y - start.y);
  return Math.abs(
    dy * point.x
    - dx * point.y
    + end.x * start.y
    - end.y * start.x,
  ) / length;
}

function flattenSubdivisionCount(
  segment: StudioFxPressurePathSegment,
  baseWidth: number,
): number {
  if (segment.command === "line") return 1;
  const start = { x: segment.moveX, y: segment.moveY };
  const end = { x: segment.endX, y: segment.endY };
  const flatness = segment.command === "cubic"
    ? Math.max(
        pointLineDistance(
          { x: segment.control1X, y: segment.control1Y },
          start,
          end,
        ),
        pointLineDistance(
          { x: segment.control2X, y: segment.control2Y },
          start,
          end,
        ),
      )
    : pointLineDistance(
        { x: segment.controlX, y: segment.controlY },
        start,
        end,
      );
  const tolerance = clamp(baseWidth * 0.025, 0.1, 0.55);
  if (!Number.isFinite(flatness) || flatness <= tolerance) return 1;
  return clamp(
    2 ** Math.ceil(Math.log2(Math.sqrt(flatness / tolerance))),
    1,
    MAX_SUBDIVISIONS_PER_SEGMENT,
  );
}

function flattenPressurePath(
  pressurePath: StudioFxPressurePathPlan,
  baseWidth: number,
): { sections: readonly FlatSection[]; capped: boolean } {
  const sections: FlatSection[] = [];
  let capped = false;
  for (const segment of pressurePath.segments) {
    const widthScale = Number.isFinite(segment.widthScale)
      ? clamp(segment.widthScale, 0.025, WIDTH_LIMIT / baseWidth)
      : 1;
    const opacityScale = Number.isFinite(segment.opacityScale)
      ? clamp(segment.opacityScale, 0, 1)
      : 1;
    const subdivisions = flattenSubdivisionCount(segment, baseWidth);
    let from = pointAt(segment, 0);
    for (let index = 1; index <= subdivisions; index += 1) {
      if (sections.length >= MAX_FLATTENED_SEGMENTS) {
        capped = true;
        return { sections: Object.freeze(sections), capped };
      }
      const to = pointAt(segment, index / subdivisions);
      if (normalizedDirection(from, to)) {
        sections.push(Object.freeze({
          from,
          to,
          halfWidth: clamp(baseWidth * widthScale / 2, 0.25, WIDTH_LIMIT / 2),
          opacityScale,
        }));
      }
      from = to;
    }
  }
  return { sections: Object.freeze(sections), capped };
}

function splitContinuousRuns(
  sections: readonly FlatSection[],
): readonly (readonly FlatSection[])[] {
  const runs: FlatSection[][] = [];
  let active: FlatSection[] = [];
  for (const section of sections) {
    const previous = active.at(-1);
    if (previous && !samePoint(previous.to, section.from)) {
      runs.push(active);
      active = [];
    }
    active.push(section);
  }
  if (active.length > 0) runs.push(active);
  return Object.freeze(runs.map((run) => Object.freeze(run)));
}

function signedPower(value: number, exponent: number): number {
  if (value === 0) return 0;
  return Math.sign(value) * Math.abs(value) ** exponent;
}

function polygonSignedArea(points: readonly number[]): number {
  let area = 0;
  for (let index = 0; index + 1 < points.length; index += 2) {
    const nextIndex = (index + 2) % points.length;
    area += points[index]! * points[nextIndex + 1]!
      - points[nextIndex]! * points[index + 1]!;
  }
  return area / 2;
}

/**
 * Non-zero compound paths behave as a geometric union only when every overlapping subpath has
 * the same winding. Normalise here because reversed input segments otherwise cancel an exact
 * retrace even though the renderer performs only one fill.
 */
function sameWinding(points: readonly number[]): readonly number[] {
  if (polygonSignedArea(points) >= 0) return Object.freeze([...points]);
  const reversed: number[] = [];
  for (let index = points.length - 2; index >= 0; index -= 2) {
    reversed.push(points[index]!, points[index + 1]!);
  }
  return Object.freeze(reversed);
}

function footprintOutline(
  center: Point,
  direction: Direction,
  radius: number,
  profile: StudioHighlighterCapProfile,
  salt: number,
  steps: number,
  extensionScale = capSettings(profile).extensionScale,
): readonly number[] {
  const settings = capSettings(profile);
  const normal = { x: -direction.y, y: direction.x };
  const points: number[] = [];
  for (let step = 0; step < steps; step += 1) {
    const angle = Math.PI * 2 * (step / steps);
    const shapeExponent = 2 / settings.exponent;
    const along = signedPower(Math.cos(angle), shapeExponent)
      * radius
      * extensionScale;
    const across = signedPower(Math.sin(angle), shapeExponent) * radius;
    const rough = roughScale(profile, step, salt);
    points.push(
      quantize(center.x + (direction.x * along + normal.x * across) * rough),
      quantize(center.y + (direction.y * along + normal.y * across) * rough),
    );
  }
  return sameWinding(points);
}

function bodyOutline(section: FlatSection): readonly number[] {
  const direction = normalizedDirection(section.from, section.to)!;
  const normal = { x: -direction.y, y: direction.x };
  const offsetX = normal.x * section.halfWidth;
  const offsetY = normal.y * section.halfWidth;
  return sameWinding([
    quantize(section.from.x + offsetX),
    quantize(section.from.y + offsetY),
    quantize(section.to.x + offsetX),
    quantize(section.to.y + offsetY),
    quantize(section.to.x - offsetX),
    quantize(section.to.y - offsetY),
    quantize(section.from.x - offsetX),
    quantize(section.from.y - offsetY),
  ]);
}

function joinDirection(previous: Direction, next: Direction): Direction {
  const x = previous.x + next.x;
  const y = previous.y + next.y;
  const length = Math.hypot(x, y);
  // An exact reversal has no stable bisector. The following segment is deterministic and the
  // join is circular, so its orientation does not affect coverage.
  return length <= POINT_EPSILON
    ? next
    : Object.freeze({ x: x / length, y: y / length });
}

function compoundCoverage(
  sections: readonly FlatSection[],
  profile: StudioHighlighterCapProfile,
  runIndex: number,
): readonly StudioHighlighterWashRun[] {
  const directions = sections.map((section) => normalizedDirection(section.from, section.to)!);
  const coverage: StudioHighlighterWashRun[] = sections.map((section) => (
    Object.freeze({
      outlinePoints: bodyOutline(section),
      flattenedSegmentCount: 1,
      role: "body" as const,
    })
  ));

  for (let sectionIndex = 1; sectionIndex < sections.length; sectionIndex += 1) {
    const previous = sections[sectionIndex - 1]!;
    const next = sections[sectionIndex]!;
    coverage.push(Object.freeze({
      // A circular join is deliberately profile-neutral. It covers the entire shared cross
      // section at sharp corners/reversals without adding a second alpha pass.
      outlinePoints: footprintOutline(
        previous.to,
        joinDirection(directions[sectionIndex - 1]!, directions[sectionIndex]!),
        Math.max(previous.halfWidth, next.halfWidth),
        "round-superellipse",
        runIndex * 4099 + sectionIndex,
        JOIN_STEPS,
        1,
      ),
      flattenedSegmentCount: 0,
      role: "join",
    }));
  }

  const first = sections[0]!;
  const last = sections.at(-1)!;
  coverage.push(
    Object.freeze({
      outlinePoints: footprintOutline(
        first.from,
        directions[0]!,
        first.halfWidth,
        profile,
        runIndex * 2 + 401,
        CAP_STEPS * 2,
      ),
      flattenedSegmentCount: 0,
      role: "start-cap",
    }),
    Object.freeze({
      outlinePoints: footprintOutline(
        last.to,
        directions.at(-1)!,
        last.halfWidth,
        profile,
        runIndex * 2 + 307,
        CAP_STEPS * 2,
      ),
      flattenedSegmentCount: 0,
      role: "end-cap",
    }),
  );
  return Object.freeze(coverage);
}

function weightedOpacity(sections: readonly FlatSection[]): number {
  let weighted = 0;
  let distance = 0;
  for (const section of sections) {
    const length = Math.hypot(
      section.to.x - section.from.x,
      section.to.y - section.from.y,
    );
    weighted += section.opacityScale * length;
    distance += length;
  }
  if (distance <= POINT_EPSILON) return 1;
  return clamp(weighted / distance, 0, 1);
}

export function planStudioHighlighterWashRibbon(input: {
  readonly brushId: StudioHighlighterWashBrushId;
  readonly pressurePath: StudioFxPressurePathPlan;
  readonly baseWidth: unknown;
}): StudioHighlighterWashPlan {
  const baseWidth = finiteWidth(input.baseWidth);
  const profile = highlighterCapProfile(input.brushId);
  if (baseWidth === null) {
    return Object.freeze({
      version: STUDIO_HIGHLIGHTER_WASH_RIBBON_VERSION,
      brushId: input.brushId,
      capProfile: profile,
      gesture: "stroke",
      sourceSegmentCount: input.pressurePath.segments.length,
      flattenedSegmentCount: 0,
      capped: false,
      opacityScale: 1,
      runs: Object.freeze([]),
    });
  }
  const flattened = flattenPressurePath(input.pressurePath, baseWidth);
  const split = splitContinuousRuns(flattened.sections);
  const runs = split.flatMap(
    (sections, runIndex) => compoundCoverage(sections, profile, runIndex),
  );
  return Object.freeze({
    version: STUDIO_HIGHLIGHTER_WASH_RIBBON_VERSION,
    brushId: input.brushId,
    capProfile: profile,
    gesture: "stroke",
    sourceSegmentCount: input.pressurePath.segments.length,
    flattenedSegmentCount: flattened.sections.length,
    capped: flattened.capped,
    opacityScale: weightedOpacity(flattened.sections),
    runs: Object.freeze(runs),
  });
}

function tapOutline(
  brushId: StudioHighlighterWashBrushId,
  center: Point,
  radius: number,
): readonly number[] {
  const profile = highlighterCapProfile(brushId);
  return footprintOutline(
    center,
    { x: 1, y: 0 },
    radius,
    profile,
    577,
    TAP_STEPS,
    profile === "soft-flat" ? 0.72 : 1,
  );
}

export function planStudioHighlighterWashTap(input: {
  readonly brushId: StudioHighlighterWashBrushId;
  readonly x: unknown;
  readonly y: unknown;
  readonly width: unknown;
  readonly opacityScale?: unknown;
}): StudioHighlighterWashPlan {
  const x = finiteCoordinate(input.x);
  const y = finiteCoordinate(input.y);
  const width = finiteWidth(input.width);
  const profile = highlighterCapProfile(input.brushId);
  const opacityScale = typeof input.opacityScale === "number"
    && Number.isFinite(input.opacityScale)
    ? clamp(input.opacityScale, 0, 1)
    : 1;
  const run = x === null || y === null || width === null
    ? null
    : Object.freeze({
        outlinePoints: tapOutline(input.brushId, { x, y }, width / 2),
        flattenedSegmentCount: 0,
        role: "tap" as const,
      });
  return Object.freeze({
    version: STUDIO_HIGHLIGHTER_WASH_RIBBON_VERSION,
    brushId: input.brushId,
    capProfile: profile,
    gesture: "tap",
    sourceSegmentCount: 0,
    flattenedSegmentCount: 0,
    capped: false,
    opacityScale,
    runs: Object.freeze(run ? [run] : []),
  });
}

export function traceStudioHighlighterWashPlan(
  sink: StudioHighlighterWashPathSink,
  plan: StudioHighlighterWashPlan,
): void {
  for (const run of plan.runs) {
    const [firstX, firstY, ...remaining] = run.outlinePoints;
    if (firstX === undefined || firstY === undefined) continue;
    sink.moveTo(firstX, firstY);
    for (let index = 0; index < remaining.length; index += 2) {
      const x = remaining[index];
      const y = remaining[index + 1];
      if (x === undefined || y === undefined) break;
      sink.lineTo(x, y);
    }
    sink.closePath();
  }
}

function formatPathNumber(value: number): string {
  if (Object.is(value, -0)) return "0";
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "");
}

export function studioHighlighterWashPlanPathData(
  plan: StudioHighlighterWashPlan,
): string {
  return plan.runs.map((run) => {
    const [firstX, firstY, ...remaining] = run.outlinePoints;
    if (firstX === undefined || firstY === undefined) return "";
    let path = `M${formatPathNumber(firstX)} ${formatPathNumber(firstY)}`;
    for (let index = 0; index < remaining.length; index += 2) {
      const x = remaining[index];
      const y = remaining[index + 1];
      if (x === undefined || y === undefined) break;
      path += `L${formatPathNumber(x)} ${formatPathNumber(y)}`;
    }
    return `${path}Z`;
  }).join("");
}
