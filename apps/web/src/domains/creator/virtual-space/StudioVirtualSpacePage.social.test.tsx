// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import { writeStudioVirtualSpaceEntryPreference } from "./studio-virtual-space-entry-preference";

type Engine = ComponentProps<typeof StudioVirtualSpacePhaserCanvas>;
type ConversationOptions = Parameters<typeof import("./use-studio-virtual-space-conversation").useStudioVirtualSpaceConversation>[0];
type SocialOptions = Parameters<typeof useStudioVirtualSpaceSocial>[0];
const f = vi.hoisted(() => ({
  worldPublication: null as ReturnType<typeof import("./world-publication/use-studio-world-publication").useStudioWorldPublication> | null,
  realPresence: false,
  presenceOverrides: {} as Record<string, Partial<StudioVirtualSpacePresenceState>>,
  worldLoad: null as Promise<StudioVirtualSpaceWorldManifest> | null,
  engine: null as Engine | null,
  socialOptions: null as SocialOptions | null,
  conversationOptions: null as ConversationOptions | null,
  privateOptions: null as Parameters<typeof import("./private-room/use-studio-private-room").useStudioPrivateRoom>[0] | null,
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
vi.mock("./world-publication/use-studio-world-publication", async () => {
  const { EMPTY_WORLD_PUBLICATION } = await import("./world-publication/studio-world-publication-controller");
  return { useStudioWorldPublication: () => f.worldPublication ?? ({ enabled: false, snapshot: EMPTY_WORLD_PUBLICATION, refresh: vi.fn(), publish: vi.fn() }) };
});
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => f.session }));
vi.mock("./private-room/use-studio-private-room",()=>({useStudioPrivateRoom:(options:Parameters<typeof import("./private-room/use-studio-private-room").useStudioPrivateRoom>[0])=>{
  f.privateOptions=options;return {snapshot:{door:null,team:null,session:null,conversations:[],candidates:[],busy:false,uncertain:false,reason:null},controller:null,available:false,entryReason:"outside"};
}}));
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

// jsdom has no native dialog implementation; real focus/escape is exercised in browser QA.
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
async function showPanel(panel: "people" | "space") {
  const title = panel === "space" ? "공간과 꾸미기" : "사람과 대화";
  if (screen.queryByRole("dialog", { name: title })) return;
  if (screen.queryByRole("dialog")) fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: panel === "space" ? "공간·꾸미기" : /^사람·대화/u }));
    // 실제 패널을 연 뒤 모듈 로딩을 기다린다. 테스트 서버 변환 시간은 UI 반응 시간과 분리한다.
    if (panel === "space") await Promise.all([
      import("./StudioVirtualSpacePlaceGallery"), import("./StudioVirtualSpaceRoomCatalog"),
      import("./StudioVirtualSpaceNpcPanel"), import("./StudioVirtualSpaceSeatsPanel"), import("./private-room/StudioPrivateRoomPanel"),
    ]);
    else await Promise.all([import("./StudioVirtualSpaceSocialPanel"), import("./StudioVirtualSpaceConversationPanel")]);
  });
  await waitFor(() => expect(within(screen.getByRole("dialog", { name: title })).queryAllByText("패널 불러오는 중…")).toHaveLength(0));
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  writeStudioVirtualSpaceEntryPreference(0);
  f.worldPublication = null; f.worldLoad = null; f.engine = null; f.socialOptions = null; f.realPresence = false;
  f.live.room.ready = false;
  f.presenceOverrides = {};
  f.snapshot = { requests: [], readyPeerIds: ["bob", "cleo"], reviewReadyPeerIds: ["bob", "cleo"], blockedPeerIds: [], greetingReadyPeerIds: ["bob", "cleo"], greetings: [], available: true };
  f.cancel.mockClear(); f.request.mockClear(); f.respond.mockClear(); f.leaveConversation.mockClear();
  f.conversationSnapshot = { available: true, readyPeers: [], records: [], active: null }; f.conversationOptions = null;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function mount(panel: "people" | "space" | null = "people") {
  const mounted = render(<MemoryRouter initialEntries={["/studio/project-social/virtual"]}>
    <Routes><Route path="/studio/:projectId/virtual" element={<StudioVirtualSpacePage />} /></Routes>
  </MemoryRouter>);
  await screen.findByTestId("engine-ready");
  await waitFor(() => expect(f.engine?.snapshot.peers).toHaveLength(2));
  if (panel) await showPanel(panel);
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
  it("프로젝트 환경 설정에서 모바일 전용 메뉴 밖의 실시간 연결 진단을 연다", async () => {
    await mount("space");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "환경 설정" }));
      await import("./StudioVirtualSpaceExperiencePanel");
    });
    const openDiagnostics = screen.getByRole("button", { name: "실시간 연결 상태" });
    expect(openDiagnostics.closest(".studio-vspace-mobile-more-grid")).toBeNull();
    await act(async () => {
      fireEvent.click(openDiagnostics);
      await import("./StudioVirtualSpaceRtcPanel");
    });
    expect(screen.getByRole("dialog", { name: "실시간 연결 상태" })).toBeTruthy();
    expect(await screen.findByRole("region", { name: "실시간 협업 진단" })).toBeTruthy();
  });
  it("외형에서 저장하지 않은 닉네임을 다른 설정 탭에 다녀온 뒤에도 보존한다", async () => {
    await mount("space");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "꾸미기" }));
      await import("./StudioVirtualSpaceCustomizationPanel");
    });
    const nameInput = await screen.findByRole("textbox", { name: "공개 이름" });
    fireEvent.change(nameInput, { target: { value: "저장 전 닉네임" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "환경 설정" }));
      await import("./StudioVirtualSpaceExperiencePanel");
    });
    expect(screen.queryByRole("textbox", { name: "공개 이름" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "꾸미기" }));
    expect(screen.getByDisplayValue("저장 전 닉네임")).toBeTruthy();
    expect(screen.getByRole("button", { name: "저장" }).hasAttribute("disabled")).toBe(false);
  });
  it("개인 공간은 프로젝트 전용 패널을 숨기고 캐릭터와 장소 설정을 유지한다", async () => {
    render(<MemoryRouter initialEntries={["/studio/personal-local/virtual?activity=board"]}>
      <Routes><Route path="/studio/:projectId/virtual" element={<StudioVirtualSpacePage personal />} /></Routes>
    </MemoryRouter>);
    await screen.findByTestId("engine-ready");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "P2P 화이트보드" })).toBeNull();
    expect(screen.queryByRole("button", { name: "오늘" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "내 캐릭터" }));
    await screen.findByRole("dialog", { name: "내 캐릭터" });
    expect(screen.queryByRole("button", { name: "대화 요청" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
    await showPanel("space");
    expect(screen.queryByRole("region", { name: "비공개 대화방" })).toBeNull();
    expect(screen.queryByRole("region", { name: "함께 쓰는 작업 자리" })).toBeNull();
    expect(screen.getByRole("button", { name: "장소" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "환경 설정" }));
      await import("./StudioVirtualSpaceExperiencePanel");
    });
    await waitFor(() => expect(screen.queryAllByText("패널 불러오는 중…")).toHaveLength(0));
    expect(screen.queryByRole("button", { name: "게시 공간 확인·적용" })).toBeNull();
    expect(screen.queryByRole("button", { name: "실시간 연결 상태" })).toBeNull();
  });
  it("starts with one closed inspector and opening or closing it grants no social consent", async () => {
    await mount(null);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".vs2-bottom")).toBeNull();
    await showPanel("people");
    expect(screen.getByRole("dialog", { name: "사람과 대화" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
  });
  it("ends the accepted outgoing follow and its visible ownership before starting an NPC tour", async () => {
    await mount();
    await accept(accepted("follow-before-tour", "follow"));
    expect(f.engine?.bridge.getFollowingPeer()).toBe("bob");
    expect(screen.getByRole("button", { name: "Bob 따라가는 중" })).toBeTruthy();
    await showPanel("space");
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
    await showPanel("space");
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
    await showPanel("space");
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
    await showPanel("space");
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
    await showPanel("space");
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
      [".studio-vspace-peer-picker", ["silver", "pink"]],
      [".vs2-live-members", ["dark"]],
    ] as const;
    for (const [selector, skins] of surfaces) {
      const images = view.container.querySelectorAll(`${selector} img.studio-vspace-reference-compact-player`);
      expect([...images].map((image) => image.getAttribute("src")), selector).toEqual(skins.map(src));
    }
    expect(view.container.querySelector(".vs2-live-huddle, .vs2-live-chat-body")).toBeNull();
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
    const images = view.container.querySelectorAll(".studio-vspace-peer-picker img.studio-vspace-reference-compact-player");
    expect([...images].map((image) => image.getAttribute("src"))).toEqual([
      "/assets/virtual-studio/production-v2/player-pink-state-review.png",
      "/assets/virtual-studio/production-v2/player-pink-direction-down.png",
    ]);
  });

  it("uses one self identity for legacy automatic thumbnails without an appearance descriptor", async () => {
    f.presenceOverrides = { alice: { avatarIndex: -1, appearance: undefined } };
    const view = await mount();
    const key = studioCharacterAppearanceForAvatarIndex(-1, "alice").skinKey;
    for (const selector of [".vs2-stack", ".vs2-live-members"]) {
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

    await showPanel("people");
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
    render(<MemoryRouter initialEntries={["/studio/project-social/virtual?worldEdit=1"]}>
      <Routes><Route path="/studio/:projectId/virtual" element={<StudioVirtualSpacePage />} /></Routes>
    </MemoryRouter>);
    expect(screen.getByText("공간 데이터 불러오는 중…")).toBeTruthy();
    expect(screen.queryByTestId("engine-ready")).toBeNull();
    expect(screen.queryByRole("region", { name: "스튜디오 도우미 NPC" })).toBeNull();
    expect(screen.queryByRole("button", { name: "E · 방 열기" })).toBeNull();
    expect(document.querySelector(".studio-vspace-minimap")).toBeNull();
    expect(document.querySelector(".workspace-live-room-links")).toBeNull();
    expect(f.socialOptions?.enabled).toBe(false);
    await act(async () => { finishLoad(DEFAULT_STUDIO_WORLD_MANIFEST); });
    await screen.findByTestId("engine-ready");
    await showPanel("space");
    expect(screen.getByRole("region", { name: "스튜디오 도우미 NPC" })).toBeTruthy();
    expect(document.querySelector(".workspace-live-room-links")).not.toBeNull();
  });

  it("opens a scoped talk only on the accepted callback and never from peer selection or rerender", async () => {
    await mount();
    const open = vi.fn();
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, open);
    try {
      await showPanel("people");
      fireEvent.click(screen.getByRole("button", { name: "Bob" }));
      fireEvent.click(screen.getByRole("button", { name: "대화 요청" }));
      expect(f.request).toHaveBeenCalledWith("bob", "talk");
      expect(open).not.toHaveBeenCalled();
      await accept(accepted("epoch:1.4", "talk"));
      expect(open).toHaveBeenCalledOnce();
      expect((open.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ conversationId: "epoch:1.4", peerIds: ["bob"], source: "virtual-space" });
      await showPanel("people");
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
    await showPanel("space");
    fireEvent.click(screen.getByRole("button", { name: "집중" }));
    expect(f.cancel).toHaveBeenCalledWith("follow-one");
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
    expect(f.socialOptions?.enabled).toBe(false);
    await showPanel("people");
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
    await showPanel("people");
    fireEvent.click(screen.getByRole("button", { name: "Cleo" }));
    await waitFor(() => expect(f.cancel).toHaveBeenCalledWith("follow-one"));
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
  });

  it("keeps incoming acceptance behind an explicit button and leaves decline available during focus", async () => {
    await mount();
    const incoming = { ...accepted("incoming-one", "review"), status: "offered" as const, direction: "incoming" as const };
    f.snapshot = { ...f.snapshot, requests: [incoming] };
    await showPanel("people");
    fireEvent.click(screen.getByRole("button", { name: "Bob" }));
    expect(f.respond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "수락" }));
    expect(f.respond).toHaveBeenCalledExactlyOnceWith("incoming-one", "accept");
    await showPanel("space");
    fireEvent.click(screen.getByRole("button", { name: "집중" }));
    await showPanel("people");
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
    await showPanel("people");
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
      const mounted = await mount("space");
      fireEvent.click(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: label }));
      expect(writes.mock.calls.filter(([writtenKey]) => writtenKey === key)).toEqual([[key, mode]]);
      mounted.unmount();
      await mount("space");
      expect(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    },
  );

  it("falls back to balanced without interpreting stored JSON as document or consent state", async () => {
    localStorage.setItem(key, JSON.stringify({ mode: "focus", document: { secret: "not-a-preference" } }));
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await mount("space");
    expect(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "일상" }).getAttribute("aria-pressed")).toBe("true");
    expect(writes.mock.calls.filter(([writtenKey]) => writtenKey === key)).toEqual([]);
    expect(f.request).not.toHaveBeenCalled();
  });

  it("applies focus for the session when persistence is blocked", async () => {
    await mount("space");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    fireEvent.click(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "집중" }));
    expect(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "집중" }).getAttribute("aria-pressed")).toBe("true");
    expect(f.socialOptions?.enabled).toBe(false);
    expect(localStorage.getItem(key)).toBeNull();
  });
});


describe("published world Page transition", () => {
  it("uses the authored room name and queues a reachable walk without moving the avatar or opening admission", async () => {
    const { EMPTY_WORLD_PUBLICATION } = await import("./world-publication/studio-world-publication-controller");
    const { studioWorldPublishManifest } = await import("./world-publication/studio-world-publication-client");
    const room = DEFAULT_STUDIO_WORLD_MANIFEST.rooms[0]!;
    const manifest = { ...DEFAULT_STUDIO_WORLD_MANIFEST, colliders: [], props: [],
      acousticZones: [{ id: "private-zone", roomId: room.id, x: 100, y: 100, width: 80, height: 80,
        policy: "private" as const, doorId: "door" }] };
    const active = { publication: { contract: "studio-world-publication-v1" as const, workId: "project-social",
      projectId: "graph-1", artifactId: "world-room-test", revisionId: "published-room-test",
      previousPublishedRevisionId: null, contentHash: "c".repeat(64), sequence: 1, publishedBy: "alice",
      publishedAt: "2026-09-20T00:00:00.000Z", manifest: studioWorldPublishManifest(manifest) },
      scope: "d".repeat(64), assetUrls: new Map([[manifest.backgroundUrl, "blob:published-room-test"]]), dispose: vi.fn() };
    f.worldPublication = { enabled: true, refresh: vi.fn(async () => true), publish: vi.fn(async () => true),
      reviewDraftBase: vi.fn(async () => null), snapshot: { ...EMPTY_WORLD_PUBLICATION, phase: "ready",
        viewVerified: true, hasPublishedWorld: true, active,
        authority: { publication: active.publication, canPublish: true, expiresAt: Date.now() + 15_000 } } };
    await mount("space");
    expect(screen.getByRole("option", { name: room.labelKo })).toBeTruthy();
    const before = { ...f.engine!.snapshot.self };
    fireEvent.click(screen.getByRole("button", { name: "이 방으로 걸어가기" }));
    expect(f.engine!.bridge.consumeMoveTarget()).toEqual({ x: 140, y: 140 });
    expect(f.engine!.snapshot.self).toEqual(before);
    expect(f.privateOptions?.world).toEqual({ worldId: active.publication.manifest.id,
      revisionId: active.publication.revisionId, contentHash: active.publication.contentHash });
    expect(screen.getByRole("button", { name: "이 구역에서 입장 확인" })).toHaveProperty("disabled", true);
  });
  it("retains accepted ownership on unchanged renewal, then closes it and safely spawns on a new exact revision", async () => {
    const { EMPTY_WORLD_PUBLICATION } = await import("./world-publication/studio-world-publication-controller");
    const { studioWorldPublishManifest } = await import("./world-publication/studio-world-publication-client");
    const { studioWorldSpawn } = await import("./studio-virtual-space-world-manifest");
    const first = { publication: { contract: "studio-world-publication-v1" as const, workId: "project-social", projectId: "graph-1", artifactId: "world-1",
      revisionId: "published-1", previousPublishedRevisionId: null, contentHash: "a".repeat(64), sequence: 1, publishedBy: "alice", publishedAt: "2026-09-20T00:00:00.000Z",
      manifest: studioWorldPublishManifest(DEFAULT_STUDIO_WORLD_MANIFEST) }, scope: "a".repeat(64), assetUrls: new Map([[DEFAULT_STUDIO_WORLD_MANIFEST.backgroundUrl, "blob:first-world"]]), dispose: vi.fn() };
    f.worldPublication = { enabled: true, refresh: vi.fn(async () => true), publish: vi.fn(async () => true), reviewDraftBase: vi.fn(async () => null),
      snapshot: { ...EMPTY_WORLD_PUBLICATION, phase: "ready", viewVerified: true, hasPublishedWorld: true, active: first,
        authority: { publication: first.publication, canPublish: true, expiresAt: Date.now() + 15_000 } } };
    const mounted = await mount(); await accept(accepted("world-follow", "follow")); const oldBridge = f.engine!.bridge;
    expect(oldBridge.getFollowingPeer()).toBe("bob"); expect(f.engine?.worldAssetUrls).toBe(first.assetUrls);
    expect(f.privateOptions?.world).toEqual({worldId:first.publication.manifest.id,revisionId:first.publication.revisionId,contentHash:first.publication.contentHash});
    const rerender = () => mounted.rerender(<MemoryRouter initialEntries={["/studio/project-social/virtual"]}>
      <Routes><Route path="/studio/:projectId/virtual" element={<StudioVirtualSpacePage />} /></Routes></MemoryRouter>);
    f.worldPublication = { ...f.worldPublication, snapshot: { ...f.worldPublication.snapshot, authority: { ...f.worldPublication.snapshot.authority!, expiresAt: Date.now() + 30_000 } } };
    rerender(); await act(async () => {}); expect(f.engine?.bridge).toBe(oldBridge); expect(oldBridge.getFollowingPeer()).toBe("bob");
    const closes: string[] = [], closed = (event: Event) => closes.push((event as CustomEvent<{ conversationId: string }>).detail.conversationId);
    window.addEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, closed);
    try {
      const second = { ...first, publication: { ...first.publication, revisionId: "published-undo", sequence: 2 }, scope: "b".repeat(64) };
      f.worldPublication = { ...f.worldPublication, snapshot: { ...f.worldPublication.snapshot, active: second } };
      rerender(); await waitFor(() => expect(f.engine?.bridge).not.toBe(oldBridge)); await screen.findByTestId("engine-ready");
      expect(f.engine?.bridge.getFollowingPeer()).toBeNull(); expect(closes).toContain("world-follow");
      expect(f.engine?.snapshot.self).toMatchObject(studioWorldSpawn(second.publication.manifest).point);
      expect(f.socialOptions?.publishedScope).toBe(second.scope); expect(f.conversationOptions?.publishedScope).toBe(second.scope);
      expect(f.privateOptions?.world).toEqual({worldId:second.publication.manifest.id,revisionId:second.publication.revisionId,contentHash:second.publication.contentHash});
    } finally { window.removeEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, closed); }
  });
});
