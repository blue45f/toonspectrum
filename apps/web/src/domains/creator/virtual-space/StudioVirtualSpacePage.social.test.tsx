// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioVirtualSpacePhaserCanvas } from "./StudioVirtualSpacePhaserCanvas";
import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import type { StudioVirtualSpacePresenceState } from "./studio-virtual-space-model";
import type { StudioLiveParticipant } from "../live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import type { StudioVirtualSpacePresenceDependencies } from "./studio-virtual-space-presence";
import { parseStudioVirtualSpacePacket } from "./studio-virtual-space-presence";
import { studioCharacterAppearanceForAvatarIndex } from "./studio-virtual-space-character-skins";
import { StudioVirtualSlotLeaseController } from "./studio-virtual-space-slot-lease";
import type { StudioSpaceSocialRequest, StudioSpaceSocialSnapshot } from "./StudioVirtualSpaceSocialPanel";
import type { useStudioVirtualSpaceSocial } from "./use-studio-virtual-space-social";
import { STUDIO_P2P_HUDDLE_OPEN_EVENT, STUDIO_P2P_HUDDLE_CLOSE_EVENT, STUDIO_P2P_HUDDLE_CLOSED_EVENT } from "../live/huddle/studio-p2p-huddle-events";
import { StudioVirtualSpacePage } from "./StudioVirtualSpacePage";

type Engine = ComponentProps<typeof StudioVirtualSpacePhaserCanvas>;
type ConversationOptions = Parameters<typeof import("./use-studio-virtual-space-conversation").useStudioVirtualSpaceConversation>[0];
type SocialOptions = Parameters<typeof useStudioVirtualSpaceSocial>[0];
const f = vi.hoisted(() => ({
  realPresence: false,
  presenceOverrides: {} as Record<string, Partial<StudioVirtualSpacePresenceState>>,
  worldLoad: null as Promise<StudioVirtualSpaceWorldManifest> | null,
  engine: null as Engine | null,
  socialOptions: null as SocialOptions | null,
  conversationOptions: null as ConversationOptions | null,
  conversationSnapshot: { available: true, readyPeers: [], records: [], active: null } as import("./studio-virtual-space-conversation").StudioConversationSnapshot,
  leaveConversation: vi.fn(),
  snapshot: { requests: [], readyPeerIds: ["bob", "cleo"], reviewReadyPeerIds: ["bob", "cleo"], blockedPeerIds: [], greetingReadyPeerIds: ["bob", "cleo"], greetings: [], available: true } as StudioSpaceSocialSnapshot,
  cancel: vi.fn((_id: string) => true),
  request: vi.fn((_id: string, _action: string) => "pending"),
  respond: vi.fn((_id: string, _response: string) => true),
  transport: () => null,
  connectivity: { serverAvailable: true, localOnly: false, mode: "online", browserOnline: true },
  live: { availability: "ready", room: {
    workId: "project-social", ready: false, authoritativeLockCapability: "fenced-v2",
    getLocks: () => [], subscribe: () => () => undefined,
    participant: { sessionId: "alice", displayName: "Alice", role: "editor" },
    direct: { getPeers: (): readonly StudioLiveParticipant[] => [], subscribe: () => () => undefined, send: (_target: string, _payload: string) => true },
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
    return { snapshot: f.snapshot, interactive: f.snapshot.available, cancel: f.cancel, request: f.request, respond: f.respond, requestReview: vi.fn(), respondReview: f.respond, setPeerBlocked: vi.fn(), wave: vi.fn() };
  },
}));
vi.mock("./use-studio-virtual-space-conversation", () => ({
  useStudioVirtualSpaceConversation: (options: ConversationOptions) => {
    f.conversationOptions = options;
    return { snapshot: f.conversationSnapshot, propose: vi.fn(), respond: vi.fn(), leave: f.leaveConversation };
  },
}));
vi.mock("./studio-virtual-space-presence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-virtual-space-presence")>();
  return { ...actual,
    STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS: 3000,
    StudioVirtualSpacePresenceController: class {
    private readonly real: InstanceType<typeof actual.StudioVirtualSpacePresenceController> | null;
    constructor(participant: StudioLiveParticipant, port: StudioLiveDirectPort, private self: StudioVirtualSpacePresenceState, dependencies?: StudioVirtualSpacePresenceDependencies) {
      this.real = f.realPresence ? new actual.StudioVirtualSpacePresenceController(participant, port, self, dependencies) : null;
    }
    setAvatarIndex(index: number) { this.real?.setAvatarIndex(index); }
    start() { this.real?.start(); }
    close() { this.real?.close(); }
    setActivity(activity: StudioVirtualSpacePresenceState["activity"]) { this.real?.setActivity(activity); }
    sendReaction() {}
    subscribe(listener: () => void) { return this.real?.subscribe(listener) ?? (() => undefined); }
    snapshot() {
      if (this.real) return this.real.snapshot();
      const peers = ["bob", "cleo"].map((id, index) => ({
        participant: { sessionId: id, displayName: index ? "Cleo" : "Bob", role: "editor" as const },
        state: { ...this.self, x: this.self.x + 20 + index * 15, y: this.self.y, ...f.presenceOverrides[id] }, lastSeen: Date.now(), sequence: 1,
      }));
      return { self: { ...this.self, ...f.presenceOverrides.alice }, peers, nearbyPeers: peers, selfReaction: null, peerReactions: [], direct: true };
    }
  },
}; });

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  f.worldLoad = null; f.engine = null; f.socialOptions = null; f.realPresence = false;
  f.live.room.ready = false;
  f.presenceOverrides = {};
  f.snapshot = { requests: [], readyPeerIds: ["bob", "cleo"], reviewReadyPeerIds: ["bob", "cleo"], blockedPeerIds: [], greetingReadyPeerIds: ["bob", "cleo"], greetings: [], available: true };
  f.cancel.mockClear(); f.request.mockClear(); f.respond.mockClear(); f.leaveConversation.mockClear();
  f.conversationSnapshot = { available: true, readyPeers: [], records: [], active: null }; f.conversationOptions = null;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
async function accept(request: StudioSpaceSocialRequest): Promise<void> {
  // A transport notification belongs to a committed Page subscription. Flush the
  // renderer refs/effects before delivering it, then await the resulting activity update.
  await act(async () => {});
  await act(async () => {
    f.snapshot = { ...f.snapshot, requests: [request, ...f.snapshot.requests] };
    f.socialOptions?.onAccepted(request);
  });
}

// The transport and renderer are boundaries; these tests execute the real Page's
// activity ownership, UI events, engine bridge and Huddle event integration.
describe("Virtual Studio social activity ownership", () => {
  it("ends the accepted outgoing follow and its visible ownership before starting an NPC tour", async () => {
    await mount();
    await accept(accepted("follow-before-tour", "follow"));
    expect(f.engine?.bridge.getFollowingPeer()).toBe("bob");
    expect(screen.getByRole("button", { name: "Bob 따라가는 중" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    fireEvent.click(screen.getByRole("button", { name: "가이드와 함께 둘러보기" }));
    expect(f.engine?.guideTourRequest).not.toBeNull();
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
    expect(f.cancel).toHaveBeenCalledExactlyOnceWith("follow-before-tour");
    expect(screen.queryByRole("button", { name: "Bob 따라가는 중" })).toBeNull();
  });

  it("fences a delayed slot release so an earlier seat choice cannot restart movement after tour start", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    f.live.room.ready = true;
    await mount();
    const slot = DEFAULT_STUDIO_WORLD_MANIFEST.interactionSlots![0]!;
    const useSlot = screen.getByRole("button", { name: `${slot.labelKo} 사용하기` });
    await waitFor(() => expect(useSlot.hasAttribute("disabled")).toBe(false));
    // Keep the real slots hook and its request generation. Defer only the
    // controller's release result at the asynchronous reservation boundary.
    let released!: () => void;
    const release = vi.spyOn(StudioVirtualSlotLeaseController.prototype, "release")
      .mockImplementationOnce(() => new Promise<void>((resolve) => { released = resolve; }));
    const move = vi.spyOn(f.engine!.bridge, "requestMove");
    fireEvent.click(useSlot);
    expect(release).toHaveBeenCalledOnce();
    expect(move).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    fireEvent.click(screen.getByRole("button", { name: "가이드와 함께 둘러보기" }));
    expect(f.engine?.guideTourRequest).not.toBeNull();
    await act(async () => { released(); });
    expect(move).not.toHaveBeenCalled();
    expect(f.engine?.bridge.consumeMoveTarget()).toBeNull();
    expect(screen.queryByText("자리로 이동·확인 중")).toBeNull();
  });

  it("starts an NPC tour only on request and fences stale guide status after cancellation or restart", async () => {
    await mount();
    expect(f.engine?.guideTourRequest).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    expect(f.engine?.guideTourRequest).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "가이드와 함께 둘러보기" }));
    const request = f.engine?.guideTourRequest;
    if (!request) throw new Error("Guide request was not sent to the renderer");
    act(() => f.engine?.onGuideTourChange?.({ requestId: "stale", guideId: request.guideId,
      status: "waiting-for-user", stopIndex: 0, stopCount: 4 }));
    expect(screen.queryByText("가이드가 가까이 오기를 기다리고 있어요.")).toBeNull();
    act(() => f.engine?.onGuideTourChange?.({ requestId: request.id, guideId: request.guideId,
      status: "waiting-for-user", stopIndex: 0, stopCount: 4 }));
    expect(screen.getByText("가이드가 가까이 오기를 기다리고 있어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "함께 둘러보기 멈추기" }));
    expect(f.engine?.guideTourRequest).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "가이드와 함께 둘러보기" }));
    expect(f.engine?.guideTourRequest?.id).not.toBe(request.id);
    act(() => f.engine?.onGuideTourChange?.({ requestId: request.id, guideId: request.guideId,
      status: "complete", stopIndex: 3, stopCount: 4 }));
    expect(screen.queryByText(/스튜디오를 한 바퀴 둘러봤어요/u)).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
  });

  it.each(["escape", "blur", "hidden", "focus"])("cancels the requested guide tour on %s without resuming automatically", async (reason) => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    fireEvent.click(screen.getByRole("button", { name: "가이드와 함께 둘러보기" }));
    expect(f.engine?.guideTourRequest).not.toBeNull();
    if (reason === "escape") fireEvent.keyDown(window, { key: "Escape" });
    if (reason === "blur") fireEvent.blur(window);
    if (reason === "hidden") {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      fireEvent(document, new Event("visibilitychange"));
    }
    if (reason === "focus") fireEvent.click(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "집중" }));
    expect(f.engine?.guideTourRequest).toBeNull();
    fireEvent.focus(window);
    if (reason === "focus") fireEvent.click(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "일상" }));
    expect(f.engine?.guideTourRequest).toBeNull();
  });

  it("passes the renderer's current presence and world readiness to both acoustic consent boundaries", async () => {
    let finish!: (world: StudioVirtualSpaceWorldManifest) => void;
    f.worldLoad = new Promise((resolve) => { finish = resolve; });
    render(<MemoryRouter initialEntries={["/studio/project-social/virtual"]}>
      <Routes><Route path="/studio/:projectId/virtual" element={<StudioVirtualSpacePage />} /></Routes>
    </MemoryRouter>);
    expect(f.socialOptions?.acousticBindingAvailable).toBe(false);
    expect(f.conversationOptions?.acousticBindingAvailable).toBe(false);
    await act(async () => { finish(DEFAULT_STUDIO_WORLD_MANIFEST); });
    await screen.findByTestId("engine-ready");
    await waitFor(() => expect(f.socialOptions?.acousticBindingAvailable).toBe(true));
    expect(f.socialOptions?.presence).toBe(f.engine?.snapshot);
    expect(f.conversationOptions?.presence).toBe(f.engine?.snapshot);
    expect(f.conversationOptions?.acousticBindingAvailable).toBe(true);
  });

  it("uses the same stable character and unknown-skin fallback in every self and peer thumbnail", async () => {
    f.presenceOverrides = {
      alice: { avatarIndex: 0, appearance: studioCharacterAppearanceForAvatarIndex(2) },
      bob: { avatarIndex: 0, appearance: studioCharacterAppearanceForAvatarIndex(1) },
      cleo: { avatarIndex: 3, appearance: { ...studioCharacterAppearanceForAvatarIndex(3), skinKey: "future-character" } },
    };
    const view = await mount();
    const src = (skin: string) => `/assets/virtual-studio/production-v2/player-${skin}-direction-down.png`;
    const surfaces = [
      [".vs2-stack", ["dark", "silver", "pink"]],
      [".vs2-self", ["dark"]],
      [".vs2-live-huddle", ["silver", "pink"]],
      [".vs2-live-chat-body", ["silver", "pink"]],
      [".vs2-live-members", ["dark", "silver", "pink"]],
    ] as const;
    for (const [selector, skins] of surfaces) {
      const images = view.container.querySelectorAll(`${selector} img.studio-vspace-reference-compact-player`);
      expect([...images].map((image) => image.getAttribute("src")), selector).toEqual(skins.map(src));
    }
    expect(f.engine?.snapshot.self.appearance?.skinKey).toBe("dark");
    expect(f.engine?.snapshot.peers[0]?.state.appearance?.skinKey).toBe("silver");
    expect(f.request).not.toHaveBeenCalled();
  });

  it("uses only mutually supported activity images in teammate thumbnails", async () => {
    const appearance = studioCharacterAppearanceForAvatarIndex(0);
    f.presenceOverrides = {
      bob: { avatarIndex: 3, activity: "reviewing", appearance },
      cleo: { avatarIndex: 3, activity: "reviewing", appearance: { ...appearance, capabilities: ["idle"] } },
    };
    const view = await mount();
    const images = view.container.querySelectorAll(".vs2-live-chat-body img.studio-vspace-reference-compact-player");
    expect([...images].map((image) => image.getAttribute("src"))).toEqual([
      "/assets/virtual-studio/production-v2/player-pink-state-review.png",
      "/assets/virtual-studio/production-v2/player-pink-direction-down.png",
    ]);
  });

  it("uses one self identity for legacy automatic thumbnails without an appearance descriptor", async () => {
    f.presenceOverrides = { alice: { avatarIndex: -1, appearance: undefined } };
    const view = await mount();
    const key = studioCharacterAppearanceForAvatarIndex(-1, "alice").skinKey;
    for (const selector of [".vs2-stack", ".vs2-self", ".vs2-live-members"]) {
      expect(view.container.querySelector(`${selector} img.studio-vspace-reference-compact-player`)?.getAttribute("src"), selector)
        .toBe(`/assets/virtual-studio/production-v2/player-${key}-direction-down.png`);
    }
  });

  it("advertises the Page's current registered character through the real direct presence controller", async () => {
    f.realPresence = true;
    vi.spyOn(f.live.room.direct, "getPeers").mockReturnValue([{ sessionId: "bob", displayName: "Bob", role: "editor" }]);
    const send = vi.spyOn(f.live.room.direct, "send");
    render(<MemoryRouter initialEntries={["/studio/project-social/virtual"]}>
      <Routes><Route path="/studio/:projectId/virtual" element={<StudioVirtualSpacePage />} /></Routes>
    </MemoryRouter>);
    await screen.findByTestId("engine-ready");
    await waitFor(() => expect(send).toHaveBeenCalled());
    const first = parseStudioVirtualSpacePacket(send.mock.calls[0]![1]);
    expect(first?.kind).toBe("presence");
    if (first?.kind !== "presence") throw new Error("Page did not advertise spatial presence");
    expect(first.state.appearance).toEqual(studioCharacterAppearanceForAvatarIndex(first.state.avatarIndex, "alice"));

    fireEvent.click(screen.getByRole("button", { name: "시나 캐릭터 선택" }));
    await waitFor(() => {
      const advertised = send.mock.calls.map(([, raw]) => parseStudioVirtualSpacePacket(raw));
      expect(advertised.some((packet) => packet?.kind === "presence" && packet.state.appearance?.skinKey === "silver" && packet.state.avatarIndex === 1)).toBe(true);
    });
    expect(f.engine?.snapshot.self.appearance).toEqual(studioCharacterAppearanceForAvatarIndex(1, "alice"));
  });
  it("replaces pair ownership with an exact consented group, and leaves it before another pair activity", async () => {
    await mount();
    await accept(accepted("pair-before-group", "talk"));
    const open = vi.fn(), close = vi.fn();
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, open);
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, close);
    try {
      const scope = { id: "consented-group", memberIds: ["alice", "bob", "cleo"] };
      f.conversationSnapshot = { ...f.conversationSnapshot, active: scope };
      act(() => { f.conversationOptions?.onReady(scope); });
      expect(f.cancel).toHaveBeenCalledWith("pair-before-group");
      expect((close.mock.calls[0]?.[0] as CustomEvent).detail.conversationId).toBe("pair-before-group");
      expect((open.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ conversationId: scope.id, peerIds: ["bob", "cleo"], source: "virtual-space" });
      expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
      await accept(accepted("follow-after-group", "follow"));
      expect(f.leaveConversation).toHaveBeenCalledExactlyOnceWith(scope.id);
      expect(f.engine?.bridge.getFollowingPeer()).toBe("bob");
    } finally {
      globalThis.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, open);
      globalThis.removeEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, close);
    }
  });
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
      await accept(accepted("epoch:1.4", "talk"));
      expect(open).toHaveBeenCalledOnce();
      expect((open.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ conversationId: "epoch:1.4", peerIds: ["bob"], source: "virtual-space" });
      fireEvent.click(screen.getByRole("button", { name: "Cleo" }));
      expect(open).toHaveBeenCalledOnce();
    } finally { globalThis.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, open); }
  });

  it("cancels the previous accepted follow before replacing it with another person's review", async () => {
    await mount();
    const bridge = f.engine!.bridge;
    const transitions = vi.spyOn(bridge, "setFollowingPeer");
    await accept(accepted("follow-one", "follow"));
    expect(transitions).toHaveBeenCalledWith("bob");
    expect(bridge.getFollowingPeer()).toBe("bob");
    await accept(accepted("review-two", "review", "cleo"));
    expect(f.cancel).toHaveBeenCalledWith("follow-one");
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
    expect(screen.getByRole("heading", { name: "함께 검토하기" })).toBeTruthy();
    expect(f.cancel).not.toHaveBeenCalledWith("review-two");
  });

  it.each(["engine", "peer-selection"])("ends follow consent when %s cancels manual movement ownership", async (source) => {
    await mount();
    await accept(accepted("follow-one", "follow"));
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
    await accept(accepted("follow-one", "follow"));
    fireEvent.click(screen.getByRole("button", { name: "집중" }));
    expect(f.cancel).toHaveBeenCalledWith("follow-one");
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
    expect(f.socialOptions?.enabled).toBe(false);
    expect((screen.getByRole("button", { name: "대화 요청" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ignores unrelated Huddle notifications and ends the matching social activity exactly once", async () => {
    await mount();
    await accept(accepted("conversation-current", "talk"));
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
    await accept(accepted("follow-one", "follow"));
    f.snapshot = { requests: [], readyPeerIds: [], reviewReadyPeerIds: [], blockedPeerIds: [], greetingReadyPeerIds: ["bob", "cleo"], greetings: [], available: false };
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
