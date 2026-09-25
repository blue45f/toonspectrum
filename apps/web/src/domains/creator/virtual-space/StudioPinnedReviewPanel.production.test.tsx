// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";

import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import { reviewProductionFixture } from "../review-production/studio-review-production-test-fixture";
import { StudioPinnedReviewPanel } from "./StudioPinnedReviewPanel";

const io = vi.hoisted(() => ({ verify: vi.fn(), workspace: vi.fn(), team: vi.fn(), save: vi.fn(), create: vi.fn() }));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: "actor" } } }) }));
vi.mock("../studio-team-client", () => ({ getStudioTeam: io.team }));
vi.mock("./studio-virtual-space-review-invitation", () => ({ verifyStudioVirtualSpaceReviewSubject: io.verify }));
vi.mock("../studio-production/studio-production-server-client", async (original) => ({ ...await original<object>(),
  loadStudioServerProductionWorkspace: io.workspace, saveStudioServerProductionWorkspace: io.save }));
vi.mock("../project-graph/studio-project-graph-client", () => ({ createStudioReviewComment: io.create, newStudioProjectGraphId: () => "unused-comment" }));
vi.mock("./StudioPinnedReviewPreview", () => ({ StudioPinnedReviewPreview: () => null }));
vi.mock("./StudioPinnedReviewComparison", () => ({ StudioPinnedReviewComparison: () => null }));
vi.mock("./StudioPinnedReviewWorkflow", () => ({ StudioPinnedReviewWorkflow: () => null }));
const renderUi = (element: ReactElement) => render(element, { wrapper: MemoryRouter });
let f = reviewProductionFixture();
beforeEach(() => {
  f = reviewProductionFixture(); vi.clearAllMocks(); persistSession({ user: { id: "actor" }, token: null });
  io.verify.mockReset().mockImplementation(async () => ({ ...f.verified, verifiedAt: Date.now(), expiresAt: Date.now() + 15_000 }));
  io.workspace.mockReset().mockImplementation(async () => f.authority.workspace); io.team.mockReset().mockImplementation(async () => f.authority.team);
  io.save.mockReset().mockImplementation(async (_work, _base, document) => ({ ...f.authority.workspace, document }));
});
afterEach(() => { cleanup(); persistSession(null); });
describe("pinned review saved comment production integration", () => {
  it("connects the displayed saved comment through the actual form, without creating another comment", async () => {
    renderUi(<StudioPinnedReviewPanel subject={f.request.subject} />); await screen.findByText(f.authority.comment.body);
    expect(io.workspace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "제작 작업에 연결" }));
    fireEvent.change(await screen.findByLabelText("기존 제작 작업"), { target: { value: "task" } });
    fireEvent.change(screen.getByRole("combobox", { name: "제작 역할 · 선화 작가" }), { target: { value: "role-editor" } });
    fireEvent.click(screen.getByRole("button", { name: "선택한 작업에 연결" })); await screen.findByText(/제작 작업에 연결했어요/u);
    expect(io.save).toHaveBeenCalledOnce(); expect(io.save.mock.calls[0]?.[2].tasks[0].reviewRef).toEqual({ ...f.request, handoffId: null });
    expect(io.create).not.toHaveBeenCalled();
  });
  it("does not expose editing actions to a commenter or an unsaved note", async () => {
    f = { ...f, verified: { ...f.verified, project: { ...f.verified.project, access: { ...f.verified.project.access, edit: false } } } };
    renderUi(<StudioPinnedReviewPanel subject={f.request.subject} />); await screen.findByText(f.authority.comment.body);
    expect(screen.queryByRole("button", { name: "제작 작업에 연결" })).toBeNull();
    fireEvent.change(screen.getByLabelText("이 버전에 의견 남기기"), { target: { value: "Unsaved draft" } });
    expect(io.workspace).not.toHaveBeenCalled(); expect(io.save).not.toHaveBeenCalled(); expect(io.create).not.toHaveBeenCalled();
  });
  it("unmounts private production choices when the parent review loses access", async () => {
    renderUi(<StudioPinnedReviewPanel subject={f.request.subject} />); await screen.findByText(f.authority.comment.body);
    fireEvent.click(screen.getByRole("button", { name: "제작 작업에 연결" })); await screen.findByLabelText("기존 제작 작업");
    io.verify.mockResolvedValue({ ok: false, reason: "access-denied" });
    fireEvent.click(screen.getByRole("button", { name: "검토 기록 새로 확인" }));
    await screen.findByRole("alert"); expect(screen.queryByLabelText("기존 제작 작업")).toBeNull(); expect(io.save).not.toHaveBeenCalled();
  });
});
