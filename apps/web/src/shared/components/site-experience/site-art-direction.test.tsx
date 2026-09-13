// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, statSync } from "node:fs";

import { siteArtDirection, artworkSources, DESTINATION_ART } from "./site-art-direction";
import { SiteCreationCompass } from "./SiteCreationCompass";
import { PublicStoryHero } from "../public-story-hero";

vi.mock("@/shared/lib/i18n", () => ({ useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }) }));
vi.mock("@/domains/creator/studio-workspace-route", () => ({
  isStudioRoutePathname: (path: string) => path === "/studio" || path.startsWith("/studio/"),
  shouldPreserveStudioRouteLifecycle: () => true,
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("public creative art direction", () => {
  it.each(["/discover", "/explore", "/ranking", "/search", "/calendar", "/library", "/compare", "/research", "/references", "/insights/resources", "/learn", "/help", "/market", "/make", "/showcase", "/community", "/reviews", "/create", "/about", "/support", "/contact", "/sitemap"])("connects %s to a supported next action", (path) => {
    const direction = siteArtDirection(path);
    expect(direction).not.toBeNull();
    expect(direction?.href).toMatch(/^\/(?:studio(?:\?uiMode=simple)?|research|create\/promo)$/u);
    expect(direction?.ko.every(Boolean)).toBe(true);
    expect(direction?.en.every(Boolean)).toBe(true);
  });
  it.each(["/", "/studio", "/studio/draw", "/studio/projects", "/shaper", "/brush-lab", "/music", "/admin", "/login", "/auth/callback", "/settings", "/my", "/market/checkout", "/market/publish", "/market/manage", "/create/promo", "/create/work/example", "/showcase/series/example", "/fortune", "/play", "/privacy", "/terms", "/unknown"])("does not interrupt %s", (path) => {
    expect(siteArtDirection(path)).toBeNull();
  });
  it("normalizes route boundaries without treating unrelated names as editor paths", () => {
    expect(siteArtDirection("/LEARN///")).toEqual(siteArtDirection("/learn"));
    expect(siteArtDirection("/studio-other")).toBeNull();
    expect(siteArtDirection("https://example.com/research")).toBeNull();
  });
  it("provides local responsive assets within a 160 KB per-derivative budget", () => {
    for (const kind of new Set(Object.values(DESTINATION_ART))) {
      expect(artworkSources(kind)).toContain("640w");
      expect(artworkSources(kind)).toContain("1536w");
      for (const width of [640, 960]) expect(statSync(`apps/web/public/brand/atelier-${kind}-${width}.webp`).size).toBeLessThan(160_000);
    }
  });
  it("keeps artwork CSS inside the public frame, with reduced-motion and contrast rules", () => {
    const css = readFileSync("apps/web/src/shared/components/site-experience/site-art-direction.css", "utf8");
    expect(css).toContain("[data-site-experience]");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");
    expect(css).not.toMatch(/(?:^|\n)(?:body|html|:root)[\s{]/u);
  });
});

describe("artwork study controls", () => {
  const hero = () => render(<PublicStoryHero eyebrow="RESEARCH" title="관찰에서 시작하는 드로잉" description="나의 시선으로 장면을 관찰하세요." image="world" imageAlt="항구 도시를 그린 브랜드 콘셉트 아트" caption="세계와 장면 연구" />);
  it("changes values and composition without replacing the actual artwork", () => {
    const result = hero();
    const image = screen.getByRole("img");
    const src = image.getAttribute("src");
    fireEvent.click(screen.getByRole("button", { name: "명암" }));
    expect(result.container.querySelector('[data-artwork-view="values"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "명암" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "구도" }));
    expect(result.container.querySelector('[data-artwork-view="composition"]')).not.toBeNull();
    expect(screen.getByText(/삼분할 구도 가이드 예시/u)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "작품" }));
    expect(image.getAttribute("src")).toBe(src);
    expect(result.container.querySelector("video")).toBeNull();
  });
  it("keeps an h1 and the supplied image description for assistive technology", () => {
    hero();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("img").getAttribute("alt")).toBe("항구 도시를 그린 브랜드 콘셉트 아트");
    expect(screen.getByRole("group", { name: "작품 관찰 방식" })).not.toBeNull();
  });
});

describe("contextual creation compass", () => {
  it("starts compact with a real destination and no autoplay media", () => {
    const result = render(<MemoryRouter initialEntries={["/learn"]}><SiteCreationCompass /></MemoryRouter>);
    expect(result.container.querySelector("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getByRole("link", { name: "캔버스에서 연습하기" }).getAttribute("href")).toBe("/studio?uiMode=simple");
    expect(result.container.querySelector("video")).toBeNull();
  });
  it("renders nothing on a studio route", () => {
    const result = render(<MemoryRouter initialEntries={["/studio/comic"]}><SiteCreationCompass /></MemoryRouter>);
    expect(result.container.innerHTML).toBe("");
  });
});
