/**
 * Studio Animation Tracks — 다중 레이어 애니메이션 타임라인(문서=페이지 단위) 순수 모듈.
 * studio-frame-animation.ts(단일 ImageEl 셀 애니메이션)와 짝을 이루되 스코프가 다르다:
 * frame-animation은 "요소 하나가 자기 프레임들을 들고 있음", 이 모듈은 "페이지 하나가
 * 여러 요소(트랙) 각각의 독립된 키프레임 시퀀스를 공유 스크러버 위에" 들고 있다.
 * StudioAnimFrame(id/src/durationMs)·onionSkinLayers·frameIndexAtElapsed·normalizeFrameFps는
 * studio-frame-animation에서 그대로 재사용한다 — 재정의하지 않는다. 단, 이 모델에서
 * StudioAnimFrame.durationMs는 쓰지 않는다(공유 프레임축은 전 트랙이 doc.fps 하나를
 * 공유하므로 프레임당 개별 노출시간 개념이 없다 — 여러 트랙이 서로 다른 커스텀 시간을
 * 주장할 때 공유 스크러버 위에서 어떻게 화해시키는지는 v1 스코프 밖이라 의도적으로 단순화했다).
 * Konva/DOM/React 무의존. El 타입도 import하지 않는다(순환의존 회피 — studio-frame-animation의
 * StudioFrameAnimAnchorEl 구조적 서브셋 관례와 동일 이유).
 */
import {
  DEFAULT_FRAME_FPS,
  MAX_ANIM_FRAMES,
  frameIndexAtElapsed,
  normalizeFrameFps,
  onionSkinLayers,
  type OnionSkinLayer,
  type OnionSkinSettings,
  type StudioAnimFrame,
} from "./studio-frame-animation";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// ── 데이터 모델 ──────────────────────────────────────────────────────

/** Optional transform pose for tweened motion (x/y/rot/scale relative offsets). */
export interface StudioAnimTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export type StudioAnimEase = "linear" | "ease-in-out";

/** 트랙(레이어) 하나의 키프레임 하나. frameIndex는 공유 타임라인 위의 절대 위치(0..frameCount-1). */
export interface StudioAnimKeyframe {
  frameIndex: number;
  frame: StudioAnimFrame; // src만 실제로 쓰인다. durationMs는 이 모델에서 무시(문서 상단 사유 참고).
  /** Optional transform at this keyframe; omitted tracks keep static layout. */
  transform?: StudioAnimTransform;
  ease?: StudioAnimEase;
}

/**
 * 페이지 하나의 다중 레이어 타임라인. tracks는 layerElementId(El.id) → 오름차순 정렬된
 * StudioAnimKeyframe[] (sparse — "가장 최근 keyframe.frameIndex ≤ 조회 인덱스"가 그 프레임의
 * 표시값, held-until-next). 트랙이 없는 요소(레코드에 키가 없음)는 애니메이션과 무관한
 * "정지 레이어"로, 매 프레임 원래 모습 그대로 합성된다.
 */
export interface AnimationTimelineDoc {
  fps: number;
  frameCount: number; // 공유 타임라인 총 길이(프레임 수). 각 트랙 키프레임의 frameIndex 상한.
  tracks: Record<string, StudioAnimKeyframe[]>;
}

export const DEFAULT_TIMELINE_FRAME_COUNT = 24; // 12fps 기준 2초 — 첫 화면에서 다루기 쉬운 길이
export const MIN_TIMELINE_FRAME_COUNT = 1;
// MAX_ANIM_FRAMES(studio-frame-animation)를 재사용한다 — "5초 루프" 문서 크기 story를 앱
// 전역에서 하나로 유지(별도 상수를 새로 만들지 않는다).
export const MAX_TIMELINE_FRAME_COUNT = MAX_ANIM_FRAMES; // 60
// 트랙 하나가 가질 수 있는 최대 키프레임 수 — 위와 동일 상수 재사용(별도 캡 불필요:
// 키프레임은 frameIndex가 겹칠 수 없으므로 frameCount 이하로 자연히 제한되지만, 문서 크기
// 폭주(N트랙 × 60키프레임 각각 PNG dataURL)를 명시적으로 방어하기 위해 트랙별로도 캡한다.
export const MAX_TRACK_KEYFRAMES = MAX_ANIM_FRAMES;

// ── 생성/정규화 ──────────────────────────────────────────────────────

export function createEmptyAnimationTimelineDoc(
  frameCount: number = DEFAULT_TIMELINE_FRAME_COUNT,
  fps: number = DEFAULT_FRAME_FPS
): AnimationTimelineDoc {
  return {
    fps: normalizeFrameFps(fps),
    frameCount: Math.round(clamp(frameCount, MIN_TIMELINE_FRAME_COUNT, MAX_TIMELINE_FRAME_COUNT)),
    tracks: {},
  };
}

/**
 * 과거 문서(필드 없음)·부분 patch·잘못된 값 모두 안전하게 정규화. frameCount가 줄어들면
 * 그 범위를 벗어나는(frameIndex ≥ frameCount) 키프레임은 버리고, 그 결과 트랙이 비면
 * 트랙 자체를 지운다(removeKeyframe과 동일 정리 규칙). 순수.
 */
export function normalizeAnimationTimelineDoc(doc: Partial<AnimationTimelineDoc> | undefined): AnimationTimelineDoc {
  const fps = normalizeFrameFps(doc?.fps);
  const frameCount = Math.round(
    clamp(doc?.frameCount ?? DEFAULT_TIMELINE_FRAME_COUNT, MIN_TIMELINE_FRAME_COUNT, MAX_TIMELINE_FRAME_COUNT)
  );
  const tracks: Record<string, StudioAnimKeyframe[]> = {};
  for (const [trackId, keyframes] of Object.entries(doc?.tracks ?? {})) {
    const kept = (keyframes ?? [])
      .filter((k) => Number.isFinite(k.frameIndex) && k.frameIndex >= 0 && k.frameIndex < frameCount)
      .sort((a, b) => a.frameIndex - b.frameIndex)
      .slice(0, MAX_TRACK_KEYFRAMES);
    if (kept.length > 0) tracks[trackId] = kept;
  }
  return { fps, frameCount, tracks };
}

// ── 문서 레벨 변경(불변, no-op은 동일 참조) ───────────────────────────

export function setDocFps(doc: AnimationTimelineDoc, fps: number): AnimationTimelineDoc {
  const next = normalizeFrameFps(fps);
  return next === doc.fps ? doc : { ...doc, fps: next };
}

/** frameCount 변경 — 줄어들면 범위 밖 키프레임을 버린다(normalizeAnimationTimelineDoc와 동일 규칙). */
export function setFrameCount(doc: AnimationTimelineDoc, frameCount: number): AnimationTimelineDoc {
  const next = Math.round(clamp(frameCount, MIN_TIMELINE_FRAME_COUNT, MAX_TIMELINE_FRAME_COUNT));
  if (next === doc.frameCount) return doc;
  return normalizeAnimationTimelineDoc({ ...doc, frameCount: next });
}

// ── 트랙/키프레임 조회 ────────────────────────────────────────────────

export function hasTrack(doc: AnimationTimelineDoc, trackId: string): boolean {
  return !!doc.tracks[trackId]?.length;
}

export function canAddKeyframe(doc: AnimationTimelineDoc, trackId: string): boolean {
  return (doc.tracks[trackId]?.length ?? 0) < MAX_TRACK_KEYFRAMES;
}

/** frameIndex와 정확히 일치하는 키프레임의 배열 위치. 없으면 -1. (정확매칭 — resolve와 다름) */
export function trackKeyframeIndexOf(track: StudioAnimKeyframe[], frameIndex: number): number {
  return track.findIndex((k) => k.frameIndex === frameIndex);
}

/**
 * 트랙 하나에서 "가장 최근(≤ globalIndex) 키프레임"의 frame을 반환(held-until-next).
 * globalIndex가 첫 키프레임보다 앞이면(아직 아무 것도 지정 안 됨) null — 이 경우 통합부는
 * 그 레이어의 원래(정적) 모습을 그대로 두어야 한다(숨기지 않는다 — 설계 문서 §4 참고). 트랙이
 * 비어 있어도 null. globalIndex는 내부에서 클램프하지 않는다 — frameCount를 넘는 값도 "마지막
 * 키프레임에서 계속 held"로 자연스럽게 처리되므로 의도적으로 관대하다. 순수.
 */
export function resolveTrackFrameAt(track: StudioAnimKeyframe[], globalIndex: number): StudioAnimFrame | null {
  let best: StudioAnimFrame | null = null;
  for (const k of track) {
    if (k.frameIndex > globalIndex) break; // track은 항상 frameIndex 오름차순 정렬 유지
    best = k.frame;
  }
  return best;
}

export function normalizeStudioAnimTransform(value?: Partial<StudioAnimTransform> | null): StudioAnimTransform {
  return {
    x: Number.isFinite(value?.x) ? (value!.x as number) : 0,
    y: Number.isFinite(value?.y) ? (value!.y as number) : 0,
    rotation: Number.isFinite(value?.rotation) ? (value!.rotation as number) : 0,
    scaleX: Number.isFinite(value?.scaleX) ? clamp(value!.scaleX as number, 0.01, 32) : 1,
    scaleY: Number.isFinite(value?.scaleY) ? clamp(value!.scaleY as number, 0.01, 32) : 1,
  };
}

export function easeStudioAnimProgress(t: number, ease: StudioAnimEase = "linear"): number {
  const x = clamp(t, 0, 1);
  if (ease === "ease-in-out") {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }
  return x;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate transform between surrounding keyframes that define transform.
 * Held when only one side exists; identity when none.
 */
export function resolveTrackTransformAt(
  track: StudioAnimKeyframe[],
  globalIndex: number
): StudioAnimTransform {
  if (!track.length) return normalizeStudioAnimTransform();
  let prev: StudioAnimKeyframe | null = null;
  let next: StudioAnimKeyframe | null = null;
  for (const keyframe of track) {
    if (keyframe.transform === undefined) continue;
    if (keyframe.frameIndex <= globalIndex) prev = keyframe;
    if (keyframe.frameIndex >= globalIndex && next === null) next = keyframe;
  }
  if (prev && next && prev.frameIndex !== next.frameIndex && prev.transform && next.transform) {
    const span = next.frameIndex - prev.frameIndex;
    const rawT = (globalIndex - prev.frameIndex) / span;
    const t = easeStudioAnimProgress(rawT, next.ease ?? prev.ease ?? "linear");
    const a = normalizeStudioAnimTransform(prev.transform);
    const b = normalizeStudioAnimTransform(next.transform);
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      rotation: lerp(a.rotation, b.rotation, t),
      scaleX: lerp(a.scaleX, b.scaleX, t),
      scaleY: lerp(a.scaleY, b.scaleY, t),
    };
  }
  if (prev?.transform) return normalizeStudioAnimTransform(prev.transform);
  if (next?.transform) return normalizeStudioAnimTransform(next.transform);
  return normalizeStudioAnimTransform();
}

/**
 * "합성 순서(composite-order) 헬퍼" — zOrderIds(반드시 BACK→FRONT, 즉 StudioPage의 elements
 * 배열 그대로. 레이어 패널 표시용으로 뒤집은 배열을 넘기면 안 된다)를 그 순서 그대로 순회하며
 * 트랙이 있고 이 프레임에 resolve되는 요소만 담은 Map을 만든다(Map은 삽입 순서를 보존하므로
 * 결과 자체가 이미 올바른 합성 순서다). 트랙이 없거나 resolveTrackFrameAt이 null인 요소는
 * 결과에 아예 없다 — 통합부는 "Map에 없으면 원래 모습대로 렌더"로 해석한다. 순수.
 */
export function resolveTimelineComposite(
  doc: AnimationTimelineDoc,
  zOrderIds: readonly string[],
  globalIndex: number
): Map<string, StudioAnimFrame> {
  const result = new Map<string, StudioAnimFrame>();
  for (const id of zOrderIds) {
    const track = doc.tracks[id];
    if (!track) continue;
    const resolved = resolveTrackFrameAt(track, globalIndex);
    if (resolved) result.set(id, resolved);
  }
  return result;
}

/**
 * Preview-only transform poses for tracks that define keyframe.transform.
 * Empty map when no track has transform data at this frame. Pure.
 */
export function resolveTimelineTransforms(
  doc: AnimationTimelineDoc,
  zOrderIds: readonly string[],
  globalIndex: number
): Map<string, StudioAnimTransform> {
  const result = new Map<string, StudioAnimTransform>();
  for (const id of zOrderIds) {
    const track = doc.tracks[id];
    if (!track?.length) continue;
    const hasTransform = track.some((keyframe) => keyframe.transform !== undefined);
    if (!hasTransform) continue;
    result.set(id, resolveTrackTransformAt(track, globalIndex));
  }
  return result;
}

// ── 트랙/키프레임 편집(불변, no-op은 동일 참조) ───────────────────────

/**
 * trackId의 frameIndex 위치에 키프레임을 넣거나(신규) 교체한다(기존 frameIndex 재사용).
 * frameIndex는 [0, doc.frameCount-1]로 클램프. 신규 삽입인데 트랙이 이미 MAX_TRACK_KEYFRAMES면
 * 무추가(원본 doc 그대로 반환) — 호출측(패널)이 상한을 안내한다. 순수.
 */
export function setKeyframe(
  doc: AnimationTimelineDoc,
  trackId: string,
  frameIndex: number,
  frame: StudioAnimFrame
): AnimationTimelineDoc {
  const idx = Math.round(clamp(frameIndex, 0, Math.max(0, doc.frameCount - 1)));
  const track = doc.tracks[trackId] ?? [];
  const existingPos = trackKeyframeIndexOf(track, idx);
  if (existingPos === -1 && track.length >= MAX_TRACK_KEYFRAMES) return doc;
  const nextTrack =
    existingPos === -1
      ? [...track, { frameIndex: idx, frame }].sort((a, b) => a.frameIndex - b.frameIndex)
      : track.map((k, i) => (i === existingPos ? { frameIndex: idx, frame } : k));
  return { ...doc, tracks: { ...doc.tracks, [trackId]: nextTrack } };
}

/** frameIndex의 키프레임 제거. 트랙이 그 결과 비면 tracks에서 키 자체를 지운다(sparse 유지). 순수. */
export function removeKeyframe(doc: AnimationTimelineDoc, trackId: string, frameIndex: number): AnimationTimelineDoc {
  const track = doc.tracks[trackId];
  if (!track) return doc;
  const next = track.filter((k) => k.frameIndex !== frameIndex);
  if (next.length === track.length) return doc; // 없던 frameIndex — no-op
  const nextTracks = { ...doc.tracks };
  if (next.length === 0) delete nextTracks[trackId];
  else nextTracks[trackId] = next;
  return { ...doc, tracks: nextTracks };
}

/**
 * 키프레임 위치 이동. toFrameIndex는 [0, frameCount-1]로 클램프. 이동 목적지에 이미 다른
 * 키프레임이 있으면 그 키프레임을 덮어쓴다(마지막에 놓은 쪽이 이긴다 — UI가 드래그 중 이를
 * 시각적으로 경고하는 게 좋다). fromFrameIndex가 없으면 no-op(동일 참조). 순수.
 */
export function moveKeyframe(
  doc: AnimationTimelineDoc,
  trackId: string,
  fromFrameIndex: number,
  toFrameIndex: number
): AnimationTimelineDoc {
  const track = doc.tracks[trackId];
  if (!track) return doc;
  const fromPos = trackKeyframeIndexOf(track, fromFrameIndex);
  if (fromPos === -1) return doc;
  const to = Math.round(clamp(toFrameIndex, 0, Math.max(0, doc.frameCount - 1)));
  if (to === fromFrameIndex) return doc;
  const moved = { ...track[fromPos]!, frameIndex: to };
  const next = track.filter((_, i) => i !== fromPos).filter((k) => k.frameIndex !== to);
  next.push(moved);
  next.sort((a, b) => a.frameIndex - b.frameIndex);
  return { ...doc, tracks: { ...doc.tracks, [trackId]: next } };
}

/** 트랙 전체 삭제(레이어 삭제 시, 혹은 "이 레이어 애니메이션 해제" 버튼). 없으면 no-op. 순수. */
export function removeTrack(doc: AnimationTimelineDoc, trackId: string): AnimationTimelineDoc {
  if (!doc.tracks[trackId]) return doc;
  const tracks = { ...doc.tracks };
  delete tracks[trackId];
  return { ...doc, tracks };
}

/**
 * 레이어 복제 ID 매핑에 맞춰 타임라인 트랙도 복제한다. 각 키프레임 frame.id 역시 새로 발급해
 * 원본/복제본의 프레임 편집·내보내기 식별자가 충돌하지 않게 한다. 복제할 트랙이 없으면 no-op.
 */
export function duplicateAnimationTracks(
  doc: AnimationTimelineDoc,
  copyIdBySourceId: ReadonlyMap<string, string>,
  createFrameId: () => string
): AnimationTimelineDoc {
  let tracks: Record<string, StudioAnimKeyframe[]> | null = null;
  for (const [sourceId, copyId] of copyIdBySourceId) {
    const sourceTrack = doc.tracks[sourceId];
    if (!sourceTrack || sourceTrack.length === 0 || !copyId || copyId === sourceId) continue;
    tracks ??= { ...doc.tracks };
    tracks[copyId] = sourceTrack.map((keyframe) => ({
      frameIndex: keyframe.frameIndex,
      frame: { ...keyframe.frame, id: createFrameId() },
    }));
  }
  return tracks ? { ...doc, tracks } : doc;
}

// ── 재생 타이밍 — frameIndexAtElapsed를 그대로 재사용하기 위한 다리(bridge) ─────

/** 전 프레임이 doc.fps 기준 균등 노출시간을 갖는 배열 — frameIndexAtElapsed에 그대로 넘긴다. */
export function globalFrameDurationsMs(doc: AnimationTimelineDoc): number[] {
  return new Array(doc.frameCount).fill(1000 / doc.fps);
}

/** 재생 미리보기용 — 경과시간(ms)으로 현재 전역 프레임 인덱스. frameIndexAtElapsed 그대로 위임. */
export function globalFrameIndexAtElapsed(doc: AnimationTimelineDoc, elapsedMs: number, loop: boolean): number {
  return frameIndexAtElapsed(globalFrameDurationsMs(doc), elapsedMs, loop);
}

export function clampGlobalFrameIndex(frameCount: number, index: number): number {
  if (frameCount <= 0) return 0;
  return Math.round(clamp(index, 0, frameCount - 1));
}

// ── 어니언스키닝 — onionSkinLayers를 트랙 하나에 적용하는 얇은 다리 ──────────

/**
 * activeFrameIndex(전역 프레임 인덱스)에 가장 가까운 트랙 내 키프레임 위치를 찾아 그 위치
 * 기준으로 onionSkinLayers(studio-frame-animation, 그대로 재사용)를 호출한다. 트랙이 비어
 * 있거나 activeFrameIndex가 첫 키프레임보다 앞이면(아직 이 트랙이 "시작"되지 않음) []
 * — resolveTrackFrameAt이 이 경우 null을 반환하는 것과 동일한 계약. 순수 — Konva 노드는
 * 만들지 않는다(onionSkinLayers와 동일 계약).
 */
export function onionSkinLayersForTrack(
  track: StudioAnimKeyframe[],
  activeFrameIndex: number,
  settings: OnionSkinSettings
): OnionSkinLayer[] {
  if (track.length === 0 || track[0]!.frameIndex > activeFrameIndex) return [];
  const frames = track.map((k) => k.frame);
  // 트랙 배열상의 "가장 최근 keyframe.frameIndex ≤ activeFrameIndex" 위치를 찾는다
  // (resolveTrackFrameAt과 같은 held-until-next 규칙, 인덱스만 필요할 뿐).
  let pos = 0;
  for (let i = 0; i < track.length; i++) {
    if (track[i]!.frameIndex > activeFrameIndex) break;
    pos = i;
  }
  return onionSkinLayers(frames, pos, settings);
}
