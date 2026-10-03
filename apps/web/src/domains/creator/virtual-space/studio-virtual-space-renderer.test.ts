import { describe, expect, it } from "vitest";
import {
  probeStudioVirtualWebGL,
  studioVirtualIsSoftwareWebGLRenderer,
  studioVirtualRendererDecision,
  studioVirtualRendererPowerPreference,
  type StudioVirtualWebGLProbe,
} from "./studio-virtual-space-renderer";

const HARDWARE: StudioVirtualWebGLProbe = Object.freeze({
  supported: true,
  software: false,
  rendererName: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
});
const SOFTWARE: StudioVirtualWebGLProbe = Object.freeze({
  supported: true,
  software: true,
  rendererName: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
});
const UNSUPPORTED: StudioVirtualWebGLProbe = Object.freeze({
  supported: false,
  software: false,
  rendererName: null,
});

describe("가상스튜디오 렌더러 판정", () => {
  it("auto는 하드웨어 WebGL에서만 WebGL을 고른다", () => {
    const decision = studioVirtualRendererDecision("auto", HARDWARE);
    expect(decision.kind).toBe("webgl");
    expect(decision.reason).toBe("auto-webgl");
  });

  it("auto는 소프트웨어 WebGL(SwiftShader)을 Canvas로 돌린다 — AUTO가 놓치는 느린 경로", () => {
    const decision = studioVirtualRendererDecision("auto", SOFTWARE);
    expect(decision.kind).toBe("canvas");
    expect(decision.reason).toBe("auto-software-webgl");
  });

  it("auto는 WebGL 불가 환경에서 Canvas로 폴백한다", () => {
    const decision = studioVirtualRendererDecision("auto", UNSUPPORTED);
    expect(decision.kind).toBe("canvas");
    expect(decision.reason).toBe("auto-webgl-unavailable");
  });

  it("명시 선호는 프로브보다 우선하되, webgl 선호도 불가면 부팅 실패 대신 Canvas로 폴백한다", () => {
    expect(studioVirtualRendererDecision("canvas", HARDWARE)).toMatchObject({
      kind: "canvas",
      reason: "preference-canvas",
    });
    expect(studioVirtualRendererDecision("webgl", SOFTWARE)).toMatchObject({
      kind: "webgl",
      reason: "preference-webgl",
    });
    expect(studioVirtualRendererDecision("webgl", UNSUPPORTED)).toMatchObject({
      kind: "canvas",
      reason: "preference-webgl-unavailable",
    });
  });

  it("소프트웨어 렌더러 이름 패턴을 판정한다", () => {
    expect(studioVirtualIsSoftwareWebGLRenderer("ANGLE (Google, SwiftShader driver)")).toBe(true);
    expect(studioVirtualIsSoftwareWebGLRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(studioVirtualIsSoftwareWebGLRenderer("Microsoft Basic Render Driver")).toBe(true);
    expect(studioVirtualIsSoftwareWebGLRenderer("ANGLE (NVIDIA, GeForce RTX 4070)")).toBe(false);
    expect(studioVirtualIsSoftwareWebGLRenderer("Apple M2 Pro")).toBe(false);
    expect(studioVirtualIsSoftwareWebGLRenderer(null)).toBe(false);
    expect(studioVirtualIsSoftwareWebGLRenderer(undefined)).toBe(false);
  });

  it("powerPreference는 WebGL에서만, 절전 등급에서는 low-power로 준다", () => {
    expect(studioVirtualRendererPowerPreference("webgl", "ultra")).toBe("high-performance");
    expect(studioVirtualRendererPowerPreference("webgl", "high")).toBe("high-performance");
    expect(studioVirtualRendererPowerPreference("webgl", "battery")).toBe("low-power");
    expect(studioVirtualRendererPowerPreference("webgl", "accessibility")).toBe("low-power");
    expect(studioVirtualRendererPowerPreference("canvas", "ultra")).toBeUndefined();
  });

  it("프로브는 DOM이 없는 환경에서도 던지지 않고 미지원으로 답한다", () => {
    const probe = probeStudioVirtualWebGL();
    expect(typeof probe.supported).toBe("boolean");
    if (!probe.supported) expect(probe.rendererName).toBeNull();
  });
});
