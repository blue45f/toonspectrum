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
  it("summarizes review progress, readiness and missing shot metadata", () => {
    const result = buildStoryboardControlRoom(pages, "", "all");

    expect(result.summary).toMatchObject({
      total: 3,
      visible: 3,
      approvedPercent: 33,
      readinessPercent: 74,
      blockers: 1,
      attention: 2,
      ready: 1,
      continuityRisks: 0,
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
    expect(result.rows.map((row) => row.priority)).toEqual(["ready", "blocker", "attention"]);
  });

  it("searches page, shot, review and readiness metadata with AND tokens", () => {
    expect(buildStoryboardControlRoom(pages, "대치 시선", "all").visibleRows.map((row) => row.page.id))
      .toEqual(["page-2"]);
    expect(buildStoryboardControlRoom(pages, "수정 요청", "all").visibleRows.map((row) => row.page.id))
      .toEqual(["page-2"]);
  });

  it("filters actionable review queues without losing original indexes", () => {
    const result = buildStoryboardControlRoom(pages, "", "changes-requested");

    expect(result.filterActive).toBe(true);
    expect(result.visibleRows).toHaveLength(1);
    expect(result.visibleRows[0]).toMatchObject({
      originalIndex: 1,
      metadataComplete: false,
      readinessScore: 45,
      priority: "blocker",
    });
  });

  it("supports locked, missing-metadata, unassigned and attention filters", () => {
    expect(buildStoryboardControlRoom(pages, "", "locked").visibleRows[0]?.page.id).toBe("page-1");
    expect(buildStoryboardControlRoom(pages, "", "missing-metadata").visibleRows[0]?.page.id).toBe("page-2");
    expect(buildStoryboardControlRoom(pages, "", "unassigned").visibleRows[0]?.page.id).toBe("page-3");
    expect(buildStoryboardControlRoom(pages, "", "attention").visibleRows.map((row) => row.page.id))
      .toEqual(["page-2", "page-3"]);
  });

  it("detects three-or-more consecutive identical shot setups without flagging pairs", () => {
    const repeated = [1, 2, 3, 4].map((index) => ({
      id: `page-${index}`,
      elements: [{ id: `element-${index}` }],
      shotType: "미디엄",
      cameraAngle: "아이 레벨",
      review: { status: "approved", locked: true },
    }));
    const result = buildStoryboardControlRoom(repeated, "", "continuity-risk");

    expect(result.visibleRows).toHaveLength(4);
    expect(result.summary).toMatchObject({
      readinessPercent: 92,
      attention: 4,
      continuityRisks: 4,
    });
    expect(result.rows.every((row) => row.issues.includes("continuity-repeat"))).toBe(true);

    const pair = buildStoryboardControlRoom(repeated.slice(0, 2), "", "continuity-risk");
    expect(pair.visibleRows).toHaveLength(0);
  });

  it("treats a known empty Studio page as a blocker but keeps lightweight callers compatible", () => {
    const empty = buildStoryboardControlRoom([
      {
        id: "empty",
        elements: [],
        shotType: "와이드",
        cameraAngle: "아이 레벨",
        review: { status: "approved", locked: true },
      },
    ], "", "attention");
    expect(empty.visibleRows[0]).toMatchObject({
      emptyPage: true,
      priority: "blocker",
      readinessScore: 65,
      issues: ["empty-page"],
    });

    const lightweight = buildStoryboardControlRoom([
      {
        id: "metadata-only",
        shotType: "와이드",
        cameraAngle: "아이 레벨",
        review: { status: "approved", locked: true },
      },
    ], "", "all");
    expect(lightweight.rows[0]).toMatchObject({ emptyPage: false, priority: "ready" });
  });

  it("exports the visible review handoff as formula-safe RFC-style CSV with diagnostics", () => {
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

    expect(csv).toContain('"순번","페이지","검토 상태","제작 준비도","우선순위","진단"');
    expect(csv).toContain('"\'=HYPERLINK(""https://invalid.example"")"');
    expect(csv).toContain('"샷 정보 누락 · 검토 미요청"');
    expect(csv).toContain('"인용부호 ""확인""\n다음 줄"');
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("normalizes malformed review data to a safe draft state", () => {
    const result = buildStoryboardControlRoom([{ id: "page-1", review: "broken" }], "", "draft");

    expect(result.visibleRows[0]?.review).toEqual({ status: "draft", locked: false });
    expect(result.visibleRows[0]?.issues).toEqual(["missing-metadata", "draft-review"]);
  });
});