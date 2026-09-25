// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewPolicyHistoryResponse } from "@toonspectrum/studio-project-model";
import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import { StudioReviewPolicyHistory } from "./StudioReviewPolicyHistory";

const f = vi.hoisted(() => ({ actor: "actor", read: vi.fn() }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: f.actor } } }) }));
vi.mock("./studio-review-policy-client", () => ({ getStudioReviewPolicyHistory: f.read }));
const pin = { reviewId: "r", artifactId: "a", revisionId: "v", rootGraphHash: "a".repeat(64) };
function history(): ReviewPolicyHistoryResponse {
  return { actorId: f.actor, pin, entries: [{ id: "c", policyVersion: 1, stateVersion: 1, actorId: "actor", createdAt: "2026-09-21T00:00:00.000Z",
    command: { id: "c", type: "configure", pin, expectedPolicyVersion: 0, expectedStateVersion: 0, reason: "원고별 검토 사유", definition: { mode: "parallel", groups: [{ id: "g", label: "제작", reviewerIds: ["actor"], requiredApprovals: 1 }] } } }], nextBeforeStateVersion: null };
}
const ui = (stateVersion = 1) => <StudioReviewPolicyHistory pin={pin} stateVersion={stateVersion} />;
function open() { document.querySelector("details")!.open = true; }
async function load() { await act(async () => fireEvent.click(screen.getByRole("button", { name: "최신 정책·표결 이력 확인" }))); }
beforeEach(() => { f.actor = "actor"; f.read.mockReset(); persistSession({ user: { id: "actor" }, token: null }); f.read.mockResolvedValue(history()); });
afterEach(() => { cleanup(); persistSession(null); });
describe("pinned review policy history UI", () => {
  it("loads only on explicit request and displays original reason as historical evidence", async () => {
    render(ui()); open(); expect(f.read).not.toHaveBeenCalled(); await load();
    expect(f.read).toHaveBeenCalledExactlyOnceWith("r", undefined);
    expect(screen.getByText("원고별 검토 사유")).toBeTruthy();
    expect(screen.getByText(/현재 승인 수를 대신하지 않습니다/u)).toBeTruthy();
  });
  it("requests earlier pages with the server cursor rather than a guessed page number", async () => {
    const first = history();
    first.entries = Array.from({ length: 25 }, (_, index) => { const version = 26 - index; return {
      id: `vote-${version}`, policyVersion: 1, stateVersion: version, actorId: "actor", createdAt: "2026-09-21T00:00:00.000Z",
      command: { id: `vote-${version}`, type: "vote" as const, pin, expectedPolicyVersion: 1, expectedStateVersion: version - 1, groupId: "g", decision: "approve" as const, note: "" },
    }; });
    first.nextBeforeStateVersion = 2; f.read.mockResolvedValueOnce(first);
    render(ui()); open(); await load();
    f.read.mockResolvedValueOnce(history());
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "이전 이력 25개 확인" })));
    expect(f.read).toHaveBeenLastCalledWith("r", 2);
  });
  it("clears cached history after a denied or unavailable refresh", async () => {
    render(ui()); open(); await load(); f.read.mockRejectedValueOnce(new Error("revoked")); await load();
    expect(screen.queryByText("원고별 검토 사유")).toBeNull(); expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("refuses results from another pinned review", async () => {
    f.read.mockResolvedValueOnce({ ...history(), pin: { ...pin, revisionId: "other" } });
    render(ui()); open(); await load(); expect(screen.queryByText("원고별 검토 사유")).toBeNull(); expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("ignores a late result after an account switch and never duplicates a pending read", async () => {
    let finish!: (value: ReviewPolicyHistoryResponse) => void;
    f.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(ui()); open(); await load(); await load(); expect(f.read).toHaveBeenCalledTimes(1);
    const previous = history(); f.actor = "other"; persistSession({ user: { id: f.actor }, token: null }); view.rerender(ui());
    await act(async () => finish(previous)); expect(screen.queryByText("원고별 검토 사유")).toBeNull();
  });
  it("invalidates displayed history after a confirmed policy-state change", async () => {
    const view = render(ui()); open(); await load(); view.rerender(ui(2));
    expect(screen.queryByText("원고별 검토 사유")).toBeNull(); expect(f.read).toHaveBeenCalledTimes(1);
  });
});
