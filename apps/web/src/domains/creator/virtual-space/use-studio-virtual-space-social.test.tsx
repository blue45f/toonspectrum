// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import { StudioVirtualSpaceSocialController, type StudioVirtualSpaceSocialAction } from "./studio-virtual-space-social";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { useStudioVirtualSpaceSocial } from "./use-studio-virtual-space-social";

const reviewAuthority = vi.hoisted(() => ({ verify: vi.fn(async () => ({ ok: true })) }));
vi.mock("./studio-virtual-space-review-invitation", () => ({ verifyStudioVirtualSpaceReviewSubject: reviewAuthority.verify }));
const subject = { schemaVersion: 1 as const, workId: "work-1", projectId: "graph-1", artifactId: "artifact-1", reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) };

const A: StudioLiveParticipant = { sessionId: "hook-alice", displayName: "Alice", role: "editor" };
const B: StudioLiveParticipant = { sessionId: "hook-bob", displayName: "Bob", role: "editor" };
type HookProps = Parameters<typeof useStudioVirtualSpaceSocial>[0];
const sessions: StudioVirtualSpaceSocialController[] = [];

class DirectPair {
  private readonly listeners = new Map<string, Set<(sender: StudioLiveParticipant, raw: string) => void>>();
  readonly packets: Array<{ sender: string; target: string; raw: string }> = [];
  readonly a = this.port(A);
  readonly b = this.port(B);
  count(id: string): number { return this.listeners.get(id)?.size ?? 0; }
  private port(self: StudioLiveParticipant): StudioLiveDirectPort {
    return {
      getPeers: () => [self === A ? B : A],
      send: (target, raw) => {
        const listeners = this.listeners.get(target);
        if (!listeners?.size) return false;
        this.packets.push({ sender: self.sessionId, target, raw });
        for (const listener of [...listeners]) listener(self, raw);
        return true;
      },
      subscribe: (listener) => {
        const listeners = this.listeners.get(self.sessionId) ?? new Set();
        listeners.add(listener); this.listeners.set(self.sessionId, listeners);
        return () => { listeners.delete(listener); };
      },
    };
  }
}

async function setup() {
  const pair = new DirectPair();
  const hash = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(DEFAULT_STUDIO_WORLD_MANIFEST)));
  const revision = [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const remoteAccepted = vi.fn();
  const remote = new StudioVirtualSpaceSocialController(B, pair.b,
    { worldId: DEFAULT_STUDIO_WORLD_MANIFEST.id, contentRevision: revision },
    { onAccepted: remoteAccepted, authorizeReview: async () => true, setInterval: () => 0, clearInterval: () => undefined });
  sessions.push(remote); remote.start();
  const onAccepted = vi.fn();
  const props: HookProps = { workId: "work-1", participant: A, port: pair.a, manifest: DEFAULT_STUDIO_WORLD_MANIFEST, enabled: true, onAccepted };
  return { pair, remote, remoteAccepted, onAccepted, props };
}

beforeEach(() => { vi.stubGlobal("crypto", webcrypto); reviewAuthority.verify.mockClear().mockResolvedValue({ ok: true }); });
afterEach(() => { cleanup(); for (const session of sessions.splice(0)) session.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("social hook consent and lifetime", () => {
  it.each(["abort", "blur"])("does not emit a delayed review proposal after %s", async (cause) => {
    const f = await setup();
    const hook = renderHook(() => useStudioVirtualSpaceSocial(f.props));
    await waitFor(() => expect(hook.result.current.snapshot.reviewReadyPeerIds).toContain(B.sessionId));
    let resolve!: (value: { ok: boolean }) => void;
    reviewAuthority.verify.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const intent = new AbortController();
    let result!: Promise<string | null>;
    act(() => { result = hook.result.current.requestReview(B.sessionId, subject, intent.signal); });
    act(() => { if (cause === "abort") intent.abort(); else globalThis.dispatchEvent(new Event("blur")); });
    await act(async () => { resolve({ ok: true }); expect(await result).toBeNull(); });
    expect(f.remote.snapshot().requests).toEqual([]);
    expect(f.onAccepted).not.toHaveBeenCalled();
    if (cause === "blur") {
      expect(hook.result.current.interactive).toBe(false);
      act(() => { globalThis.dispatchEvent(new Event("focus")); });
      await waitFor(() => expect(hook.result.current.snapshot.available).toBe(true));
      expect(hook.result.current.snapshot.requests).toEqual([]);
    }
  });
  it("preserves bounded session blocks across controller replacement and rejects cross-work invitations", async () => {
    const f = await setup();
    const hook = renderHook((props: HookProps) => useStudioVirtualSpaceSocial(props), { initialProps: f.props });
    await waitFor(() => expect(hook.result.current.snapshot.reviewReadyPeerIds).toContain(B.sessionId));
    await act(async () => { expect(await hook.result.current.requestReview(B.sessionId, { ...subject, workId: "another-work" })).toBeNull(); });
    expect(reviewAuthority.verify).not.toHaveBeenCalled();
    act(() => { hook.result.current.setPeerBlocked(B.sessionId, true); });
    hook.rerender({ ...f.props, enabled: false }); hook.rerender(f.props);
    await waitFor(() => expect(hook.result.current.snapshot.available).toBe(true));
    expect(hook.result.current.snapshot.blockedPeerIds).toEqual([B.sessionId]);
    expect(hook.result.current.snapshot.readyPeerIds).toEqual([]);
  });
  it.each<StudioVirtualSpaceSocialAction>(["talk", "follow", "review", "high-five"])(
    "does not start %s from receiving or rendering an invitation, only from explicit acceptance", async (action) => {
      const f = await setup();
      const hook = renderHook((props: HookProps) => useStudioVirtualSpaceSocial(props), { initialProps: f.props });
      await waitFor(() => expect(hook.result.current.snapshot.readyPeerIds).toEqual([B.sessionId]));
      let id: string | null = null;
      await act(async () => { id = action === "review" ? await f.remote.requestReview(A.sessionId, subject) : f.remote.request(A.sessionId, action); });
      expect(id).not.toBeNull();
      expect(hook.result.current.snapshot.requests[0]).toMatchObject({ id, status: "offered", direction: "incoming" });
      const methods = { request: hook.result.current.request, respond: hook.result.current.respond, cancel: hook.result.current.cancel };
      const latestAccepted = vi.fn();
      hook.rerender({ ...f.props, onAccepted: latestAccepted });
      expect(f.onAccepted).not.toHaveBeenCalled();
      expect(latestAccepted).not.toHaveBeenCalled();
      expect(f.remoteAccepted).not.toHaveBeenCalled();
      expect(hook.result.current.request).toBe(methods.request);
      expect(hook.result.current.respond).toBe(methods.respond);
      expect(hook.result.current.cancel).toBe(methods.cancel);
      await act(async () => { expect(action === "review" ? await hook.result.current.respondReview(id!, "accept") : hook.result.current.respond(id!, "accept")).toBe(true); });
      await waitFor(() => expect(latestAccepted).toHaveBeenCalledOnce());
      expect(f.onAccepted).not.toHaveBeenCalled();
      expect(f.remoteAccepted).toHaveBeenCalledOnce();
      expect(hook.result.current.snapshot.requests[0]?.status).toBe("accepted");
      hook.rerender({ ...f.props, onAccepted: latestAccepted });
      act(() => { expect(hook.result.current.respond(id!, "accept")).toBe(false); });
      expect(latestAccepted).toHaveBeenCalledOnce();
      expect(f.pair.count(A.sessionId)).toBe(1);
    },
  );

  it("keeps an accepted talk through a browser permission-window blur without replaying consent", async () => {
    const f = await setup();
    const hook = renderHook(() => useStudioVirtualSpaceSocial(f.props));
    await waitFor(() => expect(hook.result.current.snapshot.readyPeerIds).toContain(B.sessionId));
    let id: string | null = null;
    act(() => { id = hook.result.current.request(B.sessionId, "talk"); f.remote.respond(id!, "accept"); });
    act(() => { globalThis.dispatchEvent(new Event("blur")); });
    expect(hook.result.current.interactive).toBe(false);
    expect(hook.result.current.snapshot.requests.find((request) => request.id === id)?.status).toBe("accepted");
    expect(f.remote.snapshot().requests.find((request) => request.id === id)?.status).toBe("accepted");
    expect(hook.result.current.request(B.sessionId, "follow")).toBeNull();
    act(() => { globalThis.dispatchEvent(new Event("focus")); });
    expect(hook.result.current.interactive).toBe(true);
    expect(f.onAccepted).toHaveBeenCalledOnce();
  });
  it("cancels an active accepted activity on focus disable and does not revive it on resume", async () => {
    const f = await setup();
    const hook = renderHook((props: HookProps) => useStudioVirtualSpaceSocial(props), { initialProps: f.props });
    await waitFor(() => expect(hook.result.current.snapshot.readyPeerIds).toContain(B.sessionId));
    let id: string | null = null;
    act(() => { id = hook.result.current.request(B.sessionId, "follow"); });
    act(() => { f.remote.respond(id!, "accept"); });
    expect(f.onAccepted).toHaveBeenCalledOnce();
    hook.rerender({ ...f.props, enabled: false });
    expect(f.pair.count(A.sessionId)).toBe(0);
    expect(hook.result.current.snapshot.available).toBe(false);
    expect(f.remote.snapshot().requests.find((request) => request.id === id)?.status).toBe("cancelled");
    expect(hook.result.current.request(B.sessionId, "talk")).toBeNull();
    expect(hook.result.current.respond(id!, "accept")).toBe(false);
    hook.rerender(f.props);
    await waitFor(() => expect(hook.result.current.snapshot.available).toBe(true));
    expect(hook.result.current.snapshot.requests).toEqual([]);
    expect(f.onAccepted).toHaveBeenCalledOnce();
  });

  it.each(["manifest", "port"])("closes the old controller before replacing its %s", async (change) => {
    const f = await setup();
    const hook = renderHook((props: HookProps) => useStudioVirtualSpaceSocial(props), { initialProps: f.props });
    await waitFor(() => expect(hook.result.current.snapshot.readyPeerIds).toContain(B.sessionId));
    let id: string | null = null;
    await act(async () => { id = await hook.result.current.requestReview(B.sessionId, subject); });
    expect(f.remote.snapshot().requests[0]?.status).toBe("offered");
    const next = change === "manifest"
      ? { ...f.props, manifest: { ...DEFAULT_STUDIO_WORLD_MANIFEST, backgroundUrl: "/assets/different-layout.webp" } }
      : { ...f.props, port: { ...f.pair.a } };
    hook.rerender(next);
    expect(f.remote.snapshot().requests.find((request) => request.id === id)?.status).toBe("cancelled");
    expect(hook.result.current.respond(id!, "accept")).toBe(false);
    await waitFor(() => expect(hook.result.current.snapshot.available).toBe(true));
    expect(f.pair.count(A.sessionId)).toBe(1);
    expect(hook.result.current.snapshot.requests).toEqual([]);
    if (change === "manifest") expect(hook.result.current.snapshot.readyPeerIds).toEqual([]);
    expect(f.onAccepted).not.toHaveBeenCalled();
  });

  it("cancels both sides once and removes the subscription on unmount", async () => {
    const f = await setup();
    const hook = renderHook(() => useStudioVirtualSpaceSocial(f.props));
    await waitFor(() => expect(hook.result.current.snapshot.readyPeerIds).toContain(B.sessionId));
    let id: string | null = null;
    act(() => { id = hook.result.current.request(B.sessionId, "follow"); f.remote.respond(id!, "accept"); });
    act(() => { expect(hook.result.current.cancel(id!)).toBe(true); });
    expect(f.remote.snapshot().requests[0]?.status).toBe("cancelled");
    expect(hook.result.current.snapshot.requests[0]?.status).toBe("cancelled");
    hook.unmount();
    expect(f.pair.count(A.sessionId)).toBe(0);
    expect(f.pair.packets.filter(({ sender, raw }) => sender === A.sessionId && JSON.parse(raw).kind === "cancel")).toHaveLength(1);
  });

  it("does not start a stale digest completion after disabling or StrictMode cleanup", async () => {
    const f = await setup();
    const pending: Array<(value: ArrayBuffer) => void> = [];
    const digest = vi.fn(() => new Promise<ArrayBuffer>((resolve) => pending.push(resolve)));
    vi.stubGlobal("crypto", { randomUUID: () => webcrypto.randomUUID(), subtle: { digest } });
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const hook = renderHook((props: HookProps) => useStudioVirtualSpaceSocial(props), { initialProps: f.props, wrapper });
    expect(pending.length).toBeGreaterThan(0);
    hook.rerender({ ...f.props, enabled: false });
    await act(async () => { for (const resolve of pending) resolve(new ArrayBuffer(32)); await Promise.resolve(); });
    expect(f.pair.count(A.sessionId)).toBe(0);
    expect(hook.result.current.snapshot.available).toBe(false);
    expect(f.onAccepted).not.toHaveBeenCalled();
  });

  it("keeps consent unavailable when the browser has no secure digest API", async () => {
    const f = await setup();
    vi.stubGlobal("crypto", { randomUUID: () => webcrypto.randomUUID() });
    const hook = renderHook(() => useStudioVirtualSpaceSocial(f.props));
    expect(f.pair.count(A.sessionId)).toBe(0);
    expect(hook.result.current.snapshot.available).toBe(false);
    expect(hook.result.current.request(B.sessionId, "talk")).toBeNull();
    expect(f.onAccepted).not.toHaveBeenCalled();
  });

  it("keeps a failed world digest unavailable without registering a partial controller", async () => {
    const f = await setup();
    vi.stubGlobal("crypto", { randomUUID: () => webcrypto.randomUUID(), subtle: { digest: vi.fn().mockRejectedValue(new Error("hash unavailable")) } });
    const hook = renderHook(() => useStudioVirtualSpaceSocial(f.props));
    await act(async () => { await Promise.resolve(); });
    expect(f.pair.count(A.sessionId)).toBe(0);
    expect(hook.result.current.snapshot.available).toBe(false);
    expect(hook.result.current.request(B.sessionId, "talk")).toBeNull();
  });
});
