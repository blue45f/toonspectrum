// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioVirtualSpacePhaserCanvas } from "./StudioVirtualSpacePhaserCanvas";
import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldSpawn, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
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
import { STUDIO_VIRTUAL_SPACE_TOUR_STORAGE_KEY, writeStudioVirtualSpaceEntryPreference } from "./studio-virtual-space-entry-preference";
import { createProductionDemoProject } from "../production-hub/production-demo";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";
import { resolveStudioVirtualBuiltinWorld } from "./studio-virtual-space-campus-world";
import { studioVirtualPersonalDeskPoint } from "./studio-virtual-space-office-navigation";
import { findStudioWorldPath, resolveStudioWorldSpawn, studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import { readStudioVirtualSpaceSessionPoint, studioVirtualSpacePositionScope, writeStudioVirtualSpaceSessionPoint } from "./studio-virtual-space-session-position";
import { studioTownActiveEvent, studioTownEvents } from "./studio-virtual-space-town-program";
import { readStudioVirtualPlaceId, studioVirtualPlaceById } from "./studio-virtual-space-place-world";
import { spaceKoParticle } from "./hud/space-korean";

type Engine = ComponentProps<typeof StudioVirtualSpacePhaserCanvas>;
type ConversationOptions = Parameters<typeof import("./use-studio-virtual-space-conversation").useStudioVirtualSpaceConversation>[0];
type SocialOptions = Parameters<typeof useStudioVirtualSpaceSocial>[0];
const f = vi.hoisted(() => ({
  worldPublication: null as ReturnType<typeof import("./world-publication/use-studio-world-publication").useStudioWorldPublication> | null,
  realPresence: false,
  presenceOverrides: {} as Record<string, Partial<StudioVirtualSpacePresenceState>>,
  worldLoad: null as Promise<StudioVirtualSpaceWorldManifest> | null,
  operations: { phase: "ready", project: null, inbox: [], calendar: [], error: null } as StudioVirtualOperationsSnapshot,
  refreshOperations: vi.fn(),
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
  location: "",
}));
vi.mock("./world-publication/use-studio-world-publication", async () => {
  const { EMPTY_WORLD_PUBLICATION } = await import("./world-publication/studio-world-publication-controller");
  return { useStudioWorldPublication: () => f.worldPublication ?? ({ enabled: false, snapshot: EMPTY_WORLD_PUBLICATION, refresh: vi.fn(), publish: vi.fn() }) };
});
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => f.session }));
vi.mock("./use-studio-virtual-space-operations", () => ({ useStudioVirtualSpaceOperations: () => ({ snapshot: f.operations, refresh: f.refreshOperations }) }));
// 소셜 동선의 가구 목록은 정상 빈 응답으로 고정하고, HTTP·업로드 계약은 client 테스트에서 검증한다.
vi.mock("./studio-virtual-custom-furniture-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-virtual-custom-furniture-client")>(),
  listStudioVirtualCustomFurniture: vi.fn(async () => []),
}));
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
    update(...args: Parameters<InstanceType<typeof actual.StudioVirtualSpacePresenceController>["update"]>) {
      this.real?.update(...args);
      const [point, facing = this.self.facing, activity = this.self.activity, moving = this.self.moving, avatarIndex = this.self.avatarIndex, zoneId = this.self.zoneId] = args;
      this.self = { ...this.self, ...point, facing, activity, moving, avatarIndex, zoneId };
    }
    sendReaction() {}
    subscribe(listener: () => void) { return this.real?.subscribe(listener) ?? (() => undefined); }
    snapshot() {
      if (this.real) return this.real.snapshot();
      const peers = ["bob", "cleo"].map((id, index) => ({
        participant: { sessionId: id, displayName: index ? "Cleo" : "Bob", role: "editor" as const },
        state: { ...this.self, x: this.self.x + 20 + index * 15, y: this.self.y, ...f.presenceOverrides[id] }, lastSeen: Date.now(), sequence: 1,
      }));
      return { self: { ...this.self, ...f.presenceOverrides.alice }, peers, nearbyPeers: peers, selfReaction: null, peerReactions: [], chatMessages: [], chatBubbles: [], selfChatBubble: null, peerTyping: [], direct: true };
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

type HudTab = "people" | "chat" | "today" | "places" | "build" | "settings";
const TAB_LABELS: Readonly<Record<HudTab, string>> = { people: "참가자", chat: "대화", today: "오늘", places: "장소", build: "꾸미기", settings: "설정" };
const TAB_TITLES: Readonly<Record<HudTab, string>> = { people: "참가자", chat: "대화", today: "오늘의 제작 동선", places: "장소와 이동", build: "꾸미기", settings: "설정" };
const TAB_MODULES: Readonly<Record<HudTab, () => Promise<unknown>[]>> = {
  people: () => [import("./StudioVirtualSpaceSocialPanel"), import("./StudioVirtualSpaceNpcPanel")],
  chat: () => [import("./StudioVirtualSpaceConversationPanel")],
  today: () => [import("./StudioVirtualSpaceTodayBoard")],
  places: () => [import("./StudioVirtualSpacePlaceGallery"), import("./StudioVirtualSpaceRoomCatalog"), import("./private-room/StudioPrivateRoomPanel")],
  build: () => [import("./StudioVirtualSpaceCustomizationPanel")],
  settings: () => [import("./StudioVirtualSpaceExperiencePanel"), import("./StudioVirtualSpaceEnvironmentPanel"), import("./world-publication/StudioWorldPublicationPanel")],
};
const placeButton = (placeId: string) => `${spaceKoParticle(studioVirtualPlaceById(placeId).labelKo, "으로")} 이동`;
const rememberDesk = (label: string) => `${spaceKoParticle(label, "을")} 내 자리로 기억`;

function sidePanel(): HTMLElement | null {
  const panel = document.getElementById("studio-space-side-panel");
  return panel && !panel.hasAttribute("hidden") ? panel : null;
}
/** 도크의 참가자 버튼으로 우측 패널을 열고 탭을 고른다. 데스크톱 패널은 비모달 complementary다. */
async function openTab(tab: HudTab): Promise<HTMLElement> {
  if (!sidePanel()) fireEvent.click(screen.getByRole("button", { name: "참가자" }));
  const opened = sidePanel();
  if (!opened) throw new Error("우측 패널이 열려야 합니다.");
  fireEvent.click(within(opened).getByRole("tab", { name: TAB_LABELS[tab] }));
  // 실제 패널을 연 뒤 모듈 로딩을 기다린다. 테스트 서버 변환 시간은 UI 반응 시간과 분리한다.
  await act(async () => { await Promise.all(TAB_MODULES[tab]()); });
  const region = await screen.findByRole("complementary", { name: TAB_TITLES[tab] });
  await waitFor(() => expect(within(region).queryAllByText("패널 불러오는 중…")).toHaveLength(0));
  return region;
}
async function openMoreItem(id: string): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "더보기" }));
  const item = document.querySelector<HTMLButtonElement>(`[data-menu-item="${id}"]`);
  if (!item) throw new Error(`더보기 메뉴 항목이 필요합니다: ${id}`);
  fireEvent.click(item);
}
async function openWorkStart(): Promise<HTMLElement> {
  const trigger = document.querySelector<HTMLButtonElement>('[data-workspace-primary-action="true"]');
  if (!trigger) throw new Error("작업 시작 주 버튼이 필요합니다.");
  fireEvent.click(trigger);
  return screen.findByRole("region", { name: "스튜디오에서 작업 시작" });
}
async function openOfficeSeats(): Promise<HTMLElement> {
  await openMoreItem("seats");
  await act(async () => { await import("./StudioVirtualSpaceSeatsPanel"); });
  const panel = await screen.findByRole("complementary", { name: "내 작업 자리" });
  await waitFor(() => expect(within(panel).queryAllByText("패널 불러오는 중…")).toHaveLength(0));
  return panel;
}
function LocationProbe() {
  const location = useLocation();
  const current = `${location.pathname}${location.search}`;
  useEffect(() => { f.location = current; }, [current]);
  return null;
}
function roomContains(manifest: StudioVirtualSpaceWorldManifest, roomId: string, point: { x: number; y: number } | null | undefined): boolean {
  const room = manifest.rooms.find((candidate) => candidate.id === roomId);
  return Boolean(room && point && point.x >= room.x && point.x <= room.x + room.width && point.y >= room.y && point.y <= room.y + room.height);
}
function walkablePoints(manifest: StudioVirtualSpaceWorldManifest, roomId?: string): { x: number; y: number }[] {
  const room = roomId ? manifest.rooms.find((candidate) => candidate.id === roomId) : undefined;
  if (roomId && !room) throw new Error(`방이 필요합니다: ${roomId}`);
  const area = room ?? { x: 0, y: 0, width: manifest.width, height: manifest.height };
  const points: { x: number; y: number }[] = [];
  for (let y = area.y + 24; y < area.y + area.height - 24; y += 32) {
    for (let x = area.x + 24; x < area.x + area.width - 24; x += 32) if (studioWorldCanOccupy(manifest, { x, y })) points.push({ x, y });
  }
  return points;
}
/** 같은 방 안에서 서로 걸어서 닿는, 대화 거리보다 먼 두 지점을 찾는다(장소 월드·캠퍼스 모두). */
function walkablePair(manifest: StudioVirtualSpaceWorldManifest, roomId: string) {
  const points = walkablePoints(manifest, roomId);
  for (const from of points) {
    for (const to of [...points].reverse()) {
      const gap = Math.hypot(to.x - from.x, to.y - from.y);
      if (gap < 320 || gap > 900) continue;
      const last = findStudioWorldPath(manifest, from, to).at(-1);
      if (last && Math.hypot(last.x - to.x, last.y - to.y) < 1) return { from, to };
    }
  }
  throw new Error("걸어서 닿는 두 지점을 찾지 못했습니다.");
}
function firstButton(buttons: readonly HTMLElement[]): HTMLElement {
  const [button] = buttons;
  if (!button) throw new Error("버튼이 필요합니다.");
  return button;
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  writeStudioVirtualSpaceEntryPreference(0);
  f.worldPublication = null; f.worldLoad = null; f.engine = null; f.socialOptions = null; f.realPresence = false;
  f.operations = { phase: "ready", project: null, inbox: [], calendar: [], error: null };
  f.refreshOperations.mockClear();
  f.session = { ready: true, data: { user: { id: "alice", name: "Alice", email: "alice@example.test" } } };
  f.live.room.ready = false;
  f.presenceOverrides = {};
  f.location = "";
  f.snapshot = { requests: [], readyPeerIds: ["bob", "cleo"], reviewReadyPeerIds: ["bob", "cleo"], blockedPeerIds: [], greetingReadyPeerIds: ["bob", "cleo"], greetings: [], available: true };
  f.cancel.mockClear(); f.request.mockClear(); f.respond.mockClear(); f.leaveConversation.mockClear();
  f.conversationSnapshot = { available: true, readyPeers: [], records: [], active: null }; f.conversationOptions = null;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function pageElement(path = "/studio/project-social/virtual", page = <StudioVirtualSpacePage />) {
  // LocationProbe는 Routes 밖에 두어 홈으로 나간 뒤에도 주소를 기록한다.
  return <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/studio/:projectId/virtual" element={page} /></Routes>
    <LocationProbe />
  </MemoryRouter>;
}
async function mount(tab: HudTab | null = "people") {
  const mounted = render(pageElement());
  await screen.findByTestId("engine-ready");
  await waitFor(() => expect(f.engine?.snapshot.peers).toHaveLength(2));
  if (tab) await openTab(tab);
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

function officeElement(projectId = "project-social", personal = false, search = "") {
  return pageElement(`/studio/${projectId}/virtual${search}`, <StudioVirtualSpacePage personal={personal} projectIdOverride={projectId} />);
}
function nextDrawingWork() {
  const aggregate = createProductionDemoProject();
  const task = aggregate.tasks[0];
  if (!task) throw new Error("작업 fixture가 필요합니다.");
  f.operations = { phase: "ready", inbox: [], calendar: [], error: null, project: {
    access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
    aggregate: { ...aggregate, workId: "project-social", tasks: [{ ...task, title: "오늘의 3화 콘티", processKey: "storyboard", status: "in-progress" }] },
  } };
}

describe("몰입형 HUD 골격과 첫 화면", () => {
  it("입장 시 작업 창을 자동으로 열지 않고 도크·위치 칩·미니맵만 월드 위에 띄운다(다시 온 사람에게는 미니 투어를 띄우지 않는다)", async () => {
    await mount(null);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("region", { name: "스튜디오에서 작업 시작" })).toBeNull();
    expect(document.querySelector(".vs2-topbar, .workspace-nav, .studio-space-commandbar, footer.workspace-live-status")).toBeNull();
    expect(screen.getByRole("toolbar", { name: "가상 스튜디오 도구" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "가상 스튜디오 나가기" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "미니맵" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "3단계 미니 투어" })).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("? 도움말의 '미니 투어 다시 보기'로 화면을 막지 않는 3단계 미니 투어를 다시 연다", async () => {
    await mount(null);
    fireEvent.keyDown(window, { key: "?" });
    fireEvent.click(await screen.findByRole("button", { name: "미니 투어 다시 보기" }));
    const tour = await screen.findByRole("region", { name: "3단계 미니 투어" });
    expect(tour.getAttribute("data-coach-step")).toBe("1");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(within(tour).getByRole("button", { name: "미니 투어 건너뛰기" }));
    expect(screen.queryByRole("region", { name: "3단계 미니 투어" })).toBeNull();
    expect(localStorage.getItem(STUDIO_VIRTUAL_SPACE_TOUR_STORAGE_KEY)).toBe("seen");
  });

  it("처음 온 사람은 로비에서 이름과 캐릭터를 직접 고른 뒤에만 공간에 들어간다", async () => {
    localStorage.clear();
    render(pageElement());
    expect(await screen.findByRole("heading", { level: 1, name: "함께 작업할 스튜디오에 입장하세요" })).toBeTruthy();
    expect(screen.queryByTestId("engine-ready")).toBeNull();
    expect(screen.queryByRole("toolbar", { name: "가상 스튜디오 도구" })).toBeNull();
    const enter = screen.getByRole("button", { name: "선택하고 입장" });
    expect(enter.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "하늘 캐릭터 선택" }));
    fireEvent.change(screen.getByLabelText(/공개 닉네임/u), { target: { value: "발표자" } });
    expect(enter.hasAttribute("disabled")).toBe(false);
    fireEvent.click(enter);
    await screen.findByTestId("engine-ready");
    expect(screen.getByRole("toolbar", { name: "가상 스튜디오 도구" })).toBeTruthy();
    expect(f.engine?.selfDisplayName).toBe("발표자");
    // 로비 문구대로 처음 입장하면 3단계 미니 투어가 뜨고, 화면을 막지 않는다.
    expect(await screen.findByRole("region", { name: "3단계 미니 투어" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("작업 시작 주 버튼과 원고 목록 링크는 화면에 하나씩만 있다", async () => {
    await mount(null);
    expect(screen.getAllByRole("button", { name: "작업 시작" })).toHaveLength(1);
    expect(document.querySelectorAll('[data-workspace-primary-action="true"]')).toHaveLength(1);
    const office = await openWorkStart();
    expect(screen.getByRole("dialog", { name: "무엇부터 할까요?" })).toBeTruthy();
    expect(within(office).queryByRole("heading", { name: "무엇부터 할까요?" })).toBeNull();
    expect(screen.getAllByRole("link", { name: /원고 목록/u })).toHaveLength(1);
    expect(screen.queryAllByRole("link", { name: "새 작품 만들기" })).toHaveLength(0);
  });

  it("개인 공간의 마이크·카메라·화면 공유는 사유를 읽어 주는 비활성 버튼이고 누르면 안내만 한다", async () => {
    render(officeElement("personal-local", true));
    await screen.findByTestId("engine-ready");
    for (const name of ["마이크", "카메라", "화면 공유"]) {
      const button = screen.getByRole("button", { name });
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent).toBe("팀 프로젝트 공간에서 대화가 연결되면 쓸 수 있어요");
    }
    const opened = vi.fn();
    window.addEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, opened);
    try {
      fireEvent.click(screen.getByRole("button", { name: "마이크" }));
      expect(await screen.findByText("팀 프로젝트 공간에서 대화가 연결되면 쓸 수 있어요.")).toBeTruthy();
      expect(opened).not.toHaveBeenCalled();
    } finally { window.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, opened); }
  });

  it("나가기는 현재 위치를 저장하고 프로젝트 홈으로 이동한다", async () => {
    await mount(null);
    const builtin = resolveStudioVirtualBuiltinWorld(readStudioVirtualPlaceId("", false), false);
    const scope = studioVirtualSpacePositionScope("project-social", false, builtin.positionPlaceId);
    const self = { x: f.engine?.snapshot.self.x ?? -1, y: f.engine?.snapshot.self.y ?? -1 };
    fireEvent.click(screen.getByRole("button", { name: "나가기" }));
    await waitFor(() => expect(f.location).toBe("/home?project=project-social"));
    expect(readStudioVirtualSpaceSessionPoint(scope, { x: -1, y: -1 }, builtin.manifest)).toEqual(self);
  });

  it("1~9·Z 단축키는 월드에 이모트를 요청하고 입력 중이나 보조키 조합은 무시한다", async () => {
    await mount(null);
    const bridge = f.engine?.bridge;
    if (!bridge) throw new Error("엔진 연결이 필요합니다.");
    fireEvent.keyDown(window, { key: "1" });
    expect(bridge.consumeEmote()).toBe("wave");
    fireEvent.keyDown(window, { key: "z" });
    expect(bridge.consumeEmote()).toBe("dance");
    const input = document.createElement("input");
    document.body.append(input);
    try {
      fireEvent.keyDown(input, { key: "2" });
      expect(bridge.consumeEmote()).toBeNull();
    } finally { input.remove(); }
    fireEvent.keyDown(window, { key: "1", ctrlKey: true });
    expect(bridge.consumeEmote()).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("P는 참가자 패널, M은 전체 지도를 열고 Esc는 가장 위 창부터 하나씩 닫는다", async () => {
    await mount(null);
    fireEvent.keyDown(window, { key: "p" });
    expect(await screen.findByRole("complementary", { name: "참가자" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "m" });
    expect(await screen.findByRole("dialog", { name: /전체 지도/u })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /전체 지도/u })).toBeNull());
    expect(screen.getByRole("complementary", { name: "참가자" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
  });

  it("데스크톱 우측 패널은 비모달이라 걷기 목표를 지우지 않는다", async () => {
    await mount(null);
    f.engine?.bridge.requestMove({ x: 400, y: 300 });
    await openTab("people");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(f.engine?.bridge.consumeMoveTarget()).toEqual({ x: 400, y: 300 });
  });
});

describe("월드 해석기와 장소 이동", () => {
  it("?place= 딥링크는 저장된 위치보다 그 장소의 입구를 우선한다", async () => {
    const builtin = resolveStudioVirtualBuiltinWorld("creator-cafe", false);
    const spawn = resolveStudioWorldSpawn(builtin.manifest, studioWorldSpawn(builtin.manifest, builtin.spawnId).point);
    if (!spawn) throw new Error("장소 입구가 필요합니다.");
    const stored = walkablePoints(builtin.manifest).find((point) => Math.hypot(point.x - spawn.x, point.y - spawn.y) > 120);
    if (!stored) throw new Error("저장할 다른 위치가 필요합니다.");
    writeStudioVirtualSpaceSessionPoint(studioVirtualSpacePositionScope("project-social", false, builtin.positionPlaceId), stored);
    render(officeElement("project-social", false, "?place=creator-cafe"));
    await screen.findByTestId("engine-ready");
    expect(f.engine?.manifest).toBe(builtin.manifest);
    expect(f.engine?.snapshot.self).toMatchObject(spawn);
  });

  it("같은 월드 안의 장소는 걸어서 가고, 다른 월드는 ?place=로 바꾸되 엔진 연결은 유지한다", async () => {
    render(officeElement("project-social", false, "?place=skyport"));
    await screen.findByTestId("engine-ready");
    const bridge = f.engine?.bridge;
    const start = resolveStudioVirtualBuiltinWorld("skyport", false);
    const target = resolveStudioVirtualBuiltinWorld("creator-cafe", false);
    const panel = await openTab("places");
    fireEvent.click(within(panel).getByRole("button", { name: placeButton("creator-cafe") }));
    if (start.key === target.key) {
      expect(f.location).toBe("/studio/project-social/virtual?place=skyport");
      expect(roomContains(start.manifest, "creator-cafe", f.engine?.bridge.consumeMoveTarget())).toBe(true);
    } else {
      await waitFor(() => expect(f.location).toContain("place=creator-cafe"));
      await waitFor(() => expect(f.engine?.manifest).toBe(target.manifest));
    }
    expect(f.engine?.bridge).toBe(bridge);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("하위 맵은 ?place=로 들어가고 캠퍼스로 돌아올 때는 출발한 게이트를 알린다", async () => {
    render(officeElement("project-social", false, "?place=skyport"));
    await screen.findByTestId("engine-ready");
    fireEvent.click(within(await openTab("places")).getByRole("button", { name: placeButton("tree-library") }));
    await waitFor(() => expect(f.location).toContain("place=tree-library"));
    expect(f.location).not.toContain("from=");
    await waitFor(() => expect(f.engine?.manifest).toBe(resolveStudioVirtualBuiltinWorld("tree-library", false).manifest));
    fireEvent.click(within(await openTab("places")).getByRole("button", { name: placeButton("creator-plaza") }));
    await waitFor(() => expect(f.location).toContain("place=creator-plaza"));
    const campus = resolveStudioVirtualBuiltinWorld("creator-plaza", false, { arrivalFrom: "tree-library" });
    await waitFor(() => expect(f.engine?.manifest).toBe(campus.manifest));
    if (campus.kind === "campus") {
      expect(f.location).toContain("from=tree-library");
      expect(f.engine?.snapshot.self).toMatchObject(resolveStudioWorldSpawn(campus.manifest, studioWorldSpawn(campus.manifest, campus.spawnId).point) ?? {});
    } else expect(f.location).not.toContain("from=");
  });
});

describe("가상 사무실 첫 작업과 자리의 Page 연결", () => {
  it("개인 작업실 입구에서도 작업 자리 버튼은 보이는 책상 앞으로 걷게 한다", async () => {
    render(officeElement("personal-local", true, "?place=personal-atelier"));
    await screen.findByTestId("engine-ready");
    const before = { ...f.engine?.snapshot.self };
    fireEvent.click(within(await openWorkStart()).getByRole("button", { name: /^작업 자리/u }));
    const manifest = f.engine?.manifest;
    if (!manifest) throw new Error("현재 월드가 필요합니다.");
    expect(f.engine?.bridge.consumeMoveTarget()).toEqual(studioVirtualPersonalDeskPoint(manifest));
    expect(f.engine?.snapshot.self).toEqual(before);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("작업 시작은 이어하기 대상이 없으면 선택지를 열고 실제 원고 링크와 작업·동료·자리를 제공한다", async () => {
    nextDrawingWork();
    await mount(null);
    expect(screen.queryByRole("region", { name: "스튜디오에서 작업 시작" })).toBeNull();
    const office = await openWorkStart();
    expect(within(office).getByText("오늘의 3화 콘티")).toBeTruthy();
    expect(within(office).getByRole("link", { name: "원고 목록 바로 열기" }).getAttribute("href")).toBe("/studio/p/project-social/production?view=documents");
    expect(f.request).not.toHaveBeenCalled();
    fireEvent.click(within(office).getByRole("button", { name: /동료 찾기/u }));
    expect(await screen.findByRole("complementary", { name: "참가자" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "스튜디오에서 작업 시작" })).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
    fireEvent.click(within(await openWorkStart()).getByRole("button", { name: /내 작업 열기/u }));
    expect(await screen.findByRole("complementary", { name: "검수·작업함" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "오늘의 제작 동선으로 돌아가기" })).toBeTruthy();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("개인 작업 선택지는 실제 작품 목록·새 작품 링크를 제공하고 협업 동료를 만들지 않는다", async () => {
    nextDrawingWork();
    render(officeElement("personal-local", true));
    await screen.findByTestId("engine-ready");
    const office = await openWorkStart();
    expect(within(office).getByRole("link", { name: /내 작품 열기/u }).getAttribute("href")).toBe("/studio");
    expect(within(office).getByRole("link", { name: "새 작품 만들기" }).getAttribute("href")).toBe("/studio/new");
    expect(within(office).getByRole("button", { name: /동료 찾기/u })).toHaveProperty("disabled", true);
    expect(within(office).queryByText("오늘의 3화 콘티")).toBeNull();
    expect(within(office).getByText("개인 작업실 · 동료 없음")).toBeTruthy();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("다음 업무 안내는 창을 닫고 드로잉 스튜디오까지 실제 걷기를 예약한다", async () => {
    nextDrawingWork();
    await mount(null);
    fireEvent.click(within(await openWorkStart()).getByRole("button", { name: "드로잉 스튜디오로 이동" }));
    await waitFor(() => expect(f.engine?.manifest.rooms.some((room) => room.id === "personal-atelier")).toBe(true));
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    const manifest = f.engine?.manifest;
    if (!manifest) throw new Error("현재 월드가 필요합니다.");
    expect(roomContains(manifest, "personal-atelier", f.engine?.bridge.consumeMoveTarget())).toBe(true);
    expect(f.request).not.toHaveBeenCalled();
  });

  it("자리를 고르면 창을 닫고 접근하며 실제 도착 전에 서버 점유를 요청하지 않는다", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    f.live.room.ready = true;
    await mount(null);
    const slot = f.engine?.manifest.interactionSlots?.[0];
    if (!slot) throw new Error("현재 월드의 작업 자리가 필요합니다.");
    const acquire = vi.spyOn(StudioVirtualSlotLeaseController.prototype, "acquire").mockResolvedValue(false);
    const panel = await openOfficeSeats();
    const button = within(panel).getByRole("button", { name: `${slot.labelKo} 사용하기` });
    await waitFor(() => expect(button).toHaveProperty("disabled", false));
    const bridge = f.engine?.bridge;
    if (!bridge) throw new Error("엔진 연결이 필요합니다.");
    const move = vi.spyOn(bridge, "requestMove");
    fireEvent.click(button);
    expect(screen.queryByRole("complementary")).toBeNull();
    await waitFor(() => expect(move).toHaveBeenCalledExactlyOnceWith(slot.approachPoint));
    expect(acquire).not.toHaveBeenCalled();
    await act(async () => { f.engine?.onLocalState({ point: slot.approachPoint, facing: slot.facing, moving: false, zoneId: slot.roomId }); });
    await waitFor(() => expect(acquire).toHaveBeenCalledExactlyOnceWith(slot.id));
    expect(f.request).not.toHaveBeenCalled();
  });

  it.each(["owner", "project"] as const)("%s 전환 시 다른 범위의 선호 자리를 표시하지 않고 원래 범위로 돌아오면 복원한다", async (scope) => {
    const view = render(officeElement());
    await screen.findByTestId("engine-ready");
    const slot = f.engine?.manifest.interactionSlots?.[0];
    if (!slot) throw new Error("현재 월드의 작업 자리가 필요합니다.");
    const panel = await openOfficeSeats();
    fireEvent.click(within(panel).getByRole("button", { name: rememberDesk(slot.labelKo) }));
    expect(within(panel).getByText("기억한 내 자리")).toBeTruthy();
    expect(f.engine?.bridge.consumeMoveTarget()).toBeNull();
    if (scope === "owner") f.session = { ...f.session, data: { user: { id: "bob", name: "Bob", email: "bob@example.test" } } };
    view.rerender(officeElement(scope === "project" ? "other-project" : "project-social"));
    await screen.findByTestId("engine-ready");
    expect(screen.queryByRole("complementary")).toBeNull();
    const changed = await openOfficeSeats();
    const changedButton = await within(changed).findByRole("button", { name: rememberDesk(slot.labelKo) });
    expect(within(changed).queryByText("기억한 내 자리")).toBeNull();
    expect(changedButton.getAttribute("aria-pressed")).toBe("false");
    f.session = { ...f.session, data: { user: { id: "alice", name: "Alice", email: "alice@example.test" } } };
    view.rerender(officeElement());
    await screen.findByTestId("engine-ready");
    const restored = await openOfficeSeats();
    expect((await within(restored).findByRole("button", { name: rememberDesk(slot.labelKo) })).getAttribute("aria-pressed")).toBe("true");
    expect(f.request).not.toHaveBeenCalled();
  });

  it("월드마다 선호 자리를 따로 기억하고 다른 월드에서 기억해도 이전 자리를 보존한다", async () => {
    const lobby = resolveStudioVirtualBuiltinWorld("skyport", false);
    const gallery = resolveStudioVirtualBuiltinWorld("review-gallery", false);
    const other = gallery.key === lobby.key ? resolveStudioVirtualBuiltinWorld("tree-library", false) : gallery;
    await mount(null);
    const firstSlot = f.engine?.manifest.interactionSlots?.[0];
    const secondSlot = f.engine?.manifest.interactionSlots?.[1];
    if (!firstSlot || !secondSlot) throw new Error("첫 월드의 작업 자리가 둘 이상 필요합니다.");
    let panel = await openOfficeSeats();
    fireEvent.click(within(panel).getByRole("button", { name: rememberDesk(firstSlot.labelKo) }));
    fireEvent.click(within(await openTab("places")).getByRole("button", { name: placeButton(other.placeId) }));
    await waitFor(() => expect(f.engine?.manifest).toBe(other.manifest));
    const otherSlot = other.manifest.interactionSlots?.[0];
    if (otherSlot) {
      panel = await openOfficeSeats();
      expect(within(panel).queryByText("기억한 내 자리")).toBeNull();
      fireEvent.click(within(panel).getByRole("button", { name: rememberDesk(otherSlot.labelKo) }));
    }
    fireEvent.click(within(await openTab("places")).getByRole("button", { name: placeButton("skyport") }));
    await waitFor(() => expect(f.engine?.manifest).toBe(lobby.manifest));
    panel = await openOfficeSeats();
    expect(within(panel).getByRole("button", { name: rememberDesk(firstSlot.labelKo) }).getAttribute("aria-pressed")).toBe("true");
    expect(within(panel).getByRole("button", { name: rememberDesk(secondSlot.labelKo) }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("동료에게 다가가기의 실제 Page 연결", () => {
  async function prepareApproach() {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const world = resolveStudioVirtualBuiltinWorld("personal-atelier", false);
    const zoneId = world.kind === "campus" ? "personal-atelier" : world.manifest.rooms.find((room) => room.id === "personal-atelier")?.id ?? "personal-atelier";
    const pair = walkablePair(world.manifest, zoneId);
    f.presenceOverrides.bob = { x: pair.to.x, y: pair.to.y, zoneId, activity: "available" };
    render(officeElement("project-social", false, "?place=personal-atelier"));
    await screen.findByTestId("engine-ready");
    await act(async () => { f.engine?.onLocalState({ point: pair.from, facing: "right", moving: false, zoneId }); });
    await openTab("people");
    const engine = f.engine;
    if (!engine) throw new Error("현재 월드의 renderer 연결이 필요합니다.");
    const move = vi.spyOn(engine.bridge, "requestMove");
    const button = await screen.findByRole("button", { name: "Bob 님에게 다가가기" });
    expect(button).toHaveProperty("disabled", false);
    expect(engine.snapshot.self).toMatchObject(pair.from);
    return { engine, move, button, pair, zoneId };
  }

  it("먼 동료에게 실제로 다가가고 도착한 뒤에도 명시적인 대화 요청만 한 번 보낸다", async () => {
    const { engine, move, button, pair, zoneId } = await prepareApproach();
    const opened = vi.fn();
    window.addEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, opened);
    try {
      fireEvent.click(button);
      expect(move).toHaveBeenCalledOnce();
      expect(screen.queryByRole("complementary")).toBeNull();
      expect(f.request).not.toHaveBeenCalled();
      expect(opened).not.toHaveBeenCalled();
      const destination = move.mock.calls[0]?.[0];
      if (!destination) throw new Error("실제 접근 목적지가 필요합니다.");
      const distance = Math.hypot(destination.x - pair.to.x, destination.y - pair.to.y);
      expect(distance).toBeGreaterThanOrEqual(26);
      expect(distance).toBeLessThanOrEqual(120);
      expect(engine.bridge.consumeMoveTarget()).toEqual(destination);
      expect(f.engine?.snapshot.self).toMatchObject(pair.from);
      expect(screen.getByText(/Bob 님에게 가는 중/u)).toBeTruthy();

      await act(async () => { f.engine?.onLocalState({ point: destination, facing: "right", moving: false, zoneId }); });
      const people = await screen.findByRole("complementary", { name: "참가자" });
      await act(async () => { await import("./StudioVirtualSpaceSocialPanel"); });
      expect(f.request).not.toHaveBeenCalled();
      expect(opened).not.toHaveBeenCalled();
      expect(within(people).getByRole("button", { name: "Bob" }).getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(within(people).getByRole("button", { name: "대화 요청" }));
      expect(f.request).toHaveBeenCalledExactlyOnceWith("bob", "talk");
      expect(opened).not.toHaveBeenCalled();
    } finally { window.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, opened); }
  });

  it.each(["npc", "interaction"] as const)("접근 중 %s로 전환하면 의도를 취소하고 동료 위치 변경이나 늦은 도착으로 다시 이동하지 않는다", async (surface) => {
    const { engine, move, button, pair, zoneId } = await prepareApproach();
    fireEvent.click(button);
    expect(move).toHaveBeenCalledOnce();
    const destination = move.mock.calls[0]?.[0];
    const npc = engine.manifest.npcs[0];
    const interaction = engine.manifest.interactions.find((item) => item.zoneId === npc?.roomId) ?? engine.manifest.interactions[0];
    if (!destination || !npc || !interaction) throw new Error("현재 월드의 NPC와 상호작용이 필요합니다.");
    await act(async () => {
      if (surface === "npc") {
        f.engine?.onNpcInteract?.(interaction, npc);
        await import("./StudioVirtualSpaceNpcDialoguePanel");
      } else {
        f.engine?.onInteract(interaction);
        await import("./StudioVirtualSpaceActionSheet");
      }
    });
    const dialog = await screen.findByRole("dialog");
    expect(screen.queryByRole("complementary", { name: "참가자" })).toBeNull();
    expect(engine.bridge.consumeMoveTarget()).toBeNull();
    f.presenceOverrides.bob = { ...f.presenceOverrides.bob, x: pair.to.x - 64 };
    await act(async () => { f.engine?.onLocalState({ point: pair.from, facing: "right", moving: false, zoneId }); });
    expect(move).toHaveBeenCalledOnce();
    expect(engine.bridge.consumeMoveTarget()).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: surface === "npc" ? "대화 닫기" : "닫기" }));
    await act(async () => { f.engine?.onLocalState({ point: destination, facing: "right", moving: false, zoneId }); });
    expect(move).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(engine.bridge.consumeMoveTarget()).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
  });
});

// The transport and renderer are boundaries; these tests execute the real Page's
// activity ownership, UI events, engine bridge and Huddle event integration.
describe("Virtual Studio social activity ownership", () => {
  it("더보기 메뉴에서 키보드 없이 방 찾기와 제작 공간을 연다", async () => {
    await mount(null);
    await openMoreItem("search");
    const search = await screen.findByRole("dialog", { name: "방·팀원 찾기" });
    fireEvent.click(firstButton(within(search).getAllByRole("button", { name: "닫기" })));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "방·팀원 찾기" })).toBeNull());
    await openMoreItem("town");
    await act(async () => { await import("./StudioVirtualSpaceTownProgramPanel"); });
    expect(await screen.findByRole("complementary", { name: "함께 일하는 제작 공간" })).toBeTruthy();
  });

  it("프로젝트 설정 탭에서 실시간 연결 진단을 연다", async () => {
    await mount("settings");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "실시간 연결 상태" }));
      await import("./StudioVirtualSpaceRtcPanel");
    });
    expect(screen.getByRole("complementary", { name: "실시간 연결 상태" })).toBeTruthy();
    expect(await screen.findByRole("region", { name: "실시간 협업 진단" })).toBeTruthy();
  });

  it("꾸미기에서 저장하지 않은 닉네임을 다른 탭에 다녀오거나 패널을 닫았다 열어도 보존한다", async () => {
    await mount("build");
    const nameInput = await screen.findByRole("textbox", { name: "공개 이름" });
    fireEvent.change(nameInput, { target: { value: "저장 전 닉네임" } });
    await openTab("settings");
    expect(screen.queryByRole("textbox", { name: "공개 이름" })).toBeNull();
    await openTab("build");
    expect(screen.getByDisplayValue("저장 전 닉네임")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
    expect(screen.queryByRole("textbox", { name: "공개 이름" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "꾸미기" }));
    expect(screen.getByDisplayValue("저장 전 닉네임")).toBeTruthy();
    expect(screen.getByRole("button", { name: "저장" }).hasAttribute("disabled")).toBe(false);
  });

  it("이미 선택한 배경 장소를 눌러도 해당 환경 프리셋을 다시 적용한다", async () => {
    await mount("build");
    expect(f.engine?.decorations?.districtKey).toBe("atelier-gardens");
    expect(f.engine?.environmentPreference?.backdrop).toBe("sky");
    const district = await screen.findByRole("button", { name: /아틀리에 정원/ });
    expect(district.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(district);
    expect(f.engine?.environmentPreference).toMatchObject({ backdrop: "forest", dayPhase: "day", weather: "petals" });
  });

  it("개인 공간은 프로젝트 전용 탭·패널을 숨기고 캐릭터와 장소 설정을 유지한다", async () => {
    render(pageElement("/studio/personal-local/virtual?activity=board", <StudioVirtualSpacePage personal />));
    await screen.findByTestId("engine-ready");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    const people = await openTab("people");
    expect(within(people).getByText(/개인 스튜디오에는 나만 있어요/u)).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "오늘" })).toBeNull();
    expect(screen.queryByRole("button", { name: "대화 요청" })).toBeNull();
    const chat = await openTab("chat");
    expect(within(chat).getByText("대화와 통화는 팀 프로젝트 공간에서 쓸 수 있어요.")).toBeTruthy();
    await openTab("places");
    expect(screen.queryByRole("region", { name: "비공개 대화방" })).toBeNull();
    expect(screen.queryByRole("region", { name: "함께 쓰는 작업 자리" })).toBeNull();
    await openTab("settings");
    expect(screen.queryByRole("button", { name: "게시 공간 확인·적용" })).toBeNull();
    expect(screen.queryByRole("button", { name: "실시간 연결 상태" })).toBeNull();
    const build = await openTab("build");
    expect(within(build).getByRole("button", { name: "시나 캐릭터 선택" })).toBeTruthy();
    expect(within(build).queryByRole("button", { name: "월드 편집기 열기" })).toBeNull();
  });

  it("패널을 열고 닫아도 사회적 동의를 만들지 않는다", async () => {
    await mount(null);
    expect(f.request).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
    await openTab("people");
    expect(screen.getByRole("complementary", { name: "참가자" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "패널 닫기" }));
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
  });

  it("ends the accepted outgoing follow and its visible ownership before starting an NPC tour", async () => {
    await mount();
    await accept(accepted("follow-before-tour", "follow"));
    expect(f.engine?.bridge.getFollowingPeer()).toBe("bob");
    expect(screen.getByRole("button", { name: "Bob 따라가는 중" })).toBeTruthy();
    await openTab("places");
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
    await mount(null);
    const slot = f.engine?.manifest.interactionSlots?.[0];
    if (!slot) throw new Error("현재 월드의 작업 자리가 필요합니다.");
    const seats = await openOfficeSeats();
    const useSlot = within(seats).getByRole("button", { name: `${slot.labelKo} 사용하기` });
    await waitFor(() => expect(useSlot.hasAttribute("disabled")).toBe(false));
    // Keep the real slots hook and its request generation. Defer only the
    // controller's release result at the asynchronous reservation boundary.
    let released: () => void = () => undefined;
    const release = vi.spyOn(StudioVirtualSlotLeaseController.prototype, "release")
      .mockImplementationOnce(() => new Promise<void>((resolve) => { released = resolve; }));
    const bridge = f.engine?.bridge;
    if (!bridge) throw new Error("엔진 연결이 필요합니다.");
    const move = vi.spyOn(bridge, "requestMove");
    fireEvent.click(useSlot);
    expect(release).toHaveBeenCalledOnce();
    expect(move).not.toHaveBeenCalled();
    await openTab("places");
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
    await openTab("places");
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
    await openTab("places");
    fireEvent.click(screen.getByRole("button", { name: "처음 오셨나요? 시작 안내" }));
    fireEvent.click(screen.getByRole("button", { name: "가이드와 함께 둘러보기" }));
    expect(f.engine?.guideTourRequest).not.toBeNull();
    if (reason === "escape") fireEvent.keyDown(window, { key: "Escape" });
    if (reason === "blur") fireEvent.blur(window);
    if (reason === "hidden") {
      vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      fireEvent(document, new Event("visibilitychange"));
    }
    if (reason === "focus") {
      await openTab("settings");
      fireEvent.click(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "집중" }));
    }
    expect(f.engine?.guideTourRequest).toBeNull();
    fireEvent.focus(window);
    if (reason === "focus") fireEvent.click(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "일상" }));
    expect(f.engine?.guideTourRequest).toBeNull();
  });

  it("passes the renderer's current presence and world readiness to both acoustic consent boundaries", async () => {
    render(pageElement());
    expect(f.socialOptions?.acousticBindingAvailable).toBe(false);
    expect(f.conversationOptions?.acousticBindingAvailable).toBe(false);
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
      [".space-dock__me", ["dark"]],
      [".space-proximity", ["silver", "pink"]],
      [".studio-vspace-peer-picker", ["silver", "pink"]],
      [".space-self-card", ["dark"]],
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
    for (const selector of [".space-dock__me", ".space-self-card"]) {
      expect(view.container.querySelector(`${selector} img.studio-vspace-reference-compact-player`)?.getAttribute("src"), selector)
        .toBe(`/assets/virtual-studio/production-v2/player-${key}-direction-down.png`);
    }
  });

  it("advertises the Page's current registered character through the real direct presence controller", async () => {
    f.realPresence = true;
    vi.spyOn(f.live.room.direct, "getPeers").mockReturnValue([{ sessionId: "bob", displayName: "Bob", role: "editor" }]);
    const send = vi.spyOn(f.live.room.direct, "send");
    render(pageElement());
    await screen.findByTestId("engine-ready");
    await waitFor(() => expect(send).toHaveBeenCalled());
    const first = parseStudioVirtualSpacePacket(send.mock.calls[0]?.[1] ?? "");
    expect(first?.kind).toBe("presence");
    if (first?.kind !== "presence") throw new Error("Page did not advertise spatial presence");
    expect(first.state.appearance).toEqual(studioCharacterAppearanceForAvatarIndex(first.state.avatarIndex, "alice"));

    await openTab("build");
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
      expect(screen.getByRole("complementary", { name: "대화" })).toBeTruthy();
      await accept(accepted("follow-after-group", "follow"));
      expect(f.leaveConversation).toHaveBeenCalledExactlyOnceWith(scope.id);
      expect(f.engine?.bridge.getFollowingPeer()).toBe("bob");
    } finally {
      globalThis.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, open);
      globalThis.removeEventListener(STUDIO_P2P_HUDDLE_CLOSE_EVENT, close);
    }
  });

  it("keeps world movement, room actions and NPC tool access unavailable until the world is ready", async () => {
    let finishLoad: (world: StudioVirtualSpaceWorldManifest) => void = () => undefined;
    f.worldLoad = new Promise((resolve) => { finishLoad = resolve; });
    render(pageElement("/studio/project-social/virtual?worldEdit=1"));
    expect(screen.getByText("공간 데이터 불러오는 중…")).toBeTruthy();
    expect(screen.queryByTestId("engine-ready")).toBeNull();
    expect(screen.queryByRole("region", { name: "스튜디오 도우미 NPC" })).toBeNull();
    expect(document.querySelector("[data-interact-prompt]")).toBeNull();
    expect(document.querySelector(".space-minimap")).toBeNull();
    expect(document.querySelector(".space-proximity")).toBeNull();
    expect(f.socialOptions?.enabled).toBe(false);
    fireEvent.keyDown(window, { key: "1" });
    await act(async () => { finishLoad(DEFAULT_STUDIO_WORLD_MANIFEST); });
    await screen.findByTestId("engine-ready");
    expect(f.engine?.bridge.consumeEmote()).toBeNull();
    await openTab("people");
    expect(screen.getByRole("region", { name: "스튜디오 도우미 NPC" })).toBeTruthy();
    await openTab("places");
    expect(document.querySelector(".workspace-live-room-links")).not.toBeNull();
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
      await openTab("people");
      fireEvent.click(screen.getByRole("button", { name: "Cleo" }));
      expect(open).toHaveBeenCalledOnce();
    } finally { globalThis.removeEventListener(STUDIO_P2P_HUDDLE_OPEN_EVENT, open); }
  });

  it("근접 스트립의 사람 카드는 대화 요청·따라가기와 연결되고 NPC는 따로 표시하며 인원에 넣지 않는다", async () => {
    await mount(null);
    const strip = screen.getByRole("region", { name: "근처에 있는 사람과 NPC" });
    fireEvent.click(within(strip).getByRole("button", { name: "Bob에게 대화 요청" }));
    expect(f.request).toHaveBeenCalledExactlyOnceWith("bob", "talk");
    fireEvent.click(within(strip).getByRole("button", { name: "Bob 따라가기" }));
    expect(f.engine?.bridge.getFollowingPeer()).toBe("bob");
    const npc = f.engine?.manifest.npcs[0];
    if (!npc) throw new Error("현재 월드의 NPC가 필요합니다.");
    await act(async () => {
      f.engine?.onNearbyNpcsChange?.([{ id: npc.id, npc, labelKo: "NPC · 안내원", labelEn: "NPC · Guide", activityKo: "안내 중", activityEn: "Guiding",
        skinKey: npc.skinKey, distance: 40, interaction: null }]);
    });
    const card = within(strip).getByText("안내원").closest("article");
    expect(card?.getAttribute("data-kind")).toBe("npc");
    expect(within(strip).getByText("NPC")).toBeTruthy();
    const people = await openTab("people");
    expect(within(people).getByText("접속 중 3명 · NPC 제외")).toBeTruthy();
  });

  it("cancels the previous accepted follow before replacing it with another person's review", async () => {
    await mount();
    const bridge = f.engine?.bridge;
    if (!bridge) throw new Error("엔진 연결이 필요합니다.");
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
    await openTab("settings");
    fireEvent.click(screen.getByRole("button", { name: "집중" }));
    expect(f.cancel).toHaveBeenCalledWith("follow-one");
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
    expect(f.socialOptions?.enabled).toBe(false);
    await openTab("people");
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
    await openTab("people");
    fireEvent.click(screen.getByRole("button", { name: "Cleo" }));
    await waitFor(() => expect(f.cancel).toHaveBeenCalledWith("follow-one"));
    expect(f.engine?.bridge.getFollowingPeer()).toBeNull();
  });

  it("keeps incoming acceptance behind an explicit button and leaves decline available during focus", async () => {
    await mount();
    const incoming = { ...accepted("incoming-one", "review"), status: "offered" as const, direction: "incoming" as const };
    f.snapshot = { ...f.snapshot, requests: [incoming] };
    await openTab("people");
    fireEvent.click(screen.getByRole("button", { name: "Bob" }));
    expect(f.respond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "수락" }));
    expect(f.respond).toHaveBeenCalledExactlyOnceWith("incoming-one", "accept");
    await openTab("settings");
    fireEvent.click(screen.getByRole("button", { name: "집중" }));
    await openTab("people");
    expect((screen.getByRole("button", { name: "수락" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "거절" }));
    expect(f.respond).toHaveBeenLastCalledWith("incoming-one", "decline");
  });

  it("받은 요청은 상단 토스트에서도 같은 응답 경로로 수락·거절하고 집중 중에는 수락하지 않는다", async () => {
    await mount(null);
    const incoming = { ...accepted("incoming-toast", "talk"), status: "offered" as const, direction: "incoming" as const };
    f.snapshot = { ...f.snapshot, requests: [incoming] };
    await openTab("people");
    const toast = screen.getByRole("region", { name: "Bob님의 대화 요청" });
    fireEvent.click(within(toast).getByRole("button", { name: "Bob님의 대화 요청 수락" }));
    expect(f.respond).toHaveBeenCalledExactlyOnceWith("incoming-toast", "accept");
    await openTab("settings");
    fireEvent.click(screen.getByRole("button", { name: "집중" }));
    const focusedToast = screen.getByRole("region", { name: "Bob님의 대화 요청" });
    fireEvent.click(within(focusedToast).getByRole("button", { name: "Bob님의 대화 요청 수락" }));
    expect(f.respond).toHaveBeenCalledOnce();
    fireEvent.click(within(focusedToast).getByRole("button", { name: "Bob님의 대화 요청 거절" }));
    expect(f.respond).toHaveBeenLastCalledWith("incoming-toast", "decline");
  });

  it("shows the newest terminal result and never treats NPCs as selectable peers", async () => {
    await mount();
    f.snapshot = { ...f.snapshot, requests: [
      { ...accepted("new-decline", "talk", "cleo"), status: "declined" },
      { ...accepted("old-cancel", "talk"), status: "cancelled" },
    ] };
    await openTab("people");
    fireEvent.click(screen.getByRole("button", { name: "Bob" }));
    const panel = screen.getByRole("region", { name: "팀원과 상호작용" });
    expect(within(panel).getByRole("status").textContent).toContain("Cleo");
    expect(within(panel).getByRole("status").textContent).toContain("거절됨");
    const picker = panel.querySelector<HTMLElement>(".studio-vspace-peer-picker");
    if (!picker) throw new Error("동료 선택기가 필요합니다.");
    expect(within(picker).getAllByRole("button").filter((button) => button.hasAttribute("aria-pressed"))
      .map((button) => button.getAttribute("aria-label"))).toEqual(["Bob", "Cleo"]);
  });

  it("정기 프로그램 배너는 프로젝트 공간에서만 '예시'로 표시하고 개인 공간에는 띄우지 않는다", async () => {
    const event = studioTownEvents(Date.UTC(2026, 8, 25, 0))[0];
    if (!event) throw new Error("정기 프로그램 예시가 필요합니다.");
    vi.spyOn(Date, "now").mockReturnValue(event.startsAt + 1);
    expect(studioTownActiveEvent(event.startsAt + 1)?.id).toBe(event.id);
    const view = render(officeElement());
    await screen.findByTestId("engine-ready");
    expect(screen.getByText("정기 프로그램(예시)")).toBeTruthy();
    expect(screen.getByText(event.labelKo)).toBeTruthy();
    view.unmount();
    render(officeElement("personal-local", true));
    await screen.findByTestId("engine-ready");
    expect(screen.queryByText("정기 프로그램(예시)")).toBeNull();
  });
});


describe("Virtual Studio atmosphere preference storage", () => {
  const key = "toonspectrum:virtual-atmosphere:v1";

  it.each([["focus", "집중"], ["balanced", "일상"], ["lively", "활기"]] as const)(
    "persists and reloads only the %s presentation preference", async (mode, label) => {
      const writes = vi.spyOn(Storage.prototype, "setItem");
      const mounted = await mount("settings");
      fireEvent.click(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: label }));
      expect(writes.mock.calls.filter(([writtenKey]) => writtenKey === key)).toEqual([[key, mode]]);
      mounted.unmount();
      await mount("settings");
      expect(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    },
  );

  it("falls back to balanced without interpreting stored JSON as document or consent state", async () => {
    localStorage.setItem(key, JSON.stringify({ mode: "focus", document: { secret: "not-a-preference" } }));
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await mount("settings");
    expect(within(screen.getByRole("group", { name: "작업실 분위기" })).getByRole("button", { name: "일상" }).getAttribute("aria-pressed")).toBe("true");
    expect(writes.mock.calls.filter(([writtenKey]) => writtenKey === key)).toEqual([]);
    expect(f.request).not.toHaveBeenCalled();
  });

  it("applies focus for the session when persistence is blocked", async () => {
    await mount("settings");
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
    const room = DEFAULT_STUDIO_WORLD_MANIFEST.rooms[0];
    if (!room) throw new Error("기본 월드의 방이 필요합니다.");
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
    await mount("places");
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
    const first = { publication: { contract: "studio-world-publication-v1" as const, workId: "project-social", projectId: "graph-1", artifactId: "world-1",
      revisionId: "published-1", previousPublishedRevisionId: null, contentHash: "a".repeat(64), sequence: 1, publishedBy: "alice", publishedAt: "2026-09-20T00:00:00.000Z",
      manifest: studioWorldPublishManifest(DEFAULT_STUDIO_WORLD_MANIFEST) }, scope: "a".repeat(64), assetUrls: new Map([[DEFAULT_STUDIO_WORLD_MANIFEST.backgroundUrl, "blob:first-world"]]), dispose: vi.fn() };
    f.worldPublication = { enabled: true, refresh: vi.fn(async () => true), publish: vi.fn(async () => true), reviewDraftBase: vi.fn(async () => null),
      snapshot: { ...EMPTY_WORLD_PUBLICATION, phase: "ready", viewVerified: true, hasPublishedWorld: true, active: first,
        authority: { publication: first.publication, canPublish: true, expiresAt: Date.now() + 15_000 } } };
    const mounted = await mount(); await accept(accepted("world-follow", "follow")); const oldBridge = f.engine!.bridge;
    expect(oldBridge.getFollowingPeer()).toBe("bob"); expect(f.engine?.worldAssetUrls).toBe(first.assetUrls);
    expect(f.privateOptions?.world).toEqual({worldId:first.publication.manifest.id,revisionId:first.publication.revisionId,contentHash:first.publication.contentHash});
    const rerender = () => mounted.rerender(pageElement());
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
