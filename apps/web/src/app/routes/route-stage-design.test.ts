import { describe, expect, it } from "vitest";

import { STUDIO_ROUTE_REGISTRY } from "@/domains/creator/studio-route-registry";
import { resolveStudioRoute } from "@/domains/creator/studio-router/studio-route-manifest";
import { appRoutes } from "./groups/app-routes";
import { resolveRouteStageDesign, SITE_DESIGN_DOMAINS } from "./route-stage-design";

function concretePath(pattern: string): string {
  return pattern.replace(/:[^/]+/gu, "sample-id").replace(/\/\*$/u, "");
}

describe("전체 경로의 시각 분류 계약", () => {
  it("catch-all을 제외한 모든 앱 등록 경로를 기본값에 의존하지 않고 분류한다", () => {
    const unclassified = appRoutes.filter(({ path }) => path !== "*")
      .filter(({ path }) => resolveRouteStageDesign(concretePath(path)).matchedBy === "fallback")
      .map(({ id, path }) => ({ id, path }));
    expect(unclassified).toEqual([]);
    for (const { path } of appRoutes) {
      const result = resolveRouteStageDesign(concretePath(path));
      expect(SITE_DESIGN_DOMAINS).toContain(result.domain);
      expect(result.artwork).not.toBe("");
    }
  });

  it("Studio 등록부의 모든 경로와 기존 별칭을 분류한다", () => {
    for (const registration of STUDIO_ROUTE_REGISTRY) {
      for (const path of [registration.pattern, ...registration.aliases]) {
        expect(resolveRouteStageDesign(concretePath(path)).matchedBy, path).not.toBe("fallback");
      }
    }
  });

  it.each([
    ["/", "home", "hero"],
    ["/studio", "projects", "canvas-noir"],
    ["/studio/assets/characters/new", "characters", "character-pink"],
    ["/studio/immersive", "backgrounds", "background-city"],
    ["/market/resource/brush-1", "assets", "character-blue"],
    ["/studio/p/project-1/story/chapter-2", "story", "canvas-noir"],
    ["/studio/generate/history/item-3", "ai", "luna"],
    ["/studio/p/project-1/export/package-4", "publish", "project-romance"],
    ["/community/cafes/atelier/manage", "community", "project-romance"],
    ["/title/long-story", "catalog", "project-crimson"],
    ["/about/technology/guides", "learn", "background-city"],
    ["/settings/integrations", "account", "character-blue"],
    ["/production/projects/project-1/episodes/episode-2", "production", "canvas-noir"],
    ["/privacy", "system", "hero"],
  ])("%s에 의미에 맞는 %s 영역과 아트를 전달한다", (path, domain, artwork) => {
    expect(resolveRouteStageDesign(path)).toMatchObject({ domain, artwork, artPlacement: "chrome" });
  });

  it.each([
    ["/studio/canvas", "editor"],
    ["/studio/work/work-1/comic", "editor"],
    ["/studio/remix/work-1/animation", "editor"],
    ["/studio/work/work-1/character", "characters"],
    ["/studio/poser", "characters"],
    ["/studio/bg3d", "backgrounds"],
    ["/studio/3d/dcc/model", "backgrounds"],
    ["/studio/brushes", "assets"],
    ["/studio/assets/brushes/new", "assets"],
    ["/studio/assets/brushes/brush-1/edit", "assets"],
    ["/studio/work/work-1/brush-lab", "assets"],
    ["/studio/remix/work-1/brush-lab", "assets"],
    ["/studio/compose/session-1", "editor"],
    ["/studio/work/work-1/storyworld", "story"],
    ["/studio/lift3d", "backgrounds"],
    ["/studio/publish", "publish"],
    ["/studio/work/work-1/review", "production"],
    ["/studio/p/project-1/d/document-1", "editor"],
    ["/studio/draft/draft-1", "editor"],
    ["/studio/space?place=skyport", "community"],
    ["/studio/p/project-1/space?place=skyport", "community"],
    ["/read/spatial", "backgrounds"],
    ["/admin/users", "system"],
  ])("작업 표면 %s의 %s 분류는 유지하면서 배경 아트를 차단한다", (path, domain) => {
    expect(resolveRouteStageDesign(path)).toMatchObject({ domain, artPlacement: "none" });
  });

  it("쿼리, 해시, 끝 슬래시는 시각 문맥을 바꾸지 않는다", () => {
    const original = resolveRouteStageDesign("/production/projects/project-1/episodes/episode-2");
    expect(resolveRouteStageDesign("/production/projects/project-1/episodes/episode-2/?tab=review#notes")).toEqual(original);
    expect(resolveRouteStageDesign("/shaper")).toEqual(resolveRouteStageDesign("/studio/assets/characters/new"));
  });

  it("기존 Studio 해석 결과를 읽으며 문서와 수명주기 권위를 변경하지 않는다", () => {
    const resolution = resolveStudioRoute({ pathname: "/studio/work/work-1/canvas", search: "?panel=layers" });
    const before = JSON.stringify(resolution);
    expect(resolveRouteStageDesign("/studio/work/work-1/canvas?panel=layers", resolution)).toMatchObject({
      domain: "editor", artPlacement: "none", matchedBy: "studio-runtime",
    });
    expect(JSON.stringify(resolution)).toBe(before);
  });

  it.each(["/unknown/deep/page", "/community-unknown", "/studio-invalid/canvas", "*"])(
    "알 수 없는 %s도 안전한 기본 디자인을 받으며 비슷한 이름의 경로군으로 새지 않는다",
    (path) => expect(resolveRouteStageDesign(path)).toMatchObject({ domain: "system", artPlacement: "none", matchedBy: "fallback" }),
  );
});
