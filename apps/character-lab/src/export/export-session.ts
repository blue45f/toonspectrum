/**
 * 출력 오케스트레이션: ExportPanel → (settle) → engine.renderPasses(요청 해상도) → raster → PNG | PSD | GLB | 레시피.
 * 출력 크기는 항상 옵션의 width/height다(뷰포트 크기 유도 금지). 모든 실패는 LabFailure로 돌려준다.
 */
import { DEFAULT_FRAMING, failVisible, isLabFailure, recipeDigest } from "../contracts";

import { encodePng, PNG_MIME } from "./png-encoder";
import { assemblePsd, PSD_MIME } from "./psd-assemble";
import { PSD_MAX_DIMENSION, planCharacterPsd } from "./psd-plan";
import { RECIPE_MIME, embedPaintLayers, recipeFileName, serializeRecipe } from "./recipe-file";

import type { CameraFraming, CaptureProvenance, CaptureRequest, CharacterEngine, CharacterRecipe, LabFailure, PaintLayer, RenderPassId } from "../contracts";
import type { LineArtOptions } from "./line-extract";
import type { PsdPlanReceipt } from "./psd-plan";

export const GLB_MIME = "model/gltf-binary";
export const MIN_EXPORT_DIMENSION = 16;
export const MAX_PNG_EXPORT_DIMENSION = 4096;
export const MAX_PSD_EXPORT_DIMENSION = PSD_MAX_DIMENSION;
export const MAX_SETTLE_STEPS = 600;

export type ExportKind = "png" | "psd" | "glb" | "recipe";

export interface ExportCaptureOptions {
  readonly width: number;
  readonly height: number;
  readonly framing?: CameraFraming;
  /** 캡처 전 물리 settle 스텝(0 = 없음) */
  readonly settleSteps?: number;
}

export interface ExportPsdOptions extends ExportCaptureOptions {
  readonly includeIdMasks: boolean;
  readonly includeReferencePasses: boolean;
  readonly lineArt?: Partial<LineArtOptions>;
}

export interface ExportReceipt {
  readonly kind: ExportKind;
  readonly fileName: string;
  readonly mime: string;
  readonly bytes: number;
  readonly width?: number;
  readonly height?: number;
  readonly settleSteps?: number;
  readonly provenance?: CaptureProvenance;
  readonly psd?: PsdPlanReceipt;
  readonly durationMs: number;
}

export type ExportOutcome = { readonly ok: true; readonly bytes: Uint8Array; readonly receipt: ExportReceipt } | { readonly ok: false; readonly failure: LabFailure };

export interface ExportDeps {
  readonly now?: () => number;
}

const defaultNow = (): number => Date.now();

export function validateExportDimensions(width: number, height: number, max: number, now?: number): LabFailure | null {
  const ok = (v: number): boolean => Number.isInteger(v) && v >= MIN_EXPORT_DIMENSION && v <= max;
  if (!ok(width) || !ok(height)) {
    return failVisible("export-size", `출력 크기 ${width}×${height}는 ${MIN_EXPORT_DIMENSION}..${max}px 정수여야 합니다.`, undefined, now);
  }
  return null;
}

export function exportFileName(kind: Exclude<ExportKind, "recipe">, digest: string, width: number, height: number): string {
  const suffix = kind === "glb" ? "glb" : kind;
  const size = kind === "glb" ? "" : `-${width}x${height}`;
  return `character-${digest.slice(0, 8)}${size}.${suffix}`;
}

export function buildCaptureRequest(options: ExportCaptureOptions, passes: readonly RenderPassId[]): CaptureRequest {
  return {
    width: options.width,
    height: options.height,
    passes,
    transparentBackground: true,
    settleSteps: Math.min(MAX_SETTLE_STEPS, Math.max(0, Math.floor(options.settleSteps ?? 0))),
    camera: options.framing ?? DEFAULT_FRAMING,
  };
}

function toFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

/** glTF 2.0 바이너리 매직 "glTF" + version 2 */
export function isGlb(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2;
}

async function capture(engine: CharacterEngine, options: ExportCaptureOptions, passes: readonly RenderPassId[], now: number) {
  const request = buildCaptureRequest(options, passes);
  if (request.settleSteps > 0) {
    try {
      await engine.settle(request.settleSteps);
    } catch (error) {
      return { ok: false as const, failure: toFailure("export-settle", "캡처 전 물리 settle에 실패했습니다.", error, now) };
    }
  }
  try {
    const result = await engine.renderPasses(request);
    if (result.width !== request.width || result.height !== request.height) {
      return {
        ok: false as const,
        failure: failVisible("export-capture-size", `엔진이 요청 크기 ${request.width}×${request.height} 대신 ${result.width}×${result.height}를 돌려줬습니다.`, undefined, now),
      };
    }
    return { ok: true as const, result, request };
  } catch (error) {
    return { ok: false as const, failure: toFailure("export-capture", "멀티패스 캡처에 실패했습니다.", error, now) };
  }
}

/** 투명 배경 PNG(lit 패스). */
export async function exportTransparentPng(engine: CharacterEngine, options: ExportCaptureOptions, deps: ExportDeps = {}): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const sizeFailure = validateExportDimensions(options.width, options.height, MAX_PNG_EXPORT_DIMENSION, started);
  if (sizeFailure) return { ok: false, failure: sizeFailure };
  const captured = await capture(engine, options, ["lit"], started);
  if (!captured.ok) return captured;
  const lit = captured.result.passes.lit;
  if (!lit) return { ok: false, failure: failVisible("export-missing-lit", "엔진이 lit 패스를 돌려주지 않았습니다.", undefined, started) };
  try {
    const bytes = await encodePng(lit, { filter: "adaptive" });
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "png",
        fileName: exportFileName("png", captured.result.provenance.recipeDigest, lit.width, lit.height),
        mime: PNG_MIME,
        bytes: bytes.length,
        width: lit.width,
        height: lit.height,
        settleSteps: captured.request.settleSteps,
        provenance: captured.result.provenance,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toFailure("export-png-encode", "PNG 인코딩에 실패했습니다.", error, started) };
  }
}

/** 레이어 PSD(flat·lit·normal·depth·part-id 캡처 → tone-split·line-extract·ID 마스크·페인트). */
export async function exportLayeredPsd(engine: CharacterEngine, paintLayers: readonly PaintLayer[], options: ExportPsdOptions, deps: ExportDeps = {}): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const sizeFailure = validateExportDimensions(options.width, options.height, MAX_PSD_EXPORT_DIMENSION, started);
  if (sizeFailure) return { ok: false, failure: sizeFailure };
  const passes: RenderPassId[] = ["flat", "lit", "normal", "depth", "part-id"];
  const captured = await capture(engine, options, passes, started);
  if (!captured.ok) return captured;
  const planned = planCharacterPsd(
    captured.result,
    paintLayers,
    { includeIdMasks: options.includeIdMasks, includeReferencePasses: options.includeReferencePasses, ...(options.lineArt ? { lineArt: options.lineArt } : {}) },
    started,
  );
  if (!planned.ok) return planned;
  try {
    const bytes = assemblePsd(planned.plan);
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "psd",
        fileName: exportFileName("psd", captured.result.provenance.recipeDigest, planned.plan.width, planned.plan.height),
        mime: PSD_MIME,
        bytes: bytes.length,
        width: planned.plan.width,
        height: planned.plan.height,
        settleSteps: captured.request.settleSteps,
        provenance: captured.result.provenance,
        psd: planned.plan.receipt,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toFailure("export-psd-assemble", "PSD 조립에 실패했습니다.", error, started) };
  }
}

/** GLB(엔진 포트 exportGlb). 매직 검사만 하고 내용은 엔진이 책임진다. */
export async function exportGlb(engine: CharacterEngine, recipe: CharacterRecipe, deps: ExportDeps = {}): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  try {
    const bytes = await engine.exportGlb();
    if (!isGlb(bytes)) {
      return { ok: false, failure: failVisible("export-glb-invalid", "엔진이 돌려준 바이트가 glTF 2.0 바이너리(GLB)가 아닙니다.", undefined, started) };
    }
    return {
      ok: true,
      bytes,
      receipt: { kind: "glb", fileName: exportFileName("glb", recipeDigest(recipe), 0, 0), mime: GLB_MIME, bytes: bytes.length, durationMs: now() - started },
    };
  } catch (error) {
    return { ok: false, failure: toFailure("export-glb", "GLB 내보내기에 실패했습니다.", error, started) };
  }
}

/** 레시피 JSON(페인트 레이어 PNG base64 포함, UTF-8). */
export async function exportRecipe(recipe: CharacterRecipe, paintLayers: readonly PaintLayer[], deps: ExportDeps = {}): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  try {
    const embedded = await embedPaintLayers(recipe, paintLayers);
    const text = serializeRecipe(embedded);
    const bytes = new TextEncoder().encode(text);
    return {
      ok: true,
      bytes,
      receipt: { kind: "recipe", fileName: recipeFileName(embedded, new Date(started)), mime: RECIPE_MIME, bytes: bytes.length, durationMs: now() - started },
    };
  } catch (error) {
    return { ok: false, failure: toFailure("export-recipe", "레시피 직렬화에 실패했습니다.", error, started) };
  }
}
