/**
 * MediaPipe Vision 0.10.35의 package-matched WASM 자산 권위.
 *
 * Studio의 프로덕션 CSP는 외부 script/WASM 실행을 허용하지 않는다. 모든 3D 추적·사진
 * 포즈·전경 분리가 동일한 Vite hashed same-origin 자산을 사용해야 화면별 성공/실패가
 * 갈리지 않는다. Task singleton은 각 기능이 독립 소유하고 이 모듈은 URL만 제공한다.
 */

export type StudioMediaPipeVisionWasmVariant = "simd" | "nosimd";

export interface StudioMediaPipeVisionWasmFileset {
  readonly wasmLoaderPath: string;
  readonly wasmBinaryPath: string;
}

export interface StudioMediaPipeVisionWasmSelection {
  readonly variant: StudioMediaPipeVisionWasmVariant;
  readonly fileset: StudioMediaPipeVisionWasmFileset;
  /** SIMD 지원 환경이었지만 로컬 SIMD 자산 해석이 실패해 호환 경로를 썼는지 여부. */
  readonly compatibilityFallback: boolean;
}

export type StudioMediaPipeVisionFilesetLoader = () => Promise<
  StudioMediaPipeVisionWasmFileset
>;

export interface StudioMediaPipeVisionAssetResolverOptions {
  readonly isSimdSupported: () => Promise<boolean>;
  /** 테스트/호스트 주입 경계. 앱에서는 지정하지 않는다. */
  readonly loadSimd?: StudioMediaPipeVisionFilesetLoader;
  /** 테스트/호스트 주입 경계. 앱에서는 지정하지 않는다. */
  readonly loadNoSimd?: StudioMediaPipeVisionFilesetLoader;
}

function namedAssetError(message: string, causes: readonly unknown[]): Error {
  const error = new AggregateError(causes, message, { cause: causes.at(-1) });
  error.name = "StudioMediaPipeVisionWasmLoadError";
  return error;
}

function assertLocalFileset(
  fileset: StudioMediaPipeVisionWasmFileset,
): StudioMediaPipeVisionWasmFileset {
  if (
    !fileset
    || typeof fileset.wasmLoaderPath !== "string"
    || fileset.wasmLoaderPath.length === 0
    || typeof fileset.wasmBinaryPath !== "string"
    || fileset.wasmBinaryPath.length === 0
  ) {
    throw new TypeError("MediaPipe Vision WASM 자산 경로가 비어 있습니다.");
  }
  return Object.freeze({
    wasmLoaderPath: fileset.wasmLoaderPath,
    wasmBinaryPath: fileset.wasmBinaryPath,
  });
}

async function loadBundledSimdFileset(): Promise<StudioMediaPipeVisionWasmFileset> {
  const [loaderModule, binaryModule] = await Promise.all([
    import("@mediapipe/tasks-vision/vision_wasm_internal.js?url"),
    import("@mediapipe/tasks-vision/vision_wasm_internal.wasm?url"),
  ]);
  return assertLocalFileset({
    wasmLoaderPath: loaderModule.default,
    wasmBinaryPath: binaryModule.default,
  });
}

async function loadBundledNoSimdFileset(): Promise<StudioMediaPipeVisionWasmFileset> {
  const [loaderModule, binaryModule] = await Promise.all([
    import("@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url"),
    import("@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url"),
  ]);
  return assertLocalFileset({
    wasmLoaderPath: loaderModule.default,
    wasmBinaryPath: binaryModule.default,
  });
}

/** SIMD를 우선하되 URL wrapper 해석 실패 시 bounded non-SIMD 호환 자산으로 폴백한다. */
export async function resolveStudioMediaPipeVisionWasmFileset(
  options: StudioMediaPipeVisionAssetResolverOptions,
): Promise<StudioMediaPipeVisionWasmSelection> {
  const loadSimd = options.loadSimd ?? loadBundledSimdFileset;
  const loadNoSimd = options.loadNoSimd ?? loadBundledNoSimdFileset;
  const causes: unknown[] = [];
  let simdSupported = false;
  try {
    simdSupported = await options.isSimdSupported();
  } catch (cause) {
    // Capability probe 실패는 기능 전체 실패가 아니다. 가장 넓은 호환 자산으로 진행한다.
    causes.push(cause);
  }

  if (simdSupported) {
    try {
      return Object.freeze({
        variant: "simd",
        fileset: assertLocalFileset(await loadSimd()),
        compatibilityFallback: false,
      });
    } catch (cause) {
      causes.push(cause);
    }
  }

  try {
    return Object.freeze({
      variant: "nosimd",
      fileset: assertLocalFileset(await loadNoSimd()),
      compatibilityFallback: simdSupported,
    });
  } catch (cause) {
    causes.push(cause);
    throw namedAssetError(
      "Studio의 로컬 MediaPipe Vision WASM 자산을 불러오지 못했습니다.",
      causes,
    );
  }
}
