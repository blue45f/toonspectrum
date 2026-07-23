import { useEffect, useRef, useState } from "react";
import { Image as KImage } from "react-konva/lib/ReactKonvaCore";

import {
  hasActiveImageFilters,
  imageFilterCacheKey,
  type ImageFilterFields,
} from "./studio-konva-filter-fields";
import { studioKonvaRuntime as KonvaRuntime } from "./studio-konva-runtime";
import { resizableNodeProps } from "./studio-node-props";
import { computePanelAutoFitPatch } from "./studio-panel-autofit";
import { toKonvaSkewAttrs } from "./studio-skew";

import type { FrameEl, ImageEl } from "./studio-element-model";
import type Konva from "konva";

const IMAGE_FILTER_BUILD_CACHE_LIMIT = 200;
const IMAGE_FILTER_WORKER_DEBOUNCE_MS = 80;
const IMAGE_FILTER_WORKER_RESULT_CACHE_LIMIT = 4;
const PAGE_COMPOSITE_FILTER_RESULT_CACHE_LIMIT = 1;
// One RGBA input plus transfer/result/intermediate buffers can coexist. Keep interactive filtering
// at 16 MP / 64 MiB per surface. The Worker protocol independently enforces its broader 64 MP hard
// boundary; keeping this stricter UI budget local avoids eagerly loading the optional Worker
// protocol solely to read a constant before the user applies an image filter.
const IMAGE_FILTER_INTERACTIVE_MAX_PIXELS = 16 * 1024 * 1024;
// HiDPI 필터 슈퍼샘플 상한 — 3D 인서트 캡처와 같은 이유로 2를 넘기지 않는다(픽셀 4× 메모리 캡).
const IMAGE_FILTER_SUPERSAMPLE_MAX = 2;

/**
 * 밀도 불변이 증명된 buildImageFilters attrs 화이트리스트(명시적 per-attr 목록).
 *
 * 여기 있는 attr 는 전부 픽셀 단위 기하가 전혀 없는 per-pixel 포인트(색/톤) 연산이거나
 * 정규화 좌표(치수 상대) 연산(비네트)이다 — 슈퍼샘플 버퍼에서 실행해도 수학적으로 같은 룩이
 * 나오고 픽셀만 촘촘해진다. 목록에 없는 attr 가 하나라도 있으면 기본 거부(1× 밀도)로 남는다:
 * px 단위 파라미터(블러 반경·망점 도트 px·테두리 굵기·그레인 크기·픽셀레이트 셀·왜곡 스케일,
 * 커널 풋프린트 등)는 Konva 캐시/Worker 버퍼가 커지면 콘텐츠 대비 효과가 줄어들기 때문이다.
 * 새 필터가 추가되어도 여기 등재 전까지는 자동으로 기존 1× 동작을 유지한다(default-deny).
 */
// eslint-disable-next-line react-refresh/only-export-components -- 밀도 화이트리스트는 이 노드의 캐시 소유권과 한 경계이며 계약 테스트가 직접 대조한다
export const STUDIO_DENSITY_INVARIANT_FILTER_ATTRS: ReadonlySet<string> = new Set([
  // 밝기/대비 — per-pixel 포인트 연산.
  "brightness",
  "contrast",
  // HSL — per-pixel 색 변환(luminance 는 항상 0 으로 부착된다).
  "saturation",
  "hue",
  "luminance",
  // 색온도 — per-pixel 채널 시프트.
  "temperature",
  // 레벨(마스터 + r/g/b 채널) — 256칸 LUT 포인트 연산.
  "levelsBlack",
  "levelsWhite",
  "levelsGamma",
  "levelsOutBlack",
  "levelsOutWhite",
  "levelsR",
  "levelsG",
  "levelsB",
  // 톤 커브(마스터 + r/g/b 채널) — LUT 포인트 연산.
  "curvePoints",
  "curvePointsR",
  "curvePointsG",
  "curvePointsB",
  // 컬러 밸런스 — per-pixel 톤 영역 가중 시프트.
  "cbShadows",
  "cbMidtones",
  "cbHighlights",
  // 채널 믹서 — per-pixel 3×3 색 행렬.
  "channelMixer",
  // 선택 색상(HSL 밴드) — per-pixel 색상 분류·보정.
  "selectiveHsl",
  // 생동감 — per-pixel 채도 곡선.
  "vibrance",
  "vibranceSat",
  // 그라디언트 맵 — 휘도 LUT 포인트 연산.
  "gradientMap",
  // 포토 필터 — per-pixel 색 오버레이.
  "pfColor",
  "pfDensity",
  "pfPreserve",
  // 색상 투명화 — per-pixel 키 컬러 거리 → 알파.
  "ctaColor",
  "ctaStrength",
  // 듀오톤 — 휘도 → 2색 매핑 포인트 연산.
  "duotoneShadow",
  "duotoneHighlight",
  // 잉크 스레숄드 — per-pixel 휘도 임계.
  "inkThreshold",
  // 포스터라이즈 — per-pixel 양자화.
  "posterize",
  // 노출 — per-pixel EV/감마/오프셋.
  "exposureEv",
  "exposureGamma",
  "exposureOffset",
  // 섀도우/하이라이트 — 휘도 LUT 포인트 연산(width 파라미터는 톤 범위이지 px 가 아니다).
  "shShadows",
  "shShadowsWidth",
  "shHighlights",
  "shHighlightsWidth",
  "shMidtoneContrast",
  // 비네트 — half-dimension 정규화 좌표 기하(절대 px 없음).
  "vignetteDarkness",
  "vignetteSize",
  "vignetteRoundness",
  "vignetteFeather",
]);

/**
 * 이미지 필터 슈퍼샘플 밀도를 결정한다 — 활성 보정 프로그램 전체가 밀도 불변으로 증명된
 * 경우에만 min(2, devicePixelRatio), 그 외에는 1(기존 룩 그대로).
 *
 * 판정 재료는 buildImageFilters 가 실제로 부착한 attrs(default-deny 화이트리스트)와,
 * attrs 없이 filters 배열에만 나타나는 px 단위 플래그 필터(screentone/lineart — 6px 타일·
 * 3×3 소벨 커널), 그리고 attrs 가 래퍼 클로저에 숨는 스마트 필터 스택(내용 검사가 불가하므로
 * 보수적으로 제외)이다. Grayscale/Sepia/Invert 도 attrs 가 없지만 포인트 연산이라 안전하다.
 * Konva 캐시(pixelRatio)와 Worker 스냅샷이 같은 값을 써야 두 경로의 룩이 일치한다.
 */
// eslint-disable-next-line react-refresh/only-export-components -- 순수 밀도 판정은 이 노드의 캐시 구성과 분리할 수 없는 공개 계약이다
export function studioImageFilterSupersampleDensity(input: {
  readonly attrs: Record<string, unknown>;
  readonly el: Pick<
    ImageFilterFields,
    "screentone" | "lineart" | "smartFilters" | "smartFilterOperations"
  >;
  readonly devicePixelRatio: number;
}): number {
  const dpr = input.devicePixelRatio;
  if (typeof dpr !== "number" || !Number.isFinite(dpr) || dpr <= 1) return 1;
  if (input.el.screentone || input.el.lineart) return 1;
  if (
    input.el.smartFilters != null
    || (Array.isArray(input.el.smartFilterOperations) && input.el.smartFilterOperations.length > 0)
  ) {
    return 1;
  }
  for (const key of Object.keys(input.attrs)) {
    if (!STUDIO_DENSITY_INVARIANT_FILTER_ATTRS.has(key)) return 1;
  }
  return Math.min(IMAGE_FILTER_SUPERSAMPLE_MAX, dpr);
}
type StudioKonvaFiltersModule = typeof import("./studio-konva-filters");
type StudioImageFilterWorkerClientModule = typeof import("./studio-image-filter-worker-client");
type StudioGpuFilterApplyModule = typeof import("./studio-gpu-filter-apply");
type StudioImageFilterWorkerSession = ReturnType<
  StudioImageFilterWorkerClientModule["createStudioImageFilterWorkerSession"]
>;
type ImageFilterBuild = ReturnType<StudioKonvaFiltersModule["buildImageFilters"]>;
const EMPTY_IMAGE_FILTER_BUILD: ImageFilterBuild = { filters: [], attrs: {}, cachePad: 0 };
const imageFilterBuildCache = new Map<string, ImageFilterBuild>();
let studioKonvaFiltersPromise: Promise<StudioKonvaFiltersModule> | null = null;

interface LoadedImageState {
  image: HTMLImageElement;
  src: string;
}

interface DisplayImageState {
  flipped: boolean;
  flippedY: boolean;
  image: CanvasImageSource;
  isAnimatedGif: boolean;
  loadedImage: HTMLImageElement;
  src: string;
}

interface WorkerFilteredCanvasState {
  canvas: HTMLCanvasElement;
  filterKey: string;
  height: number;
  source: CanvasImageSource;
  src: string;
  width: number;
}

interface WorkerSourcePixelsState {
  data: Uint8ClampedArray;
  height: number;
  source: CanvasImageSource;
  width: number;
}

interface WorkerResultCacheState {
  canvases: Map<string, HTMLCanvasElement>;
  height: number;
  source: CanvasImageSource;
  width: number;
}

function releaseWorkerResultCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function releaseWorkerResultCache(cache: WorkerResultCacheState | null): void {
  if (!cache) return;
  for (const canvas of cache.canvases.values()) {
    releaseWorkerResultCanvas(canvas);
  }
  cache.canvases.clear();
}

function trimWorkerResultCache(
  cache: WorkerResultCacheState | null,
  limit: number,
  retainedKey?: string,
): void {
  if (!cache) return;
  while (cache.canvases.size > limit) {
    let evictionKey: string | undefined;
    for (const key of cache.canvases.keys()) {
      if (key !== retainedKey) {
        evictionKey = key;
        break;
      }
    }
    evictionKey ??= cache.canvases.keys().next().value;
    if (!evictionKey) return;
    const evictedCanvas = cache.canvases.get(evictionKey);
    if (evictedCanvas) releaseWorkerResultCanvas(evictedCanvas);
    cache.canvases.delete(evictionKey);
  }
}

function loadStudioKonvaFilters(): Promise<StudioKonvaFiltersModule> {
  if (!studioKonvaFiltersPromise) {
    studioKonvaFiltersPromise = import("./studio-konva-filters")
      .then((mod) => {
        mod.registerStudioKonvaFilters(KonvaRuntime);
        return mod;
      })
      .catch((error) => {
        studioKonvaFiltersPromise = null;
        throw error;
      });
  }
  return studioKonvaFiltersPromise;
}

function cachedBuildImageFilters(el: ImageEl, key: string, mod: StudioKonvaFiltersModule): ImageFilterBuild {
  const cached = imageFilterBuildCache.get(key);
  if (cached) return cached;
  const built = mod.buildImageFilters(el, KonvaRuntime);
  if (imageFilterBuildCache.size >= IMAGE_FILTER_BUILD_CACHE_LIMIT) {
    const oldest = imageFilterBuildCache.keys().next().value;
    if (oldest) imageFilterBuildCache.delete(oldest);
  }
  imageFilterBuildCache.set(key, built);
  return built;
}

export interface StudioKonvaImageNodeProps {
  el: ImageEl;
  draggable: boolean;
  innerRef: (n: Konva.Image | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<ImageEl>) => void;
  dragBoundFunc?: (pos: Konva.Vector2d) => Konva.Vector2d;
  autoFitFrames: FrameEl[] | null;
  onInteractionBegin?: () => boolean;
  onInteractionEnd?: () => void;
  /** 라이브 스트로크가 진행 중이면 GIF 재생 batchDraw 를 쉬어 포인터 프레임 예산을 지킨다. */
  liveStrokeRef?: { readonly current: unknown };
}

// 비동기 로드가 필요한 이미지 노드 — src 가 바뀌면 다시 로드한다.
export function StudioKonvaImageNode({
  el,
  draggable,
  innerRef,
  onSelect,
  onChange,
  dragBoundFunc,
  autoFitFrames,
  onInteractionBegin,
  onInteractionEnd,
  liveStrokeRef,
}: StudioKonvaImageNodeProps) {
  const [loadedImage, setLoadedImage] = useState<LoadedImageState>();
  const [displayImage, setDisplayImage] = useState<DisplayImageState>();
  const [filterModule, setFilterModule] = useState<StudioKonvaFiltersModule | null>(null);
  const [filterWorkerClient, setFilterWorkerClient] = useState<StudioImageFilterWorkerClientModule | null>(null);
  const [gpuFilterModule, setGpuFilterModule] = useState<StudioGpuFilterApplyModule | null>(null);
  const [workerFilteredCanvas, setWorkerFilteredCanvas] = useState<WorkerFilteredCanvasState>();
  const [workerFallbackKey, setWorkerFallbackKey] = useState<string>();
  const imageRef = useRef<Konva.Image | null>(null);
  const filterWorkerSessionRef = useRef<StudioImageFilterWorkerSession | null>(null);
  const workerSourcePixelsRef = useRef<WorkerSourcePixelsState | null>(null);
  const workerResultCacheRef = useRef<WorkerResultCacheState | null>(null);
  // 최신 el을 담아두는 ref — 아래 Worker 필터 effect가 좌표 드래그 등 필터와 무관한 el 변경마다
  // 재실행되지 않도록(의존성은 filterCacheKey/width/height만) 최신 값만 읽어들이는 용도.
  const elRef = useRef(el);
  elRef.current = el;

  useEffect(() => {
    const src = el.src;
    const im = new globalThis.Image();
    let active = true;
    im.onload = () => {
      if (active) setLoadedImage({ image: im, src });
    };
    im.onerror = () => {
      if (!active) return;
      // 현재 src의 재로딩까지 실패했다면 이전 성공 이미지를 남기지 않는다. 다른 src가 이미
      // 성공한 뒤 도착한 오래된 error는 그 상태를 지우지 않는다.
      setLoadedImage((current) => current?.src === src ? undefined : current);
    };
    // 캐시된 data/blob URL은 대입과 같은 tick에 완료될 수 있으므로 handler를 먼저 연결한다.
    im.src = src;
    return () => {
      active = false;
      im.onload = null;
      im.onerror = null;
    };
  }, [el.src]);

  // src가 바뀐 render와 해당 effect 사이에도 이전 이미지를 한 프레임 노출하지 않는다.
  const img = loadedImage?.src === el.src ? loadedImage.image : undefined;
  const flipped = !!el.flipped;
  const flippedY = !!el.flippedY;
  const isAnimatedGif = !!el.isAnimatedGif;
  const displayImg =
    displayImage?.src === el.src
    && displayImage.loadedImage === img
    && displayImage.flipped === flipped
    && displayImage.flippedY === flippedY
    && displayImage.isAnimatedGif === isAnimatedGif
      ? displayImage.image
      : undefined;

  useEffect(() => {
    if (!img) {
      setDisplayImage(undefined);
      return;
    }
    const commitDisplayImage = (image: CanvasImageSource) => {
      setDisplayImage({
        flipped,
        flippedY,
        image,
        isAnimatedGif,
        loadedImage: img,
        src: el.src,
      });
    };
    if (isAnimatedGif) {
      // 반전은 캔버스에 한 프레임을 구워야만 가능한데, 그러면 애니메이션이 멈춘다 — 재생 보존이
      // 우선이므로 이 경로를 건너뛰고 항상 라이브 img를 그대로 쓴다(알려진 한계: 애니메이션 GIF는
      // 좌우/상하 반전이 적용되지 않는다).
      commitDisplayImage(img);
      return;
    }
    const scaleX = flipped ? -1 : 1;
    const scaleY = flippedY ? -1 : 1;
    if (scaleX === 1 && scaleY === 1) {
      commitDisplayImage(img);
      return;
    }
    try {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const cx = c.getContext("2d");
      if (!cx) {
        commitDisplayImage(img);
        return;
      }
      cx.translate(scaleX === -1 ? w : 0, scaleY === -1 ? h : 0);
      cx.scale(scaleX, scaleY);
      cx.drawImage(img, 0, 0);
      commitDisplayImage(c);
    } catch (error) {
      console.error("[studio] image flip canvas failed, using original image:", error);
      commitDisplayImage(img);
    }
  }, [img, el.src, flipped, flippedY, isAnimatedGif]);

  const hasFilters = hasActiveImageFilters(el);
  const filterCacheKey = imageFilterCacheKey(el);
  useEffect(() => {
    if (!hasFilters || filterModule) return;
    let active = true;
    loadStudioKonvaFilters()
      .then((mod) => {
        if (active) setFilterModule(mod);
      })
      .catch((error) => {
        console.error("Failed to load studio image filters:", error);
      });
    return () => {
      active = false;
    };
  }, [filterModule, hasFilters]);

  // Worker 클라이언트도 같은 조건에서 지연 로드 — 별도 청크라 이 모듈을 먼저 열지 않는 페이지의
  // 첫 청크 예산에 영향을 주지 않는다(loadStudioKonvaFilters와 동일한 이유).
  useEffect(() => {
    if (!hasFilters || filterWorkerClient) return;
    let active = true;
    import("./studio-image-filter-worker-client")
      .then((mod) => {
        if (active) setFilterWorkerClient(mod);
      })
      .catch((error) => {
        console.error("Failed to load studio image filter worker client:", error);
      });
    return () => {
      active = false;
    };
  }, [filterWorkerClient, hasFilters]);

  // M1 GPU(WGSL) 필터 경로 — 지원 5필드 전용, 실패/미지원 시 null이라 기존 Worker 경로로 폴백.
  // konva 미의존 별도 청크라 첫 청크 예산 무영향(worker client 로드와 동일한 이유).
  useEffect(() => {
    if (!hasFilters || gpuFilterModule) return;
    let active = true;
    import("./studio-gpu-filter-apply")
      .then((mod) => {
        if (active) setGpuFilterModule(mod);
      })
      .catch((error) => {
        console.error("Failed to load studio GPU filter module:", error);
      });
    return () => {
      active = false;
    };
  }, [gpuFilterModule, hasFilters]);

  useEffect(() => () => {
    filterWorkerSessionRef.current?.dispose();
    filterWorkerSessionRef.current = null;
    releaseWorkerResultCache(workerResultCacheRef.current);
    workerResultCacheRef.current = null;
  }, [filterWorkerClient]);

  // 보정값 → Konva 필터 배열 + 노드 속성. 캐시 의존성은 직렬화 키로 비교(좌표 드래그 시 재캐시 방지).
  const built = hasFilters && filterModule
    ? cachedBuildImageFilters(el, filterCacheKey, filterModule)
    : EMPTY_IMAGE_FILTER_BUILD;
  // HiDPI 필터 밀도 — 활성 보정이 전부 밀도 불변(포인트/정규화 연산)일 때만 min(2, dpr)로
  // 슈퍼샘플링한다("같은 룩, 더 선명한 픽셀"). px 단위 필터가 하나라도 있으면 1× 유지.
  const requestedFilterDensity = hasFilters && filterModule
    ? studioImageFilterSupersampleDensity({
        attrs: built.attrs,
        el,
        devicePixelRatio: globalThis.devicePixelRatio || 1,
      })
    : 1;
  const workerBaseWidth = Math.max(1, Math.round(el.width));
  const workerBaseHeight = Math.max(1, Math.round(el.height));
  const densifiedWidth = Math.max(1, Math.round(el.width * requestedFilterDensity));
  const densifiedHeight = Math.max(1, Math.round(el.height * requestedFilterDensity));
  // 슈퍼샘플 결과가 인터랙티브 픽셀 예산을 넘으면 기존 1× 밀도로 되돌린다(예산이 우선).
  const filterDensity = requestedFilterDensity > 1
    && Number.isSafeInteger(densifiedWidth * densifiedHeight)
    && densifiedWidth * densifiedHeight <= IMAGE_FILTER_INTERACTIVE_MAX_PIXELS
      ? requestedFilterDensity
      : 1;
  const workerWidth = filterDensity > 1 ? densifiedWidth : workerBaseWidth;
  const workerHeight = filterDensity > 1 ? densifiedHeight : workerBaseHeight;
  const workerPixelCount = workerWidth * workerHeight;
  const workerDimensionsSafe = Number.isSafeInteger(workerWidth)
    && Number.isSafeInteger(workerHeight)
    && Number.isSafeInteger(workerPixelCount)
    && workerPixelCount <= IMAGE_FILTER_INTERACTIVE_MAX_PIXELS;
  // react-konva filters prop 타입(Konva.NodeConfig["filters"])과 맞춘다.
  const filters: NonNullable<Konva.NodeConfig["filters"]> =
    (workerDimensionsSafe ? built.filters : []) as NonNullable<Konva.NodeConfig["filters"]>;
  const filterAttrs = built.attrs;
  const cachePad = built.cachePad; // 테두리(outline)가 실루엣 밖으로 자라도록 캐시에 추가할 여백(px).

  // Worker 오프로드 경로 — cachePad>0(테두리 필터 활성)은 Konva의 cache({offset}) 위치 보정을
  // 정확히 복제하기 까다로워 제외하고 기존 Konva 내장 cache+filters 경로로 둔다. 애니메이션 GIF도
  // 기존과 동일하게 필터 미적용(아래 cache effect의 조건과 일치, 새 동작 아님).
  const useWorkerFilterPath =
    workerDimensionsSafe
    && hasFilters && !!filterModule && !!filterWorkerClient && cachePad === 0 && !el.isAnimatedGif;
  const workerRequestKey = JSON.stringify([el.src, filterCacheKey, workerWidth, workerHeight]);
  const workerPipelineActive = useWorkerFilterPath && workerFallbackKey !== workerRequestKey;
  const workerResultCacheLimit = el.filterPageComposite === true
    ? PAGE_COMPOSITE_FILTER_RESULT_CACHE_LIMIT
    : IMAGE_FILTER_WORKER_RESULT_CACHE_LIMIT;

  const currentWorkerFilteredCanvas =
    workerFilteredCanvas?.src === el.src
    && workerFilteredCanvas.source === displayImg
    && workerFilteredCanvas.filterKey === filterCacheKey
    && workerFilteredCanvas.width === workerWidth
    && workerFilteredCanvas.height === workerHeight
      ? workerFilteredCanvas.canvas
      : undefined;

  // Interactive Worker path: debounce slider bursts, keep one Worker session alive, and cache the
  // source RGBA snapshot so a parameter-only tick does not redraw/getImageData again. The request
  // still gets a fresh transferable copy because postMessage detaches ownership by design.
  useEffect(() => {
    if (!useWorkerFilterPath || !displayImg || !filterWorkerClient) {
      setWorkerFilteredCanvas(undefined);
      setWorkerFallbackKey(undefined);
      workerSourcePixelsRef.current = null;
      releaseWorkerResultCache(workerResultCacheRef.current);
      workerResultCacheRef.current = null;
      return;
    }
    const src = el.src;
    const source = displayImg;
    const filterKey = filterCacheKey;
    const width = workerWidth;
    const height = workerHeight;
    const requestKey = workerRequestKey;
    let controller: AbortController | null = null;
    let cancelled = false;
    setWorkerFallbackKey((current) => current === requestKey ? undefined : current);
    // A regular image can retain several recent filter results. If the same source becomes a
    // full-page composite, enforce its stricter one-canvas budget as soon as the mode changes,
    // without waiting for another Worker result to arrive.
    trimWorkerResultCache(workerResultCacheRef.current, workerResultCacheLimit, filterKey);

    const timer = setTimeout(() => {
      let resultCache = workerResultCacheRef.current;
      if (
        !resultCache
        || resultCache.source !== source
        || resultCache.width !== width
        || resultCache.height !== height
      ) {
        releaseWorkerResultCache(resultCache);
        resultCache = { canvases: new Map(), height, source, width };
        workerResultCacheRef.current = resultCache;
      }
      const cachedCanvas = resultCache.canvases.get(filterKey);
      if (cachedCanvas) {
        resultCache.canvases.delete(filterKey);
        resultCache.canvases.set(filterKey, cachedCanvas);
        setWorkerFilteredCanvas({ canvas: cachedCanvas, filterKey, height, source, src, width });
        return;
      }

      let sourcePixels = workerSourcePixelsRef.current;
      if (
        !sourcePixels
        || sourcePixels.source !== source
        || sourcePixels.width !== width
        || sourcePixels.height !== height
      ) {
        try {
          const sourceCanvas = document.createElement("canvas");
          sourceCanvas.width = width;
          sourceCanvas.height = height;
          const sourceCtx = sourceCanvas.getContext("2d");
          if (!sourceCtx) return;
          sourceCtx.drawImage(source, 0, 0, width, height);
          const captured = sourceCtx.getImageData(0, 0, width, height);
          sourcePixels = { data: captured.data, height, source, width };
          workerSourcePixelsRef.current = sourcePixels;
        } catch (error) {
          console.error("[studio] image filter canvas preparation failed, using Konva fallback:", error);
          setWorkerFallbackKey(requestKey);
          return;
        }
      }

      // 결과 커밋 경로 — Worker/GPU 어느 쪽 결과든 같은 캐시·상태 갱신을 탄다(verbatim 추출).
      const commitFilteredPixels = (filtered: { data: Uint8ClampedArray; width: number; height: number }) => {
        if (cancelled) return;
        if (filtered.width !== width || filtered.height !== height) return;
        try {
          const outCanvas = document.createElement("canvas");
          outCanvas.width = filtered.width;
          outCanvas.height = filtered.height;
          const outCtx = outCanvas.getContext("2d");
          if (!outCtx) return;
          outCtx.putImageData(
            new ImageData(
              new Uint8ClampedArray(filtered.data),
              filtered.width,
              filtered.height,
            ),
            0,
            0,
          );
          resultCache.canvases.set(filterKey, outCanvas);
          trimWorkerResultCache(resultCache, workerResultCacheLimit, filterKey);
          setWorkerFallbackKey((current) => current === requestKey ? undefined : current);
          setWorkerFilteredCanvas({ canvas: outCanvas, filterKey, height, source, src, width });
        } catch (error) {
          console.error("[studio] image filter canvas commit failed, using Konva fallback:", error);
          setWorkerFallbackKey(requestKey);
        }
      };
      const dispatchWorkerRequest = (): void => {
        controller = new AbortController();
        if (!filterWorkerSessionRef.current) {
          const createSession = filterWorkerClient.createStudioImageFilterWorkerSession;
          if (typeof createSession === "function") {
            filterWorkerSessionRef.current = createSession();
          }
        }
        const request = {
          imageData: {
            data: new Uint8ClampedArray(sourcePixels.data),
            width,
            height,
          },
          el: elRef.current,
        };
        const pending = filterWorkerSessionRef.current
          ? filterWorkerSessionRef.current.run(request, { signal: controller.signal })
          : filterWorkerClient.runStudioImageFilterWorker(request, { signal: controller.signal });
        pending
          .then((result) => {
            commitFilteredPixels(result.imageData);
          })
          .catch((error) => {
            if ((error as { name?: string })?.name === "AbortError") return;
            console.error("[studio] image filter worker failed, using Konva fallback:", error);
            setWorkerFallbackKey(requestKey);
          });
      };
      // M1 GPU 경로 — 지원 5필드 체인만 GPU에서 시도, null(미지원/디바이스 손실/검증 오류)이면
      // 기존 Worker 경로로 그대로 폴백한다. 결과는 동일한 commit/캐시 경로를 공유한다.
      if (gpuFilterModule?.isStudioGpuFilterChainEligible(elRef.current)) {
        const gpuInput = { data: new Uint8ClampedArray(sourcePixels.data), width, height };
        void gpuFilterModule.applyGpuFilterChain(gpuInput, elRef.current)
          .then((gpuResult) => {
            if (cancelled) return;
            if (!gpuResult) {
              dispatchWorkerRequest();
              return;
            }
            commitFilteredPixels(gpuResult);
          })
          .catch(() => {
            if (!cancelled) dispatchWorkerRequest();
          });
        return;
      }
      dispatchWorkerRequest();
    }, IMAGE_FILTER_WORKER_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (controller !== null) controller.abort();
    };
  }, [
    useWorkerFilterPath,
    displayImg,
    filterCacheKey,
    filterWorkerClient,
    gpuFilterModule,
    el.src,
    workerWidth,
    workerHeight,
    workerRequestKey,
    workerResultCacheLimit,
  ]);

  const showWorkerCanvas = workerPipelineActive && !!currentWorkerFilteredCanvas;

  useEffect(() => {
    const node = imageRef.current;
    if (!node) return;
    if (displayImg) {
      node.clearCache();
      // Worker 경로가 선택된 동안은 pending 상태에서도 동기 full-filter를 중복 실행하지 않는다.
      // 준비/실행 오류로 fail-closed 된 요청만 기존 Konva 캐시 경로를 사용한다.
      if (
        workerDimensionsSafe
        && hasFilters
        && filterModule
        && !el.isAnimatedGif
        && !workerPipelineActive
      ) {
        // 테두리가 있으면 offset만큼 캐시 캔버스를 키워 실루엣 바깥에 테두리를 그릴 자리를 만든다.
        // isAnimatedGif는 캐시를 만들지 않는다 — Konva 캐시는 "그 순간의 정적 스냅샷"이라
        // 애니메이션 GIF에 캐시를 씌우면 그 프레임에 멈춘다(필터는 조용히 미적용, 알려진 한계).
        // cachePad === 0 이면 pixelRatio 를 명시해 Worker 스냅샷 밀도와 정확히 일치시킨다 —
        // Konva 10 은 미지정 시 기기 dpr 를 암묵 사용해 px 단위 필터가 Worker 경로와 다르게
        // 보였다(HiDPI에서 효과가 절반으로 줄어듦). 테두리(cachePad>0) 경로는 기존 동작 유지.
        node.cache(cachePad > 0 ? { offset: cachePad } : { pixelRatio: filterDensity });
      }
      node.getLayer()?.batchDraw();
    }
  }, [displayImg, el.width, el.height, filterCacheKey, hasFilters, filterModule, cachePad, el.isAnimatedGif, workerPipelineActive, workerDimensionsSafe, filterDensity]);

  // 애니메이션 GIF 주기적 리렌더 — 브라우저가 img(HTMLImageElement)를 내부적으로 계속
  // 디코딩·재생하지만(studio-gif-element.ts 헤더 참고), Konva는 그리기 시점의 스냅샷만 캔버스에
  // 굽는다. displayImg가 라이브 img 그 자체를 가리키는 동안(위 플립-굽기 effect: 플립 없음, 또는
  // isAnimatedGif라 플립 우회) 주기적으로 getLayer().batchDraw()를 호출해 "그 순간 브라우저가
  // 디코딩해 둔 프레임"을 다시 그리게 한다.
  // el.frames(다중 프레임 셀 애니메이션)와는 상호배타적으로 취급한다 — 온스킨/타임라인 재생
  // 미리보기가 이미 같은 KImage 노드를 건드리는 상황과 겹치면 정의되지 않은 방식으로 충돌하므로,
  // frames가 실질적으로 여러 장(2장 이상)이면 이 루프를 아예 돌리지 않는다(그 경우 frames 쪽
  // 렌더링이 이 요소를 담당 — isAnimTarget과 동일한 조건식).
  useEffect(() => {
    if (!el.isAnimatedGif || !displayImg) return;
    if (el.frames && el.frames.length > 1) return;
    const node = imageRef.current;
    if (!node) return;
    // ≈12fps 스로틀 — 대다수 GIF 인코더의 실제 프레임 속도 근방이라 시각적으로 놓치는 프레임이
    // 사실상 없으면서, 60fps rAF 그대로 부르는 것 대비 풀 레이어 batchDraw 호출을 약 80% 줄인다
    // (이 KImage가 속한 Layer는 페이지의 모든 요소를 함께 담는 단일 메인 레이어라 배치 하나당
    // 비용이 작지 않다).
    const FRAME_INTERVAL_MS = 80;
    let raf = 0;
    let lastDrawAt = 0;
    const tick = (now: number) => {
      // 라이브 스트로크 중에는 메인 레이어 전체 batchDraw 를 쉰다 — GIF 한 프레임보다
      // 포인터 프레임 예산이 우선이고, 스트로크가 끝나면 다음 틱에 자연 재개된다.
      if (!liveStrokeRef?.current && now - lastDrawAt >= FRAME_INTERVAL_MS) {
        lastDrawAt = now;
        node.getLayer()?.batchDraw();
      }
      raf = globalThis.requestAnimationFrame(tick);
    };
    raf = globalThis.requestAnimationFrame(tick);
    return () => globalThis.cancelAnimationFrame(raf);
  }, [el.isAnimatedGif, el.frames, displayImg, liveStrokeRef]);

  if (!displayImg) return null;

  // Worker가 이미 최종 픽셀을 계산해 뒀으면 그 캔버스를 그대로 그린다(filters/filterAttrs는
  // 비워 Konva가 다시 필터링하지 않게 한다) — 아니면 기존과 동일하게 원본 + Konva 필터.
  const imageSource: CanvasImageSource = showWorkerCanvas ? currentWorkerFilteredCanvas! : displayImg;
  const activeFilters: Konva.NodeConfig["filters"] =
    workerPipelineActive || !workerDimensionsSafe ? undefined : filters;
  const activeFilterAttrs = workerPipelineActive || !workerDimensionsSafe ? {} : filterAttrs;

  return (
    <KImage
      studioElementId={el.id}
      ref={(n) => {
        imageRef.current = n;
        innerRef(n);
      }}
      image={imageSource}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      opacity={el.opacity ?? 1}
      filters={activeFilters}
      {...activeFilterAttrs}
      shadowColor={el.shadowColor}
      shadowEnabled={!!el.shadowColor}
      shadowBlur={el.shadowBlur ?? 0}
      shadowOffsetX={el.shadowOffsetX ?? 0}
      shadowOffsetY={el.shadowOffsetY ?? 0}
      shadowOpacity={el.shadowOpacity ?? 1}
      cornerRadius={el.cornerRadius ?? 0}
      {...toKonvaSkewAttrs(el)}
      {...resizableNodeProps<Partial<ImageEl>>({
        draggable,
        dragBoundFunc,
        onSelect,
        onChange,
        onInteractionBegin,
        onInteractionEnd,
      })}
      onDragEnd={(e) => {
        // 패널 자동맞춤(studio-panel-autofit) — resizableNodeProps 의 기본 onDragEnd({x,y}만
        // 패치)를 이 이미지 한정으로 덮어쓴다. autoFitFrames 는 호출부(renderEl)가 이미 "그룹
        // 드래그 중이 아니고 자격도 있음"까지 걸러서 넘긴다 — null 이거나 빈 배열이면 시도조차
        // 하지 않고 기존과 완전히 동일하게 동작한다.
        try {
          const draggedX = e.target.x();
          const draggedY = e.target.y();
          const fit =
            autoFitFrames && autoFitFrames.length > 0
              ? computePanelAutoFitPatch(
                  { x: draggedX, y: draggedY, width: el.width, height: el.height },
                  autoFitFrames
                )
              : null;
          onChange(fit ?? { x: draggedX, y: draggedY });
        } finally {
          onInteractionEnd?.();
        }
      }}
    />
  );
}
