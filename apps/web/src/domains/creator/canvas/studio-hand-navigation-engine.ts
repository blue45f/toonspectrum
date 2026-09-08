export type StudioHandPanSource =
  | "hand-tool"
  | "temporary-space"
  | "middle-button"
  | "right-button";

export type StudioHandPointerButtonAction =
  | "pan"
  | "zoom"
  | "eyedropper"
  | "context"
  | "none";

export type StudioHandTouchOneFingerMode = "draw" | "pan" | "none";

export interface StudioHandPanIntentInput {
  pointerType: string;
  button: number;
  isPrimary: boolean;
  handToolActive: boolean;
  temporaryHandActive: boolean;
  interactiveTarget: boolean;
  middleButtonAction: StudioHandPointerButtonAction;
  rightButtonAction: StudioHandPointerButtonAction;
  touchOneFingerMode: StudioHandTouchOneFingerMode;
}

export interface StudioHandPanVelocitySample {
  currentVelocity: number;
  deltaPx: number;
  elapsedMs: number;
  smoothing?: number;
  maxVelocity?: number;
}

export interface StudioHandPanInertiaFrameInput {
  velocityX: number;
  velocityY: number;
  elapsedMs: number;
  reducedMotion: boolean;
  friction?: number;
  stopVelocity?: number;
}

export interface StudioHandPanInertiaFrame {
  deltaX: number;
  deltaY: number;
  velocityX: number;
  velocityY: number;
  shouldContinue: boolean;
}

const DEFAULT_SMOOTHING = 0.68;
const DEFAULT_MAX_VELOCITY = 4_000;
const DEFAULT_FRICTION = 0.91;
const DEFAULT_STOP_VELOCITY = 24;
const FRAME_MS = 1_000 / 60;
const MAX_INERTIA_FRAME_MS = 32;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolves whether a pointer contact owns viewport navigation.
 *
 * Button gestures always respect the user's Studio mouse mapping. Touch is
 * intercepted only for the explicit Hand tool while the normal one-finger
 * preference is `draw`: `pan` is already owned by the legacy touch gesture
 * controller and `none` intentionally disables a one-finger action.
 */
export function resolveStudioHandPanSource(
  input: StudioHandPanIntentInput
): StudioHandPanSource | null {
  if (input.interactiveTarget) return null;

  if (input.pointerType === "touch") {
    if (input.button !== 0 || !input.isPrimary || !input.handToolActive) return null;
    return input.touchOneFingerMode === "draw" ? "hand-tool" : null;
  }

  if (input.button === 1) {
    return input.middleButtonAction === "pan" ? "middle-button" : null;
  }

  if (input.button === 2) {
    return input.rightButtonAction === "pan" ? "right-button" : null;
  }

  if (input.button !== 0 || !input.isPrimary) return null;
  if (input.temporaryHandActive) return "temporary-space";
  if (input.handToolActive) return "hand-tool";
  return null;
}

export function studioHandPanDragThresholdPx(pointerType: string) {
  if (pointerType === "touch") return 8;
  if (pointerType === "pen") return 4;
  return 3;
}

export function hasStudioHandPanCrossedDragThreshold(input: {
  deltaX: number;
  deltaY: number;
  pointerType: string;
}) {
  const threshold = studioHandPanDragThresholdPx(input.pointerType);
  return input.deltaX * input.deltaX + input.deltaY * input.deltaY >= threshold * threshold;
}

/** Low-pass filters noisy coalesced pointer samples while keeping fast flicks responsive. */
export function sampleStudioHandPanVelocity(input: StudioHandPanVelocitySample) {
  if (!Number.isFinite(input.deltaPx) || !Number.isFinite(input.elapsedMs)) {
    return 0;
  }

  const elapsedMs = Math.max(1, input.elapsedMs);
  const smoothing = clamp(input.smoothing ?? DEFAULT_SMOOTHING, 0, 0.98);
  const maxVelocity = Math.max(1, input.maxVelocity ?? DEFAULT_MAX_VELOCITY);
  const instantaneousVelocity = (input.deltaPx / elapsedMs) * 1_000;
  const filteredVelocity =
    input.currentVelocity * smoothing + instantaneousVelocity * (1 - smoothing);

  return clamp(filteredVelocity, -maxVelocity, maxVelocity);
}

/** Produces one deterministic inertial-scroll frame for the DOM integration hook. */
export function planStudioHandPanInertiaFrame(
  input: StudioHandPanInertiaFrameInput
): StudioHandPanInertiaFrame {
  if (input.reducedMotion) {
    return {
      deltaX: 0,
      deltaY: 0,
      velocityX: 0,
      velocityY: 0,
      shouldContinue: false,
    };
  }

  const elapsedMs = clamp(input.elapsedMs, 0, MAX_INERTIA_FRAME_MS);
  const friction = clamp(input.friction ?? DEFAULT_FRICTION, 0.5, 0.999);
  const stopVelocity = Math.max(1, input.stopVelocity ?? DEFAULT_STOP_VELOCITY);
  const decay = Math.pow(friction, elapsedMs / FRAME_MS);
  const nextVelocityX = input.velocityX * decay;
  const nextVelocityY = input.velocityY * decay;
  const velocityX = Math.abs(nextVelocityX) < stopVelocity ? 0 : nextVelocityX;
  const velocityY = Math.abs(nextVelocityY) < stopVelocity ? 0 : nextVelocityY;

  return {
    deltaX: (input.velocityX * elapsedMs) / 1_000,
    deltaY: (input.velocityY * elapsedMs) / 1_000,
    velocityX,
    velocityY,
    shouldContinue: velocityX !== 0 || velocityY !== 0,
  };
}
