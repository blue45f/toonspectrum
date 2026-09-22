import { describe, expect, it } from "vitest";
import { campusPublicObjects } from "./campus-objects";

const item = { id: "brush-A", title: "Public brush", href: "/market/resource/brush-A" };
describe("bounded public scene projection", () => {
  it("keeps public display fields, not source records or private metadata", () => {
    const source = { ...item, birthday: "private", secret: "private", source: { private: true } };
    expect(campusPublicObjects([source])).toEqual([item]);
  });
  it.each(["/studio/p/A/d/B", "/fortune?content=saju", "https://evil.test", "/market/resource/A?token=private", "/market/resource/%252fsecret", "/market/resource/%0Asecret", "/market/resource/%2e%2e"])("rejects %s", (href) => {
    expect(campusPublicObjects([{ ...item, href }])).toEqual([]);
  });
  it.each(["https://tracking.test/img", "/api/private/source?token=secret", "/assets/../secret", "//evil.test/img"])("does not fetch unsafe thumbnail %s", (thumbnail) => {
    expect(campusPublicObjects([{ ...item, thumbnail }])).toEqual([item]);
  });
  it("preserves static approved asset references", () => {
    expect(campusPublicObjects([{ ...item, thumbnail: "/brand/atelier-materials.webp" }])[0]?.thumbnail).toBe("/brand/atelier-materials.webp");
  });
  it("deduplicates and limits the projection", () => {
    expect(campusPublicObjects([item, item])).toHaveLength(1);
    expect(campusPublicObjects(Array.from({ length: 100 }, (_, index) => ({ ...item, id: `item-${index}` })))).toHaveLength(24);
  });
});
