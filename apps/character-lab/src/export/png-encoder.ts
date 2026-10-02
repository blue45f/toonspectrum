/**
 * 의존성 없는 PNG 인코더/디코더(8bit RGBA, 비인터레이스).
 * - 인코더: IHDR(8bit, colorType 6) → sRGB(perceptual) → gAMA(45455) → IDAT(zlib deflate, CompressionStream) → IEND.
 *   필터는 기본 0(None), 옵션 "adaptive"(행별 Sub/Up/Average/Paeth 중 최소 절대합).
 * - 디코더: 인코더 출력(및 8bit Gray/GA/RGB/RGBA 비인터레이스 일반 PNG)을 straight RGBA로 복원한다.
 *   레시피의 pngBase64 페인트 레이어 복원과 테스트 왕복에 쓴다.
 * - CRC32는 PNG 규격(ISO 3309) 테이블 구현. 참고: PNG 사양 §5.5, RFC 1950(zlib).
 */
import type { CapturedRaster } from "../contracts";

export const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const PNG_MIME = "image/png";

export type PngFilterStrategy = "none" | "adaptive";

export interface EncodePngOptions {
  readonly filter?: PngFilterStrategy;
  /** sRGB·gAMA 청크 기록(기본 true) */
  readonly srgb?: boolean;
}

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32(PNG/zlib, 초기값 0xffffffff, 최종 반전) */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i += 1) {
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** CompressionStream/DecompressionStream 공통 형태(TS 6 lib.dom: writable은 BufferSource, readable은 Uint8Array<ArrayBuffer>). */
type ByteTransformStream = Pick<CompressionStream, "readable" | "writable">;

/** SharedArrayBuffer 뷰는 BufferSource가 아니므로 ArrayBuffer 기반인지 판별한다(복사는 필요할 때만). */
function isArrayBufferBacked(view: Uint8Array): view is Uint8Array<ArrayBuffer> {
  return view.buffer instanceof ArrayBuffer;
}

async function pipeThroughStream(bytes: Uint8Array, stream: ByteTransformStream): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const readAll = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  })();
  await writer.write(isArrayBufferBacked(bytes) ? bytes : new Uint8Array(bytes));
  await writer.close();
  await readAll;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function requireStreams(): void {
  if (typeof CompressionStream !== "function" || typeof DecompressionStream !== "function") {
    throw new Error("이 환경에는 CompressionStream/DecompressionStream이 없어 PNG를 처리할 수 없습니다.");
  }
}

/** zlib(deflate, RFC 1950) 압축 */
export async function deflateBytes(bytes: Uint8Array): Promise<Uint8Array> {
  requireStreams();
  return pipeThroughStream(bytes, new CompressionStream("deflate"));
}

/** zlib(deflate, RFC 1950) 해제 */
export async function inflateBytes(bytes: Uint8Array): Promise<Uint8Array> {
  requireStreams();
  return pipeThroughStream(bytes, new DecompressionStream("deflate"));
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function readUint32(source: Uint8Array, offset: number): number {
  return (((source[offset] ?? 0) << 24) | ((source[offset + 1] ?? 0) << 16) | ((source[offset + 2] ?? 0) << 8) | (source[offset + 3] ?? 0)) >>> 0;
}

export interface PngChunk {
  readonly type: string;
  readonly data: Uint8Array;
  /** 파일에 기록된 CRC와 재계산 CRC가 같은지 */
  readonly crcOk: boolean;
}

function chunkBytes(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeUint32(out, 0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  writeUint32(out, 8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

const BYTES_PER_PIXEL = 4;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function filterRow(type: number, row: Uint8ClampedArray, prior: Uint8ClampedArray | null, out: Uint8Array, outOffset: number): number {
  const bpp = BYTES_PER_PIXEL;
  let sum = 0;
  for (let i = 0; i < row.length; i += 1) {
    const raw = row[i] ?? 0;
    const left = i >= bpp ? (row[i - bpp] ?? 0) : 0;
    const up = prior ? (prior[i] ?? 0) : 0;
    const upLeft = prior && i >= bpp ? (prior[i - bpp] ?? 0) : 0;
    let value: number;
    switch (type) {
      case 1:
        value = raw - left;
        break;
      case 2:
        value = raw - up;
        break;
      case 3:
        value = raw - ((left + up) >> 1);
        break;
      case 4:
        value = raw - paeth(left, up, upLeft);
        break;
      default:
        value = raw;
    }
    value &= 0xff;
    out[outOffset + i] = value;
    sum += value < 128 ? value : 256 - value;
  }
  return sum;
}

/** 스캔라인 직렬화(행마다 필터 바이트 + 데이터) */
export function buildScanlines(raster: CapturedRaster, strategy: PngFilterStrategy): Uint8Array {
  const { width, height, rgba } = raster;
  const stride = width * BYTES_PER_PIXEL;
  if (rgba.length !== stride * height) {
    throw new Error(`encodePng: rgba 길이 ${rgba.length}가 ${width}×${height}×4=${stride * height}와 다릅니다.`);
  }
  const out = new Uint8Array((stride + 1) * height);
  let prior: Uint8ClampedArray | null = null;
  const scratch = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    const base = y * (stride + 1);
    if (strategy === "none") {
      out[base] = 0;
      out.set(row, base + 1);
    } else {
      let bestType = 0;
      let bestSum = Number.POSITIVE_INFINITY;
      for (let type = 0; type <= 4; type += 1) {
        const sum = filterRow(type, row, prior, scratch, 0);
        if (sum < bestSum) {
          bestSum = sum;
          bestType = type;
        }
      }
      out[base] = bestType;
      filterRow(bestType, row, prior, out, base + 1);
    }
    prior = row;
  }
  return out;
}

/** IHDR 데이터(13바이트) */
export function buildIhdr(width: number, height: number, colorType = 6): Uint8Array {
  const data = new Uint8Array(13);
  writeUint32(data, 0, width);
  writeUint32(data, 4, height);
  data[8] = 8; // bit depth
  data[9] = colorType; // 6 = RGBA
  data[10] = 0; // compression
  data[11] = 0; // filter method
  data[12] = 0; // interlace
  return data;
}

export const MAX_PNG_DIMENSION = 16384;

/**
 * CapturedRaster(straight, top-down, sRGB) → PNG 바이트. 투명 배경은 alpha에 그대로 보존된다.
 */
export async function encodePng(raster: CapturedRaster, options: EncodePngOptions = {}): Promise<Uint8Array> {
  const { width, height } = raster;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION) {
    throw new Error(`encodePng: 크기 ${width}×${height}는 1..${MAX_PNG_DIMENSION} 정수여야 합니다.`);
  }
  const scanlines = buildScanlines(raster, options.filter ?? "none");
  const idat = await deflateBytes(scanlines);
  const chunks: Uint8Array[] = [new Uint8Array(PNG_SIGNATURE), chunkBytes("IHDR", buildIhdr(width, height))];
  if (options.srgb ?? true) {
    chunks.push(chunkBytes("sRGB", new Uint8Array([0])));
    const gama = new Uint8Array(4);
    writeUint32(gama, 0, 45455);
    chunks.push(chunkBytes("gAMA", gama));
  }
  chunks.push(chunkBytes("IDAT", idat), chunkBytes("IEND", new Uint8Array(0)));
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** 청크 목록(서명 검사·CRC 재계산). 손상 파일은 throw. */
export function readPngChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new Error("PNG 서명이 아닙니다.");
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4] ?? 0, bytes[offset + 5] ?? 0, bytes[offset + 6] ?? 0, bytes[offset + 7] ?? 0);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error(`PNG 청크 ${type}가 파일 끝을 넘습니다.`);
    const stored = readUint32(bytes, dataEnd);
    const computed = crc32(bytes, offset + 4, dataEnd);
    chunks.push({ type, data: bytes.subarray(dataStart, dataEnd), crcOk: stored === computed });
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

export interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly interlace: number;
}

export function parseIhdr(data: Uint8Array): PngHeader {
  if (data.length < 13) throw new Error("IHDR 길이가 13바이트가 아닙니다.");
  return { width: readUint32(data, 0), height: readUint32(data, 4), bitDepth: data[8] ?? 0, colorType: data[9] ?? 0, interlace: data[12] ?? 0 };
}

function channelsOf(colorType: number): number {
  switch (colorType) {
    case 0:
      return 1;
    case 2:
      return 3;
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      throw new Error(`지원하지 않는 PNG colorType ${colorType}(팔레트·16bit 미지원).`);
  }
}

function unfilter(scanlines: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  if (scanlines.length !== (stride + 1) * height) {
    throw new Error(`PNG 스캔라인 길이 ${scanlines.length}가 기대값 ${(stride + 1) * height}와 다릅니다.`);
  }
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const type = scanlines[y * (stride + 1)] ?? 0;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const priorBase = dst - stride;
    for (let i = 0; i < stride; i += 1) {
      const raw = scanlines[src + i] ?? 0;
      const left = i >= bpp ? (out[dst + i - bpp] ?? 0) : 0;
      const up = y > 0 ? (out[priorBase + i] ?? 0) : 0;
      const upLeft = y > 0 && i >= bpp ? (out[priorBase + i - bpp] ?? 0) : 0;
      let value: number;
      switch (type) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + left;
          break;
        case 2:
          value = raw + up;
          break;
        case 3:
          value = raw + ((left + up) >> 1);
          break;
        case 4:
          value = raw + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`PNG 필터 타입 ${type}은 유효하지 않습니다(행 ${y}).`);
      }
      out[dst + i] = value & 0xff;
    }
  }
  return out;
}

/**
 * PNG → CapturedRaster(straight RGBA, top-down). 8bit 비인터레이스 Gray/GA/RGB/RGBA만 지원하며
 * CRC 불일치·지원 외 형식은 throw한다.
 */
export async function decodePng(bytes: Uint8Array): Promise<CapturedRaster> {
  const chunks = readPngChunks(bytes);
  const ihdrChunk = chunks[0];
  if (!ihdrChunk || ihdrChunk.type !== "IHDR") throw new Error("첫 청크가 IHDR이 아닙니다.");
  for (const chunk of chunks) {
    if (!chunk.crcOk) throw new Error(`PNG 청크 ${chunk.type}의 CRC가 맞지 않습니다.`);
  }
  const header = parseIhdr(ihdrChunk.data);
  if (header.bitDepth !== 8) throw new Error(`지원하지 않는 PNG bitDepth ${header.bitDepth}(8bit만 지원).`);
  if (header.interlace !== 0) throw new Error("인터레이스 PNG는 지원하지 않습니다.");
  const channels = channelsOf(header.colorType);
  const idat = chunks.filter((c) => c.type === "IDAT");
  if (idat.length === 0) throw new Error("IDAT 청크가 없습니다.");
  let total = 0;
  for (const c of idat) total += c.data.length;
  const compressed = new Uint8Array(total);
  let offset = 0;
  for (const c of idat) {
    compressed.set(c.data, offset);
    offset += c.data.length;
  }
  const raw = unfilter(await inflateBytes(compressed), header.width, header.height, channels);
  const pixels = header.width * header.height;
  const rgba = new Uint8ClampedArray(pixels * 4);
  for (let p = 0; p < pixels; p += 1) {
    const s = p * channels;
    const d = p * 4;
    switch (channels) {
      case 1:
        rgba[d] = rgba[d + 1] = rgba[d + 2] = raw[s] ?? 0;
        rgba[d + 3] = 255;
        break;
      case 2:
        rgba[d] = rgba[d + 1] = rgba[d + 2] = raw[s] ?? 0;
        rgba[d + 3] = raw[s + 1] ?? 0;
        break;
      case 3:
        rgba[d] = raw[s] ?? 0;
        rgba[d + 1] = raw[s + 1] ?? 0;
        rgba[d + 2] = raw[s + 2] ?? 0;
        rgba[d + 3] = 255;
        break;
      default:
        rgba[d] = raw[s] ?? 0;
        rgba[d + 1] = raw[s + 1] ?? 0;
        rgba[d + 2] = raw[s + 2] ?? 0;
        rgba[d + 3] = raw[s + 3] ?? 0;
    }
  }
  return { width: header.width, height: header.height, rgba };
}
