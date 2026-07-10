import { describe, expect, it } from "vitest";

import {
  CREATOR_WORK_REVISION_RETENTION,
  CreatorWorkRevisionConflictError,
  createCreatorWorkRevisionSnapshot,
  creatorWorkRevisionRetentionCutoff,
  parseCreatorWorkRevision,
} from "./creator-work-revisions";

describe("creator work revision helpers", () => {
  it("복원 가능한 콘텐츠만 snapshot에 담고 관리자·반응 필드는 포함하지 않는다", () => {
    const source = {
      title: "1화",
      description: "설명",
      cover: "data:image/webp;base64,AA==",
      tags: ["판타지", 1, "액션"],
      format: "cuttoon",
      pages: ["page-a", null, "page-b"],
      doc: { pagesList: [{ id: "p1" }], privateNote: "owner only" },
      status: "draft",
      seriesId: "series-1",
      episodeNo: 3,
      challengeId: "",
      remixFromId: null,
      hidden: true,
      views: 999,
      userId: "owner-secret",
    };
    const snapshot = createCreatorWorkRevisionSnapshot(source);

    expect(snapshot).toEqual({
      titleId: null,
      title: "1화",
      description: "설명",
      cover: "data:image/webp;base64,AA==",
      tags: ["판타지", "액션"],
      format: "cuttoon",
      pages: ["page-a", "page-b"],
      doc: { pagesList: [{ id: "p1" }], privateNote: "owner only" },
      status: "draft",
      seriesId: "series-1",
      episodeNo: 3,
      challengeId: null,
      remixFromId: null,
    });
    expect(snapshot).not.toHaveProperty("hidden");
    expect(snapshot).not.toHaveProperty("views");
    expect(snapshot).not.toHaveProperty("userId");
  });

  it("revision은 Postgres integer의 양의 범위만 허용한다", () => {
    expect(parseCreatorWorkRevision(1)).toBe(1);
    expect(parseCreatorWorkRevision("42")).toBe(42);
    for (const invalid of [0, -1, 1.5, Number.NaN, 2_147_483_648, "x", null]) {
      expect(() => parseCreatorWorkRevision(invalid)).toThrow(/정수/);
    }
  });

  it("손상된 snapshot의 상태·포맷 값은 복원 가능한 허용값으로 닫아 둔다", () => {
    expect(createCreatorWorkRevisionSnapshot({ format: "private-format", status: "hidden" }))
      .toMatchObject({ format: "cuttoon", status: "draft" });
    expect(createCreatorWorkRevisionSnapshot({ format: "upload", status: "published" }))
      .toMatchObject({ format: "upload", status: "published" });
  });

  it("보존 상한을 넘긴 뒤에는 최신 N개만 남기는 inclusive cutoff를 계산한다", () => {
    expect(creatorWorkRevisionRetentionCutoff(CREATOR_WORK_REVISION_RETENTION)).toBeNull();
    expect(creatorWorkRevisionRetentionCutoff(CREATOR_WORK_REVISION_RETENTION + 1)).toBe(1);
    expect(creatorWorkRevisionRetentionCutoff(CREATOR_WORK_REVISION_RETENTION + 7)).toBe(7);
  });

  it("충돌 오류는 비밀 문서 없이 현재 revision만 구조적으로 보존한다", () => {
    const error = new CreatorWorkRevisionConflictError(9);
    expect(error.currentRevision).toBe(9);
    expect(error.message).not.toContain("prompt");
    expect(error).not.toHaveProperty("snapshot");
  });
});
