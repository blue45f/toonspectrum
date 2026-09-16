import { describe, expect, it } from "vitest";

import { resolveRouteTitle } from "./route-titles";

const translate = ((key: string) => key) as unknown as Parameters<typeof resolveRouteTitle>[1];

describe("route title resolution", () => {
  it("keeps legacy and canonical showcase URLs on the same browser title", () => {
    expect(resolveRouteTitle("/create", translate)).toBe("route.create");
    expect(resolveRouteTitle("/showcase", translate)).toBe("route.create");
  });

  it("normalizes redirected creation tools before resolving their title", () => {
    expect(resolveRouteTitle("/publishing", translate)).toBe("route.studioPublish");
    expect(resolveRouteTitle("/music", translate)).toBe("route.studio");
    expect(resolveRouteTitle("/brush-lab", translate)).toBe("route.studio");
  });

  it("uses the primary route authority for Production and Studio front doors", () => {
    expect(resolveRouteTitle("/production", translate)).toBe("route.production");
    expect(resolveRouteTitle("/production/projects/sample-project/review", translate)).toBe("route.production");
    expect(resolveRouteTitle("/studio/new", translate)).toBe("route.studioNew");
    expect(resolveRouteTitle("/studio/assets", translate)).toBe("route.studioAssets");
  });

  it("provides specific accessible labels for canvas-first studio workspaces", () => {
    expect(resolveRouteTitle("/studio/3d/dcc/build", translate)).toBe("3D 공간 제작");
    expect(resolveRouteTitle("/studio/3d/dcc/model", translate)).toBe("3D 모델링");
    expect(resolveRouteTitle("/studio/ai-lab", translate)).toBe("AI 실험실");
  });

  it("retains useful dynamic labels for creator pages", () => {
    expect(resolveRouteTitle("/author/%EA%B9%80%ED%9D%AC%EC%A4%80", translate)).toBe("김희준");
  });
});
