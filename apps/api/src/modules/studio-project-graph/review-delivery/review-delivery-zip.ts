import { createHash } from "node:crypto";

export interface ReviewDeliveryZipEntry { readonly path: string; readonly bytes: Buffer }
export interface ReviewDeliveryZipResult { readonly bytes: Buffer; readonly sha256: string }
const MAX_ARCHIVE_BYTES = 160 * 1024 * 1024;
const MAX_FILES = 102;
const UTF8_FLAG = 0x0800;
const DOS_DATE_1980_01_01 = 0x0021;
const table = (() => {
  const values = new Uint32Array(256);
  for (let index = 0; index < values.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    values[index] = value >>> 0;
  }
  return values;
})();
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ (table[(value ^ byte) & 0xff] ?? 0);
  return (value ^ 0xffffffff) >>> 0;
}
function safePath(value: string): Buffer {
  if (!/^(?:pages\/[0-9]{6}\.(?:png|jpg|webp)|manifest\.json|README\.txt)$/u.test(value)) throw new Error("review_delivery_zip_path");
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length === 0 || bytes.length > 240) throw new Error("review_delivery_zip_path");
  return bytes;
}
function localHeader(name: Buffer, data: Buffer, checksum: number): Buffer {
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(0, 8); header.writeUInt16LE(0, 10); header.writeUInt16LE(DOS_DATE_1980_01_01, 12);
  header.writeUInt32LE(checksum, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26); header.writeUInt16LE(0, 28); name.copy(header, 30); return header;
}
function centralHeader(name: Buffer, data: Buffer, checksum: number, offset: number): Buffer {
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6);
  header.writeUInt16LE(UTF8_FLAG, 8); header.writeUInt16LE(0, 10); header.writeUInt16LE(0, 12);
  header.writeUInt16LE(DOS_DATE_1980_01_01, 14); header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(data.length, 20); header.writeUInt32LE(data.length, 24); header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30); header.writeUInt16LE(0, 32); header.writeUInt16LE(0, 34); header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38); header.writeUInt32LE(offset, 42); name.copy(header, 46); return header;
}
export function buildReviewDeliveryZip(entries: readonly ReviewDeliveryZipEntry[]): ReviewDeliveryZipResult {
  if (entries.length < 3 || entries.length > MAX_FILES || new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error("review_delivery_zip_entries");
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0, sourceBytes = 0;
  for (const entry of entries) {
    const name = safePath(entry.path), data = Buffer.from(entry.bytes), checksum = crc32(data);
    if (data.length <= 0) throw new Error("review_delivery_zip_empty");
    sourceBytes += data.length;
    if (sourceBytes > MAX_ARCHIVE_BYTES) throw new Error("review_delivery_zip_budget");
    const header = localHeader(name, data, checksum); local.push(header, data);
    central.push(centralHeader(name, data, checksum, offset)); offset += header.length + data.length;
  }
  const centralOffset = offset, centralBytes = central.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralBytes, 12);
  end.writeUInt32LE(centralOffset, 16); end.writeUInt16LE(0, 20);
  const bytes = Buffer.concat([...local, ...central, end]);
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("review_delivery_zip_budget");
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
