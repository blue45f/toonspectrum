/**
 * Synthetic Krita `.kpp` fixture builders — KPP import lane (ADR-0011 lane 15).
 *
 * No external downloads: tests own their corpus by assembling the documented
 * container byte-by-byte. A `.kpp` file is a standard PNG (the preset
 * thumbnail) whose preset definition travels in a text chunk keyed `preset`:
 *
 *   PNG signature (8 bytes)
 *   chunk: length(u32 BE), type(4 ASCII), data, crc32(type + data)
 *   tEXt data: keyword, NUL, text (Krita writes UTF-8 XML here)
 *   zTXt data: keyword, NUL, method(0 = deflate), zlib stream
 *   iTXt data: keyword, NUL, compressed?(u8), method(u8), lang, NUL,
 *              translated keyword, NUL, UTF-8 text
 *
 * The embedded XML is `<Preset name paintopid> <param name type>value</param>
 * </Preset>` with any nested XML (brush definitions, sensor curves) escaped
 * into the param text. Container knowledge comes from the PNG specification
 * plus the publicly documented KPP layout — no GPL code is ported here.
 *
 * The CRC32/adler32 helpers are intentionally duplicated from nothing (both
 * are public-domain textbook algorithms); the production parser keeps its own
 * copy so the fixture builder cannot mask a parser checksum bug.
 */

export interface KppParamFixture {
  name: string;
  /** Krita serializes "string" | "internal" | "bytearray"; parser ignores it. */
  type: string;
  value: string;
}

export interface KppPresetXmlOptions {
  name: string;
  paintopid: string;
  version?: string;
  params: readonly KppParamFixture[];
}

export type KppPresetChunkKind = "tEXt" | "zTXt" | "iTXt";

export interface KppFileOptions {
  presetXml: string;
  /** Chunk kind carrying the `preset` keyword (default tEXt, the Krita norm). */
  presetChunk?: KppPresetChunkKind;
  /** Value of the `version` tEXt chunk Krita always writes; null omits it. */
  metadataVersion?: string | null;
  /** Skips the `preset` chunk entirely (missing-preset error path). */
  omitPreset?: boolean;
  /** Extra raw chunks appended before IDAT (already CRC'd via buildChunk). */
  extraChunks?: readonly Uint8Array[];
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** RFC 1950 zlib stream using RFC 1951 stored (uncompressed) blocks only. */
export function storedZlib(data: Uint8Array): Uint8Array {
  const out: number[] = [0x78, 0x01];
  const blockSize = 0xffff;
  for (let offset = 0; offset < data.length || offset === 0; offset += blockSize) {
    const slice = data.subarray(offset, offset + blockSize);
    const final = offset + blockSize >= data.length ? 1 : 0;
    out.push(final, slice.length & 0xff, (slice.length >>> 8) & 0xff);
    out.push(~slice.length & 0xff, (~slice.length >>> 8) & 0xff);
    for (const byte of slice) {
      out.push(byte);
    }
    if (data.length === 0) {
      break;
    }
  }
  const adler = adler32(data);
  out.push((adler >>> 24) & 0xff, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff);
  return Uint8Array.from(out);
}

function pushU32(out: number[], value: number): void {
  out.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function asciiBytes(text: string): number[] {
  return [...text].map((ch) => ch.charCodeAt(0) & 0xff);
}

export function buildChunk(type: string, data: Uint8Array): Uint8Array {
  if (type.length !== 4) {
    throw new Error(`chunk type "${type}" must be exactly 4 characters`);
  }
  const out: number[] = [];
  pushU32(out, data.length);
  const typeAndData = Uint8Array.from([...asciiBytes(type), ...data]);
  for (const byte of typeAndData) {
    out.push(byte);
  }
  pushU32(out, crc32(typeAndData));
  return Uint8Array.from(out);
}

export function buildTextChunk(keyword: string, text: string): Uint8Array {
  // Krita stuffs UTF-8 XML into tEXt (the PNG spec says Latin-1; the parser
  // decodes UTF-8-first for exactly this reason).
  const data = Uint8Array.from([
    ...asciiBytes(keyword),
    0,
    ...new TextEncoder().encode(text),
  ]);
  return buildChunk("tEXt", data);
}

export function buildCompressedTextChunk(keyword: string, text: string): Uint8Array {
  const data = Uint8Array.from([
    ...asciiBytes(keyword),
    0,
    0, // compression method 0 = deflate
    ...storedZlib(new TextEncoder().encode(text)),
  ]);
  return buildChunk("zTXt", data);
}

export function buildInternationalTextChunk(keyword: string, text: string): Uint8Array {
  const data = Uint8Array.from([
    ...asciiBytes(keyword),
    0,
    0, // compression flag: uncompressed
    0, // compression method
    0, // empty language tag terminator
    0, // empty translated keyword terminator
    ...new TextEncoder().encode(text),
  ]);
  return buildChunk("iTXt", data);
}

/** 1×1 grayscale IHDR — the fixture thumbnail is intentionally minimal. */
function buildIhdrChunk(): Uint8Array {
  return buildChunk(
    "IHDR",
    Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]),
  );
}

/** Filter byte 0 + one black pixel, wrapped in a stored-block zlib stream. */
function buildIdatChunk(): Uint8Array {
  return buildChunk("IDAT", storedZlib(Uint8Array.from([0, 0])));
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function serializeKppPresetXml(options: KppPresetXmlOptions): string {
  const params = options.params
    .map(
      (param) =>
        `  <param name="${escapeXml(param.name)}" type="${escapeXml(param.type)}">${escapeXml(param.value)}</param>`,
    )
    .join("\n");
  const version = options.version ?? "5.0";
  return [
    `<Preset name="${escapeXml(options.name)}" paintopid="${escapeXml(options.paintopid)}" version="${escapeXml(version)}">`,
    params,
    "</Preset>",
  ].join("\n");
}

export function buildKppFile(options: KppFileOptions): Uint8Array {
  const chunks: Uint8Array[] = [buildIhdrChunk()];
  const metadataVersion =
    options.metadataVersion === undefined ? "2.2" : options.metadataVersion;
  if (metadataVersion !== null) {
    chunks.push(buildTextChunk("version", metadataVersion));
  }
  if (options.omitPreset !== true) {
    const kind = options.presetChunk ?? "tEXt";
    if (kind === "tEXt") {
      chunks.push(buildTextChunk("preset", options.presetXml));
    } else if (kind === "zTXt") {
      chunks.push(buildCompressedTextChunk("preset", options.presetXml));
    } else {
      chunks.push(buildInternationalTextChunk("preset", options.presetXml));
    }
  }
  for (const chunk of options.extraChunks ?? []) {
    chunks.push(chunk);
  }
  chunks.push(buildIdatChunk(), buildChunk("IEND", new Uint8Array(0)));
  const out: number[] = [...PNG_SIGNATURE];
  for (const chunk of chunks) {
    for (const byte of chunk) {
      out.push(byte);
    }
  }
  return Uint8Array.from(out);
}

// ---------------------------------------------------------------------------
// The three committed corpus fixtures
// ---------------------------------------------------------------------------

/** Escaped auto-brush definition shared by the paintbrush fixtures. */
const INK_BRUSH_DEFINITION =
  '<Brush type="auto_brush" spacing="0.18">' +
  '<MaskGenerator diameter="24" type="circle" hfade="0.85" vfade="0.75"/>' +
  "</Brush>";

/** paintbrush-ink-basic.kpp — flat pixel-brush values, no sensor curves. */
export function buildInkBasicKpp(): Uint8Array {
  return buildKppFile({
    presetXml: serializeKppPresetXml({
      name: "ToonSpectrum Ink Crisp",
      paintopid: "paintbrush",
      params: [
        { name: "brush_definition", type: "string", value: INK_BRUSH_DEFINITION },
        { name: "OpacityValue", type: "internal", value: "0.9" },
        { name: "FlowValue", type: "internal", value: "0.75" },
        { name: "EraserMode", type: "internal", value: "false" },
        { name: "CompositeOp", type: "string", value: "normal" },
        { name: "ColorSource", type: "string", value: "plain" },
      ],
    }),
  });
}

/** Sensor XML exactly as Krita escapes it into the param text. */
const PRESSURE_OPACITY_SENSOR =
  "<params><curve>0,0;0.5,0.25;1,1;</curve><sensor_type>pressure</sensor_type></params>";

/** paintbrush-pressure-curve.kpp — sensor curves in both supported spellings. */
export function buildPressureCurveKpp(): Uint8Array {
  return buildKppFile({
    presetXml: serializeKppPresetXml({
      name: "ToonSpectrum Pressure Sketch",
      paintopid: "paintbrush",
      params: [
        { name: "brush_definition", type: "string", value: INK_BRUSH_DEFINITION },
        { name: "OpacityValue", type: "internal", value: "1" },
        { name: "PressureOpacity", type: "internal", value: PRESSURE_OPACITY_SENSOR },
        // Bare curve-string spelling (older serializations).
        { name: "PressureSize", type: "internal", value: "0,0.1;1,1;" },
        { name: "EraserMode", type: "internal", value: "false" },
      ],
    }),
  });
}

/** The `.myb` v3 JSON Krita's MyPaint engine embeds as `mypaint_json`. */
export const MYPAINT_WASH_JSON = JSON.stringify({
  version: 3,
  group: "ToonSpectrum KPP Corpus",
  comment: "Soft wash delegated through the myb lane",
  settings: {
    radius_logarithmic: {
      base_value: 2.4,
      inputs: { pressure: [[0, -1.0], [1, 0.8]] },
    },
    opaque: { base_value: 0.7, inputs: { pressure: [[0, -0.5], [1, 0.2]] } },
    slow_tracking: { base_value: 4, inputs: {} },
    smudge: { base_value: 0.3, inputs: {} },
  },
});

/** mypaint-wash-soft.kpp — delegates settings to the existing myb importer. */
export function buildMypaintWashKpp(): Uint8Array {
  return buildKppFile({
    presetXml: serializeKppPresetXml({
      name: "ToonSpectrum MyPaint Wash",
      paintopid: "mypaintbrush",
      params: [
        { name: "mypaint_json", type: "string", value: MYPAINT_WASH_JSON },
        { name: "EraserMode", type: "internal", value: "false" },
      ],
    }),
  });
}
