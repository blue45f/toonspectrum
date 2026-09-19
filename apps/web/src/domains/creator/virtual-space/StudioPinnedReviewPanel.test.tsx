// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthSessionRevision, persistSession } from "@/compat/auth-session-state";
import { StudioPinnedReviewPanel } from "./StudioPinnedReviewPanel";
import type { StudioVirtualSpaceReviewVerification } from "./studio-virtual-space-review-invitation";

const f = vi.hoisted(() => ({ verify: vi.fn(), create: vi.fn(), newId: vi.fn(), decide: vi.fn(), revisions: vi.fn(), resolve: vi.fn(), reopen: vi.fn(),
  actor: "actor-a" as string | null, previewRevoke: null as (() => void) | null }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: f.actor ? { user: { id: f.actor } } : null }) }));
vi.mock("./StudioPinnedReviewPreview", () => ({ StudioPinnedReviewPreview: ({ onRevoked }: { onRevoked: () => void }) => {
  f.previewRevoke = onRevoked;
  return <img alt="Private preview" src="https://preview.invalid/image" />;
} }));
vi.mock("./studio-virtual-space-review-invitation", () => ({ verifyStudioVirtualSpaceReviewSubject: f.verify }));
vi.mock("../project-graph/studio-project-graph-client", () => ({ createStudioReviewComment: f.create, newStudioProjectGraphId: f.newId,
  decideStudioReview: f.decide, listStudioArtifactRevisions: f.revisions, resolveStudioReviewComment: f.resolve, reopenStudioReviewComment: f.reopen }));
const subject = { schemaVersion: 1 as const, workId: "work-1", projectId: "graph-1", artifactId: "artifact-1", reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) };
function verified(comment = true): StudioVirtualSpaceReviewVerification {
  return { ok: true, subject, verifiedAt: Date.now(), expiresAt: Date.now() + 15_000, href: "/pinned",
    project: { access: { view: true, comment, edit: true }, artifacts: [{ id: subject.artifactId, scope: { projectId: subject.projectId } }] },
    review: { title: "Snapshot one", status: "open", reviewerIds: ["actor-a"], comments: [] }, revision: { id: subject.revisionId },
  } as unknown as StudioVirtualSpaceReviewVerification;
}
beforeEach(() => {
  f.actor = "actor-a"; f.previewRevoke = null; persistSession({ user: { id: f.actor }, token: null });
  Object.values(f).forEach((mock) => { if (vi.isMockFunction(mock)) mock.mockReset(); });
  f.newId.mockReturnValue("note-identity"); f.verify.mockResolvedValue(verified()); f.create.mockResolvedValue({ id: "note-identity" });
  f.decide.mockResolvedValue({}); f.revisions.mockResolvedValue([]); f.resolve.mockResolvedValue({}); f.reopen.mockResolvedValue({});
});
afterEach(() => { cleanup(); persistSession(null); vi.useRealTimers(); vi.restoreAllMocks(); });
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
  it("restarts a delayed focus read after the same actor's session publication without losing the draft or retry identity", async () => {
    f.create.mockRejectedValueOnce(new Error("network response lost"));
    render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByRole("textbox");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep the final panel." } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "required" } });
    fireEvent.click(screen.getByRole("button", { name: "의견 저장" }));
    await screen.findByText(/저장 결과를 확인하지 못했어요/u);
    const attemptedInput = f.create.mock.calls[0]![1];
    let resolveFocus!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { resolveFocus = done; }));
    fireEvent(window, new Event("focus"));
    const beforePublication = getAuthSessionRevision();
    const baseline = verified();
    const fresh = baseline.ok ? { ...baseline, review: { ...baseline.review, title: "Session-refreshed snapshot" } } : baseline;
    f.verify.mockResolvedValue(fresh);
    await act(async () => { persistSession({ user: { id: "actor-a", name: "Refreshed profile" }, token: null }); });
    expect(getAuthSessionRevision()).toBeGreaterThan(beforePublication);
    await act(async () => { resolveFocus({ ok: false, reason: "access-denied" }); });
    await screen.findByText("Session-refreshed snapshot");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep the final panel.");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("required");
    expect(f.create).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "의견 저장" }));
    await waitFor(() => expect(f.create).toHaveBeenCalledTimes(2));
    expect(f.create.mock.calls[1]![1]).toEqual(attemptedInput);
  });
  it("preserves actual workflow selections and confirmation during the same actor's session refresh", async () => {
    const baseline = verified();
    if (!baseline.ok) throw new Error("Missing verified fixture");
    const value = { ...baseline, review: { ...baseline.review, comments: [{ id: "comment-1", body: "Review note", status: "open", severity: "note" }] } };
    f.verify.mockResolvedValue(value);
    f.revisions.mockResolvedValue([{ id: "saved-2", artifactId: subject.artifactId, kind: "submission", message: "Saved resolution" }]);
    render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByText("Snapshot one");
    fireEvent.click(screen.getByRole("button", { name: "수정한 저장 버전 선택" }));
    const selection = await screen.findByLabelText("의견을 해결한 버전");
    fireEvent.change(selection, { target: { value: "saved-2" } });
    fireEvent.click(screen.getByRole("button", { name: "이 검수본 승인" }));
    let resolveRead!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { resolveRead = done; }));
    await act(async () => { persistSession({ user: { id: "actor-a" }, token: null }); });
    expect((screen.getByLabelText("의견을 해결한 버전") as HTMLSelectElement).value).toBe("saved-2");
    expect(screen.getByRole("button", { name: "승인 확정" })).toBeTruthy();
    await act(async () => { resolveRead({ ...baseline, review: { ...baseline.review, comments: value.review.comments } } as StudioVirtualSpaceReviewVerification); });
    expect((screen.getByLabelText("의견을 해결한 버전") as HTMLSelectElement).value).toBe("saved-2");
    expect(screen.getByRole("button", { name: "승인 확정" })).toBeTruthy();
    expect(f.decide).not.toHaveBeenCalled(); expect(f.resolve).not.toHaveBeenCalled();
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
    const mounted = render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByText("Snapshot one");
    let resolve!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await writeNote();
    await act(async () => { persistSession({ user: { id: "actor-b" }, token: null }); });
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(f.verify).toHaveBeenCalledTimes(2);
    await act(async () => { resolve(verified()); });
    expect(f.create).not.toHaveBeenCalled();
    f.actor = "actor-b";
    mounted.rerender(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByRole("textbox");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("only refreshes reads when the same actor is published during a pending save and removes its session listener on unmount", async () => {
    const mounted = render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByText("Snapshot one");
    let resolveSave!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { resolveSave = done; }));
    await writeNote();
    await act(async () => { persistSession({ user: { id: "actor-a" }, token: null }); });
    await act(async () => { resolveSave(verified()); });
    expect(f.create).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep the final panel.");
    expect((screen.getByRole("button", { name: "의견 저장" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "의견 저장" }));
    await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    mounted.unmount();
    const reads = f.verify.mock.calls.length;
    await act(async () => { persistSession({ user: { id: "actor-a" }, token: null }); });
    expect(f.verify).toHaveBeenCalledTimes(reads);
  });

  it.each(["verification", "post"] as const)("releases a hidden panel's pending %s without letting its late result clear a newer save", async (phase) => {
    render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByText("Snapshot one");
    let finishOld!: () => void;
    if (phase === "verification") f.verify.mockImplementationOnce(() => new Promise((done) => { finishOld = () => { done(verified()); }; }));
    else f.create.mockImplementationOnce(() => new Promise((done) => { finishOld = () => { done({ id: "note-identity" }); }; }));
    await writeNote();
    if (phase === "post") await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(screen.queryByRole("textbox")).toBeNull();
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await screen.findByRole("textbox");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep the final panel.");
    expect((screen.getByRole("button", { name: "의견 저장" }) as HTMLButtonElement).disabled).toBe(false);
    let finishCurrent!: (value: StudioVirtualSpaceReviewVerification) => void;
    f.verify.mockImplementationOnce(() => new Promise((done) => { finishCurrent = done; }));
    fireEvent.click(screen.getByRole("button", { name: "의견 저장" }));
    await act(async () => { finishOld(); });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep the final panel.");
    expect(f.create).toHaveBeenCalledTimes(phase === "post" ? 1 : 0);
    await act(async () => { finishCurrent(verified()); });
    await screen.findByText("이 검수 버전에 의견을 남겼어요.");
    expect(f.create).toHaveBeenCalledTimes(phase === "post" ? 2 : 1);
    expect(f.newId).toHaveBeenCalledOnce();
  });

  it.each([
    ["preview", "verification"], ["preview", "post"],
    ["workflow", "verification"], ["workflow", "post"],
  ] as const)("releases busy ownership when %s revokes a pending %s and permits an explicit authorized retry", async (source, phase) => {
    render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByText("Snapshot one");
    let finishOld!: () => void;
    if (phase === "verification") f.verify.mockImplementationOnce(() => new Promise((done) => { finishOld = () => { done(verified()); }; }));
    else f.create.mockImplementationOnce(() => new Promise((done) => { finishOld = () => { done({ id: "note-identity" }); }; }));
    await writeNote();
    if (phase === "post") await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    if (source === "preview") await act(async () => { f.previewRevoke?.(); });
    else {
      f.verify.mockResolvedValueOnce({ ok: false, reason: "access-denied" });
      fireEvent.click(screen.getByRole("button", { name: "수정 요청으로 기록" }));
    }
    await screen.findByRole("alert");
    expect(screen.queryByRole("img")).toBeNull();
    expect((screen.getByRole("button", { name: "검토 기록 새로 확인" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "검토 기록 새로 확인" }));
    await screen.findByRole("textbox");
    await act(async () => { finishOld(); });
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Keep the final panel.");
    expect(f.create).toHaveBeenCalledTimes(phase === "post" ? 1 : 0);
    fireEvent.click(screen.getByRole("button", { name: "의견 저장" }));
    await screen.findByText("이 검수 버전에 의견을 남겼어요.");
    expect(f.create).toHaveBeenCalledTimes(phase === "post" ? 2 : 1);
    expect(f.newId).toHaveBeenCalledOnce();
    expect(f.decide).not.toHaveBeenCalled();
  });
});
