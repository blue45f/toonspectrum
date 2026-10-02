import { canonicalJson } from "../../engine/core/hash";

import { parseReport } from "./report-schema";

import type { BrushCertificationReport } from "./report-schema";
import type { LabImage } from "../../engine/core/types";

/**
 * 인증 리포트 직렬화·파일명·PNG 인코더(의존성 0).
 * - `serializeReport`: 키 정렬·-0 정규화·undefined 제거(canonicalJson) 후 들여쓰기만 입힌 JSON.
 *   같은 리포트면 같은 문자열이다(증거 파일 diff 안정성).
 * - `labImageToPngBytes`: zlib 없이 stored(무압축) deflate 블록으로 IDAT를 만든다.
 *   브라우저·Node 어디서나 동작하며 픽셀은 바이트 그대로 보존된다(해시 비교용).
 */

export interface SerializeOptions {
  /** 들여쓰기 칸 수. 0이면 한 줄. 기본 2. */
  indent?: number;
}

/** 정규(canonical) JSON 문자열. 끝에 개행 1개를 붙인다(POSIX 텍스트 파일 규약). */
export function serializeReport(report: BrushCertificationReport, opts: SerializeOptions = {}): string {
  const indent = opts.indent ?? 2;
  const canonical: unknown = JSON.parse(canonicalJson(report));
  const text = indent > 0 ? JSON.stringify(canonical, null, indent) : JSON.stringify(canonical);
  return `${text}\n`;
}

/** 직렬화 문자열 → 리포트(스키마 검증 포함). 실패는 SyntaxError 또는 ZodError. */
export function deserializeReport(text: string): BrushCertificationReport {
  return parseReport(JSON.parse(text));
}

/** 파일명에 쓸 수 없는 문자는 `_`로 바꾼다(프리셋 id는 slug이지만 캡처 fixture 등은 `:`를 포함할 수 있다). */
export function safeFileSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "unnamed";
}

/** createdAt(ISO) → UTC `YYYYMMDD`. 파싱 실패는 RangeError. */
export function yyyymmddOf(isoDateTime: string): string {
  const ms = Date.parse(isoDateTime);
  if (!Number.isFinite(ms)) throw new RangeError(`yyyymmddOf: invalid ISO datetime '${isoDateTime}'`);
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
}

/** 증거 파일명 규약: `<presetId>-<laneId>-<YYYYMMDD>.json`(docs/evidence/brush-lab). */
export function reportFileName(report: BrushCertificationReport): string {
  return `${safeFileSegment(report.presetId)}-${safeFileSegment(report.laneId)}-${yyyymmddOf(report.createdAt)}.json`;
}

/* ------------------------------------------------------------------ */
/* PNG                                                                 */
/* ------------------------------------------------------------------ */

export const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** stored deflate 블록 1개의 최대 바이트(LEN 16비트). */
export const DEFLATE_STORED_BLOCK_MAX = 65535;

let crcTable: Uint32Array | null = null;

function crcTableOf(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/** CRC-32(IEEE 802.3, PNG 청크 규약). 부호 없는 32비트. */
export function crc32(bytes: Uint8Array, seed = 0xffffffff): number {
  const table = crcTableOf();
  let c = seed >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    c = (table[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32(zlib 트레일러). */
export function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + (bytes[i] ?? 0)) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeU32BE(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

/** PNG 청크 바이트: length(4) type(4) data crc(4). crc는 type+data. */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  if (type.length !== 4) throw new RangeError(`pngChunk: type must be 4 chars, got '${type}'`);
  const out = new Uint8Array(12 + data.length);
  writeU32BE(out, 0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeU32BE(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** 원시 바이트 → zlib 스트림(헤더 0x78 0x01, stored 블록, Adler-32). 압축하지 않는다. */
export function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / DEFLATE_STORED_BLOCK_MAX));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b += 1) {
    const start = b * DEFLATE_STORED_BLOCK_MAX;
    const end = Math.min(raw.length, start + DEFLATE_STORED_BLOCK_MAX);
    const len = end - start;
    out[o] = b === blocks - 1 ? 1 : 0;
    out[o + 1] = len & 0xff;
    out[o + 2] = (len >>> 8) & 0xff;
    out[o + 3] = ~len & 0xff;
    out[o + 4] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, end), o + 5);
    o += 5 + len;
  }
  writeU32BE(out, o, adler32(raw));
  return out;
}

/** zlib stored 스트림 → 원시 바이트(테스트·검증용 역변환). 압축 블록은 거부한다. */
export function inflateStored(stream: Uint8Array): Uint8Array {
  if (stream.length < 6) throw new RangeError("inflateStored: stream too short");
  if ((((stream[0] ?? 0) << 8) | (stream[1] ?? 0)) % 31 !== 0) throw new RangeError("inflateStored: bad zlib header");
  const parts: Uint8Array[] = [];
  let o = 2;
  let total = 0;
  for (;;) {
    const header = stream[o] ?? 0;
    const btype = (header >>> 1) & 0b11;
    if (btype !== 0) throw new RangeError(`inflateStored: unsupported block type ${btype}`);
    const len = (stream[o + 1] ?? 0) | ((stream[o + 2] ?? 0) << 8);
    const nlen = (stream[o + 3] ?? 0) | ((stream[o + 4] ?? 0) << 8);
    if ((len ^ nlen) !== 0xffff) throw new RangeError("inflateStored: LEN/NLEN mismatch");
    parts.push(stream.subarray(o + 5, o + 5 + len));
    total += len;
    o += 5 + len;
    if (header & 1) break;
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  if (adler32(out) !== readU32BE(stream, o)) throw new RangeError("inflateStored: adler32 mismatch");
  return out;
}

/** sRGB straight RGBA8 LabImage → PNG 바이트(8비트 RGBA, 필터 0, 비인터레이스). */
export function labImageToPngBytes(img: LabImage): Uint8Array {
  const { width, height, data } = img;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`labImageToPngBytes: invalid size ${width}×${height}`);
  }
  if (data.length < width * height * 4) {
    throw new RangeError(`labImageToPngBytes: data has ${data.length} bytes, need ${width * height * 4}`);
  }
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const o = y * (stride + 1);
    raw[o] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), o + 1);
  }
  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const chunks = [
    Uint8Array.from(PNG_SIGNATURE),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlibStored(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

export interface PngChunk {
  type: string;
  data: Uint8Array;
  crcOk: boolean;
}

/** PNG 바이트 → 청크 목록(시그니처·CRC 검증 포함). 시그니처가 다르면 RangeError. */
export function pngChunks(bytes: Uint8Array): PngChunk[] {
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new RangeError("pngChunks: bad PNG signature");
  }
  const out: PngChunk[] = [];
  let o = PNG_SIGNATURE.length;
  while (o + 12 <= bytes.length) {
    const len = readU32BE(bytes, o);
    const type = String.fromCharCode(bytes[o + 4] ?? 0, bytes[o + 5] ?? 0, bytes[o + 6] ?? 0, bytes[o + 7] ?? 0);
    const data = bytes.subarray(o + 8, o + 8 + len);
    const crc = readU32BE(bytes, o + 8 + len);
    out.push({ type, data, crcOk: crc32(bytes.subarray(o + 4, o + 8 + len)) === crc });
    o += 12 + len;
  }
  return out;
}

/** PNG 바이트 → LabImage(이 인코더가 만든 stored PNG 전용 역변환, 테스트용). */
export function pngBytesToLabImage(bytes: Uint8Array): LabImage {
  const chunks = pngChunks(bytes);
  const ihdr = chunks.find((c) => c.type === "IHDR");
  if (!ihdr || ihdr.data.length < 13) throw new RangeError("pngBytesToLabImage: IHDR missing");
  const width = readU32BE(ihdr.data, 0);
  const height = readU32BE(ihdr.data, 4);
  if (ihdr.data[8] !== 8 || ihdr.data[9] !== 6) throw new RangeError("pngBytesToLabImage: only 8-bit RGBA");
  const idat = chunks.filter((c) => c.type === "IDAT");
  let total = 0;
  for (const c of idat) total += c.data.length;
  const stream = new Uint8Array(total);
  let p = 0;
  for (const c of idat) {
    stream.set(c.data, p);
    p += c.data.length;
  }
  const raw = inflateStored(stream);
  const stride = width * 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const o = y * (stride + 1);
    if (raw[o] !== 0) throw new RangeError(`pngBytesToLabImage: unsupported filter ${raw[o]} on row ${y}`);
    data.set(raw.subarray(o + 1, o + 1 + stride), y * stride);
  }
  return { width, height, data };
}
