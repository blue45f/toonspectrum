import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { resolveStudioMediaPipeVisionWasmFileset } from "./studio-mediapipe-vision-assets";

const SIMD = { wasmLoaderPath: "/assets/vision-simd.js", wasmBinaryPath: "/assets/vision-simd.wasm" };
const NO_SIMD = { wasmLoaderPath: "/assets/vision-nosimd.js", wasmBinaryPath: "/assets/vision-nosimd.wasm" };

describe("Studio 공용 MediaPipe Vision 자산", () => {
  it("SIMD 지원 환경에서는 package-matched same-origin SIMD 자산을 선택한다", async () => {
    const loadNoSimd = vi.fn(async () => NO_SIMD);
    await expect(resolveStudioMediaPipeVisionWasmFileset({
      isSimdSupported: async () => true,
      loadSimd: async () => SIMD,
      loadNoSimd,
    })).resolves.toEqual({
      variant: "simd",
      fileset: SIMD,
      compatibilityFallback: false,
    });
    expect(loadNoSimd).not.toHaveBeenCalled();
  });

  it("SIMD URL wrapper가 실패하면 외부 CDN 없이 non-SIMD 자산으로 한 번 폴백한다", async () => {
    await expect(resolveStudioMediaPipeVisionWasmFileset({
      isSimdSupported: async () => true,
      loadSimd: async () => { throw new Error("missing SIMD chunk"); },
      loadNoSimd: async () => NO_SIMD,
    })).resolves.toEqual({
      variant: "nosimd",
      fileset: NO_SIMD,
      compatibilityFallback: true,
    });
  });

  it("capability probe 실패도 non-SIMD 호환 경로로 복구하고 양쪽 자산 실패는 typed error다", async () => {
    await expect(resolveStudioMediaPipeVisionWasmFileset({
      isSimdSupported: async () => { throw new Error("probe failed"); },
      loadNoSimd: async () => NO_SIMD,
    })).resolves.toMatchObject({ variant: "nosimd", compatibilityFallback: false });

    await expect(resolveStudioMediaPipeVisionWasmFileset({
      isSimdSupported: async () => true,
      loadSimd: async () => { throw new Error("simd failed"); },
      loadNoSimd: async () => { throw new Error("nosimd failed"); },
    })).rejects.toMatchObject({ name: "StudioMediaPipeVisionWasmLoadError" });
  });

  it("마네킹·VRM 얼굴/손/포즈·전경 분리가 모두 공용 로컬 자산 권위를 사용한다", () => {
    const consumers = [
      "./scene-3d/studio-mannequin-webcam-tracking.ts",
      "./vrm/studio-vrm-webcam-tracking.ts",
      "./studio-bg-remove.ts",
    ].map((fileName) => readFileSync(new URL(fileName, import.meta.url), "utf8"));

    for (const source of consumers) {
      expect(source).toContain("resolveStudioMediaPipeVisionWasmFileset");
      expect(source).not.toMatch(/cdn\.jsdelivr\.net|unpkg\.com|forVisionTasks\(/i);
    }
  });
});
