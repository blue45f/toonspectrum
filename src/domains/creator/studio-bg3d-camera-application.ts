import * as THREE from "three";

import { waitForStudioBg3dCapturePhase } from "./studio-bg3d-capture-adapter";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

type OrbitLike = { target?: THREE.Vector3; update?: () => void } | null;

export interface BgViewportApi {
  zoomBy(factor: number): void;
  applyPreset(presetId: string): void;
  /** Returns false when React has not mounted the requested projection camera yet. */
  applyView(view: StudioBg3dCameraSettings): boolean;
  readView(): StudioBg3dCameraSettings;
  focusOn(position: [number, number, number]): void;
}

/** Applies every persisted composition field without replacing Three's live camera identity. */
export function applyStudioBg3dViewToThreeCamera(
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  controls: OrbitLike,
  view: StudioBg3dCameraSettings,
): boolean {
  const projectionMatches = view.projection === "orthographic"
    ? camera instanceof THREE.OrthographicCamera
    : camera instanceof THREE.PerspectiveCamera;
  if (!projectionMatches) return false;

  if (camera instanceof THREE.PerspectiveCamera) camera.fov = view.fovDegrees;
  camera.zoom = view.zoom ?? 1;
  if (view.lensShift) {
    const [shiftX, shiftY] = view.lensShift;
    if (shiftX === 0 && shiftY === 0) camera.clearViewOffset();
    else camera.setViewOffset(1_000, 1_000, shiftX * 1_000, shiftY * 1_000, 1_000, 1_000);
  } else if (camera.view !== null) {
    camera.clearViewOffset();
  }
  camera.updateProjectionMatrix();
  camera.position.set(view.position[0], view.position[1], view.position[2]);
  camera.updateMatrixWorld();
  if (controls?.target) {
    controls.target.set(view.target[0], view.target[1], view.target[2]);
    controls.update?.();
  } else {
    camera.lookAt(view.target[0], view.target[1], view.target[2]);
  }
  return true;
}

export interface ApplyStudioBg3dViewportAfterTransitionInput {
  readonly view: StudioBg3dCameraSettings;
  readonly previousApi: BgViewportApi | null;
  readonly requireReplacement: boolean;
  readonly readApi: () => BgViewportApi | null;
  readonly isActive: () => boolean;
  readonly waitForPaintFrame: () => Promise<void>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

function studioBg3dViewportTransitionError(name: "AbortError" | "TimeoutError"): Error {
  const error = new Error(
    name === "AbortError"
      ? "3D 컷 카메라 전환을 취소했습니다."
      : "3D 컷 카메라 전환 준비 시간이 초과되었습니다.",
  );
  error.name = name;
  return error;
}

/**
 * A perspective/orthographic switch remounts R3F's default camera. Wait for that new viewport API
 * identity, then apply the complete persisted view only after React's camera props have painted.
 * Applying earlier can target the unmounted camera, while applying only before paint lets R3F reset
 * OrbitControls.target and overwrite the requested shot composition.
 */
export async function applyStudioBg3dViewportAfterTransition(
  input: ApplyStudioBg3dViewportAfterTransitionInput,
): Promise<BgViewportApi | null> {
  const timeoutMs = Math.max(250, Math.min(30_000, Math.floor(input.timeoutMs ?? 15_000)));
  const deadline = Date.now() + timeoutMs;
  if (input.signal?.aborted) throw studioBg3dViewportTransitionError("AbortError");

  await waitForStudioBg3dCapturePhase(input.waitForPaintFrame(), {
    ...(input.signal ? { signal: input.signal } : {}),
    timeoutMs,
  });

  let api = input.readApi();
  while (
    input.isActive()
    && (!api || (input.requireReplacement && api === input.previousApi))
  ) {
    if (input.signal?.aborted) throw studioBg3dViewportTransitionError("AbortError");
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw studioBg3dViewportTransitionError("TimeoutError");
    await waitForStudioBg3dCapturePhase(
      new Promise<void>((resolve) => globalThis.setTimeout(resolve, Math.min(16, remainingMs))),
      {
        ...(input.signal ? { signal: input.signal } : {}),
        timeoutMs: remainingMs,
      },
    );
    api = input.readApi();
  }
  if (!input.isActive() || !api) return null;
  if (!api.applyView(input.view)) return null;

  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw studioBg3dViewportTransitionError("TimeoutError");
  await waitForStudioBg3dCapturePhase(input.waitForPaintFrame(), {
    ...(input.signal ? { signal: input.signal } : {}),
    timeoutMs: remainingMs,
  });
  return input.isActive() ? api : null;
}
