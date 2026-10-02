/**
 * 브라우저 전용: MediaPipe Tasks Vision 지연 로더.
 *
 * - `@mediapipe/tasks-vision`은 동적 import(별도 청크). wasm 로더·바이너리는 패키지 export 서브패스를 Vite `?url`로
 *   번들해 `{ wasmLoaderPath, wasmBinaryPath }`를 직접 구성한다(CDN wasm 없음).
 * - 모델 파일만 공식 CDN(계약 MEDIAPIPE_MODELS·HAND_LANDMARKER_MODEL)에서 fetch → byteLength·SHA-256 검증(고정된 모델) 또는
 *   관측 SHA 기록(미고정·베타) → `modelAssetBuffer`로 생성. runningMode "IMAGE".
 * - 델리게이트는 생성 전에 하나로 고정하고(기본 CPU) 실패 시 다른 델리게이트를 자동으로 시도하지 않는다(ADR-0018).
 * - 15 s(VISION_LOAD_TIMEOUT_MS) 안에 끝나지 않으면 LabFailure. 모든 실패는 throw(LabFailure)로 세션이 failed 상태로 만든다.
 *   제한 시간 뒤 늦게 만들어진 인스턴스는 close()로 해제한다(`createModelWithDeadline`).
 */
import wasmLoaderUrl from "@mediapipe/tasks-vision/vision_wasm_internal.js?url";
import wasmBinaryUrl from "@mediapipe/tasks-vision/vision_wasm_internal.wasm?url";

import { HAND_LANDMARK_COUNT, POSE_LANDMARK_COUNT, VISION_LOAD_TIMEOUT_MS, failVisible, isLabFailure } from "../../contracts";
import { sha256Hex } from "../../shared/hash";

import { VISION_MODEL_SPECS, createFetchModelPort, createModelWithDeadline, fetchModelAsset, withDeadline } from "./model-assets";
import { toEmbedding } from "./similarity";

import type { HandDetection, HandDetectorPort, LoadedModel, PoseDetectorPort, VisionDelegate, VisionLoaders, VisionModelKey } from "./vision-ports";
import type { EmbedderPort, PoseLandmark } from "../../contracts";

export interface MediaPipeLoaderOptions {
  /** 기본 CPU. GPU는 WebGL2 컨텍스트를 만든다(브라우저 미검증). */
  readonly delegate?: VisionDelegate;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

type TasksVision = typeof import("@mediapipe/tasks-vision");

interface LandmarkLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility?: number;
}

function toPoseLandmarks(points: readonly LandmarkLike[], expected: number, labelKo: string): PoseLandmark[] {
  if (points.length !== expected) throw failVisible("vision-landmark-count", `${labelKo} 랜드마크가 ${expected}개가 아닙니다(받음 ${points.length}).`);
  return points.map((point) => ({ x: point.x, y: point.y, z: point.z, visibility: typeof point.visibility === "number" ? point.visibility : 0 }));
}

export function createMediaPipeLoaders(options: MediaPipeLoaderOptions = {}): VisionLoaders {
  const delegate: VisionDelegate = options.delegate ?? "CPU";
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? VISION_LOAD_TIMEOUT_MS;
  const port = createFetchModelPort(options.fetchImpl ?? globalThis.fetch.bind(globalThis));
  let modulePromise: Promise<TasksVision> | null = null;

  const loadModule = (): Promise<TasksVision> => {
    if (!modulePromise) {
      modulePromise = withDeadline(import("@mediapipe/tasks-vision"), timeoutMs, () =>
        failVisible("vision-module-timeout", `@mediapipe/tasks-vision 모듈 로드가 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않았습니다.`, undefined, now()),
      ).catch((error: unknown) => {
        modulePromise = null;
        throw isLabFailure(error) ? error : failVisible("vision-module-load-failed", "@mediapipe/tasks-vision 모듈을 불러오지 못했습니다.", error, now());
      });
    }
    return modulePromise;
  };

  const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl };

  async function prepare(key: VisionModelKey): Promise<{ vision: TasksVision; bytes: Uint8Array; observedSha256: string; pinned: boolean; license: string }> {
    const spec = VISION_MODEL_SPECS[key];
    const [vision, model] = await Promise.all([loadModule(), fetchModelAsset(port, spec, { sha256: sha256Hex, now: now(), timeoutMs })]);
    if (!model.ok) throw model.failure;
    return { vision, bytes: model.model.bytes, observedSha256: model.model.observedSha256, pinned: model.model.pinned, license: spec.license };
  }

  /** 인스턴스 생성에 제한 시간을 걸고, 시간 초과 뒤 늦게 만들어진 인스턴스는 close()한다(model-assets, 단위 테스트됨). */
  function createDeadline<T extends { close(): void }>(key: VisionModelKey, promise: Promise<T>): Promise<T> {
    return createModelWithDeadline(promise, { key, delegate, timeoutMs, now });
  }

  return {
    async imageEmbedder(): Promise<LoadedModel<EmbedderPort>> {
      const { vision, bytes, observedSha256, pinned, license } = await prepare("imageEmbedder");
      const embedder = await createDeadline(
        "imageEmbedder",
        vision.ImageEmbedder.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: bytes, delegate }, runningMode: "IMAGE", l2Normalize: true, quantize: false }),
      );
      const portImpl: EmbedderPort = {
        async embed(image) {
          const result = embedder.embed(image);
          const vector = result.embeddings[0]?.floatEmbedding;
          if (!vector || vector.length === 0) throw failVisible("vision-embed-empty", "이미지 임베더가 빈 벡터를 돌려줬습니다.", undefined, now());
          return toEmbedding(vector);
        },
      };
      return { key: "imageEmbedder", port: portImpl, observedSha256, pinned, bytes: bytes.byteLength, license, delegate, dispose: () => embedder.close() };
    },

    async poseLandmarker(): Promise<LoadedModel<PoseDetectorPort>> {
      const { vision, bytes, observedSha256, pinned, license } = await prepare("poseLandmarker");
      const landmarker = await createDeadline(
        "poseLandmarker",
        vision.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: bytes, delegate }, runningMode: "IMAGE", numPoses: 1, outputSegmentationMasks: false }),
      );
      const portImpl: PoseDetectorPort = {
        async detect(image) {
          const result = landmarker.detect(image);
          const first = result.landmarks[0];
          if (!first) return null;
          const world = result.worldLandmarks[0];
          return {
            landmarks: toPoseLandmarks(first, POSE_LANDMARK_COUNT, "포즈"),
            worldLandmarks: world ? toPoseLandmarks(world, POSE_LANDMARK_COUNT, "포즈(월드)") : null,
          };
        },
      };
      return { key: "poseLandmarker", port: portImpl, observedSha256, pinned, bytes: bytes.byteLength, license, delegate, dispose: () => landmarker.close() };
    },

    async handLandmarker(): Promise<LoadedModel<HandDetectorPort>> {
      const { vision, bytes, observedSha256, pinned, license } = await prepare("handLandmarker");
      const landmarker = await createDeadline(
        "handLandmarker",
        vision.HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetBuffer: bytes, delegate }, runningMode: "IMAGE", numHands: 2 }),
      );
      const portImpl: HandDetectorPort = {
        async detect(image) {
          const result = landmarker.detect(image);
          const detections: HandDetection[] = [];
          result.landmarks.forEach((hand, index) => {
            const category = result.handedness[index]?.[0];
            const name = category?.categoryName;
            const reportedHandedness: HandDetection["reportedHandedness"] = name === "Left" || name === "Right" ? name : "Unknown";
            const world = result.worldLandmarks[index];
            detections.push({
              reportedHandedness,
              score: category?.score ?? 0,
              landmarks: toPoseLandmarks(hand, HAND_LANDMARK_COUNT, "손"),
              worldLandmarks: world ? toPoseLandmarks(world, HAND_LANDMARK_COUNT, "손(월드)") : null,
            });
          });
          return detections;
        },
      };
      return { key: "handLandmarker", port: portImpl, observedSha256, pinned, bytes: bytes.byteLength, license, delegate, dispose: () => landmarker.close() };
    },
  };
}
