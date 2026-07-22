/**
 * Studio PSD Layer Import — 포토샵(.psd) 레이어를 이미지 요소로 가져오기.
 *
 * studio-psd-export.ts(레이어별 PSD 내보내기)의 정확히 반대 방향이다 — ag-psd 의 readPsd 로 파싱한
 * 레이어 트리를 재귀적으로 평탄화해, 각 리프 레이어를 캔버스 좌표/불투명도/기본 블렌드 모드가
 * 보존된 하나의 "image" 요소로 변환한다. 래스터 레이어 마스크는 Studio의 편집 가능한 비파괴
 * maskSrc로 변환하고, 조정 레이어·레이어 이펙트·스마트 오브젝트의 완전한 재현은 명시적으로
 * 스코프 밖이다 — 해당 기능은 래스터 평탄화 또는 정직한 손실 고지로 한정한다
 * (docs/studio-psd-import-integration.md §0/§1.2/§4 참고).
 *
 * 좌표계 규약(studio-psd-export.ts 의 거울):
 *  - ag-psd `Psd.children` 은 포토샵 레이어 패널과 같은 순서([0]=패널 맨 위=화면상 가장 앞)다.
 *  - Studio 는 정반대(elements[0]=맨 뒤, elements[last]=맨 앞)다.
 *  - flattenPsdLayers 가 이 반전을 내부에서 처리해 이미 Studio 순서로 뒤집힌 리프 목록을 반환한다
 *    (studio-psd-export.ts 가 쓰기 방향에서 하는 `[...layers].reverse()`와 정확히 대칭).
 *
 * 그룹(폴더) 처리: 그룹 자신은 요소를 만들지 않는다 — 자식으로 재귀하며 그룹의 불투명도만
 * 곱연산으로 누적하고(숨김은 OR 누적), 그룹 자신의 blendMode 는 버린다(리프 자신의 blendMode만
 * 사용, 기본 "normal"). 포토샵의 격리된 그룹 블렌딩을 완전히 재현하려면 오프스크린 합성이 필요해
 * "단순 평탄화" 스코프를 넘어선다.
 *
 * 구현 결정(설계 문서보다 한 단계 더 좁힌 세부사항 — 편차를 여기 명시한다):
 *  - 그룹 자신의 blendMode 를 버린다는 사실 자체는 skipped 목록에 별도 고지하지 않는다.
 *    flattenPsdLayers 의 반환 타입(FlattenedPsdLayer[])에는 "그룹 단위 1회 고지"를 위한 채널이
 *    없고, 대부분의 실제 PSD 는 그룹을 기본 blendMode("pass through")로 남겨두므로 매번 고지하면
 *    거의 모든 파일에서 뜨는 잡음이 된다 — 마스크/이펙트/스마트오브젝트/텍스트처럼 "실제로 특별한
 *    설정이 있을 때만" 고지하는 정직성 규약과 결이 다르다고 판단해 이 항목만 조용히 근사한다.
 *  - "empty-bounds"/"no-canvas" skip 사유의 정확한 사용자 노출 문구는 설계 문서에 리터럴로
 *    명시돼 있지 않아 이 파일에서 studio-psd-export.ts 와 같은 톤으로 새로 작성했다.
 *
 * 이 파일은 대부분 순수 로직이다 — flattenPsdLayers/mapPsdBlendMode/placementForLayer 는 DOM 없이
 * 단위테스트 가능하고, importPsdFile 자체도 PsdImportDeps 로 readPsd/downscaleDataUrl 을 주입받아
 * 테스트에서 실제 파일/canvas 없이 검증 가능하다.
 */

import { readPsd, type BlendMode, type Layer, type Psd, type ReadOptions } from "ag-psd";

import { downscaleDataUrl } from "./studio-image-utils";
import {
  rasterizePsdLayerMasks,
  type PsdLayerMaskRasterInput,
  type PsdLayerMaskRasterResult,
  type PsdLayerMaskSource,
} from "./studio-psd-mask-import";

// ── 결과 타입 ────────────────────────────────────────────────────────────────

/** El("image" 변형)과 구조 호환되는 최소 형태 — 호출부가 그대로 El[] 에 스프레드한다. */
export interface PsdImportedElement {
  id: string;
  type: "image";
  /** downscaleDataUrl 을 거친 최종 data URL(webp, maxW=1280 — onPickImage 와 동일 관례). */
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0;
  /** 그룹×자신 누적 불투명도(0..1). 1이면 필드 생략(El 관례 — 미설정=불투명). */
  opacity?: number;
  /** studio El.blendMode 문자열. "source-over"(기본)면 필드 생략. */
  blendMode?: string;
  /** PSD 레이어 이름. 없으면 "레이어 N"(N=1부터, Studio z-order 기준 순번). */
  name?: string;
  /** 자신 또는 조상 그룹이 숨김이면 true. 아니면 필드 자체를 생략(El 관례). */
  hidden?: true;
  /** Photoshop 래스터 마스크를 white-RGB/alpha PNG로 바꾼 편집 가능한 비파괴 마스크. */
  maskSrc?: string;
  /** Photoshop에서 마스크가 비활성 상태면 false. 미설정은 Studio 관례상 활성. */
  maskEnabled?: false;
}

export interface PsdImportResult {
  /** Studio z-order(뒤→앞, elements[0]=맨 뒤)로 이미 정렬된 상태. */
  elements: PsdImportedElement[];
  /** 원본 PSD 캔버스 크기(스케일 반영 전) — 새 페이지 생성 시 canvasH 계산에 필요. */
  sourceWidth: number;
  sourceHeight: number;
  /** 실제 적용된 배치 스케일(targetWidth / sourceWidth, 확대는 하지 않음 — 상한 1). */
  scale: number;
  /** 재현 불가/제외 항목 고지 — studio-psd-export.ts 의 skipped 와 동일한 정직성 규약. */
  skipped: string[];
}

// ── 테스트 주입 지점 — studio-brand-kit.ts 류 DI 패턴 ────────────────────────

export interface PsdImportDeps {
  /** 기본 ag-psd readPsd(skipCompositeImageData:true). 테스트에서 손으로 만든 Psd 픽스처를
   *  즉시 반환하도록 모킹. */
  readPsdImpl?: (buffer: ArrayBuffer, options?: ReadOptions) => Psd;
  /** 기본 studio-image-utils.downscaleDataUrl. 테스트에서 입력을 그대로 반환하도록 모킹
   *  (canvas/Image DOM 의존을 배치·스케일 계산 테스트에서 분리). */
  downscaleImpl?: (dataUrl: string, maxW: number) => Promise<string>;
  /** 기본 Canvas2D 마스크 래스터화. 테스트에서는 DOM 없이 결과를 주입한다. */
  rasterizeMaskImpl?: (
    input: PsdLayerMaskRasterInput,
  ) => PsdLayerMaskRasterResult | Promise<PsdLayerMaskRasterResult>;
}

// ── 평탄화 ──────────────────────────────────────────────────────────────────

export interface FlattenedPsdLayer {
  /** canvas/imageData 원본 참조(래스터화는 importPsdFile 이 처리) + mask/effects/text/placedLayer
   *  등 부가 필드 검사에도 그대로 쓰인다. */
  layer: Layer;
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** 그룹 체인을 따라 곱연산으로 누적된 불투명도(0..1). */
  opacity: number;
  /** 그룹 체인을 따라 OR 로 누적된 숨김 여부. */
  hidden: boolean;
  /** 이 레이어를 건너뛰어야 하는 이유(있으면 canvas 를 읽지 않고 skipped 에만 기록). */
  skipReason?: "adjustment" | "no-canvas" | "empty-bounds";
}

interface RawFlattenedLeaf {
  layer: Layer;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
  hidden: boolean;
  skipReason?: FlattenedPsdLayer["skipReason"];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

// 그룹(폴더) 레이어 판별 — ag-psd 는 리프 레이어엔 children 필드를 아예 만들지 않고(undefined),
// 그룹에만 배열(빈 배열 포함)을 채운다(ag-psd psdReader.ts 의 SectionDivider 처리 확인 완료).
function isGroupLayer(layer: Layer): layer is Layer & { children: Layer[] } {
  return Array.isArray(layer.children);
}

function flattenInto(
  layers: readonly Layer[],
  inheritedOpacity: number,
  inheritedHidden: boolean,
  out: RawFlattenedLeaf[]
): void {
  for (const layer of layers) {
    const opacity = inheritedOpacity * clamp01(layer.opacity ?? 1);
    const hidden = inheritedHidden || !!layer.hidden;

    if (isGroupLayer(layer)) {
      flattenInto(layer.children, opacity, hidden, out);
      continue;
    }

    const left = layer.left ?? 0;
    const top = layer.top ?? 0;
    const width = (layer.right ?? left) - left;
    const height = (layer.bottom ?? top) - top;

    let skipReason: RawFlattenedLeaf["skipReason"];
    if (layer.adjustment) {
      // 조정 레이어는 래스터 내용이 없다 — canvas 존재 여부와 무관하게 즉시 제외.
      skipReason = "adjustment";
    } else if (width <= 0 || height <= 0) {
      skipReason = "empty-bounds";
    } else if (!layer.canvas) {
      skipReason = "no-canvas";
    }

    out.push({ layer, left, top, width, height, opacity, hidden, skipReason });
  }
}

/**
 * psd.children(중첩 그룹 트리, ag-psd 관례상 [0]=포토샵 패널 맨 위)을 재귀적으로 평탄화해
 * **Studio 순서(뒤→앞, 배열 앞쪽이 배경)로 이미 뒤집힌** 리프 레이어 목록을 반환한다(studio-psd-
 * export.ts 가 반대 방향으로 하는 `[...layers].reverse()`와 정확히 대칭). adjustment 레이어
 * (layer.adjustment 존재)는 래스터 내용이 없으므로 skipReason:"adjustment" 로 표시하고 canvas 를
 * 읽지 않는다. 이름 없는 레이어는 최종 Studio 순서 기준 순번으로 "레이어 N" 폴백을 받는다
 * (studio-psd-export.ts 의 elementLabel 과 동일한 fallback 관례).
 */
export function flattenPsdLayers(psd: Psd): FlattenedPsdLayer[] {
  const raw: RawFlattenedLeaf[] = [];
  flattenInto(psd.children ?? [], 1, false, raw);
  raw.reverse(); // ag-psd(패널 맨 위가 먼저) → Studio(맨 뒤가 먼저) 순서 반전.
  return raw.map((entry, index) => {
    const trimmed = entry.layer.name?.trim();
    return { ...entry, name: trimmed ? trimmed : `레이어 ${index + 1}` };
  });
}

// ── blendMode 매핑 ───────────────────────────────────────────────────────────

/**
 * ag-psd BlendMode → Studio El.blendMode(CSS globalCompositeOperation) 문자열.
 * studio-psd-export.ts 의 BLEND_MODE_MAP(Studio→ag-psd)을 손으로 뒤집은 표 — 그 파일을 import
 * 하지 않고 이 파일에 독립적으로 정의한다(기존 파일 무수정 원칙 유지). 두 표가 갈라지지 않도록
 * 값 목록을 나란히 유지할 것 — 한쪽을 고치면 다른 쪽도 확인. 매핑 없는 값(pass through·dissolve·
 * linear burn 등 Canvas 합성에 대응 개념이 없는 모드)은 "source-over"로 방어한다.
 */
const PSD_BLEND_MODE_TO_STUDIO: Partial<Record<BlendMode, string>> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color dodge": "color-dodge",
  "color burn": "color-burn",
  "hard light": "hard-light",
  "soft light": "soft-light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
};

export function mapPsdBlendMode(mode: BlendMode | undefined): string {
  if (!mode) return "source-over";
  return PSD_BLEND_MODE_TO_STUDIO[mode] ?? "source-over";
}

// ── 배치 스케일 ──────────────────────────────────────────────────────────────

/** scale = min(1, targetWidth/psdWidth) — onPickImage/createCanvasImageElement 와 동일하게
 *  "확대는 하지 않고 축소만"(저해상도 PSD 가 억지로 커지지 않게). */
function uniformScale(psdWidth: number, targetWidth: number): number {
  if (psdWidth <= 0 || targetWidth <= 0) return 1;
  return Math.min(1, targetWidth / psdWidth);
}

/** 레이어의 PSD 좌표(left/top/width/height)를 targetWidth 기준 균일 스케일로 변환. */
export function placementForLayer(
  bounds: { left: number; top: number; width: number; height: number },
  psdWidth: number,
  targetWidth: number
): { x: number; y: number; width: number; height: number; scale: number } {
  const scale = uniformScale(psdWidth, targetWidth);
  return {
    x: bounds.left * scale,
    y: bounds.top * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
    scale,
  };
}

// ── 결과 요약 ────────────────────────────────────────────────────────────────

/** 결과 요약 한 줄(상태 배너용) — psdExportResultMessage 와 동일한 톤. */
export function psdImportResultMessage(result: PsdImportResult): string {
  const parts = [`PSD 가져오기 완료 — 레이어 ${result.elements.length}개`];
  if (result.skipped.length > 0) parts.push(`알림 ${result.skipped.length}건`);
  return parts.join(" · ");
}

interface LayerMaskImportSelection {
  sources: PsdLayerMaskSource[];
  fallbackMask?: PsdLayerMaskSource;
}

function layerMaskSources(layer: Layer): LayerMaskImportSelection {
  if (layer.realMask) {
    return {
      // PSD channel -3 is the authoritative final pixel+vector composite. It
      // must not be multiplied by channel -2 a second time.
      sources: [{
        kind: "real",
        mask: layer.realMask,
        // ag-psd reads density/feather parameters from the primary descriptor.
        parameterMask: layer.mask ?? layer.realMask,
      }],
      // Keep channel -2 only for explicit recovery when -3 pixels are corrupt.
      fallbackMask: layer.mask ? { kind: "primary", mask: layer.mask } : undefined,
    };
  }
  return {
    sources: layer.mask ? [{ kind: "primary", mask: layer.mask }] : [],
  };
}

function maskEditabilityWarnings(layer: Layer): string[] {
  const warnings: string[] = [];
  const rasterizedVectorMask = !!layer.mask?.fromVectorData || !!layer.realMask?.fromVectorData;
  if (rasterizedVectorMask) {
    warnings.push("벡터 마스크를 편집 가능한 단일 래스터 마스크로 근사했어요.");
  }
  if (layer.mask && layer.realMask) {
    warnings.push("픽셀·벡터 이중 마스크를 편집 가능한 단일 래스터 마스크로 합성했어요.");
  } else if (layer.mask && layer.vectorMask && !rasterizedVectorMask) {
    warnings.push("벡터 마스크 경로는 별도로 편집할 수 없어 래스터 마스크에 포함되지 않았어요.");
  }
  return warnings;
}

function isUsableImageDataUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const separator = value.indexOf(",");
  return separator > 0
    && value.slice(0, separator).toLowerCase().startsWith("data:image/")
    && separator < value.length - 1;
}

// ── id 생성 — studio-asset-library.ts 의 createAssetId 와 동일한 안전장치 패턴 ──

function createImportedLayerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `psd-layer-${Date.now()}-${Math.random().toString(36).slice(2)}`; // NOSONAR S2245 비암호화 용도(ID 생성)
}

/** 각 임포트 이미지의 저장 해상도 상한 — downscaleImageFile/onPickImage 와 동일 관례. PSD 원본이
 *  아무리 고해상도여도 localStorage/히스토리에 그대로 쌓지 않는다. */
const IMPORTED_LAYER_MAX_DIM = 1280;
/** ag-psd otherwise permits up to 2GB of decoded bitmaps, which is not a safe
 * browser/mobile boundary. The source ArrayBuffer and decoded layer pixels are
 * independently bounded before editable proxies are admitted to the project. */
export const PSD_IMPORT_MAX_FILE_BYTES = 128 * 1024 * 1024;
export const PSD_IMPORT_MAX_DECODED_BYTES = 128 * 1024 * 1024;

const PSD_READ_OPTIONS: ReadOptions = Object.freeze({
  skipCompositeImageData: true,
  skipThumbnail: true,
  skipLinkedFilesData: true,
  totalMemoryLimit: PSD_IMPORT_MAX_DECODED_BYTES,
});

// ── 메인 진입점 ──────────────────────────────────────────────────────────────

/**
 * .psd 파일을 파싱해 레이어별 이미지 요소 배열로 변환한다.
 * @param file 사용자가 고른 .psd 파일.
 * @param targetWidth 배치될 캔버스 폭(보통 CANVAS_W=720) — PSD 폭에 맞춰 균일 스케일한다.
 * 실패(손상된 파일 등)는 throw한다(한국어 메시지) — exportPagePsd 의 실패 계약과 대칭.
 */
export async function importPsdFile(
  file: File,
  targetWidth: number,
  deps: PsdImportDeps = {}
): Promise<PsdImportResult> {
  const readPsdImpl = deps.readPsdImpl ?? readPsd;
  const downscaleImpl = deps.downscaleImpl ?? downscaleDataUrl;
  const rasterizeMaskImpl = deps.rasterizeMaskImpl ?? rasterizePsdLayerMasks;

  if (
    typeof file.size === "number"
    && (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > PSD_IMPORT_MAX_FILE_BYTES)
  ) {
    throw new Error(`PSD 파일은 최대 ${PSD_IMPORT_MAX_FILE_BYTES / 1024 / 1024}MB까지 가져올 수 있어요.`);
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    throw new Error(`PSD 파일을 읽지 못했어요: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (buffer.byteLength > PSD_IMPORT_MAX_FILE_BYTES) {
    throw new Error(`PSD 파일은 최대 ${PSD_IMPORT_MAX_FILE_BYTES / 1024 / 1024}MB까지 가져올 수 있어요.`);
  }

  let psd: Psd;
  try {
    psd = readPsdImpl(buffer, PSD_READ_OPTIONS);
  } catch (err) {
    throw new Error(`PSD 파일을 해석하지 못했어요: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  const sourceWidth = Math.max(1, Math.round(psd.width || 0));
  const sourceHeight = Math.max(1, Math.round(psd.height || 0));
  const scale = uniformScale(sourceWidth, targetWidth);

  const flattened = flattenPsdLayers(psd);
  const skipped: string[] = [];
  const elements: PsdImportedElement[] = [];

  for (const entry of flattened) {
    if (entry.skipReason === "adjustment") {
      skipped.push(`${entry.name}: 조정 레이어라 제외됨`);
      continue;
    }
    if (entry.skipReason === "empty-bounds") {
      skipped.push(`${entry.name}: 크기가 0이라 건너뜀`);
      continue;
    }
    if (entry.skipReason === "no-canvas") {
      skipped.push(`${entry.name}: 이미지 데이터를 찾을 수 없어 건너뜀`);
      continue;
    }

    const canvas = entry.layer.canvas;
    if (!canvas) {
      // flattenPsdLayers 계약상 skipReason 없는 항목은 canvas 가 있어야 하지만, 타입 시스템이 이
      // 불변식을 표현하지 못하므로(Layer.canvas 는 항상 optional) 방어적으로 한 번 더 좁힌다.
      skipped.push(`${entry.name}: 이미지 데이터를 찾을 수 없어 건너뜀`);
      continue;
    }

    let rawDataUrl: string;
    try {
      rawDataUrl = canvas.toDataURL("image/png");
    } catch {
      skipped.push(`${entry.name}: 래스터화 실패로 건너뜀`);
      continue;
    }
    if (!isUsableImageDataUrl(rawDataUrl)) {
      skipped.push(`${entry.name}: 래스터 PNG가 비어 있어 건너뜀`);
      continue;
    }

    let src = rawDataUrl;
    let proxyFallbackWarning: string | undefined;
    try {
      const candidate = await downscaleImpl(rawDataUrl, IMPORTED_LAYER_MAX_DIM);
      if (isUsableImageDataUrl(candidate)) {
        src = candidate;
      } else {
        proxyFallbackWarning = "이미지 프록시 인코딩이 비어 원본 PNG를 유지했어요.";
      }
    } catch {
      proxyFallbackWarning = "이미지 프록시 변환에 실패해 원본 PNG를 유지했어요.";
    }
    const sourcePixelWidth = canvas.width || entry.width;
    const sourcePixelHeight = canvas.height || entry.height;
    const sourceStayedOriginal = src === rawDataUrl;
    if (sourceStayedOriginal && sourcePixelWidth > IMPORTED_LAYER_MAX_DIM && !proxyFallbackWarning) {
      proxyFallbackWarning = "이미지 프록시 변환에 실패해 원본 PNG를 유지했어요.";
    }
    if (proxyFallbackWarning) skipped.push(`${entry.name}: ${proxyFallbackWarning}`);
    const placement = placementForLayer(
      { left: entry.left, top: entry.top, width: entry.width, height: entry.height },
      sourceWidth,
      targetWidth
    );

    const el: PsdImportedElement = {
      id: createImportedLayerId(),
      type: "image",
      src,
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotation: 0,
      name: entry.name,
    };
    if (entry.opacity < 1) el.opacity = entry.opacity;
    const blendMode = mapPsdBlendMode(entry.layer.blendMode);
    if (blendMode !== "source-over") el.blendMode = blendMode;
    if (entry.hidden) el.hidden = true;

    const maskSelection = layerMaskSources(entry.layer);
    for (const warning of maskEditabilityWarnings(entry.layer)) {
      skipped.push(`${entry.name}: ${warning}`);
    }
    if (maskSelection.sources.length > 0) {
      let maskResult: PsdLayerMaskRasterResult;
      try {
        maskResult = await rasterizeMaskImpl({
          layerLeft: entry.left,
          layerTop: entry.top,
          layerPixelWidth: sourcePixelWidth,
          layerPixelHeight: sourcePixelHeight,
          masks: maskSelection.sources,
          fallbackMask: maskSelection.fallbackMask,
          // If the source proxy fell back to the original PNG, preserve the
          // same natural pixel dimensions instead of attaching a 1280px mask
          // that would drift when rendered against the full-resolution source.
          maxWidth: sourceStayedOriginal ? sourcePixelWidth : IMPORTED_LAYER_MAX_DIM,
        });
      } catch {
        maskResult = {
          warnings: ["마스크 변환에 실패해 원본 레이어를 가리지 않고 가져왔어요."],
        };
      }
      if (maskResult.maskSrc) {
        el.maskSrc = maskResult.maskSrc;
        if (maskResult.disabled) el.maskEnabled = false;
      }
      for (const warning of maskResult.warnings) skipped.push(`${entry.name}: ${warning}`);
    } else if (entry.layer.vectorMask) {
      // vector-only masks have no decoded pixel channel for the bounded Canvas bridge.
      skipped.push(`${entry.name}: 벡터 전용 마스크는 래스터 픽셀이 없어 원본 레이어를 가리지 않고 가져왔어요.`);
    }
    elements.push(el);

    // 반영은 하되(원본 그대로 래스터에 이미 포함) 재현되지 않는 부분을 정직하게 고지 — v1 명시적
    // 제외 목록(docs/studio-psd-import-integration.md §1.2)과 1:1 대응.
    if (entry.layer.effects) {
      skipped.push(`${entry.name}: 레이어 스타일(그림자 등)은 반영되지 않아요`);
    }
    if (entry.layer.placedLayer) {
      skipped.push(`${entry.name}: 스마트 오브젝트는 편집 가능한 원본이 아니라 미리보기 이미지로 가져왔어요`);
    }
    if (entry.layer.text) {
      skipped.push(`${entry.name}: 텍스트 레이어는 편집 가능한 글자가 아니라 이미지로 가져왔어요`);
    }
  }

  if (elements.length === 0 && skipped.length === 0) {
    skipped.push("PSD에서 가져올 레이어를 찾지 못했어요.");
  }

  return { elements, sourceWidth, sourceHeight, scale, skipped };
}
