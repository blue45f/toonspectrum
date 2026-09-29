import { describe, expect, it } from "vitest";

import {
  normalizeStudioEpisodeMetadata,
  resolveEpisodePageOrder,
} from "./studio-episode-model";

describe("normalizeStudioEpisodeMetadata", () => {
  it("유효한 영속 기록을 다듬어 정규화한다", () => {
    expect(
      normalizeStudioEpisodeMetadata({
        schemaVersion: 1,
        id: "  ep-12 ",
        episodeNumber: 12,
        title: "  폭우 ",
        synopsis: "  비 내리는 결전  ",
        pageIds: [" page-1 ", "", "  ", "page-2", 42, null],
        status: "ready",
      })
    ).toEqual({
      schemaVersion: 1,
      id: "ep-12",
      episodeNumber: 12,
      title: "폭우",
      synopsis: "비 내리는 결전",
      pageIds: ["page-1", "page-2"],
      status: "ready",
    });
  });

  it("빈 시놉시스는 null로, 알 수 없는 상태는 draft로 둔다", () => {
    expect(
      normalizeStudioEpisodeMetadata({
        id: "ep-1",
        episodeNumber: 1,
        title: "시작",
        synopsis: "   ",
        pageIds: [],
        status: "scheduled",
      })
    ).toMatchObject({ synopsis: null, pageIds: [], status: "draft" });
  });

  it("id·회차 번호·제목이 유효하지 않으면 null을 반환한다", () => {
    const base = { id: "ep-1", episodeNumber: 1, title: "시작", pageIds: ["page-1"] };
    expect(normalizeStudioEpisodeMetadata(null)).toBeNull();
    expect(normalizeStudioEpisodeMetadata([])).toBeNull();
    expect(normalizeStudioEpisodeMetadata({ ...base, id: "  " })).toBeNull();
    expect(normalizeStudioEpisodeMetadata({ ...base, title: "" })).toBeNull();
    expect(normalizeStudioEpisodeMetadata({ ...base, episodeNumber: 0 })).toBeNull();
    expect(normalizeStudioEpisodeMetadata({ ...base, episodeNumber: -3 })).toBeNull();
    expect(normalizeStudioEpisodeMetadata({ ...base, episodeNumber: 1.5 })).toBeNull();
    expect(normalizeStudioEpisodeMetadata({ ...base, episodeNumber: "12" })).toBeNull();
  });

  it("제목과 시놉시스 길이 상한을 넘기지 않는다", () => {
    const normalized = normalizeStudioEpisodeMetadata({
      id: "ep-1",
      episodeNumber: 1,
      title: `제${"목".repeat(400)}`,
      synopsis: "요".repeat(5000),
      pageIds: [],
    });
    expect(normalized?.title.length).toBe(200);
    expect(normalized?.synopsis?.length).toBe(2000);
  });
});

describe("resolveEpisodePageOrder", () => {
  it("입력 순서를 유지하고 미확인·중복 페이지를 보고한다", () => {
    const resolution = resolveEpisodePageOrder(
      { pageIds: ["page-2", "page-9", "page-1", "page-2", "page-9"] },
      new Set(["page-1", "page-2"])
    );
    expect(resolution.orderedPageIds).toEqual([
      "page-2",
      "page-9",
      "page-1",
      "page-2",
      "page-9",
    ]);
    expect(resolution.unknownPageIds).toEqual(["page-9"]);
    expect(resolution.duplicatePageIds).toEqual(["page-2", "page-9"]);
  });

  it("모든 페이지가 확인되면 빈 보고를 반환한다", () => {
    const resolution = resolveEpisodePageOrder(
      { pageIds: ["page-1", "page-2"] },
      new Set(["page-1", "page-2"])
    );
    expect(resolution.unknownPageIds).toEqual([]);
    expect(resolution.duplicatePageIds).toEqual([]);
  });
});
