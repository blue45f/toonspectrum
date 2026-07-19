import { useEffect, useRef, useState } from "react";
import { Image as KImage } from "react-konva/lib/ReactKonvaCore";

import {
  hasActiveImageFilters,
  imageFilterCacheKey,
} from "./studio-konva-filter-fields";
import { studioKonvaRuntime as KonvaRuntime } from "./studio-konva-runtime";
import { resizableNodeProps } from "./studio-node-props";
import { computePanelAutoFitPatch } from "./studio-panel-autofit";
import { toKonvaSkewAttrs } from "./studio-skew";

import type { FrameEl, ImageEl } from "./studio-element-model";
import type Konva from "konva";

const IMAGE_FILTER_BUILD_CACHE_LIMIT = 200;
type StudioKonvaFiltersModule = typeof import("./studio-konva-filters");
type StudioImageFilterWorkerClientModule = typeof import("./studio-image-filter-worker-client");
type ImageFilterBuild = ReturnType<StudioKonvaFiltersModule["buildImageFilters"]>;
const EMPTY_IMAGE_FILTER_BUILD: ImageFilterBuild = { filters: [], attrs: {}, cachePad: 0 };
const imageFilterBuildCache = new Map<string, ImageFilterBuild>();
let studioKonvaFiltersPromise: Promise<StudioKonvaFiltersModule> | null = null;

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
  const [img, setImg] = useState<HTMLImageElement>();
  const [displayImg, setDisplayImg] = useState<CanvasImageSource>();
  const [filterModule, setFilterModule] = useState<StudioKonvaFiltersModule | null>(null);
  const [filterWorkerClient, setFilterWorkerClient] = useState<StudioImageFilterWorkerClientModule | null>(null);
  const [workerFilteredCanvas, setWorkerFilteredCanvas] = useState<HTMLCanvasElement | undefined>(undefined);
  const imageRef = useRef<Konva.Image | null>(null);
  // 최신 el을 담아두는 ref — 아래 Worker 필터 effect가 좌표 드래그 등 필터와 무관한 el 변경마다
  // 재실행되지 않도록(의존성은 filterCacheKey/width/height만) 최신 값만 읽어들이는 용도.
  const elRef = useRef(el);
  elRef.current = el;

  useEffect(() => {
    const im = new globalThis.Image();
    im.src = el.src;
    im.onload = () => setImg(im);
    return () => {
      im.onload = null;
      im.onerror = null;
    };
  }, [el.src]);

  useEffect(() => {
    if (!img) {
      setDisplayImg(undefined);
      return;
    }
    if (el.isAnimatedGif) {
      // 반전은 캔버스에 한 프레임을 구워야만 가능한데, 그러면 애니메이션이 멈춘다 — 재생 보존이
      // 우선이므로 이 경로를 건너뛰고 항상 라이브 img를 그대로 쓴다(알려진 한계: 애니메이션 GIF는
      // 좌우/상하 반전이 적용되지 않는다).
      setDisplayImg(img);
      return;
    }
    const scaleX = el.flipped ? -1 : 1;
    const scaleY = el.flippedY ? -1 : 1;
    if (scaleX === 1 && scaleY === 1) {
      setDisplayImg(img);
      return;
    }
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d");
    if (cx) {
      cx.translate(scaleX === -1 ? w : 0, scaleY === -1 ? h : 0);
      cx.scale(scaleX, scaleY);
      cx.drawImage(img, 0, 0);
      setDisplayImg(c);
    } else {
      setDisplayImg(img);
    }
  }, [img, el.flipped, el.flippedY, el.isAnimatedGif]);

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

  // 보정값 → Konva 필터 배열 + 노드 속성. 캐시 의존성은 직렬화 키로 비교(좌표 드래그 시 재캐시 방지).
  const built = hasFilters && filterModule
    ? cachedBuildImageFilters(el, filterCacheKey, filterModule)
    : EMPTY_IMAGE_FILTER_BUILD;
  // react-konva filters prop 타입(Konva.NodeConfig["filters"])과 맞춘다.
  const filters: NonNullable<Konva.NodeConfig["filters"]> =
    built.filters as NonNullable<Konva.NodeConfig["filters"]>;
  const filterAttrs = built.attrs;
  const cachePad = built.cachePad; // 테두리(outline)가 실루엣 밖으로 자라도록 캐시에 추가할 여백(px).

  // Worker 오프로드 경로 — cachePad>0(테두리 필터 활성)은 Konva의 cache({offset}) 위치 보정을
  // 정확히 복제하기 까다로워 제외하고 기존 Konva 내장 cache+filters 경로로 둔다. 애니메이션 GIF도
  // 기존과 동일하게 필터 미적용(아래 cache effect의 조건과 일치, 새 동작 아님).
  const useWorkerFilterPath =
    hasFilters && !!filterModule && !!filterWorkerClient && cachePad === 0 && !el.isAnimatedGif;

  // 슬라이더 드래그 매 틱마다 픽셀 루프를 메인 스레드에서 도는 대신, 여기서 Worker에 위임한다.
  // 새 틱이 오면 React의 effect cleanup이 이전 컨트롤러를 abort → 진행 중이던 Worker를 즉시
  // terminate하므로 항상 최신 요청 하나만 실제로 끝까지 계산된다(오래된 결과가 늦게 도착해 화면을
  // 덮어쓰는 일이 없다). 첫 틱(아직 워커 결과 없음)은 아래 cache effect가 Konva 내장 경로로
  // 즉시 필터링해 보여주므로 깜빡임 없이 완료되는 대로 이 캔버스로 자연스럽게 교체된다.
  useEffect(() => {
    if (!useWorkerFilterPath || !displayImg || !filterWorkerClient) {
      setWorkerFilteredCanvas(undefined);
      return;
    }
    const width = Math.max(1, Math.round(el.width));
    const height = Math.max(1, Math.round(el.height));
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = width;
    sourceCanvas.height = height;
    const sourceCtx = sourceCanvas.getContext("2d");
    if (!sourceCtx) return;
    sourceCtx.drawImage(displayImg, 0, 0, width, height);
    const imageData = sourceCtx.getImageData(0, 0, width, height);

    const controller = new AbortController();
    let cancelled = false;
    filterWorkerClient
      .runStudioImageFilterWorker({ imageData, el: elRef.current }, { signal: controller.signal })
      .then((result) => {
        if (cancelled) return;
        const outCanvas = document.createElement("canvas");
        outCanvas.width = result.imageData.width;
        outCanvas.height = result.imageData.height;
        const outCtx = outCanvas.getContext("2d");
        if (!outCtx) return;
        // ImageData 생성자는 ArrayBuffer 백업 뷰만 받는다 — postMessage 전송은 항상 진짜
        // ArrayBuffer라 안전하지만(SharedArrayBuffer 아님) 타입상 Uint8ClampedArray<ArrayBufferLike>
        // 로 넓혀져 있어 새 뷰로 감싸 좁힌다.
        outCtx.putImageData(
          new ImageData(
            new Uint8ClampedArray(result.imageData.data),
            result.imageData.width,
            result.imageData.height,
          ),
          0,
          0,
        );
        setWorkerFilteredCanvas(outCanvas);
      })
      .catch((error) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        console.error("[studio] image filter worker failed, keeping last preview:", error);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [useWorkerFilterPath, displayImg, filterCacheKey, filterWorkerClient, el.width, el.height]);

  const showWorkerCanvas = useWorkerFilterPath && !!workerFilteredCanvas;

  useEffect(() => {
    const node = imageRef.current;
    if (!node) return;
    if (displayImg) {
      node.clearCache();
      // Worker 캔버스로 이미 교체됐으면 픽셀이 최종 상태라 Konva 재캐시가 낭비다 — 건너뛴다.
      if (hasFilters && filterModule && !el.isAnimatedGif && !showWorkerCanvas) {
        // 테두리가 있으면 offset만큼 캐시 캔버스를 키워 실루엣 바깥에 테두리를 그릴 자리를 만든다.
        // isAnimatedGif는 캐시를 만들지 않는다 — Konva 캐시는 "그 순간의 정적 스냅샷"이라
        // 애니메이션 GIF에 캐시를 씌우면 그 프레임에 멈춘다(필터는 조용히 미적용, 알려진 한계).
        node.cache(cachePad > 0 ? { offset: cachePad } : undefined);
      }
      node.getLayer()?.batchDraw();
    }
  }, [displayImg, el.width, el.height, filterCacheKey, hasFilters, filterModule, cachePad, el.isAnimatedGif, showWorkerCanvas]);

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
  const imageSource: CanvasImageSource = showWorkerCanvas ? workerFilteredCanvas! : displayImg;
  const activeFilters: Konva.NodeConfig["filters"] = showWorkerCanvas ? undefined : filters;
  const activeFilterAttrs = showWorkerCanvas ? {} : filterAttrs;

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
