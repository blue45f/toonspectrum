/**
 * Studio project archive — deterministic ZIP32/store reader extracted from
 * studio-project-archive.ts.
 *
 * Reads only the subset our own archive writer emits: local/central headers,
 * stored entries, CRC-32 verification. Package errors, limits, and the text
 * codecs stay in studio-project-archive.ts and are consumed through its
 * exported surface.
 */
import type { StudioPackageArchiveSource } from "./studio-package-archive";
import {
  SAFE_ARCHIVE_PATH_PATTERN,
  fail,
  fatalTextDecoder,
  textEncoder,
} from "./studio-project-archive";
import type {
  StudioProjectArchiveLimits,
} from "./studio-project-archive";

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_LOCAL_HEADER_BYTES = 30;
const ZIP_CENTRAL_HEADER_BYTES = 46;
const ZIP_EOCD_BYTES = 22;

export interface ZipReader {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  slice(offset: number, length: number, mimeType: string): Blob;
}

export interface ParsedZipEntry {
  path: string;
  crc32: number;
  compressedBytes: number;
  uncompressedBytes: number;
  dataOffset: number;
  localHeaderOffset: number;
}

function uint16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function uint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

const crc32Table = (() => {
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

function crc32(bytes: Uint8Array): number {
  let value = 0xffff_ffff;
  for (const byte of bytes) value = (value >>> 8) ^ (crc32Table[(value ^ byte) & 0xff] ?? 0);
  return (value ^ 0xffff_ffff) >>> 0;
}

export function createZipReader(source: StudioPackageArchiveSource, limits: StudioProjectArchiveLimits): ZipReader {
  if (source instanceof Blob) {
    if (source.size <= 0 || source.size > limits.maxArchiveBytes) {
      fail("ARCHIVE_SIZE_LIMIT", "프로젝트 archive 크기가 안전 한도를 넘었습니다.");
    }
    return {
      size: source.size,
      async read(offset, length) {
        if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > source.size) {
          fail("ARCHIVE_INVALID", "ZIP 데이터 범위가 올바르지 않습니다.");
        }
        const bytes = new Uint8Array(await source.slice(offset, offset + length).arrayBuffer());
        if (bytes.byteLength !== length) fail("ARCHIVE_INVALID", "ZIP 데이터를 모두 읽지 못했습니다.");
        return bytes;
      },
      slice(offset, length, mimeType) {
        return source.slice(offset, offset + length, mimeType);
      },
    };
  }
  if (!(source instanceof Uint8Array) && !(source instanceof ArrayBuffer)) {
    fail("ARCHIVE_INVALID", "지원하지 않는 프로젝트 archive 바이트 형식입니다.");
  }
  const bytes = source instanceof Uint8Array
    ? source.slice()
    : new Uint8Array(source.slice(0));
  if (bytes.byteLength <= 0 || bytes.byteLength > limits.maxArchiveBytes) {
    fail("ARCHIVE_SIZE_LIMIT", "프로젝트 archive 크기가 안전 한도를 넘었습니다.");
  }
  return {
    size: bytes.byteLength,
    async read(offset, length) {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.byteLength) {
        fail("ARCHIVE_INVALID", "ZIP 데이터 범위가 올바르지 않습니다.");
      }
      return bytes.slice(offset, offset + length);
    },
    slice(offset, length, mimeType) {
      const copy = bytes.slice(offset, offset + length);
      return new Blob([copy.buffer as ArrayBuffer], { type: mimeType });
    },
  };
}

function validateImportedPath(value: string, limits: StudioProjectArchiveLimits): string {
  if (
    value.length === 0
    || value !== value.normalize("NFKC")
    || !SAFE_ARCHIVE_PATH_PATTERN.test(value)
    || value.startsWith("/")
    || /^[A-Za-z]:/u.test(value)
    || textEncoder.encode(value).byteLength > limits.maxPathBytes
  ) {
    fail("PATH_INVALID", "ZIP 안에 안전하지 않은 파일 경로가 있습니다.", { path: value });
  }
  const segments = value.split("/");
  if (segments.some((segment) =>
    !segment
    || segment === "."
    || segment === ".."
    || segment.trim() !== segment
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment)
  )) {
    fail("PATH_INVALID", "ZIP 파일 경로에 순회 또는 빈 구간이 있습니다.", { path: value });
  }
  return value;
}

export async function parseZipEntries(reader: ZipReader, limits: StudioProjectArchiveLimits): Promise<ParsedZipEntry[]> {
  if (reader.size < ZIP_EOCD_BYTES) fail("ARCHIVE_INVALID", "ZIP 종료 레코드를 찾을 수 없습니다.");
  const eocdOffset = reader.size - ZIP_EOCD_BYTES;
  const eocd = await reader.read(eocdOffset, ZIP_EOCD_BYTES);
  if (uint32(eocd, 0) !== ZIP_EOCD_SIGNATURE || uint16(eocd, 20) !== 0) {
    fail("ARCHIVE_INVALID", "주석 또는 후행 데이터가 있는 ZIP은 가져올 수 없습니다.");
  }
  if (uint16(eocd, 4) !== 0 || uint16(eocd, 6) !== 0) {
    fail("ARCHIVE_INVALID", "분할 ZIP은 가져올 수 없습니다.");
  }
  const entryCount = uint16(eocd, 10);
  if (entryCount !== uint16(eocd, 8) || entryCount < 2 || entryCount > limits.maxAttachments + 2) {
    fail("ZIP_ENTRY_COUNT_LIMIT", "ZIP 파일 수가 프로젝트 archive 안전 한도를 벗어났습니다.");
  }
  const centralBytes = uint32(eocd, 12);
  const centralOffset = uint32(eocd, 16);
  if (centralOffset + centralBytes !== eocdOffset || centralBytes > entryCount * (ZIP_CENTRAL_HEADER_BYTES + limits.maxPathBytes)) {
    fail("ARCHIVE_INVALID", "ZIP 중앙 디렉터리 범위가 올바르지 않습니다.");
  }
  const central = await reader.read(centralOffset, centralBytes);
  const entries: ParsedZipEntry[] = [];
  const seen = new Set<string>();
  let cursor = 0;
  let totalUncompressed = 0;
  const maxZipEntryBytes = Math.max(
    limits.maxAttachmentBytes,
    limits.maxProjectBytes,
    limits.maxManifestBytes
  );
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + ZIP_CENTRAL_HEADER_BYTES > central.length || uint32(central, cursor) !== ZIP_CENTRAL_SIGNATURE) {
      fail("ARCHIVE_INVALID", "ZIP 중앙 디렉터리 항목이 손상되었습니다.");
    }
    const flags = uint16(central, cursor + 8);
    const method = uint16(central, cursor + 10);
    const expectedCrc = uint32(central, cursor + 16);
    const compressedBytes = uint32(central, cursor + 20);
    const uncompressedBytes = uint32(central, cursor + 24);
    const nameBytes = uint16(central, cursor + 28);
    const extraBytes = uint16(central, cursor + 30);
    const commentBytes = uint16(central, cursor + 32);
    const localHeaderOffset = uint32(central, cursor + 42);
    const next = cursor + ZIP_CENTRAL_HEADER_BYTES + nameBytes + extraBytes + commentBytes;
    if (next > central.length || flags !== ZIP_UTF8_FLAG || extraBytes !== 0 || commentBytes !== 0) {
      fail("ARCHIVE_INVALID", "ZIP 플래그, extra field 또는 comment가 허용된 형식이 아닙니다.");
    }
    if (method !== ZIP_STORE_METHOD) {
      if (uncompressedBytes > Math.max(compressedBytes * 10, maxZipEntryBytes)) {
        fail("ZIP_BOMB", "압축 해제 크기가 비정상적으로 큰 ZIP 항목을 차단했습니다.");
      }
      fail("ZIP_COMPRESSION_UNSUPPORTED", "압축된 ZIP 항목은 프로젝트 archive에서 지원하지 않습니다.");
    }
    if (compressedBytes !== uncompressedBytes || uncompressedBytes > maxZipEntryBytes) {
      fail("ZIP_BOMB", "ZIP 항목의 압축 또는 크기 선언이 안전하지 않습니다.");
    }
    totalUncompressed += uncompressedBytes;
    if (totalUncompressed > limits.maxArchiveBytes) {
      fail("ZIP_BOMB", "ZIP 전체 해제 크기가 안전 한도를 넘었습니다.");
    }
    let path: string;
    try {
      path = fatalTextDecoder.decode(central.subarray(cursor + ZIP_CENTRAL_HEADER_BYTES, cursor + ZIP_CENTRAL_HEADER_BYTES + nameBytes));
    } catch {
      fail("PATH_INVALID", "ZIP 파일명이 올바른 UTF-8이 아닙니다.");
    }
    path = validateImportedPath(path, limits);
    const comparisonKey = path.toLowerCase();
    if (seen.has(comparisonKey)) fail("DUPLICATE_PATH", "ZIP 안에 중복 파일 경로가 있습니다.", { path });
    seen.add(comparisonKey);

    const localHeader = await reader.read(localHeaderOffset, ZIP_LOCAL_HEADER_BYTES + nameBytes);
    if (
      uint32(localHeader, 0) !== ZIP_LOCAL_SIGNATURE
      || uint16(localHeader, 6) !== flags
      || uint16(localHeader, 8) !== method
      || uint32(localHeader, 14) !== expectedCrc
      || uint32(localHeader, 18) !== compressedBytes
      || uint32(localHeader, 22) !== uncompressedBytes
      || uint16(localHeader, 26) !== nameBytes
      || uint16(localHeader, 28) !== 0
    ) {
      fail("ARCHIVE_INVALID", "ZIP local header와 중앙 디렉터리가 일치하지 않습니다.", { path });
    }
    let localName: string;
    try {
      localName = fatalTextDecoder.decode(localHeader.subarray(ZIP_LOCAL_HEADER_BYTES));
    } catch {
      fail("PATH_INVALID", "ZIP local 파일명이 올바른 UTF-8이 아닙니다.", { path });
    }
    if (localName !== path) fail("ARCHIVE_INVALID", "ZIP local 파일명이 중앙 디렉터리와 다릅니다.", { path });
    entries.push({
      path,
      crc32: expectedCrc,
      compressedBytes,
      uncompressedBytes,
      dataOffset: localHeaderOffset + ZIP_LOCAL_HEADER_BYTES + nameBytes,
      localHeaderOffset,
    });
    cursor = next;
  }
  if (cursor !== central.length) fail("ARCHIVE_INVALID", "ZIP 중앙 디렉터리 뒤에 해석되지 않은 데이터가 있습니다.");
  const localOrder = [...entries].sort((left, right) => left.localHeaderOffset - right.localHeaderOffset);
  let expectedOffset = 0;
  for (const entry of localOrder) {
    if (entry.localHeaderOffset !== expectedOffset || entry.dataOffset + entry.compressedBytes > centralOffset) {
      fail("ARCHIVE_INVALID", "ZIP local 항목 사이에 숨겨진 데이터나 겹침이 있습니다.", { path: entry.path });
    }
    expectedOffset = entry.dataOffset + entry.compressedBytes;
  }
  if (expectedOffset !== centralOffset) fail("ARCHIVE_INVALID", "ZIP local 데이터와 중앙 디렉터리 사이에 숨겨진 데이터가 있습니다.");
  return entries;
}

export async function readVerifiedEntry(reader: ZipReader, entry: ParsedZipEntry): Promise<Uint8Array> {
  const bytes = await reader.read(entry.dataOffset, entry.uncompressedBytes);
  if (crc32(bytes) !== entry.crc32) {
    fail("CRC_MISMATCH", "ZIP 항목의 CRC-32 무결성 검사가 실패했습니다.", { path: entry.path });
  }
  return bytes;
}