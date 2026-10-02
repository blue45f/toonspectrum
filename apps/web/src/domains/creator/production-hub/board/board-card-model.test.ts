import { describe, expect, it } from "vitest";

import { boardCardSignals, boardChecklistProgress, boardDueBadge, highlightSegments } from "./board-card-model";
import { boardTask } from "./board-fixtures";

// 날짜는 사용자의 시간대 기준이므로 같은 달력일을 로컬 시각으로 만든다.
const NOW = new Date(2026, 8, 27, 12, 0).getTime();
const at = (day: number, hour = 9) => new Date(2026, 8, day, hour, 0).toISOString();

describe("카드 마감 배지", () => {
  it("지남·오늘·임박·이번 주·그 이후를 색과 글자로 함께 나누고 날짜와 신호를 병기한다", () => {
    expect(boardDueBadge(boardTask({ id: "a", dueAt: at(25) }), NOW)).toMatchObject({ tone: "danger", label: { ko: "9월 25일 · 2일 지남", en: "Sep 25 · 2d overdue" } });
    expect(boardDueBadge(boardTask({ id: "b", dueAt: at(27, 9) }), NOW)).toMatchObject({ tone: "danger", label: { ko: "9월 27일 · 오늘 지남", en: "Sep 27 · Overdue today" } });
    expect(boardDueBadge(boardTask({ id: "c", dueAt: at(27, 18) }), NOW)).toMatchObject({ tone: "warning", label: { ko: "9월 27일 · 오늘", en: "Sep 27 · Today" } });
    expect(boardDueBadge(boardTask({ id: "d", dueAt: at(28) }), NOW)).toMatchObject({ tone: "warning", label: { ko: "9월 28일 · D-1", en: "Sep 28 · D-1" } });
    // 모레(2일 뒤)까지가 임박이다 — 오늘·내일만 경고이던 경계를 PM-UX-1 기준(≤2일)으로 통일.
    expect(boardDueBadge(boardTask({ id: "g", dueAt: at(29) }), NOW)).toMatchObject({ tone: "warning", label: { ko: "9월 29일 · D-2", en: "Sep 29 · D-2" } });
    expect(boardDueBadge(boardTask({ id: "e", dueAt: at(30) }), NOW)).toMatchObject({ tone: "neutral", label: { ko: "9월 30일 · D-3", en: "Sep 30 · D-3" } });
    expect(boardDueBadge(boardTask({ id: "f", dueAt: new Date(2026, 9, 20, 9).toISOString() }), NOW)).toMatchObject({ tone: "neutral", label: { ko: "10월 20일" } });
  });

  it("마감이 없거나 이미 끝난 카드는 지남으로 표시하지 않는다", () => {
    expect(boardDueBadge(boardTask({ id: "a", dueAt: null }), NOW)).toBeNull();
    const done = boardDueBadge(boardTask({ id: "b", status: "done", dueAt: at(1) }), NOW);
    expect(done?.tone).toBe("neutral");
    expect(done?.label.ko).not.toContain("지남");
  });
});

describe("체크리스트 진행", () => {
  it("체크 항목만 세고 항목이 없으면 null이다", () => {
    expect(boardChecklistProgress(boardTask({ id: "a", briefBlocks: [] }))).toBeNull();
    const task = boardTask({
      id: "b",
      briefBlocks: [
        { id: "1", kind: "checklist", text: "하나", checked: true },
        { id: "2", kind: "checklist", text: "둘", checked: false },
        { id: "3", kind: "paragraph", text: "본문" },
      ],
    });
    expect(boardChecklistProgress(task)).toEqual({ done: 1, total: 2, percent: 50 });
  });
});

describe("카드 신호", () => {
  const statusById = new Map([
    ["dep-open", "in-progress" as const],
    ["dep-done", "done" as const],
  ]);

  it("막힘·입력 필요·선행 대기·입력 고정·담당 없음을 알리되 최대 두 개만 보여 준다", () => {
    // 샘플 작업에는 입력 버전이 이미 고정돼 있어, 비워야 "입력 고정"과 "담당 없음"이 함께 후보가 되고 앞의 두 개만 남는다.
    const blocked = boardCardSignals(boardTask({ id: "a", status: "blocked", assignmentIds: [], inputRevisionRefs: [] }), statusById);
    expect(blocked.map((signal) => signal.id)).toEqual(["blocked", "input-pin"]);
    const pinned = boardCardSignals(boardTask({ id: "a2", status: "blocked", assignmentIds: [] }), statusById);
    expect(pinned.map((signal) => signal.id)).toEqual(["blocked", "unassigned"]);
    const waiting = boardCardSignals(boardTask({ id: "b", status: "draft", dependencyTaskIds: ["dep-open", "dep-done"], assignmentIds: ["x"] }), statusById);
    expect(waiting[0]).toMatchObject({ id: "dependency", label: { ko: "선행 1개 대기" } });
    expect(boardCardSignals(boardTask({ id: "c", status: "needs-input", assignmentIds: ["x"], inputRevisionRefs: [] }), statusById)).toHaveLength(2);
  });

  it("진행 중이거나 끝난 카드는 시작 전 신호를 내지 않는다", () => {
    expect(boardCardSignals(boardTask({ id: "a", status: "in-progress", assignmentIds: ["x"] }), statusById)).toEqual([]);
    expect(boardCardSignals(boardTask({ id: "b", status: "done", assignmentIds: [] }), statusById)).toEqual([]);
  });
});

describe("검색어 강조", () => {
  it("검색어와 겹치는 구간만 표시하고 특수 문자는 글자 그대로 찾는다", () => {
    expect(highlightSegments("12화 선화 작업", "선화")).toEqual([
      { text: "12화 ", match: false },
      { text: "선화", match: true },
      { text: " 작업", match: false },
    ]);
    expect(highlightSegments("a.b (c)", "(c) a.")).toEqual([
      { text: "a.", match: true },
      { text: "b ", match: false },
      { text: "(c)", match: true },
    ]);
    expect(highlightSegments("제목", "")).toEqual([{ text: "제목", match: false }]);
    expect(highlightSegments("제목", "없음")).toEqual([{ text: "제목", match: false }]);
  });
});
