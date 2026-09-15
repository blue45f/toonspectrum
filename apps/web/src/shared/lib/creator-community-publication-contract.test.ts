import { describe, expect, it } from "vitest";

import {
  creatorCommunityContentGroupOf,
  normalizeCreatorCommunityMetadata,
  readCreatorCommunityMetadata,
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
});
