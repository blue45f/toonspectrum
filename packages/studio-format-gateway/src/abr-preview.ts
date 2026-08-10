/**
 * ABR tip-preview lane: turns the legacy v1/v2 parse result into renderable
 * tip masks and a deterministic stamped stroke preview.
 *
 * `importAbr` (./abr.ts) stays the single container gate — v6+ refusal and
 * structural validation are reused, never duplicated. On top of it this lane
 * adds the pieces the parser deliberately leaves raw:
 *
 * - sampled (type 2) records: 8-bit coverage bitmaps, raw or PackBits RLE,
 *   decoded here into {@link AbrSampledBrush} (layout mirrors GIMP's
 *   `gimp_brush_load_abr_brush_v12`);
 * - computed (type 1) records: an analytic soft-ellipse mask (formula below);
 * - a pressure-ramped dab-stamping stroke preview.
 *
 * Warnings policy (zero silent loss): every record without a preview lane and
 * every fallback taken while rendering is reported in `warnings`; importer
 * warnings can be threaded through `inheritedWarnings`. Undecodable sampled
 * payloads throw {@link AbrPreviewError} instead of degrading quietly.
 */

import { importAbr } from "./abr";

import type { AbrComputedBrush } from "./abr";

export interface AbrTipMask {
  width: number;
  height: number;
  /** 8-bit coverage, row-major from top-left, width × height bytes. */
  alpha: Uint8Array;
}

/** Sampled (type 2) brush decoded by this lane; the parser keeps it raw. */
export interface AbrSampledBrush {
  kind: "sampled";
  name: string;
  spacingPct: number;
  /** Photoshop's per-tip anti-aliasing flag — already baked into the bitmap. */
  antialiased: boolean;
  width: number;
  height: number;
  /** 8-bit coverage, row-major from top-left. */
  alpha: Uint8Array;
}

export type AbrPreviewBrush = AbrComputedBrush | AbrSampledBrush;

export interface AbrPreviewDecodeResult {
  version: number;
  brushes: AbrPreviewBrush[];
  warnings: string[];
}

export class AbrPreviewError extends Error {
  constructor(
    message: string,
    readonly code: "corrupt" | "unsupported-depth" | "unsupported-compression",
  ) {
    super(message);
    this.name = "AbrPreviewError";
  }
}

export interface AbrTipMaskOptions {
  /**
   * Hardness in [0, 1] for computed tips. Legacy v1/v2 computed records carry
   * no hardness field (era-typical tips were hard, anti-aliased ellipses), so
   * the default is 1; preview UIs may expose it as a slider. Sampled tips
   * ignore it — their softness is baked into the bitmap.
   */
  hardness?: number;
}

export interface AbrStrokePreviewOptions {
  /** Preview canvas width in px (default 256, clamped to ≥ 16). */
  width?: number;
  /** Preview canvas height in px (default 96, clamped to ≥ 16). */
  height?: number;
  /** Computed-tip hardness passthrough (see {@link AbrTipMaskOptions}). */
  hardness?: number;
  /** Overrides the brush's stored spacing percentage. */
  spacingPctOverride?: number;
  /** Ink color, sRGB in [0, 1] (default black). */
  color?: { r: number; g: number; b: number };
  /** Background color, sRGB in [0, 1] (default white). */
  background?: { r: number; g: number; b: number };
  /**
   * Importer/decoder warnings to carry through into the result — the preview
   * is often the only surface a user sees, so unmapped-feature reports from
   * `importAbr`/`decodeAbrPreviewBrushes` must not get dropped on the way.
   */
  inheritedWarnings?: readonly string[];
}

export interface AbrStrokePreviewResult {
  /** Unpremultiplied RGBA8888, row-major from top-left (alpha always 255). */
  pixels: Uint8Array;
  width: number;
  height: number;
  warnings: string[];
  /** Number of dab placements along the path (spacing contract, testable). */
  dabCount: number;
  /** Center-to-center dab spacing actually used, in px. */
  spacingPx: number;
  /** Polyline arc length of the preview path, in px. */
  pathLengthPx: number;
}

const SUPPORTED_SAMPLED_DEPTH = 8;
const MAX_SAMPLED_EDGE = 8192;
/** ρ overshoot where the Gaussian skirt drops below 1/255: √(2·ln 255). */
const ALPHA_CUTOFF_SIGMAS = Math.sqrt(2 * Math.log(255));
const DEFAULT_PREVIEW_WIDTH = 256;
const DEFAULT_PREVIEW_HEIGHT = 96;
const MIN_PREVIEW_EDGE = 16;
const FALLBACK_SPACING_PCT = 25;
const PATH_SAMPLES = 512;

/** Big-endian cursor over one record body; every read is bounds-checked. */
class RecordReader {
  private cursor: number;

  constructor(
    private readonly view: DataView,
    start: number,
    private readonly end: number,
    private readonly label: string,
  ) {
    this.cursor = start;
  }

  private need(byteLength: number): number {
    if (this.cursor + byteLength > this.end) {
      throw new AbrPreviewError(
        `${this.label}: sampled record body truncated`,
        "corrupt",
      );
    }
    const at = this.cursor;
    this.cursor += byteLength;
    return at;
  }

  u8(): number {
    return this.view.getUint8(this.need(1));
  }

  i8(): number {
    return this.view.getInt8(this.need(1));
  }

  u16(): number {
    return this.view.getUint16(this.need(2), false);
  }

  u32(): number {
    return this.view.getUint32(this.need(4), false);
  }

  i32(): number {
    return this.view.getInt32(this.need(4), false);
  }

  skip(byteLength: number): void {
    this.need(byteLength);
  }

  remaining(): number {
    return this.end - this.cursor;
  }
}

function readUtf16Name(reader: RecordReader, fallback: string): string {
  const unitCount = reader.u32();
  const chars: number[] = [];
  for (let unit = 0; unit < unitCount; unit += 1) {
    chars.push(reader.u16());
  }
  // The trailing NUL is part of the stored length in real files.
  return String.fromCharCode(...chars).replace(/\0+$/u, "") || fallback;
}

/**
 * PackBits per the ABR RLE lane (GIMP `abr_rle_decode` semantics): header
 * n ∈ [0, 127] copies n+1 literal bytes, n ∈ [−127, −1] repeats the next byte
 * −n+1 times, −128 is a nop. Each scanline must decode to exactly `width`.
 */
function decodePackBitsScanline(
  reader: RecordReader,
  byteLength: number,
  width: number,
  label: string,
): Uint8Array {
  const row = new Uint8Array(width);
  let produced = 0;
  let consumed = 0;
  while (consumed < byteLength) {
    const header = reader.i8();
    consumed += 1;
    if (header === -128) {
      continue; // nop
    }
    if (header < 0) {
      const repeat = 1 - header;
      if (consumed >= byteLength || produced + repeat > width) {
        throw new AbrPreviewError(`${label}: RLE repeat run overflows`, "corrupt");
      }
      row.fill(reader.u8(), produced, produced + repeat);
      consumed += 1;
      produced += repeat;
    } else {
      const literal = header + 1;
      if (consumed + literal > byteLength || produced + literal > width) {
        throw new AbrPreviewError(`${label}: RLE literal run overflows`, "corrupt");
      }
      for (let index = 0; index < literal; index += 1) {
        row[produced] = reader.u8();
        produced += 1;
      }
      consumed += literal;
    }
  }
  if (produced !== width) {
    throw new AbrPreviewError(
      `${label}: RLE scanline produced ${produced} bytes, expected ${width}`,
      "corrupt",
    );
  }
  return row;
}

function decodeSampledBody(
  view: DataView,
  bodyStart: number,
  bodyEnd: number,
  version: number,
  index: number,
): AbrSampledBrush {
  const label = `brush ${index}`;
  const reader = new RecordReader(view, bodyStart, bodyEnd, label);
  reader.skip(4); // misc — undocumented, unused by every known reader
  const spacingPct = reader.u16();
  const name =
    version === 2 ? readUtf16Name(reader, `sampled-${index}`) : `sampled-${index}`;
  const antialiased = reader.u8() !== 0;
  reader.skip(8); // legacy duplicate i16 bounds — the i32 bounds are authoritative
  const top = reader.i32();
  const left = reader.i32();
  const bottom = reader.i32();
  const right = reader.i32();
  const depth = reader.u16();
  const compress = reader.u8();
  const width = right - left;
  const height = bottom - top;
  if (
    width <= 0 ||
    height <= 0 ||
    width > MAX_SAMPLED_EDGE ||
    height > MAX_SAMPLED_EDGE
  ) {
    throw new AbrPreviewError(
      `${label}: sampled bounds ${width}x${height} are not a renderable bitmap`,
      "corrupt",
    );
  }
  if (depth !== SUPPORTED_SAMPLED_DEPTH) {
    throw new AbrPreviewError(
      `${label}: sampled depth ${depth} is unsupported (only 8-bit coverage decodes); refusing a lossy guess`,
      "unsupported-depth",
    );
  }
  const alpha = new Uint8Array(width * height);
  if (compress === 0) {
    if (reader.remaining() < alpha.length) {
      throw new AbrPreviewError(
        `${label}: raw bitmap needs ${alpha.length} bytes, record has ${reader.remaining()}`,
        "corrupt",
      );
    }
    for (let at = 0; at < alpha.length; at += 1) {
      alpha[at] = reader.u8();
    }
  } else if (compress === 1) {
    const scanlineLengths: number[] = [];
    for (let y = 0; y < height; y += 1) {
      scanlineLengths.push(reader.u16());
    }
    for (let y = 0; y < height; y += 1) {
      const row = decodePackBitsScanline(
        reader,
        scanlineLengths[y] ?? 0,
        width,
        label,
      );
      alpha.set(row, y * width);
    }
  } else {
    throw new AbrPreviewError(
      `${label}: sampled compression mode ${compress} is unknown (0 = raw, 1 = PackBits RLE)`,
      "unsupported-compression",
    );
  }
  return { kind: "sampled", name, spacingPct, antialiased, width, height, alpha };
}

/**
 * Decodes an ABR v1/v2 file into preview-ready brushes. Container validation
 * (including the v6+ refusal) is delegated to `importAbr`; sampled records the
 * parser retains as raw inventory are decoded here. Records with no preview
 * lane (neither computed nor sampled) are reported in `warnings`.
 */
export function decodeAbrPreviewBrushes(bytes: Uint8Array): AbrPreviewDecodeResult {
  const parsed = importAbr(bytes); // AbrParseError propagates (v6 gate intact)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const brushes: AbrPreviewBrush[] = [];
  const warnings: string[] = [];
  let offset = 4;
  for (let index = 0; index < parsed.brushes.length; index += 1) {
    // importAbr already proved these header/body reads are in bounds.
    const typeCode = view.getUint16(offset, false);
    const size = view.getUint32(offset + 2, false);
    offset += 6;
    const inventory = parsed.brushes[index];
    if (inventory !== undefined && inventory.kind === "computed") {
      brushes.push(inventory);
    } else if (typeCode === 2) {
      brushes.push(
        decodeSampledBody(view, offset, offset + size, parsed.version, index),
      );
    } else {
      warnings.push(
        `brush ${index}: type ${typeCode} has no preview lane; retained as raw payload`,
      );
    }
    offset += size;
  }
  return { version: parsed.version, brushes, warnings };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Analytic soft-ellipse mask for computed brushes.
 *
 * Elliptical normalized radius under tip rotation θ = angleDeg·π/180
 * (rotating the sample point by −θ into the ellipse frame):
 *
 *   [u; v] = R(−θ)·[x − cx; y − cy]
 *   ρ(x, y) = √((u/rx)² + (v/ry)²),  rx = D/2,  ry = rx·roundness/100
 *
 * Hardness → Gaussian width mapping (h ∈ [0, 1]): the soft rim is a Gaussian
 * skirt hanging off the hard-core edge ρ = h,
 *
 *   σ(h) = (1 − h)/2 + σaa,   σaa = 1/(2·min(rx, ry))
 *   α(ρ) = 1                          ρ ≤ h
 *        = exp(−(ρ − h)² / (2σ²))     ρ > h
 *
 * σaa is a half-pixel analytic anti-alias floor: at h = 1 only that floor
 * remains, giving a hard but non-staircased edge; at h = 0 the skirt widens
 * to a full Gaussian falloff from the center — matching Photoshop's hardness
 * feel. The mask canvas extends to ρcut = h + σ·√(2·ln 255), where α < 1/255.
 */
function computedTipMask(brush: AbrComputedBrush, hardness: number): AbrTipMask {
  const rx = Math.max(0.5, brush.diameterPx / 2);
  const roundnessPct = Math.min(100, Math.max(1, brush.roundness));
  const ry = Math.max(0.5, rx * (roundnessPct / 100));
  const theta = (brush.angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const sigmaAa = 1 / (2 * Math.min(rx, ry));
  const sigma = (1 - hardness) / 2 + sigmaAa;
  const rhoCut = hardness + sigma * ALPHA_CUTOFF_SIGMAS;
  // Bounding half-extents of the rotated ρ = ρcut iso-ellipse.
  const extentX = rhoCut * Math.hypot(rx * cos, ry * sin);
  const extentY = rhoCut * Math.hypot(rx * sin, ry * cos);
  const width = Math.max(1, Math.ceil(2 * extentX));
  const height = Math.max(1, Math.ceil(2 * extentY));
  const cx = width / 2;
  const cy = height / 2;
  const alpha = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      const rho = Math.hypot(u / rx, v / ry);
      let coverage = 1;
      if (rho > hardness) {
        const t = (rho - hardness) / sigma;
        coverage = Math.exp(-(t * t) / 2);
      }
      alpha[y * width + x] = Math.round(coverage * 255);
    }
  }
  return { width, height, alpha };
}

/**
 * Renders a brush to its tip coverage mask: sampled tips pass their bitmap
 * alpha through untouched (copied), computed tips evaluate the analytic
 * soft-ellipse documented on {@link computedTipMask}.
 */
export function abrBrushToTipMask(
  brush: AbrPreviewBrush,
  options: AbrTipMaskOptions = {},
): AbrTipMask {
  if (brush.kind === "sampled") {
    return {
      width: brush.width,
      height: brush.height,
      alpha: Uint8Array.from(brush.alpha),
    };
  }
  return computedTipMask(brush, clamp01(options.hardness ?? 1));
}

function texelAlpha(tip: AbrTipMask, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= tip.width || y >= tip.height) {
    return 0;
  }
  return tip.alpha[y * tip.width + x] ?? 0;
}

/** Bilinear tap in tip-texel space; outside the mask samples as 0. */
function bilinearAlpha(tip: AbrTipMask, u: number, v: number): number {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  return (
    texelAlpha(tip, x0, y0) * (1 - fx) * (1 - fy) +
    texelAlpha(tip, x0 + 1, y0) * fx * (1 - fy) +
    texelAlpha(tip, x0, y0 + 1) * (1 - fx) * fy +
    texelAlpha(tip, x0 + 1, y0 + 1) * fx * fy
  );
}

/**
 * Stamps one dab: the tip mask scaled by `scale` (bilinear) is composited
 * src-over into the coverage buffer: cov' = cov + a·(1 − cov).
 */
function stampDab(
  coverage: Float64Array,
  canvasWidth: number,
  canvasHeight: number,
  tip: AbrTipMask,
  centerX: number,
  centerY: number,
  scale: number,
): void {
  if (scale <= 0) {
    return; // the ramp's zero-pressure dab has zero extent — nothing to deposit
  }
  const halfW = (tip.width * scale) / 2;
  const halfH = (tip.height * scale) / 2;
  const minX = Math.max(0, Math.floor(centerX - halfW));
  const maxX = Math.min(canvasWidth - 1, Math.ceil(centerX + halfW));
  const minY = Math.max(0, Math.floor(centerY - halfH));
  const maxY = Math.min(canvasHeight - 1, Math.ceil(centerY + halfH));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const u = (x + 0.5 - centerX) / scale + tip.width / 2 - 0.5;
      const v = (y + 0.5 - centerY) / scale + tip.height / 2 - 0.5;
      const sampled = bilinearAlpha(tip, u, v) / 255;
      if (sampled > 0) {
        const at = y * canvasWidth + x;
        const previous = coverage[at] ?? 0;
        coverage[at] = previous + sampled * (1 - previous);
      }
    }
  }
}

/** Smoothstep — the S-curve pressure ramp: p(u) = u²·(3 − 2u), monotone 0→1. */
function smoothstep(u: number): number {
  const t = clamp01(u);
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic stroke preview: the tip is dab-stamped along a horizontal
 * S-curve (one sine period) while pressure ramps 0→1 with a smoothstep
 * S-curve over arc length; dab size scales linearly with pressure
 * (size = pressure × tip dims). Dabs are spaced Photoshop-style at
 * spacing% of the nominal tip diameter, center to center. Pure math, no
 * randomness — identical inputs produce byte-identical pixels.
 */
export function renderAbrStrokePreview(
  brush: AbrPreviewBrush,
  options: AbrStrokePreviewOptions = {},
): AbrStrokePreviewResult {
  const width = Math.max(
    MIN_PREVIEW_EDGE,
    Math.floor(options.width ?? DEFAULT_PREVIEW_WIDTH),
  );
  const height = Math.max(
    MIN_PREVIEW_EDGE,
    Math.floor(options.height ?? DEFAULT_PREVIEW_HEIGHT),
  );
  const warnings = [...(options.inheritedWarnings ?? [])];
  if (
    brush.kind === "computed" &&
    (brush.roundness < 1 || brush.roundness > 100)
  ) {
    warnings.push(
      `computed roundness ${brush.roundness} is outside [1, 100]; clamped for the tip mask`,
    );
  }
  const tip = abrBrushToTipMask(brush, { hardness: options.hardness });

  // Spacing (Photoshop semantics): one dab every spacing% of the diameter.
  const nominalDiameter =
    brush.kind === "computed"
      ? Math.max(1, brush.diameterPx)
      : Math.max(1, brush.width, brush.height);
  let spacingPct = options.spacingPctOverride ?? brush.spacingPct;
  if (!(spacingPct > 0)) {
    warnings.push(
      `spacing ${spacingPct}% is not renderable; falling back to ${FALLBACK_SPACING_PCT}%`,
    );
    spacingPct = FALLBACK_SPACING_PCT;
  }
  const spacingPx = Math.max(1, (spacingPct / 100) * nominalDiameter);

  // S-curve path: one sine period across the canvas, padded so the largest
  // (full-pressure) dab stays inside the preview.
  const pad = Math.ceil(Math.max(tip.width, tip.height) / 2) + 2;
  const x0 = Math.min(pad, width / 2);
  const x1 = Math.max(x0, width - pad);
  const centerY = height / 2;
  const amplitude = Math.max(0, height / 2 - pad);
  if (x1 <= x0) {
    warnings.push(
      `tip ${tip.width}x${tip.height} is wider than the ${width}px preview; stroke collapses to a point`,
    );
  }
  if (amplitude === 0) {
    warnings.push(
      `preview height ${height}px leaves no room for the S-curve; path flattened to the midline`,
    );
  }
  const pointAt = (t: number): { x: number; y: number } => ({
    x: x0 + (x1 - x0) * t,
    y: centerY - amplitude * Math.sin(2 * Math.PI * t),
  });

  // Polyline arc-length table (fixed sampling — part of the determinism
  // contract; dab placement walks accumulated length, not the parameter).
  const lengths = new Float64Array(PATH_SAMPLES + 1);
  let previous = pointAt(0);
  for (let sample = 1; sample <= PATH_SAMPLES; sample += 1) {
    const next = pointAt(sample / PATH_SAMPLES);
    lengths[sample] =
      (lengths[sample - 1] ?? 0) + Math.hypot(next.x - previous.x, next.y - previous.y);
    previous = next;
  }
  const pathLengthPx = lengths[PATH_SAMPLES] ?? 0;

  const dabCount = Math.floor(pathLengthPx / spacingPx) + 1;
  const coverage = new Float64Array(width * height);
  let segment = 1;
  for (let dab = 0; dab < dabCount; dab += 1) {
    const s = Math.min(pathLengthPx, dab * spacingPx);
    while (segment < PATH_SAMPLES && (lengths[segment] ?? 0) < s) {
      segment += 1;
    }
    const s0 = lengths[segment - 1] ?? 0;
    const s1 = lengths[segment] ?? 0;
    const localT = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
    const t = (segment - 1 + localT) / PATH_SAMPLES;
    const { x, y } = pointAt(t);
    const pressure = smoothstep(pathLengthPx > 0 ? s / pathLengthPx : 1);
    stampDab(coverage, width, height, tip, x, y, pressure);
  }

  const background = options.background ?? { r: 1, g: 1, b: 1 };
  const color = options.color ?? { r: 0, g: 0, b: 0 };
  const pixels = new Uint8Array(width * height * 4);
  for (let at = 0; at < coverage.length; at += 1) {
    const a = coverage[at] ?? 0;
    const base = at * 4;
    pixels[base] = Math.round((background.r * (1 - a) + color.r * a) * 255);
    pixels[base + 1] = Math.round((background.g * (1 - a) + color.g * a) * 255);
    pixels[base + 2] = Math.round((background.b * (1 - a) + color.b * a) * 255);
    pixels[base + 3] = 255;
  }

  return { pixels, width, height, warnings, dabCount, spacingPx, pathLengthPx };
}
