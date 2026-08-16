import { describe, expect, it } from "vitest";

import {
  STUDIO_ROUTE_MANIFEST,
  resolveStudioRoute,
  studioRouteOwnsDocumentTitle,
} from "./studio-route-manifest";

describe("Studio route manifest", () => {
  it("declares one owner for each Studio route family", () => {
    expect(new Set(STUDIO_ROUTE_MANIFEST.map((route) => route.kind)).size).toBe(4);
    expect(new Set(STUDIO_ROUTE_MANIFEST.map((route) => route.id)).size).toBe(
      STUDIO_ROUTE_MANIFEST.length,
    );
  });

  it.each([
    [
      "/studio",
      "?id=work-1&room=team-a",
      "editor",
      "/studio/work/work-1/canvas?room=team-a",
      "/studio/work:work-1/editor",
    ],
    [
      "/studio",
      "?remix=source-1&room=team-a",
      "editor",
      "/studio/remix/source-1/canvas?room=team-a",
      "/studio/remix:source-1/editor",
    ],
    [
      "/studio/work/work-1/comic",
      "",
      "editor",
      "/studio/work/work-1/comic",
      "/studio/work:work-1/editor",
    ],
    [
      "/studio/work/work-1/animation",
      "",
      "editor",
      "/studio/work/work-1/animation",
      "/studio/work:work-1/editor",
    ],
    [
      "/studio/work/work-1/3d/dcc/shot",
      "",
      "editor",
      "/studio/work/work-1/3d/dcc/shot",
      "/studio/work:work-1/editor",
    ],
    [
      "/studio",
      "?mode=upload&id=work-1&titleId=title-2",
      "publish",
      "/studio/work/work-1/publish?titleId=title-2",
      "/studio/work:work-1/publish",
    ],
    [
      "/studio/upload",
      "?challengeId=challenge-1",
      "publish",
      "/studio/publish?challengeId=challenge-1",
      "/studio/draft/publish",
    ],
    [
      "/studio/publish",
      "?id=legacy-work&seriesId=series-1",
      "publish",
      "/studio/work/legacy-work/publish?seriesId=series-1",
      "/studio/work:legacy-work/publish",
    ],
    [
      "/studio/work/work-1/publish",
      "",
      "publish",
      "/studio/work/work-1/publish",
      "/studio/work:work-1/publish",
    ],
    [
      "/studio/tools-companion",
      "?view=review&session=primary-1",
      "companion",
      "/studio/companion/review?view=review&session=primary-1",
      "/studio/companion/review",
    ],
    [
      "/studio/projects",
      "",
      "placeholder",
      "/studio/projects",
      "/studio/projects",
    ],
    [
      "/studio/review",
      "",
      "placeholder",
      "/studio/review",
      "/studio/review",
    ],
    [
      "/studio/versions",
      "?tab=history",
      "placeholder",
      "/studio/versions?tab=history",
      "/studio/versions",
    ],
    [
      "/studio/work/work-1/present",
      "",
      "placeholder",
      "/studio/work/work-1/present",
      "/studio/work:work-1/present",
    ],
    [
      "/studio/work/work-1/review",
      "",
      "placeholder",
      "/studio/work/work-1/review",
      "/studio/work:work-1/review",
    ],
    [
      "/studio/remix/source-1/present",
      "",
      "placeholder",
      "/studio/remix/source-1/present",
      "/studio/remix:source-1/present",
    ],
    [
      "/studio/work/work-1/versions",
      "?tab=history",
      "placeholder",
      "/studio/work/work-1/versions?tab=history",
      "/studio/work:work-1/versions",
    ],
  ] as const)(
    "resolves %s%s to its canonical route",
    (pathname, search, kind, canonicalHref, lifecycleKey) => {
      expect(resolveStudioRoute({ pathname, search })).toMatchObject({
        canonicalHref,
        kind,
        lifecycleKey,
      });
    },
  );

  it.each([
    ["/studio", "?mode=upload&mode=upload", "invalid-mode"],
    ["/studio/3d/dcc/model", "?mode=upload", "invalid-mode"],
    ["/studio", "?id=work-1&remix=source-1", "identity-conflict"],
    ["/studio/remix/source-1/canvas", "?remix=source-2", "identity-conflict"],
    ["/studio/work/work-1/publish", "?id=work-2", "work-id-conflict"],
    ["/studio/companion/unknown", "", "invalid-path"],
    ["/studio/avatar", "", "invalid-path"],
    ["/studio/work/work-1/history", "", "invalid-path"],
  ] as const)("fails closed for %s%s", (pathname, search, errorCode) => {
    expect(resolveStudioRoute({ pathname, search })).toMatchObject({
      errorCode,
      kind: "invalid",
      ownsDocumentTitle: false,
    });
  });

  it("assigns title ownership to mounted Studio children only", () => {
    expect(studioRouteOwnsDocumentTitle({ pathname: "/studio/publish" })).toBe(true);
    expect(studioRouteOwnsDocumentTitle({
      pathname: "/studio/companion/navigator",
      search: "?view=navigator",
    })).toBe(true);
    expect(studioRouteOwnsDocumentTitle({ pathname: "/studio/projects" })).toBe(false);
    expect(studioRouteOwnsDocumentTitle({ pathname: "/studio/avatar" })).toBe(false);
  });
});
