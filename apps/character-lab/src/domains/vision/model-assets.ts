/**
 * MediaPipe 모델 파일(.tflite/.task) 받기·검증(순수, fetch 포트 주입).
 * - 계약 `MEDIAPIPE_MODELS`의 URL을 쓰고, bytes·sha256이 고정된 모델은 둘 다 일치해야 통과한다.
 * - 고정되지 않은 모델(pose·hand)은 관측 SHA를 기록하고 `pinned:false`로 돌려준다(UI에 '미고정·베타' 표시).
 * - 시간 제한(VISION_LOAD_TIMEOUT_MS)·네트워크 실패·크기/SHA 불일치는 모두 LabFailure(한글 사유)로 노출한다.
 */
import { MEDIAPIPE_MODELS, VISION_LOAD_TIMEOUT_MS, failVisible, isLabFailure } from "../../contracts";

import type { VisionModelKey } from "./vision-ports";
import type { LabFailure } from "../../contracts";

export interface VisionModelSpec {
  readonly key: VisionModelKey;
  readonly url: string;
  readonly bytes: number | null;
  readonly sha256: string | null;
  readonly license: string;
}

/** 손 랜드마커 모델(계약 `MEDIAPIPE_MODELS.handLandmarker`와 동일, 미고정·베타). 첫 브라우저 검증 시 통합 담당이 bytes·sha256을 고정한다. */
export const HAND_LANDMARKER_MODEL = MEDIAPIPE_MODELS.handLandmarker;

export const VISION_MODEL_SPECS: Readonly<Record<VisionModelKey, VisionModelSpec>> = {
  imageEmbedder: { key: "imageEmbedder", ...MEDIAPIPE_MODELS.imageEmbedder },
  poseLandmarker: { key: "poseLandmarker", ...MEDIAPIPE_MODELS.poseLandmarker },
  handLandmarker: { key: "handLandmarker", ...HAND_LANDMARKER_MODEL },
};

export function isModelSpecPinned(spec: VisionModelSpec): boolean {
  return spec.sha256 !== null && spec.bytes !== null;
}

export type ModelBytesResponse = { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly status: number | null; readonly message: string };

export interface ModelBytesPort {
  fetchBytes(url: string): Promise<ModelBytesResponse>;
}

export interface VerifiedModelBytes {
  readonly bytes: Uint8Array;
  readonly observedSha256: string;
  readonly pinned: boolean;
}

export type FetchModelResult = { readonly ok: true; readonly model: VerifiedModelBytes } | { readonly ok: false; readonly failure: LabFailure };

/** 받은 바이트를 계약 값과 대조한다. */
export function verifyModelBytes(spec: VisionModelSpec, bytes: Uint8Array, observedSha256: string, now?: number): FetchModelResult {
  if (bytes.byteLength === 0) {
    return { ok: false, failure: failVisible("vision-model-empty", `모델 파일이 비어 있습니다: ${spec.url}`, undefined, now) };
  }
  const pinned = isModelSpecPinned(spec);
  if (spec.bytes !== null && bytes.byteLength !== spec.bytes) {
    return {
      ok: false,
      failure: failVisible("vision-model-bytes-mismatch", `모델 ${spec.key} 크기가 계약(${spec.bytes})과 다릅니다(실제 ${bytes.byteLength}).`, undefined, now),
    };
  }
  if (spec.sha256 !== null && observedSha256.toLowerCase() !== spec.sha256) {
    return {
      ok: false,
      failure: failVisible("vision-model-sha-mismatch", `모델 ${spec.key} SHA-256이 계약과 다릅니다(기대 ${spec.sha256.slice(0, 12)}…, 실제 ${observedSha256.slice(0, 12)}…).`, undefined, now),
    };
  }
  return { ok: true, model: { bytes, observedSha256: observedSha256.toLowerCase(), pinned } };
}

/** 지정 시간 안에 끝나지 않으면 LabFailure로 reject. 늦게 온 결과는 버린다. */
export function withDeadline<T>(promise: Promise<T>, ms: number, makeFailure: () => LabFailure): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(makeFailure());
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error || isLabFailure(error) ? error : new Error(String(error)));
      },
    );
  });
}

export interface FetchModelDeps {
  readonly sha256: (bytes: Uint8Array) => Promise<string>;
  readonly now?: number;
  /** 기본 VISION_LOAD_TIMEOUT_MS */
  readonly timeoutMs?: number;
}

/** 모델 파일을 받아 검증한다(네트워크·시간 제한·크기·SHA 모두 fail-visible). */
export async function fetchModelAsset(port: ModelBytesPort, spec: VisionModelSpec, deps: FetchModelDeps): Promise<FetchModelResult> {
  const timeoutMs = deps.timeoutMs ?? VISION_LOAD_TIMEOUT_MS;
  let response: ModelBytesResponse;
  try {
    response = await withDeadline(port.fetchBytes(spec.url), timeoutMs, () =>
      failVisible("vision-model-timeout", `모델 ${spec.key} 다운로드가 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않았습니다.`, spec.url, deps.now),
    );
  } catch (error) {
    return { ok: false, failure: isLabFailure(error) ? error : failVisible("vision-model-fetch-failed", `모델 ${spec.key}을(를) 받지 못했습니다.`, error, deps.now) };
  }
  if (!response.ok) {
    return {
      ok: false,
      failure: failVisible("vision-model-fetch-failed", `모델 ${spec.key}을(를) 받지 못했습니다(${response.status ?? "네트워크"}): ${spec.url}`, response.message, deps.now),
    };
  }
  let observedSha256: string;
  try {
    observedSha256 = await deps.sha256(response.bytes);
  } catch (error) {
    return { ok: false, failure: failVisible("vision-model-sha-unavailable", "모델 SHA-256을 계산하지 못했습니다(crypto.subtle 없음).", error, deps.now) };
  }
  return verifyModelBytes(spec, response.bytes, observedSha256, deps.now);
}

/** 전역 fetch로 ModelBytesPort를 만든다(브라우저 로더가 쓴다, 테스트는 가짜 포트). */
export function createFetchModelPort(fetchImpl: typeof fetch): ModelBytesPort {
  return {
    async fetchBytes(url) {
      try {
        const response = await fetchImpl(url);
        if (!response.ok) return { ok: false, status: response.status, message: `${response.status} ${response.statusText}` };
        return { ok: true, bytes: new Uint8Array(await response.arrayBuffer()) };
      } catch (error) {
        return { ok: false, status: null, message: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
