/**
 * GPU 렌더링 역량 판정.
 *
 * 기존 진입 프로브(`probeCharacterShaperWebGl`)는 컨텍스트 생성 가능 여부만 보아서,
 * SwiftShader·llvmpipe 같은 소프트웨어 래스터라이저만 있는 기기도 "supported"로 통과시킨다.
 * 그런 기기에서 표준 해상도 예산을 그대로 쓰면 편집기가 슬라이드쇼가 되므로, 실제 렌더러
 * 문자열로 하드웨어/소프트웨어를 가르고 품질 등급(quality tier)으로 DPR 예산을 낮춘다.
 * 판정은 자동 적용만 하고 별도 설정 UI를 노출하지 않는다(10초 이해 원칙).
 */

export type StudioVrmGpuCapability = "hardware" | "software" | "unavailable";
export type StudioVrmQualityTier = "standard" | "low";

/**
 * 소프트웨어 래스터라이저로 알려진 렌더러 문자열 패턴.
 * ANGLE 래퍼 하드웨어 문자열(예: "ANGLE (NVIDIA, ...)")과 겹치지 않는 이름만 넣는다.
 */
const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software rasterizer|basic render driver|google swiftshader|vulkan \(swiftshader/i;

/** 렌더러 문자열을 분류한다. 문자열을 못 읽으면 하드웨어로 간주해 과도하게 낮추지 않는다. */
export function classifyStudioVrmRenderer(renderer: string | null | undefined): StudioVrmGpuCapability {
  if (!renderer || renderer.trim().length === 0) return "hardware";
  return SOFTWARE_RENDERER_PATTERN.test(renderer) ? "software" : "hardware";
}

interface WebGlContextLike {
  getExtension(name: string): unknown;
  getParameter(pname: number): unknown;
}

const UNMASKED_RENDERER_WEBGL = 0x9246; // WEBGL_debug_renderer_info

function readUnmaskedRenderer(gl: WebGlContextLike): string | null {
  try {
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as
      | { UNMASKED_RENDERER_WEBGL?: number }
      | null;
    const pname = debugInfo?.UNMASKED_RENDERER_WEBGL ?? UNMASKED_RENDERER_WEBGL;
    const value = gl.getParameter(pname);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * 확인용 컨텍스트를 한 번 만들어 렌더러를 읽고 바로 반납한다(동시 컨텍스트 한도 보호).
 * 실제 편집기 렌더러와 별개이며, 결과는 모듈 단위로 한 번만 계산해 재사용한다.
 */
export function probeStudioVrmGpuCapability(
  doc: Document | undefined = typeof document !== "undefined" ? document : undefined,
): StudioVrmGpuCapability {
  if (!doc) return "unavailable";
  try {
    const canvas = doc.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGlContextLike | null;
    if (!gl) return "unavailable";
    const capability = classifyStudioVrmRenderer(readUnmaskedRenderer(gl));
    (gl.getExtension("WEBGL_lose_context") as { loseContext?: () => void } | null)?.loseContext?.();
    return capability;
  } catch {
    return "unavailable";
  }
}

export interface StudioVrmQualitySignals {
  readonly capability: StudioVrmGpuCapability;
  /** navigator.hardwareConcurrency. 알 수 없으면 undefined. */
  readonly hardwareConcurrency?: number;
  /** navigator.deviceMemory(GB, 근사값). 알 수 없으면 undefined. */
  readonly deviceMemoryGb?: number;
}

/**
 * 품질 등급 판정. 소프트웨어 렌더링이면 무조건 low다.
 * 프로브가 컨텍스트를 못 만든 경우(unavailable)는 그 신호만으로 낮추지 않는다 —
 * WebGL이 정말 없으면 편집기 자체가 열리지 않고, 일시적 실패(컨텍스트 한도 등)로
 * 정상 기기의 품질을 깎는 쪽이 더 나쁘기 때문이다.
 * 하드웨어 신호는 단독으로 쓰지 않는다: 코어 수는 보고 방식이 환경마다 달라 오탐이 잦아,
 * 메모리 1GB 이하(단독 확정) 또는 코어 2개 이하+메모리 4GB 이하(상호 확정)일 때만 low다.
 * 신호가 없으면 standard를 유지해 정상 기기를 과도하게 낮추지 않는다.
 */
export function resolveStudioVrmQualityTier(signals: StudioVrmQualitySignals): StudioVrmQualityTier {
  if (signals.capability === "software") return "low";
  const cores = signals.hardwareConcurrency;
  const memoryGb = signals.deviceMemoryGb;
  if (memoryGb !== undefined && memoryGb <= 1) return "low";
  if (cores !== undefined && cores <= 2 && memoryGb !== undefined && memoryGb <= 4) return "low";
  return "standard";
}

let cachedTier: StudioVrmQualityTier | null = null;

/** 브라우저 신호를 모아 등급을 한 번만 계산한다. 서버/테스트 환경에서는 standard. */
export function getStudioVrmQualityTier(): StudioVrmQualityTier {
  if (cachedTier) return cachedTier;
  if (typeof window === "undefined" || typeof navigator === "undefined") return "standard";
  const nav = navigator as Navigator & { deviceMemory?: number };
  cachedTier = resolveStudioVrmQualityTier({
    capability: probeStudioVrmGpuCapability(),
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemoryGb: nav.deviceMemory,
  });
  return cachedTier;
}

/** 테스트 전용: 캐시를 비운다. */
export function resetStudioVrmQualityTierCacheForTest(): void {
  cachedTier = null;
}
