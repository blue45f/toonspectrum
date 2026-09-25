// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateReviewPolicy, type ReviewPolicyResponse, type ReviewPolicyVoteRecord } from "@toonspectrum/studio-project-model";
import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import { StudioReviewPolicyPanel } from "./StudioReviewPolicyPanel";
import type { StudioVirtualSpaceVerifiedReview } from "./studio-virtual-space-review-invitation";

const f = vi.hoisted(() => ({ actor: "actor-a", get: vi.fn(), command: vi.fn(), decide: vi.fn(), refreshed: vi.fn(), known: vi.fn() }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: f.actor } } }) }));
vi.mock("./studio-review-policy-client", () => ({ getStudioReviewPolicy: f.get, applyStudioReviewPolicyCommand: f.command }));
vi.mock("../project-graph/studio-project-graph-client", () => ({ decideStudioReview: f.decide }));
const pin = { reviewId: "review", artifactId: "artifact", revisionId: "revision", rootGraphHash: "a".repeat(64) };
const verified = { subject: { ...pin, schemaVersion: 1, projectId: "project", workId: "work" },
  review: { status: "open", comments: [], reviewerIds: ["actor-a", "actor-b"] } } as unknown as StudioVirtualSpaceVerifiedReview;
function response(approved = false): ReviewPolicyResponse {
  const definition = { mode: "parallel" as const, groups: [{ id: "production", label: "제작 검토", reviewerIds: ["actor-a", "actor-b"], requiredApprovals: 2 }] };
  const votes: ReviewPolicyVoteRecord[] = approved ? ["actor-a", "actor-b"].map((actorId, i) => ({ actorId, groupId: "production", stateVersion: 2+i, decision: "approve", note: "", decidedAt: "2026-09-21T00:00:00.000Z" })) : [];
  return { actorId: f.actor, canConfigure: true, eligibleReviewerIds: ["actor-a", "actor-b"], policy: { pin, definition,
    policyVersion: 1, stateVersion: approved ? 3 : 1, configuredBy: "actor-a", configuredAt: "2026-09-21T00:00:00.000Z", votes, ...evaluateReviewPolicy(definition, votes, ["actor-a", "actor-b"]) } };
}
const ui = () => <StudioReviewPolicyPanel verified={verified} onRefresh={f.refreshed} onPolicyKnown={f.known} />;
async function load() { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "그룹 검수 기록 확인" })); }); }
beforeEach(() => { f.actor = "actor-a"; for (const value of Object.values(f)) if (vi.isMockFunction(value)) value.mockReset(); persistSession({ user: { id: f.actor }, token: null }); f.get.mockResolvedValue(response()); f.command.mockResolvedValue(response()); f.decide.mockResolvedValue({ id: "review", status: "approved" }); });
afterEach(() => { cleanup(); persistSession(null); });
describe("group review policy UI", () => {
  it("does not read automatically or treat a failed read as no policy", async () => {
    render(ui()); document.querySelector("details")!.open = true; expect(f.get).not.toHaveBeenCalled();
    f.get.mockRejectedValue(new Error("unavailable")); await load();
    expect(f.known).not.toHaveBeenCalled(); expect(screen.getByRole("status").textContent).toContain("정책 없음으로 처리하지 않습니다");
  });
  it("removes cached reviewers and decision controls when current access cannot be verified", async () => {
    render(ui()); document.querySelector("details")!.open = true; await load();
    expect(screen.getByRole("region", { name: "제작 검토" })).toBeTruthy();
    f.get.mockRejectedValue(new Error("access revoked")); await load();
    expect(screen.queryByRole("region", { name: "제작 검토" })).toBeNull();
    expect(screen.queryByRole("button", { name: "그룹 정책 설정·변경" })).toBeNull();
    expect(f.decide).not.toHaveBeenCalled();
  });

  it("publishes a vote for the exact displayed policy and retries its original identity", async () => {
    render(ui()); document.querySelector("details")!.open = true; await load(); f.command.mockRejectedValue(new Error("lost response"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "이 그룹 승인 의견 기록" })); });
    const command = f.command.mock.calls[0]![0];
    expect(command).toMatchObject({ type: "vote", pin, expectedPolicyVersion: 1, expectedStateVersion: 1, groupId: "production", decision: "approve" });
    f.command.mockResolvedValue(response());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "동일 요청 결과 확인" })); });
    expect(f.command.mock.calls[1]![0]).toEqual(command); expect(f.decide).not.toHaveBeenCalled();
  });
  it("requires explicit policy-change consent and preserves original expected versions", async () => {
    render(ui()); document.querySelector("details")!.open = true; await load();
    fireEvent.click(screen.getByRole("button", { name: "그룹 정책 설정·변경" }));
    const save = screen.getByRole("button", { name: "정책 저장 확정" }); expect(save).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("설정·변경 이유"), { target: { value: "권리 검토 강화" } });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox", { name: /이 고정 검수본에만/u }));
    await act(async () => { fireEvent.click(save); });
    expect(f.command.mock.calls[0]![0]).toMatchObject({ type: "configure", pin, expectedPolicyVersion: 1, expectedStateVersion: 1, reason: "권리 검토 강화" });
  });
  it("checks the consented versions again before final approval", async () => {
    f.get.mockResolvedValue(response(true)); render(ui()); document.querySelector("details")!.open = true; await load();
    fireEvent.click(screen.getByRole("checkbox", { name: /현재 고정본·정책/u }));
    const changed = response(true); changed.policy!.stateVersion = 4; f.get.mockResolvedValue(changed);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "그룹 검토를 확인하고 최종 승인" })); });
    expect(f.decide).not.toHaveBeenCalled();
  });
  it("finally approves only the fixed source after satisfied groups and explicit confirmation", async () => {
    f.get.mockResolvedValue(response(true)); render(ui()); document.querySelector("details")!.open = true; await load();
    const final = screen.getByRole("button", { name: "그룹 검토를 확인하고 최종 승인" }); expect(final).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox", { name: /현재 고정본·정책/u }));
    await act(async () => { fireEvent.click(final); });
    expect(f.decide).toHaveBeenCalledExactlyOnceWith("review", "approved", { ...pin, policyVersion: 1, stateVersion: 3 });
    expect(f.refreshed).toHaveBeenCalledOnce();
  });
  it("does not display an old actor's late response after the actor changes", async () => {
    let resolve!: (value: ReviewPolicyResponse) => void;
    f.get.mockReturnValue(new Promise((done) => { resolve = done; }));
    const view = render(ui()); document.querySelector("details")!.open = true; await load();
    const old = response(); f.actor = "actor-b"; persistSession({ user: { id: f.actor }, token: null }); view.rerender(ui());
    await act(async () => { resolve(old); });
    expect(f.known).not.toHaveBeenCalled(); expect(screen.queryByRole("region", { name: "제작 검토" })).toBeNull();
  });
  it("does not give a non-designated viewer a group vote", async () => {
    f.actor = "viewer"; persistSession({ user: { id: f.actor }, token: null });
    const value = response(); value.canConfigure = false; f.get.mockResolvedValue(value);
    render(ui()); document.querySelector("details")!.open = true; await load();
    expect(within(screen.getByRole("region", { name: "제작 검토" })).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "그룹 정책 설정·변경" })).toBeNull();
  });
});
