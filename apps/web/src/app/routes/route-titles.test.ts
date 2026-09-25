import { describe, expect, it } from "vitest";

import { PRODUCT_IDENTITY } from "@/shared/lib/product-identity";

import { resolveRouteTitle } from "./route-titles";

const translate = ((key: string) => key) as unknown as Parameters<typeof resolveRouteTitle>[1];

describe("route title resolution", () => {
  it("preserves the complete localized introduction title at its new canonical address", () => {
    expect(resolveRouteTitle("/about/studio", translate, "ko")).toBe(PRODUCT_IDENTITY.ko.seoTitle);
    expect(resolveRouteTitle("/about/studio/", translate, "en")).toBe(PRODUCT_IDENTITY.en.seoTitle);
  });

  it("uses the product identity registry for the all-in-one homepage title", () => {
    expect(resolveRouteTitle("/", translate, "ko")).toBe(PRODUCT_IDENTITY.ko.seoTitle);
    expect(resolveRouteTitle("/", translate, "en")).toBe(PRODUCT_IDENTITY.en.seoTitle);
  });

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
    expect(resolveRouteTitle("/home", translate)).toBe("내 홈");
    expect(resolveRouteTitle("/production", translate)).toBe("route.production");
    expect(resolveRouteTitle("/production/projects", translate)).toBe("제작 프로젝트");
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
