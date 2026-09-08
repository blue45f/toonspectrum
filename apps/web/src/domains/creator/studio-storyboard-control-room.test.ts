import { describe, expect, it } from "vitest";

import {
  buildStoryboardControlRoom,
  serializeStoryboardControlRoomCsv,
} from "./studio-storyboard-control-room";

const pages = [
  {
    id: "page-1",
    name: "오프닝",
    note: "비 오는 골목",
    shotType: "와이드",
    cameraAngle: "로우 앵글",
    review: { status: "approved", locked: true, assignee: "연출" },
  },
  {
    id: "page-2",
    name: "대치",
    shotType: "클로즈업",
    review: {
      status: "changes-requested",
      locked: false,
      assignee: "작화",
      note: "시선 방향 수정",
    },
  },
  {
    id: "page-3",
    note: "감정 비트",
    shotType: "미디엄",
    cameraAngle: "아이 레벨",
    review: { status: "needs-review", locked: false },
  },
] as const;

describe("buildStoryboardControlRoom", () => {
  it("summarizes review progress and missing shot metadata", () => {
    const result = buildStoryboardControlRoom(pages, "", "all");

    expect(result.summary).toMatchObject({
      total: 3,
      visible: 3,
      approvedPercent: 33,
      locked: 1,
      assigned: 2,
      missingMetadata: 1,
      withNotes: 3,
    });
    expect(result.summary.statusCounts).toEqual({
      draft: 0,
      "needs-review": 1,
      "changes-requested": 1,
      approved: 1,
    });
  });

  it("searches page, shot and review metadata with AND tokens", () => {
    const result = buildStoryboardControlRoom(pages, "대치 시선", "all");

    expect(result.visibleRows.map((row) => row.page.id)).toEqual(["page-2"]);
  });

  it("filters actionable review queues without losing original indexes", () => {
    const result = buildStoryboardControlRoom(pages, "", "changes-requested");

    expect(result.filterActive).toBe(true);
    expect(result.visibleRows).toHaveLength(1);
    expect(result.visibleRows[0]).toMatchObject({ originalIndex: 1, metadataComplete: false });
  });

  it("supports locked, missing-metadata and unassigned operational filters", () => {
    expect(buildStoryboardControlRoom(pages, "", "locked").visibleRows[0]?.page.id).toBe("page-1");
    expect(buildStoryboardControlRoom(pages, "", "missing-metadata").visibleRows[0]?.page.id).toBe("page-2");
    expect(buildStoryboardControlRoom(pages, "", "unassigned").visibleRows[0]?.page.id).toBe("page-3");
  });

  it("exports the visible review handoff as formula-safe RFC-style CSV", () => {
    const result = buildStoryboardControlRoom(
      [
        ...pages,
        {
          id: "page-4",
          name: '=HYPERLINK("https://invalid.example")',
          note: '인용부호 "확인"\n다음 줄',
          review: { status: "draft", locked: false },
        },
      ],
      "HYPERLINK",
      "all",
    );
    const csv = serializeStoryboardControlRoomCsv(result.visibleRows);

    expect(csv).toContain('"순번","페이지","검토 상태"');
    expect(csv).toContain('"\'=HYPERLINK(""https://invalid.example"")"');
    expect(csv).toContain('"인용부호 ""확인""\n다음 줄"');
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("normalizes malformed review data to a safe draft state", () => {
    const result = buildStoryboardControlRoom([{ id: "page-1", review: "broken" }], "", "draft");

    expect(result.visibleRows[0]?.review).toEqual({ status: "draft", locked: false });
  });
});
