// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { useRef, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { boardTask, smallBoardFixture } from "./board/board-fixtures";
import { flushBoardGestureTimers, mountBoard, pointerDrag, renderedCardIds, stubRect } from "./board/board-test-utils";
import type { ProductionClientCommand } from "./production-api";
import { productionDemoAdapter, resetProductionDemoSession } from "./production-demo-adapter";
import { createProductionDemoProject } from "./production-demo";
import { ProductionWorkBoard } from "./ProductionWorkBoard";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  resetProductionDemoSession();
  await flushBoardGestureTimers();
});

/** 저장 명령을 샘플 어댑터(서버와 같은 공정 검증)로 처리해, 저장 결과가 화면 데이터로 돌아오는 실제 흐름을 흉내 낸다. */
function StatefulBoard({ initial, fail }: { readonly initial: ProductionProjectAggregate; readonly fail?: () => Error | null }) {
  const [aggregate, setAggregate] = useState(initial);
  const holder = useRef(initial);
  const execute = async (command: ProductionClientCommand) => {
    const error = fail?.();
    if (error) throw error;
    const next = productionDemoAdapter.reduce(holder.current, command);
    holder.current = next;
    setAggregate(next);
  };
  return (
    <MemoryRouter>
      <ProductionWorkBoard aggregate={aggregate} canEdit canManage execute={execute} persistOrder={false} />
    </MemoryRouter>
  );
}

const column = (name: string) => screen.getByRole("region", { name: `${name} 열` });

describe("열 아래 빠른 추가", () => {
  it("제목을 쓰고 Enter를 누르면 저장이 끝나기 전에도 초안 카드가 보이고 같은 명령 경로로 저장한다", async () => {
    let release: () => void = () => undefined;
    const execute = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    mountBoard({ execute });
    const queue = column("준비");
    fireEvent.click(within(queue).getByRole("button", { name: "카드 추가" }));
    const field = within(queue).getByRole("textbox", { name: "새 카드 제목" });
    fireEvent.change(field, { target: { value: "13화 채색 준비" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(await within(queue).findByText("13화 채색 준비")).toBeTruthy();
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-task-batch",
        tasks: [expect.objectContaining({ title: "13화 채색 준비", status: "draft" })],
        expectedAbsentTaskIds: [expect.any(String)],
      }),
      expect.any(String),
    );
    // 저장 중인 카드는 다시 고치지 못하게 잠긴다.
    expect((within(queue).getByRole("combobox", { name: "13화 채색 준비 상태 이동" }) as HTMLSelectElement).disabled).toBe(true);
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("초안"));
  });

  it("여러 줄을 붙여 넣으면 줄마다 카드가 한 장씩 한 번에 만들어진다", async () => {
    const execute = mountBoard();
    const queue = column("준비");
    fireEvent.click(within(queue).getByRole("button", { name: "카드 추가" }));
    const field = within(queue).getByRole("textbox", { name: "새 카드 제목" });
    fireEvent.change(field, { target: { value: "첫째 카드\n\n둘째 카드" } });
    expect(within(queue).getByRole("button", { name: "카드 2장 추가" })).toBeTruthy();
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ tasks: [expect.objectContaining({ title: "첫째 카드" }), expect.objectContaining({ title: "둘째 카드" })] }),
      expect.any(String),
    );
  });

  it("저장에 실패하면 카드가 사라지고 입력하던 글을 되살리며 이유를 알린다", async () => {
    mountBoard({ execute: vi.fn(async () => { throw new Error("저장소가 응답하지 않습니다"); }) });
    const queue = column("준비");
    fireEvent.click(within(queue).getByRole("button", { name: "카드 추가" }));
    const field = within(queue).getByRole("textbox", { name: "새 카드 제목" });
    fireEvent.change(field, { target: { value: "되살릴 제목" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("저장소가 응답하지 않습니다"));
    expect(renderedCardIds()).toEqual(["board-draft", "board-ready"]);
    expect((within(column("준비")).getByRole("textbox", { name: "새 카드 제목" }) as HTMLTextAreaElement).value).toBe("되살릴 제목");
  });

  it("Esc로 닫고, 읽기 전용에서는 추가 버튼이 없다", () => {
    mountBoard();
    const queue = column("준비");
    fireEvent.click(within(queue).getByRole("button", { name: "카드 추가" }));
    fireEvent.keyDown(within(queue).getByRole("textbox", { name: "새 카드 제목" }), { key: "Escape" });
    expect(within(queue).queryByRole("textbox", { name: "새 카드 제목" })).toBeNull();
    cleanup();
    mountBoard({ canEdit: false, canManage: false });
    expect(screen.queryByRole("button", { name: "카드 추가" })).toBeNull();
    expect(screen.queryByRole("button", { name: "콘티 작업 제목 수정" })).toBeNull();
  });
});

describe("제목 인라인 편집", () => {
  it("연필을 눌러 고치고 Enter로 저장하면 이전 카드를 기대값으로 보내고 저장 중에도 새 제목이 보인다", async () => {
    let release: () => void = () => undefined;
    const execute = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const aggregate = smallBoardFixture();
    mountBoard({ aggregate, execute });
    fireEvent.click(screen.getByRole("button", { name: "콘티 작업 제목 수정" }));
    const field = screen.getByRole("textbox", { name: "콘티 작업 · 제목 수정" });
    fireEvent.change(field, { target: { value: "콘티 작업 · 최종" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "upsert-task-batch",
        expectedTasks: [aggregate.tasks[0]],
        tasks: [expect.objectContaining({ id: "board-ready", title: "콘티 작업 · 최종" })],
      }),
      expect.any(String),
    );
    expect(screen.getByRole("button", { name: "콘티 작업 · 최종" })).toBeTruthy();
    await act(async () => release());
  });

  it("Esc는 취소하고 제목이 그대로면 저장하지 않는다", () => {
    const execute = mountBoard();
    fireEvent.click(screen.getByRole("button", { name: "콘티 작업 제목 수정" }));
    const field = screen.getByRole("textbox", { name: "콘티 작업 · 제목 수정" });
    fireEvent.change(field, { target: { value: "버릴 제목" } });
    fireEvent.keyDown(field, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "콘티 작업 · 제목 수정" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "콘티 작업 제목 수정" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "콘티 작업 · 제목 수정" }), { key: "Enter" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("한글 조합 중 Enter는 저장으로 처리하지 않는다", () => {
    const execute = mountBoard();
    fireEvent.click(screen.getByRole("button", { name: "콘티 작업 제목 수정" }));
    const field = screen.getByRole("textbox", { name: "콘티 작업 · 제목 수정" });
    fireEvent.change(field, { target: { value: "콘티 작업 수정중" } });
    fireEvent.keyDown(field, { key: "Enter", isComposing: true });
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "콘티 작업 · 제목 수정" })).toBeTruthy();
  });
});

describe("낙관적 이동과 되돌리기", () => {
  it("저장이 실패하면 카드가 원래 열로 돌아오고 이유가 경고로 남는다", async () => {
    let fail = true;
    render(<StatefulBoard initial={smallBoardFixture()} fail={() => (fail ? new Error("서버가 응답하지 않습니다") : null)} />);
    fireEvent.change(screen.getByRole("combobox", { name: "콘티 작업 상태 이동" }), { target: { value: "blocked" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("서버가 응답하지 않습니다"));
    expect(within(column("준비")).getByTestId("production-card-board-ready")).toBeTruthy();
    expect(within(column("막힘·보류")).queryByTestId("production-card-board-ready")).toBeNull();
    fail = false;
  });

  it("되돌릴 수 있는 이동은 토스트의 되돌리기로 원래 열에 돌려놓는다", async () => {
    render(<StatefulBoard initial={smallBoardFixture()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "콘티 작업 상태 이동" }), { target: { value: "blocked" } });
    await waitFor(() => expect(within(column("막힘·보류")).getByTestId("production-card-board-ready")).toBeTruthy());
    fireEvent.click(await screen.findByRole("button", { name: "되돌리기" }));
    await waitFor(() => expect(within(column("준비")).getByTestId("production-card-board-ready")).toBeTruthy());
    expect(screen.getByRole("status").textContent).toContain("되돌렸습니다");
  });

  it("규칙상 되돌릴 수 없는 이동은 되돌리기 없이 이유를 알려 준다", async () => {
    render(<StatefulBoard initial={smallBoardFixture()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "콘티 작업 상태 이동" }), { target: { value: "in-progress" } });
    await waitFor(() => expect(within(column("제작 중")).getByTestId("production-card-board-ready")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "되돌리기" })).toBeNull();
    expect(screen.getByText(/되돌릴 수 없습니다/)).toBeTruthy();
  });
});

describe("끌어 놓기 위치와 직접 정렬", () => {
  it("같은 열에서 카드를 다른 카드 아래로 끌면 순서가 바뀌고 서버 정본으로 저장된다", async () => {
    const execute = mountBoard({ persistOrder: true });
    const queue = column("준비");
    expect(renderedCardIds(queue)).toEqual(["board-draft", "board-ready"]);
    stubRect(within(queue).getByTestId("production-card-board-draft"), { top: 0, height: 100 });
    stubRect(within(queue).getByTestId("production-card-board-ready"), { top: 110, height: 100 });
    pointerDrag(within(queue).getByRole("button", { name: "배경 원고 드래그 핸들" }), queue, { y: 300 });
    await waitFor(() => expect(renderedCardIds(column("준비"))).toEqual(["board-ready", "board-draft"]));
    expect(within(screen.getByRole("group", { name: "보드 알림" })).getByText(/프로젝트에 저장/)).toBeTruthy();
    // 로컬 저장값은 서버 정본의 캐시·폴백으로 남는다.
    const stored = Object.entries(localStorage).find(([key]) => key.startsWith("toonstudio.production.board-order.v1:"));
    expect(JSON.parse(stored?.[1] ?? "{}")).toEqual({ queue: ["board-ready", "board-draft"] });
    // 순서 변경은 set-board-order 커맨드로 서버 정본에 올라간다 (PM-UX-3).
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "set-board-order",
        columns: { queue: ["board-ready", "board-draft"] },
      }),
      expect.any(String),
    ));
  });

  it("카드 위쪽에 놓으면 그 카드 앞으로 들어가고 삽입선이 그 카드에 표시된다", async () => {
    const base = smallBoardFixture();
    const aggregate = { ...base, tasks: [...base.tasks, boardTask({ id: "board-third", title: "셋째 카드", status: "draft" })] };
    mountBoard({ aggregate, persistOrder: false });
    const queue = column("준비");
    const ids = renderedCardIds(queue);
    expect(ids).toHaveLength(3);
    const first = ids[0] ?? "";
    const last = ids[2] ?? "";
    ids.forEach((id, index) => stubRect(within(queue).getByTestId(`production-card-${id}`), { top: index * 110, height: 100 }));
    const drag = pointerDrag(within(queue).getByRole("button", { name: `${aggregate.tasks.find((task) => task.id === last)?.title} 드래그 핸들` }), queue, { y: 20, drop: false });
    expect(within(queue).getByTestId(`production-card-${first}`).getAttribute("data-drop-before")).toBe("true");
    drag.drop();
    await waitFor(() => expect(renderedCardIds(column("준비"))[0]).toBe(last));
  });

  it("다른 열에 놓으면 상태가 바뀌고 도착 열의 지정한 위치에 들어간다", async () => {
    const base = smallBoardFixture();
    const doing = boardTask({ id: "board-doing", title: "이미 작업 중", status: "in-progress", assignmentIds: base.tasks[0]?.assignmentIds ?? [] });
    const aggregate = { ...base, tasks: [...base.tasks.map((task) => (task.id === "board-ready" ? { ...task, processKey: "storyboard" } : task)), doing] };
    render(<StatefulBoard initial={aggregate} />);
    const working = column("제작 중");
    stubRect(within(working).getByTestId("production-card-board-doing"), { top: 0, height: 100 });
    pointerDrag(screen.getByRole("button", { name: "콘티 작업 드래그 핸들" }), working, { y: 10 });
    await waitFor(() => expect(renderedCardIds(column("제작 중"))).toEqual(["board-ready", "board-doing"]));
    expect(within(column("준비")).queryByTestId("production-card-board-ready")).toBeNull();
  });

  it("동시 작업 한도에 찬 공정으로 끌면 놓기 전에 한도를 알리고 놓아도 저장하지 않는다", async () => {
    const base = smallBoardFixture();
    const aggregate = { ...base, tasks: [...base.tasks, boardTask({ id: "board-busy", title: "작업 중인 콘티", status: "in-progress" })] };
    const execute = mountBoard({ aggregate });
    const working = column("제작 중");
    const drag = pointerDrag(screen.getByRole("button", { name: "콘티 작업 드래그 핸들" }), working, { drop: false });
    expect(working.getAttribute("data-drop-active")).toBe("denied");
    expect(within(working).getByText(/여기로는 옮길 수 없어요/)).toBeTruthy();
    expect(within(working).getByText(/스토리 2\/1/)).toBeTruthy();
    drag.drop();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("동시에 1개까지만"));
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("키보드로 카드 다루기", () => {
  const cardButton = (title: string) => screen.getByRole("button", { name: title });

  it("카드에서 Alt+→로 다음 열에 옮기고 옮긴 카드에 초점을 유지한다", async () => {
    render(<StatefulBoard initial={smallBoardFixture()} />);
    cardButton("콘티 작업").focus();
    fireEvent.keyDown(cardButton("콘티 작업"), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(within(column("제작 중")).getByTestId("production-card-board-ready")).toBeTruthy());
    await waitFor(() => expect(document.activeElement).toBe(within(column("제작 중")).getByRole("button", { name: "콘티 작업" })));
  });

  it("Alt+↓로 같은 열에서 한 칸 아래로 옮기고, 가장자리에서는 알려 준다", async () => {
    mountBoard({ persistOrder: false });
    cardButton("배경 원고").focus();
    expect(renderedCardIds()).toEqual(["board-draft", "board-ready"]);
    fireEvent.keyDown(cardButton("배경 원고"), { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(renderedCardIds()).toEqual(["board-ready", "board-draft"]));
    cardButton("배경 원고").focus();
    fireEvent.keyDown(cardButton("배경 원고"), { key: "ArrowDown", altKey: true });
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("더 옮길 곳이 없습니다"));
  });

  it("j/k와 화살표로 카드 사이를 옮겨 다니고 h/l은 이웃 열로 간다", () => {
    const base = smallBoardFixture();
    const aggregate = { ...base, tasks: [...base.tasks, boardTask({ id: "board-doing", title: "작업 중 카드", status: "in-progress", assignmentIds: base.tasks[0]?.assignmentIds ?? [] })] };
    mountBoard({ aggregate });
    cardButton("배경 원고").focus();
    fireEvent.keyDown(cardButton("배경 원고"), { key: "j" });
    expect(document.activeElement).toBe(cardButton("콘티 작업"));
    fireEvent.keyDown(cardButton("콘티 작업"), { key: "k" });
    expect(document.activeElement).toBe(cardButton("배경 원고"));
    fireEvent.keyDown(cardButton("배경 원고"), { key: "l" });
    expect(document.activeElement).toBe(cardButton("작업 중 카드"));
    fireEvent.keyDown(cardButton("작업 중 카드"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cardButton("배경 원고"));
  });

  it("c는 새 카드 입력을, /는 검색을, ?는 단축키 도움말을 연다", () => {
    mountBoard();
    fireEvent.keyDown(document.body, { key: "c" });
    expect(document.activeElement).toBe(within(column("준비")).getByRole("textbox", { name: "새 카드 제목" }));
    cleanup();
    mountBoard();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "작업 검색" }));
    fireEvent.keyDown(document.body, { key: "?", shiftKey: true });
    expect(screen.getByRole("dialog", { name: "키보드 단축키" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "대화상자 닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("e는 제목 수정을, x는 카드 선택을 시작한다", () => {
    mountBoard();
    cardButton("콘티 작업").focus();
    fireEvent.keyDown(cardButton("콘티 작업"), { key: "x" });
    expect((screen.getByRole("checkbox", { name: "콘티 작업 선택" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.keyDown(cardButton("콘티 작업"), { key: "e" });
    expect(screen.getByRole("textbox", { name: "콘티 작업 · 제목 수정" })).toBeTruthy();
  });

  it("입력 칸에서 글자를 쓰는 동안에는 단축키가 동작하지 않는다", () => {
    mountBoard();
    const search = screen.getByRole("textbox", { name: "작업 검색" });
    search.focus();
    fireEvent.keyDown(search, { key: "c" });
    expect(screen.queryByRole("textbox", { name: "새 카드 제목" })).toBeNull();
  });

  it("손잡이에서 위아래 방향키로 놓을 위치를 고른 뒤 Enter로 놓는다", async () => {
    mountBoard({ persistOrder: false });
    const handle = screen.getByRole("button", { name: "배경 원고 드래그 핸들" });
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(screen.getByTestId("production-move-preview").textContent).toContain("순서만 바꿉니다");
    fireEvent.keyDown(handle, { key: "Enter" });
    await waitFor(() => expect(renderedCardIds()).toEqual(["board-ready", "board-draft"]));
  });
});

describe("빠른 필터·묶어 보기", () => {
  it("내 카드는 선택한 역할의 담당·검수 카드를 모으고 개수를 보여 준다", () => {
    mountBoard({ aggregate: createProductionDemoProject(), roleLens: "story" });
    const chip = screen.getByRole("button", { name: /내 카드/ });
    expect(chip.textContent).toContain("2");
    fireEvent.click(chip);
    expect([...renderedCardIds()].sort()).toEqual(["task-episode-12-thumbnail", "task-episode-13-story"]);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });

  it("로그인한 참여자의 배정이 있으면 역할 관점 대신 그 배정으로 고른다", () => {
    mountBoard({ aggregate: createProductionDemoProject(), roleLens: "story", viewerAssignmentIds: ["assignment-color"] });
    fireEvent.click(screen.getByRole("button", { name: /내 카드/ }));
    expect(renderedCardIds()).toEqual(["task-episode-12-color"]);
  });

  it("담당자 아바타를 눌러 그 사람 카드만 모으고 다시 누르면 해제한다", () => {
    mountBoard({ aggregate: createProductionDemoProject() });
    const avatar = screen.getByRole("button", { name: /강민서 카드만 보기/ });
    fireEvent.click(avatar);
    expect([...renderedCardIds()].sort()).toEqual(["task-episode-13-story"]);
    fireEvent.click(avatar);
    expect(renderedCardIds()).toHaveLength(9);
  });

  it("마감·우선순위 라벨 필터를 상세 필터에서 고른다", () => {
    mountBoard({ aggregate: createProductionDemoProject() });
    fireEvent.click(screen.getByRole("button", { name: "상세 필터와 팀 보기" }));
    fireEvent.change(screen.getByRole("combobox", { name: "마감 구간 필터" }), { target: { value: "none" } });
    expect(renderedCardIds()).toEqual([]);
    expect(screen.getByText("조건에 맞는 작업이 없습니다")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "모든 작업 보기" }));
    expect(renderedCardIds()).toHaveLength(9);
  });

  it("회차별로 묶으면 줄마다 같은 열이 반복되고 카드는 한 번씩만 나타난다", () => {
    mountBoard({ aggregate: createProductionDemoProject(), initialEntry: "/?boardGroup=episode" });
    const lanes = screen.getAllByRole("region", { name: / 줄$/ });
    expect(lanes).toHaveLength(2);
    expect(within(lanes[0] ?? document.body).getAllByRole("region", { name: /열 · / })).toHaveLength(5);
    expect(renderedCardIds()).toHaveLength(9);
    expect(new Set(renderedCardIds()).size).toBe(9);
  });

  it("묶어 보기를 바꾸면 주소에 반영되어 새로고침해도 유지된다", () => {
    mountBoard({ aggregate: createProductionDemoProject() });
    fireEvent.change(screen.getByRole("combobox", { name: "스윔레인으로 묶어 보기" }), { target: { value: "assignee" } });
    expect(screen.getAllByRole("region", { name: / 줄$/ }).length).toBeGreaterThan(1);
  });
});

describe("샘플 체험 보존", () => {
  it("서버에 저장하지 않는 프로젝트는 직접 정렬을 브라우저 저장소에 남기지 않는다", async () => {
    mountBoard({ persistOrder: false });
    const queue = column("준비");
    stubRect(within(queue).getByTestId("production-card-board-draft"), { top: 0, height: 100 });
    stubRect(within(queue).getByTestId("production-card-board-ready"), { top: 110, height: 100 });
    pointerDrag(within(queue).getByRole("button", { name: "배경 원고 드래그 핸들" }), queue, { y: 300 });
    await waitFor(() => expect(renderedCardIds(column("준비"))).toEqual(["board-ready", "board-draft"]));
    expect(Object.keys(localStorage).filter((key) => key.includes("board-order"))).toEqual([]);
  });
});
