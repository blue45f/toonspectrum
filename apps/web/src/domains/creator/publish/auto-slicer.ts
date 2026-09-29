/**
 * Publish Auto-Slicer — 회차 이미지 자동 최적화(리사이즈 · 슬라이싱 · 용량 맞춤).
 *
 * 규격을 어긴 원고를 플랫폼에 그대로 올리면 플랫폼이 강제 압축·슬라이싱을 걸어
 * 화질이 망가진다. 이 모듈은 "자동 최적화" 한 번으로 규격에 맞는 산출물을 만든다:
 *
 * 1. 규격 폭으로 리사이즈(확대는 하지 않는다 — 키우면 화질만 나빠진다)
 * 2. 규격 세로 단위로 슬라이싱
 * 3. 장당 용량 한도에 맞게 JPEG/WebP 품질 계단으로 인코딩
 *
 * 계획(박스 좌표·목표 크기·품질 계단)은 순수 함수라 node 단위 테스트가 가능하고,
 * 브라우저 Canvas를 만지는 실행부는 의존성 주입(createCanvas·encode)으로 테스트한다.
 * 기본 encode는 export/studio-export의 canvasToBlob을 쓴다.
 *
 * 사용자 노출 문자열은 한글.
 */

import { canvasToBlob, type ExportFormat } from "../export/studio-export";
import type { PublishSpecPreset, PublishSpecPresetId } from "./spec-validator";

export interface PublishSliceBox {
  index: number;
  /** 스트립(리사이즈 후) 기준 시작 y(px). */
  y: number;
  /** 박스 높이(px). */
  height: number;
}

/**
 * 스트립 전체 세로를 sliceHeight 단위로 자른 박스 목록. 마지막 칸은 남은 높이.
 * stripHeight<=0 또는 sliceHeight<=0 이면 [].
 */
export function planPublishSliceBoxes(
  stripHeight: number,
  sliceHeight: number
): PublishSliceBox[] {
  if (stripHeight <= 0 || sliceHeight <= 0) return [];
  const boxes: PublishSliceBox[] = [];
  let y = 0;
  let index = 0;
  while (y < stripHeight) {
    const height = Math.min(sliceHeight, stripHeight - y);
    boxes.push({ index, y, height });
    y += sliceHeight;
    index += 1;
  }
  return boxes;
}

/**
 * 규격 폭에 맞춘 리사이즈 목표 크기. 원본이 규격보다 좁으면 확대하지 않고 그대로 둔다.
 * 크기를 읽지 못하면 {0, 0}을 돌려줘 호출자가 중단하게 한다.
 */
export function computePublishTargetSize(
  width: number,
  height: number,
  maxWidth: number
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0) || !(maxWidth > 0)) {
    return { width: 0, height: 0 };
  }
  if (width <= maxWidth) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxWidth / width;
  return { width: Math.round(maxWidth), height: Math.max(1, Math.round(height * scale)) };
}

const PUBLISH_MAX_QUALITY = 0.92;
const PUBLISH_DEFAULT_MIN_QUALITY = 0.6;
const PUBLISH_QUALITY_STEP = 0.08;

/**
 * 용량 상한을 맞추기 위한 품질 탐색 순서 — 0.92부터 0.08씩 낮춰 minQuality에서 멈춘다.
 * 항상 1개 이상을 돌려준다.
 */
export function publishQualityLadder(minQuality = PUBLISH_DEFAULT_MIN_QUALITY): number[] {
  const floor = Math.min(1, Math.max(0.1, minQuality));
  const ladder: number[] = [];
  for (let quality = PUBLISH_MAX_QUALITY; quality >= floor - 1e-9; quality -= PUBLISH_QUALITY_STEP) {
    ladder.push(Math.round(quality * 100) / 100);
  }
  const last = ladder[ladder.length - 1];
  if (last === undefined || Math.abs(last - floor) > 1e-9) {
    ladder.push(Math.round(floor * 100) / 100);
  }
  return ladder;
}

/** 자동 최적화 슬라이스 파일명 — `<제목>-<프리셋id>-slice1of3.jpg`, 한 장이면 접미사 없음. */
export function publishSliceFileName(
  title: string,
  presetId: PublishSpecPresetId,
  index: number,
  total: number,
  ext: string
): string {
  const base =
    title
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .slice(0, 120) || "toonstudio-episode";
  const suffix = total > 1 ? `-slice${index + 1}of${total}` : "";
  return `${base}-${presetId}${suffix}.${ext}`;
}

export interface PublishOptimizedSlice {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  /** 인코딩에 쓴 품질. PNG(무손실)면 null. */
  quality: number | null;
  filename: string;
}

export interface PublishAutoSliceResult {
  slices: PublishOptimizedSlice[];
  /** 용량 상한을 맞추지 못한 슬라이스 수(저장은 됨 — 업로드 전 확인 필요). */
  oversized: number;
}

export interface PublishAutoSliceOptions {
  /** 파일명에 쓸 작품 제목(비어 있으면 기본 파일명). */
  title: string;
  /** 기본값은 프리셋 권장 포맷. 프리셋이 허용하지 않으면 권장 포맷으로 강제된다. */
  format?: ExportFormat;
  /** 품질 하한 — 기본 0.6. 이 이하로는 화질이 급격히 깨지므로 더 낮추지 않는다. */
  minQuality?: number;
  onProgress?: (done: number, total: number) => void;
  /** 테스트 주입용 — 기본은 document.createElement("canvas"). */
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
  /** 테스트 주입용 — 기본은 canvasToBlob. */
  encode?: (
    canvas: HTMLCanvasElement,
    mime: string,
    quality: number | undefined
  ) => Promise<Blob>;
}

function defaultCreatePublishCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function defaultEncodePublishCanvas(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number | undefined
): Promise<Blob> {
  return canvasToBlob(canvas, mime, quality);
}

/** 프리셋이 허용하지 않는 포맷이면 권장 포맷으로 바꾼다. */
export function resolvePublishFormat(
  preset: PublishSpecPreset,
  format: ExportFormat | undefined
): ExportFormat {
  if (format !== undefined && preset.allowedFormats.includes(format)) return format;
  return preset.recommendedFormat;
}

export function publishMimeType(format: ExportFormat): string {
  if (format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

export interface PublishSourceSize {
  width: number;
  height: number;
}

/** 캔버스·이미지 원본 크기 읽기 — HTMLImageElement는 naturalWidth를 우선한다. */
export function readPublishSourceSize(
  source: HTMLCanvasElement | HTMLImageElement
): PublishSourceSize {
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }
  const image = source as HTMLImageElement;
  return {
    width: image.naturalWidth > 0 ? image.naturalWidth : image.width,
    height: image.naturalHeight > 0 ? image.naturalHeight : image.height,
  };
}

/**
 * 캔버스를 용량 상한에 맞게 인코딩한다. 손실 포맷(JPG/WebP)은 품질 계단을 타고
 * 내려가며, PNG는 무손실이라 한 번만 인코딩한다. 계단을 다 타도 넘치면 가장 작은
 * 결과를 oversized로 돌려준다(저장은 됨 — 업로드 전 확인 필요).
 */
export async function encodeCanvasFittingSize(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  maxBytes: number,
  encode: (
    canvas: HTMLCanvasElement,
    mime: string,
    quality: number | undefined
  ) => Promise<Blob>,
  minQuality = PUBLISH_DEFAULT_MIN_QUALITY
): Promise<{ blob: Blob; quality: number | null }> {
  const mime = publishMimeType(format);
  if (format === "png") {
    const blob = await encode(canvas, mime, undefined);
    return { blob, quality: null };
  }
  const ladder = publishQualityLadder(minQuality);
  let bestBlob: Blob | null = null;
  let bestQuality = ladder[0] ?? minQuality;
  for (const quality of ladder) {
    const blob = await encode(canvas, mime, quality);
    bestBlob = blob;
    bestQuality = quality;
    if (blob.size <= maxBytes) return { blob, quality };
  }
  if (!bestBlob) throw new Error("이미지를 인코딩하지 못했어요.");
  return { blob: bestBlob, quality: bestQuality };
}

/**
 * 회차 이미지 1장을 규격에 맞게 자동 최적화한다 — 리사이즈 → 슬라이싱 → 용량 맞춤.
 * 플랫폼 업로드용이라 배경은 흰색 불투명(JPG 전용 플랫폼·뷰어 배경 일치).
 * 원본 크기를 읽지 못하거나 합성 표면을 만들지 못하면 한글 메시지로 throw.
 */
export async function autoOptimizeEpisodeImage(
  source: HTMLCanvasElement | HTMLImageElement,
  preset: PublishSpecPreset,
  options: PublishAutoSliceOptions
): Promise<PublishAutoSliceResult> {
  const format = resolvePublishFormat(preset, options.format);
  const createCanvas = options.createCanvas ?? defaultCreatePublishCanvas;
  const encode = options.encode ?? defaultEncodePublishCanvas;
  const minQuality = options.minQuality ?? PUBLISH_DEFAULT_MIN_QUALITY;

  const sourceSize = readPublishSourceSize(source);
  if (sourceSize.width <= 0 || sourceSize.height <= 0) {
    throw new Error("원본 이미지 크기를 읽지 못했어요.");
  }

  // 1. 규격 폭 리사이즈(확대 금지).
  const target = computePublishTargetSize(
    sourceSize.width,
    sourceSize.height,
    preset.episodeMaxWidth
  );
  const strip = createCanvas(target.width, target.height);
  const stripCtx = strip.getContext("2d");
  if (!stripCtx) throw new Error("이미지 합성 표면을 만들지 못했어요. 다시 시도해주세요.");
  stripCtx.fillStyle = "#ffffff";
  stripCtx.fillRect(0, 0, target.width, target.height);
  stripCtx.imageSmoothingEnabled = true;
  stripCtx.imageSmoothingQuality = "high";
  stripCtx.drawImage(source, 0, 0, target.width, target.height);

  // 2. 규격 세로 단위 슬라이싱 — 세로 상한이 없는 프리셋은 한 장으로 둔다.
  const boxes = planPublishSliceBoxes(target.height, preset.episodeSliceHeight ?? target.height);
  const slices: PublishOptimizedSlice[] = [];
  let oversized = 0;
  for (const box of boxes) {
    const sliceCanvas = createCanvas(target.width, box.height);
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) throw new Error("슬라이스 표면을 만들지 못했어요. 다시 시도해주세요.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, target.width, box.height);
    ctx.drawImage(strip, 0, box.y, target.width, box.height, 0, 0, target.width, box.height);

    // 3. 장당 용량 한도에 맞게 인코딩.
    const { blob, quality } = await encodeCanvasFittingSize(
      sliceCanvas,
      format,
      preset.episodeMaxFileBytes,
      encode,
      minQuality
    );
    if (blob.size > preset.episodeMaxFileBytes) oversized += 1;
    slices.push({
      blob,
      width: target.width,
      height: box.height,
      bytes: blob.size,
      quality,
      filename: publishSliceFileName(options.title, preset.id, box.index, boxes.length, format),
    });
    options.onProgress?.(box.index + 1, boxes.length);
  }
  return { slices, oversized };
}
