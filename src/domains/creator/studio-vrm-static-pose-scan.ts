import { processPoseResult } from "./studio-vrm-webcam-tracking";

import type { PoseLandmarker, PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";

export const STUDIO_STATIC_POSE_SCAN_MAX_FILE_BYTES = 12 * 1_024 * 1_024;
export const STUDIO_STATIC_POSE_SCAN_MAX_PIXELS = 24_000_000;
export const STUDIO_STATIC_POSE_SCAN_MIN_DIMENSION = 64;

const STATIC_POSE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const MEDIAPIPE_VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const STUDIO_STATIC_POSE_BONES = [
  "spine",
  "chest",
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
] as const satisfies readonly VRMHumanBoneName[];

export type StudioStaticPoseBoneName = (typeof STUDIO_STATIC_POSE_BONES)[number];
type StudioStaticPoseRotation = readonly [number, number, number];

export type StudioStaticPoseScanErrorCode =
  | "ABORTED"
  | "DECODE_FAILED"
  | "FILE_TOO_LARGE"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_TOO_SMALL"
  | "NO_POSE"
  | "UNSUPPORTED_IMAGE";

export class StudioStaticPoseScanError extends Error {
  readonly code: StudioStaticPoseScanErrorCode;

  constructor(code: StudioStaticPoseScanErrorCode, message: string) {
    super(message);
    this.name = "StudioStaticPoseScanError";
    this.code = code;
  }
}

export interface StudioStaticPoseImage {
  readonly width: number;
  readonly height: number;
  close(): void;
}

export interface StudioStaticPoseLandmarker {
  detect(image: StudioStaticPoseImage): PoseLandmarkerResult;
}

export interface StudioStaticPoseDisposableLandmarker extends StudioStaticPoseLandmarker {
  close(): void;
}

export type StudioStaticPoseLandmarkerFactory = () => Promise<StudioStaticPoseDisposableLandmarker>;

export interface StudioStaticPoseScanDependencies {
  decode(file: Blob): Promise<StudioStaticPoseImage>;
  initLandmarker(): Promise<StudioStaticPoseLandmarker>;
}

export interface StudioStaticPoseScanOptions {
  mirror?: boolean;
  signal?: AbortSignal;
}

export interface StudioStaticPoseScanResult {
  bones: Partial<Record<StudioStaticPoseBoneName, StudioStaticPoseRotation>>;
  image: { width: number; height: number };
  mirrored: boolean;
}

let cachedStaticPoseLandmarker: StudioStaticPoseDisposableLandmarker | null = null;
let staticPoseLandmarkerInit: Promise<StudioStaticPoseDisposableLandmarker> | null = null;
let staticPoseLandmarkerGeneration = 0;
let scanQueue: Promise<void> = Promise.resolve();

async function createStaticPoseLandmarker(): Promise<PoseLandmarker> {
  const { FilesetResolver, PoseLandmarker: PoseLandmarkerRuntime } = await import(
    "@mediapipe/tasks-vision"
  );
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_VISION_CDN);
  const create = (delegate: "GPU" | "CPU") => PoseLandmarkerRuntime.createFromOptions(vision, {
    baseOptions: { modelAssetPath: STATIC_POSE_MODEL, delegate },
    runningMode: "IMAGE",
    outputSegmentationMasks: false,
    numPoses: 1,
  });
  try {
    return await create("GPU");
  } catch {
    return create("CPU");
  }
}

export function initStudioStaticPoseLandmarker(
  factory: StudioStaticPoseLandmarkerFactory = createStaticPoseLandmarker
): Promise<StudioStaticPoseDisposableLandmarker> {
  if (cachedStaticPoseLandmarker) return Promise.resolve(cachedStaticPoseLandmarker);
  if (staticPoseLandmarkerInit) return staticPoseLandmarkerInit;

  const generation = staticPoseLandmarkerGeneration;
  const pending = Promise.resolve()
    .then(factory)
    .then(
      (landmarker) => {
        if (generation !== staticPoseLandmarkerGeneration || staticPoseLandmarkerInit !== pending) {
          try {
            landmarker.close();
          } catch {
            // 이미 해제된 런타임은 close()가 실패할 수 있어도 캐시에 되살리면 안 된다.
          }
          throw new StudioStaticPoseScanError("ABORTED", "해제된 포즈 분석기는 다시 사용할 수 없습니다.");
        }
        cachedStaticPoseLandmarker = landmarker;
        staticPoseLandmarkerInit = null;
        return landmarker;
      },
      (cause: unknown) => {
        if (staticPoseLandmarkerInit === pending) staticPoseLandmarkerInit = null;
        throw cause;
      }
    );
  staticPoseLandmarkerInit = pending;
  return pending;
}

export function disposeStudioStaticPoseLandmarker(): void {
  staticPoseLandmarkerGeneration += 1;
  const active = cachedStaticPoseLandmarker;
  cachedStaticPoseLandmarker = null;
  staticPoseLandmarkerInit = null;
  active?.close();
}

async function decodeStaticPoseImage(file: Blob): Promise<StudioStaticPoseImage> {
  if (typeof globalThis.createImageBitmap !== "function") {
    throw new StudioStaticPoseScanError("DECODE_FAILED", "이 브라우저에서는 포즈 사진을 읽을 수 없습니다.");
  }
  try {
    return await globalThis.createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new StudioStaticPoseScanError("DECODE_FAILED", "포즈 사진을 해석하지 못했습니다.");
  }
}

const defaultDependencies: StudioStaticPoseScanDependencies = {
  decode: decodeStaticPoseImage,
  initLandmarker: initStudioStaticPoseLandmarker,
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new StudioStaticPoseScanError("ABORTED", "포즈 사진 분석을 취소했습니다.");
  }
}

function awaitAbortable<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  onLateResolve?: (value: T) => void
): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(new StudioStaticPoseScanError("ABORTED", "포즈 사진 분석을 취소했습니다."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();

    promise.then(
      (value) => {
        if (settled) {
          try {
            onLateResolve?.(value);
          } catch {
            // 취소된 작업의 지연 리소스 해제 실패가 새 작업을 막아서는 안 된다.
          }
          return;
        }
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (cause: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(cause);
      }
    );
  });
}

function validateStaticPoseFile(file: Blob): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new StudioStaticPoseScanError(
      "UNSUPPORTED_IMAGE",
      "포즈 사진은 PNG, JPEG 또는 WebP 형식이어야 합니다."
    );
  }
  if (file.size <= 0 || file.size > STUDIO_STATIC_POSE_SCAN_MAX_FILE_BYTES) {
    throw new StudioStaticPoseScanError(
      "FILE_TOO_LARGE",
      `포즈 사진은 ${STUDIO_STATIC_POSE_SCAN_MAX_FILE_BYTES / 1_024 / 1_024}MB 이하여야 합니다.`
    );
  }
}

async function acquireScanTurn(signal?: AbortSignal): Promise<() => void> {
  const previous = scanQueue.catch(() => undefined);
  let resolveGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    resolveGate = resolve;
  });
  scanQueue = previous.then(() => gate);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    resolveGate();
  };
  try {
    await awaitAbortable(previous, signal);
    return release;
  } catch (cause) {
    release();
    throw cause;
  }
}

function closeDecodedImage(image: StudioStaticPoseImage): void {
  try {
    image.close();
  } catch {
    // ImageBitmap.close() is best-effort during cancellation/unmount cleanup.
  }
}

function closePoseResult(result: PoseLandmarkerResult): void {
  try {
    result.close();
  } catch {
    // Segmentation masks are disabled, but close defensively if the runtime still allocated one.
  }
}

function sanitizeStaticPoseBones(
  rawBones: Readonly<Record<string, StudioStaticPoseRotation>>
): Partial<Record<StudioStaticPoseBoneName, StudioStaticPoseRotation>> {
  const bones: Partial<Record<StudioStaticPoseBoneName, StudioStaticPoseRotation>> = {};
  for (const boneName of STUDIO_STATIC_POSE_BONES) {
    const rotation = rawBones[boneName];
    if (!rotation || rotation.length !== 3 || !rotation.every(Number.isFinite)) continue;
    bones[boneName] = [rotation[0], rotation[1], rotation[2]];
  }
  return bones;
}

/**
 * Runs a one-shot local IMAGE-mode MediaPipe scan. It never uploads the source image and serializes
 * access to the shared landmarker so a webcam VIDEO instance never has its running mode mutated.
 */
export async function scanStudioVrmStaticPose(
  file: Blob,
  options: StudioStaticPoseScanOptions = {},
  dependencyOverrides: Partial<StudioStaticPoseScanDependencies> = {}
): Promise<StudioStaticPoseScanResult> {
  validateStaticPoseFile(file);
  throwIfAborted(options.signal);
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  let image: StudioStaticPoseImage;
  try {
    const decode = Promise.resolve().then(() => dependencies.decode(file));
    image = await awaitAbortable(decode, options.signal, closeDecodedImage);
  } catch (cause) {
    if (cause instanceof StudioStaticPoseScanError) throw cause;
    throw new StudioStaticPoseScanError("DECODE_FAILED", "포즈 사진을 해석하지 못했습니다.");
  }
  try {
    throwIfAborted(options.signal);
    if (
      !Number.isSafeInteger(image.width)
      || !Number.isSafeInteger(image.height)
      || image.width < STUDIO_STATIC_POSE_SCAN_MIN_DIMENSION
      || image.height < STUDIO_STATIC_POSE_SCAN_MIN_DIMENSION
    ) {
      throw new StudioStaticPoseScanError("IMAGE_TOO_SMALL", "포즈 사진의 가로·세로는 각각 64px 이상이어야 합니다.");
    }
    if (image.width * image.height > STUDIO_STATIC_POSE_SCAN_MAX_PIXELS) {
      throw new StudioStaticPoseScanError("IMAGE_TOO_LARGE", "포즈 사진의 총 픽셀 수가 안전 한도를 넘었습니다.");
    }
    const release = await acquireScanTurn(options.signal);
    try {
      throwIfAborted(options.signal);
      const initialize = Promise.resolve().then(() => dependencies.initLandmarker());
      const landmarker = await awaitAbortable(initialize, options.signal);
      throwIfAborted(options.signal);
      const detected = landmarker.detect(image);
      try {
        throwIfAborted(options.signal);
        const bones = sanitizeStaticPoseBones(processPoseResult(detected, options.mirror ?? false));
        if (Object.keys(bones).length === 0) {
          throw new StudioStaticPoseScanError("NO_POSE", "사진에서 적용할 수 있는 사람 자세를 찾지 못했습니다.");
        }
        return {
          bones,
          image: { width: image.width, height: image.height },
          mirrored: options.mirror ?? false,
        };
      } finally {
        closePoseResult(detected);
      }
    } finally {
      release();
    }
  } finally {
    closeDecodedImage(image);
  }
}
