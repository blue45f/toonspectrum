// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import { STUDIO_P2P_HUDDLE_CLOSE_EVENT, STUDIO_P2P_HUDDLE_CLOSED_EVENT } from "../live/huddle/studio-p2p-huddle-events";
import { StudioVirtualConversationController } from "./studio-virtual-space-conversation";
import { DEFAULT_STUDIO_WORLD_MANIFEST } from "./studio-virtual-space-world-manifest";
import { useStudioVirtualSpaceConversation } from "./use-studio-virtual-space-conversation";
import { studioVirtualSpaceState } from "./studio-virtual-space-model";

type Props = Parameters<typeof useStudioVirtualSpaceConversation>[0];
const participants: StudioLiveParticipant[] = ["a", "b", "c"].map((sessionId) => ({ sessionId, displayName: sessionId.toUpperCase(), role: "editor" }));
const sessions: StudioVirtualConversationController[] = [];
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.spyOn(document, "hasFocus").mockReturnValue(true); });
afterEach(() => { cleanup(); for (const session of sessions.splice(0)) session.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function fixture() {
  const listeners = new Map<string, Set<(sender: StudioLiveParticipant, raw: string) => void>>();
  const port = (self: StudioLiveParticipant): StudioLiveDirectPort => ({
    getPeers: () => participants.filter((peer) => peer.sessionId !== self.sessionId),
    send: (id, raw) => { if (!listeners.get(id)?.size) return false; for (const listener of listeners.get(id)!) listener(self, raw); return true; },
    subscribe: (listener) => { const bucket = listeners.get(self.sessionId) ?? new Set(); bucket.add(listener); listeners.set(self.sessionId, bucket); return () => { bucket.delete(listener); }; },
  });
  const manifest = { ...DEFAULT_STUDIO_WORLD_MANIFEST,
    rooms: [{ id: "qa-public", labelKo: "QA", labelEn: "QA", x: 0, y: 0, width: 850, height: 798 }],
    acousticZones: [{ id: "qa-public", roomId: "qa-public", policy: "public" as const, x: 0, y: 0, width: 850, height: 798 }] };
  const hash = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(manifest)));
  const world = { worldId: DEFAULT_STUDIO_WORLD_MANIFEST.id, contentRevision: [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("") };
  const remote = participants.slice(1).map((peer) => {
    const controller = new StudioVirtualConversationController(peer, port(peer), world); sessions.push(controller); controller.start(); return controller;
  });
  const onReady = vi.fn(), onClosed = vi.fn();
  const props: Props = { participant: participants[0], port: port(participants[0]!), manifest, enabled: true, onReady, onClosed,
    presence: { self: studioVirtualSpaceState({ x: 100, y: 100 }), peers: participants.slice(1).map((participant, i) => ({ participant,
      state: studioVirtualSpaceState({ x: 120 + 20 * i, y: 100 }), lastSeen: Date.now(), sequence: 1 })), nearbyPeers: [], peerReactions: [], selfReaction: null, direct: true } };
  return { props, remote, listeners, onReady, onClosed };
}
async function ready(hook: { result: { current: ReturnType<typeof useStudioVirtualSpaceConversation> } }) {
  await waitFor(() => expect(hook.result.current.snapshot.readyPeers).toHaveLength(2));
}
async function accept(hook: { result: { current: ReturnType<typeof useStudioVirtualSpaceConversation> } }, remote: StudioVirtualConversationController[]) {
  let id: string | null = null;
  act(() => { id = hook.result.current.propose(["a", "b", "c"]); });
  act(() => { remote.forEach((controller) => controller.respond(id!, "accept")); });
  await waitFor(() => expect(hook.result.current.snapshot.active?.id).toBe(id)); return id!;
}

describe("conversation hook foreground, scope, and media-close coordination", () => {
  it("waits for every explicit acceptance and never repeats ready on a render", async () => {
    const f = await fixture(); const hook = renderHook(useStudioVirtualSpaceConversation, { initialProps: f.props }); await ready(hook);
    let id: string | null = null;
    act(() => { id = hook.result.current.propose(["a", "b", "c"]); f.remote[0]!.respond(id!, "accept"); });
    expect(f.onReady).not.toHaveBeenCalled();
    const latest = vi.fn(); hook.rerender({ ...f.props, onReady: latest });
    act(() => { f.remote[1]!.respond(id!, "accept"); });
    expect(latest).toHaveBeenCalledExactlyOnceWith({ id, memberIds: ["a", "b", "c"] });
    hook.rerender({ ...f.props, onReady: latest });
    expect(latest).toHaveBeenCalledOnce(); expect(f.onReady).not.toHaveBeenCalled();
  });
  it.each(["blur", "hidden"])("keeps a consented call on %s without accepting new interactions in the background", async (event) => {
    const f = await fixture(); const hook = renderHook(useStudioVirtualSpaceConversation, { initialProps: f.props }); await ready(hook);
    const id = await accept(hook, f.remote); const close = vi.fn(); window.addEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, close);
    try {
      if (event === "hidden") vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      else vi.mocked(document.hasFocus).mockReturnValue(false);
      act(() => { (event === "hidden" ? document : window).dispatchEvent(new Event(event === "hidden" ? "visibilitychange" : "blur")); });
      expect(close).not.toHaveBeenCalled(); expect(hook.result.current.snapshot.active?.id).toBe(id);
      expect(hook.result.current.snapshot.available).toBe(false); expect(f.onClosed).not.toHaveBeenCalled();
      expect(hook.result.current.propose(["a", "b"])).toBeNull();
      vi.mocked(document.hasFocus).mockReturnValue(true);
      if (event === "hidden") vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
      act(() => { window.dispatchEvent(new Event("focus")); }); await ready(hook);
      expect(hook.result.current.snapshot.active?.id).toBe(id); expect(f.onReady).toHaveBeenCalledOnce();
    } finally { window.removeEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, close); }
  });
  it("cancels unfinished consent on rapid blur/focus without reviving its later acceptance", async () => {
    const f = await fixture(); const hook = renderHook(useStudioVirtualSpaceConversation, { initialProps: f.props }); await ready(hook);
    let id: string | null = null;
    act(() => { id = hook.result.current.propose(["a", "b", "c"]); });
    act(() => { window.dispatchEvent(new Event("blur")); window.dispatchEvent(new Event("focus")); });
    act(() => { for (const controller of f.remote) expect(controller.respond(id!, "accept")).toBe(false); });
    await ready(hook); expect(hook.result.current.snapshot.active).toBeNull(); expect(f.onReady).not.toHaveBeenCalled();
  });
  it.each(["disable", "world", "port", "block"])("revokes the old conversation on %s changes", async (change) => {
    const f = await fixture(); const hook = renderHook(useStudioVirtualSpaceConversation, { initialProps: f.props }); await ready(hook); await accept(hook, f.remote);
    hook.rerender(change === "disable" ? { ...f.props, enabled: false }
      : change === "world" ? { ...f.props, manifest: { ...f.props.manifest, version: f.props.manifest.version + 1 } }
        : change === "port" ? { ...f.props, port: { ...f.props.port! } } : { ...f.props, blockedPeerIds: ["b"] });
    expect(f.onClosed).toHaveBeenCalledOnce(); expect(hook.result.current.snapshot.active).toBeNull();
    expect(f.onReady).toHaveBeenCalledOnce();
  });
  it.each(["binding", "unknown-zone", "missing-presence"])("ends the exact group Huddle immediately on %s loss and never rejoins from old votes", async (cause) => {
    const f = await fixture(); const hook = renderHook(useStudioVirtualSpaceConversation, { initialProps: f.props }); await ready(hook);
    const id = await accept(hook, f.remote); const close = vi.fn(); window.addEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, close);
    try {
      hook.rerender(cause === "binding" ? { ...f.props, acousticBindingAvailable: false }
        : cause === "missing-presence" ? { ...f.props, presence: undefined }
          : { ...f.props, presence: { ...f.props.presence!, self: { ...f.props.presence!.self, x: -1 } } });
      expect(close).toHaveBeenCalledOnce(); expect((close.mock.calls[0]![0] as CustomEvent).detail).toEqual({ conversationId: id });
      expect(f.onClosed).toHaveBeenCalledExactlyOnceWith({ id, memberIds: ["a", "b", "c"] });
      expect(hook.result.current.snapshot.active).toBeNull();
      expect(f.remote.every((controller) => controller.snapshot().active === null)).toBe(true);
      expect(hook.result.current.propose(["a", "b"])).toBeNull();
      hook.rerender(f.props); await ready(hook);
      expect(hook.result.current.respond(id, "accept")).toBe(false);
      expect(f.onReady).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
      expect(f.listeners.get("a")?.size).toBe(1);
    } finally { window.removeEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, close); }
  });
  it("fails closed when a ready transport has no matching spatial observations", async () => {
    const f = await fixture(); const hook = renderHook(useStudioVirtualSpaceConversation, { initialProps: { ...f.props, presence: undefined } });
    await waitFor(() => expect(hook.result.current.snapshot.available).toBe(true));
    expect(hook.result.current.snapshot.readyPeers).toEqual([]); expect(hook.result.current.propose(["a", "b"])).toBeNull();
  });

  it("ignores another conversation's closed notification and terminates only the matching scope", async () => {
    const f = await fixture(); const hook = renderHook(useStudioVirtualSpaceConversation, { initialProps: f.props }); await ready(hook); const id = await accept(hook, f.remote);
    act(() => { window.dispatchEvent(new CustomEvent(STUDIO_P2P_HUDDLE_CLOSED_EVENT, { detail: { conversationId: "older-conversation" } })); });
    expect(hook.result.current.snapshot.active?.id).toBe(id);
    act(() => { window.dispatchEvent(new CustomEvent(STUDIO_P2P_HUDDLE_CLOSED_EVENT, { detail: { conversationId: id } })); });
    expect(hook.result.current.snapshot.active).toBeNull(); expect(f.onClosed).toHaveBeenCalledOnce();
    expect(f.remote.every((controller) => controller.snapshot().active === null)).toBe(true);
  });
  it("does not duplicate subscriptions in StrictMode and fails closed without hashing support", async () => {
    const f = await fixture(); const hook = renderHook(useStudioVirtualSpaceConversation, { initialProps: f.props,
      wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode> }); await ready(hook);
    expect(f.listeners.get("a")?.size).toBe(1); hook.unmount(); expect(f.listeners.get("a")?.size).toBe(0);
    vi.stubGlobal("crypto", {});
    const unavailable = renderHook(useStudioVirtualSpaceConversation, { initialProps: f.props });
    expect(unavailable.result.current.snapshot.available).toBe(false);
    expect(unavailable.result.current.propose(["a", "b"])).toBeNull();
  });
});
