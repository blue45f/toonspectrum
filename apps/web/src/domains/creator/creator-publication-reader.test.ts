import { describe, expect, it } from "vitest";

import {
  resolveCreatorPublicationPageKey,
  resolveCreatorPublicationReaderPolicy,
} from "./creator-publication-reader";

describe("resolveCreatorPublicationReaderPolicy", () => {
  it("keeps legacy works on the historical open vertical experience", () => {
    const policy = resolveCreatorPublicationReaderPolicy({ legacy: true });

    expect(policy).toMatchObject({
      legacy: true,
      commentsAllowed: true,
      remixAllowed: true,
      contentRatingLabel: "전체 이용",
      readingLabel: "세로 스크롤",
      requiresMatureConfirmation: false,
    });
  });

  it("projects stored reader, engagement and rating policy", () => {
    const policy = resolveCreatorPublicationReaderPolicy({
      publication: {
        version: 1,
        mode: "immediate",
        visibility: "public",
        scheduledAt: null,
        timeZone: "Asia/Seoul",
        comments: "closed",
        allowRemix: false,
        readingMode: "paged",
        readingDirection: "rtl",
        contentRating: "mature",
        searchIndexing: true,
        socialTitle: "공유 제목",
        socialDescription: "공유 설명",
        canonicalSlug: "episode-1",
        publishedAt: "2026-09-09T00:00:00.000Z",
      },
    });

    expect(policy).toMatchObject({
      legacy: false,
      commentsAllowed: false,
      remixAllowed: false,
      contentRatingLabel: "성인 대상",
      readingLabel: "페이지 · 오른쪽→왼쪽",
      requiresMatureConfirmation: true,
    });
  });
});

describe("resolveCreatorPublicationPageKey", () => {
  it("maps physical arrow keys to logical page movement for both directions", () => {
    expect(resolveCreatorPublicationPageKey("ArrowRight", "ltr")).toBe("next");
    expect(resolveCreatorPublicationPageKey("ArrowLeft", "ltr")).toBe("previous");
    expect(resolveCreatorPublicationPageKey("ArrowLeft", "rtl")).toBe("next");
    expect(resolveCreatorPublicationPageKey("ArrowRight", "rtl")).toBe("previous");
  });

  it("supports paging and boundary keyboard commands", () => {
    expect(resolveCreatorPublicationPageKey("PageUp", "rtl")).toBe("previous");
    expect(resolveCreatorPublicationPageKey("PageDown", "rtl")).toBe("next");
    expect(resolveCreatorPublicationPageKey("Home", "ltr")).toBe("first");
    expect(resolveCreatorPublicationPageKey("End", "ltr")).toBe("last");
    expect(resolveCreatorPublicationPageKey("Enter", "ltr")).toBeNull();
  });
});
