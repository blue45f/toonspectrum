// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioVirtualSpacePhaserCanvas } from "@/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas";
import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest } from "@/domains/creator/virtual-space/studio-virtual-space-world-manifest";
import { resolveStudioVirtualBuiltinWorld } from "@/domains/creator/virtual-space/studio-virtual-space-campus-world";
import { studioVirtualPersonalDeskPoint } from "@/domains/creator/virtual-space/studio-virtual-space-office-navigation";
import type { StudioVirtualSpacePresenceState } from "@/domains/creator/virtual-space/studio-virtual-space-model";
import type { StudioLiveParticipant } from "@/domains/creator/live/studio-live-collaboration-protocol";
import type { StudioLiveDirectPort } from "@/domains/creator/live/studio-live-direct-port";
import type { StudioVirtualSpacePresenceDependencies } from "@/domains/creator/virtual-space/studio-virtual-space-presence";
import type { StudioSpaceSocialRequest, StudioSpaceSocialSnapshot } from "@/domains/creator/virtual-space/StudioVirtualSpaceSocialPanel";
import type { useStudioVirtualSpaceSocial } from "@/domains/creator/virtual-space/use-studio-virtual-space-social";
import { STUDIO_P2P_HUDDLE_CLOSE_EVENT } from "@/domains/creator/live/huddle/studio-p2p-huddle-events";
import { StudioVirtualSpacePage } from "@/domains/creator/virtual-space/StudioVirtualSpacePage";
import { writeStudioVirtualSpaceEntryPreference } from "@/domains/creator/virtual-space/studio-virtual-space-entry-preference";
import { createProductionDemoProject } from "@/domains/creator/production-hub/production-demo";
import type { StudioVirtualOperationsSnapshot } from "@/domains/creator/virtual-space/use-studio-virtual-space-operations";
import { RouteStage } from "./route-stage";

type Engine = ComponentProps<typeof StudioVirtualSpacePhaserCanvas>;
type ConversationOptions = Parameters<typeof import("@/domains/creator/virtual-space/use-studio-virtual-space-conversation").useStudioVirtualSpaceConversation>[0];
type SocialOptions = Parameters<typeof useStudioVirtualSpaceSocial>[0];
const f = vi.hoisted(() => ({
  worldPublication: null as ReturnType<typeof import("@/domains/creator/virtual-space/world-publication/use-studio-world-publication").useStudioWorldPublication> | null,
  realPresence: false,
  presenceOverrides: {} as Record<string, Partial<StudioVirtualSpacePresenceState>>,
  worldLoad: null as Promise<StudioVirtualSpaceWorldManifest> | null,
  operations: { phase: "ready", project: null, inbox: [], calendar: [], error: null } as StudioVirtualOperationsSnapshot,
  refreshOperations: vi.fn(),
  engine: null as Engine | null,
  socialOptions: null as SocialOptions | null,
  conversationOptions: null as ConversationOptions | null,
  privateOptions: null as Parameters<typeof import("@/domains/creator/virtual-space/private-room/use-studio-private-room").useStudioPrivateRoom>[0] | null,
  conversationSnapshot: { available: true, readyPeers: [], records: [], active: null } as import("@/domains/creator/virtual-space/studio-virtual-space-conversation").StudioConversationSnapshot,
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
vi.mock("@/domains/creator/virtual-space/world-publication/use-studio-world-publication", async () => {
  const { EMPTY_WORLD_PUBLICATION } = await import("@/domains/creator/virtual-space/world-publication/studio-world-publication-controller");
  return { useStudioWorldPublication: () => f.worldPublication ?? ({ enabled: false, snapshot: EMPTY_WORLD_PUBLICATION, refresh: vi.fn(), publish: vi.fn() }) };
});
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ useSession: () => f.session }));
vi.mock("@/domains/creator/virtual-space/use-studio-virtual-space-operations", () => ({ useStudioVirtualSpaceOperations: () => ({ snapshot: f.operations, refresh: f.refreshOperations }) }));
vi.mock("@/domains/creator/virtual-space/private-room/use-studio-private-room",()=>({useStudioPrivateRoom:(options:Parameters<typeof import("@/domains/creator/virtual-space/private-room/use-studio-private-room").useStudioPrivateRoom>[0])=>{
  f.privateOptions=options;return {snapshot:{door:null,team:null,session:null,conversations:[],candidates:[],busy:false,uncertain:false,reason:null},controller:null,available:false,entryReason:"outside"};
}}));
vi.mock("@/domains/creator/live/use-studio-live-transport-auth", () => ({ useStudioLiveTransportAuth: () => f.transport }));
vi.mock("@/domains/creator/live/StudioLiveCollaborationProvider", () => ({ StudioLiveCollaborationProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/domains/creator/live/studio-live-collaboration-context", () => ({ useStudioLiveCollaboration: () => f.live }));
vi.mock("@/domains/creator/offline/studio-connectivity", () => ({
  getStudioConnectivitySnapshot: () => f.connectivity,
  getStudioConnectivityServerSnapshot: () => f.connectivity,
  subscribeStudioConnectivity: () => () => undefined,
  startStudioConnectivityRuntime: () => () => undefined,
}));
vi.mock("@/domains/creator/virtual-space/studio-virtual-space-world-loader", async () => {
  const { DEFAULT_STUDIO_WORLD_MANIFEST } = await import("@/domains/creator/virtual-space/studio-virtual-space-world-manifest");
  return { loadStudioVirtualSpaceWorldManifest: async () => f.worldLoad ?? DEFAULT_STUDIO_WORLD_MANIFEST };
});
vi.mock("@/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas", () => ({
  StudioVirtualSpacePhaserCanvas: (props: Engine) => { f.engine = props; return <div data-testid="engine-ready" />; },
}));
vi.mock("@/domains/creator/virtual-space/use-studio-virtual-space-social", () => ({
  useStudioVirtualSpaceSocial: (options: SocialOptions) => {
    f.socialOptions = options;
    return { snapshot: f.snapshot, interactive: f.snapshot.available, cancel: f.cancel, request: f.request, respond: f.respond, requestReview: vi.fn(), respondReview: f.respond, setPeerBlocked: vi.fn(), wave: vi.fn() };
  },
}));
vi.mock("@/domains/creator/virtual-space/use-studio-virtual-space-conversation", () => ({
  useStudioVirtualSpaceConversation: (options: ConversationOptions) => {
    f.conversationOptions = options;
    return { snapshot: f.conversationSnapshot, propose: vi.fn(), respond: vi.fn(), leave: f.leaveConversation };
  },
}));
vi.mock("@/domains/creator/virtual-space/studio-virtual-space-presence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domains/creator/virtual-space/studio-virtual-space-presence")>();
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
      return { self: { ...this.self, ...f.presenceOverrides.alice }, peers, nearbyPeers: peers, selfReaction: null, peerReactions: [], direct: true };
    }
  },
}; });

// jsdom에는 native dialog가 없다. 실제 focus와 Escape 동작은 별도 브라우저 검증에서 확인한다.
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
function sidePanel(): HTMLElement | null {
  const panel = document.getElementById("studio-space-side-panel");
  return panel && !panel.hasAttribute("hidden") ? panel : null;
}
/** 도크의 참가자 버튼으로 우측 비모달 패널을 연다. */
async function openPeople(): Promise<HTMLElement> {
  if (!sidePanel()) fireEvent.click(screen.getByRole("button", { name: "참가자" }));
  // 실제 패널을 연 뒤 모듈 로딩을 기다린다. 테스트 서버 변환 시간은 UI 반응 시간과 분리한다.
  await act(async () => { await Promise.all([import("@/domains/creator/virtual-space/StudioVirtualSpaceSocialPanel"), import("@/domains/creator/virtual-space/StudioVirtualSpaceNpcPanel")]); });
  const panel = await screen.findByRole("complementary", { name: "참가자" });
  await waitFor(() => expect(within(panel).queryAllByText("패널 불러오는 중…")).toHaveLength(0));
  return panel;
}
async function openWorkStart(): Promise<HTMLElement> {
  const trigger = document.querySelector<HTMLButtonElement>('[data-workspace-primary-action="true"]');
  if (!trigger) throw new Error("작업 시작 주 버튼이 필요합니다.");
  fireEvent.click(trigger);
  return screen.findByRole("region", { name: "스튜디오에서 작업 시작" });
}
function roomContains(manifest: StudioVirtualSpaceWorldManifest, roomId: string, point: { x: number; y: number } | null | undefined): boolean {
  const room = manifest.rooms.find((candidate) => candidate.id === roomId);
  return Boolean(room && point && point.x >= room.x && point.x <= room.x + room.width && point.y >= room.y && point.y <= room.y + room.height);
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
  f.snapshot = { requests: [], readyPeerIds: ["bob", "cleo"], reviewReadyPeerIds: ["bob", "cleo"], blockedPeerIds: [], greetingReadyPeerIds: ["bob", "cleo"], greetings: [], available: true };
  f.cancel.mockClear(); f.request.mockClear(); f.respond.mockClear(); f.leaveConversation.mockClear();
  f.conversationSnapshot = { available: true, readyPeers: [], records: [], active: null }; f.conversationOptions = null;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function StagedOfficePage({ personal }: { readonly personal: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  return <><button type="button" onClick={() => navigate("/studio/p/other-project/space?place=creator-cafe")}>다른 프로젝트로 전환</button>
    <RouteStage pathname={location.pathname} search={location.search} accessibleTitle="가상 작업실">
      <StudioVirtualSpacePage personal={personal} projectIdOverride={personal ? "virtual-demo:personal-home" : undefined} />
    </RouteStage></>;
}
function stagedOfficeElement(personal = false, placeId = "creator-cafe") {
  const path = personal ? "/studio/space" : "/studio/p/project-social/space";
  return <MemoryRouter initialEntries={[`${path}?place=${placeId}`]}>
    <Routes><Route path={personal ? "/studio/space" : "/studio/p/:projectId/space"} element={<StagedOfficePage personal={personal} />} /></Routes>
  </MemoryRouter>;
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

function accepted(id: string, action: StudioSpaceSocialRequest["action"], peerId = "bob"): StudioSpaceSocialRequest {
  return { id, action, status: "accepted", direction: "outgoing", createdAt: 1000, expiresAt: 21000,
    peer: { sessionId: peerId, displayName: peerId === "bob" ? "Bob" : "Cleo", role: "editor" } };
}
async function accept(request: StudioSpaceSocialRequest): Promise<void> {
  // 전송 알림 전에 Page 구독과 렌더러 ref를 반영하고 알림 이후 활동 갱신을 기다린다.
  await act(async () => {});
  await act(async () => {
    f.snapshot = { ...f.snapshot, requests: [request, ...f.snapshot.requests] };
    f.socialOptions?.onAccepted(request);
  });
}

describe("가상 사무실 첫 작업과 자리의 Page 연결", () => {
  it("실제 RouteStage 안에서 몰입형 HUD는 하나의 페이지 제목을 갖고 작업 창을 자동으로 열지 않는다", async () => {
    render(stagedOfficeElement());
    await screen.findByTestId("engine-ready");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.querySelector("[data-route-semantic-heading]")).toBeNull();
    expect(screen.getByRole("toolbar", { name: "가상 스튜디오 도구" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "스튜디오에서 작업 시작" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("실제 RouteStage의 개인 작업실 입구에서도 작업 자리 버튼은 보이는 책상 앞으로 걷게 한다", async () => {
    render(stagedOfficeElement(true, "personal-atelier"));
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

  it.each([true, false])("실제 RouteStage 안에서 장소만 바꾸면 엔진 연결과 이동 의도를 보존한다 (personal=%s)", async (personal) => {
    nextDrawingWork();
    render(stagedOfficeElement(personal));
    await screen.findByTestId("engine-ready");
    const bridge = f.engine?.bridge;
    expect(bridge).toBeTruthy();
    expect(f.engine?.manifest).toBe(resolveStudioVirtualBuiltinWorld("creator-cafe", personal).manifest);
    const office = await openWorkStart();
    fireEvent.click(within(office).getByRole("button", { name: personal ? /^작업 자리/u : "드로잉 스튜디오로 이동" }));
    const target = resolveStudioVirtualBuiltinWorld("personal-atelier", personal);
    await waitFor(() => expect(f.engine?.manifest).toBe(target.manifest));
    await act(async () => {});
    expect(f.engine?.bridge).toBe(bridge);
    expect(screen.queryByRole("dialog")).toBeNull();
    const moveTarget = bridge?.consumeMoveTarget();
    if (personal) expect(moveTarget).toEqual(studioVirtualPersonalDeskPoint(target.manifest));
    else expect(roomContains(target.manifest, "personal-atelier", moveTarget)).toBe(true);
    expect(f.request).not.toHaveBeenCalled();
  });

  it.each(["owner", "project"] as const)("실제 RouteStage에서도 %s 변경은 이전 이동 상태를 재사용하지 않는다", async (scope) => {
    const view = render(stagedOfficeElement());
    await screen.findByTestId("engine-ready");
    const oldBridge = f.engine?.bridge;
    oldBridge?.requestMove({ x: 850, y: 320 });
    if (scope === "owner") {
      f.session = { ...f.session, data: { user: { id: "bob", name: "Bob", email: "bob@example.test" } } };
      view.rerender(stagedOfficeElement());
    } else fireEvent.click(screen.getByRole("button", { name: "다른 프로젝트로 전환" }));
    await waitFor(() => expect(f.engine?.bridge).not.toBe(oldBridge));
    expect(f.engine?.bridge.consumeMoveTarget()).toBeNull();
    expect(await screen.findByRole("toolbar", { name: "가상 스튜디오 도구" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "스튜디오에서 작업 시작" })).toBeNull();
  });

  it("실제 RouteStage에서 발행 권한 갱신은 연결을 보존하고 새 발행 revision은 연결과 이동 상태를 분리한다", async () => {
    const { EMPTY_WORLD_PUBLICATION } = await import("@/domains/creator/virtual-space/world-publication/studio-world-publication-controller");
    const { studioWorldPublishManifest } = await import("@/domains/creator/virtual-space/world-publication/studio-world-publication-client");
    const { studioWorldSpawn } = await import("@/domains/creator/virtual-space/studio-virtual-space-world-manifest");
    const first = { publication: { contract: "studio-world-publication-v1" as const, workId: "project-social", projectId: "graph-1", artifactId: "world-1",
      revisionId: "published-1", previousPublishedRevisionId: null, contentHash: "a".repeat(64), sequence: 1, publishedBy: "alice", publishedAt: "2026-09-20T00:00:00.000Z",
      manifest: studioWorldPublishManifest(DEFAULT_STUDIO_WORLD_MANIFEST) }, scope: "a".repeat(64), assetUrls: new Map([[DEFAULT_STUDIO_WORLD_MANIFEST.backgroundUrl, "blob:first-world"]]), dispose: vi.fn() };
    f.worldPublication = { enabled: true, refresh: vi.fn(async () => true), publish: vi.fn(async () => true), reviewDraftBase: vi.fn(async () => null),
      snapshot: { ...EMPTY_WORLD_PUBLICATION, phase: "ready", viewVerified: true, hasPublishedWorld: true, active: first,
        authority: { publication: first.publication, canPublish: true, expiresAt: Date.now() + 15_000 } } };
    const mounted = render(stagedOfficeElement());
    await screen.findByTestId("engine-ready");
    await waitFor(() => expect(f.engine?.snapshot.peers).toHaveLength(2));
    await openPeople();
    await accept(accepted("world-follow", "follow"));
    if (!f.engine) throw new Error("가상 사무실 엔진이 필요합니다.");
    const oldBridge = f.engine.bridge;
    expect(oldBridge.getFollowingPeer()).toBe("bob"); expect(f.engine?.worldAssetUrls).toBe(first.assetUrls);
    expect(f.privateOptions?.world).toEqual({worldId:first.publication.manifest.id,revisionId:first.publication.revisionId,contentHash:first.publication.contentHash});
    const rerender = () => mounted.rerender(stagedOfficeElement());
    const authority = f.worldPublication.snapshot.authority;
    if (!authority) throw new Error("발행 권한 fixture가 필요합니다.");
    f.worldPublication = { ...f.worldPublication, snapshot: { ...f.worldPublication.snapshot, authority: { ...authority, expiresAt: Date.now() + 30_000 } } };
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
