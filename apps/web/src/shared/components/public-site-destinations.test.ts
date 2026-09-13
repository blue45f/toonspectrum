import { describe, expect, it } from "vitest";

import { activePublicJourney, nextPublicDestinations, PUBLIC_JOURNEY } from "./public-site-destinations";

describe("connected public destinations", () => {
  it.each([
    ["/references", "discover"], ["/research/assets/", "discover"], ["/learn/lessons/panels", "learn"],
    ["/guide", "learn"], ["/market/resource/brush", "market"], ["/create/work/a", "share"],
    ["/pencafe/100%25", "share"], ["/community/post/a", "share"],
  ])("announces one purpose for %s", (path, expected) => {
    expect(activePublicJourney(path)).toBe(expected);
  });
  it.each(["/studio", "/studio/new", "/studio/assets", "/admin", "/my", "/me", "/settings", "/library", "/market/library", "/market/publish", "/market/manage", "/market/wishlist", "/learn/records", "/auth/callback", "/unknown", "/", "/about/unknown"])("never injects onward promotion at %s", (path) => {
    expect(nextPublicDestinations(path)).toEqual([]);
  });
  it("avoids partial prefix matches", () => {
    expect(activePublicJourney("/marketplace")).toBeUndefined();
    expect(activePublicJourney("/learning")).toBeUndefined();
  });
  it.each(["/discover", "/learn", "/market", "/showcase", "/help", "/about"])("offers three distinct real destinations at %s", (path) => {
    const items = nextPublicDestinations(path);
    expect(items).toHaveLength(3);
    expect(new Set(items.map((item) => item.href)).size).toBe(3);
    expect(items.every((item) => item.id !== activePublicJourney(path))).toBe(true);
    expect(items.some((item) => item.href.startsWith("/studio") || item.href === "/make")).toBe(false);
  });
  it("has unique canonical navigation targets", () => {
    expect(new Set(PUBLIC_JOURNEY.map((item) => item.href)).size).toBe(PUBLIC_JOURNEY.length);
  });
});
