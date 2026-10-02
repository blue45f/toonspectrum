/**
 * VisionPanel: 온디바이스 비전(MediaPipe Tasks Vision).
 * ① 참고 이미지 → 이미지 임베더(MobileNet V3 small) 임베딩 vs 프리셋 썸네일 임베딩 코사인 유사도 → 슬롯별 Top-3 추천,
 *    결정적 OKLab k-means 팔레트 → 레시피 색 추천. ② 사진/카메라 → 포즈 랜드마커 33점·손 랜드마커 21점 → 원본 위 오버레이 →
 *    스코프·거울·가시성 옵션으로 `pose/set`(본 회전)·손 포즈 적용.
 * 모델은 세션(createVisionSession)이 한 번만 시도하고 실패는 failed로 남긴다(무음 대체 없음, ADR-0018). imageEmbedder·poseLandmarker 상태는
 * 계약 `vision/status` 이벤트로 store에 올리고 손 모델(계약 `MEDIAPIPE_MODELS.handLandmarker`)은 패널 안에서만 추적한다.
 * 브라우저 API(모델 로더 동적 import·이미지 디코드·카메라)는 deps prop으로 분리해 jsdom 테스트는 가짜를 주입한다.
 * 스타일 클래스 접두는 `cl-vision-`(core CSS). 오버레이 배치만 인라인 스타일(기능상 필수).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { CHARACTER_SLOT_KINDS, LANDMARK_APPLY_SCOPES, LANDMARK_VISIBILITY_MIN, POSE_SCOPE_LABELS_KO, RECIPE_COLOR_KEYS, SLOT_LABELS_KO, failVisible, isLabFailure } from "../../../contracts";
import { handLandmarksToPose } from "../../../domains/vision/hand-landmarks-to-pose";
import { downsampleRgba } from "../../../domains/vision/image-sampling";
import { extractPalette } from "../../../domains/vision/kmeans-palette";
import { handOverlayPlan, poseOverlayPlan } from "../../../domains/vision/landmark-overlay";
import { controllableBones, landmarksToPose } from "../../../domains/vision/landmarks-to-pose";
import { VISION_MODEL_SPECS, isModelSpecPinned } from "../../../domains/vision/model-assets";
import { recommendColors } from "../../../domains/vision/recommend";
import { createThumbnailEmbeddingCache, recommendFromReference } from "../../../domains/vision/reference-recommender";
import { VISION_MODEL_KEYS, VISION_MODEL_LABELS_KO, resolveHandSide, toContractVisionStatus } from "../../../domains/vision/vision-ports";
import { createVisionSession } from "../../../domains/vision/vision-session";
import { useCatalog, useDispatch, useLabContext, useLabState } from "../lab-store-context";

import type { CapturedRaster, LabFailure, LandmarkApplyScope, RecipeColorKey, SlotKind } from "../../../contracts";
import type { PaletteEntry } from "../../../domains/vision/kmeans-palette";
import type { LandmarkSpace } from "../../../domains/vision/landmark-space";
import type { LandmarksToPoseResult } from "../../../domains/vision/landmarks-to-pose";
import type { ReferenceRecommendation } from "../../../domains/vision/reference-recommender";
import type { HandDetection, PoseDetection, VisionDelegate, VisionImageSource, VisionLoaders, VisionModelKey, VisionModelStatus } from "../../../domains/vision/vision-ports";
import type { VisionSession } from "../../../domains/vision/vision-session";

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** straight alpha RGBA, top-down */
  readonly rgba: Uint8ClampedArray;
  /** MediaPipe 입력. 추정이 끝나면 `releaseSource`로 닫으므로 그 뒤에는 쓰지 않는다. */
  readonly source: VisionImageSource;
  /** 미리보기 URL(없으면 null). Blob URL이면 `releasePreview`로 해제한다. */
  readonly previewUrl: string | null;
  readonly label: string;
  /** source(ImageBitmap)를 닫는다. 추정이 끝난 직후 분석 코드가 부른다. 여러 번 불러도 안전하다. */
  readonly releaseSource?: () => void;
  /** 미리보기 Blob URL을 해제한다. 이미지를 교체하거나 패널이 사라질 때 부른다. 여러 번 불러도 안전하다. */
  readonly releasePreview?: () => void;
}

export interface VisionPanelDeps {
  /** 모델 로더(기본: mediapipe-loader.browser 동적 import) */
  createLoaders(options: { readonly delegate: VisionDelegate }): Promise<VisionLoaders>;
  decodeImage(file: Blob): Promise<DecodedImage>;
  /** 썸네일 래스터 → MediaPipe 입력(기본 ImageData) */
  rasterToImage(raster: CapturedRaster): VisionImageSource;
  /** 없으면 '카메라 미지원' 표시 */
  readonly openCamera?: () => Promise<MediaStream>;
  readonly captureVideo?: (video: HTMLVideoElement) => Promise<DecodedImage>;
  readonly now?: () => number;
}

function hasCanvas2d(): boolean {
  return typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined";
}

/** 브라우저 기본 의존성(createImageBitmap·canvas·getUserMedia) */
export function createBrowserVisionDeps(): VisionPanelDeps {
  const decodeFromDrawable = async (drawable: ImageBitmap | HTMLVideoElement, width: number, height: number, previewUrl: string | null, label: string): Promise<DecodedImage> => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw failVisible("vision-canvas-unavailable", "2D 캔버스를 만들 수 없어 이미지를 읽지 못했습니다.");
    context.drawImage(drawable, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height);
    const source = drawable instanceof HTMLVideoElement ? await createImageBitmap(canvas) : drawable;
    return { width, height, rgba: data.data, source, previewUrl: previewUrl ?? canvas.toDataURL("image/png"), label, releaseSource: () => source.close() };
  };
  const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  return {
    createLoaders: ({ delegate }) => import("../../../domains/vision/mediapipe-loader.browser").then((module) => module.createMediaPipeLoaders({ delegate })),
    async decodeImage(file) {
      if (typeof createImageBitmap !== "function" || !hasCanvas2d()) throw failVisible("vision-decode-unsupported", "이 환경은 createImageBitmap/canvas를 지원하지 않아 이미지를 읽을 수 없습니다.");
      const bitmap = await createImageBitmap(file);
      let previewUrl: string | null = null;
      try {
        previewUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
        const objectUrl = previewUrl;
        const label = file instanceof File ? file.name : "이미지";
        const decoded = await decodeFromDrawable(bitmap, bitmap.width, bitmap.height, objectUrl, label);
        return objectUrl ? { ...decoded, releasePreview: () => URL.revokeObjectURL(objectUrl) } : decoded;
      } catch (error) {
        // 호출자가 DecodedImage를 받지 못하므로 만들어 둔 자원은 여기서 해제한다.
        bitmap.close();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        throw error;
      }
    },
    rasterToImage(raster) {
      if (typeof ImageData === "undefined") throw failVisible("vision-imagedata-unsupported", "이 환경은 ImageData를 지원하지 않아 썸네일을 임베딩할 수 없습니다.");
      return new ImageData(new Uint8ClampedArray(raster.rgba), raster.width, raster.height);
    },
    ...(mediaDevices && typeof mediaDevices.getUserMedia === "function"
      ? {
          openCamera: () => mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }),
          captureVideo: (video: HTMLVideoElement) => decodeFromDrawable(video, video.videoWidth || 640, video.videoHeight || 480, null, "카메라 촬영"),
        }
      : {}),
  };
}

export interface VisionPanelProps {
  readonly deps?: VisionPanelDeps;
}

type ReferenceState =
  | { readonly phase: "idle" }
  | { readonly phase: "working"; readonly step: string }
  | { readonly phase: "ready"; readonly image: DecodedImage; readonly palette: readonly PaletteEntry[]; readonly colors: Partial<Record<RecipeColorKey, string>>; readonly recommendation: ReferenceRecommendation }
  | { readonly phase: "failed"; readonly failure: LabFailure };

type PoseState =
  | { readonly phase: "idle" }
  | { readonly phase: "working"; readonly step: string }
  | { readonly phase: "ready"; readonly image: DecodedImage; readonly detection: PoseDetection; readonly hands: readonly HandDetection[] | null; readonly handFailure: LabFailure | null }
  | { readonly phase: "failed"; readonly failure: LabFailure };

/**
 * 기본 시각 함수. 렌더마다 새 함수를 만들면 `useMemo` 의존성이 매번 바뀌어 비전 세션(과 로드된 모델)이 렌더마다 폐기되므로
 * 모듈 상수로 둔다.
 */
const defaultNow = (): number => Date.now();

/**
 * 분석 구역이 쥔 디코드 이미지의 자원 수명. 새 이미지를 받으면 이전 이미지의 미리보기 URL을, 언마운트하면 현재 이미지의
 * 미리보기 URL을 해제한다(source 비트맵은 분석 코드가 추정 직후 `releaseSource`로 닫는다).
 */
interface ImageLifecycle {
  /** 방금 디코드한 이미지를 현재 이미지로 삼는다. 이미 언마운트됐으면 미리보기를 해제하고 false(분석을 이어가지 않는다). */
  track(image: DecodedImage): boolean;
  /** 화면에 남지 않을 이미지(분석 실패)의 미리보기를 해제한다. */
  discard(image: DecodedImage): void;
}

function useImageLifecycle(): ImageLifecycle {
  const current = useRef<DecodedImage | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      current.current?.releasePreview?.();
      current.current = null;
    };
  }, []);
  return useMemo<ImageLifecycle>(
    () => ({
      track(image) {
        if (!active.current) {
          image.releasePreview?.();
          return false;
        }
        const previous = current.current;
        current.current = image;
        if (previous && previous !== image) previous.releasePreview?.();
        return true;
      },
      discard(image) {
        image.releasePreview?.();
        if (current.current === image) current.current = null;
      },
    }),
    [],
  );
}

const COLOR_LABELS_KO: Readonly<Record<RecipeColorKey, string>> = { skin: "피부", iris: "눈동자", hair: "헤어", brow: "눈썹", top: "상의", bottom: "하의", shoes: "신발", accessory: "액세서리" };
const PALETTE_K = 6;
const PALETTE_SEED = 1;
const PALETTE_MAX_SIDE = 160;

function lazyLoaders(create: () => Promise<VisionLoaders>): VisionLoaders {
  let promise: Promise<VisionLoaders> | null = null;
  const get = (): Promise<VisionLoaders> => {
    if (!promise) {
      promise = create().catch((error: unknown) => {
        promise = null;
        throw error;
      });
    }
    return promise;
  };
  return {
    imageEmbedder: () => get().then((loaders) => loaders.imageEmbedder()),
    poseLandmarker: () => get().then((loaders) => loaders.poseLandmarker()),
    handLandmarker: () => get().then((loaders) => loaders.handLandmarker()),
  };
}

function toFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

function describeStatus(status: VisionModelStatus): string {
  switch (status.phase) {
    case "idle":
      return "대기";
    case "loading":
      return "불러오는 중…";
    case "ready":
      return `준비됨 (${status.delegate}, SHA ${status.observedSha256.slice(0, 12)}…${status.pinned ? "" : " 관측값"})`;
    case "failed":
      return `실패: ${status.failure.reasonKo} (${status.failure.code})`;
    default:
      return "";
  }
}

interface ModelStatusListProps {
  readonly session: VisionSession;
  readonly delegate: VisionDelegate;
  readonly onDelegateChange: (delegate: VisionDelegate) => void;
}

function ModelStatusList({ session, delegate, onDelegateChange }: ModelStatusListProps) {
  const statuses = useSyncExternalStore(session.subscribe, session.statuses, session.statuses);
  const ids = useId();
  return (
    <div className="cl-vision-models">
      <div className="cl-vision-row">
        <label htmlFor={`${ids}-delegate`}>델리게이트(생성 전 고정, 자동 전환 없음)</label>
        <select id={`${ids}-delegate`} value={delegate} onChange={(event) => onDelegateChange(event.target.value === "GPU" ? "GPU" : "CPU")}>
          <option value="CPU">CPU</option>
          <option value="GPU">GPU(WebGL2, 브라우저 미검증)</option>
        </select>
      </div>
      <ul className="cl-vision-model-list" aria-label="비전 모델 상태">
        {VISION_MODEL_KEYS.map((key: VisionModelKey) => {
          const spec = VISION_MODEL_SPECS[key];
          const status = statuses[key];
          const pinned = isModelSpecPinned(spec);
          return (
            <li key={key} className="cl-vision-model" data-model={key} data-phase={status.phase}>
              <span className="cl-vision-model-name">{VISION_MODEL_LABELS_KO[key]}</span>
              <span className={`cl-vision-badge ${pinned ? "cl-vision-badge--pinned" : "cl-vision-badge--beta"}`}>{pinned ? "SHA 고정" : "SHA 미고정·베타"}</span>
              <span className="cl-vision-model-status">{describeStatus(status)}</span>
              {status.phase === "idle" ? (
                <button type="button" onClick={() => void session.retry(key)}>
                  불러오기
                </button>
              ) : null}
              {status.phase === "failed" ? (
                <button type="button" onClick={() => void session.retry(key)}>
                  다시 시도
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="cl-vision-hint">wasm은 앱 번들, 모델 파일만 공식 CDN(storage.googleapis.com/mediapipe-models)에서 받습니다. 오프라인이면 실패로 표시됩니다.</p>
    </div>
  );
}

interface ReferenceSectionProps {
  readonly session: VisionSession;
  readonly deps: VisionPanelDeps;
  readonly now: () => number;
}

function ReferenceSection({ session, deps, now }: ReferenceSectionProps) {
  const state = useLabState();
  const catalog = useCatalog();
  const dispatch = useDispatch();
  const { store } = useLabContext();
  const ids = useId();
  const [reference, setReference] = useState<ReferenceState>({ phase: "idle" });
  const cache = useRef(createThumbnailEmbeddingCache());
  const mounted = useRef(true);
  const images = useImageLifecycle();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const analyze = useCallback(
    async (file: Blob): Promise<void> => {
      const update = (next: ReferenceState): void => {
        if (mounted.current) setReference(next);
      };
      let image: DecodedImage | null = null;
      try {
        update({ phase: "working", step: "이미지 디코드" });
        image = await deps.decodeImage(file);
        if (!images.track(image)) return;
        update({ phase: "working", step: "이미지 임베더 로드" });
        const embedder = await session.ensure("imageEmbedder");
        update({ phase: "working", step: "참고 이미지 임베딩" });
        const queryEmbedding = await embedder.port.embed(image.source);
        const small = downsampleRgba({ width: image.width, height: image.height, rgba: image.rgba }, PALETTE_MAX_SIDE);
        const palette = extractPalette(small.rgba, { k: PALETTE_K, seed: PALETTE_SEED });
        const colors = recommendColors(palette);
        update({ phase: "working", step: "프리셋 썸네일 임베딩" });
        const recommendation = await recommendFromReference({
          queryEmbedding,
          thumbnails: store.getState().thumbnails,
          catalog,
          embedRaster: (raster) => embedder.port.embed(deps.rasterToImage(raster)),
          cache: cache.current,
          onProgress: (done, total) => update({ phase: "working", step: `프리셋 썸네일 임베딩 ${done}/${total}` }),
        });
        update({ phase: "ready", image, palette, colors, recommendation });
      } catch (error) {
        if (image) images.discard(image);
        const failure = toFailure("vision-reference-failed", "참고 이미지 분석에 실패했습니다.", error, now());
        update({ phase: "failed", failure });
        store.applyEvent({ type: "failure", failure });
      } finally {
        // 추정이 끝났으니(성공·실패 모두) 입력 비트맵을 닫는다. 이후에는 width·height·미리보기만 쓴다.
        image?.releaseSource?.();
      }
    },
    [catalog, deps, images, now, session, store],
  );

  const onFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) void analyze(file);
  };

  const applyColors = (): void => {
    if (reference.phase !== "ready") return;
    for (const key of RECIPE_COLOR_KEYS) {
      const value = reference.colors[key];
      if (value) dispatch({ type: "color/set", key, value });
    }
  };

  const applyTop = (): void => {
    if (reference.phase !== "ready") return;
    for (const slot of CHARACTER_SLOT_KINDS) {
      const first = reference.recommendation.recommendations[slot][0];
      if (first && state.capabilities[slot].status !== "unavailable") dispatch({ type: "slot/apply", slot, presetId: first.presetId });
    }
  };

  const slotsWithRecommendations = reference.phase === "ready" ? CHARACTER_SLOT_KINDS.filter((slot) => reference.recommendation.recommendations[slot].length > 0) : [];
  const colorEntries = reference.phase === "ready" ? RECIPE_COLOR_KEYS.filter((key) => reference.colors[key] !== undefined) : [];

  return (
    <section className="cl-vision-reference" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>참고 이미지 추천</h3>
      <div className="cl-vision-row">
        <label htmlFor={`${ids}-file`}>참고 이미지 파일</label>
        <input id={`${ids}-file`} type="file" accept="image/*" onChange={onFile} disabled={reference.phase === "working"} />
      </div>
      {reference.phase === "working" ? (
        <p className="cl-vision-progress" role="status">
          분석 중: {reference.step}
        </p>
      ) : null}
      {reference.phase === "failed" ? (
        <p className="cl-vision-failure" role="alert">
          {reference.failure.reasonKo} ({reference.failure.code})
        </p>
      ) : null}
      {reference.phase === "ready" ? (
        <div className="cl-vision-reference-result">
          {reference.image.previewUrl ? <img className="cl-vision-preview" src={reference.image.previewUrl} alt={`참고 이미지 ${reference.image.label}`} /> : null}
          <p className="cl-vision-coverage" role="status">
            후보 {reference.recommendation.coverage.candidates}/{reference.recommendation.coverage.total}개 · 썸네일 임베딩 {reference.recommendation.thumbnails.embedded}개(재사용 {reference.recommendation.thumbnails.reused}개) · 제외 {reference.recommendation.thumbnails.skipped.length}개
          </p>
          {reference.recommendation.thumbnails.skipped.length > 0 ? (
            <details className="cl-vision-skipped">
              <summary>추천에서 제외된 프리셋(썸네일 없음·실패)</summary>
              <ul>
                {reference.recommendation.thumbnails.skipped.map((entry) => (
                  <li key={entry.presetId}>
                    {entry.presetId}: {entry.reasonKo}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="cl-vision-palette">
            <h4>팔레트(OKLab k-means, k={PALETTE_K}, 시드 {PALETTE_SEED})</h4>
            <ul className="cl-vision-swatches" aria-label="팔레트">
              {reference.palette.map((entry) => (
                <li key={entry.hex} className="cl-vision-swatch" style={{ background: entry.hex }} title={`${entry.hex} ${(entry.weight * 100).toFixed(1)}%`}>
                  <span className="cl-vision-swatch-label">
                    {entry.hex} · {(entry.weight * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
            {colorEntries.length > 0 ? (
              <>
                <ul className="cl-vision-color-recs" aria-label="색 추천">
                  {colorEntries.map((key) => (
                    <li key={key}>
                      {COLOR_LABELS_KO[key]}: <span className="cl-vision-swatch-inline" style={{ background: reference.colors[key] }} /> {reference.colors[key]}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={applyColors}>
                  추천 색 적용({colorEntries.length}개)
                </button>
              </>
            ) : (
              <p className="cl-vision-hint">조건에 맞는 색 군집이 없어 색 추천이 없습니다(임의 기본색을 넣지 않습니다).</p>
            )}
          </div>
          <div className="cl-vision-recs">
            <h4>슬롯별 추천(코사인 유사도 상위 3)</h4>
            {slotsWithRecommendations.length === 0 ? <p className="cl-vision-hint">임베딩된 썸네일이 없어 추천할 수 없습니다. 슬롯을 열어 썸네일을 먼저 만드세요.</p> : null}
            {slotsWithRecommendations.length > 0 ? (
              <button type="button" onClick={applyTop}>
                1순위 전체 적용
              </button>
            ) : null}
            {slotsWithRecommendations.map((slot: SlotKind) => {
              const capability = state.capabilities[slot];
              const disabled = capability.status === "unavailable";
              return (
                <div key={slot} className="cl-vision-rec-slot" data-slot={slot}>
                  <h5>
                    {SLOT_LABELS_KO[slot]}
                    {capability.status !== "available" ? <span className={`cl-vision-badge cl-vision-badge--${capability.status}`}>{capability.status === "partial" ? "부분 지원" : "미지원"}</span> : null}
                  </h5>
                  {disabled ? <p className="cl-vision-hint">{capability.reasonKo}</p> : null}
                  <ul>
                    {reference.recommendation.recommendations[slot].map((item, rank) => {
                      const entry = catalog.get(item.presetId);
                      const label = entry?.labelKo ?? item.presetId;
                      const selected = state.recipe.slots[slot] === item.presetId;
                      return (
                        <li key={item.presetId}>
                          <button type="button" aria-pressed={selected} disabled={disabled} title={disabled ? capability.reasonKo : undefined} onClick={() => dispatch({ type: "slot/apply", slot, presetId: item.presetId })}>
                            {rank + 1}. {label} · {item.score.toFixed(2)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface PhotoPoseSectionProps {
  readonly session: VisionSession;
  readonly deps: VisionPanelDeps;
  readonly now: () => number;
}

function PhotoPoseSection({ session, deps, now }: PhotoPoseSectionProps) {
  const dispatch = useDispatch();
  const { store } = useLabContext();
  const ids = useId();
  const [pose, setPose] = useState<PoseState>({ phase: "idle" });
  const [scope, setScope] = useState<LandmarkApplyScope>("full");
  const [mirror, setMirror] = useState(false);
  const [selfie, setSelfie] = useState(false);
  const [visibilityMin, setVisibilityMin] = useState(LANDMARK_VISIBILITY_MIN);
  const [space, setSpace] = useState<LandmarkSpace>("world");
  const [handSides, setHandSides] = useState<Readonly<Record<number, "left" | "right">>>({});
  const [camera, setCamera] = useState<{ readonly stream: MediaStream | null; readonly failure: LabFailure | null }>({ stream: null, failure: null });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mounted = useRef(true);
  const images = useImageLifecycle();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const stopCamera = useCallback((): void => {
    setCamera((current) => {
      current.stream?.getTracks().forEach((track) => track.stop());
      return { stream: null, failure: null };
    });
  }, []);
  useEffect(() => stopCamera, [stopCamera]);
  useEffect(() => {
    const video = videoRef.current;
    if (video && camera.stream) {
      video.srcObject = camera.stream;
      void video.play?.()?.catch(() => undefined);
    }
  }, [camera.stream]);

  const analyze = useCallback(
    async (decode: () => Promise<DecodedImage>): Promise<void> => {
      const update = (next: PoseState): void => {
        if (mounted.current) setPose(next);
      };
      let image: DecodedImage | null = null;
      try {
        update({ phase: "working", step: "이미지 디코드" });
        image = await decode();
        if (!images.track(image)) return;
        update({ phase: "working", step: "포즈 랜드마커 로드" });
        const poseModel = await session.ensure("poseLandmarker");
        update({ phase: "working", step: "포즈 추론" });
        const detection = await poseModel.port.detect(image.source);
        if (!detection) throw failVisible("vision-no-person", "사진에서 사람(포즈)을 찾지 못했습니다.", undefined, now());
        let hands: readonly HandDetection[] | null = null;
        let handFailure: LabFailure | null = null;
        try {
          update({ phase: "working", step: "손 랜드마커 로드·추론" });
          const handModel = await session.ensure("handLandmarker");
          hands = await handModel.port.detect(image.source);
        } catch (error) {
          handFailure = toFailure("vision-hand-failed", "손 랜드마크 추론에 실패했습니다.", error, now());
        }
        setHandSides({});
        update({ phase: "ready", image, detection, hands, handFailure });
        if (!detection.worldLandmarks) setSpace("image");
      } catch (error) {
        if (image) images.discard(image);
        const failure = toFailure("vision-pose-failed", "사진 포즈 인식에 실패했습니다.", error, now());
        update({ phase: "failed", failure });
        store.applyEvent({ type: "failure", failure });
      } finally {
        // 포즈·손 추정이 끝났으니(성공·실패 모두) 입력 비트맵을 닫는다. 이후에는 width·height·미리보기만 쓴다.
        image?.releaseSource?.();
      }
    },
    [images, now, session, store],
  );

  const onFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) void analyze(() => deps.decodeImage(file));
  };

  const openCamera = async (): Promise<void> => {
    if (!deps.openCamera) return;
    try {
      const stream = await deps.openCamera();
      if (mounted.current) setCamera({ stream, failure: null });
      else stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      const failure = toFailure("vision-camera-failed", "카메라를 열지 못했습니다(권한 거부 또는 장치 없음).", error, now());
      if (mounted.current) setCamera({ stream: null, failure });
      store.applyEvent({ type: "failure", failure });
    }
  };

  const capture = (): void => {
    const video = videoRef.current;
    const captureVideo = deps.captureVideo;
    if (!video || !captureVideo) return;
    void analyze(() => captureVideo(video));
  };

  const effectiveSpace: LandmarkSpace = pose.phase === "ready" && !pose.detection.worldLandmarks ? "image" : space;
  const poseResult: LandmarksToPoseResult | null = useMemo(() => {
    if (pose.phase !== "ready") return null;
    const landmarks = effectiveSpace === "world" && pose.detection.worldLandmarks ? pose.detection.worldLandmarks : pose.detection.landmarks;
    try {
      return landmarksToPose(landmarks, { scope, mirror, visibilityMin, space: effectiveSpace, aspectRatio: pose.image.width / pose.image.height });
    } catch {
      return null;
    }
  }, [effectiveSpace, mirror, pose, scope, visibilityMin]);

  const applyPose = (): void => {
    if (!poseResult) return;
    dispatch({ type: "pose/set", pose: poseResult.pose, scope, labelKo: `사진 포즈(${POSE_SCOPE_LABELS_KO[scope]}${mirror ? ", 거울" : ""})` });
  };

  const sideOf = (index: number, hand: HandDetection): "left" | "right" | null => handSides[index] ?? resolveHandSide(hand.reportedHandedness, { selfie });

  const applyHand = (index: number, hand: HandDetection): void => {
    const side = sideOf(index, hand);
    if (!side) return;
    const result = handLandmarksToPose(hand.landmarks, { side, mirror, space: "image", aspectRatio: pose.phase === "ready" ? pose.image.width / pose.image.height : 1 });
    dispatch({ type: "pose/set", pose: result.pose, scope: result.side === "left" ? "left-hand" : "right-hand", labelKo: `사진 손 포즈(${result.side === "left" ? "왼손" : "오른손"})` });
  };

  const overlay = pose.phase === "ready" ? poseOverlayPlan(pose.detection.landmarks, pose.image.width, pose.image.height, { visibilityMin }) : null;
  const handOverlays = pose.phase === "ready" && pose.hands ? pose.hands.map((hand) => handOverlayPlan(hand.landmarks, pose.image.width, pose.image.height)) : [];

  return (
    <section className="cl-vision-pose" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>사진·카메라 포즈 인식</h3>
      <div className="cl-vision-row">
        <label htmlFor={`${ids}-file`}>포즈 사진 파일</label>
        <input id={`${ids}-file`} type="file" accept="image/*" onChange={onFile} disabled={pose.phase === "working"} />
      </div>
      <div className="cl-vision-row cl-vision-camera">
        {deps.openCamera ? (
          camera.stream ? (
            <>
              <video ref={videoRef} className="cl-vision-video" muted playsInline autoPlay aria-label="카메라 미리보기" />
              <button type="button" onClick={capture} disabled={pose.phase === "working" || !deps.captureVideo}>
                촬영
              </button>
              <button type="button" onClick={stopCamera}>
                카메라 닫기
              </button>
            </>
          ) : (
            <button type="button" onClick={() => void openCamera()}>
              카메라 열기
            </button>
          )
        ) : (
          <>
            <button type="button" disabled>
              카메라 열기
            </button>
            <span className="cl-vision-hint">이 환경은 카메라(getUserMedia)를 지원하지 않습니다.</span>
          </>
        )}
        {camera.failure ? (
          <span className="cl-vision-failure" role="alert">
            {camera.failure.reasonKo}
          </span>
        ) : null}
      </div>
      {pose.phase === "working" ? (
        <p className="cl-vision-progress" role="status">
          분석 중: {pose.step}
        </p>
      ) : null}
      {pose.phase === "failed" ? (
        <p className="cl-vision-failure" role="alert">
          {pose.failure.reasonKo} ({pose.failure.code})
        </p>
      ) : null}
      {pose.phase === "ready" && overlay ? (
        <div className="cl-vision-pose-result">
          <div className="cl-vision-photo" style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
            {pose.image.previewUrl ? <img className="cl-vision-preview" src={pose.image.previewUrl} alt={`포즈 사진 ${pose.image.label}`} style={{ display: "block", maxWidth: "100%" }} /> : null}
            <svg className="cl-vision-overlay" viewBox={overlay.viewBox} role="img" aria-label="랜드마크 오버레이" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} preserveAspectRatio="xMidYMid meet">
              {overlay.segments.map((segment) => (
                <line key={`p${segment.from}-${segment.to}`} className="cl-vision-bone" x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} stroke={segment.visible ? "#36c" : "#c33"} strokeWidth={Math.max(1, overlay.width / 300)} strokeDasharray={segment.visible ? undefined : "4 4"} />
              ))}
              {overlay.points.map((point) => (
                <circle key={`p${point.index}`} className="cl-vision-landmark" cx={point.x} cy={point.y} r={Math.max(2, overlay.width / 150)} fill={point.visible ? "#2a7" : "#c33"} opacity={0.35 + 0.65 * point.visibility}>
                  <title>
                    {point.name} ({(point.visibility * 100).toFixed(0)}%)
                  </title>
                </circle>
              ))}
              {handOverlays.map((plan, handIndex) => (
                <g key={`hand-${handIndex}`} className="cl-vision-hand">
                  {plan.segments.map((segment) => (
                    <line key={`h${handIndex}-${segment.from}-${segment.to}`} className="cl-vision-hand-bone" x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} stroke="#e8a" strokeWidth={Math.max(1, overlay.width / 400)} />
                  ))}
                  {plan.points.map((point) => (
                    <circle key={`h${handIndex}-${point.index}`} className="cl-vision-hand-landmark" cx={point.x} cy={point.y} r={Math.max(1.5, overlay.width / 250)} fill="#e8a" />
                  ))}
                </g>
              ))}
            </svg>
          </div>
          <div className="cl-vision-pose-controls">
            <div className="cl-vision-row">
              <label htmlFor={`${ids}-scope`}>적용 범위</label>
              <select id={`${ids}-scope`} value={scope} onChange={(event) => setScope(LANDMARK_APPLY_SCOPES.find((candidate) => candidate === event.target.value) ?? "full")}>
                {LANDMARK_APPLY_SCOPES.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {POSE_SCOPE_LABELS_KO[candidate]}
                  </option>
                ))}
              </select>
            </div>
            <div className="cl-vision-row">
              <label htmlFor={`${ids}-mirror`}>거울 모드(사진 속 왼팔 → 캐릭터 오른팔)</label>
              <input id={`${ids}-mirror`} type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />
            </div>
            <div className="cl-vision-row">
              <label htmlFor={`${ids}-selfie`}>셀피(전면 카메라, 좌우 반전) 사진</label>
              <input id={`${ids}-selfie`} type="checkbox" checked={selfie} onChange={(event) => setSelfie(event.target.checked)} />
            </div>
            <div className="cl-vision-row">
              <label htmlFor={`${ids}-visibility`}>가시성 임계</label>
              <input id={`${ids}-visibility`} type="range" min={0} max={1} step={0.05} value={visibilityMin} onChange={(event) => setVisibilityMin(Number(event.target.value))} />
              <output htmlFor={`${ids}-visibility`}>{visibilityMin.toFixed(2)}</output>
            </div>
            <div className="cl-vision-row">
              <label htmlFor={`${ids}-space`}>랜드마크 좌표</label>
              <select id={`${ids}-space`} value={effectiveSpace} disabled={!pose.detection.worldLandmarks} onChange={(event) => setSpace(event.target.value === "image" ? "image" : "world")}>
                <option value="world">월드(미터)</option>
                <option value="image">이미지(정규화)</option>
              </select>
            </div>
            <p className="cl-vision-pose-summary" role="status">
              {poseResult
                ? `적용 ${poseResult.appliedBones.length}/${controllableBones(scope).length}본 · 건너뜀 ${poseResult.skippedBones.length}본 · 관절 한계 클램프 ${poseResult.clampedBones.length}본`
                : "포즈 변환 실패"}
            </p>
            {poseResult && poseResult.skippedBones.length > 0 ? (
              <details className="cl-vision-skipped">
                <summary>건너뛴 본(사유)</summary>
                <ul>
                  {poseResult.skippedBones.map((entry) => (
                    <li key={entry.bone}>
                      {entry.bone}: {entry.reasonKo}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <button type="button" onClick={applyPose} disabled={!poseResult || poseResult.appliedBones.length === 0}>
              포즈 적용
            </button>
          </div>
          <div className="cl-vision-hands">
            <h4>손 포즈(베타: 굴곡만, 벌림 미적용)</h4>
            {pose.handFailure ? (
              <p className="cl-vision-failure" role="alert">
                {pose.handFailure.reasonKo} ({pose.handFailure.code})
              </p>
            ) : null}
            {pose.hands && pose.hands.length === 0 ? <p className="cl-vision-hint">사진에서 손을 찾지 못했습니다.</p> : null}
            {pose.hands?.map((hand, index) => {
              const side = sideOf(index, hand);
              const sideLabel = side === "left" ? "왼손" : side === "right" ? "오른손" : "미정";
              return (
                <div key={`hand-${index}`} className="cl-vision-hand-item">
                  <span>
                    손 {index + 1}: 모델 보고 {hand.reportedHandedness} → {sideLabel} (점수 {(hand.score * 100).toFixed(0)}%)
                  </span>
                  <label htmlFor={`${ids}-hand-${index}`}>적용 측</label>
                  <select id={`${ids}-hand-${index}`} value={side ?? ""} onChange={(event) => setHandSides((current) => ({ ...current, [index]: event.target.value === "left" ? "left" : "right" }))}>
                    <option value="" disabled>
                      선택
                    </option>
                    <option value="left">왼손</option>
                    <option value="right">오른손</option>
                  </select>
                  <button type="button" disabled={!side} onClick={() => applyHand(index, hand)}>
                    {sideLabel} 포즈 적용
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function VisionPanel({ deps: providedDeps }: VisionPanelProps) {
  const { store } = useLabContext();
  const ids = useId();
  const deps = useMemo(() => providedDeps ?? createBrowserVisionDeps(), [providedDeps]);
  const now = deps.now ?? defaultNow;
  const [delegate, setDelegate] = useState<VisionDelegate>("CPU");
  const session = useMemo(
    () =>
      createVisionSession({
        loaders: lazyLoaders(() => deps.createLoaders({ delegate })),
        onStatus: (_key, status) => {
          const contractStatus = toContractVisionStatus(status);
          if (contractStatus) store.applyEvent({ type: "vision/status", status: contractStatus });
        },
        now,
      }),
    [delegate, deps, now, store],
  );
  useEffect(() => () => session.dispose(), [session]);

  return (
    <section className="cl-vision-panel" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>비전(온디바이스)</h2>
      <ModelStatusList session={session} delegate={delegate} onDelegateChange={setDelegate} />
      <ReferenceSection session={session} deps={deps} now={now} />
      <PhotoPoseSection session={session} deps={deps} now={now} />
    </section>
  );
}
