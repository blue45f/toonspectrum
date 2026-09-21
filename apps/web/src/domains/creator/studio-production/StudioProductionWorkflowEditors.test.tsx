// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioProductionOperationsPanel } from "./StudioProductionOperationsPanel";
import { StudioProductionReviewBoard } from "./StudioProductionReviewBoard";
import { StudioProductionTaskBoard } from "./StudioProductionTaskBoard";
import {
  createEmptyProductionWorkspace,
  type ProductionWorkspace,
} from "./studio-production-workspace-runtime";

const NOW = "2026-09-15T00:00:00.000Z";

function workspace(): ProductionWorkspace {
  return {
    ...createEmptyProductionWorkspace("work:workflow-editor-tests", NOW),
    hierarchy: [
      { id: "episode", kind: "episode", parentId: null, title: "1화", order: 0, pageId: null },
      { id: "sequence", kind: "sequence", parentId: "episode", title: "도입", order: 0, pageId: null },
      { id: "scene", kind: "scene", parentId: "sequence", title: "첫 만남", order: 0, pageId: null },
      { id: "page-node", kind: "page", parentId: "scene", title: "1페이지", order: 0, pageId: "page-1" },
    ],
    roleAssignments: [
      {
        id: "assignment-artist",
        memberId: "member-artist",
        displayName: "작화 작가",
        roles: ["lineart", "color"],
        hierarchyNodeId: "scene",
      },
      {
        id: "assignment-reviewer",
        memberId: "member-reviewer",
        displayName: "검수자",
        roles: ["reviewer"],
        hierarchyNodeId: null,
      },
    ],
    tasks: [
      {
        id: "task-script",
        title: "대본 확정",
        owner: "스토리 작가",
        due: "2026-09-18",
        progress: 100,
        status: "done",
        stage: "script-approved",
        priority: "normal",
        role: "story",
        hierarchyNodeId: "scene",
        dependencyIds: [],
        assigneeIds: [],
        reviewerIds: [],
        blockedReason: "",
      },
      {
        id: "task-lineart",
        title: "선화",
        owner: "작화 작가",
        due: "2026-09-20",
        progress: 35,
        status: "doing",
        stage: "lineart",
        priority: "high",
        role: "lineart",
        hierarchyNodeId: "scene",
        dependencyIds: ["task-script"],
        assigneeIds: ["assignment-artist"],
        reviewerIds: ["assignment-reviewer"],
        blockedReason: "",
      },
    ],
    reviews: [
      {
        id: "review-1",
        title: "캐릭터 연속성",
        assignee: "검수자",
        severity: "major",
        status: "open",
        hierarchyNodeId: "scene",
        pageId: "page-1",
        requestedByRole: "director",
        approvalRequired: true,
      },
    ],
  };
}

function commitHarness(initial = workspace()) {
  let current = initial;
  const onCommit = vi.fn((update: (value: ProductionWorkspace) => ProductionWorkspace) => {
    current = update(current);
  });
  return { onCommit, current: () => current };
}

afterEach(cleanup);

describe("production task and review editors", () => {
  it("persists stage, role, scope, dependencies, assignees and a blocked reason as one update", () => {
    const harness = commitHarness();
    render(
      <StudioProductionTaskBoard
        workspace={harness.current()}
        canEdit
        canApprove={false}
        canPublish={false}
        onCommit={harness.onCommit}
      />,
    );
    const article = screen.getByRole("heading", { name: "선화" }).closest("article")!;
    fireEvent.click(within(article).getByText("단계·담당·의존성 편집"));
    fireEvent.change(within(article).getByLabelText("상태"), { target: { value: "blocked" } });
    fireEvent.change(within(article).getByLabelText("우선순위"), { target: { value: "urgent" } });
    fireEvent.change(within(article).getByLabelText("제작 단계"), { target: { value: "color-background" } });
    fireEvent.change(within(article).getByLabelText("주 담당 역할"), { target: { value: "color" } });
    fireEvent.change(within(article).getByLabelText("제작 범위"), { target: { value: "page-node" } });
    fireEvent.change(within(article).getByLabelText("차단 사유"), {
      target: { value: "배경 콘티 승인 대기" },
    });

    const assignees = within(article).getByLabelText("실행 담당 배정") as HTMLSelectElement;
    for (const option of Array.from(assignees.options)) {
      option.selected = option.value === "assignment-artist";
    }
    fireEvent.change(assignees);
    const reviewers = within(article).getByLabelText("검수 담당 배정") as HTMLSelectElement;
    for (const option of Array.from(reviewers.options)) {
      option.selected = option.value === "assignment-reviewer";
    }
    fireEvent.change(reviewers);
    fireEvent.click(within(article).getByRole("button", { name: "작업 정보 저장" }));

    expect(harness.current().tasks[1]).toMatchObject({
      status: "blocked",
      priority: "urgent",
      stage: "color-background",
      role: "color",
      hierarchyNodeId: "page-node",
      assigneeIds: ["assignment-artist"],
      reviewerIds: ["assignment-reviewer"],
      blockedReason: "배경 콘티 승인 대기",
    });
    const stageSelect = within(article).getByLabelText("제작 단계") as HTMLSelectElement;
    expect(Array.from(stageSelect.options).find((option) => option.value === "approved")?.disabled).toBe(true);
    expect(Array.from(stageSelect.options).find((option) => option.value === "publishing")?.disabled).toBe(true);
  });

  it("requires approval authority before resolving an approval-required review", () => {
    const restricted = commitHarness();
    const view = render(
      <StudioProductionReviewBoard
        workspace={restricted.current()}
        canEdit
        canApprove={false}
        onCommit={restricted.onCommit}
      />,
    );
    expect((screen.getByRole("button", { name: "해결" }) as HTMLButtonElement).disabled).toBe(true);
    expect(restricted.current().reviews[0]?.status).toBe("open");

    view.rerender(
      <StudioProductionReviewBoard
        workspace={restricted.current()}
        canEdit
        canApprove
        onCommit={restricted.onCommit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "해결" }));
    expect(restricted.current().reviews[0]?.status).toBe("resolved");
  });

  it("saves review scope, page, requesting role and approval policy", () => {
    const harness = commitHarness({
      ...workspace(),
      reviews: [{
        ...workspace().reviews[0]!,
        approvalRequired: false,
        pageId: null,
        hierarchyNodeId: null,
        requestedByRole: null,
      }],
    });
    render(
      <StudioProductionReviewBoard
        workspace={harness.current()}
        canEdit
        canApprove
        onCommit={harness.onCommit}
      />,
    );
    fireEvent.click(screen.getByText("범위·승인 조건 편집"));
    fireEvent.change(screen.getByLabelText("제작 범위"), { target: { value: "scene" } });
    fireEvent.change(screen.getByLabelText("원고 페이지"), { target: { value: "page-1" } });
    fireEvent.change(screen.getByLabelText("요청 역할"), { target: { value: "director" } });
    fireEvent.click(screen.getByLabelText("해결 시 승인 권한 필요"));
    fireEvent.click(screen.getByRole("button", { name: "검수 정보 저장" }));
    expect(harness.current().reviews[0]).toMatchObject({
      hierarchyNodeId: "scene",
      pageId: "page-1",
      requestedByRole: "director",
      approvalRequired: true,
    });
  });
});

describe("production role and handoff editor", () => {
  it("separates role-management authority from ordinary editing", () => {
    const harness = commitHarness();
    render(
      <StudioProductionOperationsPanel
        workspace={harness.current()}
        canEdit
        canManageRoles={false}
        onCommit={harness.onCommit}
      />,
    );
    expect((screen.getByRole("button", { name: "역할 배정" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "작화 작가 역할 해제" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("대상 장면/범위") as HTMLSelectElement).disabled).toBe(false);
  });

  it("turns structured multiline handoff inputs into unique production requirements", () => {
    const harness = commitHarness();
    render(
      <StudioProductionOperationsPanel
        workspace={harness.current()}
        canEdit
        canManageRoles
        onCommit={harness.onCommit}
      />,
    );
    fireEvent.change(screen.getByLabelText("대상 장면/범위"), { target: { value: "scene" } });
    fireEvent.change(screen.getByLabelText("보내는 역할"), { target: { value: "story" } });
    fireEvent.change(screen.getByLabelText("받는 역할"), { target: { value: "lineart" } });
    fireEvent.change(screen.getByLabelText("장면 목적"), { target: { value: "첫 만남의 긴장감을 전달" } });
    fireEvent.change(screen.getByLabelText("감정선"), { target: { value: "경계에서 호기심으로" } });
    fireEvent.change(screen.getByLabelText("반드시 보여야 할 요소 · 한 줄에 하나"), {
      target: { value: "깨진 우산\n젖은 교복\n깨진 우산" },
    });
    fireEvent.change(screen.getByLabelText("연속성 메모 · 한 줄에 하나"), {
      target: { value: "오른손 가방 유지\n우산 손잡이 방향 유지" },
    });
    fireEvent.change(screen.getByLabelText("인수 완료 기준 · 한 줄에 하나"), {
      target: { value: "대사와 컷 번호 일치\n캐릭터 바이블 검수" },
    });
    fireEvent.change(screen.getByLabelText("작성자"), { target: { value: "스토리 작가" } });
    fireEvent.change(screen.getByLabelText("인수자"), { target: { value: "작화 작가" } });
    fireEvent.click(screen.getByRole("button", { name: "인계 브리프 추가" }));

    expect(harness.current().handoffs).toHaveLength(1);
    expect(harness.current().handoffs[0]).toMatchObject({
      hierarchyNodeId: "scene",
      fromRole: "story",
      toRole: "lineart",
      scenePurpose: "첫 만남의 긴장감을 전달",
      emotionalBeat: "경계에서 호기심으로",
      mustShow: ["깨진 우산", "젖은 교복"],
      continuityNotes: ["오른손 가방 유지", "우산 손잡이 방향 유지"],
      lockedFields: ["dialogue", "character-continuity"],
      acceptanceCriteria: ["대사와 컷 번호 일치", "캐릭터 바이블 검수"],
      createdBy: "스토리 작가",
      assignedTo: "작화 작가",
    });
  });
});

describe("production view continuity", () => {
  it("keeps unsaved task edits through filtering and episode-matrix round trips", () => {
    const harness = commitHarness();
    render(<StudioProductionTaskBoard workspace={harness.current()} canEdit canApprove={false} canPublish={false} onCommit={harness.onCommit} />);
    const article = screen.getByRole("heading", { name: "선화" }).closest("article")!;
    const details = article.querySelector("details")!;
    details.open = true;
    const input = within(article).getByLabelText("작업 제목");
    fireEvent.change(input, { target: { value: "아직 저장하지 않은 선화 수정" } });
    fireEvent.change(screen.getByLabelText("저장된 작업 검색"), { target: { value: "없음" } });
    fireEvent.click(screen.getByRole("button", { name: "표시 조건 초기화" }));
    expect(input).toHaveProperty("value", "아직 저장하지 않은 선화 수정");
    fireEvent.click(screen.getByRole("button", { name: "회차·공정 표" }));
    const matrix = screen.getByRole("region", { name: "회차별 제작 단계" });
    fireEvent.click(within(matrix).getByRole("button", { name: /^선화 /u }));
    expect(input).toHaveProperty("value", "아직 저장하지 않은 선화 수정");
    expect(details.open).toBe(true);
    expect(harness.onCommit).not.toHaveBeenCalled();
  });
});


describe("production editor refresh and mutation safety", () => {
  function view(initial = workspace(), onCommit = vi.fn()) {
    const props = { workspace: initial, canEdit: true, canApprove: false, canPublish: false, onCommit };
    const component = render(<StudioProductionTaskBoard {...props} />);
    const article = screen.getByRole("heading", { name: "선화" }).closest("article")!;
    article.querySelector("details")!.open = true;
    return { component, props, article, title: within(article).getByLabelText("작업 제목") };
  }
  it("preserves dirty input on an unrelated refresh and prevents overwriting a changed task", () => {
    const v = view();
    fireEvent.change(v.title, { target: { value: "내가 작성 중인 선화" } });
    v.component.rerender(<StudioProductionTaskBoard {...v.props} workspace={{...workspace(), revision: 2, tasks: workspace().tasks.map((t) => ({...t}))}} />);
    expect(v.title).toHaveProperty("value", "내가 작성 중인 선화");
    expect(within(v.article).queryByRole("alert")).toBeNull();
    const changed = {...workspace(), revision: 3, tasks: workspace().tasks.map((t) => t.id === "task-lineart" ? {...t, owner: "새 담당"} : t)};
    v.component.rerender(<StudioProductionTaskBoard {...v.props} workspace={changed} />);
    expect(within(v.article).getByRole("alert").textContent).toContain("다른 곳에서");
    expect(v.title).toHaveProperty("value", "내가 작성 중인 선화");
    expect(within(v.article).getByRole("button", {name: "작업 정보 저장"})).toHaveProperty("disabled", true);
    expect(within(v.article).getByRole("button", {name: "작업 삭제"})).toHaveProperty("disabled", true);
    fireEvent.click(within(v.article).getByRole("button", {name: "입력 대신 최신 작업 불러오기"}));
    expect(v.title).toHaveProperty("value", "선화");
    expect(within(v.article).getByLabelText("담당자 표시")).toHaveProperty("value", "새 담당");
    expect(v.props.onCommit).not.toHaveBeenCalled();
  });
  it("keeps pending input until the exact committed task is returned", async () => {
    const commit = vi.fn(), v = view(workspace(), commit);
    fireEvent.change(v.title, { target: { value: "  수정한 선화  " } });
    await act(async () => { fireEvent.click(within(v.article).getByRole("button", {name: "작업 정보 저장"})); });
    const update = commit.mock.calls[0]![0] as (w: ProductionWorkspace) => ProductionWorkspace;
    const acknowledged = update(workspace());
    v.component.rerender(<StudioProductionTaskBoard {...v.props} workspace={acknowledged} />);
    expect(v.title).toHaveProperty("value", "수정한 선화");
    expect(within(v.article).queryByText("저장하지 않은 작업 정보가 있습니다.")).toBeNull();
  });
  it("rejects a queued closure after concurrent task changes or scope switch", async () => {
    const commit = vi.fn(), v = view(workspace(), commit);
    fireEvent.change(v.title, { target: { value: "수정" } });
    await act(async () => { fireEvent.click(within(v.article).getByRole("button", {name: "작업 정보 저장"})); });
    const update = commit.mock.calls[0]![0] as (w: ProductionWorkspace) => ProductionWorkspace;
    expect(() => update({...workspace(), tasks: workspace().tasks.map((t) => t.id === "task-lineart" ? {...t, progress: 90} : t)})).toThrow();
    v.component.rerender(<StudioProductionTaskBoard {...v.props} workspace={{...workspace(), scopeKey: "work:another"}} />);
    expect(() => update(workspace())).toThrow(/화면이나 계정/u);
    expect(screen.getByRole("heading", {name:"선화"}).closest("article")!.textContent).not.toContain("저장하지 않은");
  });
  it("blocks duplicate submission while saving and preserves the draft on failure", async () => {
    let reject!: (error: Error) => void;
    const commit = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; })), v = view(workspace(), commit);
    fireEvent.change(v.title, { target: { value: "재시도할 선화" } });
    const button = within(v.article).getByRole("button", {name: "작업 정보 저장"});
    fireEvent.click(button); fireEvent.click(button);
    expect(commit).toHaveBeenCalledTimes(1); expect(button).toHaveProperty("disabled", true);
    await act(async () => { reject(new Error("connection lost")); });
    expect(v.title).toHaveProperty("value", "재시도할 선화");
    expect(within(v.article).getByRole("alert").textContent).toContain("connection lost");
    expect(button).toHaveProperty("disabled", false);
  });
  it("keeps draft through the calendar and sort views, with no state mutation", () => {
    const v = view();
    fireEvent.change(v.title, { target: { value: "캘린더 왕복 입력" } });
    fireEvent.click(screen.getByRole("button", {name: "일정 보기"}));
    const calendar = screen.getByRole("region", {name: "제작 일정"});
    fireEvent.change(within(calendar).getByLabelText("표시할 달"), {target:{value:"2026-09"}});
    fireEvent.click(within(calendar).getByRole("button", {name:/선화/u}));
    fireEvent.change(screen.getByLabelText("작업 정렬"), {target:{value:"priority"}});
    expect(v.title).toHaveProperty("value", "캘린더 왕복 입력");
    expect(v.article.querySelector("details")!.open).toBe(true);
    expect(v.props.onCommit).not.toHaveBeenCalled();
  });
  it("cannot change completion or delete while editing, but explicitly cancelling permits it", () => {
    const v = view(); fireEvent.change(v.title, {target:{value:"작성 중"}});
    expect(within(v.article).getByRole("button", {name:"완료"})).toHaveProperty("disabled",true);
    fireEvent.click(within(v.article).getByRole("button", {name:"편집 취소"}));
    expect(within(v.article).getByRole("button", {name:"완료"})).toHaveProperty("disabled",false);
  });
});
