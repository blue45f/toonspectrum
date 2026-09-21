// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSessionEvidence } from "./use-session-evidence";
import { evidenceTestResponse, evidenceTestView } from "./studio-session-evidence.test-fixture";

const mocks = vi.hoisted(() => ({ load: vi.fn(), revision: 0, listeners: new Set<(session: { user: { id: string } } | null) => void>() }));
vi.mock("./studio-session-evidence-client", () => ({ getStudioSessionEvidence: mocks.load }));
vi.mock("@/infrastructure/api", () => ({ httpStatus: (error: { status?: number }) => error.status }));
vi.mock("@/compat/auth-session-state", () => ({ getAuthSessionRevision: () => mocks.revision, listeners: mocks.listeners }));
const session = evidenceTestView().session;
beforeEach(() => { vi.useFakeTimers(); mocks.load.mockReset(); mocks.listeners.clear(); mocks.revision = 0; Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("does not read while collapsed and cancels pending requests on collapse", async () => {
  let resolve!: (v: ReturnType<typeof evidenceTestResponse>) => void;
  mocks.load.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result, rerender } = renderHook(({ enabled }) => useSessionEvidence(session, "host", enabled, vi.fn()), { initialProps: { enabled: false } });
  expect(mocks.load).not.toHaveBeenCalled(); rerender({ enabled: true }); expect(mocks.load).toHaveBeenCalledOnce();
  const signal = mocks.load.mock.calls[0]![4] as AbortSignal;
  rerender({ enabled: false }); expect(signal.aborted).toBe(true);
  await act(async () => resolve(evidenceTestResponse())); expect(result.current.value).toBeNull(); expect(mocks.listeners.size).toBe(0);
});
it("expires and refreshes the lease without persisting metadata", async () => {
  mocks.load.mockResolvedValueOnce(evidenceTestResponse()).mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() => useSessionEvidence(session, "host", true, vi.fn()));
  await act(async () => {}); expect(result.current.value).not.toBeNull();
  await act(async () => { vi.advanceTimersByTime(15001); }); expect(result.current.value).toBeNull(); expect(mocks.load).toHaveBeenCalledTimes(2);
});
it("drops late responses after a deadline and offers retry rather than success", async () => {
  let resolve!: (v: ReturnType<typeof evidenceTestResponse>) => void;
  mocks.load.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result } = renderHook(() => useSessionEvidence(session, "host", true, vi.fn()));
  await act(async () => vi.advanceTimersByTime(10001)); expect(result.current.failed).toBe(true);
  await act(async () => resolve(evidenceTestResponse())); expect(result.current.value).toBeNull();
});
it("clears private data on hide and refreshes on return, including mounting while hidden", async () => {
  mocks.load.mockImplementation(async () => evidenceTestResponse());
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  const { result } = renderHook(() => useSessionEvidence(session, "host", true, vi.fn()));
  expect(mocks.load).not.toHaveBeenCalled();
  await act(async () => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  expect(result.current.value).not.toBeNull();
  act(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  expect(result.current.value).toBeNull();
});
it.each([null, { user: { id: "another" } }])("invalidates on logout or a different actor and never republishes a late result", async (next) => {
  let resolve!: (v: ReturnType<typeof evidenceTestResponse>) => void; const revoked = vi.fn();
  mocks.load.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result } = renderHook(() => useSessionEvidence(session, "host", true, revoked));
  act(() => { mocks.revision++; mocks.listeners.forEach((listener) => listener(next)); });
  await act(async () => resolve(evidenceTestResponse())); expect(result.current.value).toBeNull(); expect(revoked).toHaveBeenCalledOnce();
});
it("reconciles a same-actor cookie refresh with a new request, not the old result", async () => {
  let resolve!: (v: ReturnType<typeof evidenceTestResponse>) => void;
  mocks.load.mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockResolvedValueOnce(evidenceTestResponse());
  const { result } = renderHook(() => useSessionEvidence(session, "host", true, vi.fn()));
  await act(async () => { mocks.revision++; mocks.listeners.forEach((listener) => listener({ user: { id: "host" } })); });
  expect(mocks.load).toHaveBeenCalledTimes(2);
  const value = result.current.value; await act(async () => resolve({ ...evidenceTestResponse(), evidence: null })); expect(result.current.value).toBe(value);
});
it("fences old-session and old-page responses and removes subscriptions on unmount", async () => {
  let resolve!: (v: ReturnType<typeof evidenceTestResponse>) => void;
  mocks.load.mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockImplementation(() => new Promise(() => {}));
  const { result, rerender, unmount } = renderHook(({ value }) => useSessionEvidence(value, "host", true, vi.fn()), { initialProps: { value: session } });
  rerender({ value: { ...session, id: "other" } }); await act(async () => resolve(evidenceTestResponse())); expect(result.current.value).toBeNull();
  act(() => result.current.setOffset(25)); expect(mocks.load.mock.calls.at(-1)?.[3]).toBe(25);
  unmount(); expect(mocks.listeners.size).toBe(0); expect((mocks.load.mock.calls.at(-1)?.[4] as AbortSignal).aborted).toBe(true);
});
it.each([401, 403])("reports current access denial %s and suspends the session", async (status) => {
  mocks.load.mockRejectedValue({ status }); const revoked = vi.fn();
  const { result } = renderHook(() => useSessionEvidence(session, "host", true, revoked));
  await act(async () => {}); expect(result.current.value).toBeNull(); expect(result.current.failed).toBe(true); expect(revoked).toHaveBeenCalledOnce();
});
