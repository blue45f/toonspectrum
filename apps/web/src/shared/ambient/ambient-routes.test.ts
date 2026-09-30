import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isAmbientRouteAllowed } from "./ambient-routes";

describe("isAmbientRouteAllowed", () => {
  it.each([
    "/",
    "/discover",
    "/explore",
    "/community",
    "/community/cafes/sample",
    "/about",
    "/about/technology",
    "/about/technology/story",
    "/learn",
    "/learn/recipes",
    "/market",
    "/market/resource/abc",
    "/research",
    "/research/open-data/nasa",
    "/title/some-title",
  ])("공개·랜딩 페이지 %s에서는 표시한다", (path) => {
    expect(isAmbientRouteAllowed(path)).toBe(true);
  });

  it.each([
    // 스튜디오 편집기
    "/studio/p/project-1",
    "/studio/p/project-1/story",
    // 3D 도구
    "/studio/bg3d",
    "/studio/poser",
    "/studio/assets/characters/new",
    "/studio/assets/characters/abc/edit",
    "/studio/character-convert",
    // 그 밖의 스튜디오 작업 화면과 예전 도구 주소
    "/studio",
    "/studio/new",
    "/shaper",
    "/brush-lab",
    // 협업 제작 보드
    "/production",
    "/production/projects/p1/episodes/e1",
    // 기술 발표 모드·영상
    "/about/technology/deck",
    "/about/technology/videos",
    "/brand-film",
    // 관리자
    "/admin",
    "/admin/members",
    // 몰입형 읽기
    "/read/spatial",
  ])("작업 집중 화면 %s에서는 끈다", (path) => {
    expect(isAmbientRouteAllowed(path)).toBe(false);
  });

  it("끝 슬래시·대소문자를 정규화한다", () => {
    expect(isAmbientRouteAllowed("/Studio/P/abc/")).toBe(false);
    expect(isAmbientRouteAllowed("/about/technology/deck/")).toBe(false);
    expect(isAmbientRouteAllowed("/Discover/")).toBe(true);
  });

  it("접두사가 비슷한 다른 경로는 끄지 않는다", () => {
    expect(isAmbientRouteAllowed("/studios-news")).toBe(true);
    expect(isAmbientRouteAllowed("/administer")).toBe(true);
    expect(isAmbientRouteAllowed("/about/technology/deck-notes")).toBe(true);
  });
});

describe("AppShell 연결", () => {
  const shell = readFileSync("apps/web/src/app/AppShell.tsx", "utf8");

  it("배경 호스트를 경로 규칙과 몰입 판정으로만 마운트한다", () => {
    expect(shell).toContain(
      "const ambientBackdrop = !immersiveVirtualExperience && isAmbientRouteAllowed(pathname);",
    );
    expect(shell).toMatch(
      /\{ambientBackdrop \? \(\s*<Suspense fallback=\{null\}><AmbientExperienceHost \/><\/Suspense>\s*\) : null\}/u,
    );
    expect(shell.match(/<AmbientExperienceHost \/>/gu)).toHaveLength(1);
  });

  it("배경 캔버스가 main의 형제가 되도록 사이트 프레임 안, main보다 앞에 둔다", () => {
    const frameStart = shell.indexOf("<SiteExperienceFrame enabled={enhancedSite}>");
    const host = shell.indexOf("<AmbientExperienceHost />");
    const main = shell.indexOf("<main");
    expect(frameStart).toBeGreaterThan(-1);
    expect(host).toBeGreaterThan(frameStart);
    expect(host).toBeLessThan(main);
  });
});
