import { describe, expect, it } from "vitest";

import { STATIC_TITLES } from "../route-titles";
import { legalRoutes } from "./legal.routes";

import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";

const ABOUT_ROUTE_FAMILY = [
  { id: "legal-about", path: "/about" },
  { id: "legal-about-workflow", path: "/about/workflow" },
  { id: "legal-about-technology", path: "/about/technology" },
  { id: "legal-about-principles", path: "/about/principles" },
] as const;

describe("ToonStudio introduction route family", () => {
  it("registers the service, workflow, technology and product-principles pages as explicit routes", () => {
    for (const expectedRoute of ABOUT_ROUTE_FAMILY) {
      expect(legalRoutes).toContainEqual(expect.objectContaining(expectedRoute));
    }
  });

  it("keeps every introduction page inside the public creative experience", () => {
    for (const { path } of ABOUT_ROUTE_FAMILY) {
      expect(isPublicCreativeRoute(path), path).toBe(true);
      expect(isPublicCreativeRoute(`${path}/`), `${path}/`).toBe(true);
    }
  });

  it("keeps generic route-title ownership while each page applies its specific document title", () => {
    for (const { path } of ABOUT_ROUTE_FAMILY) {
      expect(STATIC_TITLES[path], path).toBe("route.about");
    }
  });
});
