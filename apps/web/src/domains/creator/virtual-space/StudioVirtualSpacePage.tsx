import {
  Bell,
  Bot,
  BookOpen,
  Boxes,
  Brush,
  CalendarDays,
  CircleDot,
  ClipboardCheck,
  CloudOff,
  Coffee,
  ExternalLink,
  Footprints,
  FolderKanban,
  Gamepad2,
  GalleryHorizontalEnd,
  Headphones,
  Home,
  LayoutGrid,
  Map,
  MessageCircle,
  Mic2,
  MousePointer2,
  Radio,
  Settings,
  Sparkles,
  UsersRound,
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
} from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import {
  VirtualStudioAmbientActors,
  VirtualStudioMasterBackdrop,
} from "@/shared/components/virtual-studio/VirtualStudioMasterWorld";
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
  STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  STUDIO_VIRTUAL_SPACE_AVATAR_COUNT,
  STUDIO_VIRTUAL_SPACE_HEIGHT,
  STUDIO_VIRTUAL_SPACE_WIDTH,
  STUDIO_VIRTUAL_SPACE_ZONES,
  clampStudioVirtualSpacePoint,
  studioVirtualSpaceDestination,
  studioVirtualSpaceInitialPoint,
  studioVirtualSpaceState,
  type StudioVirtualSpaceActivity,
  type StudioVirtualSpaceFacing,
  type StudioVirtualSpacePoint,
  type StudioVirtualSpaceZone,
  type StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";
import {
  STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS,
  StudioVirtualSpacePresenceController,
  type StudioVirtualSpaceReaction,
  type StudioVirtualSpaceSnapshot,
} from "./studio-virtual-space-presence";
import {
  readStudioVirtualSpaceGamepadInput,
} from "./studio-virtual-space-gamepad";
import {
  STUDIO_VIRTUAL_SPACE_INTERACTIONS,
  selectNearestStudioVirtualSpaceInteraction,
  type StudioVirtualSpaceInteraction,
} from "./studio-virtual-space-interactions";
import {
  STUDIO_VIRTUAL_SPACE_CLICK_STOP_DISTANCE,
  STUDIO_VIRTUAL_SPACE_WALK_SPEED,
  findStudioVirtualSpacePath,
  normalizeStudioVirtualSpaceVector,
  resolveStudioVirtualSpaceMovement,
  studioVirtualSpaceCanOccupy,
  studioVirtualSpaceStepToward,
} from "./studio-virtual-space-navigation";
import { StudioVirtualSpaceJoystick } from "./StudioVirtualSpaceJoystick";
import { StudioChibiSprite } from "@/shared/components/virtual-studio/StudioChibiSprite";

import "./studio-virtual-space.css";
import "@/shared/components/virtual-studio/virtual-studio-shell.css";

const KEYBOARD_MOVEMENT_KEYS = new Set(["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"]);
const MOBILE_CAMERA_SCALE = 0.72;
const VIRTUAL_SPACE_POSITION_STORAGE_PREFIX = "toonspectrum:virtual-space-position:v1";
const VIRTUAL_SPACE_AVATAR_STORAGE_KEY = "toonspectrum:virtual-space-avatar:v1";
const VIRTUAL_SPACE_REACTIONS: readonly {
  readonly id: StudioVirtualSpaceReaction;
  readonly emoji: string;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "wave", emoji: "👋", labelKo: "인사", labelEn: "Wave" },
  { id: "heart", emoji: "❤️", labelKo: "좋아요", labelEn: "Love" },
  { id: "sparkles", emoji: "✨", labelKo: "멋져요", labelEn: "Sparkles" },
  { id: "thumbs-up", emoji: "👍", labelKo: "좋습니다", labelEn: "Thumbs up" },
];

function virtualSpaceReactionEmoji(reaction: StudioVirtualSpaceReaction | null | undefined): string | null {
  return VIRTUAL_SPACE_REACTIONS.find((candidate) => candidate.id === reaction)?.emoji ?? null;
}

function virtualSpacePositionStorageKey(projectId: string): string {
  return `${VIRTUAL_SPACE_POSITION_STORAGE_PREFIX}:${projectId}`;
}

function readVirtualSpaceSessionPoint(
  projectId: string,
  fallback: StudioVirtualSpacePoint,
): StudioVirtualSpacePoint {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(virtualSpacePositionStorageKey(projectId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return fallback;
    const candidate = clampStudioVirtualSpacePoint({ x: parsed.x, y: parsed.y });
    return studioVirtualSpaceCanOccupy(candidate) ? candidate : fallback;
  } catch {
    return fallback;
  }
}

function writeVirtualSpaceSessionPoint(projectId: string, point: StudioVirtualSpacePoint): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      virtualSpacePositionStorageKey(projectId),
      JSON.stringify({ x: Math.round(point.x), y: Math.round(point.y) }),
    );
  } catch {
    // Storage can be unavailable in privacy-constrained browsers; movement still works in memory.
  }
}
const VIRTUAL_AVATARS = [
  { labelKo: "하늘", labelEn: "Haneul", skin: "pink" },
  { labelKo: "시나", labelEn: "Sina", skin: "silver" },
  { labelKo: "지훈", labelEn: "Jihun", skin: "dark" },
  { labelKo: "리호", labelEn: "Riho", skin: "purple" },
] as const;

function virtualAvatarIndex(identity: string): number {
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % VIRTUAL_AVATARS.length;
}

function resolveVirtualAvatarIndex(identity: string, preferredIndex = STUDIO_VIRTUAL_SPACE_AUTO_AVATAR): number {
  return Number.isInteger(preferredIndex)
    && preferredIndex >= 0
    && preferredIndex < STUDIO_VIRTUAL_SPACE_AVATAR_COUNT
    ? preferredIndex
    : virtualAvatarIndex(identity);
}

function readVirtualSpaceAvatarIndex(): number {
  if (typeof window === "undefined") return STUDIO_VIRTUAL_SPACE_AUTO_AVATAR;
  try {
    const raw = window.localStorage.getItem(VIRTUAL_SPACE_AVATAR_STORAGE_KEY);
    const index = raw == null ? NaN : Number(raw);
    return Number.isInteger(index) && index >= 0 && index < STUDIO_VIRTUAL_SPACE_AVATAR_COUNT
      ? index
      : STUDIO_VIRTUAL_SPACE_AUTO_AVATAR;
  } catch {
    return STUDIO_VIRTUAL_SPACE_AUTO_AVATAR;
  }
}

function writeVirtualSpaceAvatarIndex(index: number): void {
  if (typeof window === "undefined") return;
  try {
    if (index >= 0 && index < STUDIO_VIRTUAL_SPACE_AVATAR_COUNT) {
      window.localStorage.setItem(VIRTUAL_SPACE_AVATAR_STORAGE_KEY, String(index));
    } else {
      window.localStorage.removeItem(VIRTUAL_SPACE_AVATAR_STORAGE_KEY);
    }
  } catch {
    // Local avatar choice is optional; a deterministic fallback remains available.
  }
}

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

function VirtualSpaceMiniMap({
  snapshot,
  currentZone,
  onMoveTo,
}: {
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly currentZone: StudioVirtualSpaceZone;
  readonly onMoveTo: (point: StudioVirtualSpacePoint) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceMiniMap");

  return (
    <div
      className="studio-vspace-minimap absolute right-3 top-3 z-50 hidden w-44 overflow-hidden rounded-2xl border border-white/15 bg-panel/90 p-2 shadow-2xl backdrop-blur-xl sm:block"
      data-space-interactive="true"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <span className="inline-flex items-center gap-1.5 text-[0.58rem] font-black uppercase tracking-[0.12em] text-fg-2">
          <Map size={11} aria-hidden />
          {bt("스튜디오 맵", "Studio map")}
        </span>
        <span className="max-w-20 truncate text-[0.52rem] font-bold text-accent">
          {bt(currentZone.labelKo, currentZone.labelEn)}
        </span>
      </div>
      <button
        type="button"
        className="studio-vspace-minimap-stage relative block aspect-[59/36] w-full overflow-hidden rounded-xl border border-line/70 bg-canvas/80 text-left"
        aria-label={bt("미니맵에서 이동할 위치 선택", "Choose a destination on the minimap")}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          onMoveTo(clampStudioVirtualSpacePoint({
            x: ((event.clientX - rect.left) / rect.width) * STUDIO_VIRTUAL_SPACE_WIDTH,
            y: ((event.clientY - rect.top) / rect.height) * STUDIO_VIRTUAL_SPACE_HEIGHT,
          }));
        }}
      >
        {STUDIO_VIRTUAL_SPACE_ZONES.map((zone) => (
          <span
            key={zone.id}
            className="studio-vspace-minimap-zone absolute rounded-[3px] border"
            data-active={zone.id === currentZone.id || undefined}
            style={{
              left: `${(zone.x / STUDIO_VIRTUAL_SPACE_WIDTH) * 100}%`,
              top: `${(zone.y / STUDIO_VIRTUAL_SPACE_HEIGHT) * 100}%`,
              width: `${(zone.width / STUDIO_VIRTUAL_SPACE_WIDTH) * 100}%`,
              height: `${(zone.height / STUDIO_VIRTUAL_SPACE_HEIGHT) * 100}%`,
            }}
            aria-hidden
          />
        ))}
        {snapshot.peers.map((peer) => (
          <span
            key={peer.participant.sessionId}
            className="studio-vspace-minimap-peer absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-good shadow-[0_0_6px_rgba(110,231,160,.8)]"
            style={stagePosition(peer.state)}
            aria-hidden
          />
        ))}
        <span
          className="studio-vspace-minimap-self absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow-[0_0_10px_var(--color-accent)]"
          style={stagePosition(snapshot.self)}
          aria-hidden
        />
      </button>
    </div>
  );
}

const REFERENCE_PLAYER_SKINS = ["pink", "silver", "dark", "purple"] as const;

function ChibiAvatar({
  identity,
  name,
  self = false,
  activity = "available",
  compact = false,
  facing = "down",
  moving = false,
  nearby = false,
  reaction = null,
  avatarIndex = STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
}: {
  readonly identity: string;
  readonly name: string;
  readonly self?: boolean;
  readonly activity?: StudioVirtualSpaceActivity;
  readonly compact?: boolean;
  readonly facing?: StudioVirtualSpaceFacing;
  readonly moving?: boolean;
  readonly nearby?: boolean;
  readonly reaction?: StudioVirtualSpaceReaction | null;
  readonly avatarIndex?: number;
}) {
  const variant = resolveVirtualAvatarIndex(identity, avatarIndex);
  const skin = REFERENCE_PLAYER_SKINS[variant % REFERENCE_PLAYER_SKINS.length] ?? "pink";
  const reactionEmoji = virtualSpaceReactionEmoji(reaction);
  const motion = moving
    ? "walk"
    : activity === "reviewing"
      ? "review"
      : activity === "focused"
        ? "draw"
        : nearby
          ? "talk"
          : "idle";

  if (compact) {
    return (
      <span
        className={cn(
          "relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-panel bg-[radial-gradient(circle_at_50%_35%,oklch(0.38_0.06_320),oklch(0.18_0.02_260)_72%)] shadow-[0_6px_18px_oklch(0.08_0_0/0.28)]",
          self && "ring-2 ring-accent/60 ring-offset-1 ring-offset-panel",
        )}
        aria-hidden
      >
        <img
          src={`/assets/virtual-studio/reference/player-${skin}-direction-down.png`}
          alt=""
          draggable={false}
          className="studio-vspace-reference-compact-player"
        />
      </span>
    );
  }

  return (
    <div
      className={cn(
        "studio-vspace-avatar pointer-events-none relative flex h-[7.8rem] w-[6.2rem] -translate-x-1/2 -translate-y-[86%] flex-col items-center",
        self && "drop-shadow-[0_0_18px_oklch(0.7_0.18_300/0.55)]",
      )}
      data-facing={facing}
      data-moving={moving || undefined}
      data-nearby={nearby || undefined}
      data-self={self || undefined}
      aria-label={name}
    >
      <span
        className="studio-vspace-reference-player"
        data-motion={motion}
        data-direction={facing}
        data-skin={skin}
        aria-hidden="true"
      >
        <img
          src={
            skin === "pink" && motion === "draw"
              ? "/assets/virtual-studio/reference/player-pink-state-draw.png"
              : skin === "pink" && motion === "review"
                ? "/assets/virtual-studio/reference/player-pink-state-review.png"
                : skin === "pink" && motion === "talk"
                  ? "/assets/virtual-studio/reference/player-pink-state-talk.png"
                  : `/assets/virtual-studio/reference/player-${skin}-direction-${facing}.png`
          }
          alt=""
          draggable={false}
        />
        <i
          className={cn(
            "studio-vspace-reference-online",
            activity === "away" && "is-away",
          )}
        />
      </span>
      {reactionEmoji ? (
        <span
          className="studio-vspace-reaction absolute -top-5 left-1/2 z-50 grid size-10 -translate-x-1/2 place-items-center rounded-2xl border border-white/30 bg-panel/95 text-xl shadow-xl backdrop-blur"
          aria-hidden
        >
          {reactionEmoji}
        </span>
      ) : null}
      <span className="absolute -bottom-4 left-1/2 z-40 flex max-w-32 -translate-x-1/2 items-center gap-1 truncate rounded-full border border-line bg-panel/95 px-2 py-0.5 text-[0.58rem] font-black text-fg shadow-sm backdrop-blur">
        {self ? <Sparkles size={9} className="shrink-0 text-accent" aria-hidden /> : null}
        <span className="truncate">{name}</span>
      </span>
      {self ? (
        <span className="absolute -right-1 top-1 z-30 rounded-full bg-accent px-1.5 py-0.5 text-[0.45rem] font-black uppercase tracking-wide text-on-accent shadow-sm">
          ME
        </span>
      ) : null}
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
  const connectivity = useSyncExternalStore(
    subscribeStudioConnectivity,
    getStudioConnectivitySnapshot,
    getStudioConnectivityServerSnapshot,
  );
  const direct = Boolean(live.room?.direct && live.availability === "ready");
  const tone = connectivity.localOnly
    ? "bg-warn"
    : direct
      ? "bg-good"
      : live.availability === "error"
        ? "bg-danger"
        : "bg-warn";
  const label = connectivity.mode === "offline"
    ? bt("오프라인 · 로컬 작업", "Offline · local work")
    : connectivity.mode === "server-unavailable"
      ? bt("서버 연결 없음 · 로컬 작업", "Server unavailable · local work")
      : connectivity.mode === "reconnecting"
        ? bt("온라인 복구 중", "Reconnecting")
        : preparing
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
      <span className="studio-vspace-master-zone-glass absolute inset-0 rounded-[1.2rem]" aria-hidden />
      <span className="relative z-[3] flex items-start justify-between gap-2">
        <span className="rounded-lg border border-black/10 bg-[#fff1dc]/90 px-2.5 py-1.5 text-[#38271f] shadow-md backdrop-blur-sm">
          <span className="flex items-center gap-1.5 text-[0.54rem] font-black uppercase tracking-[0.08em] opacity-70">
            <Icon size={11} aria-hidden />
            {zone.id === "live" ? "LIVE" : zone.id.toUpperCase()}
          </span>
          <strong className="mt-0.5 block text-[0.7rem] font-black">
            {bt(zone.labelKo, zone.labelEn)}
          </strong>
        </span>
        {destination || zone.destination === "assistant" ? (
          <ExternalLink size={13} className="text-white/75 drop-shadow" aria-hidden />
        ) : null}
      </span>
    </>
  );
  const className = cn(
    "studio-vspace-zone absolute flex flex-col overflow-hidden rounded-[1.2rem] border p-2 text-left transition-all duration-200",
    active
      ? "z-[2] border-accent/70 bg-accent/5 ring-2 ring-accent/20"
      : "border-transparent bg-transparent",
    (destination || zone.destination === "assistant") && "hover:border-white/25 hover:bg-white/5",
  );
  return (
    <div style={style} className={className} data-zone={zone.id}>
      {body}
      {zone.destination === "assistant" ? (
        <button
          type="button"
          className="absolute bottom-3 right-3 z-[8] inline-flex min-h-8 items-center gap-1 rounded-xl border border-white/20 bg-panel/85 px-2.5 text-[0.58rem] font-black text-fg shadow-md backdrop-blur hover:border-accent/50 hover:text-accent"
          data-space-interactive="true"
          onClick={onAssistant}
        >
          E · {bt("열기", "Open")}
        </button>
      ) : destination ? (
        <Link
          href={destination}
          className="absolute bottom-3 right-3 z-[8] inline-flex min-h-8 items-center gap-1 rounded-xl border border-white/20 bg-panel/85 px-2.5 text-[0.58rem] font-black text-fg shadow-md backdrop-blur hover:border-accent/50 hover:text-accent"
          data-space-interactive="true"
        >
          E · {bt("열기", "Open")}
        </Link>
      ) : null}
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
    "relative flex min-h-28 flex-col overflow-hidden rounded-2xl border border-line bg-gradient-to-br p-4 text-left shadow-sm",
    ZONE_TONES[zone.id],
  );
  const body = (
    <>
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,oklch(0.72_0.15_300/0.16),transparent_35%),linear-gradient(145deg,var(--color-card),var(--color-panel))]" aria-hidden />
      <span className="absolute -right-5 -top-5 size-24 rounded-full border border-white/10 bg-accent/10 blur-[1px]" aria-hidden />
      <span className="relative flex items-center justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-xl border border-line/70 bg-panel/80 text-accent">
          <Icon size={17} aria-hidden />
        </span>
        {(destination || zone.destination === "assistant") && <ExternalLink size={14} className="text-fg-3" aria-hidden />}
      </span>
      <strong className="relative mt-3 text-sm font-black text-fg">{bt(zone.labelKo, zone.labelEn)}</strong>
      <span className="relative mt-1 text-xs leading-5 text-fg-3">{bt(zone.descriptionKo, zone.descriptionEn)}</span>
    </>
  );
  if (zone.destination === "assistant") {
    return <button type="button" className={className} onClick={onAssistant}>{body}</button>;
  }
  if (destination) return <Link href={destination} className={className}>{body}</Link>;
  return <div className={className}>{body}</div>;
}

function LiveStudioTopbar({
  projectId,
  preparing,
  snapshot,
  fallbackIdentity,
  localName,
}: {
  readonly projectId: string;
  readonly preparing: boolean;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly fallbackIdentity: string;
  readonly localName: string;
}) {
  const bt = useBilingual("LiveStudioTopbar");
  const peers = snapshot.peers.slice(0, 4);
  return (
    <header className="vs2-topbar vs2-live-topbar">
      <Link href="/" className="vs2-brand" aria-label="ToonSpectrum">
        <span className="vs2-brand-mark"><Sparkles size={17} aria-hidden /></span>
        <span><strong>ToonSpectrum</strong><small>Together, We Create Amazing Stories</small></span>
      </Link>
      <div className="vs2-project">
        <span className="vs2-project-icon"><Sparkles size={15} aria-hidden /></span>
        <strong>{projectId}</strong><span aria-hidden>⌄</span>
        <em>EP 38⌄</em>
        <span className="vs2-studio-pill">◉ {bt("스튜디오", "Studio")}</span>
        <ConnectionBadge preparing={preparing} />
        <span className="vs2-online">● {snapshot.peers.length + 1}{bt("명 접속 중", " online")}</span>
        <div className="vs2-stack" aria-label={bt("접속 중인 멤버", "Online members")}>
          <span className="vs2-tiny-avatar" title={localName}>
            <ChibiAvatar
              identity={fallbackIdentity}
              name={localName}
              compact
              activity={snapshot.self.activity}
              avatarIndex={snapshot.self.avatarIndex}
            />
          </span>
          {peers.map((peer) => (
            <span className="vs2-tiny-avatar" key={peer.participant.sessionId} title={peer.participant.displayName}>
              <ChibiAvatar
                identity={peer.participant.sessionId}
                name={peer.participant.displayName}
                compact
                activity={peer.state.activity}
                avatarIndex={peer.state.avatarIndex}
              />
            </span>
          ))}
        </div>
      </div>
      <div className="vs2-top-actions">
        <Link href="/calendar" aria-label={bt("캘린더", "Calendar")}><CalendarDays size={17} /></Link>
        <button type="button" aria-label={bt("알림", "Notifications")}><Bell size={17} /><i /></button>
        <Link href={`/studio/p/${encodeURIComponent(projectId)}/settings`} aria-label={bt("프로젝트 설정", "Project settings")}><Settings size={17} /></Link>
        <span className="vs2-mascot"><StudioChibiSprite variant={10} size={45} motion="idle" /></span>
        <span className="vs2-slogan">{bt("좋은 이야기가", "Good stories")}<br />{bt("세상을 바꿔요! ✨", "change the world! ✨")}</span>
      </div>
    </header>
  );
}

function LiveStudioSidebar({
  projectId,
  localName,
  snapshot,
}: {
  readonly projectId: string;
  readonly localName: string;
  readonly snapshot: StudioVirtualSpaceSnapshot;
}) {
  const bt = useBilingual("LiveStudioSidebar");
  const reviewHref = studioVirtualSpaceDestination(projectId, "review") ?? "/production";
  const assetHref = studioVirtualSpaceDestination(projectId, "assets") ?? "/studio/assets";
  const storyHref = studioVirtualSpaceDestination(projectId, "story") ?? "/story-lab";
  const items: readonly {
    readonly href: string;
    readonly ko: string;
    readonly en: string;
    readonly icon: typeof Home;
    readonly active?: boolean;
  }[] = [
    { href: "/", ko: "홈", en: "Home", icon: Home },
    { href: `/studio/p/${encodeURIComponent(projectId)}/overview`, ko: "프로젝트", en: "Project", icon: FolderKanban },
    { href: `/studio/p/${encodeURIComponent(projectId)}/space`, ko: "스튜디오", en: "Studio", icon: Sparkles, active: true },
    { href: `/studio/work/${encodeURIComponent(projectId)}/canvas`, ko: "작품 관리", en: "Works", icon: GalleryHorizontalEnd },
    { href: "/collaborate", ko: "멤버", en: "Members", icon: UsersRound },
    { href: reviewHref, ko: "작업 보드", en: "Production", icon: ClipboardCheck },
    { href: assetHref, ko: "에셋 라이브러리", en: "Assets", icon: Boxes },
    { href: "/studio/ai-settings", ko: "AI 프로듀서", en: "AI Producer", icon: Bot },
    { href: "/community", ko: "커뮤니티", en: "Community", icon: MessageCircle },
    { href: storyHref, ko: "스토리", en: "Story", icon: BookOpen },
  ] as readonly {
    readonly href: string;
    readonly ko: string;
    readonly en: string;
    readonly icon: typeof Home;
    readonly active?: boolean;
  }[];
  return (
    <aside className="vs2-sidebar vs2-live-sidebar">
      <nav aria-label={bt("Virtual Studio 메뉴", "Virtual Studio navigation")}>
        {items.map(({ href, ko, en, icon: Icon, active }) => (
          <Link key={href + ko} href={href} className={active ? "is-active" : undefined}>
            <Icon size={17} aria-hidden /><span>{bt(ko, en)}</span>{active ? null : <i />}
          </Link>
        ))}
      </nav>
      <Link href="/showcase" className="vs2-promo" aria-label={bt("함께 만드는 더 큰 이야기", "Together we make bigger stories")}>
        <img src="/assets/virtual-studio/reference/ui/sidebar-promo.jpg" alt="" className="vs2-reference-promo-img" />
      </Link>
      <div className="vs2-self">
        <span className="vs2-tiny-avatar">
          <ChibiAvatar
            identity="local-self"
            name={localName}
            compact
            activity={snapshot.self.activity}
            avatarIndex={snapshot.self.avatarIndex}
          />
        </span>
        <span><strong>{localName}</strong><small>● {bt("온라인", "Online")}</small></span>
        <Settings size={15} aria-hidden />
      </div>
    </aside>
  );
}

function LiveStudioBottom({
  projectId,
  openAssistant,
}: {
  readonly projectId: string;
  readonly openAssistant: () => void;
}) {
  const bt = useBilingual("LiveStudioBottom");
  const reviewHref = studioVirtualSpaceDestination(projectId, "review") ?? "/production";
  return (
    <section className="vs2-bottom vs2-live-bottom" aria-label={bt("스튜디오 기능", "Studio features")}>
      <Link href={`/studio/work/${encodeURIComponent(projectId)}/canvas?live=1`} className="vs2-feature">
        <header><strong>{bt("실시간 드로잉 협업", "Live drawing collaboration")}</strong><small>{bt("같은 캔버스에서 함께 그려요", "Draw together on one canvas")}</small></header>
        <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-drawing.jpg" alt="" className="vs2-reference-feature-img" /></div>
      </Link>
      <Link href={reviewHref} className="vs2-feature">
        <header><strong>{bt("리뷰 & 코멘트", "Review & comments")}</strong><small>{bt("정확한 위치에 피드백을 남겨요", "Pin feedback precisely")}</small></header>
        <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-review.jpg" alt="" className="vs2-reference-feature-img" /></div>
      </Link>
      <Link href="/production" className="vs2-feature">
        <header><strong>{bt("작업 보드 & 진행 상황", "Production board")}</strong><small>{bt("누가, 무엇을, 언제까지", "Who, what, by when")}</small></header>
        <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-board.jpg" alt="" className="vs2-reference-feature-img" /></div>
      </Link>
      <button type="button" className="vs2-feature text-left" onClick={openAssistant}>
        <header><strong>{bt("AI 프로듀서", "AI Producer")}</strong><small>{bt("항상 함께하는 든든한 PD", "Your always-on production partner")}</small></header>
        <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-ai.jpg" alt="" className="vs2-reference-feature-img" /></div>
      </button>
      <Link href={`/studio/work/${encodeURIComponent(projectId)}/canvas?live=1`} className="vs2-feature">
        <header><strong>{bt("라이브 드로잉 이벤트", "Live drawing events")}</strong><small>{bt("작가와 함께하는 특별한 시간", "Create live together")}</small></header>
        <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-live.jpg" alt="" className="vs2-reference-feature-img" /></div>
      </Link>
      <Link href="/community" className="vs2-feature">
        <header><strong>{bt("크리에이터 커뮤니티", "Creator community")}</strong><small>{bt("새로운 사람들과 더 많은 기회", "More creators, more opportunities")}</small></header>
        <div className="vs2-feature-body"><img src="/assets/virtual-studio/reference/ui/feature-community.jpg" alt="" className="vs2-reference-feature-img" /></div>
      </Link>
    </section>
  );
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
  const navigate = useNavigate();
  const live = useStudioLiveCollaboration();
  const connectivity = useSyncExternalStore(
    subscribeStudioConnectivity,
    getStudioConnectivitySnapshot,
    getStudioConnectivityServerSnapshot,
  );
  const controllerRef = useRef<StudioVirtualSpacePresenceController | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fallbackIdentity = live.room?.participant.sessionId ?? `space:${projectId}`;
  const initial = useMemo(() => {
    const fallback = studioVirtualSpaceInitialPoint(fallbackIdentity);
    return readVirtualSpaceSessionPoint(projectId, fallback);
  }, [fallbackIdentity, projectId]);
  const initialAvatarIndex = useMemo(() => readVirtualSpaceAvatarIndex(), []);
  const [snapshot, setSnapshot] = useState<StudioVirtualSpaceSnapshot>(() => ({
    self: studioVirtualSpaceState(initial, "down", "available", false, initialAvatarIndex),
    peers: [],
    nearbyPeers: [],
    selfReaction: null,
    peerReactions: [],
    direct: false,
  }));
  const [activity, setActivity] = useState<StudioVirtualSpaceActivity>("available");
  const [avatarIndex, setAvatarIndex] = useState(initialAvatarIndex);
  const [moving, setMoving] = useState(false);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const [followingPeerId, setFollowingPeerId] = useState<string | null>(null);
  const selfRef = useRef(snapshot.self);
  const peersRef = useRef(snapshot.peers);
  const followingPeerIdRef = useRef<string | null>(null);
  const lastFollowPathAtRef = useRef(0);
  const localReactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gamepadInteractHeldRef = useRef(false);
  const pressedKeysRef = useRef(new Set<string>());
  const joystickRef = useRef<StudioVirtualSpacePoint>({ x: 0, y: 0 });
  const clickPathRef = useRef<readonly StudioVirtualSpacePoint[]>([]);
  const movingRef = useRef(false);
  const visibleParticipantCount = connectivity.serverAvailable ? snapshot.peers.length + 1 : 1;

  useEffect(() => {
    selfRef.current = snapshot.self;
    peersRef.current = snapshot.peers;
  }, [snapshot.peers, snapshot.self]);

  const setFollowingPeer = useCallback((sessionId: string | null) => {
    followingPeerIdRef.current = sessionId;
    lastFollowPathAtRef.current = 0;
    if (!sessionId) clickPathRef.current = [];
    setFollowingPeerId(sessionId);
  }, []);

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => {
      writeVirtualSpaceSessionPoint(projectId, {
        x: snapshot.self.x,
        y: snapshot.self.y,
      });
    }, 180);
    return () => globalThis.clearTimeout(timeout);
  }, [projectId, snapshot.self.x, snapshot.self.y]);

  useEffect(() => startStudioConnectivityRuntime(), []);

  useEffect(() => {
    const syncGamepad = () => {
      const pads = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
        ? Array.from(navigator.getGamepads())
        : [];
      setGamepadConnected(pads.some((pad) => Boolean(pad?.connected)));
    };
    syncGamepad();
    globalThis.addEventListener("gamepadconnected", syncGamepad);
    globalThis.addEventListener("gamepaddisconnected", syncGamepad);
    return () => {
      globalThis.removeEventListener("gamepadconnected", syncGamepad);
      globalThis.removeEventListener("gamepaddisconnected", syncGamepad);
    };
  }, []);

  useEffect(() => () => {
    if (localReactionTimerRef.current !== null) {
      globalThis.clearTimeout(localReactionTimerRef.current);
      localReactionTimerRef.current = null;
    }
  }, []);

  const openAssistant = useCallback(() => {
    globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open"));
  }, []);

  useEffect(() => {
    const room = live.room;
    if (!connectivity.serverAvailable || !room?.direct || live.availability !== "ready") {
      controllerRef.current?.close();
      controllerRef.current = null;
      setSnapshot((current) => ({
        ...current,
        peers: [],
        nearbyPeers: [],
        selfReaction: null,
        peerReactions: [],
        direct: false,
      }));
      return undefined;
    }
    const controller = new StudioVirtualSpacePresenceController(
      room.participant,
      room.direct,
      selfRef.current,
    );
    controllerRef.current = controller;
    controller.setAvatarIndex(selfRef.current.avatarIndex);
    const refresh = () => setSnapshot(controller.snapshot());
    const unsubscribe = controller.subscribe(refresh);
    controller.start();
    refresh();
    return () => {
      unsubscribe();
      controller.close();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [connectivity.serverAvailable, live.availability, live.room]);

  const updatePosition = useCallback((
    point: StudioVirtualSpacePoint,
    facing: StudioVirtualSpaceFacing,
  ) => {
    const bounded = clampStudioVirtualSpacePoint(point);
    const nextState = studioVirtualSpaceState(
      bounded,
      facing,
      activity,
      movingRef.current,
      selfRef.current.avatarIndex,
    );
    selfRef.current = nextState;
    const controller = controllerRef.current;
    if (controller) {
      controller.update(bounded, facing, activity, movingRef.current, selfRef.current.avatarIndex);
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => ({
      ...current,
      self: nextState,
    }));
  }, [activity]);

  const activateInteraction = useCallback((interaction: StudioVirtualSpaceInteraction) => {
    writeVirtualSpaceSessionPoint(projectId, selfRef.current);
    if (interaction.action === "assistant") {
      openAssistant();
      return;
    }
    if (interaction.action === "community") {
      navigate("/community");
      return;
    }
    const destination = studioVirtualSpaceDestination(projectId, interaction.action);
    if (destination) navigate(destination);
  }, [navigate, openAssistant, projectId]);

  const activateCurrentZone = useCallback(() => {
    const nearbyInteraction = selectNearestStudioVirtualSpaceInteraction(selfRef.current);
    if (nearbyInteraction) {
      activateInteraction(nearbyInteraction);
      return;
    }
    writeVirtualSpaceSessionPoint(projectId, selfRef.current);
    const zone = STUDIO_VIRTUAL_SPACE_ZONES.find((candidate) => candidate.id === selfRef.current.zoneId);
    if (!zone) return;
    if (zone.destination === "assistant") {
      openAssistant();
      return;
    }
    const destination = studioVirtualSpaceDestination(projectId, zone.destination);
    if (destination) navigate(destination);
  }, [activateInteraction, navigate, openAssistant, projectId]);

  useEffect(() => {
    let frame = 0;
    let lastAt = performance.now();

    const setMovingState = (next: boolean) => {
      if (movingRef.current === next) return;
      movingRef.current = next;
      setMoving(next);
      if (!next) writeVirtualSpaceSessionPoint(projectId, selfRef.current);
      const controller = controllerRef.current;
      if (controller) {
        controller.setMoving(next);
        setSnapshot(controller.snapshot());
        return;
      }
      setSnapshot((current) => ({
        ...current,
        self: studioVirtualSpaceState(
          current.self,
          current.self.facing,
          activity,
          next,
          current.self.avatarIndex,
        ),
      }));
    };

    const tick = (now: number) => {
      const elapsedSeconds = Math.min(0.05, Math.max(0, (now - lastAt) / 1000));
      lastAt = now;

      let horizontal = joystickRef.current.x;
      let vertical = joystickRef.current.y;
      const keys = pressedKeysRef.current;
      if (keys.has("arrowleft") || keys.has("a")) horizontal -= 1;
      if (keys.has("arrowright") || keys.has("d")) horizontal += 1;
      if (keys.has("arrowup") || keys.has("w")) vertical -= 1;
      if (keys.has("arrowdown") || keys.has("s")) vertical += 1;

      const gamepads = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
        ? Array.from(navigator.getGamepads())
        : [];
      const gamepad = gamepads.find((candidate) => Boolean(candidate?.connected)) ?? null;
      const gamepadInput = readStudioVirtualSpaceGamepadInput(gamepad);
      horizontal += gamepadInput.x;
      vertical += gamepadInput.y;
      if (gamepadInput.interact && !gamepadInteractHeldRef.current) {
        activateCurrentZone();
      }
      gamepadInteractHeldRef.current = gamepadInput.interact;

      const current = selfRef.current;
      let next: StudioVirtualSpacePoint = current;
      let facing = current.facing;
      const hasDirectInput = Math.abs(horizontal) > 0.02 || Math.abs(vertical) > 0.02;

      if (hasDirectInput) {
        if (followingPeerIdRef.current) setFollowingPeer(null);
        clickPathRef.current = [];
        const direction = normalizeStudioVirtualSpaceVector(horizontal, vertical);
        const sprint = keys.has("shift") || gamepadInput.sprint ? 1.35 : 1;
        next = resolveStudioVirtualSpaceMovement(current, {
          x: direction.x * STUDIO_VIRTUAL_SPACE_WALK_SPEED * sprint * elapsedSeconds,
          y: direction.y * STUDIO_VIRTUAL_SPACE_WALK_SPEED * sprint * elapsedSeconds,
        });
        facing = facingFromDelta(direction.x, direction.y);
      } else {
        const followId = followingPeerIdRef.current;
        if (followId) {
          const peer = peersRef.current.find((candidate) => candidate.participant.sessionId === followId);
          if (!peer) {
            setFollowingPeer(null);
          } else {
            const distance = Math.hypot(peer.state.x - current.x, peer.state.y - current.y);
            if (distance <= 88) {
              clickPathRef.current = [];
            } else if (now - lastFollowPathAtRef.current >= 360 || clickPathRef.current.length === 0) {
              const offsetX = peer.state.x >= current.x ? -56 : 56;
              const approach = clampStudioVirtualSpacePoint({
                x: peer.state.x + offsetX,
                y: peer.state.y,
              });
              clickPathRef.current = findStudioVirtualSpacePath(current, approach);
              lastFollowPathAtRef.current = now;
            }
          }
        }

        if (clickPathRef.current.length > 0) {
          const target = clickPathRef.current[0]!;
          const dx = target.x - current.x;
          const dy = target.y - current.y;
          if (Math.hypot(dx, dy) <= STUDIO_VIRTUAL_SPACE_CLICK_STOP_DISTANCE) {
            clickPathRef.current = clickPathRef.current.slice(1);
          } else {
            next = studioVirtualSpaceStepToward(
              current,
              target,
              STUDIO_VIRTUAL_SPACE_WALK_SPEED * elapsedSeconds,
            );
            facing = facingFromDelta(dx, dy);
            if (next.x === current.x && next.y === current.y) {
              clickPathRef.current = clickPathRef.current.slice(1);
            }
          }
        }
      }

      const changed = next.x !== current.x || next.y !== current.y;
      const walking = hasDirectInput || changed || clickPathRef.current.length > 0;
      setMovingState(walking);
      if (changed) updatePosition(next, facing);

      frame = globalThis.requestAnimationFrame(tick);
    };

    frame = globalThis.requestAnimationFrame(tick);
    return () => {
      globalThis.cancelAnimationFrame(frame);
      setMovingState(false);
    };
  }, [activateCurrentZone, activity, projectId, setFollowingPeer, updatePosition]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,textarea,select,[contenteditable=true]")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "e") {
        event.preventDefault();
        activateCurrentZone();
        return;
      }
      if (key === "shift") {
        pressedKeysRef.current.add(key);
        return;
      }
      if (!KEYBOARD_MOVEMENT_KEYS.has(key)) return;
      event.preventDefault();
      clickPathRef.current = [];
      pressedKeysRef.current.add(key);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      pressedKeysRef.current.delete(event.key.toLowerCase());
    };
    const clearInput = () => {
      pressedKeysRef.current.clear();
      joystickRef.current = { x: 0, y: 0 };
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("keyup", handleKeyUp);
    globalThis.addEventListener("blur", clearInput);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("keyup", handleKeyUp);
      globalThis.removeEventListener("blur", clearInput);
    };
  }, [activateCurrentZone]);

  const queuePathTo = useCallback((point: StudioVirtualSpacePoint) => {
    setFollowingPeer(null);
    clickPathRef.current = findStudioVirtualSpacePath(selfRef.current, point);
  }, [setFollowingPeer]);

  const startFollowingPeer = useCallback((sessionId: string) => {
    const peer = peersRef.current.find((candidate) => candidate.participant.sessionId === sessionId);
    if (!peer) return;
    setFollowingPeer(sessionId);
    const offsetX = peer.state.x >= selfRef.current.x ? -56 : 56;
    clickPathRef.current = findStudioVirtualSpacePath(selfRef.current, {
      x: peer.state.x + offsetX,
      y: peer.state.y,
    });
  }, [setFollowingPeer]);

  const handleStagePointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("[data-space-interactive=true]")) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const compactCamera = globalThis.innerWidth < 1024;
    const point = compactCamera
      ? clampStudioVirtualSpacePoint({
          x: (
            event.clientX
            - rect.left
            - rect.width / 2
            + selfRef.current.x * MOBILE_CAMERA_SCALE
          ) / MOBILE_CAMERA_SCALE,
          y: (
            event.clientY
            - rect.top
            - rect.height / 2
            + selfRef.current.y * MOBILE_CAMERA_SCALE
          ) / MOBILE_CAMERA_SCALE,
        })
      : clampStudioVirtualSpacePoint({
          x: ((event.clientX - rect.left) / rect.width) * STUDIO_VIRTUAL_SPACE_WIDTH,
          y: ((event.clientY - rect.top) / rect.height) * STUDIO_VIRTUAL_SPACE_HEIGHT,
        });
    queuePathTo(point);
  }, [queuePathTo]);

  const currentZone = STUDIO_VIRTUAL_SPACE_ZONES.find((zone) => zone.id === snapshot.self.zoneId)
    ?? STUDIO_VIRTUAL_SPACE_ZONES[0]!;
  const currentInteraction = selectNearestStudioVirtualSpaceInteraction(snapshot.self);
  const approachInteraction = useCallback((interaction: StudioVirtualSpaceInteraction) => {
    const nearby = selectNearestStudioVirtualSpaceInteraction(selfRef.current);
    if (nearby?.id === interaction.id) {
      activateInteraction(interaction);
      return;
    }
    queuePathTo({ x: interaction.x, y: interaction.y });
  }, [activateInteraction, queuePathTo]);
  const followingPeer = followingPeerId
    ? snapshot.peers.find((peer) => peer.participant.sessionId === followingPeerId) ?? null
    : null;
  const localName = live.room?.participant.displayName.replace(/\s*·\s*이 탭$/u, "") || bt("나", "Me");

  const startNearbyHuddle = useCallback(() => {
    if (!connectivity.serverAvailable || !snapshot.nearbyPeers.length) return;
    openStudioP2pHuddle({
      peerIds: snapshot.nearbyPeers.map((peer) => peer.participant.sessionId),
      source: "virtual-space",
    });
  }, [connectivity.serverAvailable, snapshot.nearbyPeers]);

  const openStudioChat = useCallback(() => {
    if (!connectivity.serverAvailable) return;
    openStudioP2pHuddle({ source: "virtual-space" });
  }, [connectivity.serverAvailable]);

  const sendReaction = useCallback((reaction: StudioVirtualSpaceReaction) => {
    const controller = controllerRef.current;
    if (controller) {
      controller.sendReaction(reaction);
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => ({ ...current, selfReaction: reaction }));
    if (localReactionTimerRef.current !== null) {
      globalThis.clearTimeout(localReactionTimerRef.current);
    }
    localReactionTimerRef.current = globalThis.setTimeout(() => {
      setSnapshot((current) => ({ ...current, selfReaction: null }));
      localReactionTimerRef.current = null;
    }, STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS);
  }, []);

  const setPresenceActivity = (next: StudioVirtualSpaceActivity) => {
    setActivity(next);
    controllerRef.current?.setActivity(next);
    setSnapshot((current) => ({
      ...current,
      self: studioVirtualSpaceState(
        current.self,
        current.self.facing,
        next,
        current.self.moving,
        current.self.avatarIndex,
      ),
    }));
  };

  const selectAvatar = useCallback((nextIndex: number) => {
    if (
      !Number.isInteger(nextIndex)
      || nextIndex < STUDIO_VIRTUAL_SPACE_AUTO_AVATAR
      || nextIndex >= STUDIO_VIRTUAL_SPACE_AVATAR_COUNT
    ) return;
    setAvatarIndex(nextIndex);
    writeVirtualSpaceAvatarIndex(nextIndex);
    const controller = controllerRef.current;
    if (controller) {
      controller.setAvatarIndex(nextIndex);
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => {
      const self = studioVirtualSpaceState(
        current.self,
        current.self.facing,
        current.self.activity,
        current.self.moving,
        nextIndex,
      );
      selfRef.current = self;
      return { ...current, self };
    });
  }, []);

  return (
    <main className="vs2-shell vs2-shell--project" data-studio-live-shell="true">
      <Container size="wide" className="vs2-live-container">
        <LiveStudioTopbar
          projectId={projectId}
          preparing={preparing}
          snapshot={snapshot}
          fallbackIdentity={fallbackIdentity}
          localName={localName}
        />
        <LiveStudioSidebar
          projectId={projectId}
          localName={localName}
          snapshot={snapshot}
        />

        {connectivity.localOnly ? (
          <section
            className="mt-4 flex flex-col gap-3 rounded-2xl border border-warning/35 bg-warning-soft/10 p-4 sm:flex-row sm:items-center sm:justify-between"
            role="status"
            aria-live="polite"
            data-studio-virtual-offline="true"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-soft/20 text-warning">
                <CloudOff size={17} aria-hidden />
              </span>
              <div className="min-w-0">
                <strong className="text-sm text-fg">
                  {connectivity.mode === "offline"
                    ? bt("오프라인 로컬 모드", "Offline local mode")
                    : bt("서버 연결 없이 로컬 모드", "Local mode without server connection")}
                </strong>
                <p className="mt-1 text-xs leading-5 text-fg-3">
                  {bt(
                    "공간 탐색과 캐시된 프로젝트 작업은 계속할 수 있습니다. 팀원 발견·P2P 대화·화상·실시간 동기화는 잠시 중지되고 온라인 복귀 시 자동으로 다시 연결됩니다.",
                    "You can keep exploring the space and working with cached project data. Teammate discovery, P2P huddles, video and live sync pause temporarily and reconnect automatically when the network returns.",
                  )}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-warning/30 bg-card/70 px-3 py-2 text-[0.68rem] font-bold text-warning">
              {bt("로컬 작업 유지", "Local work stays available")}
            </span>
          </section>
        ) : null}

        <section className="vs2-live-layout">
          <div className="vs2-world-wrap vs2-world-wrap--live">
            <div className="vs2-live-stage-host">
              <div
                ref={stageRef}
                role="application"
                aria-label={bt("가상 스튜디오 공간. WASD 또는 방향키로 이동하고 E 키로 현재 방과 상호작용합니다.", "Virtual studio space. Move with WASD or arrow keys and press E to interact with the current room.")}
                onPointerDown={handleStagePointer}
                className="studio-vspace-stage relative aspect-[59/36] min-h-[30rem] w-full cursor-crosshair overflow-hidden rounded-[2rem] border border-line shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-[34rem]"
                data-studio-virtual-space="true"
              >
                <div
                  className="studio-vspace-world"
                  style={{
                    "--studio-camera-x": `${-snapshot.self.x * MOBILE_CAMERA_SCALE}px`,
                    "--studio-camera-y": `${-snapshot.self.y * MOBILE_CAMERA_SCALE}px`,
                  } as CSSProperties}
                >
                  <div className="studio-vspace-master-backdrop absolute inset-0 z-0" aria-hidden>
                    <VirtualStudioMasterBackdrop />
                  </div>
                  <div className="studio-vspace-ambient-creators absolute inset-0 z-[8] pointer-events-none">
                    <VirtualStudioAmbientActors compact />
                  </div>
                  {STUDIO_VIRTUAL_SPACE_ZONES.map((zone) => (
                    <ZoneSurface
                      key={zone.id}
                      zone={zone}
                      projectId={projectId}
                      active={currentZone.id === zone.id}
                      onAssistant={openAssistant}
                    />
                  ))}

                  {STUDIO_VIRTUAL_SPACE_INTERACTIONS.map((interaction) => {
                    const nearby = currentInteraction?.id === interaction.id;
                    return (
                      <button
                        key={interaction.id}
                        type="button"
                        className="studio-vspace-hotspot absolute z-[16] -translate-x-1/2 -translate-y-1/2"
                        style={stagePosition(interaction)}
                        data-space-interactive="true"
                        data-nearby={nearby || undefined}
                        aria-label={nearby
                          ? bt(
                              `${interaction.labelKo} 열기`,
                              `Open ${interaction.labelEn}`,
                            )
                          : bt(
                              `${interaction.labelKo} 근처로 이동`,
                              `Walk to ${interaction.labelEn}`,
                            )}
                        onClick={() => approachInteraction(interaction)}
                      >
                        <span className="studio-vspace-hotspot-orb" aria-hidden>
                          {interaction.emoji}
                        </span>
                        <span className="studio-vspace-hotspot-label">
                          <strong>{bt(interaction.labelKo, interaction.labelEn)}</strong>
                          <small>
                            {nearby
                              ? bt("E · 상호작용", "E · Interact")
                              : bt("이동", "Walk")}
                          </small>
                        </span>
                      </button>
                    );
                  })}

                <div
                  aria-hidden
                  className="studio-vspace-plaza-mascot-new pointer-events-none absolute left-1/2 top-[44%] z-[12] -translate-x-1/2 -translate-y-1/2"
                >
                  <StudioChibiSprite variant={10} size={64} motion="idle" />
                </div>

                {snapshot.peers.map((peer) => {
                  const nearby = snapshot.nearbyPeers.some(
                    (candidate) => candidate.participant.sessionId === peer.participant.sessionId,
                  );
                  const reaction = snapshot.peerReactions.find(
                    (candidate) => candidate.sessionId === peer.participant.sessionId,
                  )?.reaction ?? null;
                  return (
                    <button
                      key={peer.participant.sessionId}
                      type="button"
                      className="studio-vspace-peer absolute z-20 transition-[left,top] duration-150 ease-linear"
                      style={stagePosition(peer.state)}
                      data-space-interactive="true"
                      data-nearby={nearby || undefined}
                      aria-label={nearby
                        ? bt(`${peer.participant.displayName}님과 P2P 대화 시작`, `Start P2P huddle with ${peer.participant.displayName}`)
                        : bt(`${peer.participant.displayName}님 근처로 이동`, `Walk near ${peer.participant.displayName}`)}
                      onClick={() => {
                        if (nearby && connectivity.serverAvailable) {
                          openStudioP2pHuddle({
                            peerIds: [peer.participant.sessionId],
                            source: "virtual-space",
                          });
                          return;
                        }
                        startFollowingPeer(peer.participant.sessionId);
                      }}
                    >
                      <ChibiAvatar
                        identity={peer.participant.sessionId}
                        name={peer.participant.displayName}
                        activity={peer.state.activity}
                        facing={peer.state.facing}
                        moving={peer.state.moving}
                        nearby={nearby}
                        reaction={reaction}
                        avatarIndex={peer.state.avatarIndex}
                      />
                    </button>
                  );
                })}
                <div
                  className="absolute z-30 transition-[left,top] duration-100 ease-linear"
                  style={stagePosition(snapshot.self)}
                >
                  <ChibiAvatar
                    identity={fallbackIdentity}
                    name={localName}
                    self
                    activity={snapshot.self.activity}
                    facing={snapshot.self.facing}
                    moving={moving}
                    reaction={snapshot.selfReaction}
                    avatarIndex={snapshot.self.avatarIndex}
                  />
                </div>
                </div>

                <VirtualSpaceMiniMap
                  snapshot={snapshot}
                  currentZone={currentZone}
                  onMoveTo={queuePathTo}
                />

                <div className="absolute bottom-3 left-3 z-40 hidden max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel/90 p-2 shadow-lg backdrop-blur lg:flex">
                  <span className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-card px-3 text-[0.7rem] font-bold text-fg-2">
                    <Gamepad2 size={14} aria-hidden />
                    {gamepadConnected
                      ? bt("게임패드 · 왼쪽 스틱 / D-pad · A / Cross", "Gamepad · left stick / D-pad · A / Cross")
                      : "WASD / ↑↓←→ · Shift"}
                  </span>
                  <span className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-card px-3 text-[0.7rem] font-bold text-fg-2">
                    <MousePointer2 size={14} aria-hidden />
                    {bt("빈 공간 클릭 이동", "Click empty space to move")}
                  </span>
                  <span className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-accent-soft px-3 text-[0.7rem] font-black text-accent">
                    <CircleDot size={14} aria-hidden />
                    {bt(currentZone.labelKo, currentZone.labelEn)}
                  </span>
                  <span className={cn(
                    "inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-[0.7rem] font-black",
                    moving ? "bg-good/15 text-good" : "bg-card text-fg-3",
                  )}>
                    <span className={cn("size-2 rounded-full", moving ? "bg-good animate-pulse" : "bg-fg-3/60")} />
                    {moving ? bt("이동 중", "Walking") : bt("대기", "Idle")}
                  </span>
                  {followingPeer ? (
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-good/30 bg-good/10 px-3 text-[0.7rem] font-black text-good"
                      data-space-interactive="true"
                      onClick={() => setFollowingPeer(null)}
                    >
                      <Footprints size={13} aria-hidden />
                      {bt(`${followingPeer.participant.displayName} 따라가는 중`, `Following ${followingPeer.participant.displayName}`)}
                      <span aria-hidden>×</span>
                    </button>
                  ) : null}
                  <span className="inline-flex items-center gap-1 rounded-xl border border-line bg-card p-1" data-space-interactive="true">
                    {VIRTUAL_SPACE_REACTIONS.map((reaction) => (
                      <button
                        key={reaction.id}
                        type="button"
                        className="grid size-7 place-items-center rounded-lg text-base transition hover:bg-raised"
                        title={bt(reaction.labelKo, reaction.labelEn)}
                        aria-label={bt(reaction.labelKo, reaction.labelEn)}
                        onClick={() => sendReaction(reaction.id)}
                      >
                        {reaction.emoji}
                      </button>
                    ))}
                  </span>
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 text-[0.7rem] font-black text-accent"
                    data-space-interactive="true"
                    onClick={activateCurrentZone}
                  >
                    E · {currentInteraction
                      ? bt(currentInteraction.labelKo, currentInteraction.labelEn)
                      : bt("방 열기", "Open room")}
                  </button>
                </div>

                <div className="absolute bottom-4 right-4 z-50 lg:hidden" data-space-interactive="true">
                  <StudioVirtualSpaceJoystick
                    onVectorChange={(vector) => {
                      joystickRef.current = vector;
                      if (Math.abs(vector.x) > 0.02 || Math.abs(vector.y) > 0.02) clickPathRef.current = [];
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="absolute bottom-5 left-4 z-50 inline-flex min-h-12 max-w-[11rem] items-center gap-2 rounded-2xl border border-accent/35 bg-panel/90 px-4 text-xs font-black text-accent shadow-xl backdrop-blur lg:hidden"
                  data-space-interactive="true"
                  onClick={activateCurrentZone}
                >
                  <Gamepad2 size={15} aria-hidden />
                  <span className="truncate">
                    {currentInteraction
                      ? bt(currentInteraction.labelKo, currentInteraction.labelEn)
                      : bt("상호작용", "Interact")}
                  </span>
                </button>
                <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-line bg-panel/85 px-3 py-1.5 text-[0.65rem] font-black text-fg shadow-lg backdrop-blur lg:hidden">
                  {bt(currentZone.labelKo, currentZone.labelEn)}
                </div>
                <div className="absolute left-3 top-14 z-50 flex items-center gap-1 rounded-2xl border border-line bg-panel/85 p-1.5 shadow-lg backdrop-blur lg:hidden" data-space-interactive="true">
                  {VIRTUAL_SPACE_REACTIONS.map((reaction) => (
                    <button
                      key={reaction.id}
                      type="button"
                      className="grid size-8 place-items-center rounded-xl text-lg active:scale-90"
                      aria-label={bt(reaction.labelKo, reaction.labelEn)}
                      onClick={() => sendReaction(reaction.id)}
                    >
                      {reaction.emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="vs2-mobile-zone-cards grid gap-3 sm:grid-cols-2 lg:hidden">
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

          <aside className="vs2-rightbar vs2-rightbar--live">
            <section className="vs2-panel vs2-live-huddle">
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
                      avatarIndex={peer.state.avatarIndex}
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

            <section className="vs2-panel vs2-live-chat">
              <header>
                <strong># {bt("스튜디오 채팅", "Studio chat")}</strong>
                <MessageCircle size={15} aria-hidden />
              </header>
              <div className="vs2-live-chat-body">
                {snapshot.peers.length ? (
                  snapshot.peers.slice(0, 3).map((peer) => (
                    <div key={peer.participant.sessionId}>
                      <ChibiAvatar
                        identity={peer.participant.sessionId}
                        name={peer.participant.displayName}
                        compact
                        activity={peer.state.activity}
                        avatarIndex={peer.state.avatarIndex}
                      />
                      <span>
                        <strong>{peer.participant.displayName}</strong>
                        <small>
                          {bt(
                            STUDIO_VIRTUAL_SPACE_ZONES.find((zone) => zone.id === peer.state.zoneId)?.labelKo ?? "스튜디오",
                            STUDIO_VIRTUAL_SPACE_ZONES.find((zone) => zone.id === peer.state.zoneId)?.labelEn ?? "Studio",
                          )}
                        </small>
                      </span>
                      <i aria-hidden>●</i>
                    </div>
                  ))
                ) : (
                  <p>{bt("같은 프로젝트에 다른 팀원이 들어오면 P2P 채팅을 시작할 수 있어요.", "When teammates join this project, you can start P2P chat here.")}</p>
                )}
              </div>
              <button
                type="button"
                onClick={openStudioChat}
                disabled={!signedIn || !connectivity.serverAvailable || !snapshot.direct}
                className="vs2-live-chat-button"
              >
                <MessageCircle size={14} aria-hidden />
                {bt("P2P 채팅 열기", "Open P2P chat")}
              </button>
            </section>

            <section className="vs2-panel vs2-live-members">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-black">
                  {connectivity.localOnly ? bt("로컬 작업", "Local work") : bt("접속 중", "Online")}
                </h2>
                <span className="text-xs font-bold text-fg-3">{visibleParticipantCount}</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ChibiAvatar
                    identity={fallbackIdentity}
                    name={localName}
                    compact
                    activity={snapshot.self.activity}
                    avatarIndex={snapshot.self.avatarIndex}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{localName} · {bt("나", "Me")}</p>
                    <p className="truncate text-[0.68rem] text-accent">{bt(currentZone.labelKo, currentZone.labelEn)}</p>
                  </div>
                </div>
                {snapshot.peers.slice(0, 7).map((peer) => {
                  const following = followingPeerId === peer.participant.sessionId;
                  return (
                    <div key={peer.participant.sessionId} className="flex items-center gap-2 rounded-xl px-1 py-1">
                      <ChibiAvatar
                        identity={peer.participant.sessionId}
                        name={peer.participant.displayName}
                        compact
                        activity={peer.state.activity}
                        avatarIndex={peer.state.avatarIndex}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold">{peer.participant.displayName}</p>
                        <p className="truncate text-[0.68rem] text-fg-3">
                          {STUDIO_VIRTUAL_SPACE_ZONES.find((zone) => zone.id === peer.state.zoneId)?.labelKo ?? peer.state.zoneId}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-pressed={following}
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-lg border transition",
                          following
                            ? "border-good/40 bg-good/10 text-good"
                            : "border-line bg-card text-fg-3 hover:border-accent/40 hover:text-accent",
                        )}
                        title={following ? bt("따라가기 중지", "Stop following") : bt("이 팀원 따라가기", "Follow this teammate")}
                        onClick={() => following
                          ? setFollowingPeer(null)
                          : startFollowingPeer(peer.participant.sessionId)}
                      >
                        <Footprints size={13} aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>

              <fieldset className="mt-4 border-t border-line/70 pt-4">
                <legend className="px-1 text-[0.68rem] font-black text-fg-2">
                  {bt("내 캐릭터", "My character")}
                </legend>
                <p className="mt-1 text-[0.62rem] leading-5 text-fg-3">
                  {bt(
                    "이 선택은 이 브라우저에만 저장되고 P2P로 팀원에게 공유됩니다.",
                    "This choice stays in this browser and is shared with teammates over P2P.",
                  )}
                </p>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    aria-pressed={avatarIndex === STUDIO_VIRTUAL_SPACE_AUTO_AVATAR}
                    className={cn(
                      "relative grid aspect-square place-items-center rounded-xl border text-[0.55rem] font-black transition",
                      avatarIndex === STUDIO_VIRTUAL_SPACE_AUTO_AVATAR
                        ? "border-accent bg-accent-soft text-accent ring-2 ring-accent/20"
                        : "border-line bg-card text-fg-3 hover:border-accent/40 hover:text-accent",
                    )}
                    title={bt("자동 캐릭터", "Automatic character")}
                    onClick={() => selectAvatar(STUDIO_VIRTUAL_SPACE_AUTO_AVATAR)}
                  >
                    <Sparkles size={17} aria-hidden />
                    <span>{bt("자동", "Auto")}</span>
                  </button>
                  {VIRTUAL_AVATARS.map((avatar, index) => (
                    <button
                      key={avatar.labelEn}
                      type="button"
                      aria-pressed={avatarIndex === index}
                      className={cn(
                        "group relative grid aspect-square place-items-center overflow-hidden rounded-xl border bg-[radial-gradient(circle_at_50%_35%,oklch(0.38_0.06_320),oklch(0.18_0.02_260)_72%)] transition",
                        avatarIndex === index
                          ? "border-accent ring-2 ring-accent/25"
                          : "border-line hover:border-accent/45",
                      )}
                      title={bt(avatar.labelKo, avatar.labelEn)}
                      aria-label={bt(`${avatar.labelKo} 캐릭터 선택`, `Select ${avatar.labelEn} character`)}
                      onClick={() => selectAvatar(index)}
                    >
                      <img
                        src={`/assets/virtual-studio/reference/player-${avatar.skin}-direction-down.png`}
                        alt=""
                        draggable={false}
                        className={cn(
                          "h-[92%] w-[92%] object-contain object-bottom transition-transform duration-200",
                          avatarIndex === index ? "scale-105" : "group-hover:scale-105",
                        )}
                      />
                      {avatarIndex === index ? (
                        <span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-accent text-[0.5rem] font-black text-on-accent shadow">
                          ✓
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </fieldset>

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

        <LiveStudioBottom projectId={projectId} openAssistant={openAssistant} />

        <footer className="vs2-footer">
          <strong>ToonSpectrum</strong>
          <span>{bt("혼자가 아닌, 함께 만드는 더 큰 이야기.", "Bigger stories, made together.")}</span>
          <em>Creators for a Brighter Tomorrow ♥</em>
        </footer>
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
