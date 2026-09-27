import { createProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ProductionProjectAggregate, type ProductionTask } from "@toonstudio/core/production";
import { ProductionWorkBoard } from "./ProductionWorkBoard";
import { createProductionDemoProject } from "./production-demo";

function fixture(): ProductionProjectAggregate {
  const aggregate = createProductionDemoProject();
  const source = aggregate.tasks[0];
  const assignment = aggregate.assignments.find((entry) => entry.status === "active");
  if (!source || !assignment) throw new Error("fixture missing");
  const task: ProductionTask = {
    ...source,
    id: "board-ready",
    title: "콘티 작업",
    processKey: "story-lock",
    status: "ready",
    assignmentIds: [assignment.id],
    reviewerAssignmentIds: [],
    dependencyTaskIds: [],
    outputDeliverableIds: [],
    inputRevisionRefs: [
      {
        id: "board-input",
        revision: 1,
        lineage: "narrative",
        digest: `sha256:${"b".repeat(64)}`,
        createdAt: "2026-09-27T09:00:00.000Z",
      },
    ],
    briefBlocks: [],
    priority: "normal",
  };
  return {
    ...aggregate,
    tasks: [task, { ...task, id: "board-draft", title: "배경 원고", status: "draft" }],
    workflowProfile: createProductionWorkflowProfile(aggregate.projectId, "solo", "2026-09-27T09:00:00.000Z"),
  };
}
function mount(
  options: {
    canEdit?: boolean;
    canManage?: boolean;
    aggregate?: ProductionProjectAggregate;
    execute?: (command: unknown, message: string) => Promise<void>;
  } = {},
) {
  const execute = options.execute ?? vi.fn(async () => undefined);
  render(
    <MemoryRouter>
      <ProductionWorkBoard
        aggregate={options.aggregate ?? fixture()}
        canEdit={options.canEdit ?? true}
        canManage={options.canManage ?? true}
        execute={execute}
      />
    </MemoryRouter>,
  );
  return execute;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("제작 팀 작업 보드", () => {
  it("검색과 목록 전환으로 작업을 찾는다", () => {
    mount();
    fireEvent.change(screen.getByRole("textbox", { name: "작업 검색" }), { target: { value: "콘티" } });
    expect(screen.getByTestId("production-card-board-ready")).toBeTruthy();
    expect(screen.queryByTestId("production-card-board-draft")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "목록 보기" }));
    expect(screen.getByRole("region", { name: "제작 작업 목록" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(screen.getByTestId("production-card-board-draft")).toBeTruthy();
  });
  it("키보드용 상태 선택 메뉴로 원자적 전환 명령을 보낸다", async () => {
    const execute = mount();
    fireEvent.change(screen.getByRole("combobox", { name: "콘티 작업 상태 이동" }), {
      target: { value: "in-progress" },
    });
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(
        {
          type: "transition-task-batch",
          transitions: [{ taskId: "board-ready", fromStatus: "ready", toStatus: "in-progress" }],
        },
        expect.any(String),
      ),
    );
  });
  it("여러 작업이 동시 진행 한도를 넘으면 API를 호출하지 않는다", async () => {
    const base = fixture();
    const aggregate = { ...base, tasks: base.tasks.map((task) => ({ ...task, status: "ready" as const })) };
    const execute = mount({ aggregate });
    fireEvent.click(screen.getByRole("button", { name: "현재 결과 선택 (최대 200개)" }));
    fireEvent.change(screen.getByRole("combobox", { name: "선택한 작업 이동 상태" }), {
      target: { value: "in-progress" },
    });
    fireEvent.click(screen.getByRole("button", { name: "선택 작업 이동" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("동시 작업 제한"));
    expect(execute).not.toHaveBeenCalled();
  });
  it("화면에서 시작한 드래그만 처리하고 외부 드롭은 무시한다", async () => {
    const execute = mount();
    const column = screen.getByRole("region", { name: "제작 중 열" });
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.drop(column, { dataTransfer });
    expect(execute).not.toHaveBeenCalled();
    fireEvent.dragStart(screen.getByRole("button", { name: "콘티 작업 드래그 핸들" }), { dataTransfer });
    fireEvent.dragOver(column, { dataTransfer });
    fireEvent.drop(column, { dataTransfer });
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  });
  it("필터 변경 후 보이지 않는 작업을 함께 이동하지 않는다", () => {
    mount();
    fireEvent.click(screen.getByRole("checkbox", { name: "콘티 작업 선택" }));
    fireEvent.change(screen.getByRole("textbox", { name: "작업 검색" }), { target: { value: "배경" } });
    expect((screen.getByRole("button", { name: "선택 작업 이동" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("블록 설명과 우선순위를 포함한 작업을 생성한다", async () => {
    const execute = mount();
    fireEvent.click(screen.getByRole("button", { name: "작업 만들기" }));
    const dialog = screen.getByRole("dialog", { name: "새 제작 작업" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "작업 제목" }), {
      target: { value: "컬러 검수 지시" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "체크 항목 추가" }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "1번 체크 항목" }), {
      target: { value: "색상 팔레트 확인" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "작업 만들기" }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "upsert-task-batch",
          tasks: [
            expect.objectContaining({
              title: "컬러 검수 지시",
              priority: "normal",
              status: "draft",
              briefBlocks: [expect.objectContaining({ kind: "checklist", text: "색상 팔레트 확인" })],
            }),
          ],
        }),
        expect.any(String),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("저장 실패 시 작성 내용을 보존하고 닫기 전에 확인한다", async () => {
    mount({
      execute: vi.fn(async () => {
        throw new Error("동시 수정 충돌");
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "콘티 작업" }));
    const dialog = screen.getByRole("dialog", { name: "콘티 작업" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "작업 제목" }), {
      target: { value: "유지할 새 제목" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "작업 저장" }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("동시 수정 충돌"));
    expect((within(dialog).getByRole("textbox", { name: "작업 제목" }) as HTMLInputElement).value).toBe(
      "유지할 새 제목",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "대화상자 닫기" }));
    expect(within(dialog).getByRole("button", { name: "편집 계속" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "저장하지 않고 닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("관리자는 공정과 팀 보기를 저장한다", async () => {
    const execute = mount();
    fireEvent.click(screen.getByRole("button", { name: "공정 설정" }));
    const designer = screen.getByRole("dialog", { name: "우리 팀의 제작 프로세스" });
    fireEvent.change(within(designer).getByRole("textbox", { name: "프로세스 이름" }), {
      target: { value: "편집부 프로세스" },
    });
    fireEvent.click(within(designer).getByRole("button", { name: "프로세스 저장" }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "configure-workflow",
          expectedWorkflowRevision: 1,
          profile: expect.objectContaining({ revision: 2, name: "편집부 프로세스" }),
        }),
        expect.any(String),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "상세 필터와 팀 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "현재 보기 저장" }));
    fireEvent.change(screen.getByRole("textbox", { name: "보기 이름" }), {
      target: { value: "우리 팀 기본" },
    });
    fireEvent.click(screen.getByRole("button", { name: "팀 보기 저장" }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "upsert-operations-record",
          record: {
            kind: "saved-view",
            value: expect.objectContaining({ name: "우리 팀 기본", shared: true }),
          },
        }),
        expect.any(String),
      ),
    );
  });
});
