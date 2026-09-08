import { describe, expect, it } from "vitest";

import {
  creatorPublicationCommentsAllowed,
  creatorPublicationRemixAllowed,
  createDefaultCreatorPublicationDirective,
  isCreatorPublicationDirectlyReadable,
  isCreatorPublicationDue,
  isCreatorPublicationListable,
  markCreatorPublicationPublished,
  normalizeCreatorPublicationDirective,
  readCreatorPublicationDirective,
  resolveCreatorPublicationStatus,
  toPublicCreatorPublicationDirective,
  validateCreatorPublicationDirective,
  writeCreatorPublicationDirective,
} from "./creator-publication-contract";

const now = new Date("2026-09-09T09:00:00.000Z");

describe("creator publication contract", () => {
  it("creates a conservative public vertical-reader default", () => {
    expect(createDefaultCreatorPublicationDirective("Asia/Seoul")).toEqual({
      version: 1,
      mode: "immediate",
      visibility: "public",
      scheduledAt: null,
      timeZone: "Asia/Seoul",
      comments: "open",
      allowRemix: true,
      readingMode: "vertical",
      readingDirection: "ltr",
      contentRating: "all",
      searchIndexing: true,
      socialTitle: "",
      socialDescription: "",
      canonicalSlug: "",
      publishedAt: null,
    });
  });

  it("normalizes untrusted JSON and closes contradictory privacy settings", () => {
    expect(
      normalizeCreatorPublicationDirective({
        mode: "scheduled",
        visibility: "unlisted",
        scheduledAt: "2026-09-10T18:30:00+09:00",
        timeZone: "Invalid/Zone",
        comments: "closed",
        allowRemix: false,
        readingMode: "vertical",
        readingDirection: "rtl",
        contentRating: "teen",
        searchIndexing: true,
        socialTitle: `  ${"가".repeat(80)}  `,
        socialDescription: "  작품 설명  ",
        canonicalSlug: "  나의_첫 작품!!  ",
        publishedAt: "not-a-date",
      }),
    ).toEqual({
      version: 1,
      mode: "scheduled",
      visibility: "unlisted",
      scheduledAt: "2026-09-10T09:30:00.000Z",
      timeZone: "UTC",
      comments: "closed",
      allowRemix: false,
      readingMode: "vertical",
      readingDirection: "ltr",
      contentRating: "teen",
      searchIndexing: false,
      socialTitle: "가".repeat(70),
      socialDescription: "작품 설명",
      canonicalSlug: "나의-첫-작품",
      publishedAt: null,
    });
  });

  it("validates scheduling, challenge visibility, and discoverability metadata", () => {
    const result = validateCreatorPublicationDirective(
      {
        mode: "scheduled",
        visibility: "private",
        scheduledAt: "2026-09-09T09:00:30.000Z",
        contentRating: "mature",
      },
      { now, challengeLinked: true },
    );

    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toEqual([
      "SCHEDULE_TOO_SOON",
      "PRIVATE_SCHEDULE_UNSUPPORTED",
      "CHALLENGE_REQUIRES_PUBLIC",
    ]);
    expect(result.warnings.map((issue) => issue.code)).toEqual([
      "SOCIAL_TITLE_MISSING",
      "SOCIAL_DESCRIPTION_MISSING",
      "CANONICAL_SLUG_MISSING",
      "MATURE_CONTENT_CONFIRMATION",
    ]);
  });

  it("accepts a future scheduled public release and derives draft until its deadline", () => {
    const directive = normalizeCreatorPublicationDirective({
      mode: "scheduled",
      visibility: "public",
      scheduledAt: "2026-09-10T09:00:00.000Z",
      socialTitle: "공유 제목",
      socialDescription: "공유 설명",
      canonicalSlug: "episode-1",
    });

    expect(validateCreatorPublicationDirective(directive, { now }).valid).toBe(true);
    expect(resolveCreatorPublicationStatus("published", directive, now)).toBe("draft");
    expect(isCreatorPublicationDue(directive, now)).toBe(false);

    const deadline = new Date("2026-09-10T09:00:00.000Z");
    expect(resolveCreatorPublicationStatus("published", directive, deadline)).toBe("published");
    expect(isCreatorPublicationDue(directive, deadline)).toBe(true);
    expect(markCreatorPublicationPublished(directive, deadline).publishedAt).toBe(
      "2026-09-10T09:00:00.000Z",
    );
  });

  it("keeps private works as drafts and draft requests as drafts", () => {
    const privateDirective = normalizeCreatorPublicationDirective({ visibility: "private" });
    const publicDirective = normalizeCreatorPublicationDirective({ visibility: "public" });

    expect(resolveCreatorPublicationStatus("published", privateDirective, now)).toBe("draft");
    expect(resolveCreatorPublicationStatus("draft", publicDirective, now)).toBe("draft");
  });

  it("distinguishes discovery, exact-link access, comments, and remix policies", () => {
    const legacy = {};
    const unlisted = writeCreatorPublicationDirective({}, {
      ...createDefaultCreatorPublicationDirective(),
      visibility: "unlisted",
      comments: "closed",
      allowRemix: false,
    });
    const privateDoc = writeCreatorPublicationDirective({}, {
      ...createDefaultCreatorPublicationDirective(),
      visibility: "private",
    });

    expect(isCreatorPublicationListable(legacy)).toBe(true);
    expect(isCreatorPublicationDirectlyReadable(legacy)).toBe(true);
    expect(creatorPublicationCommentsAllowed(legacy)).toBe(true);
    expect(creatorPublicationRemixAllowed(legacy)).toBe(true);

    expect(isCreatorPublicationListable(unlisted)).toBe(false);
    expect(isCreatorPublicationDirectlyReadable(unlisted)).toBe(true);
    expect(creatorPublicationCommentsAllowed(unlisted)).toBe(false);
    expect(creatorPublicationRemixAllowed(unlisted)).toBe(false);

    expect(isCreatorPublicationListable(privateDoc)).toBe(false);
    expect(isCreatorPublicationDirectlyReadable(privateDoc)).toBe(false);
  });

  it("writes publication metadata without dropping unrelated document fields", () => {
    const directive = {
      ...createDefaultCreatorPublicationDirective("Asia/Seoul"),
      socialTitle: "미리보기 제목",
    };
    const doc = writeCreatorPublicationDirective({ format: "upload", custom: { keep: true } }, directive);

    expect(doc).toMatchObject({ format: "upload", custom: { keep: true } });
    expect(readCreatorPublicationDirective(doc)).toEqual(directive);
  });

  it("projects only safe public metadata and hides private directives", () => {
    const scheduled = {
      ...createDefaultCreatorPublicationDirective("Asia/Seoul"),
      mode: "scheduled" as const,
      visibility: "unlisted" as const,
      scheduledAt: "2026-09-10T09:00:00.000Z",
      publishedAt: "2026-09-10T09:00:00.000Z",
      socialTitle: "공개 제목",
    };
    const projected = toPublicCreatorPublicationDirective(scheduled);

    expect(projected).toMatchObject({
      version: 1,
      visibility: "unlisted",
      socialTitle: "공개 제목",
      publishedAt: "2026-09-10T09:00:00.000Z",
    });
    expect(projected).not.toHaveProperty("scheduledAt");
    expect(projected).not.toHaveProperty("timeZone");
    expect(
      toPublicCreatorPublicationDirective({ ...scheduled, visibility: "private" }),
    ).toBeUndefined();
  });
});
