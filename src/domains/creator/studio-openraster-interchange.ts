import {
  buildStudioPackageArchiveBlob,
  buildStudioPackageArchiveBytes,
  type StudioPackageArchiveEntry,
  type StudioPackageArchiveSource,
} from "./studio-package-archive";
import {
  readStudioZipArchive,
  type StudioZipInflateRawAdapter,
  type StudioZipReaderLimits,
} from "./studio-zip-reader";

/** OpenRaster 0.0.x interchange without DOM or image decoding dependencies. */

export const STUDIO_OPENRASTER_MIME = "image/openraster" as const;
export const STUDIO_OPENRASTER_EXTENSION = ".ora" as const;

export const STUDIO_OPENRASTER_LIMITS = Object.freeze({
  maxArchiveBytes: 520_000_000,
  maxLayers: 500,
  maxLayerBytes: 128_000_000,
  maxMergedImageBytes: 192_000_000,
  maxThumbnailBytes: 16_000_000,
  maxTotalImageBytes: 500_000_000,
  maxDecodedPixelsPerImage: 16_777_216,
  maxTotalDecodedRgbaBytes: 128 * 1024 * 1024,
  maxStackXmlBytes: 2_000_000,
  maxDimension: 32_768,
  maxPixels: 268_435_456,
  maxLayerNameCharacters: 512,
  maxOffsetMagnitude: 1_000_000,
  maxXmlDepth: 128,
});

export interface StudioOpenRasterLimits {
  maxArchiveBytes: number;
  maxLayers: number;
  maxLayerBytes: number;
  maxMergedImageBytes: number;
  maxThumbnailBytes: number;
  maxTotalImageBytes: number;
  maxDecodedPixelsPerImage: number;
  maxTotalDecodedRgbaBytes: number;
  maxStackXmlBytes: number;
  maxDimension: number;
  maxPixels: number;
  maxLayerNameCharacters: number;
  maxOffsetMagnitude: number;
  maxXmlDepth: number;
}

export const STUDIO_OPENRASTER_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
] as const;

export type StudioOpenRasterBlendMode = (typeof STUDIO_OPENRASTER_BLEND_MODES)[number];

export interface StudioOpenRasterLayerInput {
  name: string;
  png: StudioPackageArchiveSource;
  x?: number;
  y?: number;
  opacity?: number;
  visible?: boolean;
  /** Unknown values are exported as normal with an explicit warning. */
  blendMode?: StudioOpenRasterBlendMode | string;
}

export interface StudioOpenRasterExportInput {
  width: number;
  height: number;
  /** Back-to-front Studio paint order. ORA stack.xml is emitted front-to-back. */
  layers: readonly StudioOpenRasterLayerInput[];
  mergedImage: StudioPackageArchiveSource;
  thumbnail: StudioPackageArchiveSource;
  name?: string;
}

export interface StudioOpenRasterExportOptions {
  limits?: Partial<StudioOpenRasterLimits>;
  signal?: AbortSignal;
}

export interface StudioOpenRasterImportOptions extends StudioOpenRasterExportOptions {
  inflateRaw?: StudioZipInflateRawAdapter;
}

export type StudioOpenRasterWarningCode =
  | "GROUPS_FLATTENED"
  | "MASKS_IGNORED"
  | "UNSUPPORTED_BLEND_MODE"
  | "UNSUPPORTED_XML_ELEMENT";

export interface StudioOpenRasterWarning {
  code: StudioOpenRasterWarningCode;
  message: string;
  layerIndex?: number;
  path?: string;
}

export interface StudioOpenRasterBuildBytesResult {
  bytes: Uint8Array;
  warnings: readonly StudioOpenRasterWarning[];
}

export interface StudioOpenRasterBuildBlobResult {
  blob: Blob;
  warnings: readonly StudioOpenRasterWarning[];
}

export interface StudioOpenRasterImportedLayer {
  /** Back-to-front Studio paint order; zero is the backmost layer. */
  z: number;
  name: string;
  png: Blob;
  path: string;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  blendMode: StudioOpenRasterBlendMode;
  sourceCompositeOp: string;
}

export interface StudioOpenRasterImportResult {
  width: number;
  height: number;
  name?: string;
  layers: readonly StudioOpenRasterImportedLayer[];
  mergedImage: Blob;
  thumbnail: Blob;
  warnings: readonly StudioOpenRasterWarning[];
}

export type StudioOpenRasterErrorCode =
  | "ABORTED"
  | "ARCHIVE_INVALID"
  | "DIMENSION_INVALID"
  | "IMAGE_INVALID"
  | "LAYER_COUNT_LIMIT"
  | "LAYER_INVALID"
  | "LIMIT_INVALID"
  | "MIMETYPE_INVALID"
  | "REQUIRED_ENTRY_MISSING"
  | "SIZE_LIMIT"
  | "STACK_XML_INVALID";

export class StudioOpenRasterError extends Error {
  readonly code: StudioOpenRasterErrorCode;
  readonly path?: string;

  constructor(code: StudioOpenRasterErrorCode, message: string, path?: string) {
    super(message);
    this.name = "StudioOpenRasterError";
    this.code = code;
    if (path !== undefined) this.path = path;
  }
}

interface PreparedOpenRaster {
  entries: StudioPackageArchiveEntry[];
  warnings: StudioOpenRasterWarning[];
}

interface ParsedXmlTag {
  name: string;
  attributes: ReadonlyMap<string, string>;
  closing: boolean;
  selfClosing: boolean;
}

interface ParsedStackLayer {
  name: string;
  path: string;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  blendMode: StudioOpenRasterBlendMode;
  sourceCompositeOp: string;
}

interface ParsedStackXml {
  width: number;
  height: number;
  name?: string;
  frontToBackLayers: ParsedStackLayer[];
  warnings: StudioOpenRasterWarning[];
}

interface ValidatedPngSource {
  bytes: Uint8Array;
  decodedRgbaBytes: number;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/u;

const BLEND_TO_COMPOSITE = new Map<StudioOpenRasterBlendMode, string>([
  ["normal", "svg:src-over"],
  ["multiply", "svg:multiply"],
  ["screen", "svg:screen"],
  ["overlay", "svg:overlay"],
  ["darken", "svg:darken"],
  ["lighten", "svg:lighten"],
  ["color-dodge", "svg:color-dodge"],
  ["color-burn", "svg:color-burn"],
  ["hard-light", "svg:hard-light"],
  ["soft-light", "svg:soft-light"],
  ["difference", "svg:difference"],
  ["exclusion", "svg:exclusion"],
]);

const COMPOSITE_TO_BLEND = new Map(
  [...BLEND_TO_COMPOSITE].map(([blend, composite]) => [composite, blend] as const)
);

function oraError(
  code: StudioOpenRasterErrorCode,
  message: string,
  path?: string
): StudioOpenRasterError {
  return new StudioOpenRasterError(code, message, path);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw oraError("ABORTED", "OpenRaster 작업이 취소되었습니다.");
}

function resolveIntegerLimit(
  value: number | undefined,
  maximum: number,
  key: keyof StudioOpenRasterLimits
): number {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw oraError(
      "LIMIT_INVALID",
      `${key} 한도는 0 이상 ${maximum.toLocaleString("en-US")} 이하의 정수여야 합니다.`
    );
  }
  return value;
}

function resolveLimits(value?: Partial<StudioOpenRasterLimits>): StudioOpenRasterLimits {
  return {
    maxArchiveBytes: resolveIntegerLimit(
      value?.maxArchiveBytes,
      STUDIO_OPENRASTER_LIMITS.maxArchiveBytes,
      "maxArchiveBytes"
    ),
    maxLayers: resolveIntegerLimit(
      value?.maxLayers,
      STUDIO_OPENRASTER_LIMITS.maxLayers,
      "maxLayers"
    ),
    maxLayerBytes: resolveIntegerLimit(
      value?.maxLayerBytes,
      STUDIO_OPENRASTER_LIMITS.maxLayerBytes,
      "maxLayerBytes"
    ),
    maxMergedImageBytes: resolveIntegerLimit(
      value?.maxMergedImageBytes,
      STUDIO_OPENRASTER_LIMITS.maxMergedImageBytes,
      "maxMergedImageBytes"
    ),
    maxThumbnailBytes: resolveIntegerLimit(
      value?.maxThumbnailBytes,
      STUDIO_OPENRASTER_LIMITS.maxThumbnailBytes,
      "maxThumbnailBytes"
    ),
    maxTotalImageBytes: resolveIntegerLimit(
      value?.maxTotalImageBytes,
      STUDIO_OPENRASTER_LIMITS.maxTotalImageBytes,
      "maxTotalImageBytes"
    ),
    maxDecodedPixelsPerImage: resolveIntegerLimit(
      value?.maxDecodedPixelsPerImage,
      STUDIO_OPENRASTER_LIMITS.maxDecodedPixelsPerImage,
      "maxDecodedPixelsPerImage"
    ),
    maxTotalDecodedRgbaBytes: resolveIntegerLimit(
      value?.maxTotalDecodedRgbaBytes,
      STUDIO_OPENRASTER_LIMITS.maxTotalDecodedRgbaBytes,
      "maxTotalDecodedRgbaBytes"
    ),
    maxStackXmlBytes: resolveIntegerLimit(
      value?.maxStackXmlBytes,
      STUDIO_OPENRASTER_LIMITS.maxStackXmlBytes,
      "maxStackXmlBytes"
    ),
    maxDimension: resolveIntegerLimit(
      value?.maxDimension,
      STUDIO_OPENRASTER_LIMITS.maxDimension,
      "maxDimension"
    ),
    maxPixels: resolveIntegerLimit(
      value?.maxPixels,
      STUDIO_OPENRASTER_LIMITS.maxPixels,
      "maxPixels"
    ),
    maxLayerNameCharacters: resolveIntegerLimit(
      value?.maxLayerNameCharacters,
      STUDIO_OPENRASTER_LIMITS.maxLayerNameCharacters,
      "maxLayerNameCharacters"
    ),
    maxOffsetMagnitude: resolveIntegerLimit(
      value?.maxOffsetMagnitude,
      STUDIO_OPENRASTER_LIMITS.maxOffsetMagnitude,
      "maxOffsetMagnitude"
    ),
    maxXmlDepth: resolveIntegerLimit(
      value?.maxXmlDepth,
      STUDIO_OPENRASTER_LIMITS.maxXmlDepth,
      "maxXmlDepth"
    ),
  };
}

function hasUnsafeXmlControl(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if ((code >= 0 && code <= 8) || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

function snapshotSource(source: unknown, path: string): StudioPackageArchiveSource {
  if (source instanceof Uint8Array) return source.slice();
  if (source instanceof ArrayBuffer) return source.slice(0);
  if (typeof Blob !== "undefined" && source instanceof Blob) return source;
  throw oraError("IMAGE_INVALID", "지원하지 않는 OpenRaster 이미지 데이터입니다.", path);
}

function sourceSize(source: StudioPackageArchiveSource): number {
  if (source instanceof Uint8Array || source instanceof ArrayBuffer) return source.byteLength;
  return source.size;
}

async function sourceBytes(
  source: StudioPackageArchiveSource,
  path: string,
  signal?: AbortSignal
): Promise<Uint8Array> {
  throwIfAborted(signal);
  let bytes: Uint8Array;
  if (source instanceof Uint8Array) bytes = source;
  else if (source instanceof ArrayBuffer) bytes = new Uint8Array(source);
  else {
    try {
      bytes = new Uint8Array(await source.arrayBuffer());
    } catch (cause) {
      const detail = cause instanceof Error ? `: ${cause.message}` : "";
      throw oraError("IMAGE_INVALID", `OpenRaster 이미지를 읽지 못했습니다${detail}`, path);
    }
  }
  throwIfAborted(signal);
  return bytes;
}

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_SIGNATURE.byteLength) return false;
  for (let index = 0; index < PNG_SIGNATURE.byteLength; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return false;
  }
  return true;
}

function inspectPngIhdr(
  bytes: Uint8Array,
  path: string,
  limits: StudioOpenRasterLimits
): { decodedRgbaBytes: number } {
  if (!hasPngSignature(bytes)) {
    throw oraError("IMAGE_INVALID", "OpenRaster 항목이 유효한 PNG signature를 갖지 않습니다.", path);
  }
  if (bytes.byteLength < 33) {
    throw oraError("IMAGE_INVALID", "OpenRaster PNG의 IHDR가 완전하지 않습니다.", path);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(8, false) !== 13 ||
    bytes[12] !== 73 ||
    bytes[13] !== 72 ||
    bytes[14] !== 68 ||
    bytes[15] !== 82
  ) {
    throw oraError("IMAGE_INVALID", "OpenRaster PNG의 첫 chunk가 13바이트 IHDR가 아닙니다.", path);
  }
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width === 0 || height === 0) {
    throw oraError("IMAGE_INVALID", "OpenRaster PNG IHDR의 너비와 높이는 1 이상이어야 합니다.", path);
  }
  if (width > limits.maxDimension || height > limits.maxDimension) {
    throw oraError(
      "SIZE_LIMIT",
      `OpenRaster PNG '${path}'의 IHDR 크기 ${width.toLocaleString("en-US")}×${height.toLocaleString("en-US")}가 축 한도 ${limits.maxDimension.toLocaleString("en-US")}px를 넘었습니다.`,
      path
    );
  }
  if (width > Math.floor(limits.maxDecodedPixelsPerImage / height)) {
    throw oraError(
      "SIZE_LIMIT",
      `OpenRaster PNG '${path}'의 IHDR 픽셀 수가 이미지당 디코딩 한도 ${limits.maxDecodedPixelsPerImage.toLocaleString("en-US")}px를 넘었습니다.`,
      path
    );
  }
  return { decodedRgbaBytes: width * height * 4 };
}

function addImageBudget(
  current: number,
  added: number,
  maximum: number,
  label: string,
  path: string
): number {
  if (added > maximum - current) {
    throw oraError(
      "SIZE_LIMIT",
      `OpenRaster '${path}'에서 ${label} 누적 한도 ${maximum.toLocaleString("en-US")}바이트를 넘었습니다.`,
      path
    );
  }
  return current + added;
}

function validateDimension(width: number, height: number, limits: StudioOpenRasterLimits): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > limits.maxDimension ||
    height > limits.maxDimension ||
    width * height > limits.maxPixels
  ) {
    throw oraError("DIMENSION_INVALID", "OpenRaster 캔버스 크기가 안전 범위를 벗어났습니다.");
  }
}

function validateOffset(value: number | undefined, limits: StudioOpenRasterLimits): number {
  const offset = value ?? 0;
  if (!Number.isSafeInteger(offset) || Math.abs(offset) > limits.maxOffsetMagnitude) {
    throw oraError("LAYER_INVALID", "OpenRaster 레이어 오프셋이 안전 범위를 벗어났습니다.");
  }
  return offset;
}

function validateOpacity(value: number | undefined): number {
  const opacity = value ?? 1;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw oraError("LAYER_INVALID", "OpenRaster 레이어 불투명도는 0부터 1 사이여야 합니다.");
  }
  return opacity;
}

function validateXmlText(value: unknown, label: string, maxCharacters: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxCharacters ||
    hasUnsafeXmlControl(value)
  ) {
    throw oraError("LAYER_INVALID", `${label}이 비어 있거나 안전 범위를 벗어났습니다.`);
  }
  return value;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function snapshotInput(input: StudioOpenRasterExportInput): StudioOpenRasterExportInput {
  return {
    width: input.width,
    height: input.height,
    name: input.name,
    mergedImage: snapshotSource(input.mergedImage, "mergedimage.png"),
    thumbnail: snapshotSource(input.thumbnail, "Thumbnails/thumbnail.png"),
    layers: input.layers.map((layer, index) => ({
      name: layer.name,
      png: snapshotSource(layer.png, `data/layer${index.toString().padStart(4, "0")}.png`),
      x: layer.x,
      y: layer.y,
      opacity: layer.opacity,
      visible: layer.visible,
      blendMode: layer.blendMode,
    })),
  };
}

async function validatePngSource(
  source: StudioPackageArchiveSource,
  path: string,
  maxBytes: number,
  limits: StudioOpenRasterLimits,
  signal?: AbortSignal
): Promise<ValidatedPngSource> {
  const size = sourceSize(source);
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
    throw oraError("SIZE_LIMIT", "OpenRaster PNG 크기가 안전 한도를 벗어났습니다.", path);
  }
  const bytes = await sourceBytes(source, path, signal);
  if (bytes.byteLength !== size) {
    throw oraError("IMAGE_INVALID", "OpenRaster PNG를 읽는 동안 바이트 크기가 변경되었습니다.", path);
  }
  const dimensions = inspectPngIhdr(bytes, path, limits);
  return { bytes: bytes.slice(), decodedRgbaBytes: dimensions.decodedRgbaBytes };
}

function normalizeBlendForExport(
  value: string | undefined,
  warnings: StudioOpenRasterWarning[],
  layerIndex: number
): StudioOpenRasterBlendMode {
  const candidate = value ?? "normal";
  if (BLEND_TO_COMPOSITE.has(candidate as StudioOpenRasterBlendMode)) {
    return candidate as StudioOpenRasterBlendMode;
  }
  warnings.push({
    code: "UNSUPPORTED_BLEND_MODE",
    layerIndex,
    message: `지원하지 않는 혼합 모드 '${candidate}'를 normal로 내보냈습니다.`,
  });
  return "normal";
}

async function prepareOpenRaster(
  rawInput: StudioOpenRasterExportInput,
  options: StudioOpenRasterExportOptions
): Promise<PreparedOpenRaster> {
  const limits = resolveLimits(options.limits);
  const input = snapshotInput(rawInput);
  throwIfAborted(options.signal);
  validateDimension(input.width, input.height, limits);
  if (input.layers.length === 0 || input.layers.length > limits.maxLayers) {
    throw oraError("LAYER_COUNT_LIMIT", "OpenRaster 레이어 수가 안전 범위를 벗어났습니다.");
  }

  const warnings: StudioOpenRasterWarning[] = [];
  const preparedLayers: Array<{
    name: string;
    path: string;
    png: Uint8Array;
    x: number;
    y: number;
    opacity: number;
    visible: boolean;
    blendMode: StudioOpenRasterBlendMode;
  }> = [];
  let totalImageBytes = 0;
  let totalDecodedRgbaBytes = 0;

  for (let index = 0; index < input.layers.length; index += 1) {
    throwIfAborted(options.signal);
    const layer = input.layers[index];
    if (!layer) continue;
    const path = `data/layer${index.toString().padStart(4, "0")}.png`;
    const validated = await validatePngSource(
      layer.png,
      path,
      limits.maxLayerBytes,
      limits,
      options.signal
    );
    totalImageBytes = addImageBudget(
      totalImageBytes,
      validated.bytes.byteLength,
      limits.maxTotalImageBytes,
      "압축 해제 이미지 바이트",
      path
    );
    totalDecodedRgbaBytes = addImageBudget(
      totalDecodedRgbaBytes,
      validated.decodedRgbaBytes,
      limits.maxTotalDecodedRgbaBytes,
      "디코딩 RGBA 메모리",
      path
    );
    preparedLayers.push({
      name: validateXmlText(layer.name, "레이어 이름", limits.maxLayerNameCharacters),
      path,
      png: validated.bytes,
      x: validateOffset(layer.x, limits),
      y: validateOffset(layer.y, limits),
      opacity: validateOpacity(layer.opacity),
      visible: layer.visible ?? true,
      blendMode: normalizeBlendForExport(layer.blendMode, warnings, index),
    });
  }

  const mergedImage = await validatePngSource(
    input.mergedImage,
    "mergedimage.png",
    limits.maxMergedImageBytes,
    limits,
    options.signal
  );
  const thumbnail = await validatePngSource(
    input.thumbnail,
    "Thumbnails/thumbnail.png",
    limits.maxThumbnailBytes,
    limits,
    options.signal
  );
  for (const [path, image] of [
    ["mergedimage.png", mergedImage],
    ["Thumbnails/thumbnail.png", thumbnail],
  ] as const) {
    totalImageBytes = addImageBudget(
      totalImageBytes,
      image.bytes.byteLength,
      limits.maxTotalImageBytes,
      "압축 해제 이미지 바이트",
      path
    );
    totalDecodedRgbaBytes = addImageBudget(
      totalDecodedRgbaBytes,
      image.decodedRgbaBytes,
      limits.maxTotalDecodedRgbaBytes,
      "디코딩 RGBA 메모리",
      path
    );
  }

  const imageName = input.name === undefined
    ? ""
    : ` name="${escapeXml(validateXmlText(input.name, "문서 이름", limits.maxLayerNameCharacters))}"`;
  const layerXml = [...preparedLayers]
    .reverse()
    .map(
      (layer) =>
        `    <layer name="${escapeXml(layer.name)}" src="${layer.path}" x="${layer.x}" y="${layer.y}" opacity="${layer.opacity}" visibility="${layer.visible ? "visible" : "hidden"}" composite-op="${BLEND_TO_COMPOSITE.get(layer.blendMode)}"/>`
    )
    .join("\n");
  const stackXml = encoder.encode(
    `<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.3" w="${input.width}" h="${input.height}"${imageName}>\n  <stack>\n${layerXml}\n  </stack>\n</image>\n`
  );
  if (stackXml.byteLength > limits.maxStackXmlBytes) {
    throw oraError("SIZE_LIMIT", "OpenRaster stack.xml이 안전 한도를 넘었습니다.");
  }

  return {
    warnings,
    entries: [
      { path: "mimetype", data: encoder.encode(STUDIO_OPENRASTER_MIME) },
      { path: "stack.xml", data: stackXml },
      { path: "mergedimage.png", data: mergedImage.bytes },
      { path: "Thumbnails/thumbnail.png", data: thumbnail.bytes },
      ...preparedLayers.map((layer) => ({ path: layer.path, data: layer.png })),
    ],
  };
}

export async function buildStudioOpenRasterBytes(
  input: StudioOpenRasterExportInput,
  options: StudioOpenRasterExportOptions = {}
): Promise<StudioOpenRasterBuildBytesResult> {
  const prepared = await prepareOpenRaster(input, options);
  const limits = resolveLimits(options.limits);
  const bytes = await buildStudioPackageArchiveBytes(prepared.entries, {
    limits: {
      maxFiles: limits.maxLayers + 4,
      maxEntryBytes: Math.max(
        limits.maxLayerBytes,
        limits.maxMergedImageBytes,
        limits.maxThumbnailBytes,
        limits.maxStackXmlBytes
      ),
      maxTotalBytes: Math.min(512_000_000, limits.maxTotalImageBytes + limits.maxStackXmlBytes + 64),
      maxArchiveBytes: limits.maxArchiveBytes,
    },
  });
  return { bytes, warnings: Object.freeze([...prepared.warnings]) };
}

export async function buildStudioOpenRasterBlob(
  input: StudioOpenRasterExportInput,
  options: StudioOpenRasterExportOptions = {}
): Promise<StudioOpenRasterBuildBlobResult> {
  const prepared = await prepareOpenRaster(input, options);
  const limits = resolveLimits(options.limits);
  const blob = await buildStudioPackageArchiveBlob(prepared.entries, {
    mimeType: STUDIO_OPENRASTER_MIME,
    limits: {
      maxFiles: limits.maxLayers + 4,
      maxEntryBytes: Math.max(
        limits.maxLayerBytes,
        limits.maxMergedImageBytes,
        limits.maxThumbnailBytes,
        limits.maxStackXmlBytes
      ),
      maxTotalBytes: Math.min(512_000_000, limits.maxTotalImageBytes + limits.maxStackXmlBytes + 64),
      maxArchiveBytes: limits.maxArchiveBytes,
    },
  });
  return { blob, warnings: Object.freeze([...prepared.warnings]) };
}

function decodeXmlEntities(value: string): string {
  const entityPattern = /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/gu;
  const unescaped = value.replaceAll(entityPattern, "");
  if (unescaped.includes("&") || unescaped.includes("<")) {
    throw oraError("STACK_XML_INVALID", "stack.xml에 알 수 없는 문자 entity가 있습니다.");
  }
  return value.replaceAll(entityPattern, (entity) => {
    if (entity === "&amp;") return "&";
    if (entity === "&lt;") return "<";
    if (entity === "&gt;") return ">";
    if (entity === "&quot;") return '"';
    if (entity === "&apos;") return "'";
    const hexadecimal = entity.startsWith("&#x");
    const numeric = Number.parseInt(entity.slice(hexadecimal ? 3 : 2, -1), hexadecimal ? 16 : 10);
    if (!isValidXmlCodePoint(numeric)) {
      throw oraError("STACK_XML_INVALID", "stack.xml에 유효하지 않은 문자 entity가 있습니다.");
    }
    return String.fromCodePoint(numeric);
  });
}

function isValidXmlCodePoint(value: number): boolean {
  return Number.isSafeInteger(value) && (
    value === 9 ||
    value === 10 ||
    value === 13 ||
    (value >= 32 && value <= 0xd7ff) ||
    (value >= 0xe000 && value <= 0xfffd) ||
    (value >= 0x10000 && value <= 0x10ffff)
  );
}

function parseXmlTag(source: string): ParsedXmlTag {
  let cursor = 0;
  let closing = false;
  if (source[cursor] === "/") {
    closing = true;
    cursor += 1;
  }
  while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
  const nameMatch = XML_NAME.exec(source.slice(cursor));
  if (!nameMatch) throw oraError("STACK_XML_INVALID", "stack.xml tag 이름이 올바르지 않습니다.");
  const name = nameMatch[0];
  cursor += name.length;
  const attributes = new Map<string, string>();

  if (closing) {
    if (source.slice(cursor).trim().length !== 0) {
      throw oraError("STACK_XML_INVALID", "stack.xml 닫는 tag가 올바르지 않습니다.");
    }
    return { name, attributes, closing, selfClosing: false };
  }

  let selfClosing = false;
  for (;;) {
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    if (cursor >= source.length) break;
    if (source[cursor] === "/") {
      selfClosing = true;
      cursor += 1;
      while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
      if (cursor !== source.length) {
        throw oraError("STACK_XML_INVALID", "stack.xml self-closing tag가 올바르지 않습니다.");
      }
      break;
    }
    const attributeMatch = XML_NAME.exec(source.slice(cursor));
    if (!attributeMatch) {
      throw oraError("STACK_XML_INVALID", "stack.xml attribute 이름이 올바르지 않습니다.");
    }
    const attributeName = attributeMatch[0];
    cursor += attributeName.length;
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    if (source[cursor] !== "=") {
      throw oraError("STACK_XML_INVALID", "stack.xml attribute에 =가 없습니다.");
    }
    cursor += 1;
    while (/\s/u.test(source[cursor] ?? "")) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") {
      throw oraError("STACK_XML_INVALID", "stack.xml attribute 값은 인용되어야 합니다.");
    }
    cursor += 1;
    const end = source.indexOf(quote, cursor);
    if (end < 0) throw oraError("STACK_XML_INVALID", "stack.xml attribute 값이 닫히지 않았습니다.");
    if (attributes.has(attributeName)) {
      throw oraError("STACK_XML_INVALID", "stack.xml tag에 중복 attribute가 있습니다.");
    }
    attributes.set(attributeName, decodeXmlEntities(source.slice(cursor, end)));
    cursor = end + 1;
  }
  return { name, attributes, closing, selfClosing };
}

function findTagEnd(xml: string, start: number): number {
  let quote: string | undefined;
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote !== undefined) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function parseIntegerAttribute(
  value: string | undefined,
  label: string,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || !/^-?\d+$/u.test(value)) {
    throw oraError("STACK_XML_INVALID", `stack.xml ${label} 값이 정수가 아닙니다.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw oraError("STACK_XML_INVALID", `stack.xml ${label} 값이 안전 범위를 벗어났습니다.`);
  }
  return parsed;
}

function parseLayerTag(
  attributes: ReadonlyMap<string, string>,
  limits: StudioOpenRasterLimits,
  warnings: StudioOpenRasterWarning[],
  layerIndex: number
): ParsedStackLayer {
  const path = attributes.get("src");
  if (!path || !path.toLowerCase().endsWith(".png")) {
    throw oraError("STACK_XML_INVALID", "OpenRaster 레이어 src가 PNG 경로가 아닙니다.");
  }
  const name = attributes.get("name") ?? path;
  if (name.length > limits.maxLayerNameCharacters || hasUnsafeXmlControl(name)) {
    throw oraError("STACK_XML_INVALID", "OpenRaster 레이어 이름이 안전 범위를 벗어났습니다.", path);
  }
  const x = attributes.has("x")
    ? parseIntegerAttribute(attributes.get("x"), "x", -limits.maxOffsetMagnitude, limits.maxOffsetMagnitude)
    : 0;
  const y = attributes.has("y")
    ? parseIntegerAttribute(attributes.get("y"), "y", -limits.maxOffsetMagnitude, limits.maxOffsetMagnitude)
    : 0;
  const opacitySource = attributes.get("opacity") ?? "1";
  const opacity = Number(opacitySource);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw oraError("STACK_XML_INVALID", "OpenRaster 레이어 opacity가 올바르지 않습니다.", path);
  }
  const visibility = attributes.get("visibility") ?? "visible";
  if (visibility !== "visible" && visibility !== "hidden") {
    throw oraError("STACK_XML_INVALID", "OpenRaster 레이어 visibility가 올바르지 않습니다.", path);
  }
  const sourceCompositeOp = attributes.get("composite-op") ?? "svg:src-over";
  let blendMode = COMPOSITE_TO_BLEND.get(sourceCompositeOp);
  if (!blendMode) {
    blendMode = "normal";
    warnings.push({
      code: "UNSUPPORTED_BLEND_MODE",
      layerIndex,
      path,
      message: `지원하지 않는 ORA 혼합 모드 '${sourceCompositeOp}'를 normal로 가져왔습니다.`,
    });
  }
  return {
    name,
    path,
    x,
    y,
    opacity,
    visible: visibility === "visible",
    blendMode,
    sourceCompositeOp,
  };
}

function parseStackXml(bytes: Uint8Array, limits: StudioOpenRasterLimits): ParsedStackXml {
  if (bytes.byteLength === 0 || bytes.byteLength > limits.maxStackXmlBytes) {
    throw oraError("SIZE_LIMIT", "OpenRaster stack.xml 크기가 안전 범위를 벗어났습니다.");
  }
  let xml: string;
  try {
    xml = decoder.decode(bytes);
  } catch {
    throw oraError("STACK_XML_INVALID", "OpenRaster stack.xml이 올바른 UTF-8이 아닙니다.");
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)/iu.test(xml)) {
    throw oraError("STACK_XML_INVALID", "OpenRaster stack.xml의 DTD/entity 선언은 허용되지 않습니다.");
  }

  const elementStack: string[] = [];
  const warnings: StudioOpenRasterWarning[] = [];
  const warningCodes = new Set<StudioOpenRasterWarningCode>();
  const frontToBackLayers: ParsedStackLayer[] = [];
  let width: number | undefined;
  let height: number | undefined;
  let name: string | undefined;
  let rootStackSeen = false;
  let imageSeen = false;
  let cursor = 0;

  function warnOnce(code: StudioOpenRasterWarningCode, message: string): void {
    if (warningCodes.has(code)) return;
    warningCodes.add(code);
    warnings.push({ code, message });
  }

  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor);
    if (open < 0) {
      if (xml.slice(cursor).trim().length !== 0) {
        throw oraError("STACK_XML_INVALID", "stack.xml root 밖에 텍스트가 있습니다.");
      }
      break;
    }
    if (xml.slice(cursor, open).trim().length !== 0) {
      throw oraError("STACK_XML_INVALID", "stack.xml element 사이에 예상하지 못한 텍스트가 있습니다.");
    }
    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open + 4);
      if (end < 0) throw oraError("STACK_XML_INVALID", "stack.xml 주석이 닫히지 않았습니다.");
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open + 2);
      if (end < 0) throw oraError("STACK_XML_INVALID", "stack.xml 처리 지시문이 닫히지 않았습니다.");
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith("<!", open)) {
      throw oraError("STACK_XML_INVALID", "stack.xml 선언 element는 허용되지 않습니다.");
    }
    const end = findTagEnd(xml, open + 1);
    if (end < 0) throw oraError("STACK_XML_INVALID", "stack.xml tag가 닫히지 않았습니다.");
    const tag = parseXmlTag(xml.slice(open + 1, end));
    cursor = end + 1;

    if (tag.closing) {
      if (elementStack.pop() !== tag.name) {
        throw oraError("STACK_XML_INVALID", "stack.xml element 중첩이 올바르지 않습니다.");
      }
      continue;
    }
    if (elementStack.length >= limits.maxXmlDepth) {
      throw oraError("STACK_XML_INVALID", "stack.xml element 깊이가 안전 한도를 넘었습니다.");
    }
    if (elementStack.length === 0 && tag.name !== "image") {
      throw oraError("STACK_XML_INVALID", "stack.xml에는 image root 외의 최상위 element가 있을 수 없습니다.");
    }

    if (tag.name === "image") {
      if (imageSeen || elementStack.length !== 0) {
        throw oraError("STACK_XML_INVALID", "stack.xml에는 image root가 하나만 있어야 합니다.");
      }
      imageSeen = true;
      width = parseIntegerAttribute(tag.attributes.get("w"), "w", 1, limits.maxDimension);
      height = parseIntegerAttribute(tag.attributes.get("h"), "h", 1, limits.maxDimension);
      validateDimension(width, height, limits);
      name = tag.attributes.get("name");
      if (name !== undefined && (name.length > limits.maxLayerNameCharacters || hasUnsafeXmlControl(name))) {
        throw oraError("STACK_XML_INVALID", "OpenRaster 문서 이름이 안전 범위를 벗어났습니다.");
      }
    } else if (tag.name === "stack") {
      if (!rootStackSeen && elementStack.length === 1 && elementStack[0] === "image") {
        rootStackSeen = true;
      } else {
        warnOnce("GROUPS_FLATTENED", "OpenRaster 레이어 그룹을 평면 레이어 순서로 가져왔습니다.");
      }
    } else if (tag.name === "layer") {
      if (!imageSeen || !rootStackSeen) {
        throw oraError("STACK_XML_INVALID", "OpenRaster layer가 stack 밖에 있습니다.");
      }
      if (frontToBackLayers.length >= limits.maxLayers) {
        throw oraError("LAYER_COUNT_LIMIT", "OpenRaster 레이어 수가 안전 한도를 넘었습니다.");
      }
      frontToBackLayers.push(
        parseLayerTag(tag.attributes, limits, warnings, frontToBackLayers.length)
      );
    } else if (tag.name === "mask") {
      warnOnce("MASKS_IGNORED", "OpenRaster 레이어 마스크는 가져오지 않았습니다.");
    } else {
      warnOnce(
        "UNSUPPORTED_XML_ELEMENT",
        `OpenRaster의 '${tag.name}' element는 가져오지 않았습니다.`
      );
    }

    if (!tag.selfClosing) elementStack.push(tag.name);
  }
  if (elementStack.length !== 0 || !imageSeen || !rootStackSeen || width === undefined || height === undefined) {
    throw oraError("STACK_XML_INVALID", "OpenRaster stack.xml 구조가 완전하지 않습니다.");
  }
  if (frontToBackLayers.length === 0) {
    throw oraError("LAYER_COUNT_LIMIT", "OpenRaster에 가져올 레이어가 없습니다.");
  }
  return { width, height, name, frontToBackLayers, warnings };
}

function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

export async function importStudioOpenRaster(
  source: Blob | Uint8Array | ArrayBuffer,
  options: StudioOpenRasterImportOptions = {}
): Promise<StudioOpenRasterImportResult> {
  const limits = resolveLimits(options.limits);
  throwIfAborted(options.signal);
  const zipLimits: Partial<StudioZipReaderLimits> = {
    maxArchiveBytes: limits.maxArchiveBytes,
    maxEntries: limits.maxLayers + 16,
    maxEntryCompressedBytes: Math.max(
      limits.maxLayerBytes,
      limits.maxMergedImageBytes,
      limits.maxThumbnailBytes,
      limits.maxStackXmlBytes
    ),
    maxEntryUncompressedBytes: Math.max(
      limits.maxLayerBytes,
      limits.maxMergedImageBytes,
      limits.maxThumbnailBytes,
      limits.maxStackXmlBytes
    ),
    maxTotalUncompressedBytes: Math.min(
      512_000_000,
      limits.maxTotalImageBytes + limits.maxStackXmlBytes + 64
    ),
  };
  let archive;
  try {
    archive = await readStudioZipArchive(source, {
      limits: zipLimits,
      inflateRaw: options.inflateRaw,
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof StudioOpenRasterError) throw cause;
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw oraError("ARCHIVE_INVALID", `OpenRaster ZIP이 올바르지 않습니다${detail}`);
  }

  const firstEntry = archive.entries[0];
  if (!firstEntry || firstEntry.path !== "mimetype" || firstEntry.compressionMethod !== 0) {
    throw oraError("MIMETYPE_INVALID", "OpenRaster mimetype은 첫 번째 stored 항목이어야 합니다.");
  }
  const mimetype = await archive.readEntry(firstEntry, { signal: options.signal });
  let mimetypeValue: string;
  try {
    mimetypeValue = decoder.decode(mimetype);
  } catch {
    throw oraError("MIMETYPE_INVALID", "OpenRaster mimetype이 올바른 UTF-8이 아닙니다.");
  }
  if (mimetypeValue !== STUDIO_OPENRASTER_MIME) {
    throw oraError("MIMETYPE_INVALID", "OpenRaster mimetype 값이 올바르지 않습니다.");
  }
  const stackEntry = archive.getEntry("stack.xml");
  const mergedEntry = archive.getEntry("mergedimage.png");
  const thumbnailEntry = archive.getEntry("Thumbnails/thumbnail.png");
  if (!stackEntry || stackEntry.directory) {
    throw oraError("REQUIRED_ENTRY_MISSING", "OpenRaster stack.xml이 없습니다.", "stack.xml");
  }
  if (!mergedEntry || mergedEntry.directory) {
    throw oraError("REQUIRED_ENTRY_MISSING", "OpenRaster mergedimage.png가 없습니다.", "mergedimage.png");
  }
  if (!thumbnailEntry || thumbnailEntry.directory) {
    throw oraError(
      "REQUIRED_ENTRY_MISSING",
      "OpenRaster thumbnail.png가 없습니다.",
      "Thumbnails/thumbnail.png"
    );
  }

  const stackXml = await archive.readEntry(stackEntry, { signal: options.signal });
  const parsed = parseStackXml(stackXml, limits);
  const mergedBytes = await archive.readEntry(mergedEntry, { signal: options.signal });
  const thumbnailBytes = await archive.readEntry(thumbnailEntry, { signal: options.signal });
  if (mergedBytes.byteLength > limits.maxMergedImageBytes) {
    throw oraError(
      "SIZE_LIMIT",
      "OpenRaster mergedimage.png가 안전 바이트 한도를 넘었습니다.",
      "mergedimage.png"
    );
  }
  if (thumbnailBytes.byteLength > limits.maxThumbnailBytes) {
    throw oraError(
      "SIZE_LIMIT",
      "OpenRaster thumbnail.png가 안전 바이트 한도를 넘었습니다.",
      "Thumbnails/thumbnail.png"
    );
  }
  const mergedDimensions = inspectPngIhdr(mergedBytes, "mergedimage.png", limits);
  const thumbnailDimensions = inspectPngIhdr(
    thumbnailBytes,
    "Thumbnails/thumbnail.png",
    limits
  );
  let totalImageBytes = 0;
  let totalDecodedRgbaBytes = 0;
  for (const [path, bytes, decodedRgbaBytes] of [
    ["mergedimage.png", mergedBytes, mergedDimensions.decodedRgbaBytes],
    ["Thumbnails/thumbnail.png", thumbnailBytes, thumbnailDimensions.decodedRgbaBytes],
  ] as const) {
    totalImageBytes = addImageBudget(
      totalImageBytes,
      bytes.byteLength,
      limits.maxTotalImageBytes,
      "압축 해제 이미지 바이트",
      path
    );
    totalDecodedRgbaBytes = addImageBudget(
      totalDecodedRgbaBytes,
      decodedRgbaBytes,
      limits.maxTotalDecodedRgbaBytes,
      "디코딩 RGBA 메모리",
      path
    );
  }
  const frontToBackLayers: Array<Omit<StudioOpenRasterImportedLayer, "z">> = [];
  for (const layer of parsed.frontToBackLayers) {
    throwIfAborted(options.signal);
    const entry = archive.getEntry(layer.path);
    if (!entry || entry.directory) {
      throw oraError("REQUIRED_ENTRY_MISSING", "OpenRaster 레이어 PNG가 없습니다.", layer.path);
    }
    if (entry.uncompressedBytes > limits.maxLayerBytes) {
      throw oraError("SIZE_LIMIT", "OpenRaster 레이어 PNG가 안전 한도를 넘었습니다.", layer.path);
    }
    const png = await archive.readEntry(entry, { signal: options.signal });
    const dimensions = inspectPngIhdr(png, layer.path, limits);
    totalImageBytes = addImageBudget(
      totalImageBytes,
      png.byteLength,
      limits.maxTotalImageBytes,
      "압축 해제 이미지 바이트",
      layer.path
    );
    totalDecodedRgbaBytes = addImageBudget(
      totalDecodedRgbaBytes,
      dimensions.decodedRgbaBytes,
      limits.maxTotalDecodedRgbaBytes,
      "디코딩 RGBA 메모리",
      layer.path
    );
    frontToBackLayers.push({ ...layer, png: bytesToBlob(png, "image/png") });
  }

  const layers = frontToBackLayers
    .reverse()
    .map((layer, z) => Object.freeze({ ...layer, z }));
  return Object.freeze({
    width: parsed.width,
    height: parsed.height,
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    layers: Object.freeze(layers),
    mergedImage: bytesToBlob(mergedBytes, "image/png"),
    thumbnail: bytesToBlob(thumbnailBytes, "image/png"),
    warnings: Object.freeze(parsed.warnings),
  });
}
