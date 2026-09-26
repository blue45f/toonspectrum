// @vitest-environment jsdom
import { initialOperationPolicy, resolveOperationPolicy } from "@toonspectrum/contracts/operation-policy";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FREE_USAGE_POLICY } from "@toonspectrum/contracts/production-workspace";
import { TeamWorkspacePage, TeamWorkspaceJoinPage } from "./TeamWorkspacePage";
import { saveCollaborationOnboarding } from "@/shared/lib/collaboration-onboarding";

const mocks = vi.hoisted(() => ({ userId: "owner" as string | null,
  list: vi.fn(), detail: vi.fn(), usage: vi.fn(), create: vi.fn(), command: vi.fn(), accept: vi.fn(), projects: vi.fn(), operation: vi.fn(), projectInvite: vi.fn() }));
vi.mock("@/shared/lib/store", () => ({ useApp: () => mocks.userId }));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: async (_error: unknown, fallback: string) => fallback }));
vi.mock("./team-workspace-api", () => ({ getEffectiveOperationPolicy: mocks.operation, listTeamWorkspaces: mocks.list, getTeamWorkspace: mocks.detail,
  getTeamUsage: mocks.usage, createTeamWorkspace: mocks.create, commandTeamWorkspace: mocks.command, acceptTeamInvite: mocks.accept }));
vi.mock("./production-dashboard-api", () => ({ listProductionProjects: mocks.projects }));
vi.mock("../studio-team-client", () => ({ inviteStudioTeamMember: mocks.projectInvite }));
const workspace = { id: "team-a", name: "비공개 검수 팀", ownerUserId: "owner", role: "owner", revision: 3,
  createdAt: "2026-09-22T00:00:00Z", projectCount: 1, memberCount: 1, pendingInvites: 0 };
function App({ path = "/production/workspaces" }: { path?: string }) {
  return <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/production/workspaces" element={<TeamWorkspacePage />} />
    <Route path="/production/workspaces/join" element={<TeamWorkspaceJoinPage />} />
    <Route path="/production/workspaces/:workspaceId" element={<TeamWorkspacePage />} />
    <Route path="/team/people" element={<TeamWorkspacePage />} />
    <Route path="/team/people/join" element={<TeamWorkspaceJoinPage />} />
    <Route path="/team/people/:workspaceId" element={<TeamWorkspacePage />} />
    <Route path="/studio/p/:projectId/space" element={<p>project-space-destination</p>} />
    <Route path="/team" element={<p>team-lobby-destination</p>} />
    <Route path="/collaborate/workspace" element={<p>interview-waiting-destination</p>} />
    <Route path="/team/recruiting" element={<p>interview-waiting-destination</p>} />
  </Routes></MemoryRouter>;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.userId = "owner"; sessionStorage.clear();
  mocks.operation.mockResolvedValue(resolveOperationPolicy({ revision: 0, draft: initialOperationPolicy(), updatedAt: "2026-09-22T00:00:00Z" }, null, new Date()));
  mocks.list.mockResolvedValue({ workspaces: [workspace] });
  mocks.detail.mockResolvedValue({ workspace, projects: [{ id: "project-a", workId: "work-a", title: "검수 원고" }],
    members: [{ userId: "owner", displayName: "소유자", role: "owner", joinedAt: workspace.createdAt }], invites: [] });
  mocks.usage.mockResolvedValue({ policy: FREE_USAGE_POLICY, workspaceId: workspace.id, operationMode: "free", policyRevision: 0,
    counters: { ownedWorkspaces: 1, projects: 1, members: 1, pendingInvites: 0 },
    originalStorage: { status: "not-instrumented", usedBytes: null }, externalAiEnabled: false,
    meteredProvidersEnabled: false, nextDailyResetAt: "2026-09-22T15:00:00Z" });
  mocks.projects.mockResolvedValue({ projects: [] });
});
afterEach(() => { cleanup(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); });
describe("free team workspace UI", () => {
  it("does not fetch private team data when signed out", () => {
    mocks.userId = null; render(<App />);
    expect(screen.getByRole("heading", { name: "로그인이 필요합니다" })).toBeTruthy();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("creates a real team through the API without a checkout step", async () => {
    mocks.create.mockResolvedValue({ workspaceId: "team-a", revision: 0 });
    render(<App />); await screen.findByText("비공개 검수 팀");
    fireEvent.change(screen.getByLabelText("새 워크스페이스 이름"), { target: { value: "새 작업 팀" } });
    fireEvent.click(screen.getByRole("button", { name: "워크스페이스 만들기" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("새 작업 팀"));
    await screen.findByRole("heading", { name: "사용량과 공통 이용 한도" });
    expect(screen.queryByText("Pro 업그레이드")).toBeNull();
    expect(screen.getByText(/미측정 사용량을 0으로 표시하지/)).toBeTruthy();
  });
  it("passes a pinned revision on invite and accurately says email was not sent", async () => {
    mocks.command.mockResolvedValue({ workspaceId: "team-a", revision: 4, invitationId: "invite-a", token: "a".repeat(43), delivery: "manual-link" });
    render(<App path="/production/workspaces/team-a" />);
    await screen.findByRole("heading", { name: "구성원 초대" });
    fireEvent.change(screen.getByLabelText("초대받을 이메일"), { target: { value: "artist@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("team-a", 3, { type: "invite", email: "artist@example.test", role: "member" }));
    await screen.findByText(/이메일은 발송되지 않았습니다/);
    const value = (screen.getByLabelText("새 초대 링크") as HTMLInputElement).value;
    expect(value).toContain("#invite=");
    expect(value).toContain("entry=team-lobby");
  });
  it("prefills the real workspace invite from a least-privileged production role preset", async () => {
    mocks.command.mockResolvedValue({ workspaceId: "team-a", revision: 4, invitationId: "invite-a", token: "a".repeat(43), delivery: "manual-link" });
    render(<App path="/production/workspaces/team-a?rolePreset=external-reviewer" />);
    await screen.findByRole("heading", { name: "구성원 초대" });
    expect(screen.getByRole("button", { name: "외부 검토자" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("초대 역할") as HTMLSelectElement).value).toBe("guest");
    expect(screen.getByText(/원본 다운로드/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("초대받을 이메일"), { target: { value: "reviewer@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("team-a", 3, { type: "invite", email: "reviewer@example.test", role: "guest" }));
  });
  it("adds a project-space hint without changing the authoritative invite command", async () => {
    mocks.command.mockResolvedValue({ workspaceId: "team-a", revision: 4, invitationId: "invite-a", token: "a".repeat(43), delivery: "manual-link" });
    render(<App path="/production/workspaces/team-a" />);
    await screen.findByRole("heading", { name: "구성원 초대" });
    fireEvent.change(screen.getByLabelText("초대받을 이메일"), { target: { value: "artist@example.test" } });
    fireEvent.change(screen.getByLabelText("수락 후 입장 안내"), { target: { value: "project-space" } });
    fireEvent.change(screen.getByLabelText("입장할 프로젝트"), { target: { value: "work-a" } });
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 만들기" }));
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("team-a", 3, { type: "invite", email: "artist@example.test", role: "member" }));
    const value = (await screen.findByLabelText("새 초대 링크") as HTMLInputElement).value;
    expect(value).toContain("entry=project-space");
    expect(value).toContain("project=work-a");
  });
  it("continues a selected applicant through team invite, project access, and first task", async () => {
    saveCollaborationOnboarding(sessionStorage, {
      postId: "post-a",
      applicationId: "application-a",
      candidateUserId: "candidate-a",
      candidateName: "지원자",
      candidateContact: "candidate@example.test",
    });
    mocks.command.mockResolvedValue({ workspaceId: "team-a", revision: 4, invitationId: "invite-a", token: "a".repeat(43), delivery: "manual-link" });
    mocks.projectInvite.mockResolvedValue({});

    render(<App path="/team/people/team-a?onboard=application-a" />);

    await screen.findByRole("heading", { name: "지원자 님 프로젝트 합류" });
    expect((screen.getByLabelText("초대 이메일") as HTMLInputElement).value).toBe("candidate@example.test");
    expect((screen.getByLabelText("대상 작품") as HTMLSelectElement).value).toBe("work-a");
    expect((screen.getByLabelText("작품 권한") as HTMLSelectElement).value).toBe("editor");

    fireEvent.click(screen.getByRole("button", { name: "1. 팀 초대 링크 만들기" }));
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("team-a", 3, {
      type: "invite",
      email: "candidate@example.test",
      role: "member",
    }));
    const invitation = (await screen.findByLabelText("새 초대 링크") as HTMLInputElement).value;
    expect(invitation).toContain("/team/people/join#invite=");
    expect(invitation).toContain("entry=project-space");

    fireEvent.click(screen.getByRole("button", { name: "2. 작품 권한 초대" }));
    await waitFor(() => expect(mocks.projectInvite).toHaveBeenCalledWith("work-a", {
      identity: "candidate-a",
      role: "editor",
    }));
    expect(await screen.findByRole("button", { name: "2. 작품 권한 초대 완료" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "3. 첫 작업 배정" }).getAttribute("href"))
      .toBe("/production/projects/project-a/production");
  });

  it("does not render private team state after switching to signed out", async () => {
    const view = render(<App path="/production/workspaces/team-a" />);
    await screen.findByRole("heading", { name: "비공개 검수 팀" });
    mocks.userId = null; view.rerender(<App path="/production/workspaces/team-a" />);
    expect(screen.queryByText("비공개 검수 팀")).toBeNull();
    expect(screen.queryByText("검수 원고")).toBeNull();
  });
  it("removes an invitation fragment before accepting and never puts it in a query", async () => {
    window.history.replaceState({}, "", `/production/workspaces/join#invite=${"b".repeat(43)}`);
    mocks.accept.mockResolvedValue({ workspaceId: "team-a", revision: 4 });
    render(<App path="/production/workspaces/join" />);
    await waitFor(() => expect(window.location.hash).toBe(""));
    expect(window.location.search).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하기" }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith("b".repeat(43)));
    await screen.findByText("team-lobby-destination");
  });
});
