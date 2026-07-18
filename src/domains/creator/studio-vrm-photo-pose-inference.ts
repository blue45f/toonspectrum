import {
  StudioVrmPhotoPoseError,
  createStudioVrmPhotoPoseInferenceResult,
  type StudioVrmPhotoPoseInferenceResult,
} from "./studio-vrm-photo-pose";

import type { StudioVrmPhotoPosePreprocessedImage } from "./studio-vrm-photo-pose-worker-protocol";

/** A main-thread MediaPipe PoseLandmarker configured with runningMode: "IMAGE". */
export interface StudioVrmPhotoPoseImageDetector {
  detect(image: ImageBitmap): unknown;
}

export interface StudioVrmPhotoPoseInferenceOptions {
  readonly expectedGenerationId: number;
  readonly isGenerationCurrent?: (generationId: number) => boolean;
  readonly signal?: AbortSignal;
  readonly mirrorPose?: boolean;
  readonly minimumVisibility?: number;
}

export interface StudioVrmPhotoPoseScanResult {
  readonly inference: StudioVrmPhotoPoseInferenceResult;
  readonly source: StudioVrmPhotoPosePreprocessedImage["source"];
  readonly output: StudioVrmPhotoPosePreprocessedImage["output"];
}

/**
 * Makes an otherwise non-cancellable async phase (for example MediaPipe module/model startup)
 * obey the scan-level AbortSignal. The underlying promise may still settle and populate its safe
 * module cache, but a cancelled scanner stops waiting immediately and must ignore that late value.
 */
export function waitForStudioVrmPhotoPosePhase<Value>(
  phase: PromiseLike<Value>,
  signal: AbortSignal,
): Promise<Value> {
  if (signal.aborted) return Promise.reject(new StudioVrmPhotoPoseError("aborted"));
  return new Promise<Value>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = () => finish(() => reject(new StudioVrmPhotoPoseError("aborted")));
    signal.addEventListener("abort", handleAbort, { once: true });
    void Promise.resolve(phase).then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function assertCurrentGeneration(
  generationId: number,
  options: StudioVrmPhotoPoseInferenceOptions,
): void {
  if (options.signal?.aborted) throw new StudioVrmPhotoPoseError("aborted");
  if (
    generationId !== options.expectedGenerationId
    || options.isGenerationCurrent?.(generationId) === false
  ) {
    throw new StudioVrmPhotoPoseError("stale-generation");
  }
}

/**
 * Executes only the MediaPipe IMAGE-mode boundary on the main thread. Decoding, EXIF correction,
 * mirroring, and resize have already happened in the Worker. This function never mutates live
 * tracking refs or React pose state: the caller receives a copied/validated result and decides
 * whether to commit it as one undoable pose edit.
 *
 * Do not pass the VIDEO-mode live-tracking singleton while it is active. Use a dedicated
 * IMAGE-mode PoseLandmarker (or an explicitly serialized mode switch owned by the caller).
 */
export function inferStudioVrmPhotoPoseFromImage(
  preprocessed: StudioVrmPhotoPosePreprocessedImage,
  detector: StudioVrmPhotoPoseImageDetector,
  options: StudioVrmPhotoPoseInferenceOptions,
): StudioVrmPhotoPoseScanResult {
  try {
    assertCurrentGeneration(preprocessed.generationId, options);
    let rawResult: unknown;
    try {
      rawResult = detector.detect(preprocessed.bitmap);
    } catch (error) {
      throw new StudioVrmPhotoPoseError("inference-failed", { cause: error });
    }
    assertCurrentGeneration(preprocessed.generationId, options);
    const inference = createStudioVrmPhotoPoseInferenceResult(
      preprocessed.generationId,
      rawResult,
      {
        mirror: options.mirrorPose,
        minimumVisibility: options.minimumVisibility,
      },
    );
    return {
      inference,
      source: preprocessed.source,
      output: preprocessed.output,
    };
  } finally {
    // The worker transferred ownership to the main thread. The inference result contains copied
    // numeric landmarks only, so the bitmap must never outlive this boundary.
    try {
      preprocessed.bitmap.close();
    } catch {
      // A cleanup failure must not replace the validated inference/error outcome.
    }
  }
}
