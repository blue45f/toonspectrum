import { createProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ProductionProjectAggregate, type ProductionTask } from "@toonstudio/core/production";
import { ProductionWorkBoard } from "./ProductionWorkBoard";
import { createProductionDemoProject } from "./production-demo";
import { flushBoardGestureTimers, pointerDrag } from "./board/board-test-utils";

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
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  await flushBoardGestureTimers();
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
  it("화면에서 시작한 끌기만 처리하고 외부에서 끌어온 항목의 드롭은 무시한다", async () => {
    const execute = mount();
    const column = screen.getByRole("region", { name: "제작 중 열" });
    fireEvent.drop(column, { dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" } });
    expect(execute).not.toHaveBeenCalled();
    pointerDrag(screen.getByRole("button", { name: "콘티 작업 드래그 핸들" }), column);
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

describe("작업 보드 일괄 필드 편집", () => {
  it("미리 보기 전에는 저장하지 않고 명시적 확인 후 선택 필드만 변경한다", async () => {
    const aggregate = fixture(); const execute = mount({ aggregate });
    fireEvent.click(screen.getByRole("button", { name: "현재 결과 선택 (최대 200개)" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 작업 일괄 편집" }));
    const dialog = screen.getByRole("dialog", { name: "선택 작업 일괄 편집" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "우선순위" }), { target: { value: "urgent" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "변경 미리 보기" }));
    expect(execute).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("region", { name: "일괄 변경 미리 보기" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "2개 작업 변경" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "upsert-task-batch", tasks: aggregate.tasks.map((task) => ({ ...task, priority: "urgent" })), expectedTasks: aggregate.tasks }, expect.any(String)));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByRole("button", { name: "선택 작업 일괄 편집" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("실패 시 일괄 편집 내용을 보존하고 미리 보기를 다시 확인할 수 있다", async () => {
    mount({ execute: vi.fn(async () => { throw new Error("동시 수정 충돌"); }) });
    fireEvent.click(screen.getByRole("checkbox", { name: "콘티 작업 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 작업 일괄 편집" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "우선순위" }), { target: { value: "high" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "변경 미리 보기" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "1개 작업 변경" }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("동시 수정 충돌"));
    expect((within(dialog).getByRole("combobox", { name: "우선순위" }) as HTMLSelectElement).value).toBe("high");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "우선순위" }), { target: { value: "urgent" } });
    expect(within(dialog).getByRole("button", { name: "변경 미리 보기" })).toBeTruthy();
  });
  it("기본 유지 설정으로 쓰기를 보내지 않는다", () => {
    const execute = mount();
    fireEvent.click(screen.getByRole("checkbox", { name: "콘티 작업 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 작업 일괄 편집" }));
    const dialog = screen.getByRole("dialog");
    expect((within(dialog).getByRole("button", { name: "변경 미리 보기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("검증된 드래그와 맞춤 보드", () => {
  it("Space와 방향키로 이동 가능 열을 확인한 뒤 Enter로 저장한다", async () => {
    const execute = mount();
    const handle = screen.getByRole("button", { name: "콘티 작업 드래그 핸들" });
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(screen.getByTestId("production-move-preview").textContent).toContain("이동 가능");
    expect(execute).not.toHaveBeenCalled();
    fireEvent.keyDown(handle, { key: "Enter" });
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "transition-task-batch", transitions: [
      { taskId: "board-ready", fromStatus: "ready", toStatus: "in-progress" },
    ] }, expect.any(String)));
  });
  it.each(["Escape", "Tab"])("%s는 이동을 저장하지 않고 취소한다", (key) => {
    const execute = mount();
    const handle = screen.getByRole("button", { name: "콘티 작업 드래그 핸들" });
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key });
    expect(screen.queryByTestId("production-move-preview")).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
  it("승인되지 않은 작업은 드롭 전 이유를 알리고 완료를 막는다", async () => {
    const execute = mount();
    const target = screen.getByRole("region", { name: "승인·완료 열" });
    const drag = pointerDrag(screen.getByRole("button", { name: "콘티 작업 드래그 핸들" }), target, { drop: false });
    expect(screen.getByTestId("production-move-preview").textContent).toContain("승인된 제출본");
    drag.drop();
    expect(execute).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("승인된 제출본"));
  });
  it("열 배치와 접힘 설정을 팀 보기로 저장한다", async () => {
    const execute = mount();
    fireEvent.click(screen.getByText("보드 열 맞춤 설정"));
    fireEvent.click(screen.getByRole("button", { name: "제작 중 열 앞으로" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "검수" }));
    const columns = [...document.querySelectorAll<HTMLElement>("[data-production-drop-column]")];
    expect(columns[0]?.dataset.productionDropColumn).toBe("working");
    expect(within(screen.getByRole("region", { name: "검수 열" })).getByRole("button", { name: "열 펼치기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "상세 필터와 팀 보기" }));
    fireEvent.click(screen.getByRole("button", { name: "현재 보기 저장" }));
    fireEvent.change(screen.getByRole("textbox", { name: "보기 이름" }), { target: { value: "내 검수 동선" } });
    fireEvent.click(screen.getByRole("button", { name: "팀 보기 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ record: {
      kind: "saved-view", value: expect.objectContaining({ filters: expect.objectContaining({ boardCollapsed: "review", boardColumns: "working,queue,review,complete,blocked,archive" }) }),
    } }), expect.any(String)));
  });
  it("프리셋 교체는 확인을 요구하고 공정 복제는 새 키로 저장한다", async () => {
    const execute = mount();
    fireEvent.click(screen.getByRole("button", { name: "공정 설정" }));
    const dialog = screen.getByRole("dialog", { name: "우리 팀의 제작 프로세스" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "프로세스 이름" }), { target: { value: "유지할 구성" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /스튜디오 제작/ }));
    expect(within(dialog).getByRole("region", { name: "프리셋 교체 확인" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "현재 편집 유지" }));
    expect((within(dialog).getByRole("textbox", { name: "프로세스 이름" }) as HTMLInputElement).value).toBe("유지할 구성");
    fireEvent.click(within(dialog).getByRole("button", { name: "선택한 공정 복제" }));
    expect(within(dialog).getByRole("region", { name: "공정 변경 영향 미리 보기" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "프로세스 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "configure-workflow", profile: expect.objectContaining({ steps: expect.arrayContaining([
        expect.objectContaining({ name: "스토리 복사", key: expect.stringMatching(/^custom-/u) }),
      ]) }),
    }), expect.any(String)));
  });
});

describe("드래그 입력 경계", () => {
  it("5px보다 적게 움직인 눌림은 끌기가 아니므로 이동 표시를 만들지 않는다", () => {
    const execute = mount();
    const handle = screen.getByRole("button", { name: "콘티 작업 드래그 핸들" });
    fireEvent.pointerDown(handle, { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 12, clientY: 11 });
    expect(screen.queryByTestId("production-move-preview")).toBeNull();
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 12, clientY: 11 });
    expect(execute).not.toHaveBeenCalled();
  });
  it("Esc나 pointercancel이 오면 끌기를 취소하고 저장하지 않는다", () => {
    const execute = mount();
    const column = screen.getByRole("region", { name: "제작 중 열" });
    const handle = screen.getByRole("button", { name: "콘티 작업 드래그 핸들" });
    pointerDrag(handle, column, { drop: false });
    expect(screen.getByTestId("production-move-preview")).toBeTruthy();
    fireEvent.pointerCancel(window, { pointerId: 1 });
    expect(screen.queryByTestId("production-move-preview")).toBeNull();
    pointerDrag(handle, column, { drop: false, pointerId: 2 });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("production-move-preview")).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
  it("읽기 전용 사용자는 키보드나 드래그로 작업을 변경할 수 없다", () => {
    const execute = mount({ canEdit: false, canManage: false });
    const handle = screen.getByRole("button", { name: "콘티 작업 드래그 핸들" });
    expect((handle as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(handle, { key: " " });
    pointerDrag(handle, screen.getByRole("region", { name: "제작 중 열" }), { drop: false });
    expect(execute).not.toHaveBeenCalled();
    expect(screen.queryByTestId("production-move-preview")).toBeNull();
  });
});

it("검색 필터를 초기화해도 사용자의 열 배치와 접힘을 유지한다", () => {
  mount();
  fireEvent.click(screen.getByText("보드 열 맞춤 설정"));
  fireEvent.click(screen.getByRole("button", { name: "제작 중 열 앞으로" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "검수" }));
  fireEvent.change(screen.getByRole("textbox", { name: "작업 검색" }), { target: { value: "콘티" } });
  fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
  expect(screen.getByTestId("production-card-board-draft")).toBeTruthy();
  expect(document.querySelector<HTMLElement>("[data-production-drop-column]")?.dataset.productionDropColumn).toBe("working");
  expect(within(screen.getByRole("region", { name: "검수 열" })).getByRole("button", { name: "열 펼치기" })).toBeTruthy();
});
