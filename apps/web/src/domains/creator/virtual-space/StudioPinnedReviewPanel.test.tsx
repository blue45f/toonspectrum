// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioPinnedReviewPanel } from "./StudioPinnedReviewPanel";
import type { StudioVirtualSpaceReviewVerification } from "./studio-virtual-space-review-invitation";

const f = vi.hoisted(() => ({ verify: vi.fn(), create: vi.fn(), newId: vi.fn(), actor: "actor-a" as string | null, sessionRevision: 1 }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: f.actor ? { user: { id: f.actor } } : null }) }));
vi.mock("@/compat/auth-session-state", async (original) => ({ ...(await original<typeof import("@/compat/auth-session-state")>()), getAuthSessionRevision: () => f.sessionRevision }));
vi.mock("./StudioPinnedReviewPreview", () => ({ StudioPinnedReviewPreview: () => <img alt="Private preview" src="https://preview.invalid/image" /> }));
vi.mock("./StudioPinnedReviewWorkflow", () => ({ StudioPinnedReviewWorkflow: () => <div>Workflow</div> }));
vi.mock("./studio-virtual-space-review-invitation", () => ({ verifyStudioVirtualSpaceReviewSubject: f.verify }));
vi.mock("../project-graph/studio-project-graph-client", () => ({ createStudioReviewComment: f.create, newStudioProjectGraphId: f.newId }));
const subject = { schemaVersion: 1 as const, workId: "work-1", projectId: "graph-1", artifactId: "artifact-1", reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) };
function verified(comment = true): StudioVirtualSpaceReviewVerification {
  return { ok: true, subject, verifiedAt: Date.now(), expiresAt: Date.now() + 15_000, href: "/pinned",
    project: { access: { view: true, comment }, artifacts: [{ id: subject.artifactId, scope: { projectId: subject.projectId } }] },
    review: { title: "Snapshot one", status: "open", comments: [] }, revision: { id: subject.revisionId },
  } as unknown as StudioVirtualSpaceReviewVerification;
}
beforeEach(() => { f.actor = "actor-a"; f.sessionRevision = 1; f.newId.mockReset().mockReturnValue("note-identity"); f.verify.mockReset().mockResolvedValue(verified()); f.create.mockReset().mockResolvedValue({ id: "note-identity" }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function writeNote() {
  await screen.findByLabelText("이 버전에 의견 남기기");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep the final panel." } });
  fireEvent.click(screen.getByRole("button", { name: "의견 저장" }));
}
describe("Pinned review UI authority", () => {
  it("saves only after an explicit action, with fresh permission and the immutable invitation version", async () => {
    render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByText("Snapshot one");
    expect(f.create).not.toHaveBeenCalled();
    await writeNote();
    await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    expect(f.verify).toHaveBeenCalledWith(subject, "view");
    expect(f.create).toHaveBeenCalledWith("review-1", { id: "note-identity", body: "Keep the final panel.", severity: "note",
      anchor: { kind: "artifact", artifactId: "artifact-1", revisionId: "snapshot-1", scope: { projectId: "graph-1" } } });
  });
  it("does not grant comment permission through an invitation and rechecks permission at save", async () => {
    render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByText("Snapshot one");
    f.verify.mockResolvedValue(verified(false));
    await writeNote();
    await screen.findByText("현재 검수본에 의견을 남길 권한이 없어요.");
    expect(f.create).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("preserves an uncertain save draft and reuses its identity instead of generating a duplicate", async () => {
    f.create.mockRejectedValueOnce(new Error("network response lost"));
    render(<StudioPinnedReviewPanel subject={subject} />);
    await writeNote();
    await screen.findByText(/저장 결과를 확인하지 못했어요/u);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep the final panel.");
    fireEvent.click(screen.getByRole("button", { name: "의견 저장" }));
    await waitFor(() => expect(f.create).toHaveBeenCalledTimes(2));
    expect(f.create.mock.calls[0]?.[1]).toEqual(f.create.mock.calls[1]?.[1]);
  });
  it("removes a visible private review when renewal stalls beyond its permission lease", async () => {
    render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByText("Snapshot one");
    vi.useFakeTimers();
    // Re-read under the fake clock so both lease timers are controlled by the test.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "검토 기록 새로 확인" })); });
    let resolve!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(screen.queryByText("Snapshot one")).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByText("Snapshot one")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    await act(async () => { resolve({ ok: false, reason: "access-denied" }); });
    expect(screen.queryByRole("alert")).not.toBeNull();
  });
  it("ignores a delayed old review after the route changes to an invalid pin", async () => {
    let resolve!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const mounted = render(<StudioPinnedReviewPanel subject={subject} />);
    mounted.rerender(<StudioPinnedReviewPanel subject={null} />);
    await screen.findByRole("alert");
    await act(async () => { resolve(verified()); });
    expect(screen.queryByText("Snapshot one")).toBeNull();
    expect(f.create).not.toHaveBeenCalled();
  });

  it("removes the previous actor's private view immediately and cannot issue their delayed save under the new actor", async () => {
    const mounted = render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByText("Snapshot one");
    expect(screen.getByRole("img", { name: "Private preview" })).toBeTruthy();
    let resolveSave!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
    await writeNote();
    let resolveNewActor!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((resolve) => { resolveNewActor = resolve; }));
    f.actor = "actor-b";
    mounted.rerender(<StudioPinnedReviewPanel subject={subject} />);
    expect(screen.queryByText("Snapshot one")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    await act(async () => { resolveSave(verified()); });
    expect(f.create).not.toHaveBeenCalled();
    await act(async () => { resolveNewActor(verified()); });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("note");
    await writeNote();
    await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
  });

  it("does not carry an ambiguous comment identity across accounts and hides private content on sign-out", async () => {
    f.newId.mockReturnValueOnce("actor-a-note").mockReturnValueOnce("actor-b-note");
    f.create.mockRejectedValueOnce(new Error("lost result"));
    const mounted = render(<StudioPinnedReviewPanel subject={subject} />);
    await writeNote(); await screen.findByText(/저장 결과를 확인하지 못했어요/u);
    f.actor = "actor-b"; mounted.rerender(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByRole("textbox");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    await writeNote(); await waitFor(() => expect(f.create).toHaveBeenCalledTimes(2));
    expect(f.create.mock.calls.map((call) => call[1].id)).toEqual(["actor-a-note", "actor-b-note"]);
    f.actor = null; mounted.rerender(<StudioPinnedReviewPanel subject={subject} />);
    expect(screen.queryByRole("img")).toBeNull(); expect(screen.queryByText("Snapshot one")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not issue a write when session authority changes before React publishes the next actor", async () => {
    render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByText("Snapshot one");
    let resolve!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await writeNote();
    ++f.sessionRevision;
    await act(async () => { resolve(verified()); });
    expect(f.create).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "의견 저장" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
