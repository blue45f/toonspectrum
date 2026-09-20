// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { persistSession } from "@/compat/auth-session-state";
import type { StudioTeamSnapshot } from "../studio-team-client";
import { StudioPinnedReviewPanel } from "./StudioPinnedReviewPanel";
import type { StudioVirtualSpaceReviewVerification } from "./studio-virtual-space-review-invitation";

const f = vi.hoisted(() => ({ actor: "actor-a", verify: vi.fn(), team: vi.fn() }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: f.actor } } }) }));
vi.mock("../studio-team-client", () => ({ getStudioTeam: f.team }));
vi.mock("./studio-virtual-space-review-invitation", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-virtual-space-review-invitation")>(), verifyStudioVirtualSpaceReviewSubject: f.verify,
}));
vi.mock("./StudioPinnedReviewPreview", () => ({ StudioPinnedReviewPreview: () => null }));
vi.mock("./StudioPinnedReviewComparison", () => ({ StudioPinnedReviewComparison: () => null }));
vi.mock("./StudioPinnedReviewWorkflow", () => ({ StudioPinnedReviewWorkflow: () => null }));
const subject = { schemaVersion: 1 as const, workId: "work-a", projectId: "graph-a", artifactId: "artifact-a", reviewId: "review-a", revisionId: "snapshot-a", rootGraphHash: "a".repeat(64) };
function verified({ edit = true, comment = true, source = false, ids = ["editor-id"] }: { edit?: boolean; comment?: boolean; source?: boolean; ids?: string[] } = {}): StudioVirtualSpaceReviewVerification {
  const anchor = { kind: source ? "panel" : "artifact", artifactId: subject.artifactId, revisionId: subject.revisionId, scope: { projectId: subject.projectId },
    ...(source ? { source: { version: 1, sourceServerRevision: 7, sourceContentDigest: subject.rootGraphHash, pageOrdinal: 0, pageId: "private-page-id", frameId: "private-frame-id" } } : {}) };
  return { ok: true, subject, verifiedAt: Date.now(), expiresAt: Date.now() + 15_000, href: "/pinned",
    project: { access: { view: true, comment, edit }, artifacts: [{ id: subject.artifactId, scope: { projectId: subject.projectId } }] },
    review: { title: "Pinned version", status: "open", comments: [
      { id: "note-source", body: "First private note", severity: "required", status: "open", assigneeIds: ids, anchor },
      { id: "note-other", body: "Second private note", severity: "note", status: "open", assigneeIds: ids, anchor: { ...anchor, source: undefined, kind: "artifact" } },
    ] }, revision: { id: subject.revisionId } } as unknown as StudioVirtualSpaceReviewVerification;
}
function team(name = "Current editor"): StudioTeamSnapshot { return {
  workId: subject.workId, viewer: { userId: f.actor, role: "commenter", status: "active", capabilities: {
    view: true, comment: true, edit: false, manageMembers: false, respondInvite: false,
  } }, members: [{ userId: "editor-id", name, image: "", role: "editor", status: "active", isOwner: false }],
}; }
function Location() { return <output aria-label="Current route">{useLocation().pathname}</output>; }
const panel = () => <MemoryRouter initialEntries={["/review"]}><StudioPinnedReviewPanel subject={subject} /><Location /></MemoryRouter>;
beforeEach(() => {
  f.actor = "actor-a"; persistSession({ user: { id: f.actor }, token: null });
  f.verify.mockReset().mockImplementation(async () => verified()); f.team.mockReset().mockImplementation(async () => team());
});
afterEach(() => { cleanup(); persistSession(null); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Pinned review shared assignee names and editor link", () => {
  it("shares one current roster between several saved notes and the picker, without showing unverified raw IDs", async () => {
    let done!: (value: StudioTeamSnapshot) => void;
    f.team.mockReturnValueOnce(new Promise((resolve) => { done = resolve; })); render(panel());
    await screen.findByText("First private note");
    expect(f.team).toHaveBeenCalledOnce(); expect(screen.queryByText(/editor-id/u)).toBeNull();
    expect(screen.getAllByText(/현재 확인할 수 없는 담당자/u)).toHaveLength(2);
    await act(async () => done(team()));
    for (const article of screen.getAllByRole("article")) expect(within(article).getByText("담당자 · Current editor")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Current editor" })).toBeTruthy();
    expect(f.team).toHaveBeenCalledOnce();
  });
  it("shows meaningful fallbacks for removed users and the team's ID-as-name fallback", async () => {
    f.verify.mockImplementation(async () => verified({ ids: ["removed-user-id", "editor-id"] })); f.team.mockResolvedValueOnce(team("editor-id"));
    render(panel()); await screen.findByText("First private note"); await act(async () => { await Promise.resolve(); });
    for (const article of screen.getAllByRole("article")) {
      expect(article.textContent).not.toContain("removed-user-id"); expect(article.textContent).not.toContain("editor-id");
      expect(article.textContent).toContain("현재 확인할 수 없는 담당자");
    }
  });
  it("lets a current viewer see verified historical assignee names without assignment controls", async () => {
    f.verify.mockImplementation(async () => verified({ edit: false, comment: false }));
    const value = team(); value.viewer.role = "viewer"; value.viewer.capabilities.comment = false; f.team.mockResolvedValueOnce(value);
    render(panel()); await screen.findAllByText("담당자 · Current editor");
    expect(screen.queryByRole("checkbox")).toBeNull(); expect(screen.queryByRole("textbox")).toBeNull();
  });
  it("renews names during drafting without repeated manual clicks, preserving selected user IDs and deadline", async () => {
    vi.useFakeTimers(); render(panel()); await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("checkbox", { name: "Current editor" }));
    fireEvent.change(screen.getByLabelText("완료 기한"), { target: { value: "2026-10-21T14:30" } });
    fireEvent.change(screen.getByLabelText("이 버전에 의견 남기기"), { target: { value: "Draft stays here" } });
    for (let i = 0; i < 3; i++) {
      f.team.mockResolvedValueOnce(team(`Editor name ${i}`));
      await act(async () => vi.advanceTimersByTime(10_000));
      expect((screen.getByRole("checkbox", { name: `Editor name ${i}` }) as HTMLInputElement).checked).toBe(true);
    }
    expect(f.team).toHaveBeenCalledTimes(4);
    expect((screen.getByLabelText("완료 기한") as HTMLInputElement).value).toBe("2026-10-21T14:30");
    expect((screen.getByLabelText("이 버전에 의견 남기기") as HTMLTextAreaElement).value).toBe("Draft stays here");
  });
  it("clears saved-note and picker names together on denied renewal while preserving the draft selection", async () => {
    vi.useFakeTimers(); render(panel()); await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("checkbox", { name: "Current editor" }));
    f.team.mockRejectedValueOnce(new Error("403")); await act(async () => vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("checkbox")).toBeNull(); expect(screen.queryByText(/Current editor/u)).toBeNull();
    expect(screen.getAllByText(/현재 확인할 수 없는 담당자/u)).toHaveLength(2);
    expect(screen.getByText("담당자 1명 선택")).toBeTruthy();
  });
  it.each([{ edit: false, source: true }, { edit: true, source: false }])("omits editor handoff unless both edit permission and a source anchor exist (%j)", async (options) => {
    f.verify.mockImplementation(async () => verified(options)); render(panel()); await screen.findByText("First private note");
    expect(screen.queryByRole("link", { name: "편집기에서 의견 위치 확인" })).toBeNull();
  });
  it("renders the actual explicit editor link using stable identity only and does not navigate on arrival", async () => {
    f.verify.mockImplementation(async () => verified({ source: true })); render(panel());
    const link = await screen.findByRole("link", { name: "편집기에서 의견 위치 확인" });
    const href = link.getAttribute("href")!;
    expect(href).toContain("reviewComment=note-source"); expect(href).toContain("snapshot-a");
    expect(href).not.toContain("private-page-id"); expect(href).not.toContain("private-frame-id"); expect(href).not.toContain("First%20private");
    expect(screen.getByLabelText("Current route").textContent).toBe("/review");
    expect(screen.getAllByRole("link", { name: "편집기에서 의견 위치 확인" })).toHaveLength(1);
  });
});
