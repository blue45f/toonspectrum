import { describe, expect, it } from "vitest";
import {
  classifyStudioVrmRenderer,
  probeStudioVrmGpuCapability,
  resolveStudioVrmQualityTier,
} from "./studio-vrm-gpu-capability";

describe("GPU 렌더러 문자열 분류", () => {
  it.each([
    "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
    "Google SwiftShader",
    "llvmpipe (LLVM 15.0.7, 256 bits)",
    "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Mesa softpipe",
  ])("소프트웨어 래스터라이저를 software로 가른다: %s", (renderer) => {
    expect(classifyStudioVrmRenderer(renderer)).toBe("software");
  });

  it.each([
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)",
    "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Apple GPU",
  ])("하드웨어 렌더러를 hardware로 가른다: %s", (renderer) => {
    expect(classifyStudioVrmRenderer(renderer)).toBe("hardware");
  });

  it("문자열을 못 읽으면 과도하게 낮추지 않도록 hardware로 본다", () => {
    expect(classifyStudioVrmRenderer(null)).toBe("hardware");
    expect(classifyStudioVrmRenderer(undefined)).toBe("hardware");
    expect(classifyStudioVrmRenderer("")).toBe("hardware");
    expect(classifyStudioVrmRenderer("   ")).toBe("hardware");
  });
});

describe("품질 등급 판정", () => {
  it("소프트웨어 렌더링이면 사양 신호와 무관하게 low다", () => {
    expect(resolveStudioVrmQualityTier({ capability: "software", hardwareConcurrency: 16, deviceMemoryGb: 16 })).toBe("low");
  });
  it("프로브 불가(unavailable)만으로는 낮추지 않고 확정 신호가 있을 때만 낮춘다", () => {
    expect(resolveStudioVrmQualityTier({ capability: "unavailable" })).toBe("standard");
    expect(resolveStudioVrmQualityTier({ capability: "unavailable", deviceMemoryGb: 1 })).toBe("low");
  });
  it("하드웨어 + 확정 저사양 신호면 low다", () => {
    expect(resolveStudioVrmQualityTier({ capability: "hardware", deviceMemoryGb: 1 })).toBe("low");
    expect(resolveStudioVrmQualityTier({ capability: "hardware", hardwareConcurrency: 2, deviceMemoryGb: 4 })).toBe("low");
  });
  it("코어 수 같은 단일 약신호만으로는 낮추지 않는다", () => {
    expect(resolveStudioVrmQualityTier({ capability: "hardware", hardwareConcurrency: 2 })).toBe("standard");
    expect(resolveStudioVrmQualityTier({ capability: "hardware", deviceMemoryGb: 2 })).toBe("standard");
  });
  it("하드웨어 + 일반 사양이면 standard다", () => {
    expect(resolveStudioVrmQualityTier({ capability: "hardware", hardwareConcurrency: 8, deviceMemoryGb: 8 })).toBe("standard");
    expect(resolveStudioVrmQualityTier({ capability: "hardware" })).toBe("standard");
  });
});

describe("GPU 역량 프로브", () => {
  function fakeDocWithContext(gl: unknown) {
    return {
      createElement: () => ({ getContext: () => gl }),
    } as unknown as Document;
  }
  function fakeDoc(rendererName: string) {
    const gl = {
      getExtension: (name: string) => (name === "WEBGL_lose_context" ? { loseContext: () => {} } : {}),
      getParameter: () => rendererName,
    };
    return fakeDocWithContext(gl);
  }

  it("소프트웨어 렌더러 문자열을 읽으면 software다", () => {
    expect(probeStudioVrmGpuCapability(fakeDoc("llvmpipe (LLVM 15.0.7, 256 bits)"))).toBe("software");
  });
  it("하드웨어 렌더러 문자열을 읽으면 hardware다", () => {
    expect(probeStudioVrmGpuCapability(fakeDoc("ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)"))).toBe("hardware");
  });
  it("컨텍스트를 만들 수 없으면 unavailable이다", () => {
    expect(probeStudioVrmGpuCapability(fakeDocWithContext(null))).toBe("unavailable");
  });
  it("문서가 없으면 unavailable이다", () => {
    expect(probeStudioVrmGpuCapability(undefined)).toBe("unavailable");
  });
});
