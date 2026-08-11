import { describe, expect, it } from "vitest";

import {
  createStudioDccNavigationState,
  parseStudioWorkspaceRoute,
  shouldPreserveStudioRouteLifecycle,
  studioCanvasHref,
  studioDccHref,
  studioRouteStageKey,
  studioWorkspaceReturnHref,
} from "./studio-workspace-route";

describe("studio workspace routes", () => {
  it.each([
    ["/studio", "", "canvas", null, null, "/studio"],
    ["/studio?id=legacy", "?id=legacy", "canvas", "legacy", null, "/studio/work/legacy/canvas"],
    ["/studio/work/work-1", "", "canvas", "work-1", null, "/studio/work/work-1/canvas"],
    ["/studio/work/work-1/canvas", "", "canvas", "work-1", null, "/studio/work/work-1/canvas"],
    ["/studio/3d", "", "dcc", null, "model", "/studio/3d/dcc/model"],
    ["/studio/3d/dcc/sculpt", "", "dcc", null, "sculpt", "/studio/3d/dcc/sculpt"],
    ["/studio/work/work-1/3d", "", "dcc", "work-1", "model", "/studio/work/work-1/3d/dcc/model"],
    ["/studio/work/work-1/3d/dcc/shot", "", "dcc", "work-1", "shot", "/studio/work/work-1/3d/dcc/shot"],
  ] as const)(
    "parses %s as a durable %s workspace route",
    (rawPath, search, surface, workId, dccMode, canonicalPathname) => {
      const pathname = rawPath.split("?")[0];
      const route = parseStudioWorkspaceRoute({ pathname, search });
      expect(route).toMatchObject({
        canonicalPathname,
        dccMode,
        surface,
        valid: true,
        workId,
      });
    },
  );

  it.each([
    ["/studio/work", "", "invalid-work-id"],
    ["/studio/work/%5C/canvas", "", "invalid-work-id"],
    ["/studio/work/work-1/3d/dcc/unknown", "", "invalid-path"],
    ["/studio/avatar", "", "invalid-path"],
    ["/studio/work/work-1/canvas", "?id=work-2", "work-id-conflict"],
    ["/studio", "?id=..", "invalid-work-id"],
  ] as const)("fails closed for %s", (pathname, search, errorCode) => {
    expect(parseStudioWorkspaceRoute({ pathname, search })).toEqual({
      errorCode,
      valid: false,
    });
  });

  it("builds canonical canvas and DCC hrefs without legacy identity or upload switches", () => {
    const search = "?id=work-1&mode=upload&room=room-2&remix=source-3";
    expect(studioCanvasHref({ search, workId: "work/한글" })).toBe(
      "/studio/work/work%2F%ED%95%9C%EA%B8%80/canvas?room=room-2&remix=source-3",
    );
    expect(studioDccHref({ mode: "cad", search, workId: "work/한글" })).toBe(
      "/studio/work/work%2F%ED%95%9C%EA%B8%80/3d/dcc/cad?room=room-2&remix=source-3",
    );
    expect(parseStudioWorkspaceRoute({
      pathname: "/studio/work/work%2F%ED%95%9C%EA%B8%80/3d/dcc/cad",
    })).toMatchObject({ valid: true, workId: "work/한글" });
  });

  it("keeps one route-stage lifecycle across Studio canvas and DCC paths", () => {
    expect(studioRouteStageKey("/studio")).toBe("/studio");
    expect(studioRouteStageKey("/studio/work/work-1/3d/dcc/model")).toBe("/studio");
    expect(studioRouteStageKey("/ranking")).toBe("/ranking");
    expect(shouldPreserveStudioRouteLifecycle(
      "/studio/work/work-1/canvas",
      "/studio/work/work-1/3d/dcc/model",
    )).toBe(true);
    expect(shouldPreserveStudioRouteLifecycle("/studio", "/ranking")).toBe(false);
  });

  it("accepts only same-document canvas return receipts", () => {
    const canvasRoute = parseStudioWorkspaceRoute({
      pathname: "/studio/work/work-1/canvas",
    });
    const dccRoute = parseStudioWorkspaceRoute({
      pathname: "/studio/work/work-1/3d/dcc/model",
    });
    expect(canvasRoute.valid).toBe(true);
    expect(dccRoute.valid).toBe(true);
    if (!canvasRoute.valid || !dccRoute.valid) throw new Error("fixture route failed");
    const state = createStudioDccNavigationState(canvasRoute, {
      key: "canvas-entry",
      pathname: "/studio/work/work-1/canvas",
      search: "?room=team-2",
    });
    expect(studioWorkspaceReturnHref(state, dccRoute)).toBe(
      "/studio/work/work-1/canvas?room=team-2",
    );
    expect(studioWorkspaceReturnHref({
      studioWorkspaceReturn: {
        ...state.studioWorkspaceReturn,
        workId: "work-2",
      },
    }, dccRoute)).toBeNull();
    expect(studioWorkspaceReturnHref({
      studioWorkspaceReturn: {
        ...state.studioWorkspaceReturn,
        pathname: "/ranking",
      },
    }, dccRoute)).toBeNull();
  });

  it("reads return receipts without invoking hostile accessors", () => {
    const route = parseStudioWorkspaceRoute({ pathname: "/studio/3d/dcc/model" });
    if (!route.valid) throw new Error("fixture route failed");
    const state = {};
    Object.defineProperty(state, "studioWorkspaceReturn", {
      get() {
        throw new Error("must not execute");
      },
    });
    expect(studioWorkspaceReturnHref(state, route)).toBeNull();
  });
});
