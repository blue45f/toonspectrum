// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
