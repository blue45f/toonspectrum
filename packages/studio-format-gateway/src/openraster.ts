/**
 * Preserve-first OpenRaster 0.0.6 baseline reader.
 *
 * The data model and validation rules in this file are derived from the public
 * OpenRaster specification published at https://www.openraster.org/. This is an
 * independent TypeScript implementation; no GPL application source was copied.
 *
 * P0 deliberately does not decode PNG pixels or synthesize a replacement ZIP.
 * It authenticates the bounded ZIP container, validates PNG structure, retains
 * every source byte, and exposes unsupported semantics instead of losing them.
 */

import {
  FORMAT_ZIP_READER_LIMITS,
  FormatZipReaderError,
  readFormatZipArchive,
  type FormatZipArchive,
  type FormatZipInflateRawAdapter,
  type FormatZipReaderLimits,
  type FormatZipReaderSource,
} from "./bounded-zip";
import {
  bytesToBase64,
  parseSafeXml,
  SafeXmlError,
  type FormatIssue,
  type SafeXmlElement,
  xmlLocalName,
} from "./format-common";

export const OPENRASTER_MIMETYPE = "image/openraster";

export const OPENRASTER_LIMITS = Object.freeze({
  ...FORMAT_ZIP_READER_LIMITS,
  maxStackXmlBytes: 4_000_000,
  maxCanvasDimension: 1_000_000,
  maxXmlDepth: 64,
  maxXmlNodes: 50_000,
});

export interface OpenRasterLimits extends FormatZipReaderLimits {
  maxStackXmlBytes: number;
  maxCanvasDimension: number;
  maxXmlDepth: number;
  maxXmlNodes: number;
}

export interface OpenRasterImportOptions {
  inflateRaw?: FormatZipInflateRawAdapter;
  signal?: AbortSignal;
  /** Callers may lower, but never raise, the hard parser limits. */
  limits?: Partial<OpenRasterLimits>;
}

export type OpenRasterErrorCode =
  | "aborted"
  | "archive-invalid"
  | "mimetype-invalid"
  | "mimetype-missing"
  | "preservation-invalid"
  | "source-invalid"
  | "source-too-large"
  | "stack-invalid"
  | "stack-missing";

export class OpenRasterError extends Error {
  constructor(
    message: string,
    readonly code: OpenRasterErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OpenRasterError";
  }
}

export const OPENRASTER_BASELINE_COMPOSITE_OPERATIONS = Object.freeze([
  "svg:src-over",
  "svg:multiply",
  "svg:screen",
  "svg:overlay",
  "svg:darken",
  "svg:lighten",
  "svg:color-dodge",
  "svg:color-burn",
  "svg:hard-light",
  "svg:soft-light",
  "svg:difference",
  "svg:color",
  "svg:luminosity",
  "svg:hue",
  "svg:saturation",
  "svg:plus",
  "svg:dst-in",
  "svg:dst-out",
  "svg:src-atop",
  "svg:dst-atop",
] as const);

export type OpenRasterBaselineCompositeOperation =
  (typeof OPENRASTER_BASELINE_COMPOSITE_OPERATIONS)[number];

export interface OpenRasterPngDimensions {
  width: number;
  height: number;
}

export interface OpenRasterPngResource {
  path: string;
  role: "layer" | "merged-image" | "thumbnail" | "unreferenced-data" | "other";
  byteLength: number;
  sha256: string;
  /** Exact PNG bytes. Pixels have not been decoded. */
  base64: string;
  decoded: false;
  validation: "png-container-structure-only";
  structurallyValid: boolean;
  dimensions: OpenRasterPngDimensions | null;
  bitDepth: number | null;
  colorType: number | null;
  compressionMethod: number | null;
  filterMethod: number | null;
  interlaceMethod: number | null;
  chunkTypes: readonly string[];
  colorProfileChunks: readonly string[];
  errors: readonly string[];
}

export interface OpenRasterNodeCommon {
  /** Stable XML-order address. `0` is the root stack; children append `.N`. */
  id: string;
  order: number;
  name: string;
  visibility: "visible" | "hidden";
  opacity: number;
  compositeOp: string;
  compositeOpSupported: boolean;
  /** Exact attributes after safe XML entity decoding. Unknown fields remain here. */
  attributes: Readonly<Record<string, string>>;
}

export interface OpenRasterLayerNode extends OpenRasterNodeCommon {
  kind: "layer";
  src: string;
  x: number;
  y: number;
  selected: boolean | null;
  resourceStatus: "available" | "damaged" | "invalid-reference" | "missing" | "unsupported-type";
  pngSha256: string | null;
}

export interface OpenRasterStackNode extends OpenRasterNodeCommon {
  kind: "stack";
  isolation: "isolate" | "auto";
  children: readonly OpenRasterNode[];
}

export type OpenRasterNode = OpenRasterLayerNode | OpenRasterStackNode;

export interface OpenRasterImageDocument {
  version: string;
  width: number;
  height: number;
  xResolutionPpi: number;
  yResolutionPpi: number;
  attributes: Readonly<Record<string, string>>;
  root: OpenRasterStackNode;
}

export interface OpenRasterArchiveEntryReceipt {
  path: string;
  directory: boolean;
  compressionMethod: 0 | 8;
  compressedBytes: number;
  uncompressedBytes: number;
  crc32: number;
}

export interface OpenRasterPreservationReceipt {
  schemaVersion: 1;
  contract: "source-archive-byte-for-byte";
  archiveSha256: string;
  archiveByteLength: number;
  canSerializeSemanticEdits: false;
  exportBehavior: "returns-authenticated-original-archive";
  entries: readonly OpenRasterArchiveEntryReceipt[];
}

export interface OpenRasterImportResult {
  format: "openraster";
  specProfile: "openraster-0.0.6-baseline-preserve-first";
  image: OpenRasterImageDocument;
  pngResources: readonly OpenRasterPngResource[];
  warnings: readonly FormatIssue[];
  unsupported: readonly FormatIssue[];
  sourceArchive: {
    format: "openraster";
    byteLength: number;
    sha256: string;
    base64: string;
  };
  preservation: OpenRasterPreservationReceipt;
}

type ResolvedLimits = OpenRasterLimits;

const textEncoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const baselineCompositeOps = new Set<string>(OPENRASTER_BASELINE_COMPOSITE_OPERATIONS);
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_COLOR_TYPES = new Set([0, 2, 3, 4, 6]);
const PNG_BIT_DEPTHS_BY_COLOR_TYPE: Readonly<Record<number, ReadonlySet<number>>> = Object.freeze({
  0: new Set([1, 2, 4, 8, 16]),
  2: new Set([8, 16]),
  3: new Set([1, 2, 4, 8]),
  4: new Set([8, 16]),
  6: new Set([8, 16]),
});
const PNG_PROFILE_CHUNKS = new Set(["iCCP"]);
const IMAGE_ATTRIBUTES = new Set(["version", "w", "h", "xres", "yres"]);
const STACK_ATTRIBUTES = new Set(["name", "opacity", "visibility", "composite-op", "isolation"]);
const LAYER_ATTRIBUTES = new Set([
  "name",
  "opacity",
  "visibility",
  "composite-op",
  "src",
  "x",
  "y",
  "selected",
]);

const SHA256_INITIAL = Uint32Array.from([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
const SHA256_CONSTANTS = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function rotateRight(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** Browser-portable SHA-256 used for preservation receipts and raw PNG identity. */
export function openRasterSha256Hex(bytes: Uint8Array): string {
  const state = SHA256_INITIAL.slice();
  const words = new Uint32Array(64);
  const totalBlocks = Math.ceil((bytes.byteLength + 9) / 64);
  const bitLength = BigInt(bytes.byteLength) * BigInt(8);

  for (let blockIndex = 0; blockIndex < totalBlocks; blockIndex += 1) {
    const blockOffset = blockIndex * 64;
    const block = new Uint8Array(64);
    for (let byteIndex = 0; byteIndex < 64; byteIndex += 1) {
      const absolute = blockOffset + byteIndex;
      if (absolute < bytes.byteLength) block[byteIndex] = bytes[absolute] ?? 0;
      else if (absolute === bytes.byteLength) block[byteIndex] = 0x80;
    }
    if (blockIndex === totalBlocks - 1) {
      const view = new DataView(block.buffer);
      view.setUint32(56, Number((bitLength >> BigInt(32)) & BigInt("0xffffffff")), false);
      view.setUint32(60, Number(bitLength & BigInt("0xffffffff")), false);
    }
    const view = new DataView(block.buffer);
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(index * 4, false);
    for (let index = 16; index < words.length; index += 1) {
      const before15 = words[index - 15] ?? 0;
      const before2 = words[index - 2] ?? 0;
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3);
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10);
      words[index] = ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) >>> 0;
    }

    let a = state[0] ?? 0;
    let b = state[1] ?? 0;
    let c = state[2] ?? 0;
    let d = state[3] ?? 0;
    let e = state[4] ?? 0;
    let f = state[5] ?? 0;
    let g = state[6] ?? 0;
    let h = state[7] ?? 0;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choose + (SHA256_CONSTANTS[index] ?? 0) + (words[index] ?? 0)) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = ((state[0] ?? 0) + a) >>> 0;
    state[1] = ((state[1] ?? 0) + b) >>> 0;
    state[2] = ((state[2] ?? 0) + c) >>> 0;
    state[3] = ((state[3] ?? 0) + d) >>> 0;
    state[4] = ((state[4] ?? 0) + e) >>> 0;
    state[5] = ((state[5] ?? 0) + f) >>> 0;
    state[6] = ((state[6] ?? 0) + g) >>> 0;
    state[7] = ((state[7] ?? 0) + h) >>> 0;
  }
  return [...state].map((word) => word.toString(16).padStart(8, "0")).join("");
}

function crc32Parts(...parts: readonly Uint8Array[]): number {
  let value = 0xffff_ffff;
  for (const bytes of parts) {
    for (const byte of bytes) {
      value = (CRC32_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
    }
  }
  return (value ^ 0xffff_ffff) >>> 0;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function issue(
  scope: FormatIssue["scope"],
  code: string,
  message: string,
  path?: string,
): FormatIssue {
  return path === undefined ? { scope, code, message } : { scope, code, message, path };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new OpenRasterError("OpenRaster import was aborted", "aborted");
}

function resolveIntegerLimit(
  requested: number | undefined,
  maximum: number,
  name: keyof OpenRasterLimits,
): number {
  if (requested === undefined) return maximum;
  if (!Number.isSafeInteger(requested) || requested < 0 || requested > maximum) {
    throw new OpenRasterError(
      `${name} must be an integer between 0 and ${maximum}`,
      "source-too-large",
    );
  }
  return requested;
}

function lowerLimits(requested?: Partial<OpenRasterLimits>): ResolvedLimits {
  return {
    maxArchiveBytes: resolveIntegerLimit(
      requested?.maxArchiveBytes,
      OPENRASTER_LIMITS.maxArchiveBytes,
      "maxArchiveBytes",
    ),
    maxEntries: resolveIntegerLimit(requested?.maxEntries, OPENRASTER_LIMITS.maxEntries, "maxEntries"),
    maxEntryCompressedBytes: resolveIntegerLimit(
      requested?.maxEntryCompressedBytes,
      OPENRASTER_LIMITS.maxEntryCompressedBytes,
      "maxEntryCompressedBytes",
    ),
    maxEntryUncompressedBytes: resolveIntegerLimit(
      requested?.maxEntryUncompressedBytes,
      OPENRASTER_LIMITS.maxEntryUncompressedBytes,
      "maxEntryUncompressedBytes",
    ),
    maxTotalUncompressedBytes: resolveIntegerLimit(
      requested?.maxTotalUncompressedBytes,
      OPENRASTER_LIMITS.maxTotalUncompressedBytes,
      "maxTotalUncompressedBytes",
    ),
    maxCentralDirectoryBytes: resolveIntegerLimit(
      requested?.maxCentralDirectoryBytes,
      OPENRASTER_LIMITS.maxCentralDirectoryBytes,
      "maxCentralDirectoryBytes",
    ),
    maxPathBytes: resolveIntegerLimit(
      requested?.maxPathBytes,
      OPENRASTER_LIMITS.maxPathBytes,
      "maxPathBytes",
    ),
    maxCompressionRatio: resolveIntegerLimit(
      requested?.maxCompressionRatio,
      OPENRASTER_LIMITS.maxCompressionRatio,
      "maxCompressionRatio",
    ),
    maxCommentBytes: resolveIntegerLimit(
      requested?.maxCommentBytes,
      OPENRASTER_LIMITS.maxCommentBytes,
      "maxCommentBytes",
    ),
    maxStackXmlBytes: resolveIntegerLimit(
      requested?.maxStackXmlBytes,
      OPENRASTER_LIMITS.maxStackXmlBytes,
      "maxStackXmlBytes",
    ),
    maxCanvasDimension: resolveIntegerLimit(
      requested?.maxCanvasDimension,
      OPENRASTER_LIMITS.maxCanvasDimension,
      "maxCanvasDimension",
    ),
    maxXmlDepth: resolveIntegerLimit(
      requested?.maxXmlDepth,
      OPENRASTER_LIMITS.maxXmlDepth,
      "maxXmlDepth",
    ),
    maxXmlNodes: resolveIntegerLimit(
      requested?.maxXmlNodes,
      OPENRASTER_LIMITS.maxXmlNodes,
      "maxXmlNodes",
    ),
  };
}

async function readSourceBytes(
  source: FormatZipReaderSource,
  maxArchiveBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  throwIfAborted(signal);
  if (source instanceof Uint8Array) {
    if (source.byteLength > maxArchiveBytes) {
      throw new OpenRasterError("OpenRaster archive exceeds its safety limit", "source-too-large");
    }
    return source.slice();
  }
  if (source instanceof ArrayBuffer) {
    if (source.byteLength > maxArchiveBytes) {
      throw new OpenRasterError("OpenRaster archive exceeds its safety limit", "source-too-large");
    }
    return new Uint8Array(source.slice(0));
  }
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    if (source.size > maxArchiveBytes) {
      throw new OpenRasterError("OpenRaster archive exceeds its safety limit", "source-too-large");
    }
    try {
      const bytes = new Uint8Array(await source.arrayBuffer());
      throwIfAborted(signal);
      if (bytes.byteLength !== source.size) {
        throw new OpenRasterError("OpenRaster Blob size changed while reading", "source-invalid");
      }
      return bytes;
    } catch (cause) {
      if (cause instanceof OpenRasterError) throw cause;
      throw new OpenRasterError("OpenRaster Blob could not be read", "source-invalid", { cause });
    }
  }
  throw new OpenRasterError("Unsupported OpenRaster source type", "source-invalid");
}

function copyAttributes(element: SafeXmlElement): Readonly<Record<string, string>> {
  return Object.freeze({ ...element.attrs });
}

function inspectUnknownAttributes(
  element: SafeXmlElement,
  known: ReadonlySet<string>,
  xmlPath: string,
  unsupported: FormatIssue[],
): void {
  for (const [name, value] of Object.entries(element.attrs)) {
    if (known.has(name) || name === "xmlns" || name.startsWith("xmlns:")) continue;
    const local = xmlLocalName(name).toLowerCase();
    const code = local.includes("mask")
      ? "mask-attribute-unsupported"
      : local.includes("anim") || local.includes("timeline")
        ? "animation-attribute-unsupported"
        : local.includes("profile") || local.includes("color-space")
          ? "color-profile-attribute-unsupported"
          : "xml-attribute-unsupported";
    unsupported.push(
      issue("semantic", code, `${name}=${JSON.stringify(value)} is preserved only in stack.xml`, xmlPath),
    );
  }
}

function parseIntegerAttribute(
  element: SafeXmlElement,
  name: string,
  fallback: number,
  xmlPath: string,
  unsupported: FormatIssue[],
): number {
  const raw = element.attrs[name];
  if (raw === undefined) return fallback;
  if (!/^-?(?:0|[1-9][0-9]*)$/u.test(raw)) {
    unsupported.push(issue("semantic", "integer-attribute-invalid", `${name}=${raw} is not an integer`, xmlPath));
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    unsupported.push(issue("semantic", "integer-attribute-invalid", `${name}=${raw} exceeds safe integer range`, xmlPath));
    return fallback;
  }
  return parsed;
}

function parsePositiveInteger(
  element: SafeXmlElement,
  name: string,
  maximum: number,
): number {
  const raw = element.attrs[name];
  if (raw === undefined || !/^(?:[1-9][0-9]*)$/u.test(raw)) {
    throw new OpenRasterError(`stack.xml image attribute ${name} must be a positive integer`, "stack-invalid");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new OpenRasterError(`stack.xml image attribute ${name} exceeds its safety limit`, "stack-invalid");
  }
  return value;
}

function parseOpacity(
  element: SafeXmlElement,
  xmlPath: string,
  unsupported: FormatIssue[],
): number {
  const raw = element.attrs.opacity;
  if (raw === undefined) return 1;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    unsupported.push(issue("semantic", "opacity-invalid", `opacity=${raw} is outside [0,1]`, xmlPath));
    return 1;
  }
  return parsed;
}

function parseVisibility(
  element: SafeXmlElement,
  xmlPath: string,
  unsupported: FormatIssue[],
): "visible" | "hidden" {
  const raw = element.attrs.visibility;
  if (raw === undefined || raw === "visible") return "visible";
  if (raw === "hidden") return "hidden";
  unsupported.push(issue("semantic", "visibility-invalid", `visibility=${raw} is not baseline OpenRaster`, xmlPath));
  return "visible";
}

function parseSelected(
  element: SafeXmlElement,
  xmlPath: string,
  unsupported: FormatIssue[],
): boolean | null {
  const raw = element.attrs.selected;
  if (raw === undefined) return null;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  unsupported.push(issue("semantic", "selected-invalid", `selected=${raw} is not an XML boolean`, xmlPath));
  return null;
}

function commonNode(
  element: SafeXmlElement,
  id: string,
  order: number,
  unsupported: FormatIssue[],
): OpenRasterNodeCommon {
  const compositeOp = element.attrs["composite-op"] ?? "svg:src-over";
  const compositeOpSupported = baselineCompositeOps.has(compositeOp);
  if (!compositeOpSupported) {
    unsupported.push(
      issue(
        "semantic",
        "composite-op-unsupported",
        `composite-op=${compositeOp} is preserved but not in the OpenRaster 0.0.6 baseline set`,
        id,
      ),
    );
  }
  return {
    id,
    order,
    name: element.attrs.name ?? "",
    visibility: parseVisibility(element, id, unsupported),
    opacity: parseOpacity(element, id, unsupported),
    compositeOp,
    compositeOpSupported,
    attributes: copyAttributes(element),
  };
}

function isSafeArchiveReference(path: string): boolean {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    /^[A-Za-z]:/u.test(path)
  ) {
    return false;
  }
  return path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

interface ParsedPng {
  dimensions: OpenRasterPngDimensions | null;
  bitDepth: number | null;
  colorType: number | null;
  compressionMethod: number | null;
  filterMethod: number | null;
  interlaceMethod: number | null;
  chunkTypes: string[];
  colorProfileChunks: string[];
  errors: string[];
}

function inspectPng(bytes: Uint8Array, maxDimension: number): ParsedPng {
  const result: ParsedPng = {
    dimensions: null,
    bitDepth: null,
    colorType: null,
    compressionMethod: null,
    filterMethod: null,
    interlaceMethod: null,
    chunkTypes: [],
    colorProfileChunks: [],
    errors: [],
  };
  if (bytes.byteLength < PNG_SIGNATURE.byteLength || !equalBytes(bytes.subarray(0, 8), PNG_SIGNATURE)) {
    result.errors.push("PNG signature is missing or invalid");
    return result;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) {
      result.errors.push("PNG chunk header is truncated");
      break;
    }
    const length = view.getUint32(offset, false);
    const chunkEnd = offset + 12 + length;
    if (!Number.isSafeInteger(chunkEnd) || chunkEnd > bytes.byteLength) {
      result.errors.push("PNG chunk payload is truncated");
      break;
    }
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    if (!/^[A-Za-z]{4}$/u.test(type)) result.errors.push(`PNG chunk type ${JSON.stringify(type)} is invalid`);
    result.chunkTypes.push(type);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const declaredCrc = view.getUint32(offset + 8 + length, false);
    const computedCrc = crc32Parts(typeBytes, data);
    if (declaredCrc !== computedCrc) result.errors.push(`PNG chunk ${type} CRC mismatch`);

    if (type === "IHDR") {
      if (sawHeader || offset !== 8 || length !== 13) {
        result.errors.push("PNG IHDR must be the first, unique 13-byte chunk");
      } else {
        sawHeader = true;
        const width = view.getUint32(offset + 8, false);
        const height = view.getUint32(offset + 12, false);
        result.bitDepth = bytes[offset + 16] ?? null;
        result.colorType = bytes[offset + 17] ?? null;
        result.compressionMethod = bytes[offset + 18] ?? null;
        result.filterMethod = bytes[offset + 19] ?? null;
        result.interlaceMethod = bytes[offset + 20] ?? null;
        if (width === 0 || height === 0 || width > maxDimension || height > maxDimension) {
          result.errors.push("PNG dimensions are zero or exceed the safety limit");
        } else {
          result.dimensions = { width, height };
        }
        if (!PNG_COLOR_TYPES.has(result.colorType ?? -1)) {
          result.errors.push("PNG color type is invalid");
        } else if (
          !PNG_BIT_DEPTHS_BY_COLOR_TYPE[result.colorType ?? -1]?.has(result.bitDepth ?? -1)
        ) {
          result.errors.push("PNG bit depth is invalid for its color type");
        }
        if (result.compressionMethod !== 0 || result.filterMethod !== 0) {
          result.errors.push("PNG compression or filter method is unsupported");
        }
        if (result.interlaceMethod !== 0 && result.interlaceMethod !== 1) {
          result.errors.push("PNG interlace method is invalid");
        }
      }
    } else if (!sawHeader) {
      result.errors.push(`PNG ${type} appears before IHDR`);
    }
    if (type === "IDAT") sawImageData = true;
    if (PNG_PROFILE_CHUNKS.has(type) && !result.colorProfileChunks.includes(type)) {
      result.colorProfileChunks.push(type);
    }
    if (type === "IEND") {
      if (length !== 0) result.errors.push("PNG IEND must be empty");
      sawEnd = true;
      if (chunkEnd !== bytes.byteLength) result.errors.push("PNG has trailing bytes after IEND");
      break;
    }
    offset = chunkEnd;
  }
  if (!sawHeader) result.errors.push("PNG IHDR is missing");
  if (!sawImageData) result.errors.push("PNG IDAT is missing");
  if (!sawEnd) result.errors.push("PNG IEND is missing");
  return result;
}

function inspectUnsupportedElement(
  element: SafeXmlElement,
  xmlPath: string,
  unsupported: FormatIssue[],
): void {
  const local = xmlLocalName(element.name).toLowerCase();
  const code = local === "mask"
    ? "mask-element-unsupported"
    : local === "text"
      ? "text-element-unsupported"
      : local === "filter"
        ? "filter-element-unsupported"
        : local.includes("anim") || local.includes("timeline")
          ? "animation-element-unsupported"
          : "xml-element-unsupported";
  unsupported.push(
    issue(
      "semantic",
      code,
      `<${element.name}> is preserved only in the authenticated stack.xml source`,
      xmlPath,
    ),
  );
}

interface ParseNodesContext {
  archive: FormatZipArchive;
  pngByPath: ReadonlyMap<string, OpenRasterPngResource>;
  referencedPaths: Set<string>;
  unsupported: FormatIssue[];
}

function parseLayer(
  element: SafeXmlElement,
  id: string,
  order: number,
  context: ParseNodesContext,
): OpenRasterLayerNode {
  inspectUnknownAttributes(element, LAYER_ATTRIBUTES, id, context.unsupported);
  for (let index = 0; index < element.children.length; index += 1) {
    const child = element.children[index];
    if (child !== undefined) inspectUnsupportedElement(child, `${id}.${index}`, context.unsupported);
  }
  const src = element.attrs.src ?? "";
  let resourceStatus: OpenRasterLayerNode["resourceStatus"];
  let pngSha256: string | null = null;
  if (!isSafeArchiveReference(src)) {
    resourceStatus = "invalid-reference";
    context.unsupported.push(
      issue("resource", "layer-src-invalid", `layer src=${JSON.stringify(src)} is not a safe archive path`, id),
    );
  } else {
    context.referencedPaths.add(src);
    const entry = context.archive.getEntry(src);
    if (entry === undefined || entry.directory) {
      resourceStatus = "missing";
      context.unsupported.push(issue("resource", "layer-src-missing", "referenced layer resource is absent", src));
    } else if (!src.startsWith("data/") || !src.endsWith(".png")) {
      resourceStatus = "unsupported-type";
      context.unsupported.push(
        issue(
          "resource",
          "layer-src-type-unsupported",
          "P0 supports structural PNG layers under data/; source is preserved in the archive",
          src,
        ),
      );
    } else {
      const png = context.pngByPath.get(src);
      pngSha256 = png?.sha256 ?? null;
      resourceStatus = png?.structurallyValid === true ? "available" : "damaged";
      if (resourceStatus === "damaged") {
        context.unsupported.push(
          issue("resource", "layer-png-damaged", "layer PNG failed structural validation", src),
        );
      }
    }
  }
  return {
    ...commonNode(element, id, order, context.unsupported),
    kind: "layer",
    src,
    x: parseIntegerAttribute(element, "x", 0, id, context.unsupported),
    y: parseIntegerAttribute(element, "y", 0, id, context.unsupported),
    selected: parseSelected(element, id, context.unsupported),
    resourceStatus,
    pngSha256,
  };
}

function parseStack(
  element: SafeXmlElement,
  id: string,
  order: number,
  context: ParseNodesContext,
  root: boolean,
): OpenRasterStackNode {
  inspectUnknownAttributes(element, root ? new Set<string>() : STACK_ATTRIBUTES, id, context.unsupported);
  if (root && Object.keys(element.attrs).length > 0) {
    context.unsupported.push(
      issue("semantic", "root-stack-attributes-unsupported", "baseline root stack must not have attributes", id),
    );
  }
  if (!root && (element.attrs.x !== undefined || element.attrs.y !== undefined)) {
    context.unsupported.push(
      issue("semantic", "stack-offset-unsupported", "stack x/y offsets are deprecated and ignored", id),
    );
  }
  const rawIsolation = element.attrs.isolation ?? "isolate";
  const isolation = rawIsolation === "auto" || rawIsolation === "isolate" ? rawIsolation : "isolate";
  if (rawIsolation !== "auto" && rawIsolation !== "isolate") {
    context.unsupported.push(
      issue("semantic", "stack-isolation-unsupported", `isolation=${rawIsolation} is not baseline OpenRaster`, id),
    );
  }
  const children: OpenRasterNode[] = [];
  for (let childIndex = 0; childIndex < element.children.length; childIndex += 1) {
    const child = element.children[childIndex];
    if (child === undefined) continue;
    const childPath = `${id}.${childIndex}`;
    const localName = xmlLocalName(child.name);
    if (localName === "layer") children.push(parseLayer(child, childPath, childIndex, context));
    else if (localName === "stack") children.push(parseStack(child, childPath, childIndex, context, false));
    else inspectUnsupportedElement(child, childPath, context.unsupported);
  }
  const common = root
    ? {
        id,
        order,
        name: "",
        visibility: "visible" as const,
        opacity: 1,
        compositeOp: "svg:src-over",
        compositeOpSupported: true,
        attributes: copyAttributes(element),
      }
    : commonNode(element, id, order, context.unsupported);
  return { ...common, kind: "stack", isolation, children };
}

function readPngRole(
  path: string,
  referencedPaths: ReadonlySet<string>,
): OpenRasterPngResource["role"] {
  if (path === "mergedimage.png") return "merged-image";
  if (path === "Thumbnails/thumbnail.png") return "thumbnail";
  if (referencedPaths.has(path)) return "layer";
  if (path.startsWith("data/")) return "unreferenced-data";
  return "other";
}

function decodeBase64(value: string): Uint8Array {
  let binary: string;
  try {
    binary = globalThis.atob(value);
  } catch (cause) {
    throw new OpenRasterError("preserved OpenRaster base64 is invalid", "preservation-invalid", { cause });
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * Return the authenticated original ORA bytes exactly as imported.
 *
 * This intentionally does not serialize edits made to the parsed object. P0 has
 * no ZIP writer, so pretending otherwise would silently discard unsupported data.
 */
export function exportPreservedOpenRaster(result: OpenRasterImportResult): Uint8Array {
  if (
    result.preservation.contract !== "source-archive-byte-for-byte" ||
    result.preservation.canSerializeSemanticEdits !== false ||
    result.preservation.exportBehavior !== "returns-authenticated-original-archive"
  ) {
    throw new OpenRasterError("OpenRaster preservation receipt is incompatible", "preservation-invalid");
  }
  const bytes = decodeBase64(result.sourceArchive.base64);
  const digest = openRasterSha256Hex(bytes);
  if (
    bytes.byteLength !== result.sourceArchive.byteLength ||
    bytes.byteLength !== result.preservation.archiveByteLength ||
    digest !== result.sourceArchive.sha256 ||
    digest !== result.preservation.archiveSha256
  ) {
    throw new OpenRasterError("OpenRaster source archive failed preservation authentication", "preservation-invalid");
  }
  return bytes;
}

function requiredEntry(
  archive: FormatZipArchive,
  path: string,
  code: "mimetype-missing" | "stack-missing",
): NonNullable<ReturnType<FormatZipArchive["getEntry"]>> {
  const entry = archive.getEntry(path);
  if (entry === undefined || entry.directory) {
    throw new OpenRasterError(`OpenRaster archive is missing required ${path}`, code);
  }
  return entry;
}

function inspectArchiveSpecificUnknowns(
  archive: FormatZipArchive,
  referencedPaths: ReadonlySet<string>,
  unsupported: FormatIssue[],
): void {
  const known = new Set(["mimetype", "stack.xml", "mergedimage.png", "Thumbnails/thumbnail.png"]);
  for (const path of referencedPaths) known.add(path);
  for (const entry of archive.entries) {
    if (entry.directory) {
      if (entry.path !== "data/" && entry.path !== "Thumbnails/") {
        unsupported.push(
          issue("container", "unknown-directory-preserved", "unknown directory is retained in source archive", entry.path),
        );
      }
      continue;
    }
    if (known.has(entry.path)) continue;
    const lower = entry.path.toLowerCase();
    const code = /(?:^|\/)(?:animation|timeline|frames?)(?:\/|\.|$)/u.test(lower)
      ? "animation-entry-unsupported"
      : /(?:^|\/)(?:mask|masks)(?:\/|\.|$)/u.test(lower)
        ? "mask-entry-unsupported"
        : /(?:profile|\.icc$|\.icm$)/u.test(lower)
          ? "color-profile-entry-unsupported"
          : entry.path.startsWith("data/") && entry.path.endsWith(".png")
            ? "unreferenced-data-png"
            : "unknown-entry-preserved";
    unsupported.push(
      issue("resource", code, "entry has no P0 semantic lane and remains in the authenticated source archive", entry.path),
    );
  }
}

/** Import a bounded OpenRaster archive without decoding or flattening its PNG layers. */
export async function importOpenRaster(
  source: FormatZipReaderSource,
  options: OpenRasterImportOptions = {},
): Promise<OpenRasterImportResult> {
  const limits = lowerLimits(options.limits);
  const sourceArchiveBytes = await readSourceBytes(source, limits.maxArchiveBytes, options.signal);
  const zipLimits: Partial<FormatZipReaderLimits> = {
    maxArchiveBytes: limits.maxArchiveBytes,
    maxEntries: limits.maxEntries,
    maxEntryCompressedBytes: limits.maxEntryCompressedBytes,
    maxEntryUncompressedBytes: limits.maxEntryUncompressedBytes,
    maxTotalUncompressedBytes: limits.maxTotalUncompressedBytes,
    maxCentralDirectoryBytes: limits.maxCentralDirectoryBytes,
    maxPathBytes: limits.maxPathBytes,
    maxCompressionRatio: limits.maxCompressionRatio,
    maxCommentBytes: limits.maxCommentBytes,
  };
  let archive: FormatZipArchive;
  try {
    archive = await readFormatZipArchive(sourceArchiveBytes, {
      inflateRaw: options.inflateRaw,
      limits: zipLimits,
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof FormatZipReaderError && cause.code === "ABORTED") {
      throw new OpenRasterError("OpenRaster import was aborted", "aborted", { cause });
    }
    throw new OpenRasterError("OpenRaster ZIP container is invalid", "archive-invalid", { cause });
  }

  const mimetypeEntry = requiredEntry(archive, "mimetype", "mimetype-missing");
  const firstEntry = archive.entries[0];
  if (firstEntry?.path !== "mimetype" || mimetypeEntry.compressionMethod !== 0) {
    throw new OpenRasterError(
      "OpenRaster mimetype must be the first physical ZIP entry and stored without compression",
      "mimetype-invalid",
    );
  }
  const stackEntry = requiredEntry(archive, "stack.xml", "stack-missing");
  if (stackEntry.uncompressedBytes > limits.maxStackXmlBytes) {
    throw new OpenRasterError("OpenRaster stack.xml exceeds its safety limit", "stack-invalid");
  }

  // Eagerly authenticate every entry with bounded-zip's declared-size, inflate,
  // and CRC checks. Unknown entries are still untrusted until this loop succeeds.
  const entryBytes = new Map<string, Uint8Array>();
  try {
    for (const entry of archive.entries) {
      throwIfAborted(options.signal);
      if (!entry.directory) entryBytes.set(entry.path, await archive.readEntry(entry, { signal: options.signal }));
    }
  } catch (cause) {
    if (cause instanceof OpenRasterError) throw cause;
    throw new OpenRasterError("OpenRaster ZIP entry failed size, inflate, or CRC validation", "archive-invalid", {
      cause,
    });
  }

  const mimetypeBytes = entryBytes.get("mimetype");
  if (mimetypeBytes === undefined || !equalBytes(mimetypeBytes, textEncoder.encode(OPENRASTER_MIMETYPE))) {
    throw new OpenRasterError("OpenRaster mimetype payload must be exactly image/openraster", "mimetype-invalid");
  }
  const stackBytes = entryBytes.get("stack.xml");
  if (stackBytes === undefined) throw new OpenRasterError("OpenRaster stack.xml is missing", "stack-missing");

  let rootElement: SafeXmlElement;
  try {
    rootElement = parseSafeXml(utf8Decoder.decode(stackBytes), {
      maxCharacters: limits.maxStackXmlBytes,
      maxDepth: limits.maxXmlDepth,
      maxNodes: limits.maxXmlNodes,
    });
  } catch (cause) {
    const reason = cause instanceof SafeXmlError ? `${cause.code}: ${cause.message}` : "invalid UTF-8";
    throw new OpenRasterError(`OpenRaster stack.xml is invalid (${reason})`, "stack-invalid", { cause });
  }
  if (xmlLocalName(rootElement.name) !== "image") {
    throw new OpenRasterError("OpenRaster stack.xml root must be <image>", "stack-invalid");
  }
  const version = rootElement.attrs.version;
  if (version === undefined || version.length === 0) {
    throw new OpenRasterError("OpenRaster image version is required", "stack-invalid");
  }
  const width = parsePositiveInteger(rootElement, "w", limits.maxCanvasDimension);
  const height = parsePositiveInteger(rootElement, "h", limits.maxCanvasDimension);
  const warnings: FormatIssue[] = [];
  const unsupported: FormatIssue[] = [];
  inspectUnknownAttributes(rootElement, IMAGE_ATTRIBUTES, "image", unsupported);
  if (version !== "0.0.6") {
    warnings.push(
      issue("metadata", "version-unverified", `OpenRaster ${version} is preserved; P0 is verified against 0.0.6`),
    );
  }

  const xresRaw = rootElement.attrs.xres;
  const yresRaw = rootElement.attrs.yres;
  let xResolutionPpi = 72;
  let yResolutionPpi = 72;
  if (xresRaw !== undefined || yresRaw !== undefined) {
    if (
      xresRaw === undefined ||
      yresRaw === undefined ||
      !/^(?:[1-9][0-9]*)$/u.test(xresRaw) ||
      !/^(?:[1-9][0-9]*)$/u.test(yresRaw) ||
      !Number.isSafeInteger(Number(xresRaw)) ||
      !Number.isSafeInteger(Number(yresRaw))
    ) {
      unsupported.push(
        issue("metadata", "resolution-invalid", "xres and yres must both be positive integers; raw values are preserved"),
      );
    } else {
      xResolutionPpi = Number(xresRaw);
      yResolutionPpi = Number(yresRaw);
    }
  }

  const rootStacks = rootElement.children.filter((child) => xmlLocalName(child.name) === "stack");
  if (rootStacks.length !== 1) {
    throw new OpenRasterError("OpenRaster image must contain exactly one root <stack>", "stack-invalid");
  }
  for (let index = 0; index < rootElement.children.length; index += 1) {
    const child = rootElement.children[index];
    if (child !== undefined && xmlLocalName(child.name) !== "stack") {
      inspectUnsupportedElement(child, `image.${index}`, unsupported);
    }
  }

  const referencedPaths = new Set<string>();
  const preliminaryPngs = new Map<string, OpenRasterPngResource>();
  for (const entry of archive.entries) {
    if (entry.directory || !entry.path.toLowerCase().endsWith(".png")) continue;
    const bytes = entryBytes.get(entry.path);
    if (bytes === undefined) continue;
    const inspection = inspectPng(bytes, limits.maxCanvasDimension);
    preliminaryPngs.set(entry.path, {
      path: entry.path,
      role: "other",
      byteLength: bytes.byteLength,
      sha256: openRasterSha256Hex(bytes),
      base64: bytesToBase64(bytes),
      decoded: false,
      validation: "png-container-structure-only",
      structurallyValid: inspection.errors.length === 0,
      dimensions: inspection.dimensions,
      bitDepth: inspection.bitDepth,
      colorType: inspection.colorType,
      compressionMethod: inspection.compressionMethod,
      filterMethod: inspection.filterMethod,
      interlaceMethod: inspection.interlaceMethod,
      chunkTypes: inspection.chunkTypes,
      colorProfileChunks: inspection.colorProfileChunks,
      errors: inspection.errors,
    });
  }

  const context: ParseNodesContext = {
    archive,
    pngByPath: preliminaryPngs,
    referencedPaths,
    unsupported,
  };
  const rootStackElement = rootStacks[0];
  if (rootStackElement === undefined) {
    throw new OpenRasterError("OpenRaster root stack is missing", "stack-invalid");
  }
  const root = parseStack(rootStackElement, "0", 0, context, true);

  const pngResources = [...preliminaryPngs.values()].map((resource) => ({
    ...resource,
    role: readPngRole(resource.path, referencedPaths),
  }));
  const pngByPath = new Map(pngResources.map((resource) => [resource.path, resource]));
  for (const resource of pngResources) {
    if (!resource.structurallyValid) {
      unsupported.push(
        issue(
          "resource",
          "png-structurally-invalid",
          `PNG bytes are preserved but not decoded: ${resource.errors.join("; ")}`,
          resource.path,
        ),
      );
    }
    if (resource.colorProfileChunks.length > 0) {
      unsupported.push(
        issue(
          "semantic",
          "png-color-profile-preserved",
          `color profile chunks ${resource.colorProfileChunks.join(", ")} are preserved but not interpreted`,
          resource.path,
        ),
      );
    }
  }

  const merged = pngByPath.get("mergedimage.png");
  if (archive.getEntry("mergedimage.png") === undefined) {
    warnings.push(issue("container", "merged-image-missing", "required mergedimage.png is absent"));
    unsupported.push(issue("resource", "merged-image-missing", "viewing-baseline preview is unavailable"));
  } else if (merged === undefined) {
    unsupported.push(issue("resource", "merged-image-not-png", "mergedimage.png could not be inspected"));
  } else {
    if (merged.bitDepth !== 8 && merged.bitDepth !== 16) {
      unsupported.push(
        issue("resource", "merged-image-bit-depth-unsupported", "mergedimage.png must use 8 or 16 bits per channel", merged.path),
      );
    }
    if (merged.dimensions !== null && (merged.dimensions.width !== width || merged.dimensions.height !== height)) {
      warnings.push(
        issue(
          "semantic",
          "merged-image-dimension-mismatch",
          `merged image is ${merged.dimensions.width}x${merged.dimensions.height}; image is ${width}x${height}`,
          merged.path,
        ),
      );
    }
  }
  const thumbnail = pngByPath.get("Thumbnails/thumbnail.png");
  if (archive.getEntry("Thumbnails/thumbnail.png") === undefined) {
    warnings.push(issue("container", "thumbnail-missing", "required Thumbnails/thumbnail.png is absent"));
    unsupported.push(issue("resource", "thumbnail-missing", "file-browser thumbnail is unavailable"));
  } else if (thumbnail !== undefined) {
    if (
      thumbnail.bitDepth !== 8 ||
      thumbnail.interlaceMethod !== 0 ||
      thumbnail.dimensions === null ||
      thumbnail.dimensions.width > 256 ||
      thumbnail.dimensions.height > 256
    ) {
      unsupported.push(
        issue(
          "resource",
          "thumbnail-requirements-unsupported",
          "thumbnail must be non-interlaced, 8-bit, and at most 256x256",
          thumbnail.path,
        ),
      );
    }
  }

  inspectArchiveSpecificUnknowns(archive, referencedPaths, unsupported);
  const archiveSha256 = openRasterSha256Hex(sourceArchiveBytes);
  const entryReceipts = archive.entries.map((entry) => ({
    path: entry.path,
    directory: entry.directory,
    compressionMethod: entry.compressionMethod,
    compressedBytes: entry.compressedBytes,
    uncompressedBytes: entry.uncompressedBytes,
    crc32: entry.crc32,
  }));
  return {
    format: "openraster",
    specProfile: "openraster-0.0.6-baseline-preserve-first",
    image: {
      version,
      width,
      height,
      xResolutionPpi,
      yResolutionPpi,
      attributes: copyAttributes(rootElement),
      root,
    },
    pngResources,
    warnings,
    unsupported,
    sourceArchive: {
      format: "openraster",
      byteLength: sourceArchiveBytes.byteLength,
      sha256: archiveSha256,
      base64: bytesToBase64(sourceArchiveBytes),
    },
    preservation: {
      schemaVersion: 1,
      contract: "source-archive-byte-for-byte",
      archiveSha256,
      archiveByteLength: sourceArchiveBytes.byteLength,
      canSerializeSemanticEdits: false,
      exportBehavior: "returns-authenticated-original-archive",
      entries: entryReceipts,
    },
  };
}
