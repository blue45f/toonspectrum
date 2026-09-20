// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { persistSession } from "@/compat/auth-session-state";
import { StudioReviewTaskCompletion } from "./StudioReviewTaskCompletion";
import { completionFixture } from "./studio-review-task-completion-fixture";
import { reviewProductionFixture } from "../review-production/studio-review-production-test-fixture";

const io = vi.hoisted(() => ({ actor: "actor", verify: vi.fn(), workspace: vi.fn(), team: vi.fn(), read: vi.fn(), complete: vi.fn() }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: io.actor } } }) }));
vi.mock("../studio-team-client", () => ({ getStudioTeam: io.team }));
vi.mock("../virtual-space/studio-virtual-space-review-invitation", async (original) => ({ ...await original<object>(), verifyStudioVirtualSpaceReviewSubject: io.verify }));
vi.mock("../studio-production/studio-production-server-client", async (original) => ({ ...await original<object>(), loadStudioServerProductionWorkspace: io.workspace }));
vi.mock("./studio-review-task-completion-client", async (original) => ({ ...await original<object>(), readStudioReviewTaskCompletion: io.read, completeStudioReviewTask: io.complete }));
let f = reviewProductionFixture(), c = completionFixture();
beforeEach(() => {
  vi.clearAllMocks(); io.actor = "actor"; persistSession({ user: { id: "actor" }, token: null }); f = reviewProductionFixture(); c = completionFixture();
  c = { ...c, request: { ...c.request, subject: f.request.subject }, context: { ...c.context, reference: { ...c.context.reference, subject: f.request.subject } },
    completed: { ...c.completed, reference: { ...c.completed.reference, subject: f.request.subject },
      evidence: { ...c.completed.evidence!, receipt: { ...c.completed.evidence!.receipt, reference: { ...c.completed.evidence!.receipt.reference, subject: f.request.subject } } } } };
  f.authority = { ...f.authority, workspace: { ...f.authority.workspace, document: { ...f.authority.workspace.document,
    tasks: f.authority.workspace.document.tasks.map((task) => task.id === "task" ? { ...task, reviewRef: { ...f.request, handoffId: "handoff" } } : task) } } };
  io.verify.mockReset().mockImplementation(async () => ({ ...f.verified, verifiedAt: Date.now(), expiresAt: Date.now() + 15_000 }));
  io.workspace.mockReset().mockImplementation(async () => f.authority.workspace); io.team.mockReset().mockImplementation(async () => f.authority.team);
  io.read.mockReset().mockImplementation(async () => c.context);
  io.complete.mockReset().mockImplementation(async (_request, input) => ({ ...c.completed, evidence: { ...c.completed.evidence, receipt: { ...c.completed.evidence!.receipt, requestId: input.requestId } } }));
});
afterEach(() => { cleanup(); persistSession(null); vi.restoreAllMocks(); vi.useRealTimers(); });
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "해결된 의견의 작업 완료 검토" }));
  await waitFor(() => expect(screen.getByRole("option", { name: "두 번째 컷 선화 수정" })).toBeTruthy());
  fireEvent.change(screen.getByLabelText("이 의견에 연결된 작업"), { target: { value: "task" } });
  await screen.findByRole("checkbox", { name: c.context.criteria[0] });
}
const draw = () => render(<StudioReviewTaskCompletion request={f.request} />, { wrapper: MemoryRouter });
describe("resolved comment to explicit task completion", () => {
  it("has no read until disclosure, preserves trigger focus, shows both exact pins and needs every criterion", async () => {
    draw(); expect(io.workspace).not.toHaveBeenCalled(); const trigger = screen.getByRole("button", { name: "해결된 의견의 작업 완료 검토" }); trigger.focus(); await open();
    expect(document.activeElement).toBe(trigger); expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "원래 검수본 확인" }).getAttribute("href")).toContain("sharedReview=review");
    expect(screen.getByRole("link", { name: "해결에 사용한 수정 검수본 확인" }).getAttribute("href")).toContain("sharedReview=new-review");
    const complete = screen.getByRole("button", { name: "기준을 확인하고 작업 완료" }) as HTMLButtonElement;
    expect(complete.disabled).toBe(true); fireEvent.click(screen.getByRole("checkbox", { name: c.context.criteria[0] })); expect(complete.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: c.context.criteria[1] })); expect(complete.disabled).toBe(false); expect(io.complete).not.toHaveBeenCalled();
    fireEvent.click(complete); await screen.findByText(/검수 근거와 함께 작업 완료가 기록/u);
    expect(io.complete).toHaveBeenCalledOnce(); expect(io.complete.mock.calls[0]?.[1]).toMatchObject({ confirmedCriteria: c.context.criteria, baseRevision: 4 });
    expect(screen.getByText(/공식 승인 버전·배포는 실행하지/u)).toBeTruthy();
  });
  it("clears checks when the source digest changes and performs no write", async () => {
    draw(); await open(); for (const criterion of c.context.criteria) fireEvent.click(screen.getByRole("checkbox", { name: criterion }));
    io.read.mockResolvedValue({ ...c.context, proofDigest: "e".repeat(64), criteria: ["새 기준"] });
    fireEvent.click(screen.getByRole("button", { name: "최신 근거 다시 읽기" }));
    const checkbox = await screen.findByRole("checkbox", { name: "새 기준" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false); expect(io.complete).not.toHaveBeenCalled();
  });
  it("does not resurrect check state after observed proof A -> B -> A", async () => {
    draw(); await open(); for (const criterion of c.context.criteria) fireEvent.click(screen.getByRole("checkbox", { name: criterion }));
    io.read.mockResolvedValue({ ...c.context, proofDigest: "e".repeat(64), criteria: ["B"] });
    fireEvent.click(screen.getByRole("button", { name: "최신 근거 다시 읽기" })); await screen.findByRole("checkbox", { name: "B" });
    io.read.mockResolvedValue(c.context); fireEvent.click(screen.getByRole("button", { name: "최신 근거 다시 읽기" }));
    const returned = await screen.findByRole("checkbox", { name: c.context.criteria[0] }) as HTMLInputElement;
    expect(returned.checked).toBe(false); expect((screen.getByRole("button", { name: "기준을 확인하고 작업 완료" }) as HTMLButtonElement).disabled).toBe(true);
    expect(io.complete).not.toHaveBeenCalled();
  });
  it("removes private criteria on hidden and fences a late POST result after actor replacement", async () => {
    const view = draw(); await open(); for (const criterion of c.context.criteria) fireEvent.click(screen.getByRole("checkbox", { name: criterion }));
    let resolve!: (value: typeof c.completed) => void; io.complete.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "기준을 확인하고 작업 완료" })); await waitFor(() => expect(io.complete).toHaveBeenCalledOnce());
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); fireEvent(document, new Event("visibilitychange"));
    expect(screen.queryByRole("checkbox", { name: c.context.criteria[0] })).toBeNull();
    io.actor = "other"; await act(async () => { persistSession({ user: { id: "other" }, token: null }); });
    view.rerender(<StudioReviewTaskCompletion request={f.request} />); await act(async () => { resolve(c.completed); });
    expect(screen.queryByText(/검수 근거와 함께 작업 완료가 기록/u)).toBeNull();
  });
  it("offers the existing board for no linked task without creating or completing one", async () => {
    f.authority = { ...f.authority, workspace: { ...f.authority.workspace, document: { ...f.authority.workspace.document, tasks: [] } } };
    draw(); fireEvent.click(screen.getByRole("button", { name: "해결된 의견의 작업 완료 검토" })); await screen.findByText(/연결된 작업이 없어요/u);
    expect(screen.getByRole("link", { name: "제작 보드 열기" }).getAttribute("href")).toBe("/studio/p/work/production");
    expect(io.complete).not.toHaveBeenCalled(); expect(io.read).not.toHaveBeenCalled();
  });
});
