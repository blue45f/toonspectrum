import { describe, expect, it } from "vitest";

import { i18nDict } from "@/shared/lib/i18n";

import { appRoutes } from "./route-manifest";

describe("route manifest", () => {
  it("covers the canonical navigation surface with forty or more entries", () => {
    expect(appRoutes.length).toBeGreaterThanOrEqual(40);
  });

  it("keeps every manifest path unique", () => {
    const paths = appRoutes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("labels every entry with a key that exists in both locale dictionaries", () => {
    for (const route of appRoutes) {
      expect(i18nDict.ko[route.label], route.path).toBeTruthy();
      expect(i18nDict.en[route.label], route.path).toBeTruthy();
    }
  });

  it("exposes the pricing route for the upcoming navigation links", () => {
    expect(appRoutes).toContainEqual({ path: "/pricing", label: "route.pricing" });
  });
});
