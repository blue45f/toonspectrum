// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStudioWorkSession, type StudioSessionResources } from "@toonspectrum/studio-project-model/work-session";
import { useSessionResourceMetadata } from "./use-session-resource-metadata";

const load = vi.hoisted(() => vi.fn());
vi.mock("./studio-work-session-client", () => ({ getStudioSessionResources: load }));
vi.mock("@/infrastructure/api", () => ({ httpStatus: (error: { status?: number }) => error.status }));
const session = createStudioWorkSession({ id: "session", operationId: "create", title: "Session", purpose: "Test", kind: "reading", invitedUserIds: [],
  input: { schemaVersion: 1, workId: "work", projectId: "project", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) } },
  { userId: "host", canComment: true, canEdit: true }, "2026-09-21T10:00:00.000Z");
const data = (): StudioSessionResources => ({ workId: "work", sessionId: "session", inputDigest: "a".repeat(64), expiresAt: new Date(Date.now() + 15000).toISOString(),
  sourceStatus: "mapped", pages: [], nextPageOffset: null, assets: [] });
beforeEach(() => { vi.useFakeTimers(); load.mockReset(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("expires metadata and obtains a fresh lease without persisting it", async () => {
  load.mockResolvedValueOnce(data()).mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() => useSessionResourceMetadata(session, vi.fn()));
  await act(async () => {}); expect(result.current.data).not.toBeNull();
  await act(async () => { vi.advanceTimersByTime(15001); });
  expect(result.current.data).toBeNull(); expect(load).toHaveBeenCalledTimes(2);
});
it("reports timeout even when the transport ignores cancellation", async () => {
  let resolve!: (value: StudioSessionResources) => void;
  load.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result } = renderHook(() => useSessionResourceMetadata(session, vi.fn()));
  await act(async () => { vi.advanceTimersByTime(10001); });
  expect(result.current.failed).toBe(true); expect(result.current.data).toBeNull();
  await act(async () => resolve(data())); expect(result.current.data).toBeNull();
});
it("removes metadata when hidden and does a fresh read after returning", async () => {
  load.mockImplementation(async () => data());
  const { result } = renderHook(() => useSessionResourceMetadata(session, vi.fn()));
  await act(async () => {}); expect(result.current.data).not.toBeNull();
  act(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  expect(result.current.data).toBeNull();
  await act(async () => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  expect(load).toHaveBeenCalledTimes(2); expect(result.current.data).not.toBeNull();
});
it("rejects late old-session results and signals explicit access revocation", async () => {
  let resolve!: (value: StudioSessionResources) => void; const revoked = vi.fn();
  load.mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockRejectedValueOnce({ status: 403 });
  const { result, rerender } = renderHook(({ value }) => useSessionResourceMetadata(value, revoked), { initialProps: { value: session } });
  rerender({ value: { ...session, id: "other" } });
  await act(async () => resolve(data()));
  expect(result.current.data).toBeNull(); expect(result.current.failed).toBe(true); expect(revoked).toHaveBeenCalledOnce();
});
