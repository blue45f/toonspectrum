/**
 * 커스텀 브랜딩 테스트 (Track 4 · 벤치마크 gap 2)
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_SPACE_BRANDING,
  mergeStudioSpaceBranding,
  parseStudioSpaceBranding,
  studioBrandingDisplay,
  validateStudioSpaceBranding,
} from "./studio-virtual-space-branding";

describe("브랜딩 검증", () => {
  it("기본값은 통과한다", () => {
    expect(validateStudioSpaceBranding(DEFAULT_STUDIO_SPACE_BRANDING)).toEqual([]);
  });

  it("빈 공간 이름·잘못된 색상·URL을 거부한다", () => {
    expect(validateStudioSpaceBranding({ spaceName: " " }).length).toBeGreaterThan(0);
    expect(validateStudioSpaceBranding({ spaceName: "A", primaryColor: "red" }).length).toBeGreaterThan(0);
    expect(validateStudioSpaceBranding({ spaceName: "A", logoUrl: "http://x/y.png" }).length).toBeGreaterThan(0);
    expect(validateStudioSpaceBranding({ spaceName: "A", loadingBackground: "blue" }).length).toBeGreaterThan(0);
  });

  it("https·상대경로·hex 색상을 허용한다", () => {
    expect(validateStudioSpaceBranding({
      spaceName: "우리 회사",
      logoUrl: "https://example.com/logo.png",
      primaryColor: "#1a2b3c",
      loadingBackground: "/images/loading-bg.png",
      faviconUrl: "/favicon.ico",
    })).toEqual([]);
  });
});

describe("병합·파싱", () => {
  it("부분 설정을 기본값과 병합한다", () => {
    const merged = mergeStudioSpaceBranding({ spaceName: "우리 공간", primaryColor: "#ff0000" });
    expect(merged.spaceName).toBe("우리 공간");
    expect(merged.primaryColor).toBe("#ff0000");
    expect(merged.logoUrl).toBeUndefined();
  });

  it("unknown 입력을 파싱하고 실패 시 null을 반환한다", () => {
    const parsed = parseStudioSpaceBranding({ spaceName: "우리 공간", primaryColor: "#ff0000" });
    expect(parsed?.spaceName).toBe("우리 공간");
    expect(parseStudioSpaceBranding({ spaceName: "", primaryColor: "red" })).toBeNull();
    expect(parseStudioSpaceBranding(null)).toBeNull();
    expect(parseStudioSpaceBranding("문자열")).toBeNull();
  });
});

describe("표시 값", () => {
  it("폴백을 적용한다", () => {
    const display = studioBrandingDisplay(DEFAULT_STUDIO_SPACE_BRANDING);
    expect(display.title).toBe(DEFAULT_STUDIO_SPACE_BRANDING.spaceName);
    expect(display.background).toBe("#14141f");
  });

  it("로딩 타이틀이 있으면 우선한다", () => {
    const display = studioBrandingDisplay(mergeStudioSpaceBranding({
      spaceName: "우리 공간",
      loadingTitle: "입장 중…",
      loadingBackground: "#000000",
    }));
    expect(display.title).toBe("입장 중…");
    expect(display.background).toBe("#000000");
  });
});
