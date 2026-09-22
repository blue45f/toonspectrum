import { describe, expect, it } from "vitest";
import { campusPublicObjects, campusSceneObjects } from "./campus-objects";

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

describe("district scene projections", () => {
  it.each([
    ["market", { id: "asset-A", title: "Asset", href: "/market/resource/asset-A", kind: "market-resource", exposure: "public" }],
    ["library", { id: "story-A", title: "Story", href: "/title/story-A", kind: "story", exposure: "public" }],
    ["gallery", { id: "post-A", title: "Post", href: "/community/post/post-A", kind: "community-post", exposure: "public" }],
    ["academy", { id: "lesson-A", title: "Lesson", href: "/learn/recipes?lesson=lesson-A", kind: "recipe", exposure: "public" }],
    ["production", { id: "project-A", title: "Project", href: "/production/projects/project-A/overview", kind: "project", exposure: "private" }],
    ["plaza", { id: "event-A", title: "Event", href: "/events/event-A", kind: "event", exposure: "public" }],
  ] as const)("keeps the real %s domain target without widening authority", (district, candidate) => {
    expect(campusSceneObjects([candidate], district)).toEqual([candidate]);
  });

  it("never exposes a private target in a public district even when its URL matches that district", () => {
    const privateStory = { id: "story-A", title: "Private story", href: "/title/story-A", exposure: "private" as const };
    const privateProject = { id: "project-A", title: "Private", href: "/production/projects/project-A/overview", exposure: "private" as const };
    expect(campusSceneObjects([privateStory], "library")).toEqual([]);
    expect(campusSceneObjects([privateProject], "gallery")).toEqual([]);
    expect(campusPublicObjects([privateStory, privateProject])).toEqual([]);
  });
  it.each([
    "/learn/recipes?lesson=one&lesson=two",
    "/learn/recipes?lesson=../escape",
    "/community/post/post-A?token=private",
    "/production/projects/project-A/overview?shareToken=private",
  ])("rejects ambiguous or widened target %s", (href) => {
    expect(campusSceneObjects([{ id: "x", title: "x", href }], "academy")).toEqual([]);
    expect(campusSceneObjects([{ id: "x", title: "x", href }], "gallery")).toEqual([]);
    expect(campusSceneObjects([{ id: "x", title: "x", href, exposure: "private" }], "production")).toEqual([]);
  });

  it("never projects fortune or service records into scene objects", () => {
    const candidate = { id: "saju", title: "Private reading", href: "/fortune?content=saju" };
    expect(campusSceneObjects([candidate], "observatory")).toEqual([]);
    expect(campusSceneObjects([candidate], "service")).toEqual([]);
  });
});
