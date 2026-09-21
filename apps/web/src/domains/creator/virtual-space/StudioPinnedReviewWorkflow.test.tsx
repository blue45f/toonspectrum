// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistSession } from "@/compat/auth-session-state";
import { StudioPinnedReviewWorkflow } from "./StudioPinnedReviewWorkflow";
import type { StudioVirtualSpaceVerifiedReview } from "./studio-virtual-space-review-invitation";

const f = vi.hoisted(() => ({ verify: vi.fn(), decide: vi.fn(), revisions: vi.fn(), resolve: vi.fn(), reopen: vi.fn(), refresh: vi.fn(), revoke: vi.fn(), actor: "reviewer" }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: f.actor } } }) }));
vi.mock("./studio-virtual-space-review-invitation", () => ({ verifyStudioVirtualSpaceReviewSubject: f.verify }));
vi.mock("../project-graph/studio-project-graph-client", () => ({ decideStudioReview: f.decide, listStudioArtifactRevisions: f.revisions, resolveStudioReviewComment: f.resolve, reopenStudioReviewComment: f.reopen }));
const subject = { schemaVersion: 1 as const, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "snapshot", rootGraphHash: "a".repeat(64) };
const comment = { id: "note", body: "Move the final panel.", status: "open", severity: "required", resolutionRevisionId: null };
function verified(comments: unknown[] = []): StudioVirtualSpaceVerifiedReview {
  return { ok: true, subject, project: { access: { edit: true, manageMembers: false } }, review: { status: "open", reviewerIds: ["reviewer"], comments }, expiresAt: Date.now() + 15_000 } as StudioVirtualSpaceVerifiedReview;
}
function setup(value = verified()) { f.verify.mockResolvedValue(value); return render(<StudioPinnedReviewWorkflow verified={value} onRefresh={f.refresh} onRevoked={f.revoke} />); }
beforeEach(() => { Object.values(f).forEach((mock) => { if (vi.isMockFunction(mock)) mock.mockReset(); }); f.actor = "reviewer"; persistSession({ user: { id: f.actor }, token: null }); f.decide.mockResolvedValue({}); f.resolve.mockResolvedValue({}); f.reopen.mockResolvedValue({}); });
afterEach(() => { cleanup(); persistSession(null); });
describe("Pinned review revision workflow", () => {
  it("requires a separate approval confirmation and rechecks the exact review authority", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "이 검수본 승인" }));
    expect(f.decide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "승인 확정" }));
    await waitFor(() => expect(f.decide).toHaveBeenCalledExactlyOnceWith("review", "approved"));
    expect(f.verify).toHaveBeenCalledWith(subject, "view"); expect(f.refresh).toHaveBeenCalledOnce();
  });
  it("does not approve when a required comment arrives after confirmation opens", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "이 검수본 승인" }));
    f.verify.mockResolvedValue(verified([comment]));
    fireEvent.click(screen.getByRole("button", { name: "승인 확정" }));
    await screen.findByText("아직 해결되지 않은 필수 수정 의견이 있어요."); expect(f.decide).not.toHaveBeenCalled();
  });
  it("rejects revoked reviewer permission even while the old button remains visible", async () => {
    setup();
    f.verify.mockResolvedValue({ ...verified(), review: { ...verified().review, reviewerIds: [] } });
    fireEvent.click(screen.getByRole("button", { name: "수정 요청으로 기록" }));
    await screen.findByText("검수 결정 권한이 없어요. 지정 검토자나 관리자에게 요청해 주세요."); expect(f.decide).not.toHaveBeenCalled();
  });
  it("records an explicitly selected saved revision and refuses a deleted selection", async () => {
    setup(verified([comment]));
    f.revisions.mockResolvedValue([{ id: "saved-2", artifactId: "artifact", kind: "submission", createdAt: "2026-09-20T00:00:00Z", message: "Revised final panel" },
      { id: "other", artifactId: "other-artifact", kind: "checkpoint" }, { id: "preview", artifactId: "artifact", kind: "review-snapshot" }]);
    fireEvent.click(screen.getByRole("button", { name: "수정한 저장 버전 선택" }));
    await screen.findByRole("combobox"); expect(screen.getAllByRole("option")).toHaveLength(2);
    expect((screen.getByRole("button", { name: "선택 버전으로 해결 기록" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "saved-2" } });
    fireEvent.click(screen.getByRole("button", { name: "선택 버전으로 해결 기록" }));
    await waitFor(() => expect(f.resolve).toHaveBeenCalledExactlyOnceWith("note", "saved-2"));
    f.revisions.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "선택 버전으로 해결 기록" }));
    await screen.findByText("선택한 수정 버전을 확인할 수 없어요. 저장 버전을 다시 골라 주세요."); expect(f.resolve).toHaveBeenCalledOnce();
  });
  it("does not issue a decision after the permission check outlives the mounted scope", async () => {
    const mounted = setup(); let done!: (value: StudioVirtualSpaceVerifiedReview) => void;
    f.verify.mockImplementationOnce(() => new Promise((resolve) => { done = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "수정 요청으로 기록" })); mounted.unmount();
    await act(async () => { done(verified()); }); expect(f.decide).not.toHaveBeenCalled();
  });
  it("keeps approved history read-only and does not retry an uncertain decision automatically", async () => {
    const mounted = setup(); f.decide.mockRejectedValue(new Error("lost response"));
    fireEvent.click(screen.getByRole("button", { name: "수정 요청으로 기록" }));
    await screen.findByText("결과를 확인하지 못했어요. 다시 실행하기 전에 검토 기록을 새로 확인해 주세요."); expect(f.decide).toHaveBeenCalledOnce();
    mounted.rerender(<StudioPinnedReviewWorkflow verified={{ ...verified([comment]), review: { ...verified([comment]).review, status: "approved" } }} onRefresh={f.refresh} onRevoked={f.revoke} />);
    expect(screen.getByText("검수 승인됨")).toBeTruthy();
    // Approved history stays read-only; the new control can only fetch group history.
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["그룹 검수 기록 확인"]);
  });

  it("cancels pending actor A authority and preserves actor B's independent busy state", async () => {
    const value = { ...verified(), review: { ...verified().review, reviewerIds: ["reviewer", "reviewer-b"] } };
    const mounted = setup(value);
    let resolveOld!: (value: StudioVirtualSpaceVerifiedReview) => void;
    f.verify.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "수정 요청으로 기록" }));
    f.actor = "reviewer-b";
    mounted.rerender(<StudioPinnedReviewWorkflow verified={value} onRefresh={f.refresh} onRevoked={f.revoke} />);
    expect((screen.getByRole("button", { name: "수정 요청으로 기록" }) as HTMLButtonElement).disabled).toBe(false);
    let resolveCurrent!: (value: StudioVirtualSpaceVerifiedReview) => void;
    f.verify.mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "수정 요청으로 기록" }));
    await act(async () => { resolveOld(value); });
    expect(f.decide).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "수정 요청으로 기록" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { resolveCurrent(value); });
    await waitFor(() => expect(f.decide).toHaveBeenCalledExactlyOnceWith("review", "changes-requested"));
    expect((screen.getByRole("button", { name: "수정 요청으로 기록" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not decide with authority from a superseded session before its React update", async () => {
    setup(); let resolve!: (value: StudioVirtualSpaceVerifiedReview) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "수정 요청으로 기록" }));
    persistSession({ user: { id: "reviewer-b" }, token: null });
    await act(async () => { resolve(verified()); });
    expect(f.decide).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "수정 요청으로 기록" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps same-actor approval confirmation but never retries its cancelled decision after session publication", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "이 검수본 승인" }));
    let resolve!: (value: StudioVirtualSpaceVerifiedReview) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "승인 확정" }));
    await act(async () => { persistSession({ user: { id: "reviewer", name: "Refreshed reviewer" }, token: null }); });
    await act(async () => { resolve(verified()); });
    expect(f.decide).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "승인 확정" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "승인 확정" }));
    await waitFor(() => expect(f.decide).toHaveBeenCalledExactlyOnceWith("review", "approved"));
  });

  it("discards a saved-version read superseded by same-actor publication and permits a fresh explicit read", async () => {
    setup(verified([comment]));
    let resolve!: (value: unknown[]) => void;
    f.revisions.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    fireEvent.click(screen.getByRole("button", { name: "수정한 저장 버전 선택" }));
    await waitFor(() => expect(f.revisions).toHaveBeenCalledOnce());
    await act(async () => { persistSession({ user: { id: "reviewer" }, token: null }); });
    await act(async () => { resolve([{ id: "stale", artifactId: "artifact", kind: "submission" }]); });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(f.resolve).not.toHaveBeenCalled();
    f.revisions.mockResolvedValue([{ id: "current", artifactId: "artifact", kind: "submission", message: "Current saved version" }]);
    fireEvent.click(screen.getByRole("button", { name: "수정한 저장 버전 선택" }));
    await screen.findByRole("combobox");
    expect(screen.getByRole("option", { name: /Current saved version/u })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /stale/u })).toBeNull();
    expect(f.revisions).toHaveBeenCalledTimes(2);
  });
});
