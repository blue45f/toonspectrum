// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioProductionTaskBoard } from "./StudioProductionTaskBoard";
import { StudioProductionSavedViews } from "./StudioProductionSavedViews";
import { createEmptyProductionWorkspace, type ProductionWorkspace } from "./studio-production-workspace-runtime";
import { persistSession } from "@/domains/auth/public/session/auth-session-state";

const f = vi.hoisted(() => ({ actor: "artist-a", load: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: f.actor } } }) }));
vi.mock("./studio-production-saved-views", async (original) => ({ ...(await original<typeof import("./studio-production-saved-views")>()),
  acquireProductionViewsRepository: async () => ({ load: f.load, save: f.save, remove: f.remove }) }));
function workspace(): ProductionWorkspace {
  return { ...createEmptyProductionWorkspace("work:alpha", "2026-09-21T00:00:00Z"), tasks: [
    { id: "a", title: "선화 작업", owner: "작가", due: "2026-09-21", progress: 20, status: "doing", stage: "lineart" },
    { id: "b", title: "식자 작업", owner: "식자", due: "2026-09-22", progress: 0, status: "todo", stage: "lettering", dependencyIds: ["a"] },
  ] };
}
const board = (value: ProductionWorkspace, onCommit = vi.fn(), canEdit = true) => <StudioProductionTaskBoard workspace={value} canEdit={canEdit} canApprove={false} canPublish={false} onCommit={onCommit} />;
function edit() {
  const article = screen.getByRole("heading", { name: "선화 작업" }).closest("article")!;
  article.querySelector("details")!.open = true;
  const input = within(article).getByLabelText("작업 제목");
  fireEvent.change(input, { target: { value: "저장 전 개인 입력" } });
  return { article, input };
}
beforeEach(() => { f.actor = "artist-a"; f.load.mockReset().mockResolvedValue([]); f.save.mockReset(); f.remove.mockReset(); });
afterEach(() => { cleanup(); persistSession(null); vi.restoreAllMocks(); });
describe("production UI continuity", () => {
  it("keeps dirty input through unrelated refresh and blocks a same-task conflict", () => {
    const initial = workspace(), commit = vi.fn(), view = render(board(initial, commit)); const { input, article } = edit();
    view.rerender(board({ ...initial, tasks: initial.tasks.map((task) => ({ ...task, ...(task.id === "b" ? { progress: 10 } : {}) })) }, commit));
    expect(input).toHaveProperty("value", "저장 전 개인 입력");
    const remote = { ...initial, tasks: initial.tasks.map((task) => ({ ...task, ...(task.id === "a" ? { due: "2026-09-24" } : {}) })) };
    view.rerender(board(remote, commit));
    expect(input).toHaveProperty("value", "저장 전 개인 입력");
    expect(within(article).getByRole("alert").textContent).toContain("다른 곳");
    expect(within(article).getByRole("button", { name: "작업 정보 저장" })).toHaveProperty("disabled", true);
    expect(within(article).getByRole("button", { name: "완료" })).toHaveProperty("disabled", true);
    fireEvent.click(within(article).getByRole("button", { name: "입력 대신 최신 작업 불러오기" }));
    expect(input).toHaveProperty("value", "선화 작업"); expect(commit).not.toHaveBeenCalled();
  });
  it("does not leak dirty input into another actor or work with the same task IDs", () => {
    const initial = workspace(), view = render(board(initial)); edit();
    f.actor = "artist-b"; view.rerender(board(initial));
    let article = screen.getByRole("heading", { name: "선화 작업" }).closest("article")!; article.querySelector("details")!.open = true;
    expect(within(article).getByLabelText("작업 제목")).toHaveProperty("value", "선화 작업");
    edit(); view.rerender(board({ ...initial, scopeKey: "work:beta" }));
    article = screen.getByRole("heading", { name: "선화 작업" }).closest("article")!; article.querySelector("details")!.open = true;
    expect(within(article).getByLabelText("작업 제목")).toHaveProperty("value", "선화 작업");
  });
  it("retains edits across calendar and sort changes, then returns to the same editor", () => {
    render(board(workspace())); const { input } = edit();
    fireEvent.change(screen.getByRole("combobox", { name: "작업 정렬" }), { target: { value: "due" } });
    fireEvent.click(screen.getByRole("button", { name: "일정 보기" }));
    fireEvent.change(screen.getByLabelText("표시할 달"), { target: { value: "2026-09" } });
    const calendar = screen.getByRole("region", { name: "제작 일정" });
    fireEvent.click(within(calendar).getByRole("button", { name: /선화 작업/u }));
    expect(input).toHaveProperty("value", "저장 전 개인 입력");
    expect(input.closest("details")).toHaveProperty("open", true);
  });
  it("fences queued commits after unmount or session change", () => {
    const initial = workspace(), commit = vi.fn(), view = render(board(initial, commit));
    const { article } = edit(); fireEvent.click(within(article).getByRole("button", { name: "작업 정보 저장" }));
    const update = commit.mock.calls[0]![0] as (value: ProductionWorkspace) => ProductionWorkspace;
    expect(() => update(initial)).not.toThrow();
    persistSession({ user: { id: "another" }, token: null });
    expect(() => update(initial)).toThrow(); view.unmount(); expect(() => update(initial)).toThrow();
  });
});
const filter = { view: "all" as const, query: "선화", stage: "lineart" as const, layout: "calendar" as const, sort: "due" as const };
function savedViews(actorId = "artist-a", onApply = vi.fn()) {
  return <StudioProductionSavedViews actorId={actorId} scopeKey="work:alpha" filter={filter} onApply={onApply} />;
}
describe("explicit personal saved-view controls", () => {
  it("does not read storage until requested and applies only saved filter data", async () => {
    const apply = vi.fn(); f.load.mockResolvedValue([{ id: "view-a", name: "이번 선화", filter }]);
    render(savedViews("artist-a", apply)); document.querySelector("details")!.open = true;
    expect(f.load).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "저장된 보기 불러오기" })); });
    fireEvent.click(screen.getByRole("button", { name: "이번 선화" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith(filter);
    expect(f.load).toHaveBeenCalledWith(JSON.stringify(["artist-a", "work:alpha"]));
  });
  it("ignores a pending read after account change", async () => {
    let resolve!: (value: unknown) => void; f.load.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(savedViews()); document.querySelector("details")!.open = true;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "저장된 보기 불러오기" })); });
    view.rerender(savedViews("artist-b"));
    await act(async () => { resolve([{ id: "a", name: "다른 계정 보기", filter }]); });
    document.querySelector("details")!.open = true;
    expect(screen.queryByRole("button", { name: "다른 계정 보기" })).toBeNull();
  });
  it("keeps the input when storage fails and never calls apply", async () => {
    const apply = vi.fn(); f.save.mockRejectedValue(new Error("unavailable"));
    render(savedViews("artist-a", apply)); document.querySelector("details")!.open = true;
    const name = screen.getByLabelText("보기 이름"); fireEvent.change(name, { target: { value: "내 일정" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "현재 조건 저장" })); });
    expect(name).toHaveProperty("value", "내 일정");
    expect(screen.getByRole("status").textContent).toContain("저장하지 못했습니다");
    expect(apply).not.toHaveBeenCalled();
  });
});
