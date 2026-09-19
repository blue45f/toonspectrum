// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioVirtualSpacePhaserCanvas } from "./StudioVirtualSpacePhaserCanvas";
import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualSpacePresenceState } from "./studio-virtual-space-model";
import type { StudioSpaceSocialRequest, StudioSpaceSocialSnapshot } from "./StudioVirtualSpaceSocialPanel";
import type { useStudioVirtualSpaceSocial } from "./use-studio-virtual-space-social";
import { STUDIO_P2P_HUDDLE_OPEN_EVENT, STUDIO_P2P_HUDDLE_CLOSE_EVENT, STUDIO_P2P_HUDDLE_CLOSED_EVENT } from "../live/huddle/studio-p2p-huddle-events";
import { StudioVirtualSpacePage } from "./StudioVirtualSpacePage";

type Engine = ComponentProps<typeof StudioVirtualSpacePhaserCanvas>;
type SocialOptions = Parameters<typeof useStudioVirtualSpaceSocial>[0];
const f = vi.hoisted(() => ({
  worldLoad: null as Promise<StudioVirtualSpaceWorldManifest> | null,
  engine: null as Engine | null,
  socialOptions: null as SocialOptions | null,
  snapshot: { requests: [], readyPeerIds: ["bob", "cleo"], available: true } as StudioSpaceSocialSnapshot,
  cancel: vi.fn((_id: string) => true),
  request: vi.fn((_id: string, _action: string) => "pending"),
  respond: vi.fn((_id: string, _response: string) => true),
  transport: () => null,
  connectivity: { serverAvailable: true, localOnly: false, mode: "online", browserOnline: true },
  live: { availability: "ready", room: {
    participant: { sessionId: "alice", displayName: "Alice", role: "editor" },
    direct: { getPeers: () => [], subscribe: () => () => undefined, send: () => true },
  } },
  session: { ready: true, data: { user: { id: "alice", name: "Alice", email: "alice@example.test" } } },
}));
vi.mock("@/compat/auth-session-store", () => ({ useSession: () => f.session }));
vi.mock("../live/use-studio-live-transport-auth", () => ({ useStudioLiveTransportAuth: () => f.transport }));
vi.mock("../live/StudioLiveCollaborationProvider", () => ({ StudioLiveCollaborationProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("../live/studio-live-collaboration-context", () => ({ useStudioLiveCollaboration: () => f.live }));
vi.mock("../offline/studio-connectivity", () => ({
  getStudioConnectivitySnapshot: () => f.connectivity,
  getStudioConnectivityServerSnapshot: () => f.connectivity,
  subscribeStudioConnectivity: () => () => undefined,
  startStudioConnectivityRuntime: () => () => undefined,
}));
vi.mock("./studio-virtual-space-world-loader", async () => {
  const { DEFAULT_STUDIO_WORLD_MANIFEST } = await import("./studio-virtual-space-world-manifest");
  return { loadStudioVirtualSpaceWorldManifest: async () => f.worldLoad ?? DEFAULT_STUDIO_WORLD_MANIFEST };
});
vi.mock("./StudioVirtualSpacePhaserCanvas", () => ({
  StudioVirtualSpacePhaserCanvas: (props: Engine) => { f.engine = props; return <div data-testid="engine-ready" />; },
}));
vi.mock("./use-studio-virtual-space-social", () => ({
  useStudioVirtualSpaceSocial: (options: SocialOptions) => {
    f.socialOptions = options;
    return { snapshot: f.snapshot, cancel: f.cancel, request: f.request, respond: f.respond };
  },
}));
vi.mock("./studio-virtual-space-presence", () => ({
  STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS: 3000,
  StudioVirtualSpacePresenceController: class {
    constructor(_participant: unknown, _port: unknown, private self: StudioVirtualSpacePresenceState) {}
    setAvatarIndex() {} start() {} close() {} setActivity() {} sendReaction() {}
    subscribe() { return () => undefined; }
    snapshot() {
      const peers = ["bob", "cleo"].map((id, index) => ({
        participant: { sessionId: id, displayName: index ? "Cleo" : "Bob", role: "editor" as const },
        state: { ...this.self, x: this.self.x + 20 + index * 15, y: this.self.y }, lastSeen: Date.now(), sequence: 1,
      }));
      return { self: this.self, peers, nearbyPeers: peers, selfReaction: null, peerReactions: [], direct: true };
    }
  },
}));

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  f.worldLoad = null; f.engine = null; f.socialOptions = null;
  f.snapshot = { requests: [], readyPeerIds: ["bob", "cleo"], available: true };
  f.cancel.mockClear(); f.request.mockClear(); f.respond.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() {
  const mounted = render(<MemoryRouter initialEntries={["/studio/project-social/virtual"]}>
    <Routes><Route path="/studio/:projectId/virtual" element={<StudioVirtualSpacePage />} /></Routes>
  </MemoryRouter>);
  await screen.findByTestId("engine-ready");
  await waitFor(() => expect(f.engine?.snapshot.peers).toHaveLength(2));
  return mounted;
}
function accepted(id: string, action: StudioSpaceSocialRequest["action"], peerId = "bob"): StudioSpaceSocialRequest {
  return { id, action, status: "accepted", direction: "outgoing", createdAt: 1000, expiresAt: 21000,
    peer: { sessionId: peerId, displayName: peerId === "bob" ? "Bob" : "Cleo", role: "editor" } };
}
function accept(request: StudioSpaceSocialRequest): void {
  f.snapshot = { ...f.snapshot, requests: [request, ...f.snapshot.requests] };
  act(() => f.socialOptions?.onAccepted(request));
}

// The transport and renderer are boundaries; these tests execute the real Page's
// activity ownership, UI events, engine bridge and Huddle event integration.
describe("Virtual Studio social activity ownership", () => {
  it("keeps world movement, room actions and NPC tool access unavailable until the world is ready", async () => {
    let finishLoad!: (world: StudioVirtualSpaceWorldManifest) => void;
    f.worldLoad = new Promise((resolve) => { finishLoad = resolve; });
    render(<MemoryRouter initialEntries={["/studio/project-social/virtual"]}>
      <Routes><Route path="/studio/:projectId/virtual" element={<StudioVirtualSpacePage />} /></Routes>
    </MemoryRouter>);
    expect(screen.getByText("공간 데이터 불러오는 중…")).toBeTruthy();
    expect(screen.queryByTestId("engine-ready")).toBeNull();
    expect(screen.queryByRole("region", { name: "스튜디오 도우미 NPC" })).toBeNull();
    expect(screen.queryByRole("button", { name: "E · 방 열기" })).toBeNull();
    expect(document.querySelector(".studio-vspace-minimap")).toBeNull();
    expect(document.querySelector(".vs2-mobile-zone-cards")).toBeNull();
    expect(f.socialOptions?.enabled).toBe(false);
    await act(async () => { finishLoad(DEFAULT_STUDIO_WORLD_MANIFEST); });
    await screen.findByTestId("engine-ready");
    expect(screen.getByRole("region", { name: "스튜디오 도우미 NPC" })).toBeTruthy();
    expect(document.querySelector(".vs2-mobile-zone-cards")).not.toBeNull();
  });

  it("opens a scoped talk only on the accepted callback and never from peer selection or rerender", async () => {
    await mount();
    const open = vi.fn();
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, open);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Bob" }));
      fireEvent.click(screen.getByRole("button", { name: "대화 요청" }));
      expect(f.request).toHaveBeenCalledWith("bob", "talk");
      expect(open).not.toHaveBeenCalled();
      accept(accepted("epoch:1.4", "talk"));
      expect(open).toHaveBeenCalledOnce();
      expect((open.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ conversationId: "epoch:1.4", peerIds: ["bob"], source: "virtual-space" });
      fireEvent.click(screen.getByRole("button", { name: "Cleo" }));
      expect(open).toHaveBeenCalledOnce();
    } finally { globalThis.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, open); }
  });

  it("cancels the previous accepted follow before replacing it with another person's review", async () => {
    await mount();
    accept(accepted("follow-one", "follow"));
    expect(f.engine?.bridge.getFollowingPeer()).toBe("bob");
    accept(accepted("review-two", "review", "cleo"));
    expect(f.cancel).toHaveBeenCalledWith("follow-one");
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
    expect(screen.getByRole("heading", { name: "함께 검토하기" })).toBeTruthy();
    expect(f.cancel).not.toHaveBeenCalledWith("review-two");
  });

  it.each(["engine", "peer-selection"])("ends follow consent when %s cancels manual movement ownership", async (source) => {
    await mount();
    accept(accepted("follow-one", "follow"));
    expect(f.engine?.bridge.getFollowingPeer()).toBe("bob");
    act(() => {
      if (source === "engine") f.engine?.onCancelFollow();
      else f.engine?.onPeerSelect("cleo");
    });
    await waitFor(() => expect(f.cancel).toHaveBeenCalledWith("follow-one"));
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
  });

  it("cancels activity and disables the social hook on focus, without enabling any new interaction", async () => {
    await mount();
    accept(accepted("follow-one", "follow"));
    fireEvent.click(screen.getByRole("button", { name: "집중" }));
    expect(f.cancel).toHaveBeenCalledWith("follow-one");
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
    expect(f.socialOptions?.enabled).toBe(false);
    expect((screen.getByRole("button", { name: "대화 요청" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ignores unrelated Huddle notifications and ends the matching social activity exactly once", async () => {
    await mount();
    accept(accepted("conversation-current", "talk"));
    const close = vi.fn((event: Event) => {
      globalThis.dispatchEvent(new CustomEvent(STUDIO_P2P_HUDDLE_CLOSED_EVENT, {
        detail: (event as CustomEvent).detail,
      }));
    });
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, close);
    try {
      act(() => { globalThis.dispatchEvent(new CustomEvent(STUDIO_P2P_HUDDLE_CLOSED_EVENT, { detail: { conversationId: "conversation-old" } })); });
      expect(f.cancel).not.toHaveBeenCalled();
      act(() => { globalThis.dispatchEvent(new CustomEvent(STUDIO_P2P_HUDDLE_CLOSED_EVENT, { detail: { conversationId: "conversation-current" } })); });
      expect(f.cancel).toHaveBeenCalledExactlyOnceWith("conversation-current");
      expect(close).toHaveBeenCalledOnce();
    } finally { globalThis.removeEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, close); }
  });

  it("finishes old consent when the hook replaces its controller and removes the accepted request", async () => {
    await mount();
    accept(accepted("follow-one", "follow"));
    f.snapshot = { requests: [], readyPeerIds: [], available: false };
    fireEvent.click(screen.getByRole("button", { name: "Cleo" }));
    await waitFor(() => expect(f.cancel).toHaveBeenCalledWith("follow-one"));
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
  });

  it("keeps incoming acceptance behind an explicit button and leaves decline available during focus", async () => {
    await mount();
    const incoming = { ...accepted("incoming-one", "review"), status: "offered" as const, direction: "incoming" as const };
    f.snapshot = { ...f.snapshot, requests: [incoming] };
    fireEvent.click(screen.getByRole("button", { name: "Bob" }));
    expect(f.respond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "수락" }));
    expect(f.respond).toHaveBeenCalledExactlyOnceWith("incoming-one", "accept");
    fireEvent.click(screen.getByRole("button", { name: "집중" }));
    expect((screen.getByRole("button", { name: "수락" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "거절" }));
    expect(f.respond).toHaveBeenLastCalledWith("incoming-one", "decline");
  });

  it("shows the newest terminal result and never treats NPCs as selectable peers", async () => {
    await mount();
    f.snapshot = { ...f.snapshot, requests: [
      { ...accepted("new-decline", "talk", "cleo"), status: "declined" },
      { ...accepted("old-cancel", "talk"), status: "cancelled" },
    ] };
    fireEvent.click(screen.getByRole("button", { name: "Bob" }));
    const panel = screen.getByRole("region", { name: "팀원과 상호작용" });
    expect(within(panel).getByRole("status").textContent).toContain("Cleo");
    expect(within(panel).getByRole("status").textContent).toContain("거절됨");
    const picker = panel.querySelector(".studio-vspace-peer-picker")!;
    expect(within(picker as HTMLElement).getAllByRole("button").map((button) => button.textContent)).toEqual(["Bob", "Cleo"]);
  });
});


describe("Virtual Studio atmosphere preference storage", () => {
  const key = "toonspectrum:virtual-atmosphere:v1";

  it.each([["focus", "집중"], ["balanced", "일상"], ["lively", "활기"]] as const)(
    "persists and reloads only the %s presentation preference", async (mode, label) => {
      const writes = vi.spyOn(Storage.prototype, "setItem");
      const mounted = await mount();
      fireEvent.click(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: label }));
      expect(writes.mock.calls.filter(([writtenKey]) => writtenKey === key)).toEqual([[key, mode]]);
      mounted.unmount();
      await mount();
      expect(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    },
  );

  it("falls back to balanced without interpreting stored JSON as document or consent state", async () => {
    localStorage.setItem(key, JSON.stringify({ mode: "focus", document: { secret: "not-a-preference" } }));
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await mount();
    expect(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "일상" }).getAttribute("aria-pressed")).toBe("true");
    expect(writes.mock.calls.filter(([writtenKey]) => writtenKey === key)).toEqual([]);
    expect(f.request).not.toHaveBeenCalled();
  });

  it("applies focus for the session when persistence is blocked", async () => {
    await mount();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    fireEvent.click(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "집중" }));
    expect(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "집중" }).getAttribute("aria-pressed")).toBe("true");
    expect(f.socialOptions?.enabled).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
  });
});
