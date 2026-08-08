/**
 * Synthetic legacy Photoshop `.abr` (v1/v2) fixture builders — ABR preview lane.
 *
 * No external downloads: tests own their corpus by emitting the documented
 * legacy container byte-by-byte. Layout (all integers big-endian):
 *
 *   header:  version(u16 = 1|2), count(u16)
 *   record:  type(u16), size(u32), body[size]
 *
 * Computed body (type 1) — matches `importAbr` in
 * packages/studio-format-gateway/src/abr.ts:
 *   misc(u32), spacing(u16), [v2: nameLen(u32) + UTF-16 units incl. NUL],
 *   angle(i16), roundness(i16), diameter(u16)
 *
 * Sampled body (type 2) — mirrors GIMP's `gimp_brush_load_abr_brush_v12`:
 *   misc(u32), spacing(u16), [v2 name as above], antialiasing(u8),
 *   bounds16 top/left/bottom/right (i16 ×4, legacy duplicate),
 *   bounds32 top/left/bottom/right (i32 ×4, authoritative; width = right−left,
 *   height = bottom−top), depth(u16, 8 = 8-bit coverage),
 *   compress(u8: 0 raw | 1 PackBits RLE), then the bitmap: raw width×height
 *   alpha bytes, or RLE as height × u16 compressed-scanline lengths followed
 *   by each scanline's PackBits stream.
 */

export interface AbrRecordFixture {
  typeCode: number;
  body: Uint8Array;
}

export interface ComputedBodyOptions {
  version: 1 | 2;
  /** v2 only — stored as UTF-16 with a trailing NUL counted in the length. */
  name?: string;
  spacingPct?: number;
  angleDeg?: number;
  roundness?: number;
  diameterPx?: number;
}

export interface SampledBodyOptions {
  version: 1 | 2;
  /** v2 only. */
  name?: string;
  spacingPct?: number;
  antialiasing?: boolean;
  width: number;
  height: number;
  /** width × height coverage bytes, row-major from top-left. */
  alpha: Uint8Array;
  /** 0 = raw (default), 1 = PackBits RLE; other values exercise refusal. */
  compress?: number;
  /** Default 8; override (e.g. 16) to exercise the unsupported-depth gate. */
  depth?: number;
}

type ScalarWidth = 1 | 2 | 4;

const SCALAR_SCRATCH = new DataView(new ArrayBuffer(4));

function pushScalar(
  out: number[],
  byteLength: ScalarWidth,
  value: number,
  signed: boolean,
): void {
  if (byteLength === 1) {
    if (signed) {
      SCALAR_SCRATCH.setInt8(0, value);
    } else {
      SCALAR_SCRATCH.setUint8(0, value);
    }
  } else if (byteLength === 2) {
    if (signed) {
      SCALAR_SCRATCH.setInt16(0, value, false);
    } else {
      SCALAR_SCRATCH.setUint16(0, value, false);
    }
  } else if (signed) {
    SCALAR_SCRATCH.setInt32(0, value, false);
  } else {
    SCALAR_SCRATCH.setUint32(0, value, false);
  }
  for (let index = 0; index < byteLength; index += 1) {
    out.push(SCALAR_SCRATCH.getUint8(index));
  }
}

function pushUtf16Name(out: number[], name: string): void {
  const units = [...name].map((ch) => ch.charCodeAt(0));
  units.push(0); // trailing NUL is counted in the stored length in real files
  pushScalar(out, 4, units.length, false);
  for (const unit of units) {
    pushScalar(out, 2, unit, false);
  }
}

/**
 * PackBits-encodes one scanline with the semantics the ABR RLE decoder uses:
 * header n ∈ [0, 127] → copy n+1 literal bytes; n ∈ [−127, −1] → repeat the
 * next byte −n+1 times; −128 is a nop (never emitted here).
 */
export function encodePackBits(row: Uint8Array): Uint8Array {
  const out: number[] = [];
  let index = 0;
  while (index < row.length) {
    let runEnd = index + 1;
    while (
      runEnd < row.length &&
      row[runEnd] === row[index] &&
      runEnd - index < 128
    ) {
      runEnd += 1;
    }
    const runLength = runEnd - index;
    if (runLength >= 3) {
      pushScalar(out, 1, 1 - runLength, true); // n = 1 − runLength ∈ [−127, −2]
      out.push(row[index] ?? 0);
      index = runEnd;
      continue;
    }
    // Literal packet: extend until a ≥3 run starts or the 128-byte cap hits.
    let end = index;
    while (end < row.length && end - index < 128) {
      if (
        end + 2 < row.length &&
        row[end] === row[end + 1] &&
        row[end] === row[end + 2]
      ) {
        break;
      }
      end += 1;
    }
    pushScalar(out, 1, end - index - 1, true);
    for (let cursor = index; cursor < end; cursor += 1) {
      out.push(row[cursor] ?? 0);
    }
    index = end;
  }
  return Uint8Array.from(out);
}

/**
 * Deterministic sampled-tip pattern: a radial linear falloff disc with flat
 * zero margins (the corners give the RLE lane genuine repeat runs).
 */
export function radialTipAlpha(width: number, height: number): Uint8Array {
  const alpha = new Uint8Array(width * height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.max(1, Math.min(width, height) / 2 - 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const coverage = Math.max(0, Math.min(1, 1 - distance / radius));
      alpha[y * width + x] = Math.round(coverage * 255);
    }
  }
  return alpha;
}

export function buildComputedBody(options: ComputedBodyOptions): Uint8Array {
  const out: number[] = [];
  pushScalar(out, 4, 0, false); // misc
  pushScalar(out, 2, options.spacingPct ?? 25, false);
  if (options.version === 2) {
    pushUtf16Name(out, options.name ?? "computed-fixture");
  }
  pushScalar(out, 2, options.angleDeg ?? 0, true);
  pushScalar(out, 2, options.roundness ?? 100, true);
  pushScalar(out, 2, options.diameterPx ?? 32, false);
  return Uint8Array.from(out);
}

export function buildSampledBody(options: SampledBodyOptions): Uint8Array {
  const { width, height, alpha } = options;
  if (alpha.length !== width * height) {
    throw new Error(
      `sampled fixture alpha has ${alpha.length} bytes, expected ${width * height}`,
    );
  }
  const compress = options.compress ?? 0;
  const out: number[] = [];
  pushScalar(out, 4, 0, false); // misc
  pushScalar(out, 2, options.spacingPct ?? 25, false);
  if (options.version === 2) {
    pushUtf16Name(out, options.name ?? "sampled-fixture");
  }
  pushScalar(out, 1, options.antialiasing === false ? 0 : 1, false);
  // Legacy duplicate i16 bounds, then the authoritative i32 bounds.
  for (const bound of [0, 0, height, width]) {
    pushScalar(out, 2, bound, true);
  }
  for (const bound of [0, 0, height, width]) {
    pushScalar(out, 4, bound, true);
  }
  pushScalar(out, 2, options.depth ?? 8, false);
  pushScalar(out, 1, compress, false);
  if (compress === 1) {
    const rows: Uint8Array[] = [];
    for (let y = 0; y < height; y += 1) {
      rows.push(encodePackBits(alpha.subarray(y * width, (y + 1) * width)));
    }
    for (const row of rows) {
      pushScalar(out, 2, row.length, false);
    }
    for (const row of rows) {
      for (const byte of row) {
        out.push(byte);
      }
    }
  } else {
    for (const byte of alpha) {
      out.push(byte);
    }
  }
  return Uint8Array.from(out);
}

export function buildAbrFile(
  version: 1 | 2,
  records: readonly AbrRecordFixture[],
): Uint8Array {
  const out: number[] = [];
  pushScalar(out, 2, version, false);
  pushScalar(out, 2, records.length, false);
  for (const record of records) {
    pushScalar(out, 2, record.typeCode, false);
    pushScalar(out, 4, record.body.length, false);
    for (const byte of record.body) {
      out.push(byte);
    }
  }
  return Uint8Array.from(out);
}

/** Single computed-brush file (record type 1). */
export function buildComputedAbr(options: ComputedBodyOptions): Uint8Array {
  return buildAbrFile(options.version, [
    { typeCode: 1, body: buildComputedBody(options) },
  ]);
}

/** Single sampled-brush file (record type 2). */
export function buildSampledAbr(options: SampledBodyOptions): Uint8Array {
  return buildAbrFile(options.version, [
    { typeCode: 2, body: buildSampledBody(options) },
  ]);
}
