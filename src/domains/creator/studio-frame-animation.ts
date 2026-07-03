/**
 * Studio Frame Animation — 프레임별 셀 애니메이션(플립북) 저작 + 어니언스키닝 + WebM 플래튼 내보내기.
 * ImageEl에 frames 배열을 얹어 "애니메이션 셀"로 승격시킨다. el.src는 항상 현재 표시 프레임의
 * src와 동일하게 유지되어 기존 정적 렌더링/내보내기 경로는 무변경으로 동작한다.
 * 내보내기는 studio-motion-export의 캡처/레코더 메커니즘(createDefaultMotionExportDeps ·
 * pickMotionVideoMime · recommendVideoBitsPerSecond · MotionExportCancelledError ·
 * loadMotionCutImages · isMotionExportSupported)을 그대로 재사용한다 — MediaRecorder/
 * captureStream 로직은 여기서 다시 구현하지 않는다.
 */
import {
  MotionExportCancelledError,
  createDefaultMotionExportDeps,
  isMotionExportCancelled,
  isMotionExportSupported,
  loadMotionCutImages,
  pickMotionVideoMime,
  recommendVideoBitsPerSecond,
  type MotionCutImage,
  type MotionExportDeps,
  type MotionExportProgress,
  type MotionExportResult,
} from "./studio-motion-export";

// re-export the three studio-motion-export symbols the panel needs, so the panel
// only ever imports from ONE module for anim-specific work.
export { isMotionExportCancelled, isMotionExportSupported, loadMotionCutImages };
export type { MotionCutImage, MotionExportProgress, MotionExportResult };

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// ── 프레임 데이터 모델 ──────────────────────────────────────────────

export interface StudioAnimFrame {
  id: string;
  src: string; // 래스터화된 PNG dataURL(프레임 1장, stage 캡처 결과)
  durationMs?: number; // 이 프레임만의 개별 노출 시간. 미설정 시 fps 기반 균등 시간.
}

export const DEFAULT_FRAME_FPS = 12;
export const MIN_FRAME_FPS = 1;
export const MAX_FRAME_FPS = 30;
// 프레임 상한 — 각 프레임이 PNG dataURL 통째로 문서 JSON에 인라인 저장되므로(기존 ImageEl.src와
// 동일 전략) 무한 성장은 문서 크기/히스토리 스냅샷 비용을 폭주시킨다. 60장(12fps 기준 5초 루프)은
// 눈짓/걷기/짧은 개그 루프에 충분하다.
export const MAX_ANIM_FRAMES = 60;

// 프레임 개별 노출 시간(setFrameDuration) 안전 범위 — 너무 짧으면 사실상 안 보이고, 너무 길면
// "애니메이션"이라 부르기 애매해진다(정지 컷과 구분 어려움).
const MIN_FRAME_DURATION_MS = 16;
const MAX_FRAME_DURATION_MS = 60_000;

export function normalizeFrameFps(fps: number | undefined): number {
  if (fps === undefined || !Number.isFinite(fps)) return DEFAULT_FRAME_FPS;
  return Math.round(clamp(fps, MIN_FRAME_FPS, MAX_FRAME_FPS));
}

/** 프레임 1장의 노출 시간(ms) — durationMs가 유효하면 그 값, 아니면 fps 기반 균등 시간. 순수. */
export function frameDurationMs(frame: StudioAnimFrame, fps: number): number {
  if (frame.durationMs !== undefined && Number.isFinite(frame.durationMs) && frame.durationMs > 0) {
    return frame.durationMs;
  }
  return 1000 / normalizeFrameFps(fps);
}

/** frames와 같은 순서/길이의 노출 시간(ms) 배열. 순수. */
export function frameDurationsMs(frames: StudioAnimFrame[], fps: number): number[] {
  return frames.map((frame) => frameDurationMs(frame, fps));
}

export function createAnimFrame(src: string, id: string): StudioAnimFrame {
  return { id, src };
}

// ── 프레임 배열 조작(불변, studio-layers.ts 스타일) ─────────────────

/**
 * afterId 프레임 바로 뒤(없거나 미지정이면 맨 끝)에 frame을 삽입한 새 배열. 배열 길이가 이미
 * MAX_ANIM_FRAMES면 원본을 그대로 반환(무추가) — 호출측(패널)이 상한을 UI에서 안내한다. 순수.
 */
export function insertFrame(frames: StudioAnimFrame[], frame: StudioAnimFrame, afterId?: string | null): StudioAnimFrame[] {
  if (frames.length >= MAX_ANIM_FRAMES) return frames;
  if (afterId == null) return [...frames, frame];
  const index = frames.findIndex((f) => f.id === afterId);
  if (index === -1) return [...frames, frame];
  return [...frames.slice(0, index + 1), frame, ...frames.slice(index + 1)];
}

/** id 프레임 제거. 마지막 1장은 삭제 거부(원본 그대로 반환) — 애니메이션 요소는 항상 ≥1 프레임 유지. 순수. */
export function removeFrame(frames: StudioAnimFrame[], id: string): StudioAnimFrame[] {
  if (frames.length <= 1) return frames;
  const next = frames.filter((f) => f.id !== id);
  return next.length === frames.length ? frames : next;
}

/** id 프레임을 바로 뒤에 복제(newId). 상한 도달 시 무추가(원본 반환). 순수. */
export function duplicateFrame(frames: StudioAnimFrame[], id: string, newId: string): StudioAnimFrame[] {
  if (frames.length >= MAX_ANIM_FRAMES) return frames;
  const index = frames.findIndex((f) => f.id === id);
  if (index === -1) return frames;
  const copy: StudioAnimFrame = { ...frames[index]!, id: newId };
  return [...frames.slice(0, index + 1), copy, ...frames.slice(index + 1)];
}

/** id 프레임을 toIndex(범위 클램프)로 이동. 순수. */
export function reorderFrame(frames: StudioAnimFrame[], id: string, toIndex: number): StudioAnimFrame[] {
  const fromIndex = frames.findIndex((f) => f.id === id);
  if (fromIndex === -1) return frames;
  const target = clampFrameIndex(frames, toIndex);
  if (target === fromIndex) return frames;
  const next = frames.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(target, 0, moved!);
  return next;
}

/** id 프레임의 개별 노출 시간 설정(null이면 해제 → fps 기반 균등 시간으로 복귀). 순수. */
export function setFrameDuration(frames: StudioAnimFrame[], id: string, durationMs: number | null): StudioAnimFrame[] {
  return frames.map((f) =>
    f.id === id
      ? { ...f, durationMs: durationMs === null ? undefined : Math.round(clamp(durationMs, MIN_FRAME_DURATION_MS, MAX_FRAME_DURATION_MS)) }
      : f
  );
}

/** id의 인덱스. 없으면(또는 id가 null/undefined면) -1. 순수. */
export function frameIndexOf(frames: StudioAnimFrame[], id: string | null | undefined): number {
  if (id == null) return -1;
  return frames.findIndex((f) => f.id === id);
}

/** index를 [0, frames.length-1]로 클램프. 빈 배열이면 0. 순수. */
export function clampFrameIndex(frames: StudioAnimFrame[], index: number): number {
  if (frames.length === 0) return 0;
  return Math.round(clamp(index, 0, frames.length - 1));
}

// ── 어니언스키닝(순수 계산 — Konva 노드는 만들지 않는다) ─────────────

export interface OnionSkinSettings {
  enabled: boolean;
  prevCount: number; // 0..3
  nextCount: number; // 0..3
  opacity: number; // 0..1 — 가장 가까운 인접 프레임(offset ±1)의 불투명도
  tint: boolean; // true면 이전=빨강·다음=파랑 색조 힌트(렌더는 통합 단계 책임)
}

export const DEFAULT_ONION_SKIN: OnionSkinSettings = {
  enabled: true,
  prevCount: 1,
  nextCount: 1,
  opacity: 0.35,
  tint: true,
};

export function normalizeOnionSkinSettings(s: Partial<OnionSkinSettings> | undefined): OnionSkinSettings {
  const merged = { ...DEFAULT_ONION_SKIN, ...s };
  return {
    enabled: !!merged.enabled,
    prevCount: Math.round(clamp(merged.prevCount, 0, 3)),
    nextCount: Math.round(clamp(merged.nextCount, 0, 3)),
    opacity: clamp01(merged.opacity),
    tint: !!merged.tint,
  };
}

export interface OnionSkinLayer {
  frame: StudioAnimFrame;
  offset: number; // -2,-1,1,2 (음수=이전, 양수=다음)
  opacity: number; // settings.opacity / |offset| (선형 조화 감쇠), clamp01
  tint: "prev" | "next" | "none";
}

/**
 * 활성 인덱스 기준 렌더할 어니언스킨 레이어(이전 쪽 가까운 순 → 다음 쪽 가까운 순). 시퀀스
 * 양끝을 넘어가면 멈춘다(래핑 없음 — 첫/마지막 프레임에서 반대쪽 끝 프레임이 유령처럼 겹쳐
 * 보이면 작화 기준이 헷갈리기 때문). enabled=false 이거나 frames.length<2 면 []. 순수.
 */
export function onionSkinLayers(frames: StudioAnimFrame[], activeIndex: number, settings: OnionSkinSettings): OnionSkinLayer[] {
  if (!settings.enabled || frames.length < 2) return [];
  const index = clampFrameIndex(frames, activeIndex);
  const prevCount = Math.round(clamp(settings.prevCount, 0, 3));
  const nextCount = Math.round(clamp(settings.nextCount, 0, 3));
  const layers: OnionSkinLayer[] = [];
  for (let step = 1; step <= prevCount; step++) {
    const i = index - step;
    if (i < 0) break;
    layers.push({ frame: frames[i]!, offset: -step, opacity: clamp01(settings.opacity / step), tint: settings.tint ? "prev" : "none" });
  }
  for (let step = 1; step <= nextCount; step++) {
    const i = index + step;
    if (i >= frames.length) break;
    layers.push({ frame: frames[i]!, offset: step, opacity: clamp01(settings.opacity / step), tint: settings.tint ? "next" : "none" });
  }
  return layers;
}

// ── 재생 타이밍(패널의 재생 미리보기 AND 내보내기 루프가 공유) ────────

/**
 * durations(ms, 1루프분)와 경과 시간으로 현재 표시할 프레임 인덱스. loop=false면 마지막
 * 프레임에서 멈춘다(클램프). durations가 비어 있거나 합이 0이면 0. 순수.
 */
export function frameIndexAtElapsed(durations: number[], elapsedMs: number, loop: boolean): number {
  if (durations.length === 0) return 0;
  const total = durations.reduce((sum, d) => sum + Math.max(0, d), 0);
  if (total <= 0) return 0;
  const t = loop ? ((elapsedMs % total) + total) % total : clamp(elapsedMs, 0, total - 0.0001);
  let acc = 0;
  for (let i = 0; i < durations.length; i++) {
    acc += Math.max(0, durations[i]!);
    if (t < acc) return i;
  }
  return durations.length - 1;
}

// ── 내보내기(플래튼 → WebM) ──────────────────────────────────────────

export const FRAME_ANIM_EXPORT_SCALE_PRESETS = [
  { id: "1x", label: "표준 화질 (1x)", pixelRatio: 1 },
  { id: "2x", label: "고화질 (2x, 권장)", pixelRatio: 2 },
] as const;

export const FRAME_ANIM_LOOP_COUNT_PRESETS = [
  { id: "x3", label: "3회 반복", loopCount: 3 },
  { id: "x5", label: "5회 반복", loopCount: 5 },
  { id: "x10", label: "10회 반복 (짧은 루프에 추천)", loopCount: 10 },
] as const;

// 캔버스 캡처(레코더) fps — 소스 프레임 fps와 무관, 고정 30(motion-export의 기본 fps와 동일 톤).
const FRAME_ANIM_CAPTURE_FPS = 30;

export interface FrameAnimationExportOptions {
  loopCount: number; // 1..20, 기본 3
  pixelRatio: number; // 1..4, 기본 2
  background: string; // 단색 배경(WebM 알파 미지원), 기본 "#ffffff"
}

export const DEFAULT_FRAME_ANIMATION_EXPORT_OPTIONS: FrameAnimationExportOptions = {
  loopCount: 3,
  pixelRatio: 2,
  background: "#ffffff",
};

export interface FrameAnimationExportPlan {
  width: number;
  height: number;
  captureFps: number; // 캔버스 캡처(레코더) fps — 소스 프레임 fps와 무관, 고정 30
  frameDurations: number[]; // frames와 같은 순서/길이, ms, 1루프분
  loopDurationMs: number;
  loopCount: number;
  durationSec: number; // loopDurationMs * loopCount / 1000
}

/**
 * 애니메이션 셀 하나를 WebM으로 내보내기 위한 순수 플랜. frames가 비어 있으면 durationSec=0
 * (runner가 에러 throw). 1장뿐이면 정지 영상 1루프분(허용 — 게이트는 UI 책임). 순수.
 */
export function planFrameAnimationExport(
  elWidth: number,
  elHeight: number,
  frames: StudioAnimFrame[],
  fps: number,
  options?: Partial<FrameAnimationExportOptions>
): FrameAnimationExportPlan {
  const o = { ...DEFAULT_FRAME_ANIMATION_EXPORT_OPTIONS, ...options };
  const pixelRatio = clamp(o.pixelRatio, 1, 4);
  const loopCount = Math.round(clamp(o.loopCount, 1, 20));
  const frameDurations = frameDurationsMs(frames, fps);
  const loopDurationMs = frameDurations.reduce((sum, d) => sum + d, 0);
  return {
    width: Math.max(1, Math.round(elWidth * pixelRatio)),
    height: Math.max(1, Math.round(elHeight * pixelRatio)),
    captureFps: FRAME_ANIM_CAPTURE_FPS,
    frameDurations,
    loopDurationMs,
    loopCount,
    durationSec: (loopDurationMs * loopCount) / 1000,
  };
}

/** 내보내기 파일명 — 기존 이미지 내보내기 규칙과 나란한 `-frames.webm`. */
export function frameAnimationExportFileName(title: string): string {
  return `${title.trim() || "toonspectrum-frame-anim"}-frames.webm`;
}

export interface FrameAnimationExportRequest {
  plan: FrameAnimationExportPlan;
  images: MotionCutImage[]; // frames와 같은 순서(loadMotionCutImages(frames.map(f=>f.src))의 결과)
  background?: string; // 기본 "#ffffff"
  onProgress?: (progress: MotionExportProgress) => void; // studio-motion-export 타입 그대로 재사용
  deps?: Partial<MotionExportDeps>; // 테스트 주입점 — studio-motion-export와 동일 인터페이스
}

export interface FrameAnimationExportHandle {
  done: Promise<MotionExportResult>; // audio 필드는 항상 "none"
  cancel(): void;
}

interface FrameAnimRunState {
  cancelled: boolean;
  interrupt: (() => void) | null;
}

/**
 * 플랜을 실시간 리플레이하며 WebM으로 녹화한다(runMotionExport와 동일한 구조/취소/정리
 * 패턴의 미러 — 차이는 오직 그리기 콜백뿐: reveal/emphasis/파티클/BGM 없이 매 틱마다
 * frameIndexAtElapsed로 프레임 인덱스를 구해 배경 fillRect 후 이미지를 캔버스 전체 크기로
 * stretch-draw한다). 반환 핸들의 done을 await — 취소 시 MotionExportCancelledError로
 * reject된다(isMotionExportCancelled로 판별 — 새 에러 클래스를 만들지 않는다).
 */
export function startFrameAnimationExport(request: FrameAnimationExportRequest): FrameAnimationExportHandle {
  const deps: MotionExportDeps = { ...createDefaultMotionExportDeps(), ...request.deps };
  const state: FrameAnimRunState = { cancelled: false, interrupt: null };
  return {
    done: runFrameAnimationExport(request, deps, state),
    cancel() {
      if (state.cancelled) return;
      state.cancelled = true;
      state.interrupt?.();
    },
  };
}

async function runFrameAnimationExport(
  request: FrameAnimationExportRequest,
  deps: MotionExportDeps,
  state: FrameAnimRunState
): Promise<MotionExportResult> {
  const { plan } = request;
  if (plan.frameDurations.length === 0 || plan.durationSec <= 0) {
    throw new Error("내보낼 프레임이 없어요.");
  }
  if (request.images.length < plan.frameDurations.length) {
    throw new Error("프레임 이미지 수가 플랜과 맞지 않아요. 다시 시도해주세요.");
  }
  const mimeType = pickMotionVideoMime(deps.isMimeSupported);
  if (!mimeType) throw new Error("이 브라우저는 WebM 영상 인코딩을 지원하지 않아요.");

  const canvas = deps.createCanvas(plan.width, plan.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스 컨텍스트를 만들지 못했어요.");

  const background = request.background ?? "#ffffff";

  const draw = (elapsedMs: number) => {
    const idx = frameIndexAtElapsed(plan.frameDurations, elapsedMs % plan.loopDurationMs, true);
    ctx.globalAlpha = 1;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, plan.width, plan.height);
    const image = request.images[idx];
    if (image) ctx.drawImage(image.source, 0, 0, plan.width, plan.height);
  };
  draw(0); // captureStream 전에 첫 프레임을 채워 검은 첫 프레임을 방지

  const stream = canvas.captureStream(plan.captureFps);

  const chunks: Blob[] = [];
  let recorderError: unknown = null;
  const recorder = deps.createRecorder(stream, {
    mimeType,
    videoBitsPerSecond: recommendVideoBitsPerSecond(plan.width, plan.height, plan.captureFps),
  });
  let settleStopped: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    settleStopped = resolve;
  });
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  recorder.onstop = () => settleStopped();
  recorder.onerror = (event) => {
    recorderError = event ?? new Error("recorder error");
    settleStopped();
  };

  let pendingFrame: number | null = null;
  const cleanup = () => {
    if (pendingFrame != null) {
      deps.cancelFrame(pendingFrame);
      pendingFrame = null;
    }
    try {
      recorder.stop();
    } catch {
      // 이미 정지된 레코더 — 무시
    }
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // 이미 종료된 트랙 — 무시
      }
    }
  };

  try {
    if (state.cancelled) throw new MotionExportCancelledError();
    recorder.start(500); // 500ms 조각으로 청크 수집(장시간 녹화 메모리 분산)

    // 실시간 프레임 루프 — 벽시계 기준 t로 어니언스킨 없이 순수 플립북만 그린다.
    await new Promise<void>((resolve, reject) => {
      const t0 = deps.now();
      state.interrupt = () => {
        if (pendingFrame != null) {
          deps.cancelFrame(pendingFrame);
          pendingFrame = null;
        }
        reject(new MotionExportCancelledError());
      };
      const tick = () => {
        pendingFrame = null;
        if (state.cancelled) {
          reject(new MotionExportCancelledError());
          return;
        }
        const nowMs = deps.now();
        const elapsedSec = (nowMs - t0) / 1000;
        const timeSec = Math.min(elapsedSec, plan.durationSec);
        draw(timeSec * 1000);
        request.onProgress?.({
          phase: "record",
          ratio: clamp01(timeSec / plan.durationSec),
          timeSec,
          durationSec: plan.durationSec,
        });
        if (elapsedSec >= plan.durationSec) {
          resolve();
          return;
        }
        pendingFrame = deps.requestFrame(tick);
      };
      tick();
    });

    // 마무리 — 레코더 정지 후 청크 병합. 취소가 오면 정지 대기를 즉시 깨운다.
    state.interrupt = () => settleStopped();
    request.onProgress?.({
      phase: "finalize",
      ratio: 1,
      timeSec: plan.durationSec,
      durationSec: plan.durationSec,
    });
    try {
      recorder.stop();
    } catch {
      // 이미 멈춘 레코더 — 무시
    }
    await stopped;
    if (state.cancelled) throw new MotionExportCancelledError();
    if (recorderError) throw new Error("영상 인코딩 중 오류가 발생했어요. 다시 시도해주세요.");
    if (chunks.length === 0) throw new Error("녹화된 영상 데이터가 없어요. 다시 시도해주세요.");
    return {
      blob: new Blob(chunks, { type: mimeType }),
      mimeType,
      durationSec: plan.durationSec,
      audio: "none",
    };
  } finally {
    state.interrupt = null;
    cleanup();
  }
}
