/**
 * Shared ZIP/PNG-compatible CRC-32 core.
 *
 * Keep this loop index-based: `for…of` over large typed arrays was measured at more than three
 * times the cost of an indexed loop in the package-export hot path.
 */
const STUDIO_CRC32_TABLE = (() => {
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

/** Calculates the standard reflected CRC-32 used by ZIP and PNG. */
export function calculateStudioCrc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (let index = 0, length = bytes.byteLength; index < length; index += 1) {
    crc = (crc >>> 8) ^ STUDIO_CRC32_TABLE[(crc ^ bytes[index]!) & 0xff]!;
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}
