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

/** Bounded CBZ + ComicInfo.xml interchange for page-oriented webtoon handoff. */

export const STUDIO_CBZ_MIME = "application/vnd.comicbook+zip" as const;
export const STUDIO_CBZ_EXTENSION = ".cbz" as const;

export const STUDIO_CBZ_LIMITS = Object.freeze({
  maxArchiveBytes: 520_000_000,
  maxPages: 1_099,
  maxPageBytes: 192_000_000,
  maxTotalPageBytes: 510_000_000,
  maxComicInfoBytes: 1_000_000,
  maxMetadataCharacters: 100_000,
});

export interface StudioCbzLimits {
  maxArchiveBytes: number;
  maxPages: number;
  maxPageBytes: number;
  maxTotalPageBytes: number;
  maxComicInfoBytes: number;
  maxMetadataCharacters: number;
}

export type StudioCbzPageMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface StudioCbzPageInput {
  image: StudioPackageArchiveSource;
}

export interface StudioComicInfoMetadata {
  title?: string;
  series?: string;
  number?: string;
  count?: number;
  volume?: number;
  summary?: string;
  notes?: string;
  year?: number;
  month?: number;
  day?: number;
  writer?: string;
  penciller?: string;
  inker?: string;
  colorist?: string;
  letterer?: string;
  coverArtist?: string;
  editor?: string;
  publisher?: string;
  imprint?: string;
  genre?: readonly string[];
  tags?: readonly string[];
  web?: string;
  languageISO?: string;
  format?: string;
  ageRating?: string;
  blackAndWhite?: boolean;
  manga?: string;
}

export interface StudioCbzExportInput {
  /** Page reading order. Canonical zero-padded paths preserve it across readers. */
  pages: readonly StudioCbzPageInput[];
  metadata?: StudioComicInfoMetadata;
}

export interface StudioCbzExportOptions {
  limits?: Partial<StudioCbzLimits>;
  signal?: AbortSignal;
}

export interface StudioCbzImportOptions extends StudioCbzExportOptions {
  inflateRaw?: StudioZipInflateRawAdapter;
}

export type StudioCbzWarningCode =
  | "COMICINFO_MISSING"
  | "IGNORED_ENTRY"
  | "PAGE_COUNT_MISMATCH";

export interface StudioCbzWarning {
  code: StudioCbzWarningCode;
  message: string;
  path?: string;
}

export interface StudioCbzBuildBytesResult {
  bytes: Uint8Array;
  warnings: readonly StudioCbzWarning[];
}

export interface StudioCbzBuildBlobResult {
  blob: Blob;
  warnings: readonly StudioCbzWarning[];
}

export interface StudioCbzImportedPage {
  index: number;
  path: string;
  mimeType: StudioCbzPageMimeType;
  byteSize: number;
  image: Blob;
}

export interface StudioCbzImportResult {
  pages: readonly StudioCbzImportedPage[];
  metadata: Readonly<StudioComicInfoMetadata>;
  warnings: readonly StudioCbzWarning[];
}

export type StudioCbzErrorCode =
  | "ABORTED"
  | "ARCHIVE_INVALID"
  | "COMICINFO_INVALID"
  | "IMAGE_INVALID"
  | "LIMIT_INVALID"
  | "PAGE_COUNT_LIMIT"
  | "SIZE_LIMIT";

export class StudioCbzError extends Error {
  readonly code: StudioCbzErrorCode;
  readonly path?: string;

  constructor(code: StudioCbzErrorCode, message: string, path?: string) {
    super(message);
    this.name = "StudioCbzError";
    this.code = code;
    if (path !== undefined) this.path = path;
  }
}

interface DetectedPage {
  mimeType: StudioCbzPageMimeType;
  extension: "png" | "jpg" | "webp";
}

interface PreparedCbz {
  entries: StudioPackageArchiveEntry[];
  warnings: StudioCbzWarning[];
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function cbzError(code: StudioCbzErrorCode, message: string, path?: string): StudioCbzError {
  return new StudioCbzError(code, message, path);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw cbzError("ABORTED", "CBZ 작업이 취소되었습니다.");
}

function resolveIntegerLimit(
  value: number | undefined,
  maximum: number,
  key: keyof StudioCbzLimits
): number {
  if (value === undefined) return maximum;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw cbzError(
      "LIMIT_INVALID",
      `${key} 한도는 0 이상 ${maximum.toLocaleString("en-US")} 이하의 정수여야 합니다.`
    );
  }
  return value;
}

function resolveLimits(value?: Partial<StudioCbzLimits>): StudioCbzLimits {
  return {
    maxArchiveBytes: resolveIntegerLimit(
      value?.maxArchiveBytes,
      STUDIO_CBZ_LIMITS.maxArchiveBytes,
      "maxArchiveBytes"
    ),
    maxPages: resolveIntegerLimit(value?.maxPages, STUDIO_CBZ_LIMITS.maxPages, "maxPages"),
    maxPageBytes: resolveIntegerLimit(
      value?.maxPageBytes,
      STUDIO_CBZ_LIMITS.maxPageBytes,
      "maxPageBytes"
    ),
    maxTotalPageBytes: resolveIntegerLimit(
      value?.maxTotalPageBytes,
      STUDIO_CBZ_LIMITS.maxTotalPageBytes,
      "maxTotalPageBytes"
    ),
    maxComicInfoBytes: resolveIntegerLimit(
      value?.maxComicInfoBytes,
      STUDIO_CBZ_LIMITS.maxComicInfoBytes,
      "maxComicInfoBytes"
    ),
    maxMetadataCharacters: resolveIntegerLimit(
      value?.maxMetadataCharacters,
      STUDIO_CBZ_LIMITS.maxMetadataCharacters,
      "maxMetadataCharacters"
    ),
  };
}

function snapshotSource(source: unknown, path: string): StudioPackageArchiveSource {
  if (source instanceof Uint8Array) return source.slice();
  if (source instanceof ArrayBuffer) return source.slice(0);
  if (typeof Blob !== "undefined" && source instanceof Blob) return source;
  throw cbzError("IMAGE_INVALID", "지원하지 않는 CBZ 페이지 데이터입니다.", path);
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
      throw cbzError("IMAGE_INVALID", `CBZ 페이지를 읽지 못했습니다${detail}`, path);
    }
  }
  throwIfAborted(signal);
  return bytes;
}

function startsWith(bytes: Uint8Array, signature: Uint8Array): boolean {
  if (bytes.byteLength < signature.byteLength) return false;
  for (let index = 0; index < signature.byteLength; index += 1) {
    if (bytes[index] !== signature[index]) return false;
  }
  return true;
}

function detectPage(bytes: Uint8Array): DetectedPage | undefined {
  if (startsWith(bytes, PNG_SIGNATURE)) return { mimeType: "image/png", extension: "png" };
  if (
    bytes.byteLength >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.byteLength - 2] === 0xff &&
    bytes[bytes.byteLength - 1] === 0xd9
  ) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(4, true) + 8 === bytes.byteLength) {
      return { mimeType: "image/webp", extension: "webp" };
    }
  }
  return undefined;
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

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function validateMetadataString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || hasUnsafeXmlControl(value)) {
    throw cbzError("COMICINFO_INVALID", `${label} metadata가 올바른 문자열이 아닙니다.`);
  }
  return value;
}

function validateOptionalInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw cbzError("COMICINFO_INVALID", `${label} metadata가 안전 범위를 벗어났습니다.`);
  }
  return value as number;
}

function validateStringList(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw cbzError("COMICINFO_INVALID", `${label} metadata는 문자열 목록이어야 합니다.`);
  }
  return value.map((item) => {
    const validated = validateMetadataString(item, label);
    if (validated === undefined) throw cbzError("COMICINFO_INVALID", `${label} 값이 없습니다.`);
    if (validated.includes(",")) {
      throw cbzError("COMICINFO_INVALID", `${label} 항목에는 목록 구분자인 쉼표를 사용할 수 없습니다.`);
    }
    return validated;
  });
}

function normalizeMetadata(metadata: StudioComicInfoMetadata | undefined): StudioComicInfoMetadata {
  if (!metadata) return {};
  if (metadata.blackAndWhite !== undefined && typeof metadata.blackAndWhite !== "boolean") {
    throw cbzError("COMICINFO_INVALID", "BlackAndWhite metadata는 boolean이어야 합니다.");
  }
  return {
    title: validateMetadataString(metadata.title, "Title"),
    series: validateMetadataString(metadata.series, "Series"),
    number: validateMetadataString(metadata.number, "Number"),
    count: validateOptionalInteger(metadata.count, "Count", 0, 1_000_000),
    volume: validateOptionalInteger(metadata.volume, "Volume", 0, 1_000_000),
    summary: validateMetadataString(metadata.summary, "Summary"),
    notes: validateMetadataString(metadata.notes, "Notes"),
    year: validateOptionalInteger(metadata.year, "Year", 0, 9_999),
    month: validateOptionalInteger(metadata.month, "Month", 1, 12),
    day: validateOptionalInteger(metadata.day, "Day", 1, 31),
    writer: validateMetadataString(metadata.writer, "Writer"),
    penciller: validateMetadataString(metadata.penciller, "Penciller"),
    inker: validateMetadataString(metadata.inker, "Inker"),
    colorist: validateMetadataString(metadata.colorist, "Colorist"),
    letterer: validateMetadataString(metadata.letterer, "Letterer"),
    coverArtist: validateMetadataString(metadata.coverArtist, "CoverArtist"),
    editor: validateMetadataString(metadata.editor, "Editor"),
    publisher: validateMetadataString(metadata.publisher, "Publisher"),
    imprint: validateMetadataString(metadata.imprint, "Imprint"),
    genre: validateStringList(metadata.genre, "Genre"),
    tags: validateStringList(metadata.tags, "Tags"),
    web: validateMetadataString(metadata.web, "Web"),
    languageISO: validateMetadataString(metadata.languageISO, "LanguageISO"),
    format: validateMetadataString(metadata.format, "Format"),
    ageRating: validateMetadataString(metadata.ageRating, "AgeRating"),
    blackAndWhite: metadata.blackAndWhite,
    manga: validateMetadataString(metadata.manga, "Manga"),
  };
}

const COMIC_INFO_STRING_FIELDS = [
  ["title", "Title"],
  ["series", "Series"],
  ["number", "Number"],
  ["summary", "Summary"],
  ["notes", "Notes"],
  ["writer", "Writer"],
  ["penciller", "Penciller"],
  ["inker", "Inker"],
  ["colorist", "Colorist"],
  ["letterer", "Letterer"],
  ["coverArtist", "CoverArtist"],
  ["editor", "Editor"],
  ["publisher", "Publisher"],
  ["imprint", "Imprint"],
  ["web", "Web"],
  ["languageISO", "LanguageISO"],
  ["format", "Format"],
  ["ageRating", "AgeRating"],
  ["manga", "Manga"],
] as const satisfies readonly (readonly [keyof StudioComicInfoMetadata, string])[];

const COMIC_INFO_INTEGER_FIELDS = [
  ["count", "Count"],
  ["volume", "Volume"],
  ["year", "Year"],
  ["month", "Month"],
  ["day", "Day"],
] as const satisfies readonly (readonly [keyof StudioComicInfoMetadata, string])[];

function buildComicInfoXml(metadata: StudioComicInfoMetadata, pageCount: number): Uint8Array {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
  ];
  for (const [key, tag] of COMIC_INFO_STRING_FIELDS) {
    const value = metadata[key];
    if (typeof value === "string" && value.length > 0) {
      lines.push(`  <${tag}>${escapeXml(value)}</${tag}>`);
    }
  }
  for (const [key, tag] of COMIC_INFO_INTEGER_FIELDS) {
    const value = metadata[key];
    if (typeof value === "number") lines.push(`  <${tag}>${value}</${tag}>`);
  }
  if (metadata.genre && metadata.genre.length > 0) {
    lines.push(`  <Genre>${escapeXml(metadata.genre.join(", "))}</Genre>`);
  }
  if (metadata.tags && metadata.tags.length > 0) {
    lines.push(`  <Tags>${escapeXml(metadata.tags.join(", "))}</Tags>`);
  }
  if (metadata.blackAndWhite !== undefined) {
    lines.push(`  <BlackAndWhite>${metadata.blackAndWhite ? "Yes" : "No"}</BlackAndWhite>`);
  }
  lines.push(`  <PageCount>${pageCount}</PageCount>`);
  lines.push("  <Pages>");
  for (let index = 0; index < pageCount; index += 1) {
    const type = index === 0 ? ' Type="FrontCover"' : "";
    lines.push(`    <Page Image="${index}"${type}/>`);
  }
  lines.push("  </Pages>", "</ComicInfo>", "");
  return encoder.encode(lines.join("\n"));
}

async function prepareCbz(
  rawInput: StudioCbzExportInput,
  options: StudioCbzExportOptions
): Promise<PreparedCbz> {
  const limits = resolveLimits(options.limits);
  const sources = rawInput.pages.map((page, index) =>
    snapshotSource(page.image, `page ${index + 1}`)
  );
  const metadata = normalizeMetadata(rawInput.metadata);
  throwIfAborted(options.signal);
  if (sources.length === 0 || sources.length > limits.maxPages) {
    throw cbzError("PAGE_COUNT_LIMIT", "CBZ 페이지 수가 안전 범위를 벗어났습니다.");
  }
  const metadataCharacters = JSON.stringify(metadata).length;
  if (metadataCharacters > limits.maxMetadataCharacters) {
    throw cbzError("COMICINFO_INVALID", "ComicInfo metadata가 안전 한도를 넘었습니다.");
  }

  const digits = Math.max(4, String(sources.length).length);
  const pageEntries: StudioPackageArchiveEntry[] = [];
  let totalPageBytes = 0;
  for (let index = 0; index < sources.length; index += 1) {
    throwIfAborted(options.signal);
    const source = sources[index];
    if (!source) continue;
    const size = sourceSize(source);
    if (!Number.isSafeInteger(size) || size <= 0 || size > limits.maxPageBytes) {
      throw cbzError("SIZE_LIMIT", "CBZ 페이지 크기가 안전 한도를 벗어났습니다.", `page ${index + 1}`);
    }
    const bytes = await sourceBytes(source, `page ${index + 1}`, options.signal);
    const detected = detectPage(bytes);
    if (!detected) {
      throw cbzError("IMAGE_INVALID", "CBZ 페이지는 PNG, JPEG, WebP 중 하나여야 합니다.", `page ${index + 1}`);
    }
    totalPageBytes += bytes.byteLength;
    if (totalPageBytes > limits.maxTotalPageBytes) {
      throw cbzError("SIZE_LIMIT", "CBZ 전체 페이지 크기가 안전 한도를 넘었습니다.");
    }
    pageEntries.push({
      path: `pages/${String(index + 1).padStart(digits, "0")}.${detected.extension}`,
      data: bytes.slice(),
    });
  }
  const comicInfo = buildComicInfoXml(metadata, pageEntries.length);
  if (comicInfo.byteLength > limits.maxComicInfoBytes) {
    throw cbzError("SIZE_LIMIT", "ComicInfo.xml이 안전 한도를 넘었습니다.");
  }
  return {
    warnings: [],
    entries: [{ path: "ComicInfo.xml", data: comicInfo }, ...pageEntries],
  };
}

function writerLimits(limits: StudioCbzLimits) {
  return {
    maxFiles: limits.maxPages + 1,
    maxEntryBytes: Math.max(limits.maxPageBytes, limits.maxComicInfoBytes),
    maxTotalBytes: Math.min(
      512_000_000,
      limits.maxTotalPageBytes + limits.maxComicInfoBytes
    ),
    maxArchiveBytes: limits.maxArchiveBytes,
  };
}

export async function buildStudioCbzBytes(
  input: StudioCbzExportInput,
  options: StudioCbzExportOptions = {}
): Promise<StudioCbzBuildBytesResult> {
  const prepared = await prepareCbz(input, options);
  const bytes = await buildStudioPackageArchiveBytes(
    prepared.entries,
    { limits: writerLimits(resolveLimits(options.limits)) }
  );
  return { bytes, warnings: Object.freeze([...prepared.warnings]) };
}

export async function buildStudioCbzBlob(
  input: StudioCbzExportInput,
  options: StudioCbzExportOptions = {}
): Promise<StudioCbzBuildBlobResult> {
  const prepared = await prepareCbz(input, options);
  const blob = await buildStudioPackageArchiveBlob(prepared.entries, {
    mimeType: STUDIO_CBZ_MIME,
    limits: writerLimits(resolveLimits(options.limits)),
  });
  return { blob, warnings: Object.freeze([...prepared.warnings]) };
}

function naturalChunks(value: string): string[] {
  return value.match(/\d+|\D+/gu) ?? [];
}

/** Locale-independent natural path order for page names such as 2, 10, 010. */
export function compareStudioCbzPagePaths(left: string, right: string): number {
  const leftChunks = naturalChunks(left.normalize("NFKC").toLowerCase());
  const rightChunks = naturalChunks(right.normalize("NFKC").toLowerCase());
  const count = Math.max(leftChunks.length, rightChunks.length);
  for (let index = 0; index < count; index += 1) {
    const leftChunk = leftChunks[index];
    const rightChunk = rightChunks[index];
    if (leftChunk === undefined) return -1;
    if (rightChunk === undefined) return 1;
    if (leftChunk === rightChunk) continue;
    const leftNumeric = /^\d+$/u.test(leftChunk);
    const rightNumeric = /^\d+$/u.test(rightChunk);
    if (leftNumeric && rightNumeric) {
      const leftCanonical = leftChunk.replace(/^0+(?=\d)/u, "");
      const rightCanonical = rightChunk.replace(/^0+(?=\d)/u, "");
      if (leftCanonical.length !== rightCanonical.length) {
        return leftCanonical.length - rightCanonical.length;
      }
      if (leftCanonical !== rightCanonical) return leftCanonical < rightCanonical ? -1 : 1;
      if (leftChunk.length !== rightChunk.length) return leftChunk.length - rightChunk.length;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else {
      return leftChunk < rightChunk ? -1 : 1;
    }
  }
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function decodeXmlText(value: string): string {
  const entityPattern = /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/gu;
  const unescaped = value.replaceAll(entityPattern, "");
  if (unescaped.includes("&") || unescaped.includes("<") || unescaped.includes(">")) {
    throw cbzError("COMICINFO_INVALID", "ComicInfo.xml text가 올바르게 escape되지 않았습니다.");
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
      throw cbzError("COMICINFO_INVALID", "ComicInfo.xml 문자 entity가 올바르지 않습니다.");
    }
    return String.fromCodePoint(numeric);
  }).trim();
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

function extractSimpleTag(xml: string, tag: string): string | undefined {
  const expression = new RegExp(`<${tag}\\s*>([\\s\\S]*?)<\\/${tag}\\s*>`, "giu");
  const matches = [...xml.matchAll(expression)];
  if (matches.length > 1) {
    throw cbzError("COMICINFO_INVALID", `ComicInfo.xml에 ${tag} tag가 중복되었습니다.`);
  }
  const value = matches[0]?.[1];
  return value === undefined ? undefined : decodeXmlText(value);
}

function parseComicInfoInteger(
  value: string | undefined,
  tag: string,
  minimum: number,
  maximum: number
): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/u.test(value)) {
    throw cbzError("COMICINFO_INVALID", `ComicInfo.xml ${tag} 값이 정수가 아닙니다.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw cbzError("COMICINFO_INVALID", `ComicInfo.xml ${tag} 값이 안전 범위를 벗어났습니다.`);
  }
  return parsed;
}

function splitMetadataList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseComicInfo(
  bytes: Uint8Array,
  limits: StudioCbzLimits
): { metadata: StudioComicInfoMetadata; declaredPageCount?: number } {
  if (bytes.byteLength === 0 || bytes.byteLength > limits.maxComicInfoBytes) {
    throw cbzError("SIZE_LIMIT", "ComicInfo.xml 크기가 안전 범위를 벗어났습니다.");
  }
  let xml: string;
  try {
    xml = decoder.decode(bytes);
  } catch {
    throw cbzError("COMICINFO_INVALID", "ComicInfo.xml이 올바른 UTF-8이 아닙니다.");
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)/iu.test(xml)) {
    throw cbzError("COMICINFO_INVALID", "ComicInfo.xml DTD/entity 선언은 허용되지 않습니다.");
  }
  let normalizedXml = xml.trim();
  if (normalizedXml.startsWith("<?xml")) {
    const declarationEnd = normalizedXml.indexOf("?>");
    if (declarationEnd < 0) {
      throw cbzError("COMICINFO_INVALID", "ComicInfo.xml 선언이 닫히지 않았습니다.");
    }
    normalizedXml = normalizedXml.slice(declarationEnd + 2).trim();
  }
  if (normalizedXml.includes("<?")) {
    throw cbzError("COMICINFO_INVALID", "ComicInfo.xml 처리 지시문은 허용되지 않습니다.");
  }
  for (;;) {
    const commentStart = normalizedXml.indexOf("<!--");
    if (commentStart < 0) break;
    const commentEnd = normalizedXml.indexOf("-->", commentStart + 4);
    if (commentEnd < 0) {
      throw cbzError("COMICINFO_INVALID", "ComicInfo.xml 주석이 닫히지 않았습니다.");
    }
    normalizedXml = `${normalizedXml.slice(0, commentStart)}${normalizedXml.slice(commentEnd + 3)}`;
  }
  normalizedXml = normalizedXml.trim();
  if (/^<ComicInfo(?:\s[^>]*)?\s*\/>$/iu.test(normalizedXml)) {
    normalizedXml = "<ComicInfo></ComicInfo>";
  }
  if (!/^<ComicInfo(?:\s[^>]*)?>[\s\S]*<\/ComicInfo\s*>$/iu.test(normalizedXml)) {
    throw cbzError("COMICINFO_INVALID", "ComicInfo.xml root가 올바르지 않습니다.");
  }

  const metadata: StudioComicInfoMetadata = {
    title: extractSimpleTag(normalizedXml, "Title"),
    series: extractSimpleTag(normalizedXml, "Series"),
    number: extractSimpleTag(normalizedXml, "Number"),
    count: parseComicInfoInteger(extractSimpleTag(normalizedXml, "Count"), "Count", 0, 1_000_000),
    volume: parseComicInfoInteger(extractSimpleTag(normalizedXml, "Volume"), "Volume", 0, 1_000_000),
    summary: extractSimpleTag(normalizedXml, "Summary"),
    notes: extractSimpleTag(normalizedXml, "Notes"),
    year: parseComicInfoInteger(extractSimpleTag(normalizedXml, "Year"), "Year", 0, 9_999),
    month: parseComicInfoInteger(extractSimpleTag(normalizedXml, "Month"), "Month", 1, 12),
    day: parseComicInfoInteger(extractSimpleTag(normalizedXml, "Day"), "Day", 1, 31),
    writer: extractSimpleTag(normalizedXml, "Writer"),
    penciller: extractSimpleTag(normalizedXml, "Penciller"),
    inker: extractSimpleTag(normalizedXml, "Inker"),
    colorist: extractSimpleTag(normalizedXml, "Colorist"),
    letterer: extractSimpleTag(normalizedXml, "Letterer"),
    coverArtist: extractSimpleTag(normalizedXml, "CoverArtist"),
    editor: extractSimpleTag(normalizedXml, "Editor"),
    publisher: extractSimpleTag(normalizedXml, "Publisher"),
    imprint: extractSimpleTag(normalizedXml, "Imprint"),
    genre: splitMetadataList(extractSimpleTag(normalizedXml, "Genre")),
    tags: splitMetadataList(extractSimpleTag(normalizedXml, "Tags")),
    web: extractSimpleTag(normalizedXml, "Web"),
    languageISO: extractSimpleTag(normalizedXml, "LanguageISO"),
    format: extractSimpleTag(normalizedXml, "Format"),
    ageRating: extractSimpleTag(normalizedXml, "AgeRating"),
    manga: extractSimpleTag(normalizedXml, "Manga"),
  };
  const blackAndWhite = extractSimpleTag(normalizedXml, "BlackAndWhite");
  if (blackAndWhite !== undefined) {
    if (blackAndWhite !== "Yes" && blackAndWhite !== "No") {
      throw cbzError("COMICINFO_INVALID", "BlackAndWhite 값은 Yes 또는 No여야 합니다.");
    }
    metadata.blackAndWhite = blackAndWhite === "Yes";
  }
  if (JSON.stringify(metadata).length > limits.maxMetadataCharacters) {
    throw cbzError("COMICINFO_INVALID", "ComicInfo metadata가 안전 한도를 넘었습니다.");
  }
  return {
    metadata,
    declaredPageCount: parseComicInfoInteger(
      extractSimpleTag(normalizedXml, "PageCount"),
      "PageCount",
      0,
      limits.maxPages
    ),
  };
}

function imageExtensionMatches(path: string, detected: DetectedPage): boolean {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (detected.mimeType === "image/jpeg") return extension === "jpg" || extension === "jpeg";
  return extension === detected.extension;
}

function bytesToBlob(bytes: Uint8Array, type: string): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

export async function importStudioCbz(
  source: Blob | Uint8Array | ArrayBuffer,
  options: StudioCbzImportOptions = {}
): Promise<StudioCbzImportResult> {
  const limits = resolveLimits(options.limits);
  throwIfAborted(options.signal);
  const zipLimits: Partial<StudioZipReaderLimits> = {
    maxArchiveBytes: limits.maxArchiveBytes,
    maxEntries: limits.maxPages + 64,
    maxEntryCompressedBytes: Math.max(limits.maxPageBytes, limits.maxComicInfoBytes),
    maxEntryUncompressedBytes: Math.max(limits.maxPageBytes, limits.maxComicInfoBytes),
    maxTotalUncompressedBytes: Math.min(
      512_000_000,
      limits.maxTotalPageBytes + limits.maxComicInfoBytes
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
    const detail = cause instanceof Error ? `: ${cause.message}` : "";
    throw cbzError("ARCHIVE_INVALID", `CBZ ZIP이 올바르지 않습니다${detail}`);
  }

  const warnings: StudioCbzWarning[] = [];
  const comicInfoEntry = archive.entries.find(
    (entry) => !entry.directory && entry.path.toLowerCase() === "comicinfo.xml"
  );
  let metadata: StudioComicInfoMetadata = {};
  let declaredPageCount: number | undefined;
  if (comicInfoEntry) {
    const parsed = parseComicInfo(
      await archive.readEntry(comicInfoEntry, { signal: options.signal }),
      limits
    );
    metadata = parsed.metadata;
    declaredPageCount = parsed.declaredPageCount;
  } else {
    warnings.push({
      code: "COMICINFO_MISSING",
      message: "ComicInfo.xml이 없어 페이지 이미지만 가져왔습니다.",
    });
  }

  const imageEntries = archive.entries
    .filter((entry) => {
      if (entry.directory || entry === comicInfoEntry) return false;
      const lower = entry.path.toLowerCase();
      if (/\.(?:png|jpe?g|webp)$/u.test(lower)) return true;
      warnings.push({
        code: "IGNORED_ENTRY",
        path: entry.path,
        message: `CBZ의 비이미지 항목 '${entry.path}'을 건너뛰었습니다.`,
      });
      return false;
    })
    .sort((left, right) => compareStudioCbzPagePaths(left.path, right.path));
  if (imageEntries.length === 0 || imageEntries.length > limits.maxPages) {
    throw cbzError("PAGE_COUNT_LIMIT", "CBZ 페이지 수가 안전 범위를 벗어났습니다.");
  }

  const pages: StudioCbzImportedPage[] = [];
  let totalPageBytes = 0;
  for (let index = 0; index < imageEntries.length; index += 1) {
    throwIfAborted(options.signal);
    const entry = imageEntries[index];
    if (!entry) continue;
    if (entry.uncompressedBytes > limits.maxPageBytes) {
      throw cbzError("SIZE_LIMIT", "CBZ 페이지가 안전 한도를 넘었습니다.", entry.path);
    }
    const bytes = await archive.readEntry(entry, { signal: options.signal });
    const detected = detectPage(bytes);
    if (!detected || !imageExtensionMatches(entry.path, detected)) {
      throw cbzError(
        "IMAGE_INVALID",
        "CBZ 페이지의 확장자와 PNG/JPEG/WebP signature가 일치하지 않습니다.",
        entry.path
      );
    }
    totalPageBytes += bytes.byteLength;
    if (totalPageBytes > limits.maxTotalPageBytes) {
      throw cbzError("SIZE_LIMIT", "CBZ 전체 페이지 크기가 안전 한도를 넘었습니다.");
    }
    pages.push(Object.freeze({
      index,
      path: entry.path,
      mimeType: detected.mimeType,
      byteSize: bytes.byteLength,
      image: bytesToBlob(bytes, detected.mimeType),
    }));
  }

  if (declaredPageCount !== undefined && declaredPageCount !== pages.length) {
    warnings.push({
      code: "PAGE_COUNT_MISMATCH",
      message: `ComicInfo.xml은 ${declaredPageCount}페이지, archive는 ${pages.length}페이지입니다.`,
    });
  }
  return Object.freeze({
    pages: Object.freeze(pages),
    metadata: Object.freeze({
      ...metadata,
      ...(metadata.genre ? { genre: Object.freeze([...metadata.genre]) } : {}),
      ...(metadata.tags ? { tags: Object.freeze([...metadata.tags]) } : {}),
    }),
    warnings: Object.freeze(warnings),
  });
}
