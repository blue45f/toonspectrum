import { describe, expect, it } from "vitest";

import { CREATOR_RESOURCE_TITLES } from "../creator-resource-titles";
import { shouldAppRouterOwnDocumentTitle } from "../app-route-title-ownership";
import { marketingRoutes } from "./marketing.routes";

import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";


describe("brand film route", () => {
  it("registers the canonical public brand-film URL", () => {
    expect(marketingRoutes).toContainEqual(
      expect.objectContaining({
        id: "marketing-brand-film",
        path: "/brand-film",
      }),
    );
    expect(isPublicCreativeRoute("/brand-film")).toBe(true);
    expect(isPublicCreativeRoute("/brand-film/")).toBe(true);
  });

  it("provides an accessible shell title while the page owns localized metadata", () => {
    expect(CREATOR_RESOURCE_TITLES["/brand-film"]).toBe("툰스튜디오 브랜드 필름");
    expect(
      shouldAppRouterOwnDocumentTitle({ pathname: "/brand-film" }),
    ).toBe(false);
  });
});
