import {
  decodeAbrPreviewBrushes,
  renderAbrStrokePreview,
} from "../../studio-format-gateway/src/abr-preview";
import { parseKppPreset } from "../../studio-format-gateway/src/kpp";
import { importMybBrush } from "../../studio-format-gateway/src/myb";

import { renderLibMypaintStroke } from "./libmypaint";
import { compileRasterBrush, renderCompiledBrushStroke } from "./raster-compile";

import type { LibMypaintBrushDocument } from "./libmypaint";
import type { LibMypaintRaw } from "./libmypaint/index";
import type { HokusaiModuleLike } from "./raster-compile";
import type { BrushProgramIR } from "@toonspectrum/studio-project-model";

/**
 * Unified brush preview lab — one API that renders a parsed external brush
 * (`.myb` / `.kpp` / `.abr`) through the REAL engine of its lane, on a shared
 * canvas, so the three import formats become visually comparable side by side.
 *
 * Engine routing table (the rule that fired is returned in `routing.reason`):
 *
 * | source                    | engine       | path                                             |
 * | ------------------------- | ------------ | ------------------------------------------------ |
 * | myb (default)             | libmypaint   | injection API reference lane (ADR-0011 lane 11)  |
 * | myb + mybEngine "hokusai" | hokusai      | challenger lane via `compileRasterBrush`         |
 * | kpp paintopid mypaintbrush| libmypaint   | embedded `mypaint_json` through the myb lane     |
 * | kpp paintopid paintbrush  | hokusai      | IR graphs lowered by `compileRasterBrush`        |
 * | kpp any other paintopid   | — (refused)  | explicit `unroutable-paintop` error with reason  |
 * | abr (v1/v2)               | abr-stamp    | gateway `renderAbrStrokePreview` dab stamping    |
 *
 * Shared preview spec:
 * - one canvas size for every lane (default 192×96, the fidelity-lab frame);
 * - the stroke lanes (libmypaint/hokusai) replay `standardZigzagStrokeSamples`
 *   — the standard linear 0→1 pressure-ramp zigzag every fidelity gate uses;
 * - the abr lane keeps its gateway-owned deterministic S-curve path with a
 *   smoothstep 0→1 pressure ramp (its renderer owns the path; same canvas,
 *   same left-to-right pressure direction, so previews stay comparable);
 * - output is one uniform pixel space: unpremultiplied RGBA8888 composited
 *   src-over onto `background` (default white), alpha always 255.
 *
 * Warnings policy (zero silent loss): every stage report is merged into
 * `warnings` verbatim, prefixed with its stage so provenance survives —
 * `parse[kpp|abr]` for gateway warnings/unmapped inventories,
 * `compile[hokusai]` for `compileRasterBrush` warnings/unmapped dimensions,
 * `inject[libmypaint]` for unknown settings/inputs during brush programming,
 * `render[abr-stamp]` for stamping-lane fallbacks. Deterministic order:
 * parse → compile/inject → render. The one deliberate exclusion is
 * `importMybBrush().unmappedSettings`: that list documents the VECTOR lane's
 * mapping table, while both raster preview engines re-derive authoritative
 * per-dimension reports from the full document — repeating it here would
 * misreport dimensions the preview engines do evaluate.
 *
 * Parsing stays gateway-owned. This module never re-implements a format: the
 * only local byte-walk is {@link extractKppPresetXml}, which relocates the
 * preset payload (and its `paintopid` / `mypaint_json` fields) out of a KPP
 * container `parseKppPreset` has ALREADY validated, because the gateway keeps
 * its PNG/XML internals module-private.
 */

export type BrushPreviewSource =
  | { format: "myb"; bytes: Uint8Array }
  | { format: "kpp"; bytes: Uint8Array }
  | { format: "abr"; bytes: Uint8Array; brushIndex?: number };

export type BrushPreviewEngine = "libmypaint" | "hokusai" | "abr-stamp";

export interface BrushPreviewEngines {
  /** Pinned libmypaint bridge (`await loadLibMypaint()`); reference lanes. */
  libmypaint?: LibMypaintRaw;
  /** Initialized studio-hokusai-wasm module; challenger/paintbrush lanes. */
  hokusai?: HokusaiModuleLike;
}

export interface RenderBrushPreviewOptions {
  /** Canvas width in px (default 192, clamped to ≥ 16, floored). */
  width?: number;
  /** Canvas height in px (default 96, clamped to ≥ 16, floored). */
  height?: number;
  /** Stroke-lane seed (default 7; the abr lane is seedless pure math). */
  seed?: number;
  /** Zigzag sample count for the stroke lanes (default 96). */
  sampleCount?: number;
  /** Injected engine modules — wasm loading stays the caller's concern. */
  engines?: BrushPreviewEngines;
  /** `.myb` lane selector: reference (default) or the Hokusai challenger. */
  mybEngine?: "libmypaint" | "hokusai";
  /** Background color, sRGB in [0, 1] (default white). */
  background?: { r: number; g: number; b: number };
}

export interface BrushPreviewRouting {
  format: BrushPreviewSource["format"];
  engine: BrushPreviewEngine;
  /** The routing-table rule that selected the engine, human-readable. */
  reason: string;
}

export interface BrushPreviewResult {
  /** Unpremultiplied RGBA8888 over `background`, row-major, alpha 255. */
  pixels: Uint8Array;
  width: number;
  height: number;
  engine: BrushPreviewEngine;
  routing: BrushPreviewRouting;
  /** Stage-prefixed parse/compile/inject/render reports, merged in order. */
  warnings: string[];
}

export type BrushPreviewErrorCode =
  | "missing-engine"
  | "unroutable-paintop"
  | "abr-no-brushes"
  | "abr-brush-index"
  | "kpp-extract";

export class BrushPreviewError extends Error {
  constructor(
    message: string,
    readonly code: BrushPreviewErrorCode,
  ) {
    super(message);
    this.name = "BrushPreviewError";
  }
}

/** Shared preview-spec defaults (the fidelity-lab canvas and stroke). */
export const BRUSH_PREVIEW_DEFAULTS = {
  width: 192,
  height: 96,
  seed: 7,
  sampleCount: 96,
} as const;

const MIN_PREVIEW_EDGE = 16;

const ROUTING_REASONS = {
  mybLibmypaint:
    "myb → libmypaint: `.myb` documents render on the pinned libmypaint reference lane (ADR-0011 lane 11) through the injection API",
  mybHokusai:
    "myb → hokusai: challenger lane requested via options.mybEngine; compileRasterBrush cross-checks the document against Hokusai-evaluated dimensions",
  kppMypaintbrush:
    "kpp(mypaintbrush) → libmypaint: the embedded mypaint_json is a `.myb` v3 document, delegated through the myb lane onto the reference engine",
  kppPaintbrush:
    "kpp(paintbrush) → hokusai: pixel-brush params map to BrushProgramIR graphs and lower through compileRasterBrush",
  abrStamp:
    "abr → abr-stamp: legacy v1/v2 tips render through the gateway's deterministic dab-stamping stroke preview",
} as const;

interface PreviewContext {
  width: number;
  height: number;
  seed: number;
  sampleCount: number;
  background: { r: number; g: number; b: number };
  engines: BrushPreviewEngines;
}

interface StrokeLaneRender {
  /** Straight-alpha RGBA8 engine frame (pre-composite). */
  frame: Uint8Array;
  warnings: string[];
}

function requireEngine<T>(
  engine: T | undefined,
  lane: string,
  hint: string,
): T {
  if (engine === undefined) {
    throw new BrushPreviewError(`${lane} needs ${hint}`, "missing-engine");
  }
  return engine;
}

function runLibmypaintLane(
  document: LibMypaintBrushDocument,
  context: PreviewContext,
  lane: string,
): StrokeLaneRender {
  const lmp = requireEngine(
    context.engines.libmypaint,
    lane,
    "the libmypaint engine; pass options.engines.libmypaint (await loadLibMypaint())",
  );
  const result = renderLibMypaintStroke(lmp, document, {
    width: context.width,
    height: context.height,
    seed: context.seed,
    sampleCount: context.sampleCount,
  });
  return {
    frame: result.frame,
    warnings: [
      ...result.settings.unknownSettings.map(
        (name) => `inject[libmypaint] unknown setting: ${name}`,
      ),
      ...result.settings.unknownInputs.map(
        (name) => `inject[libmypaint] unknown input: ${name}`,
      ),
    ],
  };
}

function runHokusaiLane(
  program: BrushProgramIR,
  context: PreviewContext,
  lane: string,
): StrokeLaneRender {
  const hokusai = requireEngine(
    context.engines.hokusai,
    lane,
    "the Hokusai engine; pass options.engines.hokusai (the initialized studio-hokusai-wasm module)",
  );
  const compiled = compileRasterBrush(program);
  const result = renderCompiledBrushStroke(hokusai, compiled, {
    width: context.width,
    height: context.height,
    seed: context.seed,
    sampleCount: context.sampleCount,
  });
  return {
    frame: result.frame,
    warnings: [
      ...compiled.warnings.map((warning) => `compile[hokusai]: ${warning}`),
      ...compiled.unmapped.map((entry) => `compile[hokusai] unmapped: ${entry}`),
    ],
  };
}

/** Straight-alpha src-over compositing onto the shared preview background. */
function compositeOverBackground(
  frame: Uint8Array,
  width: number,
  height: number,
  background: { r: number; g: number; b: number },
): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  const bgR = background.r * 255;
  const bgG = background.g * 255;
  const bgB = background.b * 255;
  for (let at = 0; at < width * height; at += 1) {
    const base = at * 4;
    const alpha = (frame[base + 3] ?? 0) / 255;
    pixels[base] = Math.round(bgR * (1 - alpha) + (frame[base] ?? 0) * alpha);
    pixels[base + 1] = Math.round(
      bgG * (1 - alpha) + (frame[base + 1] ?? 0) * alpha,
    );
    pixels[base + 2] = Math.round(
      bgB * (1 - alpha) + (frame[base + 2] ?? 0) * alpha,
    );
    pixels[base + 3] = 255;
  }
  return pixels;
}

function finishStrokeLane(
  format: BrushPreviewSource["format"],
  engine: BrushPreviewEngine,
  reason: string,
  lane: StrokeLaneRender,
  parseWarnings: readonly string[],
  context: PreviewContext,
): BrushPreviewResult {
  return {
    pixels: compositeOverBackground(
      lane.frame,
      context.width,
      context.height,
      context.background,
    ),
    width: context.width,
    height: context.height,
    engine,
    routing: { format, engine, reason },
    warnings: [...parseWarnings, ...lane.warnings],
  };
}

// ---------------------------------------------------------------------------
// KPP routing-field extraction (post-gateway-validation relocation only)
// ---------------------------------------------------------------------------

const LATIN1 = new TextDecoder("latin1");
const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true });

/** UTF-8-first with a Latin-1 fallback, mirroring the gateway's tEXt rule. */
function decodeTextPayload(bytes: Uint8Array): string {
  try {
    return UTF8_STRICT.decode(bytes);
  } catch {
    return LATIN1.decode(bytes);
  }
}

const XML_NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Same entity table the gateway's private XML parser uses. */
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

/**
 * Reads the `preset` tEXt payload out of a KPP container `parseKppPreset` has
 * ALREADY accepted: the signature, chunk CRCs and the tEXt-carried preset are
 * all validated there — this walk only relocates the payload the gateway
 * keeps module-private. First `preset` chunk wins, mirroring the gateway.
 */
function extractKppPresetXml(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8; // PNG signature (validated by the gateway)
  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, false);
    const type = LATIN1.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    if (type === "tEXt") {
      const data = bytes.subarray(dataStart, dataStart + length);
      const nul = data.indexOf(0);
      if (nul > 0 && LATIN1.decode(data.subarray(0, nul)) === "preset") {
        return decodeTextPayload(data.subarray(nul + 1));
      }
    }
    offset = dataStart + length + 4;
  }
  throw new BrushPreviewError(
    "KPP preset chunk vanished between gateway validation and preview routing",
    "kpp-extract",
  );
}

function extractKppPaintopid(presetXml: string): string {
  const openTag = /<Preset\b[^>]*>/.exec(presetXml)?.[0];
  const match = openTag
    ? /\bpaintopid\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(openTag)
    : null;
  const paintopid = match?.[1] ?? match?.[2];
  if (paintopid === undefined) {
    throw new BrushPreviewError(
      "KPP paintopid vanished between gateway validation and preview routing",
      "kpp-extract",
    );
  }
  return decodeXmlEntities(paintopid);
}

function extractKppMypaintJson(presetXml: string): string {
  const match =
    /<param\b[^>]*\bname\s*=\s*(?:"mypaint_json"|'mypaint_json')[^>]*>([\s\S]*?)<\/param>/.exec(
      presetXml,
    );
  const escaped = match?.[1];
  if (escaped === undefined) {
    throw new BrushPreviewError(
      "mypaintbrush preset lost its mypaint_json param between gateway validation and preview routing",
      "kpp-extract",
    );
  }
  return decodeXmlEntities(escaped);
}

// ---------------------------------------------------------------------------
// Per-format lanes
// ---------------------------------------------------------------------------

function renderMybPreview(
  bytes: Uint8Array,
  context: PreviewContext,
  mybEngine: "libmypaint" | "hokusai",
): BrushPreviewResult {
  const imported = importMybBrush(bytes, "brush-preview:myb", "brush-preview:myb");
  // imported.unmappedSettings is skipped by design — see the module doc
  // (vector-lane mapping table; both raster preview lanes re-derive their own
  // authoritative per-dimension reports from the full document below).
  if (mybEngine === "hokusai") {
    const lane = runHokusaiLane(imported.preset, context, "myb → hokusai");
    return finishStrokeLane(
      "myb",
      "hokusai",
      ROUTING_REASONS.mybHokusai,
      lane,
      [],
      context,
    );
  }
  const lane = runLibmypaintLane(imported.document, context, "myb → libmypaint");
  return finishStrokeLane(
    "myb",
    "libmypaint",
    ROUTING_REASONS.mybLibmypaint,
    lane,
    [],
    context,
  );
}

function renderKppPreview(
  bytes: Uint8Array,
  context: PreviewContext,
): BrushPreviewResult {
  const parsed = parseKppPreset(bytes);
  const parseWarnings = [
    ...parsed.warnings.map((warning) => `parse[kpp]: ${warning}`),
    ...parsed.unmapped.map((entry) => `parse[kpp] unmapped: ${entry}`),
  ];
  const presetXml = extractKppPresetXml(bytes);
  const paintopid = extractKppPaintopid(presetXml);
  if (paintopid === "mypaintbrush") {
    // Parsing stays gateway-owned: the embedded JSON re-enters the myb lane.
    const { document } = importMybBrush(
      new TextEncoder().encode(extractKppMypaintJson(presetXml)),
      parsed.program.id,
      parsed.presetName,
    );
    const lane = runLibmypaintLane(
      document,
      context,
      "kpp(mypaintbrush) → libmypaint",
    );
    return finishStrokeLane(
      "kpp",
      "libmypaint",
      ROUTING_REASONS.kppMypaintbrush,
      lane,
      parseWarnings,
      context,
    );
  }
  if (paintopid === "paintbrush") {
    const lane = runHokusaiLane(parsed.program, context, "kpp(paintbrush) → hokusai");
    return finishStrokeLane(
      "kpp",
      "hokusai",
      ROUTING_REASONS.kppPaintbrush,
      lane,
      parseWarnings,
      context,
    );
  }
  throw new BrushPreviewError(
    `kpp paintop "${paintopid}" has no preview engine route (routable: paintbrush → hokusai, mypaintbrush → libmypaint); ` +
      "the preset parsed cleanly and every parameter is preserved in its program sourcePayload",
    "unroutable-paintop",
  );
}

function renderAbrPreview(
  bytes: Uint8Array,
  brushIndex: number,
  context: PreviewContext,
): BrushPreviewResult {
  const decoded = decodeAbrPreviewBrushes(bytes);
  const parseWarnings = decoded.warnings.map((warning) => `parse[abr]: ${warning}`);
  if (decoded.brushes.length === 0) {
    throw new BrushPreviewError(
      `ABR v${decoded.version} file decoded to zero previewable brushes` +
        (decoded.warnings.length > 0 ? ` (${decoded.warnings.join("; ")})` : ""),
      "abr-no-brushes",
    );
  }
  const brush = Number.isInteger(brushIndex)
    ? decoded.brushes[brushIndex]
    : undefined;
  if (brushIndex < 0 || brush === undefined) {
    throw new BrushPreviewError(
      `brushIndex ${brushIndex} is out of range: the file decodes ${decoded.brushes.length} previewable brush(es) (valid: 0..${decoded.brushes.length - 1})`,
      "abr-brush-index",
    );
  }
  const preview = renderAbrStrokePreview(brush, {
    width: context.width,
    height: context.height,
    background: context.background,
  });
  return {
    pixels: preview.pixels,
    width: preview.width,
    height: preview.height,
    engine: "abr-stamp",
    routing: { format: "abr", engine: "abr-stamp", reason: ROUTING_REASONS.abrStamp },
    warnings: [
      ...parseWarnings,
      ...preview.warnings.map((warning) => `render[abr-stamp]: ${warning}`),
    ],
  };
}

/**
 * Render one deterministic brush preview for a `.myb` / `.kpp` / `.abr`
 * source through the real engine of its lane (routing table in the module
 * doc). Same input bytes + options → byte-identical pixels. Gateway parse
 * errors (`MybParseError` / `KppParseError` / `AbrParseError` /
 * `AbrPreviewError`) propagate untouched; routing-level failures throw
 * {@link BrushPreviewError} with an explicit reason — never a silent fallback.
 */
export function renderBrushPreview(
  source: BrushPreviewSource,
  options: RenderBrushPreviewOptions = {},
): BrushPreviewResult {
  const context: PreviewContext = {
    width: Math.max(
      MIN_PREVIEW_EDGE,
      Math.floor(options.width ?? BRUSH_PREVIEW_DEFAULTS.width),
    ),
    height: Math.max(
      MIN_PREVIEW_EDGE,
      Math.floor(options.height ?? BRUSH_PREVIEW_DEFAULTS.height),
    ),
    seed: options.seed ?? BRUSH_PREVIEW_DEFAULTS.seed,
    sampleCount: options.sampleCount ?? BRUSH_PREVIEW_DEFAULTS.sampleCount,
    background: options.background ?? { r: 1, g: 1, b: 1 },
    engines: options.engines ?? {},
  };
  if (source.format === "myb") {
    return renderMybPreview(source.bytes, context, options.mybEngine ?? "libmypaint");
  }
  if (source.format === "kpp") {
    return renderKppPreview(source.bytes, context);
  }
  return renderAbrPreview(source.bytes, source.brushIndex ?? 0, context);
}
