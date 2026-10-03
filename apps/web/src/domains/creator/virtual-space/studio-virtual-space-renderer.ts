/**
 * 가상스튜디오 렌더러 판정 (GPU 성능 트랙)
 *
 * Phaser.AUTO는 `getContext('webgl')` 성공 여부만으로 WebGL을 고른다.
 * 그래서 GPU가 없는 환경의 소프트웨어 WebGL(SwiftShader·llvmpipe)도
 * "WebGL 가능"으로 통과해, 정작 가장 느린 경로가 기본값이 된다.
 * 이 모듈은 실제 WebGL 컨텍스트를 한 번 만들어 렌더러 문자열까지 확인한 뒤
 * - 하드웨어 WebGL → WebGL
 * - 소프트웨어 WebGL 또는 WebGL 불가 → Canvas (최후 폴백)
 * 로 판정한다. 판정 근거(reason)를 함께 돌려줘 진단·테스트가 가능하게 한다.
 */

/** 페이지·하네스가 요청하는 렌더러 선호. */
export type StudioVirtualRendererPreference = "auto" | "webgl" | "canvas";

/** 실제로 만들 렌더러 종류. */
export type StudioVirtualRendererKind = "webgl" | "canvas";

/** 판정 사유. 진단 dataset과 테스트가 그대로 쓴다. */
export type StudioVirtualRendererReason =
  | "preference-canvas"
  | "preference-webgl"
  | "preference-webgl-unavailable"
  | "auto-webgl"
  | "auto-software-webgl"
  | "auto-webgl-unavailable";

/** WebGL 프로브 결과. rendererName은 디버그 렌더러 정보가 막히면 null. */
export interface StudioVirtualWebGLProbe {
  readonly supported: boolean;
  readonly software: boolean;
  readonly rendererName: string | null;
}

export interface StudioVirtualRendererDecision {
  readonly kind: StudioVirtualRendererKind;
  readonly reason: StudioVirtualRendererReason;
  readonly probe: StudioVirtualWebGLProbe;
}

/**
 * 소프트웨어 WebGL 렌더러 이름 패턴.
 * 브라우저가 보고하는 UNMASKED_RENDERER_WEBGL 문자열 기준이다.
 * - SwiftShader (Chrome의 소프트웨어 WebGL)
 * - llvmpipe / softpipe (Mesa 소프트웨어 파이프라인)
 * - Microsoft Basic Render Driver (Windows 소프트웨어 렌더)
 * - "Software Rasterizer" 표기 변형
 */
const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software\s*rasterizer|basic\s*render/i;

export function studioVirtualIsSoftwareWebGLRenderer(
  rendererName: string | null | undefined,
): boolean {
  return typeof rendererName === "string" && SOFTWARE_RENDERER_PATTERN.test(rendererName);
}

/**
 * 순수 판정 함수. 프로브 결과를 주입받으므로 DOM 없이 테스트할 수 있다.
 * - canvas 선호: 무조건 Canvas (라이프사이클 전용 하네스)
 * - webgl 선호: 지원하면 WebGL, 아니면 Canvas로 폴백 (부팅 실패로 세우지 않는다)
 * - auto: 하드웨어 WebGL만 WebGL. 소프트웨어 WebGL은 Canvas가 더 빠르다 —
 *   셰이더 파이프라인을 CPU로 돌리는 SwiftShader보다 Canvas 2D 래스터가
 *   이 장면(스프라이트 위주 2D)에서는 값싸고, 글로우 ADD 블렌드도 Canvas가 지원한다.
 */
export function studioVirtualRendererDecision(
  preference: StudioVirtualRendererPreference,
  probe: StudioVirtualWebGLProbe,
): StudioVirtualRendererDecision {
  const frozenProbe = Object.freeze({ ...probe });
  if (preference === "canvas") {
    return Object.freeze({ kind: "canvas", reason: "preference-canvas", probe: frozenProbe });
  }
  if (preference === "webgl") {
    return probe.supported
      ? Object.freeze({ kind: "webgl", reason: "preference-webgl", probe: frozenProbe })
      : Object.freeze({ kind: "canvas", reason: "preference-webgl-unavailable", probe: frozenProbe });
  }
  if (!probe.supported) {
    return Object.freeze({ kind: "canvas", reason: "auto-webgl-unavailable", probe: frozenProbe });
  }
  if (probe.software) {
    return Object.freeze({ kind: "canvas", reason: "auto-software-webgl", probe: frozenProbe });
  }
  return Object.freeze({ kind: "webgl", reason: "auto-webgl", probe: frozenProbe });
}

/**
 * WebGL 컨텍스트 powerPreference 판정.
 * - WebGL + 일반 등급: "high-performance" (듀얼 GPU에서 외장 GPU 힌트)
 * - WebGL + 배터리·접근성 등급: "low-power" (등급 자체가 절전이 목적)
 * - Canvas: 컨텍스트 속성이 없으므로 undefined (설정 자체를 넣지 않는다)
 */
export function studioVirtualRendererPowerPreference(
  kind: StudioVirtualRendererKind,
  tier: string,
): "high-performance" | "low-power" | undefined {
  if (kind !== "webgl") return undefined;
  return tier === "battery" || tier === "accessibility" ? "low-power" : "high-performance";
}

let cachedProbe: StudioVirtualWebGLProbe | null = null;

/**
 * 실제 WebGL 프로브. 컨텍스트를 한 번 만들고 즉시 해제한다
 * (브라우저의 동시 컨텍스트 상한을 먹지 않기 위함). 결과는 모듈 단위로 캐시한다.
 * Phaser가 쓰는 것과 같은 'webgl' → 'experimental-webgl' 순으로 시도한다.
 */
export function probeStudioVirtualWebGL(): StudioVirtualWebGLProbe {
  if (cachedProbe) return cachedProbe;
  cachedProbe = runProbe();
  return cachedProbe;
}

function runProbe(): StudioVirtualWebGLProbe {
  const unsupported: StudioVirtualWebGLProbe = Object.freeze({
    supported: false,
    software: false,
    rendererName: null,
  });
  try {
    if (typeof document === "undefined") return unsupported;
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return unsupported;
    let rendererName: string | null = null;
    try {
      const extension = gl.getExtension("WEBGL_debug_renderer_info");
      const raw = extension
        ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      if (typeof raw === "string" && raw.length > 0) rendererName = raw;
    } catch {
      rendererName = null;
    }
    try {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // 해제 실패는 판정에 영향이 없다.
    }
    return Object.freeze({
      supported: true,
      software: studioVirtualIsSoftwareWebGLRenderer(rendererName),
      rendererName,
    });
  } catch {
    return unsupported;
  }
}
