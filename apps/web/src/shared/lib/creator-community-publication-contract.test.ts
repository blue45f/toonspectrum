import { describe, expect, it } from "vitest";

import {
  creatorCommunityContentGroupOf,
  creatorCommunityPageAltText,
  normalizeCreatorCommunityMetadata,
  readCreatorCommunityMetadata,
  validateCreatorCommunityMetadata,
  writeCreatorCommunityMetadata,
} from "./creator-community-publication-contract";

describe("creator community publication contract", () => {
  it("uses format-aware conservative defaults for legacy documents", () => {
    expect(readCreatorCommunityMetadata({}, { format: "upload" })).toMatchObject({
      kind: "illustration",
      portfolio: false,
      provenance: "human",
    });
    expect(readCreatorCommunityMetadata({}, { format: "cuttoon" }).kind).toBe(
      "webtoon_episode",
    );
  });

  it("deduplicates bounded descriptors and makes no-feedback exclusive", () => {
    expect(
      normalizeCreatorCommunityMetadata({
        kind: "wip",
        contentDescriptors: ["horror", "horror", "invalid"],
        feedbackTopics: ["color", "none", "composition"],
      }),
    ).toMatchObject({
      kind: "wip",
      contentDescriptors: ["horror"],
      feedbackTopics: ["none"],
    });
  });

  it("preserves unrelated editor fields when writing metadata", () => {
    const next = writeCreatorCommunityMetadata(
      { pagesList: [{ id: "page-1" }], publication: { visibility: "public" } },
      normalizeCreatorCommunityMetadata({ kind: "page_comic", portfolio: true }),
    );
    expect(next.pagesList).toEqual([{ id: "page-1" }]);
    expect(next.publication).toEqual({ visibility: "public" });
    expect(next.community).toMatchObject({ kind: "page_comic", portfolio: true });
  });

  it("maps discoverable kinds into stable gallery groups", () => {
    expect(creatorCommunityContentGroupOf("illustration_set")).toBe("illustration");
    expect(creatorCommunityContentGroupOf("one_shot")).toBe("webtoon");
    expect(creatorCommunityContentGroupOf("process")).toBe("process");
  });
  it("supports explicit AI agent collaboration provenance", () => {
    expect(normalizeCreatorCommunityMetadata({ provenance: "agent_assisted" }).provenance)
      .toBe("agent_assisted");
  });

  it("surfaces accessibility and disclosure warnings before publication", () => {
    expect(validateCreatorCommunityMetadata({
      provenance: "agent_assisted",
      downloadAllowed: true,
      altText: "",
      attributionText: "",
    }, { pageCount: 1 }).map((issue) => issue.code)).toEqual([
      "ALT_TEXT_REQUIRED",
      "ASSISTANCE_DISCLOSURE_REQUIRED",
      "RIGHTS_ATTRIBUTION_RECOMMENDED",
    ]);
  });

  it("uses authored alt text and a deterministic title fallback per page", () => {
    expect(creatorCommunityPageAltText({ altText: "별빛 왕관을 쓴 소녀" }, "작품", 1, 3))
      .toBe("별빛 왕관을 쓴 소녀 2/3페이지");
    expect(creatorCommunityPageAltText({}, "성운의 왕관", 0, 1))
      .toBe("성운의 왕관 작품 이미지");
  });

});
