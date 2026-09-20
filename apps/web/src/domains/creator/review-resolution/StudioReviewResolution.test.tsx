// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistSession } from "@/compat/auth-session-state";

import { StudioReviewCaptureDialog } from "../review-capture/StudioReviewCaptureDialog";
import { EMPTY_STUDIO_REVIEW_CAPTURE } from "../review-capture/studio-review-capture-bridge";
import { StudioPinnedReviewPanel } from "../virtual-space/StudioPinnedReviewPanel";
import { StudioReviewResolution } from "./StudioReviewResolution";
import { studioReviewResolutionRequestFromLocation } from "./studio-review-resolution-route";
import { reviewResolutionFixture } from "./studio-review-resolution-test-fixture";

const io = vi.hoisted(() => ({ actor: "actor", verify: vi.fn(), revisions: vi.fn(), resolve: vi.fn(), create: vi.fn(), team: vi.fn() }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: io.actor } } }) }));
vi.mock("../virtual-space/studio-virtual-space-review-invitation", async (original) => ({ ...await original<object>(), verifyStudioVirtualSpaceReviewSubject: io.verify }));
vi.mock("../project-graph/studio-project-graph-client", async (original) => ({ ...await original<object>(), listStudioArtifactRevisions: io.revisions, resolveStudioReviewComment: io.resolve,
  createStudioReviewComment: io.create, newStudioProjectGraphId: () => "must-not-create" }));
vi.mock("../studio-team-client", () => ({ getStudioTeam: io.team }));
vi.mock("../virtual-space/StudioPinnedReviewPreview", () => ({ StudioPinnedReviewPreview: () => null }));
vi.mock("../virtual-space/StudioPinnedReviewWorkflow", () => ({ StudioPinnedReviewWorkflow: () => null }));
vi.mock("../virtual-space/StudioPinnedReviewComparison", () => ({ StudioPinnedReviewComparison: () => null,
  StudioPinnedReviewComparisonImages: ({ base, choice }: { base: { revisionId: string }; choice: { subject: { revisionId: string } } }) => <div>Compare {base.revisionId} → {choice.subject.revisionId}</div> }));
let f = reviewResolutionFixture();
beforeEach(() => {
  f = reviewResolutionFixture(); io.actor = "actor"; persistSession({ user: { id: "actor" }, token: null }); vi.clearAllMocks();
  io.verify.mockReset().mockImplementation(async (subject) => ({ ...(subject.reviewId === "review" ? f.origin : f.replacement), verifiedAt: Date.now(), expiresAt: Date.now() + 15_000 }));
  io.revisions.mockReset().mockImplementation(async () => f.revisions); io.team.mockReset().mockResolvedValue(f.team);
  io.resolve.mockReset().mockResolvedValue({ id: "comment", status: "resolved", resolutionRevisionId: "submission-new", resolvedBy: "actor", updatedAt: "now" });
});
afterEach(() => { cleanup(); persistSession(null); vi.restoreAllMocks(); });
async function check() { fireEvent.click(screen.getByRole("button", { name: "수정 검수본 확인" })); await screen.findByRole("checkbox", { name: "두 검수본을 비교했고 이 의견의 수정 결과를 확인했어요." }); }
const renderResolution = () => render(<StudioReviewResolution request={f.request} onRecorded={vi.fn()} onRevoked={vi.fn()} />);
describe("capture return and explicit correction resolution", () => {
  it("returns from completed capture to the original saved comment, compares both pins and only resolves on confirmation", async () => {
    const first = render(<StudioReviewCaptureDialog open origin={{ actorId: "actor", workId: "work", request: f.request.origin }}
      snapshot={{ ...EMPTY_STUDIO_REVIEW_CAPTURE, phase: "completed", subject: f.request.replacement }} onSave={vi.fn()} onRetry={vi.fn()} onClose={vi.fn()} />);
    const href = screen.getByRole("link", { name: "원래 의견에서 수정본 확인" }).getAttribute("href")!;
    const request = studioReviewResolutionRequestFromLocation("work", new URL(href, "https://example.test").search); expect(request).toEqual(f.request);
    expect(io.resolve).not.toHaveBeenCalled(); first.unmount();
    render(<StudioPinnedReviewPanel subject={f.request.origin.subject} resolutionRequest={request} />);
    await screen.findByText("새 검수본으로 수정 결과 확인"); expect(io.resolve).not.toHaveBeenCalled(); await check();
    expect(screen.getByText("Compare snapshot → snapshot-new")).toBeTruthy();
    const resolve = screen.getByRole("button", { name: "이 수정본으로 해결 기록" }) as HTMLButtonElement; expect(resolve.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "두 검수본을 비교했고 이 의견의 수정 결과를 확인했어요." })); fireEvent.click(resolve);
    await screen.findByText(/이 의견은 새 검수본의 저장 버전으로 해결 기록이 확인/u);
    expect(io.resolve).toHaveBeenCalledExactlyOnceWith("comment", "submission-new", "resolved", f.request.replacement); expect(io.create).not.toHaveBeenCalled();
    const next = new URL(screen.getByRole("link", { name: "새 검수본에서 검토·승인" }).getAttribute("href")!, "https://example.test");
    expect(next.searchParams.get("sharedReview")).toBe("review-new");
  });
  it("removes the return link when the current actor changes without waiting for parent props", async () => {
    render(<StudioReviewCaptureDialog open origin={{ actorId: "actor", workId: "work", request: f.request.origin }}
      snapshot={{ ...EMPTY_STUDIO_REVIEW_CAPTURE, phase: "completed", subject: f.request.replacement }} onSave={vi.fn()} onRetry={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "원래 의견에서 수정본 확인" })).toBeTruthy();
    await act(async () => { persistSession({ user: { id: "other" }, token: null }); });
    expect(screen.queryByRole("link", { name: "원래 의견에서 수정본 확인" })).toBeNull();
  });
  it("never posts after permission is revoked between comparison and explicit confirmation", async () => {
    renderResolution(); await check(); fireEvent.click(screen.getByRole("checkbox", { name: "두 검수본을 비교했고 이 의견의 수정 결과를 확인했어요." })); io.verify.mockResolvedValue({ ok: false, reason: "access-denied" });
    fireEvent.click(screen.getByRole("button", { name: "이 수정본으로 해결 기록" })); await screen.findByText(/편집할 권한을 확인하지 못했어요/u);
    expect(io.resolve).not.toHaveBeenCalled(); expect(screen.queryByText("Compare snapshot → snapshot-new")).toBeNull();
  });
  it("keeps ambiguous completion read-only even when explicitly rechecked", async () => {
    io.resolve.mockRejectedValue(new Error("lost")); renderResolution(); await check(); fireEvent.click(screen.getByRole("checkbox", { name: "두 검수본을 비교했고 이 의견의 수정 결과를 확인했어요." }));
    fireEvent.click(screen.getByRole("button", { name: "이 수정본으로 해결 기록" }));
    fireEvent.click(await screen.findByRole("button", { name: "해결 기록 다시 확인" })); await screen.findByRole("button", { name: "해결 기록 다시 확인" });
    expect(io.resolve).toHaveBeenCalledOnce(); expect(screen.queryByRole("button", { name: "이 수정본으로 해결 기록" })).toBeNull();
  });
  it("fences late verification on hidden and late POST completion after account change", async () => {
    const view = renderResolution(); await check(); fireEvent.click(screen.getByRole("checkbox", { name: "두 검수본을 비교했고 이 의견의 수정 결과를 확인했어요." }));
    let finish!: (value: typeof f.origin) => void; io.verify.mockImplementationOnce(() => new Promise((done) => { finish = done; }));
    fireEvent.click(screen.getByRole("button", { name: "이 수정본으로 해결 기록" }));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); fireEvent(document, new Event("visibilitychange"));
    await act(async () => { finish(f.origin); }); expect(io.resolve).not.toHaveBeenCalled(); expect(screen.queryByRole("checkbox", { name: "두 검수본을 비교했고 이 의견의 수정 결과를 확인했어요." })).toBeNull();
    view.unmount(); vi.restoreAllMocks(); io.verify.mockImplementation(async (subject) => subject.reviewId === "review" ? f.origin : f.replacement);
    const recorded = vi.fn(); const next = render(<StudioReviewResolution request={f.request} onRecorded={recorded} onRevoked={vi.fn()} />);
    await check(); fireEvent.click(screen.getByRole("checkbox", { name: "두 검수본을 비교했고 이 의견의 수정 결과를 확인했어요." })); let resolve!: (value: unknown) => void;
    io.resolve.mockImplementationOnce(() => new Promise((done) => { resolve = done; })); fireEvent.click(screen.getByRole("button", { name: "이 수정본으로 해결 기록" }));
    await waitFor(() => expect(io.resolve).toHaveBeenCalledOnce()); io.actor = "other";
    await act(async () => { persistSession({ user: { id: "other" }, token: null }); });
    next.rerender(<StudioReviewResolution request={f.request} onRecorded={recorded} onRevoked={vi.fn()} />);
    await act(async () => { resolve({ id: "comment", status: "resolved", resolutionRevisionId: "submission-new" }); }); expect(recorded).not.toHaveBeenCalled();
  });
});
