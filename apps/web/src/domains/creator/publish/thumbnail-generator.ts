/**
 * Publish Thumbnail Generator — 발행용 썸네일 자동 생성.
 *
 * WEBTOON CANVAS는 시리즈 정방형(1080×1080, 500KB 미만) · 시리즈 세로형(1080×1920,
 * 700KB 미만) · 회차(202×142, 500KB 미만) 3종 썸네일을 요구한다. 이 모듈은 원본
 * 이미지 1장에서 3종을 자동 생성한다:
 *
 * 1. cover-fit 중앙 크롭 — 목표 비율에 맞게 원본을 꽉 채우고 남는 부분을 잘라낸다
 * 2. 목표 크기로 리사이즈
 * 3. 용량 한도에 맞게 JPEG 품질 계단으로 인코딩(썸네일은 규격상 JPG 권장)
 *
 * 크롭 좌표·파일명은 순수 함수라 node 단위 테스트가 가능하고, 브라우저 Canvas를
 * 만지는 실행부는 의존성 주입(createCanvas·encode)으로 테스트한다.
 *
 * 사용자 노출 문자열은 한글.
 */

import { canvasToBlob, type ExportFormat } from "../export/studio-export";
import {
  encodeCanvasFittingSize,
  readPublishSourceSize,
} from "./auto-slicer";
import type {
  PublishSpecPreset,
  PublishSpecPresetId,
  PublishSpecThumbnail,
  PublishSpecThumbnailKind,
} from "./spec-validator";

export interface PublishThumbnailCrop {
  /** 원본 안 크롭 시작 x(px). */
  sx: number;
  /** 원본 안 크롭 시작 y(px). */
  sy: number;
  /** 크롭 너비(px). */
  sw: number;
  /** 크롭 높이(px). */
  sh: number;
}

/**
 * cover-fit 중앙 크롭 영역 — 목표 비율에 원본을 꽉 채우고 남는 부분을 잘라낸다.
 * 크기를 읽지 못하면 null.
 */
export function computeThumbnailCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): PublishThumbnailCrop | null {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return null;
  }
  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  let sw: number;
  let sh: number;
  if (sourceRatio > targetRatio) {
    // 원본이 더 넓다 — 세로를 기준으로 삼고 가로를 자른다.
    sh = sourceHeight;
    sw = sh * targetRatio;
  } else {
    // 원본이 더 좁거나 같다 — 가로를 기준으로 삼고 세로를 자른다.
    sw = sourceWidth;
    sh = sw / targetRatio;
  }
  return {
    sx: (sourceWidth - sw) / 2,
    sy: (sourceHeight - sh) / 2,
    sw,
    sh,
  };
}

/** 썸네일 파일명 — `<제목>-<프리셋id>-thumb-series-square.jpg`. */
export function publishThumbnailFileName(
  title: string,
  presetId: PublishSpecPresetId,
  kind: PublishSpecThumbnailKind,
  ext: string
): string {
  const base =
    title
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .slice(0, 120) || "toonstudio-episode";
  return `${base}-${presetId}-thumb-${kind}.${ext}`;
}

export interface PublishGeneratedThumbnail {
  kind: PublishSpecThumbnailKind;
  label: string;
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  /** 인코딩에 쓴 JPEG 품질. */
  quality: number;
  /** 용량 상한(공식 문언 "미만" — 경계값도 초과)을 맞추지 못했는가(저장은 됨 — 업로드 전 확인 필요). */
  oversized: boolean;
  filename: string;
}

export interface PublishThumbnailOptions {
  /** 파일명에 쓸 작품 제목(비어 있으면 기본 파일명). */
  title: string;
  /** 품질 하한 — 기본 0.6. */
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

function defaultCreateThumbnailCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * 프리셋의 썸네일 슬롯 전체를 원본 1장에서 생성한다.
 * 썸네일은 규격상 JPG를 권장하므로 포맷은 jpg 고정이다.
 */
export async function generatePublishThumbnails(
  source: HTMLCanvasElement | HTMLImageElement,
  preset: PublishSpecPreset,
  options: PublishThumbnailOptions
): Promise<PublishGeneratedThumbnail[]> {
  const createCanvas = options.createCanvas ?? defaultCreateThumbnailCanvas;
  const encode =
    options.encode ??
    ((target: HTMLCanvasElement, mime: string, quality: number | undefined) =>
      canvasToBlob(target, mime, quality));
  const format: ExportFormat = "jpg";

  const sourceSize = readPublishSourceSize(source);
  if (sourceSize.width <= 0 || sourceSize.height <= 0) {
    throw new Error("썸네일 원본 크기를 읽지 못했어요.");
  }

  const thumbnails: PublishGeneratedThumbnail[] = [];
  const specs: readonly PublishSpecThumbnail[] = preset.thumbnails;
  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index];
    if (!spec) continue;
    const crop = computeThumbnailCoverCrop(
      sourceSize.width,
      sourceSize.height,
      spec.width,
      spec.height
    );
    if (!crop) throw new Error("썸네일 크롭 영역을 계산하지 못했어요.");

    const canvas = createCanvas(spec.width, spec.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("썸네일 표면을 만들지 못했어요. 다시 시도해주세요.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, spec.width, spec.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, spec.width, spec.height);

    const { blob, quality } = await encodeCanvasFittingSize(
      canvas,
      format,
      spec.maxBytes,
      encode,
      options.minQuality
    );
    thumbnails.push({
      kind: spec.kind,
      label: spec.label,
      blob,
      width: spec.width,
      height: spec.height,
      bytes: blob.size,
      quality: quality ?? 0.92,
      oversized: blob.size >= spec.maxBytes,
      filename: publishThumbnailFileName(options.title, preset.id, spec.kind, format),
    });
    options.onProgress?.(index + 1, specs.length);
  }
  return thumbnails;
}
