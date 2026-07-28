export interface PngIntegrity {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlaced: boolean;
  idatBytes: number;
  chunkCount: number;
}

export interface PixelDiffEvidence {
  changedPixels: number;
  totalPixels: number;
  maxChannelDelta: number;
}

export interface StudioLifecycleVisualEvidence {
  blankToCommitted: PixelDiffEvidence;
  blankToUndone: PixelDiffEvidence;
  committedToRedone: PixelDiffEvidence;
  redoneToReloaded: PixelDiffEvidence;
  beforeToAfterReloadExport: PixelDiffEvidence;
}

export interface StudioLifecycleVisualPolicy {
  minimumCommittedPixels: number;
  minimumCommittedChannelDelta: number;
  maximumEquivalentPixelRatio: number;
  maximumEquivalentPixels: number;
  requireExactExportPixels: boolean;
}

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const DEFAULT_VISUAL_POLICY: StudioLifecycleVisualPolicy = {
  minimumCommittedPixels: 8,
  minimumCommittedChannelDelta: 8,
  maximumEquivalentPixelRatio: 0.0002,
  maximumEquivalentPixels: 192,
  requireExactExportPixels: true,
};

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000
    + bytes[offset + 1]! * 0x10000
    + bytes[offset + 2]! * 0x100
    + bytes[offset + 3]!
  ) >>> 0;
}

function chunkType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) {
    crc ^= bytes[offset]!;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Validates the complete PNG chunk envelope, including every chunk CRC and a terminal IEND.
 * This deliberately does not inflate IDAT data; Chromium's decoder supplies the independent
 * pixel-level check in the production-preview verifier.
 */
export function inspectPngIntegrity(bytes: Uint8Array): PngIntegrity {
  if (bytes.byteLength < 45) throw new Error("PNG is too short");
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) throw new Error("PNG signature is invalid");
  }

  let offset = PNG_SIGNATURE.length;
  let chunkCount = 0;
  let idatBytes = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaced = false;

  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) throw new Error("PNG has a truncated chunk header");
    const length = readUint32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const crcOffset = dataOffset + length;
    const chunkEnd = crcOffset + 4;
    if (chunkEnd > bytes.byteLength) throw new Error("PNG has a truncated chunk payload");

    const type = chunkType(bytes, typeOffset);
    if (!/^[A-Za-z]{4}$/u.test(type)) throw new Error(`PNG chunk type is invalid: ${type}`);
    const expectedCrc = readUint32(bytes, crcOffset);
    const actualCrc = crc32(bytes, typeOffset, crcOffset);
    if (actualCrc !== expectedCrc) throw new Error(`PNG ${type} chunk CRC is invalid`);
    chunkCount += 1;

    if (chunkCount === 1 && type !== "IHDR") throw new Error("PNG must start with IHDR");
    if (type === "IHDR") {
      if (sawHeader || length !== 13) throw new Error("PNG IHDR is invalid");
      width = readUint32(bytes, dataOffset);
      height = readUint32(bytes, dataOffset + 4);
      bitDepth = bytes[dataOffset + 8]!;
      colorType = bytes[dataOffset + 9]!;
      const compression = bytes[dataOffset + 10]!;
      const filter = bytes[dataOffset + 11]!;
      const interlace = bytes[dataOffset + 12]!;
      if (width === 0 || height === 0) throw new Error("PNG dimensions must be positive");
      if (compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1)) {
        throw new Error("PNG IHDR uses an unsupported encoding");
      }
      interlaced = interlace === 1;
      sawHeader = true;
    } else if (type === "IDAT") {
      if (!sawHeader || sawEnd) throw new Error("PNG IDAT ordering is invalid");
      sawImageData = true;
      idatBytes += length;
    } else if (type === "IEND") {
      if (!sawHeader || !sawImageData || sawEnd || length !== 0) {
        throw new Error("PNG IEND is invalid");
      }
      sawEnd = true;
      if (chunkEnd !== bytes.byteLength) throw new Error("PNG has trailing bytes after IEND");
    } else if (sawEnd) {
      throw new Error("PNG contains a chunk after IEND");
    }

    offset = chunkEnd;
  }

  if (!sawHeader || !sawImageData || !sawEnd || idatBytes === 0) {
    throw new Error("PNG is missing required chunks");
  }
  return {
    width,
    height,
    bitDepth,
    colorType,
    interlaced,
    idatBytes,
    chunkCount,
  };
}

function maximumEquivalentPixels(
  evidence: PixelDiffEvidence,
  policy: StudioLifecycleVisualPolicy,
): number {
  return Math.min(
    policy.maximumEquivalentPixels,
    Math.max(3, Math.floor(evidence.totalPixels * policy.maximumEquivalentPixelRatio)),
  );
}

/**
 * Returns all violated lifecycle invariants so a CI failure explains the whole transition rather
 * than only the first mismatch. The browser harness remains responsible for producing decoded
 * pixel evidence.
 */
export function studioLifecycleVisualViolations(
  evidence: StudioLifecycleVisualEvidence,
  overrides: Partial<StudioLifecycleVisualPolicy> = {},
): string[] {
  const policy = { ...DEFAULT_VISUAL_POLICY, ...overrides };
  const violations: string[] = [];
  if (
    evidence.blankToCommitted.changedPixels < policy.minimumCommittedPixels
    || evidence.blankToCommitted.maxChannelDelta < policy.minimumCommittedChannelDelta
  ) {
    violations.push("pointer stroke did not create meaningful committed pixels");
  }

  const equivalentTransitions = [
    ["undo did not restore the blank canvas", evidence.blankToUndone],
    ["redo did not restore the committed stroke", evidence.committedToRedone],
    ["reload did not restore the saved stroke", evidence.redoneToReloaded],
  ] as const;
  for (const [message, diff] of equivalentTransitions) {
    if (diff.changedPixels > maximumEquivalentPixels(diff, policy)) violations.push(message);
  }

  const exportDiff = evidence.beforeToAfterReloadExport;
  const exportLimit = policy.requireExactExportPixels
    ? 0
    : maximumEquivalentPixels(exportDiff, policy);
  if (exportDiff.changedPixels > exportLimit) {
    violations.push("PNG export pixels changed across save/reload");
  }
  return violations;
}
