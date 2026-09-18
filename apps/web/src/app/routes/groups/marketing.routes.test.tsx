import { describe, expect, it } from "vitest";

import { CREATOR_RESOURCE_TITLES } from "../creator-resource-titles";
import { shouldAppRouterOwnDocumentTitle } from "../app-route-title-ownership";
import { marketingRoutes } from "./marketing.routes";

import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";

describe("marketing film routes", () => {
  it("keeps the short brand-film URL public", () => {
    expect(marketingRoutes).toContainEqual(expect.objectContaining({ id: "marketing-brand-film", path: "/brand-film" }));
    expect(isPublicCreativeRoute("/brand-film")).toBe(true);
    expect(isPublicCreativeRoute("/brand-film/")).toBe(true);
  });

  it("registers the long-form product tour as a public route", () => {
    expect(marketingRoutes).toContainEqual(expect.objectContaining({ id: "marketing-product-tour", path: "/product-tour" }));
    expect(isPublicCreativeRoute("/product-tour")).toBe(true);
    expect(isPublicCreativeRoute("/product-tour/")).toBe(true);
  });

  it("registers the reusable event hub and beta opening detail as public routes", () => {
    expect(marketingRoutes).toContainEqual(
      expect.objectContaining({ id: "marketing-events", path: "/events" }),
    );
    expect(marketingRoutes).toContainEqual(
      expect.objectContaining({ id: "marketing-event-beta-open", path: "/events/beta-open" }),
    );
    expect(isPublicCreativeRoute("/events")).toBe(true);
    expect(isPublicCreativeRoute("/events/beta-open")).toBe(true);
    expect(isPublicCreativeRoute("/events/future-campaign")).toBe(true);
  });

  it("provides shell titles while marketing pages own localized metadata", () => {
    expect(CREATOR_RESOURCE_TITLES["/brand-film"]).toBe("툰스튜디오 브랜드 필름");
    expect(CREATOR_RESOURCE_TITLES["/product-tour"]).toBe("툰스튜디오 전체 제품 투어");
    expect(CREATOR_RESOURCE_TITLES["/events"]).toBe("이벤트");
    expect(CREATOR_RESOURCE_TITLES["/events/beta-open"]).toBe("베타 오픈 이벤트");
    expect(shouldAppRouterOwnDocumentTitle({ pathname: "/brand-film" })).toBe(false);
    expect(shouldAppRouterOwnDocumentTitle({ pathname: "/product-tour" })).toBe(false);
    expect(shouldAppRouterOwnDocumentTitle({ pathname: "/events" })).toBe(false);
    expect(shouldAppRouterOwnDocumentTitle({ pathname: "/events/beta-open" })).toBe(false);
  });
});
