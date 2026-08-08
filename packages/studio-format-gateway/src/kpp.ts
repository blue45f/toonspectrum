import { brushProgramIRSchema } from "@toonspectrum/studio-project-model";

import { MybParseError, importMybBrush } from "./myb";

import type {
  BrushProgramIR,
  DynamicMappingIR,
} from "@toonspectrum/studio-project-model";

/**
 * Krita `.kpp` brush-preset importer (ADR-0011 lane 15: the Krita ENGINE is
 * rejected, only the FORMAT surface joins the gateway).
 *
 * A `.kpp` file is a standard PNG (the preset thumbnail) carrying the preset
 * definition as XML in a text chunk keyed `preset`:
 *
 *   PNG signature, then chunks `length(u32 BE) type(4) data crc32(type+data)`
 *   tEXt: `keyword NUL text` — Krita writes UTF-8 XML despite the spec's
 *   Latin-1 wording, so decoding is UTF-8-first with a Latin-1 fallback.
 *   zTXt: deflate-compressed text. This gateway is dependency-free and
 *   browser-portable (no `node:zlib`, no fflate in the tree), so a
 *   zTXt/iTXt-carried preset is refused LOUDLY with `unsupported-compression`
 *   instead of guessed at — and non-preset zTXt/iTXt chunks are surfaced in
 *   `unmapped`, never dropped silently (§ absolute rule 9).
 *
 * The XML is `<Preset name paintopid><param name type>value</param></Preset>`
 * with nested payloads (auto-brush definitions, sensor curves, MyPaint JSON)
 * escaped into the param text. Sensor curves use Krita's `x,y;x,y;...` point
 * list; cubic-spline interpolation between points is approximated linearly
 * (documented approximation, LUT taps stay monotone with the source curve).
 *
 * LICENSE NOTE: Krita itself is GPL. This module ports no Krita code — it
 * re-implements parsing of the on-disk DATA FORMAT from the PNG specification
 * and the publicly documented KPP container/param layout, which is not a
 * license-encumbered act. Every original byte travels in `sourcePayload`.
 */

export type KppParseErrorCode =
  | "not-png"
  | "truncated"
  | "crc-mismatch"
  | "missing-preset"
  | "unsupported-compression"
  | "malformed-preset";

export class KppParseError extends Error {
  constructor(
    message: string,
    readonly code: KppParseErrorCode,
  ) {
    super(message);
    this.name = "KppParseError";
  }
}

export interface KppImportResult {
  program: BrushProgramIR;
  /** Preset params/chunks/attrs with no IR mapping — surfaced, never dropped. */
  unmapped: string[];
  warnings: string[];
  presetName: string;
}

// ---------------------------------------------------------------------------
// PNG container walk
// ---------------------------------------------------------------------------

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

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface PngTextChunk {
  kind: "tEXt" | "zTXt" | "iTXt";
  keyword: string;
  /** Decoded text — tEXt only (zTXt/iTXt payloads are not inflated here). */
  text: string | null;
}

const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true });
const LATIN1 = new TextDecoder("latin1");

function decodeTextPayload(bytes: Uint8Array): string {
  try {
    return UTF8_STRICT.decode(bytes);
  } catch {
    // Spec-conformant Latin-1 tEXt from non-Krita writers.
    return LATIN1.decode(bytes);
  }
}

function keywordOf(data: Uint8Array): { keyword: string; rest: Uint8Array } | null {
  const nul = data.indexOf(0);
  if (nul <= 0) return null;
  return { keyword: LATIN1.decode(data.subarray(0, nul)), rest: data.subarray(nul + 1) };
}

function walkPngChunks(
  bytes: Uint8Array,
  warnings: string[],
): PngTextChunk[] {
  if (bytes.length < PNG_SIGNATURE.length) {
    throw new KppParseError("file shorter than the PNG signature", "not-png");
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      throw new KppParseError(
        "not a PNG container (KPP presets are PNG files with a `preset` text chunk)",
        "not-png",
      );
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const textChunks: PngTextChunk[] = [];
  let offset = PNG_SIGNATURE.length;
  let sawIhdr = false;
  let sawIend = false;

  while (!sawIend) {
    if (offset + 8 > bytes.length) {
      throw new KppParseError(
        `chunk header at byte ${offset} exceeds the file length (IEND never reached)`,
        "truncated",
      );
    }
    const length = view.getUint32(offset, false);
    const type = LATIN1.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    if (dataStart + length + 4 > bytes.length) {
      throw new KppParseError(
        `chunk ${type} at byte ${offset} exceeds the file length`,
        "truncated",
      );
    }
    const data = bytes.subarray(dataStart, dataStart + length);
    const stored = view.getUint32(dataStart + length, false);
    const computed = crc32(bytes.subarray(offset + 4, dataStart + length));
    if (stored !== computed) {
      throw new KppParseError(
        `chunk ${type} at byte ${offset} fails CRC32 (stored ${stored.toString(16)}, computed ${computed.toString(16)})`,
        "crc-mismatch",
      );
    }
    if (!sawIhdr) {
      if (type !== "IHDR") {
        warnings.push(`first chunk is ${type}, not IHDR (tolerated, thumbnail may be unreadable)`);
      }
      sawIhdr = true;
    }
    if (type === "IEND") {
      sawIend = true;
    } else if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const split = keywordOf(data);
      if (split === null) {
        warnings.push(`${type} chunk at byte ${offset} has no keyword; retained only in sourcePayload`);
      } else {
        textChunks.push({
          kind: type,
          keyword: split.keyword,
          text: type === "tEXt" ? decodeTextPayload(split.rest) : null,
        });
      }
    }
    // IHDR/IDAT/pHYs/… form the preset thumbnail; the IR has no thumbnail
    // slot, and the full container bytes travel in sourcePayload untouched.
    offset = dataStart + length + 4;
  }
  if (offset < bytes.length) {
    warnings.push(`${bytes.length - offset} trailing byte(s) after IEND ignored (retained in sourcePayload)`);
  }
  return textChunks;
}

// ---------------------------------------------------------------------------
// Mini XML parser (elements + attributes + text content)
// ---------------------------------------------------------------------------
// svg.ts carries a sibling parser, but it is module-private and discards text
// content, which KPP params depend on — hence this local implementation.

interface KppXmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: KppXmlElement[];
  text: string;
}

const XML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return XML_NAMED_ENTITIES[body] ?? whole;
  });
}

function xmlFail(message: string): never {
  throw new KppParseError(`preset XML: ${message}`, "malformed-preset");
}

const XML_NAME_CHAR = /[A-Za-z0-9_.:-]/;

function isXmlWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function readXmlName(text: string, at: number): { name: string; next: number } {
  let index = at;
  while (index < text.length && XML_NAME_CHAR.test(text[index] ?? "")) {
    index += 1;
  }
  if (index === at) xmlFail(`expected an XML name at offset ${at}`);
  return { name: text.slice(at, index), next: index };
}

function readXmlAttributes(
  text: string,
  at: number,
  attrs: Record<string, string>,
): number {
  let index = at;
  for (;;) {
    while (isXmlWhitespace(text[index])) index += 1;
    const ch = text[index];
    if (ch === undefined) xmlFail("unexpected end of input inside a tag");
    if (ch === ">" || ch === "/") return index;
    const name = readXmlName(text, index);
    index = name.next;
    while (isXmlWhitespace(text[index])) index += 1;
    if (text[index] !== "=") xmlFail(`attribute "${name.name}" is missing "="`);
    index += 1;
    while (isXmlWhitespace(text[index])) index += 1;
    const quote = text[index];
    if (quote !== '"' && quote !== "'") {
      xmlFail(`attribute "${name.name}" value must be quoted`);
    }
    const valueEnd = text.indexOf(quote, index + 1);
    if (valueEnd < 0) xmlFail(`unterminated value for attribute "${name.name}"`);
    attrs[name.name] = decodeXmlEntities(text.slice(index + 1, valueEnd));
    index = valueEnd + 1;
  }
}

function parseKppXml(text: string): KppXmlElement {
  const stack: KppXmlElement[] = [];
  let root: KppXmlElement | null = null;
  let index = 0;

  const appendText = (raw: string): void => {
    const parent = stack[stack.length - 1];
    if (parent && raw.length > 0) parent.text += decodeXmlEntities(raw);
  };

  while (index < text.length) {
    const lt = text.indexOf("<", index);
    if (lt < 0) {
      appendText(text.slice(index));
      break;
    }
    appendText(text.slice(index, lt));
    const next = text[lt + 1];
    if (next === "!") {
      if (text.startsWith("<!--", lt)) {
        const end = text.indexOf("-->", lt + 4);
        if (end < 0) xmlFail("unterminated comment");
        index = end + 3;
      } else if (text.startsWith("<![CDATA[", lt)) {
        const end = text.indexOf("]]>", lt + 9);
        if (end < 0) xmlFail("unterminated CDATA section");
        const parent = stack[stack.length - 1];
        if (parent) parent.text += text.slice(lt + 9, end);
        index = end + 3;
      } else {
        const end = text.indexOf(">", lt);
        if (end < 0) xmlFail("unterminated markup declaration");
        index = end + 1;
      }
      continue;
    }
    if (next === "?") {
      const end = text.indexOf("?>", lt + 2);
      if (end < 0) xmlFail("unterminated processing instruction");
      index = end + 2;
      continue;
    }
    if (next === "/") {
      const { name, next: afterName } = readXmlName(text, lt + 2);
      let cursor = afterName;
      while (isXmlWhitespace(text[cursor])) cursor += 1;
      if (text[cursor] !== ">") xmlFail(`malformed closing tag </${name}>`);
      index = cursor + 1;
      const open = stack.pop();
      if (open === undefined) xmlFail(`closing tag </${name}> without a matching open tag`);
      if (open.tag !== name) xmlFail(`closing tag </${name}> does not match <${open.tag}>`);
      continue;
    }
    const { name, next: afterName } = readXmlName(text, lt + 1);
    const element: KppXmlElement = { tag: name, attrs: {}, children: [], text: "" };
    let cursor = readXmlAttributes(text, afterName, element.attrs);
    const selfClosing = text[cursor] === "/";
    if (selfClosing) cursor += 1;
    if (text[cursor] !== ">") xmlFail(`malformed tag <${element.tag}>`);
    index = cursor + 1;

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(element);
    } else if (root === null) {
      root = element;
    } else {
      xmlFail("multiple root elements");
    }
    if (!selfClosing) stack.push(element);
  }

  const unclosed = stack[stack.length - 1];
  if (unclosed) xmlFail(`unclosed tag <${unclosed.tag}>`);
  if (root === null) xmlFail("no root element found");
  return root;
}

function findXmlElement(root: KppXmlElement, tag: string): KppXmlElement | null {
  if (root.tag === tag) return root;
  for (const child of root.children) {
    const found = findXmlElement(child, tag);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Krita sensor curves — "x,y;x,y;..." point lists, sampled into IR LUTs
// ---------------------------------------------------------------------------

const CURVE_LUT_TAPS = 8;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseCurvePoints(raw: string): Array<[number, number]> | null {
  const points: Array<[number, number]> = [];
  for (const pair of raw.split(";")) {
    const trimmed = pair.trim();
    if (trimmed.length === 0) continue;
    const parts = trimmed.split(",");
    if (parts.length !== 2) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push([x, y]);
  }
  return points.length >= 2 ? points : null;
}

/** Linear resampling of the point list onto a uniform [0,1] LUT. */
function curvePointsToLut(points: Array<[number, number]>): number[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const lut: number[] = [];
  for (let index = 0; index < CURVE_LUT_TAPS; index += 1) {
    const x = index / (CURVE_LUT_TAPS - 1);
    lut.push(clamp01(curveValueAt(sorted, x)));
  }
  return lut;
}

function curveValueAt(sorted: Array<[number, number]>, x: number): number {
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let seg = 0; seg + 1 < sorted.length; seg += 1) {
    const a = sorted[seg];
    const b = sorted[seg + 1];
    if (!a || !b) continue;
    if (x <= b[0]) {
      const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return last[1];
}

interface SensorCurve {
  sensorType: string;
  lut: number[];
}

/**
 * A sensor param value is either a bare curve string ("0,0;1,1;") or escaped
 * sensor XML whose `<curve>` child carries the same string (with an optional
 * `<sensor_type>`/`id` naming the input).
 */
function parseSensorParamValue(value: string): SensorCurve | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("<")) {
    const points = parseCurvePoints(trimmed);
    return points ? { sensorType: "pressure", lut: curvePointsToLut(points) } : null;
  }
  let root: KppXmlElement;
  try {
    root = parseKppXml(trimmed);
  } catch {
    return null;
  }
  const curveEl = findXmlElement(root, "curve");
  if (!curveEl) return null;
  const points = parseCurvePoints(curveEl.text);
  if (!points) return null;
  const typeEl = findXmlElement(root, "sensor_type");
  const sensorType = (typeEl?.text.trim() || root.attrs["id"] || "pressure").toLowerCase();
  return { sensorType, lut: curvePointsToLut(points) };
}

// ---------------------------------------------------------------------------
// paintopid mapping lanes
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  // Browser-portable (FormatGateway runs in the import UI): chunked to stay
  // under argument-count limits for large payloads.
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return globalThis.btoa(binary);
}

interface PresetParam {
  name: string;
  value: string;
}

interface MappingSink {
  unmapped: Set<string>;
  warnings: string[];
}

function constantMapping(value: number): DynamicMappingIR {
  const v = clamp01(value);
  return { input: "constant", curve: [v, v], min: 0, max: 1 };
}

function pressureMapping(lut: number[]): DynamicMappingIR {
  return { input: "pressure", curve: lut, min: 0, max: 1 };
}

/** Krita's stock UI caps brush diameter at 1000px; used only to normalize. */
const KRITA_REFERENCE_MAX_DIAMETER_PX = 1000;

interface PaintbrushTipState {
  spacingPct?: number;
  hardness?: number;
}

function mapBrushDefinition(
  value: string,
  sink: MappingSink,
  sizeDynamics: DynamicMappingIR[],
  tip: PaintbrushTipState,
): void {
  let brush: KppXmlElement;
  try {
    brush = parseKppXml(value);
  } catch {
    sink.warnings.push(
      "brush_definition XML failed to parse; original text preserved in sourcePayload",
    );
    sink.unmapped.add("brush_definition");
    return;
  }
  if (brush.tag !== "Brush") {
    sink.warnings.push(`brush_definition root is <${brush.tag}>, expected <Brush>; left unmapped`);
    sink.unmapped.add("brush_definition");
    return;
  }
  const spacingRaw = brush.attrs["spacing"];
  if (spacingRaw !== undefined) {
    const spacing = Number(spacingRaw);
    if (Number.isFinite(spacing) && spacing > 0) {
      tip.spacingPct = Math.min(1000, Math.max(1, spacing * 100));
    } else {
      sink.warnings.push(`brush_definition spacing "${spacingRaw}" is not a positive number; default kept`);
    }
  }
  const brushType = brush.attrs["type"];
  if (brushType !== undefined && brushType !== "auto_brush") {
    // Predefined (sampled-tip) brushes need the pixel-tip asset lane; the tip
    // bitmap stays intact inside sourcePayload until that lane ships.
    sink.warnings.push(
      `brush_definition type "${brushType}" carries a sampled tip; tip pixels await the pixel-tip lane`,
    );
    sink.unmapped.add(`brush_definition.type:${brushType}`);
  }
  const mask = findXmlElement(brush, "MaskGenerator");
  if (!mask) {
    if (brushType === "auto_brush" || brushType === undefined) {
      sink.warnings.push("brush_definition has no MaskGenerator; size/hardness defaults kept");
    }
    return;
  }
  const diameterRaw = mask.attrs["diameter"];
  if (diameterRaw !== undefined) {
    const diameter = Number(diameterRaw);
    if (Number.isFinite(diameter) && diameter > 0) {
      if (diameter > KRITA_REFERENCE_MAX_DIAMETER_PX) {
        sink.warnings.push(
          `brush diameter ${diameter}px exceeds the ${KRITA_REFERENCE_MAX_DIAMETER_PX}px normalization reference; clamped`,
        );
      }
      // The IR has no absolute base-size field: the base size rides as a
      // constant size mapping normalized against Krita's stock 1000px cap.
      sizeDynamics.push(constantMapping(diameter / KRITA_REFERENCE_MAX_DIAMETER_PX));
    } else {
      sink.warnings.push(`MaskGenerator diameter "${diameterRaw}" is not a positive number; ignored`);
    }
  }
  const hfade = Number(mask.attrs["hfade"] ?? Number.NaN);
  const vfade = Number(mask.attrs["vfade"] ?? Number.NaN);
  const fades = [hfade, vfade].filter((fade) => Number.isFinite(fade));
  if (fades.length > 0) {
    // Approximation: Krita's h/v fade (0..1) averaged into the round-tip
    // hardness knob. Elliptical (h≠v) softness collapses to the mean.
    tip.hardness = clamp01(fades.reduce((sum, fade) => sum + fade, 0) / fades.length);
    if (fades.length === 2 && Math.abs(hfade - vfade) > 1e-6) {
      sink.warnings.push("MaskGenerator hfade/vfade differ; averaged into a single hardness");
    }
  }
}

const SIZE_SENSOR_PARAMS = new Set(["PressureSize", "SizeSensor"]);
const FLOW_SENSOR_PARAMS = new Set([
  "PressureOpacity",
  "OpacitySensor",
  "PressureFlow",
  "FlowSensor",
]);
const CONSTANT_FLOW_PARAMS = new Set(["OpacityValue", "FlowValue"]);

function mapSensorParam(
  param: PresetParam,
  sink: MappingSink,
  target: DynamicMappingIR[],
): void {
  const parsed = parseSensorParamValue(param.value);
  if (parsed === null) {
    sink.warnings.push(
      `param ${param.name}: sensor curve "${param.value.slice(0, 64)}" is unparseable; raw value preserved in sourcePayload`,
    );
    sink.unmapped.add(param.name);
    return;
  }
  if (parsed.sensorType !== "pressure") {
    // Only the pressure input is wired today (tilt/speed/fuzzy lanes pending).
    sink.warnings.push(
      `param ${param.name}: sensor type "${parsed.sensorType}" is not wired yet; curve left unmapped`,
    );
    sink.unmapped.add(`${param.name}(${parsed.sensorType})`);
    return;
  }
  target.push(pressureMapping(parsed.lut));
}

function mapConstantFlowParam(param: PresetParam, sink: MappingSink, flowDynamics: DynamicMappingIR[]): void {
  const value = Number(param.value.trim());
  if (!Number.isFinite(value)) {
    sink.warnings.push(`param ${param.name}: value "${param.value}" is not a number; left unmapped`);
    sink.unmapped.add(param.name);
    return;
  }
  if (value < 0 || value > 1) {
    sink.warnings.push(`param ${param.name}: value ${value} clamped into [0,1]`);
  }
  // The IR has no scalar opacity/flow: each rides as a constant flow mapping
  // (constant mappings multiply through the dynamics chain, so Opacity and
  // Flow stay individually traceable instead of being pre-multiplied).
  flowDynamics.push(constantMapping(value));
}

/** Params consumed as documented no-ops when they hold their default value. */
function mapDefaultOnlyParam(param: PresetParam, sink: MappingSink): void {
  if (param.name === "EraserMode") {
    if (param.value.trim() !== "false") {
      sink.warnings.push("EraserMode=true has no IR representation; imported as a paint preset");
      sink.unmapped.add("EraserMode");
    }
    return;
  }
  // CompositeOp: "normal" is the src-over default; anything else is loss.
  if (param.value.trim() !== "normal") {
    sink.warnings.push(`CompositeOp "${param.value}" is not representable; src-over used`);
    sink.unmapped.add(`CompositeOp:${param.value.trim()}`);
  }
}

interface LaneOutput {
  sizeDynamics: DynamicMappingIR[];
  flowDynamics: DynamicMappingIR[];
  tip: PaintbrushTipState;
  providerPreference: string[];
}

function mapPaintbrushParams(params: readonly PresetParam[], sink: MappingSink): LaneOutput {
  const sizeDynamics: DynamicMappingIR[] = [];
  const flowDynamics: DynamicMappingIR[] = [];
  const tip: PaintbrushTipState = {};
  for (const param of params) {
    if (param.name === "brush_definition") {
      mapBrushDefinition(param.value, sink, sizeDynamics, tip);
    } else if (CONSTANT_FLOW_PARAMS.has(param.name)) {
      mapConstantFlowParam(param, sink, flowDynamics);
    } else if (SIZE_SENSOR_PARAMS.has(param.name)) {
      mapSensorParam(param, sink, sizeDynamics);
    } else if (FLOW_SENSOR_PARAMS.has(param.name)) {
      mapSensorParam(param, sink, flowDynamics);
    } else if (param.name === "EraserMode" || param.name === "CompositeOp") {
      mapDefaultOnlyParam(param, sink);
    } else {
      sink.unmapped.add(param.name);
    }
  }
  return { sizeDynamics, flowDynamics, tip, providerPreference: ["hokusai-natural-media"] };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function extractPresetXml(textChunks: readonly PngTextChunk[], sink: MappingSink): string {
  let presetXml: string | null = null;
  for (const chunk of textChunks) {
    if (chunk.keyword === "preset") {
      if (chunk.kind !== "tEXt") {
        throw new KppParseError(
          `preset payload is stored as ${chunk.kind}; the dependency-free gateway reads tEXt only ` +
            "(no inflate available in this browser-portable lane) — re-save the preset uncompressed",
          "unsupported-compression",
        );
      }
      if (presetXml !== null) {
        sink.warnings.push("multiple `preset` tEXt chunks; the first one wins");
        continue;
      }
      presetXml = chunk.text ?? "";
      continue;
    }
    // Non-preset text chunks (`version`, tool metadata, …) have no IR slot.
    sink.unmapped.add(`chunk:${chunk.kind}(${chunk.keyword})`);
  }
  if (presetXml === null) {
    throw new KppParseError(
      "no `preset` tEXt chunk found — not a Krita brush preset (or preset metadata was stripped)",
      "missing-preset",
    );
  }
  return presetXml;
}

function collectPresetParams(
  presetEl: KppXmlElement,
  sink: MappingSink,
): PresetParam[] {
  const params: PresetParam[] = [];
  for (const child of presetEl.children) {
    if (child.tag === "param") {
      const name = child.attrs["name"];
      if (name === undefined || name.length === 0) {
        sink.warnings.push("param element without a name attribute; retained only in sourcePayload");
        continue;
      }
      params.push({ name, value: child.text });
    } else {
      // e.g. <resources> embedded-resource manifests (Krita 5).
      sink.unmapped.add(`element:${child.tag}`);
    }
  }
  return params;
}

function collectPresetAttrs(presetEl: KppXmlElement, sink: MappingSink): void {
  for (const attr of Object.keys(presetEl.attrs)) {
    if (attr !== "name" && attr !== "paintopid" && attr !== "version") {
      sink.unmapped.add(`attr:${attr}`);
    }
  }
}

function importDelegatedMypaint(
  params: readonly PresetParam[],
  sink: MappingSink,
  presetId: string,
  presetName: string,
): ReturnType<typeof importMybBrush> {
  const jsonParam = params.find((param) => param.name === "mypaint_json");
  if (jsonParam === undefined) {
    throw new KppParseError(
      "mypaintbrush preset is missing the mypaint_json parameter; refusing a lossy default import",
      "malformed-preset",
    );
  }
  for (const param of params) {
    if (param.name === "mypaint_json") continue;
    if (param.name === "EraserMode" && param.value.trim() === "false") continue;
    sink.unmapped.add(param.name);
  }
  try {
    // Delegation, not duplication: the embedded `.myb` v3 JSON goes through
    // the existing myb lane so both formats share one mapping space.
    return importMybBrush(new TextEncoder().encode(jsonParam.value), presetId, presetName);
  } catch (error) {
    if (error instanceof MybParseError) {
      throw new KppParseError(
        `mypaint_json rejected by the myb lane: ${error.message}`,
        "malformed-preset",
      );
    }
    throw error;
  }
}

export function parseKppPreset(bytes: Uint8Array): KppImportResult {
  const warnings: string[] = [];
  const sink: MappingSink = { unmapped: new Set<string>(), warnings };
  const textChunks = walkPngChunks(bytes, warnings);
  const presetXml = extractPresetXml(textChunks, sink);
  const presetEl = parseKppXml(presetXml);
  if (presetEl.tag !== "Preset") {
    throw new KppParseError(
      `preset XML root is <${presetEl.tag}>, expected <Preset>`,
      "malformed-preset",
    );
  }
  const paintopid = presetEl.attrs["paintopid"];
  if (paintopid === undefined || paintopid.length === 0) {
    throw new KppParseError("Preset element is missing paintopid", "malformed-preset");
  }
  let presetName = presetEl.attrs["name"] ?? "";
  if (presetName.length === 0) {
    warnings.push("Preset element has no name; fallback name assigned");
    presetName = "untitled-kpp-preset";
  }
  const presetId = `kpp:${presetName}`;
  collectPresetAttrs(presetEl, sink);
  const params = collectPresetParams(presetEl, sink);
  const sourcePayload = { format: "krita-kpp", base64: bytesToBase64(bytes) };

  let program: BrushProgramIR;
  if (paintopid === "paintbrush") {
    const lane = mapPaintbrushParams(params, sink);
    program = brushProgramIRSchema.parse({
      id: presetId,
      name: presetName,
      sizeDynamics: lane.sizeDynamics,
      flowDynamics: lane.flowDynamics,
      tip: {
        kind: "round",
        hardness: lane.tip.hardness ?? 1,
        spacingPct: lane.tip.spacingPct ?? 10,
        angleJitterDeg: 0,
      },
      providerPreference: lane.providerPreference,
      sourcePayload,
    });
  } else if (paintopid === "mypaintbrush") {
    const delegated = importDelegatedMypaint(params, sink, presetId, presetName);
    for (const setting of delegated.unmappedSettings) {
      sink.unmapped.add(`mypaint:${setting}`);
    }
    // Re-parent the payload: the KPP container (not just the inner JSON) is
    // the original document the zero-loss contract preserves.
    program = brushProgramIRSchema.parse({ ...delegated.preset, sourcePayload });
  } else {
    // colorsmudge / sketch / hatching / …: a program shell is produced so the
    // preset stays addressable, but every engine-specific parameter is
    // surfaced as unmapped — nothing is guessed, nothing silently dropped.
    if (paintopid === "colorsmudge") {
      warnings.push(
        "colorsmudge engine parameters are retained but unwired until the smudge lane ships",
      );
    } else {
      warnings.push(
        `paintop "${paintopid}" has no dedicated mapping lane yet; all ${params.length} parameter(s) surfaced as unmapped`,
      );
    }
    for (const param of params) {
      sink.unmapped.add(param.name);
    }
    program = brushProgramIRSchema.parse({
      id: presetId,
      name: presetName,
      providerPreference: [],
      sourcePayload,
    });
  }

  return {
    program,
    // Default (code-unit) sort: locale-independent, deterministic everywhere.
    unmapped: [...sink.unmapped].sort(),
    warnings,
    presetName,
  };
}
