/**
 * Vite asset plumbing for the ONNX foreground route.
 *
 * The production CSP forbids executing scripts/WASM from external origins,
 * so — exactly like `studio-mediapipe-vision-assets` — every runtime asset is
 * a Vite-hashed same-origin URL obtained through `?url` imports:
 *
 * - the `onnxruntime-web/webgpu` module itself (dynamically imported, so the
 *   runtime stays out of the Studio startup graph),
 * - the JSEP WASM/glue pair it fetches at session creation, pinned through
 *   `env.wasm.wasmPaths`. Without the pin, ONNX Runtime would resolve those
 *   files relative to the bundled chunk URL and 404 in production, and
 * - the U-2-Netp model file, fetched as bytes and handed to the provider,
 *   which verifies the registered SHA-256 digest before creating a session.
 *
 * Every function here is lazy: nothing in this module loads an asset until
 * the general-subject action actually runs.
 */
import type { StudioOnnxRuntime } from "./studio-onnx-inference-provider";
import {
  STUDIO_TAG2PIX_MODEL_BYTE_LENGTH,
} from "./studio-onnx-tag2pix";
import {
  STUDIO_U2NETP_MODEL_BYTE_LENGTH,
} from "./studio-onnx-u2netp";

let runtimePromise: Promise<StudioOnnxRuntime> | null = null;
let modelBytesPromise: Promise<Uint8Array> | null = null;

async function loadRuntimeUncached(): Promise<StudioOnnxRuntime> {
  const [ort, jsepWasm, jsepMjs] = await Promise.all([
    import("onnxruntime-web/webgpu"),
    import("onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url"),
    import("onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url"),
  ]);
  // The webgpu entry is the JSEP build: both the WebGPU and WASM execution
  // providers run on the jsep binary, so one wasm/mjs pair covers both.
  ort.env.wasm.wasmPaths = {
    wasm: jsepWasm.default,
    mjs: jsepMjs.default,
  };
  return ort;
}

export function loadStudioOnnxForegroundRuntime(): Promise<StudioOnnxRuntime> {
  runtimePromise ??= loadRuntimeUncached().catch((cause: unknown) => {
    runtimePromise = null;
    throw cause;
  });
  return runtimePromise;
}

async function loadModelBytesUncached(): Promise<Uint8Array> {
  const modelModule = await import("./assets/u2netp.onnx?url");
  const response = await fetch(modelModule.default);
  if (!response.ok) {
    throw new Error(
      `일반 피사체 분리 모델을 내려받지 못했습니다. (HTTP ${response.status})`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== STUDIO_U2NETP_MODEL_BYTE_LENGTH) {
    throw new Error("일반 피사체 분리 모델 파일 크기가 등록 정보와 다릅니다.");
  }
  return bytes;
}

export function loadStudioU2netpModelBytes(): Promise<Uint8Array> {
  modelBytesPromise ??= loadModelBytesUncached().catch((cause: unknown) => {
    modelBytesPromise = null;
    throw cause;
  });
  return modelBytesPromise;
}

let tag2pixModelBytesPromise: Promise<Uint8Array> | null = null;

async function loadTag2pixModelBytesUncached(): Promise<Uint8Array> {
  const modelModule = await import("./assets/tag2pix.onnx?url");
  const response = await fetch(modelModule.default);
  if (!response.ok) {
    throw new Error(
      `기기 채색 모델을 내려받지 못했습니다. (HTTP ${response.status})`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== STUDIO_TAG2PIX_MODEL_BYTE_LENGTH) {
    throw new Error("기기 채색 모델 파일 크기가 등록 정보와 다릅니다.");
  }
  return bytes;
}

export function loadStudioTag2pixModelBytes(): Promise<Uint8Array> {
  tag2pixModelBytesPromise ??= loadTag2pixModelBytesUncached().catch(
    (cause: unknown) => {
      tag2pixModelBytesPromise = null;
      throw cause;
    },
  );
  return tag2pixModelBytesPromise;
}
