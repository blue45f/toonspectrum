// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import type { StudioTeamSnapshot } from "../studio-team-client";
import { StudioPinnedReviewPanel } from "./StudioPinnedReviewPanel";
import { normalizeStudioReviewAssignees, studioReviewAssignmentCandidates, studioReviewDueAt } from "./studio-review-comment-assignment";

const f = vi.hoisted(() => ({ actor: "actor-a" as string | null, verify: vi.fn(), team: vi.fn(), create: vi.fn(), newId: vi.fn() }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => ({ data: f.actor ? { user: { id: f.actor } } : null }) }));
vi.mock("../studio-team-client", () => ({ getStudioTeam: f.team }));
vi.mock("./studio-virtual-space-review-invitation", () => ({ verifyStudioVirtualSpaceReviewSubject: f.verify }));
vi.mock("../project-graph/studio-project-graph-client", () => ({ createStudioReviewComment: f.create, newStudioProjectGraphId: f.newId }));
vi.mock("./StudioPinnedReviewPreview", () => ({ StudioPinnedReviewPreview: () => null }));
vi.mock("./StudioPinnedReviewComparison", () => ({ StudioPinnedReviewComparison: () => null }));
vi.mock("./StudioPinnedReviewWorkflow", () => ({ StudioPinnedReviewWorkflow: () => null }));
const subject = { schemaVersion: 1 as const, workId: "work-a", projectId: "graph-a", artifactId: "artifact-a", reviewId: "review-a", revisionId: "snapshot-a", rootGraphHash: "a".repeat(64) };
function verified() {
  return { ok: true, subject, verifiedAt: Date.now(), expiresAt: Date.now() + 15_000, href: "/pinned",
    project: { access: { view: true, comment: true }, artifacts: [{ id: subject.artifactId, scope: { projectId: subject.projectId } }] },
    review: { title: "Pinned version", status: "open", comments: [] }, revision: { id: subject.revisionId } };
}
function team(): StudioTeamSnapshot {
  return { workId: subject.workId, viewer: { userId: "actor-a", role: "commenter", status: "active",
    capabilities: { view: true, comment: true, edit: false, manageMembers: false, respondInvite: false } },
  members: [
    { userId: "user-owner", name: "Owner", role: "owner", status: "active", isOwner: true, image: "" },
    { userId: "user-editor", name: "Editor", role: "editor", status: "active", isOwner: false, image: "", invitationId: "not-a-user-id" },
    { userId: "user-admin", name: "Admin", role: "admin", status: "active", isOwner: false, image: "" },
    { userId: "user-commenter", name: "Commenter", role: "commenter", status: "active", isOwner: false, image: "" },
    { userId: "user-viewer", name: "Viewer", role: "viewer", status: "active", isOwner: false, image: "" },
    { userId: "user-pending", name: "Pending editor", role: "editor", status: "pending", isOwner: false, image: "" },
  ] };
}
beforeEach(() => {
  f.actor = "actor-a"; persistSession({ user: { id: f.actor }, token: null });
  vi.clearAllMocks(); f.verify.mockReset().mockImplementation(async () => verified()); f.team.mockReset().mockImplementation(async () => team());
  f.create.mockReset().mockResolvedValue({}); let id = 0; f.newId.mockReset().mockImplementation(() => `note-${++id}`);
});
afterEach(() => { cleanup(); persistSession(null); vi.useRealTimers(); vi.restoreAllMocks(); });
async function draft() {
  render(<StudioPinnedReviewPanel subject={subject} />);
  await screen.findByLabelText("이 버전에 의견 남기기");
  fireEvent.change(screen.getByLabelText("이 버전에 의견 남기기"), { target: { value: "  Correct this panel. \n " } });
  fireEvent.click(screen.getByRole("button", { name: "배정 가능한 팀원 확인" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: "Owner" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Editor" }));
  fireEvent.change(screen.getByLabelText("완료 기한"), { target: { value: "2026-10-21T14:30" } });
}
const save = () => fireEvent.click(screen.getByRole("button", { name: "의견 저장" }));

describe("Review assignment policy and input normalization", () => {
  it("uses active owner/admin/editor user IDs and rejects a roster for another work or actor", () => {
    expect(studioReviewAssignmentCandidates(team(), subject.workId, "actor-a").map((member) => member.userId))
      .toEqual(["user-owner", "user-editor", "user-admin"]);
    expect(() => studioReviewAssignmentCandidates(team(), "another-work", "actor-a")).toThrow();
    expect(() => studioReviewAssignmentCandidates(team(), subject.workId, "actor-b")).toThrow();
    const denied = team(); denied.viewer.capabilities.comment = false;
    expect(() => studioReviewAssignmentCandidates(denied, subject.workId, "actor-a")).toThrow();
    expect(normalizeStudioReviewAssignees(["user-owner", "user-editor", "user-owner"])).toEqual(["user-editor", "user-owner"]);
  });
  it("converts an explicit local wall clock to UTC and rejects invalid dates without silently changing them", () => {
    expect(studioReviewDueAt("2026-10-21T14:30")).toEqual({ ok: true, dueAt: new Date(2026, 9, 21, 14, 30).toISOString() });
    expect(studioReviewDueAt("")).toEqual({ ok: true });
    for (const value of ["2026-02-30T14:30", "2026-13-01T14:30", "2026-10-21T24:01", "tomorrow", "2026-10-21T14:"])
      expect(studioReviewDueAt(value)).toEqual({ ok: false });
  });
  it("sends trimmed body, exact user IDs, selected severity and UTC deadline after a fresh permission check", async () => {
    await draft();
    expect(screen.queryByRole("checkbox", { name: "Commenter" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Viewer" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "Pending editor" })).toBeNull();
    fireEvent.change(screen.getByLabelText("의견 유형"), { target: { value: "required" } }); save();
    await waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    expect(f.team).toHaveBeenCalledTimes(2);
    expect(f.create).toHaveBeenCalledWith(subject.reviewId, { id: "note-1", body: "Correct this panel.", severity: "required",
      anchor: { kind: "artifact", artifactId: subject.artifactId, revisionId: subject.revisionId, scope: { projectId: subject.projectId } },
      assigneeIds: ["user-editor", "user-owner"], dueAt: new Date(2026, 9, 21, 14, 30).toISOString() });
  });
  it("preserves assignments and deadline across an uncertain response and same-actor renewal, reusing the exact request", async () => {
    f.create.mockRejectedValueOnce(new Error("response lost")); await draft(); save();
    await screen.findByText(/저장 결과를 확인하지 못했어요/u);
    const first = f.create.mock.calls[0]![1];
    await act(async () => { persistSession({ user: { id: "actor-a" }, token: null }); });
    expect((screen.getByLabelText("완료 기한") as HTMLInputElement).value).toBe("2026-10-21T14:30");
    expect(screen.getByText("담당자 2명 선택")).toBeTruthy();
    save(); await waitFor(() => expect(f.create).toHaveBeenCalledTimes(2));
    expect(f.create.mock.calls[1]![1]).toEqual(first); expect(f.newId).toHaveBeenCalledOnce();
  });
  it.each(["severity", "assignee", "deadline"])("gives an explicitly changed %s a new request identity after an uncertain response", async (field) => {
    f.create.mockRejectedValueOnce(new Error("response lost")); await draft(); save();
    await screen.findByText(/저장 결과를 확인하지 못했어요/u);
    if (field === "severity") fireEvent.change(screen.getByLabelText("의견 유형"), { target: { value: "required" } });
    if (field === "assignee") fireEvent.click(screen.getByRole("checkbox", { name: "Owner" }));
    if (field === "deadline") fireEvent.change(screen.getByLabelText("완료 기한"), { target: { value: "2026-10-22T14:30" } });
    save(); await waitFor(() => expect(f.create).toHaveBeenCalledTimes(2));
    expect(f.create.mock.calls[1]![1].id).toBe("note-2");
  });
  it.each(["removed", "viewer", "pending"])("blocks a new write when a selected editor becomes %s before saving", async (change) => {
    await draft(); const fresh = team();
    if (change === "removed") fresh.members = fresh.members.filter((member) => member.userId !== "user-editor");
    else { const editor = fresh.members.find((member) => member.userId === "user-editor")!;
      if (change === "viewer") editor.role = "viewer"; else editor.status = "pending"; }
    f.team.mockResolvedValueOnce(fresh); save();
    await screen.findByText(/선택한 담당자의 현재 편집 권한을 확인/u);
    expect(f.create).not.toHaveBeenCalled(); expect(screen.getByText("담당자 2명 선택")).toBeTruthy();
  });
  it("cannot write as a later actor after awaiting the selected assignees' authority", async () => {
    await draft(); let finish!: (value: StudioTeamSnapshot) => void;
    f.team.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })); save();
    await waitFor(() => expect(f.team).toHaveBeenCalledTimes(2));
    f.actor = "actor-b"; await act(async () => { persistSession({ user: { id: f.actor! }, token: null }); });
    await act(async () => { finish(team()); });
    expect(f.create).not.toHaveBeenCalled();
  });
  it("distinguishes an unavailable assignee check from an uncertain POST and preserves the draft without creating an attempt", async () => {
    await draft(); f.team.mockRejectedValueOnce(new Error("roster unavailable")); save();
    await screen.findByText(/담당자 권한을 확인하지 못해 저장하지 않았어요/u);
    expect(f.create).not.toHaveBeenCalled(); expect(f.newId).not.toHaveBeenCalled();
    expect(screen.getByText("담당자 2명 선택")).toBeTruthy();
    expect((screen.getByLabelText("완료 기한") as HTMLInputElement).value).toBe("2026-10-21T14:30");
  });
  it("cancels a pending roster read on actor publication and never displays the old private names", async () => {
    let finish!: (value: StudioTeamSnapshot) => void;
    f.team.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const ui = render(<StudioPinnedReviewPanel subject={subject} />);
    await screen.findByLabelText("이 버전에 의견 남기기");
    fireEvent.click(screen.getByRole("button", { name: "배정 가능한 팀원 확인" }));
    const signal = f.team.mock.calls[0]![1] as AbortSignal;
    f.actor = "actor-b"; await act(async () => { persistSession({ user: { id: f.actor! }, token: null }); });
    ui.rerender(<StudioPinnedReviewPanel subject={subject} />);
    await act(async () => { finish(team()); });
    expect(signal.aborted).toBe(true); expect(screen.queryByText("Owner")).toBeNull();
    expect(screen.getByText("담당자 0명 선택")).toBeTruthy();
    expect((screen.getByLabelText("완료 기한") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("이 버전에 의견 남기기") as HTMLTextAreaElement).value).toBe("");
  });
  it("does not send a note after a hidden document invalidates its pending assignee check, and releases the busy owner", async () => {
    await draft(); let finish!: (value: StudioTeamSnapshot) => void;
    f.team.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })); save();
    await waitFor(() => expect(f.team).toHaveBeenCalledTimes(2));
    const visibility = vi.spyOn(document, "visibilityState", "get"); visibility.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    await act(async () => { finish(team()); });
    expect(f.create).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible"); fireEvent(document, new Event("visibilitychange"));
    await screen.findByLabelText("이 버전에 의견 남기기");
    expect((screen.getByRole("button", { name: "의견 저장" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText("완료 기한") as HTMLInputElement).value).toBe("2026-10-21T14:30");
    expect(f.create).not.toHaveBeenCalled();
  });
  it("requires a new explicit save when the review lease expires during a delayed assignee check", async () => {
    await draft(); let finish!: (value: StudioTeamSnapshot) => void;
    f.team.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })); save();
    await waitFor(() => expect(f.team).toHaveBeenCalledTimes(2));
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now + 20_000);
    await act(async () => { finish(team()); });
    await screen.findByText(/권한 확인 시간이 지났어요/u);
    expect(f.create).not.toHaveBeenCalled();
  });
  it("hides roster names when renewal stalls past expiry while retaining selected IDs and deadline draft", async () => {
    await draft(); vi.useFakeTimers();
    // Start a roster lease under the controlled clock.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "배정 가능한 팀원 확인" })); });
    f.team.mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => { vi.advanceTimersByTime(10_000); });
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByRole("checkbox", { name: "Owner" })).toBeNull();
    expect(screen.getByText("담당자 2명 선택")).toBeTruthy();
    expect((screen.getByLabelText("완료 기한") as HTMLInputElement).value).toBe("2026-10-21T14:30");
  });
});
