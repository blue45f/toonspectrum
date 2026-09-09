import { describe, expect, it } from "vitest";

import { createDefaultCreatorPublicationDirective } from "@/shared/lib/creator-publication-contract";

import {
  formatStudioPublicationLocalDateTime,
  parseStudioPublicationTags,
  resolveStudioPublicationSchedule,
  suggestStudioPublicationSocialMetadata,
  validateStudioPublicationPreflight,
} from "./studio-publication-preflight";

const now = new Date("2026-09-09T09:00:00.000Z");

function directive(overrides: Record<string, unknown> = {}) {
  return {
    ...createDefaultCreatorPublicationDirective("Asia/Seoul"),
    socialTitle: "공유 제목",
    socialDescription: "공유 설명",
    canonicalSlug: "episode-1",
    ...overrides,
  };
}

function validInput() {
  return {
    title: "오늘의 툰",
    description: "오늘 있었던 일을 그린 작품입니다.",
    tags: ["일상", "코미디"],
    pages: [
      { id: "page-1", name: "1.webp", width: 720, height: 1280 },
      { id: "page-2", name: "2.webp", width: 720, height: 1280 },
    ],
    directive: directive(),
    now,
  };
}

describe("studio publication metadata helpers", () => {
  it("normalizes tags and limits the payload", () => {
    expect(
      parseStudioPublicationTags("#일상, 일상   코미디 판타지 액션 드라마 로맨스 SF 공포 추가"),
    ).toEqual(["일상", "일상", "코미디", "판타지", "액션", "드라마", "로맨스", "SF"]);
  });

  it("suggests bounded social metadata and a readable slug", () => {
    expect(suggestStudioPublicationSocialMetadata("  나의 첫 작품!  ", "  긴   소개 문장  ")).toEqual({
      socialTitle: "나의 첫 작품!",
      socialDescription: "긴 소개 문장",
      canonicalSlug: "나의-첫-작품",
    });
  });

  it("converts an IANA-zone wall clock to canonical UTC and back", () => {
    expect(resolveStudioPublicationSchedule("2026-09-10T18:30", "Asia/Seoul")).toEqual({
      ok: true,
      iso: "2026-09-10T09:30:00.000Z",
      message: null,
    });
    expect(
      formatStudioPublicationLocalDateTime("2026-09-10T09:30:00.000Z", "Asia/Seoul"),
    ).toBe("2026-09-10T18:30");
  });

  it("rejects malformed and daylight-saving ambiguous wall clocks", () => {
    expect(resolveStudioPublicationSchedule("", "Asia/Seoul")).toMatchObject({
      ok: false,
      iso: null,
    });
    expect(resolveStudioPublicationSchedule("2026-11-01T01:30", "America/New_York")).toEqual({
      ok: false,
      iso: null,
      message: "일광절약시간 전환으로 두 번 존재하는 시각입니다. 다른 시간을 선택해 주세요.",
    });
  });
});

describe("validateStudioPublicationPreflight", () => {
  it("accepts a complete immediate publication", () => {
    const result = validateStudioPublicationPreflight(validInput());

    expect(result.canPublish).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("blocks missing content and invalid page metadata", () => {
    const result = validateStudioPublicationPreflight({
      ...validInput(),
      title: " ",
      pages: [
        { id: "same", width: 0, height: 1280 },
        { id: "same", width: 720, height: Number.NaN },
      ],
    });

    expect(result.canPublish).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual([
      "TITLE_REQUIRED",
      "PAGE_DIMENSIONS_INVALID",
      "PAGE_ID_DUPLICATE",
      "PAGE_DIMENSIONS_INVALID",
    ]);
  });

  it("warns about weak discovery metadata, duplicate tags, and vertical-layout risk", () => {
    const result = validateStudioPublicationPreflight({
      ...validInput(),
      description: "",
      tags: ["#Romance", " romance "],
      pages: [
        { id: "a", width: 1280, height: 720 },
        { id: "b", width: 720, height: 1280 },
      ],
      directive: directive({
        socialTitle: "",
        socialDescription: "",
        canonicalSlug: "",
      }),
      seriesLinked: true,
    });

    expect(result.canPublish).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "DESCRIPTION_MISSING",
        "TAG_DUPLICATE",
        "VERTICAL_LANDSCAPE_PAGE",
        "VERTICAL_WIDTHS_INCONSISTENT",
        "SERIES_METADATA_RECOMMENDED",
        "SOCIAL_TITLE_MISSING",
        "SOCIAL_DESCRIPTION_MISSING",
        "CANONICAL_SLUG_MISSING",
      ]),
    );
  });

  it("blocks a private scheduled challenge publication", () => {
    const result = validateStudioPublicationPreflight({
      ...validInput(),
      directive: directive({
        mode: "scheduled",
        visibility: "private",
        scheduledAt: "2026-09-10T09:00:00.000Z",
      }),
      challengeLinked: true,
    });

    expect(result.canPublish).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual([
      "PRIVATE_SCHEDULE_UNSUPPORTED",
      "CHALLENGE_REQUIRES_PUBLIC",
    ]);
  });

  it("suggests vertical scrolling for extremely tall paged content", () => {
    const result = validateStudioPublicationPreflight({
      ...validInput(),
      pages: [{ id: "long", width: 720, height: 4000 }],
      directive: directive({ readingMode: "paged" }),
    });

    expect(result.canPublish).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toContain(
      "PAGED_EXTREME_ASPECT_RATIO",
    );
  });
});
