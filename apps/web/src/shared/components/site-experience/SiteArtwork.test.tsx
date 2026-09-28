// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SiteArtwork } from "./SiteArtwork";
import { SiteExperienceFrame } from "./SiteExperienceFrame";
import { useTheme } from "@/shared/lib/theme";
import type { DesignTheme } from "@/shared/lib/theme-presets";

const previousTheme = useTheme.getState().resolvedTheme;
const legacyThemes: DesignTheme[] = ["aurora", "blossom", "dark", "light", "graphite", "midnight", "sepia", "contrast"];

beforeEach(() => useTheme.setState({ resolvedTheme: "dark" }));
afterEach(() => {
  cleanup();
  useTheme.setState({ resolvedTheme: previousTheme });
});

describe("공통 브랜드 아트의 테마 경계", () => {
  it.each(legacyThemes)("%s 테마의 기존 작품과 설명을 보존한다", (theme) => {
    useTheme.setState({ resolvedTheme: theme });
    render(<SiteArtwork image="world" alt="기존 항구 콘셉트 아트" />);
    const artwork = screen.getByRole("img");
    expect(artwork.getAttribute("src")).toBe("/brand/atelier-world-960.webp");
    expect(artwork.getAttribute("srcset")).toContain("640w");
    expect(artwork.getAttribute("alt")).toBe("기존 항구 콘셉트 아트");
  });

  it("starlight 전환 후에도 관찰 모드와 이미지 노드를 보존한다", () => {
    const result = render(<SiteArtwork image="process" alt="이전 작업 과정" view="composition" />);
    const artwork = screen.getByRole("img");
    act(() => useTheme.setState({ resolvedTheme: "starlight" }));
    expect(screen.getByRole("img")).toBe(artwork);
    expect(artwork.getAttribute("src")).toBe("/brand/illustrated-20260928/canvas-noir.webp");
    expect(artwork.hasAttribute("srcset")).toBe(false);
    expect(artwork.getAttribute("alt")).toContain("ToonStudio");
    expect(artwork.getAttribute("alt")).not.toBe("이전 작업 과정");
    expect(result.container.querySelector('[data-artwork-view="composition"]')).not.toBeNull();
    act(() => useTheme.setState({ resolvedTheme: "light" }));
    expect(artwork.getAttribute("src")).toBe("/brand/atelier-process-960.webp");
    expect(artwork.getAttribute("alt")).toBe("이전 작업 과정");
  });

  it("새 아트 로드 실패는 기존 responsive 아트로 복구하고 재시도 루프를 만들지 않는다", () => {
    useTheme.setState({ resolvedTheme: "starlight" });
    render(<SiteArtwork image="materials" alt="소재 연구" priority />);
    const artwork = screen.getByRole("img");
    expect(artwork.getAttribute("src")).toBe("/brand/illustrated-20260928/character-blue.webp");
    fireEvent.error(artwork);
    expect(artwork.getAttribute("src")).toBe("/brand/atelier-materials-960.webp");
    expect(artwork.getAttribute("srcset")).toContain("1536w");
    expect(artwork.getAttribute("alt")).toBe("소재 연구");
    fireEvent.error(artwork);
    expect(artwork.getAttribute("src")).toBe("/brand/atelier-materials-960.webp");
  });

  it("장식 아트의 빈 대체 텍스트는 테마 전환에도 유지한다", () => {
    useTheme.setState({ resolvedTheme: "starlight" });
    const result = render(<SiteArtwork image="world" alt="" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(result.container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("공통 배경은 starlight에서만 새 아트를 사용하고 비활성 편집기에는 생성하지 않는다", () => {
    useTheme.setState({ resolvedTheme: "starlight" });
    const result = render(<SiteExperienceFrame enabled><main>페이지 내용</main></SiteExperienceFrame>);
    const scene = result.container.querySelector(".site-theme-scene");
    expect(scene?.getAttribute("src")).toBe("/brand/illustrated-20260928/hero.webp");
    expect(scene?.closest("[aria-hidden=true]")).not.toBeNull();
    act(() => useTheme.setState({ resolvedTheme: "light" }));
    expect(result.container.querySelector(".site-theme-scene")?.getAttribute("src")).toBe("/brand/theme-scenes/paper-studio.svg");
    result.rerender(<SiteExperienceFrame enabled={false}><main>원고 내용</main></SiteExperienceFrame>);
    expect(result.container.querySelector("img")).toBeNull();
    expect(screen.getByText("원고 내용")).not.toBeNull();
  });
});
