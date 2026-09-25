import { describe, expect, it } from "vitest";
import type { SeriesSummary, WorkSummary } from "@/platform/creator-client";
import { createDefaultCreatorCommunityMetadata } from "@/shared/lib/creator-community-publication-contract";
import {
  spatialShowcaseObjects,
  spatialShowcaseSeriesObjects,
} from "./spatial-showcase-placement";

function work(
  id: string,
  options: {
    readonly portfolio?: boolean;
    readonly status?: string;
    readonly title?: string;
  } = {},
): WorkSummary {
  return {
    id,
    title: options.title ?? `작품 ${id}`,
    description: "",
    cover: "",
    tags: [],
    format: "cuttoon",
    titleId: null,
    status: options.status ?? "published",
    author: { id: "author-A", name: "작가", avatar: "" },
    likes: 0,
    comments: 0,
    views: 0,
    liked: false,
    createdAt: "2026-09-23T00:00:00.000Z",
    community: {
      ...createDefaultCreatorCommunityMetadata(),
      portfolio: options.portfolio ?? true,
    },
  };
}

function series(
  id: string,
  options: {
    readonly showcaseEnabled?: boolean;
    readonly episodes?: number;
    readonly title?: string;
  } = {},
): SeriesSummary {
  return {
    id,
    title: options.title ?? `시리즈 ${id}`,
    description: "",
    cover: "",
    tags: [],
    status: "ongoing",
    showcaseEnabled: options.showcaseEnabled ?? true,
    author: { id: "author-A", name: "작가", avatar: "" },
    episodes: options.episodes ?? 1,
    views: 0,
    likes: 0,
    latestEpisodeAt: "2026-09-23T00:00:00.000Z",
    isOwner: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
  };
}

describe("spatial showcase placement", () => {
  it("places only explicitly selected published works", () => {
    expect(spatialShowcaseObjects([
      work("featured"),
      work("ordinary", { portfolio: false }),
      work("draft", { status: "draft" }),
    ])).toEqual([{
      id: "featured",
      title: "작품 featured",
      href: "/showcase/work/featured",
      kind: "work",
      exposure: "public",
    }]);
  });

  it("deduplicates, encodes canonical hrefs, and respects a bounded limit", () => {
    expect(spatialShowcaseObjects([
      work("release with spaces"),
      work("release with spaces"),
      work("second"),
    ], 1)).toEqual([{
      id: "release%20with%20spaces",
      title: "작품 release with spaces",
      href: "/showcase/work/release%20with%20spaces",
      kind: "work",
      exposure: "public",
    }]);
    expect(spatialShowcaseObjects([work("featured")], 0)).toEqual([]);
  });

  it("fails closed when a public scene object cannot be canonicalized", () => {
    expect(spatialShowcaseObjects([
      work("unsafe/slash"),
      work("blank-title", { title: "   " }),
      work("safe"),
    ])).toEqual([{
      id: "safe",
      title: "작품 safe",
      href: "/showcase/work/safe",
      kind: "work",
      exposure: "public",
    }]);
  });

  it("places only explicitly selected series that already have a public episode", () => {
    expect(spatialShowcaseSeriesObjects([
      series("featured"),
      series("ordinary", { showcaseEnabled: false }),
      series("empty", { episodes: 0 }),
    ])).toEqual([{
      id: "series-featured",
      title: "시리즈 featured",
      href: "/showcase/series/featured",
      kind: "series",
      exposure: "public",
    }]);
  });

  it("keeps work and series identities separate and fails closed for unsafe series", () => {
    expect(spatialShowcaseSeriesObjects([
      series("release with spaces"),
      series("release with spaces"),
      series("unsafe/slash"),
      series("blank", { title: "   " }),
      series("second"),
    ], 1)).toEqual([{
      id: "series-release%20with%20spaces",
      title: "시리즈 release with spaces",
      href: "/showcase/series/release%20with%20spaces",
      kind: "series",
      exposure: "public",
    }]);
  });
});
