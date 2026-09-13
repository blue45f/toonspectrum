import { describe, expect, it } from "vitest";

import { PUBLIC_JOURNEY, publicJourneyPhase, publicSiteNextSteps } from "./public-site-pathways";

describe("public creative pathways", () => {
  it.each([
    ["/search", "discover"], ["/research/assets/", "discover"], ["/references", "discover"],
    ["/learn/recipes", "learn"], ["/guide", "learn"], ["/market/resource/123", "resources"],
    ["/story-lab", "create"], ["/showcase/work/abc", "share"], ["/community/post/123", "share"],
    ["/create/promo", "share"],
  ])("classifies %s as one coherent step", (pathname, phase) => {
    expect(publicJourneyPhase(pathname)).toBe(phase);
  });

  it.each(["/", "/studio", "/studio/assets", "/admin", "/settings", "/marketplace", "/learning", "/create-other"])("does not claim unrelated route %s", (pathname) => {
    expect(publicJourneyPhase(pathname)).toBeUndefined();
  });

  it("provides five unique, stable top-level destinations", () => {
    expect(new Set(PUBLIC_JOURNEY.map((step) => step.id)).size).toBe(5);
    expect(new Set(PUBLIC_JOURNEY.map((step) => step.href)).size).toBe(5);
  });

  it.each(["/discover", "/research", "/research/assets", "/learn", "/market/browse", "/story-lab", "/showcase", "/about"])("onward cards from %s are unique, local, non-Studio and not self-links", (pathname) => {
    const next = publicSiteNextSteps(pathname);
    expect(next.length).toBeGreaterThanOrEqual(2);
    expect(next.length).toBeLessThanOrEqual(3);
    expect(new Set(next.map((entry) => entry.href)).size).toBe(next.length);
    for (const entry of next) {
      expect(entry.href).toMatch(/^\/(?:research|learn|market\/browse|story-lab|showcase)$/u);
      expect(entry.href).not.toBe(pathname);
      expect(pathname.startsWith(`${entry.href}/`)).toBe(false);
      expect(entry.ko.length).toBeGreaterThan(0);
      expect(entry.en.length).toBeGreaterThan(0);
    }
  });
});
