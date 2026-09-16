import { describe, expect, it } from "vitest";

import { PRODUCT_IDENTITY, PRODUCT_START_DESTINATIONS, resolveProductLocale } from "./product-identity";

describe("product identity", () => {
  it("defines one all-in-one promise in Korean and English", () => {
    for (const locale of ["ko", "en"] as const) {
      const copy = PRODUCT_IDENTITY[locale];
      expect(copy.brand.length).toBeGreaterThan(0);
      expect(copy.category.length).toBeGreaterThan(0);
      expect(copy.headline).toHaveLength(2);
      expect(copy.description.length).toBeGreaterThan(40);
      expect(copy.seoTitle.length).toBeGreaterThan(10);
      expect(copy.seoDescription.length).toBeGreaterThan(40);
    }
    expect(PRODUCT_IDENTITY.ko.category).toContain("올인원");
    expect(PRODUCT_IDENTITY.ko.headline.join(" ")).toContain("기획부터 연재까지");
  });

  it("offers task-first destinations without duplicate routes", () => {
    expect(PRODUCT_START_DESTINATIONS.map((destination) => destination.id)).toEqual([
      "plan",
      "draw",
      "three-d",
      "assets",
      "collaborate",
      "publish",
    ]);
    expect(new Set(PRODUCT_START_DESTINATIONS.map((destination) => destination.href)).size).toBe(
      PRODUCT_START_DESTINATIONS.length,
    );
    for (const destination of PRODUCT_START_DESTINATIONS) {
      expect(destination.href).toMatch(/^\//u);
      expect(destination.label.ko.length).toBeGreaterThan(0);
      expect(destination.label.en.length).toBeGreaterThan(0);
      expect(destination.description.ko.length).toBeGreaterThan(8);
      expect(destination.description.en.length).toBeGreaterThan(8);
    }
  });

  it("does not position external drawing software as a required dependency", () => {
    const copy = JSON.stringify({ PRODUCT_IDENTITY, PRODUCT_START_DESTINATIONS });
    for (const obsolete of [
      "그림은 익숙한 도구에서",
      "기존 드로잉 도구 그대로",
      "Keep your drawing tools",
      "No tool migration required",
    ]) {
      expect(copy).not.toContain(obsolete);
    }
  });

  it("normalizes regional language tags safely", () => {
    expect(resolveProductLocale("ko-KR")).toBe("ko");
    expect(resolveProductLocale("ko_KR")).toBe("ko");
    expect(resolveProductLocale("en-US")).toBe("en");
    expect(resolveProductLocale("ja-JP")).toBe("en");
  });
});
