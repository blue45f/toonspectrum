// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioWorkspaceInbox } from "./StudioWorkspaceInbox";
import { createEmptyProductionWorkspace } from "../studio-production/studio-production-workspace-runtime";

const f = vi.hoisted(() => ({ actor: "host", revision: 1, listeners: new Set<() => void>(), load: vi.fn(), reviews: vi.fn() }));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => ({ data: { user: { id: f.actor } }, ready: true }) }));
vi.mock("@/compat/auth-session-state", () => ({ getAuthSessionRevision: () => f.revision, getAuthUserId: () => f.actor, listeners: f.listeners }));
vi.mock("../studio-production/studio-production-server-client", () => ({ loadStudioServerProductionWorkspace: f.load }));
vi.mock("../virtual-space/studio-virtual-space-review-invitation", () => ({ listStudioVirtualSpaceReviewSubjects: f.reviews, studioVirtualSpaceReviewHref: () => "/review-fixture" }));
vi.mock("../handoff-envelope/StudioHandoffEnvelope", () => ({ StudioHandoffEnvelopeInbox: () => <div>Separate handoff boundary</div> }));
vi.mock("@/compat/router-link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
beforeEach(() => {
  f.actor = "host"; f.revision = 1; f.listeners.clear(); f.load.mockReset(); f.reviews.mockReset();
  f.load.mockResolvedValue({ workId: "work", revision: 1, capabilities: { view: true }, document: { ...createEmptyProductionWorkspace("work:work"),
    tasks: [{ id: "task", title: "실제 담당 작업", owner: "", due: "2026-10-01", status: "todo", progress: 0, assigneeIds: ["host"] }] } });
  f.reviews.mockResolvedValue({ ok: true, choices: [], truncated: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("shows verified actual assignments without writing or fabricating counts", async () => {
  render(<StudioWorkspaceInbox workId="work" />);
  expect(await screen.findByText("실제 담당 작업")).toBeTruthy(); expect(f.load).toHaveBeenCalledOnce(); expect(f.reviews).toHaveBeenCalledOnce();
});
it("clears private projections on session invalidation without waiting for another fetch", async () => {
  render(<StudioWorkspaceInbox workId="work" />); await screen.findByText("실제 담당 작업");
  act(() => { ++f.revision; f.listeners.forEach((listener) => listener()); });
  expect(screen.queryByText("실제 담당 작업")).toBeNull();
});
it("expires previously verified data without automatically issuing repeated API reads", async () => {
  vi.useFakeTimers();
  await act(async () => { render(<StudioWorkspaceInbox workId="work" />); });
  expect(screen.getByText("실제 담당 작업")).toBeTruthy();
  await act(async () => { vi.advanceTimersByTime(15_001); });
  expect(screen.queryByText("실제 담당 작업")).toBeNull();
  expect(screen.getByText(/권한 확인 유효 시간이 지났습니다/u)).toBeTruthy(); expect(f.load).toHaveBeenCalledOnce();
});
it("does not admit a late response from a previous authenticated context", async () => {
  let finish!: (value: unknown) => void; f.load.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<StudioWorkspaceInbox workId="work" />);
  act(() => { f.actor = "another"; ++f.revision; f.listeners.forEach((listener) => listener()); });
  await act(async () => { finish({ capabilities: { view: true }, document: { tasks: [{ title: "이전 계정 비밀" }] } }); });
  expect(screen.queryByText("이전 계정 비밀")).toBeNull();
});
