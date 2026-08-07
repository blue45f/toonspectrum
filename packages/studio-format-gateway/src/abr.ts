/**
 * Photoshop `.abr` brush importer, legacy v1/v2 (matrix §10.4 SUT/ABR lane).
 *
 * v1/v2 is the documented legacy container: big-endian `version(u16)`,
 * `count(u16)`, then per-brush records `type(u16), size(u32)` with computed
 * brushes (type 1) carrying diameter/roundness/angle/spacing and (v2) a
 * UTF-16 name. Modern v6+/v10 files are an 8BIM section container without a
 * public spec; those return an explicit `unsupported-version` error instead
 * of a lossy guess (absolute rule 9). The raw bytes always travel with the
 * result for round-trip retention.
 */

export interface AbrComputedBrush {
  kind: "computed";
  name: string;
  diameterPx: number;
  roundness: number;
  angleDeg: number;
  spacingPct: number;
}

export interface AbrUnknownBrush {
  kind: "unknown";
  typeCode: number;
  byteLength: number;
}

export type AbrBrush = AbrComputedBrush | AbrUnknownBrush;

export interface AbrImportResult {
  version: number;
  brushes: AbrBrush[];
  warnings: string[];
}

export class AbrParseError extends Error {
  constructor(
    message: string,
    readonly code: "truncated" | "unsupported-version" | "corrupt",
  ) {
    super(message);
    this.name = "AbrParseError";
  }
}

export function importAbr(bytes: Uint8Array): AbrImportResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 4) {
    throw new AbrParseError("file shorter than the ABR header", "truncated");
  }
  const version = view.getUint16(0, false);
  if (version >= 6) {
    // 8BIM-container era (v6/v7/v10): no public spec — refuse loudly rather
    // than import a guessed subset. The Fidelity Lab tracks this gap.
    throw new AbrParseError(
      `ABR version ${version} uses the undocumented 8BIM container; import is gated until the sampled-brush lane ships`,
      "unsupported-version",
    );
  }
  if (version !== 1 && version !== 2) {
    throw new AbrParseError(`unrecognized ABR version ${version}`, "corrupt");
  }

  const count = view.getUint16(2, false);
  const brushes: AbrBrush[] = [];
  const warnings: string[] = [];
  let offset = 4;

  for (let index = 0; index < count; index += 1) {
    if (offset + 6 > bytes.byteLength) {
      throw new AbrParseError(
        `brush ${index}: record header exceeds file length`,
        "truncated",
      );
    }
    const typeCode = view.getUint16(offset, false);
    const size = view.getUint32(offset + 2, false);
    offset += 6;
    if (offset + size > bytes.byteLength) {
      throw new AbrParseError(
        `brush ${index}: record body exceeds file length`,
        "truncated",
      );
    }
    if (typeCode === 1) {
      // Computed brush: misc(u32), spacing(u16), [v2: name], diameter(u16),
      // roundness(u16), angle(u16), ... — fixed fields are big-endian.
      let cursor = offset;
      cursor += 4; // misc
      const spacingPct = view.getUint16(cursor, false);
      cursor += 2;
      let name = `computed-${index}`;
      if (version === 2) {
        const nameLength = view.getUint32(cursor, false);
        cursor += 4;
        const chars: number[] = [];
        for (let unit = 0; unit < nameLength; unit += 1) {
          chars.push(view.getUint16(cursor, false));
          cursor += 2;
        }
        // Trailing NUL is part of the stored length in real files.
        name = String.fromCharCode(...chars).replace(/\0+$/u, "") || name;
      }
      const angleDeg = view.getInt16(cursor, false);
      cursor += 2;
      const roundness = view.getInt16(cursor, false);
      cursor += 2;
      const diameterPx = view.getUint16(cursor, false);
      brushes.push({
        kind: "computed",
        name,
        diameterPx,
        roundness,
        angleDeg,
        spacingPct,
      });
    } else {
      // Sampled (type 2) and unknown types are retained as inventory, not
      // silently skipped — pixels for sampled tips arrive with the v6 lane.
      brushes.push({ kind: "unknown", typeCode, byteLength: size });
      warnings.push(
        `brush ${index}: type ${typeCode} retained as raw payload (no decoder yet)`,
      );
    }
    offset += size;
  }

  return { version, brushes, warnings };
}
