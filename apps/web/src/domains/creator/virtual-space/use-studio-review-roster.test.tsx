// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import type { StudioTeamSnapshot } from "../studio-team-client";
import { studioReviewRosterName, useStudioReviewRoster } from "./use-studio-review-roster";

const f = vi.hoisted(() => ({ team: vi.fn() }));
vi.mock("../studio-team-client", () => ({ getStudioTeam: f.team }));
function team(name = "Current editor", actor = "actor-a", workId = "work-a"): StudioTeamSnapshot {
  return { workId, viewer: { userId: actor, role: "commenter", status: "active", capabilities: {
    view: true, comment: true, edit: false, manageMembers: false, respondInvite: false,
  } }, members: [{ userId: "editor-id", name, image: "", role: "editor", status: "active", isOwner: false }] };
}
const base = { actorId: "actor-a", workId: "work-a", enabled: true, autoStart: true };
function deferred() { let resolve!: (value: StudioTeamSnapshot) => void; const promise = new Promise<StudioTeamSnapshot>((done) => { resolve = done; }); return { promise, resolve }; }
const flush = () => act(async () => { await Promise.resolve(); });
beforeEach(() => { vi.useFakeTimers(); persistSession({ user: { id: "actor-a" }, token: null }); f.team.mockReset().mockImplementation(async () => team()); });
afterEach(() => { cleanup(); persistSession(null); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Shared review roster permission lease", () => {
  it("starts only on request, joins repeated refreshes, and automatically renews before expiry", async () => {
    const { result } = renderHook(() => useStudioReviewRoster({ ...base, autoStart: false }));
    expect(f.team).not.toHaveBeenCalled();
    const first = deferred(); f.team.mockReturnValueOnce(first.promise);
    act(() => result.current.refresh()); act(() => { result.current.refresh(); result.current.refresh(); });
    expect(f.team).toHaveBeenCalledOnce();
    await act(async () => first.resolve(team()));
    expect(studioReviewRosterName(result.current, "editor-id")).toBe("Current editor");
    f.team.mockResolvedValueOnce(team("Updated name"));
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(f.team).toHaveBeenCalledTimes(2);
    expect(studioReviewRosterName(result.current, "editor-id")).toBe("Updated name");
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(result.current.members).not.toBeNull();
  });
  it("keeps the original deadline during a stalled renewal and rejects its response after expiry", async () => {
    const { result } = renderHook(() => useStudioReviewRoster(base)); await flush();
    const renewal = deferred(); f.team.mockReturnValueOnce(renewal.promise);
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(studioReviewRosterName(result.current, "editor-id")).toBe("Current editor");
    const signal = f.team.mock.calls[1]![1] as AbortSignal;
    await act(async () => vi.advanceTimersByTime(5_000));
    expect(result.current.members).toBeNull(); expect(signal.aborted).toBe(true);
    await act(async () => renewal.resolve(team("Too late")));
    expect(result.current.members).toBeNull(); expect(result.current.status).toBe("failed");
  });
  it.each(["403", "network failure"])("clears immediately on %s instead of retaining names until the old deadline", async (reason) => {
    const { result } = renderHook(() => useStudioReviewRoster(base)); await flush();
    f.team.mockRejectedValueOnce(new Error(reason)); await act(async () => vi.advanceTimersByTime(10_000));
    expect(result.current.members).toBeNull(); expect(result.current.candidates).toBeNull();
    await act(async () => { result.current.refresh(); });
    expect(studioReviewRosterName(result.current, "editor-id")).toBe("Current editor");
  });
  it("hides and aborts while backgrounded, then performs a fresh read when visible", async () => {
    const { result } = renderHook(() => useStudioReviewRoster(base)); await flush();
    const waiting = deferred(); f.team.mockReturnValueOnce(waiting.promise);
    act(() => result.current.refresh()); const signal = f.team.mock.calls[1]![1] as AbortSignal;
    const visibility = vi.spyOn(document, "visibilityState", "get");
    act(() => { visibility.mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange")); });
    expect(result.current.members).toBeNull(); expect(signal.aborted).toBe(true);
    await act(async () => waiting.resolve(team("Hidden response"))); expect(result.current.members).toBeNull();
    await act(async () => vi.advanceTimersByTime(30_000)); expect(f.team).toHaveBeenCalledTimes(2);
    await act(async () => { visibility.mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange")); });
    expect(f.team).toHaveBeenCalledTimes(3); expect(studioReviewRosterName(result.current, "editor-id")).toBe("Current editor");
  });
  it("fences actor publication before prop rerender and never resurrects the prior actor's pending names", async () => {
    const { result, rerender } = renderHook((props) => useStudioReviewRoster(props), { initialProps: base }); await flush();
    const waiting = deferred(); f.team.mockReturnValueOnce(waiting.promise); act(() => result.current.refresh());
    act(() => persistSession({ user: { id: "actor-b" }, token: null }));
    expect(result.current.members).toBeNull(); expect(f.team).toHaveBeenCalledTimes(2);
    const next = deferred(); f.team.mockReturnValueOnce(next.promise); rerender({ ...base, actorId: "actor-b" });
    expect(result.current.members).toBeNull();
    await act(async () => waiting.resolve(team("Private A"))); expect(result.current.members).toBeNull();
    await act(async () => next.resolve(team("Visible B", "actor-b")));
    expect(studioReviewRosterName(result.current, "editor-id")).toBe("Visible B");
  });
  it("refreshes same-actor session publication without accepting a previous session response", async () => {
    const { result } = renderHook(() => useStudioReviewRoster(base)); await flush();
    const before = deferred(), after = deferred(); f.team.mockReturnValueOnce(before.promise).mockReturnValueOnce(after.promise);
    act(() => result.current.refresh()); act(() => persistSession({ user: { id: "actor-a" }, token: null }));
    expect(result.current.members).toBeNull();
    await act(async () => before.resolve(team("Old session"))); expect(result.current.members).toBeNull();
    await act(async () => after.resolve(team("Renewed session")));
    expect(studioReviewRosterName(result.current, "editor-id")).toBe("Renewed session");
  });
  it("does not reuse old names when scope or enabled permission changes", async () => {
    const { result, rerender } = renderHook((props) => useStudioReviewRoster(props), { initialProps: base }); await flush();
    rerender({ ...base, enabled: false }); expect(result.current.members).toBeNull();
    const waiting = deferred(); f.team.mockReturnValueOnce(waiting.promise); rerender(base);
    expect(result.current.members).toBeNull(); await act(async () => waiting.resolve(team()));
    const other = deferred(); f.team.mockReturnValueOnce(other.promise); rerender({ ...base, workId: "work-b" });
    expect(result.current.members).toBeNull(); await act(async () => other.resolve(team("Work B", "actor-a", "work-b")));
    expect(studioReviewRosterName(result.current, "editor-id")).toBe("Work B");
  });
  it.each(["actor", "work", "view", "membership"])("rejects an invalid %s authority response", async (reason) => {
    const value = team(); if (reason === "actor") value.viewer.userId = "another-actor";
    if (reason === "work") value.workId = "another-work";
    if (reason === "view") value.viewer.capabilities.view = false;
    if (reason === "membership") value.viewer.status = "pending";
    f.team.mockResolvedValueOnce(value);
    const { result } = renderHook(() => useStudioReviewRoster(base)); await flush();
    expect(result.current.members).toBeNull(); expect(result.current.status).toBe("failed");
  });
  it("allows current viewers to read names without creating assignment candidates or exposing ID fallbacks", async () => {
    const value = team("editor-id"); value.viewer.role = "viewer"; value.viewer.capabilities.comment = false;
    f.team.mockResolvedValueOnce(value); const { result } = renderHook(() => useStudioReviewRoster(base)); await flush();
    expect(result.current.members).toHaveLength(1); expect(result.current.candidates).toEqual([]);
    expect(studioReviewRosterName(result.current, "editor-id")).toBeNull(); expect(studioReviewRosterName(result.current, "missing-id")).toBeNull();
  });
  it("bounds an initial read and cancels all renewal work on unmount", async () => {
    const waiting = deferred(); f.team.mockReturnValueOnce(waiting.promise);
    const { result, unmount } = renderHook(() => useStudioReviewRoster(base));
    const signal = f.team.mock.calls[0]![1] as AbortSignal;
    await act(async () => vi.advanceTimersByTime(15_000)); expect(signal.aborted).toBe(true); expect(result.current.status).toBe("failed");
    await act(async () => waiting.resolve(team())); expect(result.current.members).toBeNull();
    await act(async () => { result.current.refresh(); }); expect(result.current.members).not.toBeNull();
    unmount(); await act(async () => vi.advanceTimersByTime(60_000)); expect(f.team).toHaveBeenCalledTimes(2);
  });
});
