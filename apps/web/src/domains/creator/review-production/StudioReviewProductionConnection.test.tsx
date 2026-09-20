// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import { persistSession } from "@/compat/auth-session-state";
import { StudioProductionServerConflictError } from "../studio-production/studio-production-server-client";
import { StudioReviewProductionConnection } from "./StudioReviewProductionConnection";
import { reviewProductionFixture } from "./studio-review-production-test-fixture";

const io = vi.hoisted(() => ({ actor: "actor", verify: vi.fn(), workspace: vi.fn(), team: vi.fn(), save: vi.fn() }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: io.actor } } }) }));
vi.mock("../studio-team-client", () => ({ getStudioTeam: io.team }));
vi.mock("../virtual-space/studio-virtual-space-review-invitation", () => ({ verifyStudioVirtualSpaceReviewSubject: io.verify }));
vi.mock("../studio-production/studio-production-server-client", async (original) => ({ ...await original<object>(),
  loadStudioServerProductionWorkspace: io.workspace, saveStudioServerProductionWorkspace: io.save }));
const renderUi = (element: ReactElement) => render(element, { wrapper: MemoryRouter });
let f = reviewProductionFixture();
beforeEach(() => {
  vi.clearAllMocks(); io.actor = "actor"; persistSession({ user: { id: "actor" }, token: null }); f = reviewProductionFixture();
  io.verify.mockReset().mockImplementation(async () => ({ ...f.verified, verifiedAt: Date.now(), expiresAt: Date.now() + 15_000 }));
  io.workspace.mockReset().mockImplementation(async () => f.authority.workspace); io.team.mockReset().mockImplementation(async () => f.authority.team);
  io.save.mockReset().mockImplementation(async (_work, _base, document) => ({ ...f.authority.workspace, document }));
});
afterEach(() => { cleanup(); persistSession(null); vi.useRealTimers(); vi.restoreAllMocks(); });
async function expand() { fireEvent.click(screen.getByRole("button", { name: "제작 작업에 연결" })); await screen.findByLabelText("기존 제작 작업"); }
async function select() {
  await expand(); fireEvent.change(screen.getByLabelText("기존 제작 작업"), { target: { value: "task" } });
  fireEvent.change(screen.getByLabelText("기존 인계서 · 완료 조건"), { target: { value: "handoff" } });
  fireEvent.change(screen.getByRole("combobox", { name: "제작 역할 · 선화 작가" }), { target: { value: "role-editor" } });
}
describe("explicit saved comment production UI", () => {
  it("keeps a stable disclosure trigger and restores its focus on close", async () => {
    renderUi(<StudioReviewProductionConnection request={f.request} />);
    const trigger = screen.getByRole("button", { name: "제작 작업에 연결" }); trigger.focus(); await expand();
    expect(document.activeElement).toBe(trigger); expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(trigger.getAttribute("aria-controls")!)?.querySelector("select")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(document.activeElement).toBe(trigger); expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("기존 제작 작업")).toBeNull();
  });
  it("does not expose a missing-name user ID in labels or accessible names", async () => {
    f = { ...f, authority: { ...f.authority, team: { ...f.authority.team,
      members: f.authority.team.members.map((member) => member.userId === "editor" ? { ...member, name: "editor" } : member) } } };
    renderUi(<StudioReviewProductionConnection request={f.request} />); await expand();
    fireEvent.change(screen.getByLabelText("기존 제작 작업"), { target: { value: "task" } });
    expect(screen.getByRole("combobox", { name: "제작 역할 · 이름 확인이 필요한 담당자 1" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "제작 역할 · editor" })).toBeNull();
    expect(screen.queryByText(/ · editor$/u)).toBeNull();
  });
  it("does zero reads before expansion, keeps equivalent request renders stable, and saves the exact one-task connection", async () => {
    const view = renderUi(<StudioReviewProductionConnection request={f.request} />);
    expect(io.verify).not.toHaveBeenCalled(); expect(io.workspace).not.toHaveBeenCalled(); await select();
    expect(screen.getByText("손가락이 대사 방향을 가리킴")).toBeTruthy();
    view.rerender(<StudioReviewProductionConnection request={structuredClone(f.request)} />);
    expect(io.workspace).toHaveBeenCalledOnce(); expect(io.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "선택한 작업에 연결" }));
    await screen.findByText(/제작 작업에 연결했어요/u);
    expect(io.save).toHaveBeenCalledOnce(); expect(io.save.mock.calls[0]?.[1]).toBe(4);
    expect(io.save.mock.calls[0]?.[2].tasks[0]).toMatchObject({ id: "task", assigneeIds: ["role-editor"], reviewRef: { ...f.request, handoffId: "handoff" } });
    expect(io.save.mock.calls[0]?.[2].tasks[1]).toEqual(f.authority.workspace.document.tasks[1]);
  });
  it("shows the previous comment and requires explicit replacement confirmation", async () => {
    const previous = { ...f.request, commentId: "previous-comment", handoffId: null }, document = f.authority.workspace.document;
    f = { ...f, authority: { ...f.authority, workspace: { ...f.authority.workspace, document: { ...document, tasks: [{ ...document.tasks[0]!, reviewRef: previous }] } } } };
    renderUi(<StudioReviewProductionConnection request={f.request} />); await select();
    expect(screen.getByText(/previous-comment/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: "선택한 작업에 연결" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "이전 연결을 이 의견으로 교체" }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 작업에 연결" }));
    await screen.findByText(/제작 작업에 연결했어요/u); expect(io.save).toHaveBeenCalledOnce();
  });
  it("routes missing tasks and roles to the existing production board without creating anything", async () => {
    f = { ...f, authority: { ...f.authority, workspace: { ...f.authority.workspace, document: { ...f.authority.workspace.document, tasks: [] } } } };
    renderUi(<StudioReviewProductionConnection request={f.request} />); await expand();
    expect(screen.getByText(/기존 제작 작업이 없어요/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: "제작 보드 열기" }).getAttribute("href")).toBe("/studio/p/work/production");
    expect(io.save).not.toHaveBeenCalled();
  });
  it("rechecks edit authority on submit and removes names/tasks when revoked", async () => {
    renderUi(<StudioReviewProductionConnection request={f.request} />); await select();
    io.verify.mockResolvedValue({ ok: false, reason: "access-denied" });
    fireEvent.click(screen.getByRole("button", { name: "선택한 작업에 연결" }));
    await screen.findByText(/편집할 권한을 확인하지 못했어요/u);
    expect(io.save).not.toHaveBeenCalled(); expect(screen.queryByLabelText("기존 제작 작업")).toBeNull(); expect(screen.queryByText("선화 작가")).toBeNull();
  });
  it("cancels pending grants on hidden or actor change and never resumes a write automatically", async () => {
    const view = renderUi(<StudioReviewProductionConnection request={f.request} />); await select();
    let release!: (value: typeof f.verified) => void;
    io.verify.mockImplementationOnce(() => new Promise((done) => { release = done; }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 작업에 연결" }));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { release(f.verified); }); expect(io.save).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("기존 제작 작업")).toBeNull();
    io.actor = "other"; await act(async () => { persistSession({ user: { id: "other" }, token: null }); });
    view.rerender(<StudioReviewProductionConnection request={f.request} />);
    expect(screen.queryByText("선화 작가")).toBeNull(); expect(io.save).not.toHaveBeenCalled();
  });
  it("preserves explicit choices over same-actor session renewal without writing", async () => {
    renderUi(<StudioReviewProductionConnection request={f.request} />); await select();
    await act(async () => { persistSession({ user: { id: "actor", name: "Renewed" }, token: null }); });
    await screen.findByLabelText("기존 제작 작업");
    expect((screen.getByLabelText("기존 제작 작업") as HTMLSelectElement).value).toBe("task");
    expect((screen.getByRole("combobox", { name: "제작 역할 · 선화 작가" }) as HTMLSelectElement).value).toBe("role-editor");
    expect(io.save).not.toHaveBeenCalled();
  });
  it("preserves uncertain choices for an explicit retry, with no automatic PUT retry", async () => {
    io.save.mockRejectedValueOnce(new Error("lost")); renderUi(<StudioReviewProductionConnection request={f.request} />); await select();
    fireEvent.click(screen.getByRole("button", { name: "선택한 작업에 연결" }));
    const retry = await screen.findByRole("button", { name: "같은 연결 다시 확인" }); expect(io.save).toHaveBeenCalledOnce();
    fireEvent.click(retry); await screen.findByText(/제작 작업에 연결했어요/u);
    expect(io.save).toHaveBeenCalledTimes(2); expect(io.save.mock.calls[0]?.slice(0, 3)).toEqual(io.save.mock.calls[1]?.slice(0, 3));
  });
  it("requires reload after a CAS conflict and preserves the draft for review", async () => {
    io.save.mockRejectedValueOnce(new StudioProductionServerConflictError(8)); renderUi(<StudioReviewProductionConnection request={f.request} />); await select();
    fireEvent.click(screen.getByRole("button", { name: "선택한 작업에 연결" })); await screen.findByText(/최신 작업을 다시 읽고 선택을 확인/u);
    expect((screen.getByRole("button", { name: "선택한 작업에 연결" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "최신 작업 다시 읽기" }));
    await waitFor(() => expect(screen.queryByLabelText("기존 제작 작업")).not.toBeNull());
    expect((screen.getByLabelText("기존 제작 작업") as HTMLSelectElement).value).toBe("task"); expect(io.save).toHaveBeenCalledOnce();
  });
});
