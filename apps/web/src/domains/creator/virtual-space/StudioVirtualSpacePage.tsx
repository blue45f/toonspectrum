import {
  Bot,
  BookOpen,
  Boxes,
  Brush,
  CircleDot,
  Clapperboard,
  CloudOff,
  Coffee,
  ExternalLink,
  Gamepad2,
  Headphones,
  Heart,
  LayoutGrid,
  MessageCircle,
  Mic2,
  MousePointer2,
  Radio,
  Sparkles,
  UsersRound,
  Video,
  WandSparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useParams } from "react-router-dom";

import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  getStudioConnectivityServerSnapshot,
  getStudioConnectivitySnapshot,
  startStudioConnectivityRuntime,
  subscribeStudioConnectivity,
} from "../offline/studio-connectivity";

import { StudioLiveCollaborationProvider } from "../live/StudioLiveCollaborationProvider";
import { useStudioLiveCollaboration } from "../live/studio-live-collaboration-context";
import { openStudioP2pHuddle } from "../live/huddle/studio-p2p-huddle-events";
import { useStudioLiveTransportAuth } from "../live/use-studio-live-transport-auth";
import {
  STUDIO_VIRTUAL_SPACE_HEIGHT,
  STUDIO_VIRTUAL_SPACE_WIDTH,
  STUDIO_VIRTUAL_SPACE_ZONES,
  clampStudioVirtualSpacePoint,
  studioVirtualAvatarProfile,
  studioVirtualSpaceDestination,
  studioVirtualSpaceInitialPoint,
  studioVirtualSpaceState,
  type StudioVirtualAvatarProfile,
  type StudioVirtualSpaceActivity,
  type StudioVirtualSpaceFacing,
  type StudioVirtualSpacePoint,
  type StudioVirtualSpaceZone,
  type StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";
import {
  StudioVirtualSpacePresenceController,
  type StudioVirtualSpaceSnapshot,
} from "./studio-virtual-space-presence";

const MOVE_STEP = 28;

const ZONE_ICONS: Readonly<Record<StudioVirtualSpaceZoneId, typeof Coffee>> = {
  lounge: Coffee,
  writers: BookOpen,
  storyboard: LayoutGrid,
  drawing: Brush,
  review: MessageCircle,
  assets: Boxes,
  assistant: Bot,
  live: Radio,
};

const ZONE_TONES: Readonly<Record<StudioVirtualSpaceZoneId, string>> = {
  lounge: "from-amber-100/75 via-card/85 to-card/70 dark:from-amber-950/25",
  writers: "from-violet-100/75 via-card/85 to-card/70 dark:from-violet-950/25",
  storyboard: "from-sky-100/75 via-card/85 to-card/70 dark:from-sky-950/25",
  drawing: "from-rose-100/75 via-card/85 to-card/70 dark:from-rose-950/25",
  review: "from-emerald-100/75 via-card/85 to-card/70 dark:from-emerald-950/25",
  assets: "from-orange-100/75 via-card/85 to-card/70 dark:from-orange-950/25",
  assistant: "from-fuchsia-100/75 via-card/85 to-card/70 dark:from-fuchsia-950/25",
  live: "from-cyan-100/75 via-card/85 to-card/70 dark:from-cyan-950/25",
};

function decodeProjectId(projectId: string): string {
  try {
    return decodeURIComponent(projectId);
  } catch {
    return projectId;
  }
}

function validProjectId(projectId: string): boolean {
  return Boolean(
    projectId
    && projectId !== "."
    && projectId !== ".."
    && projectId.length <= 160
    && !projectId.includes("\\")
  );
}

function facingFromDelta(dx: number, dy: number): StudioVirtualSpaceFacing {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

function stagePosition(point: StudioVirtualSpacePoint): CSSProperties {
  return {
    left: `${(point.x / STUDIO_VIRTUAL_SPACE_WIDTH) * 100}%`,
    top: `${(point.y / STUDIO_VIRTUAL_SPACE_HEIGHT) * 100}%`,
  };
}

function accessoryNode(profile: StudioVirtualAvatarProfile): ReactNode {
  const shared = "absolute z-30 drop-shadow-sm";
  switch (profile.accessory) {
    case "beret":
      return <span className={cn(shared, "-top-1 left-2 h-3 w-10 -rotate-6 rounded-[70%_70%_45%_45%]")} style={{ backgroundColor: profile.accent }} />;
    case "bow":
      return (
        <span className={cn(shared, "-right-1 top-1 grid grid-cols-2 gap-0.5")}>
          <span className="h-3 w-3 -rotate-12 rounded-[70%_30%_70%_30%]" style={{ backgroundColor: profile.accent }} />
          <span className="h-3 w-3 rotate-12 rounded-[30%_70%_30%_70%]" style={{ backgroundColor: profile.accent }} />
        </span>
      );
    case "cat":
      return (
        <>
          <span className={cn(shared, "-top-1 left-1 h-4 w-4 -rotate-12 rounded-sm")} style={{ backgroundColor: profile.hair }} />
          <span className={cn(shared, "-top-1 right-1 h-4 w-4 rotate-12 rounded-sm")} style={{ backgroundColor: profile.hair }} />
        </>
      );
    case "headphones":
      return <span className={cn(shared, "left-0 top-2 h-8 w-full rounded-t-full border-[4px] border-b-0")} style={{ borderColor: profile.accent }} />;
    case "leaf":
      return <span className={cn(shared, "-top-2 right-1 h-3 w-6 rotate-[28deg] rounded-[100%_0_100%_0]")} style={{ backgroundColor: "oklch(0.72 0.17 145)" }} />;
    case "star":
      return <Sparkles className={cn(shared, "-right-2 -top-2")} size={18} style={{ color: profile.accent }} aria-hidden />;
    case "none":
      return null;
  }
}

function ChibiAvatar({
  identity,
  name,
  self = false,
  activity = "available",
  compact = false,
}: {
  readonly identity: string;
  readonly name: string;
  readonly self?: boolean;
  readonly activity?: StudioVirtualSpaceActivity;
  readonly compact?: boolean;
}) {
  const profile = useMemo(() => studioVirtualAvatarProfile(identity), [identity]);
  const initial = (name.trim().charAt(0) || "T").toUpperCase();
  if (compact) {
    return (
      <span
        className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-panel text-xs font-black shadow-sm"
        style={{ background: `linear-gradient(145deg, ${profile.hairHighlight}, ${profile.outfit})` }}
        aria-hidden
      >
        <span className="grid size-7 place-items-center rounded-full" style={{ backgroundColor: profile.skin, color: profile.hair }}>
          {initial}
        </span>
        <span
          className={cn(
            "absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-panel",
            activity === "away" ? "bg-fg-3" : activity === "focused" ? "bg-warn" : "bg-good",
          )}
        />
      </span>
    );
  }

  const hairShape = profile.hairStyle === "long"
    ? "h-[3.2rem] rounded-[48%_48%_38%_38%]"
    : profile.hairStyle === "twin"
      ? "h-11 rounded-[48%_48%_42%_42%]"
      : profile.hairStyle === "wave"
        ? "h-12 rounded-[52%_48%_42%_50%]"
        : "h-10 rounded-[48%_48%_44%_44%]";
  return (
    <div
      className={cn(
        "pointer-events-none relative flex h-[5.6rem] w-[4.6rem] -translate-x-1/2 -translate-y-[78%] flex-col items-center",
        self && "drop-shadow-[0_0_10px_oklch(0.7_0.18_300/0.45)]",
      )}
      aria-label={name}
    >
      <span
        className={cn(
          "absolute bottom-0 h-5 w-11 rounded-[50%_50%_42%_42%] shadow-md",
          activity === "focused" && "animate-pulse",
        )}
        style={{ backgroundColor: profile.outfit }}
      />
      <span className="absolute bottom-3 z-10 h-8 w-8 rounded-[46%_46%_40%_40%]" style={{ backgroundColor: profile.outfit }}>
        <span className="absolute left-1/2 top-1 h-2 w-3 -translate-x-1/2 rounded-full" style={{ backgroundColor: profile.accent }} />
      </span>
      <span className={cn("absolute bottom-8 z-10 w-[3.55rem] shadow-md", hairShape)} style={{ backgroundColor: profile.hair }}>
        <span className="absolute left-1 top-1 h-5 w-4 rotate-6 rounded-full opacity-50" style={{ backgroundColor: profile.hairHighlight }} />
      </span>
      <span
        className="absolute bottom-[2.25rem] z-20 h-[2.95rem] w-[3.05rem] overflow-hidden rounded-[46%_46%_48%_48%] border border-black/5"
        style={{ backgroundColor: profile.skin }}
      >
        <span className="absolute -left-1 -top-1 h-5 w-[2.1rem] rotate-12 rounded-full" style={{ backgroundColor: profile.hair }} />
        <span className="absolute -right-1 -top-1 h-5 w-[2rem] -rotate-12 rounded-full" style={{ backgroundColor: profile.hair }} />
        <span className="absolute left-[0.62rem] top-[1.35rem] size-[0.28rem] rounded-full bg-slate-800" />
        <span className="absolute right-[0.62rem] top-[1.35rem] size-[0.28rem] rounded-full bg-slate-800" />
        {profile.expression === "sparkle" ? (
          <>
            <span className="absolute left-[0.51rem] top-[1.18rem] text-[0.48rem] text-white">✦</span>
            <span className="absolute right-[0.51rem] top-[1.18rem] text-[0.48rem] text-white">✦</span>
          </>
        ) : null}
        <span className="absolute bottom-[0.58rem] left-[0.45rem] h-1.5 w-2.5 rounded-full bg-pink-400/20" />
        <span className="absolute bottom-[0.58rem] right-[0.45rem] h-1.5 w-2.5 rounded-full bg-pink-400/20" />
        <span className={cn(
          "absolute bottom-[0.55rem] left-1/2 -translate-x-1/2 border-b border-slate-700/70",
          profile.expression === "calm" ? "w-2" : "h-1 w-2.5 rounded-b-full",
        )} />
      </span>
      <span className="absolute bottom-[4.55rem] z-20 h-3 w-[3.3rem] rounded-t-[60%]" style={{ backgroundColor: profile.hair }} />
      {accessoryNode(profile)}
      <span
        className={cn(
          "absolute -bottom-4 left-1/2 z-40 max-w-28 -translate-x-1/2 truncate rounded-full border bg-panel/95 px-2 py-0.5 text-[0.58rem] font-black shadow-sm",
          self ? "border-accent/60 text-accent" : "border-line text-fg",
        )}
      >
        {self ? "★ " : ""}{name}
      </span>
    </div>
  );
}

function ConnectionBadge({
  preparing,
}: {
  readonly preparing: boolean;
}) {
  const bt = useBilingual("StudioVirtualSpaceConnectionBadge");
  const live = useStudioLiveCollaboration();
  const direct = Boolean(live.room?.direct && live.availability === "ready");
  const tone = direct ? "bg-good" : live.availability === "error" ? "bg-danger" : "bg-warn";
  const label = preparing
    ? bt("실시간 연결 준비 중", "Preparing live connection")
    : direct
      ? bt("P2P Direct", "P2P Direct")
      : live.availability === "ready"
        ? bt("Presence 연결됨", "Presence connected")
        : live.availability === "error"
          ? bt("연결 확인 필요", "Connection needs attention")
          : bt("연결 중", "Connecting");
  return (
    <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-card/90 px-3 text-xs font-bold text-fg-2 shadow-sm">
      <span className={cn("size-2 rounded-full", tone)} />
      {label}
    </span>
  );
}

function ZoneSurface({
  zone,
  projectId,
  active,
  onAssistant,
}: {
  readonly zone: StudioVirtualSpaceZone;
  readonly projectId: string;
  readonly active: boolean;
  readonly onAssistant: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceZone");
  const Icon = ZONE_ICONS[zone.id];
  const destination = studioVirtualSpaceDestination(projectId, zone.destination);
  const style: CSSProperties = {
    left: `${(zone.x / STUDIO_VIRTUAL_SPACE_WIDTH) * 100}%`,
    top: `${(zone.y / STUDIO_VIRTUAL_SPACE_HEIGHT) * 100}%`,
    width: `${(zone.width / STUDIO_VIRTUAL_SPACE_WIDTH) * 100}%`,
    height: `${(zone.height / STUDIO_VIRTUAL_SPACE_HEIGHT) * 100}%`,
  };
  const body = (
    <>
      <span className="absolute inset-2 rounded-[1.25rem] border border-line/60 bg-gradient-to-br from-white/20 via-transparent to-black/[0.025] dark:from-white/[0.025]" />
      <span className="relative flex items-start justify-between gap-2">
        <span>
          <span className="flex items-center gap-2 text-[0.62rem] font-black uppercase tracking-[0.12em] text-fg-3">
            <Icon size={13} aria-hidden />
            {zone.id === "live" ? "LIVE" : zone.id.toUpperCase()}
          </span>
          <strong className="mt-1 block text-sm font-black text-fg">
            {bt(zone.labelKo, zone.labelEn)}
          </strong>
        </span>
        {destination || zone.destination === "assistant" ? (
          <ExternalLink size={14} className="text-fg-3" aria-hidden />
        ) : null}
      </span>
      <span className="relative mt-auto hidden max-w-[24rem] text-[0.68rem] leading-5 text-fg-3 xl:block">
        {bt(zone.descriptionKo, zone.descriptionEn)}
      </span>
    </>
  );
  const className = cn(
    "absolute flex flex-col overflow-hidden rounded-[1.45rem] border bg-gradient-to-br p-4 text-left shadow-[0_10px_30px_oklch(0_0_0/0.08)] transition-all duration-200",
    ZONE_TONES[zone.id],
    active ? "z-[2] border-accent/70 ring-2 ring-accent/20" : "border-line/70",
    (destination || zone.destination === "assistant") && "hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-xl",
  );
  if (zone.destination === "assistant") {
    return (
      <button
        type="button"
        style={style}
        className={className}
        data-space-interactive="true"
        onClick={onAssistant}
      >
        {body}
      </button>
    );
  }
  if (destination) {
    return (
      <Link
        href={destination}
        style={style}
        className={className}
        data-space-interactive="true"
      >
        {body}
      </Link>
    );
  }
  return (
    <div style={style} className={className} data-space-interactive="true">
      {body}
    </div>
  );
}

function MobileZoneCard({
  zone,
  projectId,
  onAssistant,
}: {
  readonly zone: StudioVirtualSpaceZone;
  readonly projectId: string;
  readonly onAssistant: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceMobileZone");
  const Icon = ZONE_ICONS[zone.id];
  const destination = studioVirtualSpaceDestination(projectId, zone.destination);
  const className = cn(
    "flex min-h-28 flex-col rounded-2xl border border-line bg-gradient-to-br p-4 text-left shadow-sm",
    ZONE_TONES[zone.id],
  );
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-xl border border-line/70 bg-panel/80 text-accent">
          <Icon size={17} aria-hidden />
        </span>
        {(destination || zone.destination === "assistant") && <ExternalLink size={14} className="text-fg-3" aria-hidden />}
      </span>
      <strong className="mt-3 text-sm font-black text-fg">{bt(zone.labelKo, zone.labelEn)}</strong>
      <span className="mt-1 text-xs leading-5 text-fg-3">{bt(zone.descriptionKo, zone.descriptionEn)}</span>
    </>
  );
  if (zone.destination === "assistant") {
    return <button type="button" className={className} onClick={onAssistant}>{body}</button>;
  }
  if (destination) return <Link href={destination} className={className}>{body}</Link>;
  return <div className={className}>{body}</div>;
}

function VirtualSpaceExperience({
  projectId,
  preparing,
  signedIn,
}: {
  readonly projectId: string;
  readonly preparing: boolean;
  readonly signedIn: boolean;
}) {
  const bt = useBilingual("StudioVirtualSpaceExperience");
  const live = useStudioLiveCollaboration();
  const connectivity = useSyncExternalStore(
    subscribeStudioConnectivity,
    getStudioConnectivitySnapshot,
    getStudioConnectivityServerSnapshot,
  );
  const controllerRef = useRef<StudioVirtualSpacePresenceController | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fallbackIdentity = live.room?.participant.sessionId ?? `space:${projectId}`;
  const initial = useMemo(() => studioVirtualSpaceInitialPoint(fallbackIdentity), [fallbackIdentity]);
  const [snapshot, setSnapshot] = useState<StudioVirtualSpaceSnapshot>(() => ({
    self: studioVirtualSpaceState(initial),
    peers: [],
    nearbyPeers: [],
    direct: false,
  }));
  const [activity, setActivity] = useState<StudioVirtualSpaceActivity>("available");
  const visibleParticipantCount = connectivity.serverAvailable ? snapshot.peers.length + 1 : 1;

  useEffect(() => startStudioConnectivityRuntime(), []);

  const openAssistant = useCallback(() => {
    globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open"));
  }, []);

  useEffect(() => {
    const room = live.room;
    if (!room?.direct || live.availability !== "ready") {
      controllerRef.current?.close();
      controllerRef.current = null;
      setSnapshot((current) => ({
        ...current,
        peers: [],
        nearbyPeers: [],
        direct: false,
      }));
      return undefined;
    }
    const controller = new StudioVirtualSpacePresenceController(
      room.participant,
      room.direct,
      studioVirtualSpaceInitialPoint(room.participant.sessionId),
    );
    controllerRef.current = controller;
    const refresh = () => setSnapshot(controller.snapshot());
    const unsubscribe = controller.subscribe(refresh);
    controller.start();
    refresh();
    return () => {
      unsubscribe();
      controller.close();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [live.availability, live.room]);

  const updatePosition = useCallback((
    point: StudioVirtualSpacePoint,
    facing: StudioVirtualSpaceFacing,
  ) => {
    const bounded = clampStudioVirtualSpacePoint(point);
    const controller = controllerRef.current;
    if (controller) {
      controller.update(bounded, facing, activity);
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => ({
      ...current,
      self: studioVirtualSpaceState(bounded, facing, activity),
    }));
  }, [activity]);

  const move = useCallback((dx: number, dy: number) => {
    updatePosition(
      { x: snapshot.self.x + dx, y: snapshot.self.y + dy },
      facingFromDelta(dx, dy),
    );
  }, [snapshot.self.x, snapshot.self.y, updatePosition]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,textarea,select,[contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const movement = key === "arrowleft" || key === "a"
        ? [-MOVE_STEP, 0]
        : key === "arrowright" || key === "d"
          ? [MOVE_STEP, 0]
          : key === "arrowup" || key === "w"
            ? [0, -MOVE_STEP]
            : key === "arrowdown" || key === "s"
              ? [0, MOVE_STEP]
              : null;
      if (!movement) return;
      event.preventDefault();
      move(movement[0], movement[1]);
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  const handleStagePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-space-interactive=true]")) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const point = clampStudioVirtualSpacePoint({
      x: ((event.clientX - rect.left) / rect.width) * STUDIO_VIRTUAL_SPACE_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * STUDIO_VIRTUAL_SPACE_HEIGHT,
    });
    updatePosition(
      point,
      facingFromDelta(point.x - snapshot.self.x, point.y - snapshot.self.y),
    );
  }, [snapshot.self.x, snapshot.self.y, updatePosition]);

  const currentZone = STUDIO_VIRTUAL_SPACE_ZONES.find((zone) => zone.id === snapshot.self.zoneId)
    ?? STUDIO_VIRTUAL_SPACE_ZONES[0]!;
  const localName = live.room?.participant.displayName.replace(/\s*·\s*이 탭$/u, "") || bt("나", "Me");

  const startNearbyHuddle = useCallback(() => {
    if (!connectivity.serverAvailable || !snapshot.nearbyPeers.length) return;
    openStudioP2pHuddle({
      peerIds: snapshot.nearbyPeers.map((peer) => peer.participant.sessionId),
      source: "virtual-space",
    });
  }, [connectivity.serverAvailable, snapshot.nearbyPeers]);

  const setPresenceActivity = (next: StudioVirtualSpaceActivity) => {
    setActivity(next);
    controllerRef.current?.setActivity(next);
    setSnapshot((current) => ({
      ...current,
      self: studioVirtualSpaceState(current.self, current.self.facing, next),
    }));
  };

  return (
    <main className="min-h-screen bg-canvas pb-16 text-fg">
      <Container size="wide" className="py-5 sm:py-7">
        <header className="overflow-hidden rounded-[2rem] border border-line bg-panel/75 shadow-sm">
          <div className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-accent/10 blur-3xl"
            />
            <div className="relative">
              <Link href={`/studio/p/${encodeURIComponent(projectId)}/overview`} className="text-xs font-bold text-accent hover:text-accent-2">
                ← {bt("프로젝트로 돌아가기", "Back to project")}
              </Link>
              <p className="mt-4 text-[0.66rem] font-black uppercase tracking-[0.18em] text-accent">
                TOONSPECTRUM / VIRTUAL PRODUCTION STUDIO
              </p>
              <h1 className="mt-2 text-pretty text-2xl font-black tracking-tight sm:text-4xl">
                {bt("함께 만드는 가상 창작 스튜디오", "A virtual studio for creating together")}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
                {bt(
                  "서버에는 입장·권한·피어 발견만 맡기고, 이동·근처 대화·화상·화면 공유는 가능한 한 브라우저끼리 직접 연결합니다.",
                  "The server handles admission, permissions and peer discovery while movement, nearby huddles, video and screen sharing stay browser-to-browser whenever possible.",
                )}
              </p>
            </div>
            <div className="relative flex flex-wrap items-center gap-2 lg:justify-end">
              <ConnectionBadge preparing={preparing} />
              {connectivity.localOnly ? (
                <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-warning/35 bg-warning-soft/15 px-3 text-xs font-bold text-warning">
                  <CloudOff size={14} aria-hidden />
                  {bt("로컬 탐색 모드", "Local exploration")}
                </span>
              ) : null}
              <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-card/90 px-3 text-xs font-bold text-fg-2">
                <UsersRound size={14} aria-hidden />
                {visibleParticipantCount}{connectivity.localOnly ? bt("명 로컬", " local") : bt("명 접속", " online")}
              </span>
              <Link
                href={`/studio/work/${encodeURIComponent(projectId)}/canvas`}
                className={buttonClass({ className: "gap-2" })}
              >
                <Brush size={15} aria-hidden />
                {bt("원고 열기", "Open manuscript")}
              </Link>
            </div>
          </div>
        </header>

        {connectivity.localOnly ? (
          <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-warning/35 bg-warning-soft/10 p-4 text-sm text-fg-2">
            <CloudOff size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="font-bold text-fg">{bt("서버 연결 없이 로컬 공간을 탐색하고 있어요.", "Exploring this space locally while the server is unavailable.")}</p>
              <p className="mt-1 text-xs leading-5 text-fg-3">{bt("이동과 화면 탐색은 계속 사용할 수 있지만 팀원 발견과 P2P 대화는 서버 연결이 복구된 뒤 다시 활성화됩니다.", "Movement and local exploration remain available. Teammate discovery and P2P huddles resume after the server connection recovers.")}</p>
            </div>
          </div>
        ) : null}

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0">
            <div className="hidden lg:block">
              <div
                ref={stageRef}
                role="application"
                aria-label={bt("가상 스튜디오 공간", "Virtual studio space")}
                onPointerDown={handleStagePointer}
                className="relative aspect-[59/36] min-h-[34rem] w-full cursor-crosshair overflow-hidden rounded-[2rem] border border-line bg-[radial-gradient(circle_at_50%_44%,oklch(0.78_0.13_300/0.16),transparent_17%),linear-gradient(145deg,var(--color-panel),var(--color-card))] shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                data-studio-virtual-space="true"
              >
                <div aria-hidden className="absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:40px_40px] text-line" />
                {STUDIO_VIRTUAL_SPACE_ZONES.map((zone) => (
                  <ZoneSurface
                    key={zone.id}
                    zone={zone}
                    projectId={projectId}
                    active={currentZone.id === zone.id}
                    onAssistant={openAssistant}
                  />
                ))}

                <div
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-[45%] z-[3] size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/30 bg-panel/80 shadow-[0_0_45px_oklch(0.7_0.18_300/0.2)]"
                >
                  <div className="absolute inset-3 grid place-items-center rounded-full bg-accent-soft text-accent">
                    <Sparkles size={28} />
                  </div>
                </div>

                {snapshot.peers.map((peer) => (
                  <div
                    key={peer.participant.sessionId}
                    className="absolute z-20 transition-[left,top] duration-150 ease-linear"
                    style={stagePosition(peer.state)}
                  >
                    <ChibiAvatar
                      identity={peer.participant.sessionId}
                      name={peer.participant.displayName}
                      activity={peer.state.activity}
                    />
                  </div>
                ))}
                <div
                  className="absolute z-30 transition-[left,top] duration-100 ease-linear"
                  style={stagePosition(snapshot.self)}
                >
                  <ChibiAvatar
                    identity={fallbackIdentity}
                    name={localName}
                    self
                    activity={snapshot.self.activity}
                  />
                </div>

                <div className="absolute bottom-3 left-3 z-40 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel/90 p-2 shadow-lg backdrop-blur">
                  <span className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-card px-3 text-[0.7rem] font-bold text-fg-2">
                    <Gamepad2 size={14} aria-hidden />
                    WASD / ↑↓←→
                  </span>
                  <span className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-card px-3 text-[0.7rem] font-bold text-fg-2">
                    <MousePointer2 size={14} aria-hidden />
                    {bt("빈 공간 클릭 이동", "Click empty space to move")}
                  </span>
                  <span className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-accent-soft px-3 text-[0.7rem] font-black text-accent">
                    <CircleDot size={14} aria-hidden />
                    {bt(currentZone.labelKo, currentZone.labelEn)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
              {STUDIO_VIRTUAL_SPACE_ZONES.map((zone) => (
                <MobileZoneCard
                  key={zone.id}
                  zone={zone}
                  projectId={projectId}
                  onAssistant={openAssistant}
                />
              ))}
            </div>
          </div>

          <aside className="space-y-4">
            <section className="rounded-3xl border border-line bg-panel/70 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[0.64rem] font-black uppercase tracking-[0.14em] text-accent">NEARBY HUDDLE</p>
                  <h2 className="mt-1 text-base font-black">{bt("근처 팀원", "Nearby teammates")}</h2>
                </div>
                <Headphones size={18} className="text-accent" aria-hidden />
              </div>
              <p className="mt-2 text-xs leading-5 text-fg-3">
                {bt(
                  "가까운 사람 최대 3명만 P2P 대화 대상으로 잡습니다. 마이크와 카메라는 직접 켤 때만 권한을 요청합니다.",
                  "Only the three nearest people become P2P huddle candidates. Mic and camera permissions are requested only when you turn them on.",
                )}
              </p>
              <div className="mt-3 space-y-2">
                {snapshot.nearbyPeers.length ? snapshot.nearbyPeers.map((peer) => (
                  <div key={peer.participant.sessionId} className="flex items-center gap-2 rounded-xl border border-line bg-card/70 p-2.5">
                    <ChibiAvatar
                      identity={peer.participant.sessionId}
                      name={peer.participant.displayName}
                      compact
                      activity={peer.state.activity}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">{peer.participant.displayName}</p>
                      <p className="truncate text-[0.68rem] text-fg-3">
                        {STUDIO_VIRTUAL_SPACE_ZONES.find((zone) => zone.id === peer.state.zoneId)?.labelKo ?? peer.state.zoneId}
                      </p>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-line p-4 text-center text-xs leading-5 text-fg-3">
                    {bt("조금 더 가까이 가면 근처 대화를 시작할 수 있어요.", "Move closer to someone to start a nearby huddle.")}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={!signedIn || !connectivity.serverAvailable || !snapshot.direct || snapshot.nearbyPeers.length === 0}
                onClick={startNearbyHuddle}
                className={buttonClass({ className: "mt-3 w-full gap-2 disabled:cursor-not-allowed disabled:opacity-50" })}
              >
                <Mic2 size={15} aria-hidden />
                {bt("근처 P2P 대화 열기", "Open nearby P2P huddle")}
              </button>
              {!signedIn ? (
                <p className="mt-2 text-[0.68rem] leading-5 text-fg-3">
                  {bt("게스트는 공간을 둘러볼 수 있지만 프로젝트 대화에는 로그인 권한이 필요합니다.", "Guests can explore the space, but project huddles require an authenticated account.")}
                </p>
              ) : null}
            </section>

            <section className="rounded-3xl border border-line bg-panel/70 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-black">{connectivity.localOnly ? bt("로컬 상태", "Local state") : bt("접속 중", "Online")}</h2>
                <span className="text-xs font-bold text-fg-3">{visibleParticipantCount}</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ChibiAvatar identity={fallbackIdentity} name={localName} compact activity={snapshot.self.activity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{localName} · {bt("나", "Me")}</p>
                    <p className="truncate text-[0.68rem] text-accent">{bt(currentZone.labelKo, currentZone.labelEn)}</p>
                  </div>
                </div>
                {snapshot.peers.slice(0, 7).map((peer) => (
                  <div key={peer.participant.sessionId} className="flex items-center gap-2">
                    <ChibiAvatar identity={peer.participant.sessionId} name={peer.participant.displayName} compact activity={peer.state.activity} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{peer.participant.displayName}</p>
                      <p className="truncate text-[0.68rem] text-fg-3">
                        {STUDIO_VIRTUAL_SPACE_ZONES.find((zone) => zone.id === peer.state.zoneId)?.labelKo ?? peer.state.zoneId}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <label className="mt-4 block text-[0.68rem] font-bold text-fg-3">
                {bt("내 상태", "My status")}
                <select
                  value={activity}
                  onChange={(event) => setPresenceActivity(event.target.value as StudioVirtualSpaceActivity)}
                  className="mt-1 min-h-10 w-full rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg"
                >
                  <option value="available">{bt("대화 가능", "Available")}</option>
                  <option value="focused">{bt("집중 작업 중", "Focusing")}</option>
                  <option value="reviewing">{bt("검토 중", "Reviewing")}</option>
                  <option value="away">{bt("자리 비움", "Away")}</option>
                </select>
              </label>
            </section>
          </aside>
        </section>

        <section className="mt-4 grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={openAssistant}
            className="group rounded-3xl border border-line bg-gradient-to-br from-fuchsia-100/50 via-card to-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 dark:from-fuchsia-950/20"
          >
            <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent">
              <WandSparkles size={18} aria-hidden />
            </span>
            <strong className="mt-4 block text-sm font-black">{bt("AI 프로듀서", "AI Producer")}</strong>
            <span className="mt-1 block text-xs leading-5 text-fg-3">
              {bt("현재 프로젝트 맥락에서 회의 후속 작업, 검토, 다음 액션을 빠르게 찾아요.", "Find meeting follow-ups, review work and next actions in the current project context.")}
            </span>
          </button>
          <Link
            href={`/studio/work/${encodeURIComponent(projectId)}/canvas?live=1`}
            className="group rounded-3xl border border-line bg-gradient-to-br from-rose-100/50 via-card to-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 dark:from-rose-950/20"
          >
            <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Clapperboard size={18} aria-hidden />
            </span>
            <strong className="mt-4 block text-sm font-black">{bt("라이브 드로잉", "Live Drawing")}</strong>
            <span className="mt-1 block text-xs leading-5 text-fg-3">
              {bt("기존 실시간 캔버스·커서·따라가기·P2P 화면 공유를 그대로 사용합니다.", "Reuse the existing live canvas, cursors, follow mode and P2P screen sharing.")}
            </span>
          </Link>
          <Link
            href="/showcase"
            className="group rounded-3xl border border-line bg-gradient-to-br from-sky-100/50 via-card to-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 dark:from-sky-950/20"
          >
            <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Heart size={18} aria-hidden />
            </span>
            <strong className="mt-4 block text-sm font-black">{bt("크리에이터 플라자", "Creator Plaza")}</strong>
            <span className="mt-1 block text-xs leading-5 text-fg-3">
              {bt("작품 전시·라이브 이벤트·협업 모집으로 이어지는 공개 공간의 진입점입니다.", "An entry point to public showcases, live events and collaboration discovery.")}
            </span>
          </Link>
        </section>

        <section className="mt-4 rounded-3xl border border-line bg-panel/60 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Radio size={15} /></span>
              <div><strong className="text-xs">{bt("P2P 우선", "P2P first")}</strong><p className="mt-1 text-[0.68rem] leading-5 text-fg-3">{bt("위치와 대화 데이터는 RTC direct lane으로 보냅니다.", "Spatial and huddle data use the RTC direct lane.")}</p></div>
            </div>
            <div className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Video size={15} /></span>
              <div><strong className="text-xs">{bt("영상은 필요할 때만", "Video on demand")}</strong><p className="mt-1 text-[0.68rem] leading-5 text-fg-3">{bt("기본 상태에서는 카메라·마이크 스트림을 만들지 않습니다.", "No camera or microphone stream exists by default.")}</p></div>
            </div>
            <div className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><UsersRound size={15} /></span>
              <div><strong className="text-xs">{bt("근처 최대 3명", "Up to 3 nearby peers")}</strong><p className="mt-1 text-[0.68rem] leading-5 text-fg-3">{bt("소규모 mesh로 업로드 대역폭과 CPU를 제한합니다.", "Small mesh cohorts bound upload bandwidth and CPU.")}</p></div>
            </div>
            <div className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Sparkles size={15} /></span>
              <div><strong className="text-xs">{bt("원고 동기화 분리", "Document sync separated")}</strong><p className="mt-1 text-[0.68rem] leading-5 text-fg-3">{bt("이 공간에서는 CRDT를 띄우지 않고 실제 편집 화면에서만 동기화합니다.", "The space skips CRDT; document sync starts only inside an editor.")}</p></div>
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}

export function StudioVirtualSpacePage() {
  const bt = useBilingual("StudioVirtualSpacePage");
  const { projectId = "" } = useParams<{ projectId: string }>();
  const decodedProjectId = decodeProjectId(projectId);
  const session = useSession();
  const userId = session.data?.user.id ?? null;
  const transportFactory = useStudioLiveTransportAuth({
    authReady: session.ready,
    userId,
  });
  const participant = useMemo(() => {
    if (!session.ready || !transportFactory) return null;
    return {
      displayName: session.data?.user.name
        ?? session.data?.user.email
        ?? bt("게스트 크리에이터", "Guest creator"),
      role: session.data ? "editor" as const : "viewer" as const,
    };
  }, [bt, session.data, session.ready, transportFactory]);

  useDocumentTitle(`${bt("협업 스튜디오", "Collaboration Studio")} · ToonStudio`);

  if (!validProjectId(decodedProjectId)) {
    return (
      <Container size="wide" className="py-10">
        <section className="rounded-3xl border border-line bg-card p-6" role="alert">
          <h1 className="text-xl font-black">{bt("프로젝트를 찾을 수 없어요.", "Project not found.")}</h1>
          <Link href="/studio" className={buttonClass({ className: "mt-5" })}>
            {bt("내 작업으로", "Go to My work")}
          </Link>
        </section>
      </Container>
    );
  }

  return (
    <StudioLiveCollaborationProvider
      workId={decodedProjectId}
      participant={participant}
      currentPageId="virtual-space"
      currentTool="spatial-presence"
      outboxScope={null}
      transportFactory={transportFactory}
      serverRequired
      ephemeralOnly
    >
      <VirtualSpaceExperience
        projectId={decodedProjectId}
        preparing={!session.ready || !transportFactory}
        signedIn={Boolean(session.data)}
      />
    </StudioLiveCollaborationProvider>
  );
}

export default StudioVirtualSpacePage;
