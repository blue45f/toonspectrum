import { describe, expect, it } from "vitest";

import type { WorkSummary } from "@/platform/creator-client";

import { buildCreatorProfileShowcase } from "./creator-profile-showcase";

function work(overrides: Partial<WorkSummary> & Pick<WorkSummary, "id">): WorkSummary {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    description: "",
    cover: "",
    tags: overrides.tags ?? [],
    format: "cuttoon",
    titleId: null,
    status: overrides.status ?? "published",
    author: { id: "creator", name: "Creator", avatar: "#000" },
    likes: overrides.likes ?? 0,
    comments: overrides.comments ?? 0,
    views: overrides.views ?? 0,
    liked: false,
    createdAt: overrides.createdAt ?? "2026-09-16T00:00:00.000Z",
  };
}

describe("buildCreatorProfileShowcase", () => {
  it("ranks featured work by public engagement and derives specialties", () => {
    const result = buildCreatorProfileShowcase([
      work({ id: "a", views: 20, likes: 2, comments: 1, tags: ["판타지", "액션"] }),
      work({ id: "b", views: 10, likes: 10, tags: ["판타지", "로맨스"] }),
      work({ id: "c", views: 5, likes: 1, tags: ["액션"] }),
    ]);

    expect(result.featured.map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(result.specialties).toEqual(["액션", "판타지", "로맨스"]);
    expect(result.totalViews).toBe(35);
    expect(result.totalLikes).toBe(13);
  });

  it("does not expose drafts through showcase aggregation", () => {
    const result = buildCreatorProfileShowcase([
      work({ id: "public", views: 3, tags: ["공개"] }),
      work({ id: "draft", status: "draft", views: 999, likes: 999, tags: ["비공개"] }),
    ]);

    expect(result.featured.map((item) => item.id)).toEqual(["public"]);
    expect(result.specialties).toEqual(["공개"]);
    expect(result.totalViews).toBe(3);
    expect(result.totalLikes).toBe(0);
  });
});
