import { useStudioWorldRuleGate } from "./StudioWorldRuleGate";
import {
  Bot,
  BookOpen,
  Boxes,
  Brush,
  CalendarDays,
  CircleDot,
  Coffee,
  ExternalLink,
  Footprints,
  Gamepad2,
  LayoutGrid,
  Map as MapIcon,
  MessageCircle,
  MousePointer2,
  Radio,
  Settings,
  Sparkles,
  UsersRound,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import { WorkspaceNavigation } from "@/shared/components/workspace/WorkspaceNavigation";
import { StudioSpaceWorkContext } from "../workspace/StudioSpaceWorkContext";
import { StudioWorkspaceInbox } from "../workspace/StudioWorkspaceInbox";
import { WorkspaceContextPanel } from "@/shared/components/workspace/WorkspaceContextPanel";
import "@/shared/components/workspace/workspace.css";
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
import { openStudioP2pHuddle, closeStudioP2pHuddle, STUDIO_P2P_HUDDLE_CLOSED_EVENT, type StudioP2pHuddleClosedDetail } from "../live/huddle/studio-p2p-huddle-events";
import { StudioVirtualSpaceAmbientAudio } from "./StudioVirtualSpaceAmbientAudio";
import { useStudioPrivateRoom } from "./private-room/use-studio-private-room";
import { StudioPrivateRoomPanel } from "./private-room/StudioPrivateRoomPanel";
import { studioPrivateRoomWalkTarget } from "./private-room/studio-private-room-walk";
import { useStudioLiveTransportAuth } from "../live/use-studio-live-transport-auth";
import {
  STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  studioVirtualSpaceDestination,
  studioVirtualSpaceInitialPoint,
  studioVirtualSpaceState,
  type StudioVirtualSpaceActivity,
  type StudioVirtualSpaceFacing,
  type StudioVirtualSpacePoint,
  type StudioVirtualSpacePresenceState,
  type StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";
import {
  STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS,
  StudioVirtualSpacePresenceController,
  type StudioVirtualSpaceReaction,
  type StudioVirtualSpaceSnapshot,
} from "./studio-virtual-space-presence";
import {
  clampStudioWorldPoint,
  resolveStudioWorldSpawn,
} from "./studio-virtual-space-world-pathfinding";
import { StudioVirtualSpaceJoystick } from "./StudioVirtualSpaceJoystick";
import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import {
  STUDIO_CHARACTER_SKINS,
  studioCharacterAppearanceForAvatarIndex,
  resolveStudioCharacterAppearance,
} from "./studio-virtual-space-character-skins";
import {
  StudioVirtualSpacePhaserCanvas,
  type StudioVirtualSpaceEngineLocalState,
} from "./StudioVirtualSpacePhaserCanvas";
import { loadStudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-loader";
import {
  clearStudioWorldAuthoringDraft,
  readStudioWorldAuthoringDraftRecord,
  writeStudioWorldAuthoringDraft,
} from "./studio-virtual-space-world-authoring";
import { StudioWorldAuthoringEntry } from "./StudioWorldAuthoringEntry";
import { useStudioWorldPublication } from "./world-publication/use-studio-world-publication";
import { StudioWorldPublicationPanel } from "./world-publication/StudioWorldPublicationPanel";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  studioWorldPresenceState,
  studioWorldSpawn,
  validateStudioWorldManifest,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldPortalDefinition,
  type StudioWorldRoomDefinition,
} from "./studio-virtual-space-world-manifest";
import {
  resolveStudioVirtualSpaceSessionPoint,
  studioVirtualSpacePositionScope,
  studioVirtualSpacePositionStorageKey,
  writeStudioVirtualSpaceSessionPoint,
} from "./studio-virtual-space-session-position";

import { StudioVirtualSpaceNpcPanel } from "./StudioVirtualSpaceNpcPanel";
import { StudioVirtualSpaceDirectory } from "./StudioVirtualSpaceDirectory";
import { StudioVirtualSpaceReviewPicker } from "./StudioVirtualSpaceReviewPicker";
import { verifyStudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-invitation";
import { useStudioVirtualSpaceSlots } from "./use-studio-virtual-space-slots";
import { StudioVirtualSpaceSeatsPanel } from "./StudioVirtualSpaceSeatsPanel";
import { StudioVirtualSpaceSocialPanel, type StudioSpaceSocialRequest, type StudioSpaceSocialAction } from "./StudioVirtualSpaceSocialPanel";
import { useStudioVirtualSpaceSocial } from "./use-studio-virtual-space-social";
import { useStudioVirtualSpaceConversation } from "./use-studio-virtual-space-conversation";
import { StudioVirtualSpaceConversationPanel } from "./StudioVirtualSpaceConversationPanel";
import { StudioVirtualSpaceGuide } from "./StudioVirtualSpaceGuide";
import { studioNpcRole } from "./studio-virtual-space-npc-director";
import type { StudioVirtualNpcGuideTourRequest, StudioVirtualNpcGuideTourState } from "./studio-virtual-space-npc-guide";
import { studioVirtualSpaceSeatedActors } from "./studio-virtual-space-seated-actors";
import "./studio-virtual-space.css";
import "@/shared/components/virtual-studio/virtual-studio-shell.css";
import "./studio-workspace-live.css";

const StudioP2pHuddleLauncher = lazy(() => import("../live/huddle/StudioP2pHuddleLauncher"));

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

const VIRTUAL_AVATARS = STUDIO_CHARACTER_SKINS;

function readVirtualSpaceAvatarIndex(): number {
  if (typeof window === "undefined") return STUDIO_VIRTUAL_SPACE_AUTO_AVATAR;
  try {
    const raw = window.localStorage.getItem(VIRTUAL_SPACE_AVATAR_STORAGE_KEY);
    const index = raw == null ? NaN : Number(raw);
    return Number.isInteger(index) && index >= 0 && index < VIRTUAL_AVATARS.length
      ? index
      : STUDIO_VIRTUAL_SPACE_AUTO_AVATAR;
  } catch {
    return STUDIO_VIRTUAL_SPACE_AUTO_AVATAR;
  }
}

function writeVirtualSpaceAvatarIndex(index: number): void {
  if (typeof window === "undefined") return;
  try {
    if (index >= 0 && index < VIRTUAL_AVATARS.length) {
      window.localStorage.setItem(VIRTUAL_SPACE_AVATAR_STORAGE_KEY, String(index));
    } else {
      window.localStorage.removeItem(VIRTUAL_SPACE_AVATAR_STORAGE_KEY);
    }
  } catch {
    // Local avatar choice is optional; a deterministic fallback remains available.
  }
}

const ZONE_ICONS: Readonly<Partial<Record<StudioVirtualSpaceZoneId, typeof Coffee>>> = {
  lounge: Coffee,
  writers: BookOpen,
  storyboard: LayoutGrid,
  drawing: Brush,
  review: MessageCircle,
  assets: Boxes,
  assistant: Bot,
  live: Radio,
};

const ZONE_TONES: Readonly<Partial<Record<StudioVirtualSpaceZoneId, string>>> = {
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

const WorkSessionWorkspace = lazy(() => import("../work-session/StudioWorkSessionWorkspace").then((module) => ({ default: module.StudioWorkSessionWorkspace })));

function validProjectId(projectId: string): boolean {
  return Boolean(
    projectId
    && projectId !== "."
    && projectId !== ".."
    && projectId.length <= 160
    && !projectId.includes("\\")
  );
}


function stagePosition(
  point: StudioVirtualSpacePoint,
  manifest: StudioVirtualSpaceWorldManifest,
): CSSProperties {
  return {
    left: ((point.x / manifest.width) * 100) + "%",
    top: ((point.y / manifest.height) * 100) + "%",
  };
}

function VirtualSpaceMiniMap({
  snapshot,
  currentRoom,
  manifest,
  onMoveTo,
}: {
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly currentRoom: StudioWorldRoomDefinition;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly onMoveTo: (point: StudioVirtualSpacePoint) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceMiniMap");
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="studio-vspace-minimap absolute right-3 top-3 z-50 hidden w-36 overflow-hidden rounded-2xl border border-white/15 bg-panel/90 p-2 shadow-2xl backdrop-blur-xl sm:block"
      data-space-interactive="true"
    >
      <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} aria-label={bt("미니맵 펼치기", "Toggle minimap")} className="flex min-h-9 w-full items-center justify-between gap-2 px-1">
        <span className="inline-flex items-center gap-1.5 text-[0.58rem] font-black uppercase tracking-[0.12em] text-fg-2">
          <MapIcon size={11} aria-hidden />
          {bt("스튜디오 맵", "Studio map")}
        </span>
        <span className="max-w-20 truncate text-[0.52rem] font-bold text-accent">
          {bt(currentRoom.labelKo, currentRoom.labelEn)}
        </span>
      </button>
      {expanded ? <button
        type="button"
        className="studio-vspace-minimap-stage relative block w-full overflow-hidden rounded-xl border border-line/70 bg-canvas/80 text-left"
        style={{ aspectRatio: String(manifest.width) + "/" + String(manifest.height) }}
        aria-label={bt("미니맵에서 이동할 위치 선택", "Choose a destination on the minimap")}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          onMoveTo(clampStudioWorldPoint(manifest, {
            x: ((event.clientX - rect.left) / rect.width) * manifest.width,
            y: ((event.clientY - rect.top) / rect.height) * manifest.height,
          }));
        }}
      >
        {manifest.rooms.map((room) => (
          <span
            key={room.id}
            className="studio-vspace-minimap-zone absolute rounded-[3px] border"
            data-active={room.id === currentRoom.id || undefined}
            style={{
              left: ((room.x / manifest.width) * 100) + "%",
              top: ((room.y / manifest.height) * 100) + "%",
              width: ((room.width / manifest.width) * 100) + "%",
              height: ((room.height / manifest.height) * 100) + "%",
            }}
            aria-hidden
          />
        ))}
        {snapshot.peers.map((peer) => (
          <span
            key={peer.participant.sessionId}
            className="studio-vspace-minimap-peer absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-good shadow-[0_0_6px_rgba(110,231,160,.8)]"
            style={stagePosition(peer.state, manifest)}
            aria-hidden
          />
        ))}
        <span
          className="studio-vspace-minimap-self absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow-[0_0_10px_var(--color-accent)]"
          style={stagePosition(snapshot.self, manifest)}
          aria-hidden
        />
      </button> : null}
    </div>
  );
}

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
  appearance,
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
  readonly appearance?: StudioVirtualSpacePresenceState["appearance"];
}) {
  const reactionEmoji = virtualSpaceReactionEmoji(reaction);
  const requestedMotion = moving
    ? "walk"
    : activity === "reviewing"
      ? "review"
      : activity === "focused"
        ? "draw"
        : nearby
          ? "talk"
          : "idle";
  const { skin, clip } = resolveStudioCharacterAppearance({ avatarIndex, appearance }, identity,
    requestedMotion === "walk" ? `walk-${facing}` : requestedMotion);
  const motion = clip.startsWith("walk-") ? "walk" : clip;
  const stateTexture = motion === "talk" || motion === "draw" || motion === "review"
    ? skin.state?.[motion]
    : undefined;
  const avatarTexture = stateTexture ?? skin.directional[facing];

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
          src={avatarTexture}
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
        data-skin={skin.key}
        aria-hidden="true"
      >
        <img
          src={avatarTexture}
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

function MobileZoneCard({
  room,
  projectId,
  personal = false,
  onAssistant,
}: {
  readonly room: StudioWorldRoomDefinition;
  readonly projectId: string;
  readonly personal?: boolean;
  readonly onAssistant: () => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceMobileZone");
  const Icon = ZONE_ICONS[room.id] ?? LayoutGrid;
  const action = room.action;
  const destination = action === "community"
    ? "/community"
    : action && action !== "assistant"
      ? personal ? (action === "assets" ? "/studio/assets" : "/studio/new") : studioVirtualSpaceDestination(projectId, action)
      : null;
  const className = cn(
    "relative flex min-h-28 flex-col overflow-hidden rounded-2xl border border-line bg-gradient-to-br p-4 text-left shadow-sm",
    ZONE_TONES[room.id] ?? "from-slate-100/70 via-card/85 to-card/70 dark:from-slate-950/25",
  );
  const body = (
    <>
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,oklch(0.72_0.15_300/0.16),transparent_35%),linear-gradient(145deg,var(--color-card),var(--color-panel))]" aria-hidden />
      <span className="absolute -right-5 -top-5 size-24 rounded-full border border-white/10 bg-accent/10 blur-[1px]" aria-hidden />
      <span className="relative flex items-center justify-between gap-2">
        <span className="grid size-9 place-items-center rounded-xl border border-line/70 bg-panel/80 text-accent">
          <Icon size={17} aria-hidden />
        </span>
        {(destination || action === "assistant") && <ExternalLink size={14} className="text-fg-3" aria-hidden />}
      </span>
      <strong className="relative mt-3 text-sm font-black text-fg">{bt(room.labelKo, room.labelEn)}</strong>
      <span className="relative mt-1 text-xs leading-5 text-fg-3">
        {bt(
          room.descriptionKo ?? "이 공간에서 팀 작업을 이어가요.",
          room.descriptionEn ?? "Continue team work in this space.",
        )}
      </span>
    </>
  );
  if (action === "assistant") {
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
      <Link href="/" className="vs2-brand" aria-label="ToonStudio">
        <span className="vs2-brand-mark"><Sparkles size={17} aria-hidden /></span>
        <span><strong>ToonStudio</strong></span>
      </Link>
      <div className="vs2-project">
        <span className="vs2-project-icon"><Sparkles size={15} aria-hidden /></span>
        <strong>{projectId}</strong><span aria-hidden>⌄</span>

        <span className="vs2-studio-pill">◉ {bt("스튜디오", "Studio")}</span>
        <ConnectionBadge preparing={preparing} />
        <span className="vs2-online">● {snapshot.peers.length + 1}{snapshot.direct ? bt("명 접속 중", " online") : bt("명 · 로컬", " · local")}</span>
        <div className="vs2-stack" aria-label={bt("접속 중인 멤버", "Online members")}>
          <span className="vs2-tiny-avatar" title={localName}>
            <ChibiAvatar
              identity={fallbackIdentity}
              name={localName}
              compact
              activity={snapshot.self.activity}
              avatarIndex={snapshot.self.avatarIndex}
              appearance={snapshot.self.appearance}
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
                appearance={peer.state.appearance}
              />
            </span>
          ))}
        </div>
      </div>
      <div className="vs2-top-actions">
        <Link href="/calendar" aria-label={bt("캘린더", "Calendar")}><CalendarDays size={17} /></Link>
        <Link href={`/studio/p/${encodeURIComponent(projectId)}/settings`} aria-label={bt("프로젝트 설정", "Project settings")}><Settings size={17} /></Link>
      </div>
    </header>
  );
}

export function VirtualSpaceExperience({
  projectId,
  preparing,
  signedIn,
  publication,
  homeHeader,
  personal = false,
}: {
  readonly homeHeader?: ReactNode;
  readonly personal?: boolean;
  readonly publication: ReturnType<typeof useStudioWorldPublication>;
  readonly projectId: string;
  readonly preparing: boolean;
  readonly signedIn: boolean;
}) {
  const bt = useBilingual("StudioVirtualSpaceExperience");
  const location = useLocation();
  const authoringMode = new URLSearchParams(location.search).get("worldEdit") === "1";
  const publishedWorld = publication.snapshot.active;
  const publishedScope = publishedWorld?.scope;
  const [draftBaseRevision, setDraftBaseRevision] = useState<string | null | undefined>(undefined);
  const sharedWorldAllowed = !publication.enabled || (publication.snapshot.viewVerified && (Boolean(publishedWorld) || !publication.snapshot.hasPublishedWorld));
  const positionScope = useMemo(
    () => studioVirtualSpacePositionScope(projectId, authoringMode),
    [authoringMode, projectId],
  );
  const positionScopeKey = studioVirtualSpacePositionStorageKey(positionScope);
  const navigate = useNavigate();
  const live = useStudioLiveCollaboration();
  const privateActorId = useSession().data?.user?.id ?? null;
  const [privateZoneSelection,setPrivateZoneSelection] = useState<string | null>(null);
  const connectivity = useSyncExternalStore(
    subscribeStudioConnectivity,
    getStudioConnectivitySnapshot,
    getStudioConnectivityServerSnapshot,
  );
  const controllerRef = useRef<StudioVirtualSpacePresenceController | null>(null);
  const fallbackIdentity = live.room?.participant.sessionId ?? `space:${projectId}`;
  const initial = useMemo(() => {
    const preferred = studioVirtualSpaceInitialPoint(fallbackIdentity);
    return resolveStudioVirtualSpaceSessionPoint(
      positionScope,
      DEFAULT_STUDIO_WORLD_MANIFEST,
      preferred,
    ) ?? preferred;
  }, [fallbackIdentity, positionScope]);
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
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [workspacePanel, setWorkspacePanel] = useState<"people" | "space" | "search" | "work" | "sessions" | null>(() => { const q = new URLSearchParams(location.search); return q.has("session") || q.get("activity") === "sessions" ? "sessions" : null; });
  const spaceSearchRef = useRef<HTMLInputElement>(null);
  const [reviewPeerId, setReviewPeerId] = useState<string | null>(null);
  const [openingReview, setOpeningReview] = useState(false);
  const cancelSlotsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [sharedActivity, setSharedActivity] = useState<StudioSpaceSocialRequest | null>(null);
  const [waveActorIds, setWaveActorIds] = useState<readonly string[]>([]);
  const shownGreetings = useRef(new Set<string>());
  const sharedActivityRef = useRef<StudioSpaceSocialRequest | null>(null);
  const acceptedActivityHandler = useRef<(request: StudioSpaceSocialRequest) => void>(() => undefined);
  const [socialNotice, setSocialNotice] = useState("");
  const [guideTourRequest, setGuideTourRequest] = useState<StudioVirtualNpcGuideTourRequest | null>(null);
  const [guideTour, setGuideTour] = useState<StudioVirtualNpcGuideTourState | null>(null);
  const guideRequestRef = useRef<StudioVirtualNpcGuideTourRequest | null>(null);
  const guideSequence = useRef(0);
  const [atmosphere, setAtmosphere] = useState<"focus" | "balanced" | "lively">(() => {
    try { const saved = localStorage.getItem("toonspectrum:virtual-atmosphere:v1"); return saved === "focus" || saved === "lively" ? saved : "balanced"; }
    catch { return "balanced"; }
  });

  const [worldManifest, setWorldManifest] = useState<StudioVirtualSpaceWorldManifest>(
    DEFAULT_STUDIO_WORLD_MANIFEST,
  );
  const [authoringDraft, setAuthoringDraft] = useState<StudioVirtualSpaceWorldManifest>(
    DEFAULT_STUDIO_WORLD_MANIFEST,
  );
  const baselineWorldManifestRef = useRef<StudioVirtualSpaceWorldManifest>(DEFAULT_STUDIO_WORLD_MANIFEST);
  const [worldLoaded, setWorldLoaded] = useState(false);
  const [loadedPositionScope, setLoadedPositionScope] = useState<string | null>(null);
  const [worldLoadError, setWorldLoadError] = useState(false);
  const [currentInteraction, setCurrentInteraction] = useState<StudioWorldInteractionDefinition | null>(null);
  const engineBridge = useMemo(() => new StudioVirtualSpaceEngineBridge(), []);
  useEffect(() => { if (workspacePanel) engineBridge.clearMovement(); }, [workspacePanel, engineBridge]);
  useEffect(() => {
    const search = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      if (document.querySelector('dialog[open][aria-modal="true"]') && workspacePanel !== "search") return;
      event.preventDefault(); event.stopImmediatePropagation();
      engineBridge.clearMovement(); setWorkspacePanel("search");
      spaceSearchRef.current?.focus();
    };
    window.addEventListener("keydown", search, true);
    return () => window.removeEventListener("keydown", search, true);
  }, [engineBridge, workspacePanel]);
  const selfRef = useRef(snapshot.self);
  const peersRef = useRef(snapshot.peers);
  const localReactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movingRef = useRef(false);
  const visibleParticipantCount = connectivity.serverAvailable ? snapshot.peers.length + 1 : 1;
  const worldReady = worldLoaded && loadedPositionScope === positionScopeKey;
  const cancelGuideTour = useCallback(() => {
    guideRequestRef.current = null; setGuideTourRequest(null);
    setGuideTour((current) => current ? { ...current, status: "cancelled" } : null);
  }, []);
  const updateGuideTour = useCallback((state: StudioVirtualNpcGuideTourState) => {
    if (state.requestId === guideRequestRef.current?.id && state.guideId === guideRequestRef.current.guideId) setGuideTour(state);
  }, []);
  useEffect(() => { cancelGuideTour(); }, [worldManifest, worldReady, authoringMode, cancelGuideTour]);
  useEffect(() => {
    if (atmosphere === "focus" || activity === "focused" || activity === "away") cancelGuideTour();
  }, [atmosphere, activity, cancelGuideTour]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && guideRequestRef.current) cancelGuideTour(); };
    const hide = () => { if (document.visibilityState === "hidden") cancelGuideTour(); };
    window.addEventListener("keydown", escape);
    window.addEventListener("blur", cancelGuideTour);
    document.addEventListener("visibilitychange", hide);
    return () => { guideRequestRef.current = null; window.removeEventListener("keydown", escape);
      window.removeEventListener("blur", cancelGuideTour); document.removeEventListener("visibilitychange", hide); };
  }, [cancelGuideTour]);

  useEffect(() => {
    selfRef.current = snapshot.self;
    peersRef.current = snapshot.peers;
  }, [snapshot.peers, snapshot.self]);

  useEffect(() => {
    const abortController = new AbortController();
    engineBridge.clearMovement();
    movingRef.current = false;
    setMoving(false);
    setFollowingPeerId(null);
    setCurrentInteraction(null);
    setWorldLoaded(false);
    setLoadedPositionScope(null);
    setWorldLoadError(false);
    void (publishedWorld ? Promise.resolve(publishedWorld.publication.manifest) : loadStudioVirtualSpaceWorldManifest(
      undefined, undefined, abortController.signal,
    )).then((manifest) => {
      if (abortController.signal.aborted) return;
      baselineWorldManifestRef.current = manifest;
      const storedDraft = authoringMode ? readStudioWorldAuthoringDraftRecord(projectId) : null;
      const activeManifest = storedDraft?.manifest ?? manifest;
      setDraftBaseRevision(storedDraft ? storedDraft.basePublishedRevisionId : publishedWorld?.publication.revisionId ?? null);
      const point = publishedWorld ? resolveStudioWorldSpawn(activeManifest, studioWorldSpawn(activeManifest).point) : resolveStudioVirtualSpaceSessionPoint(
        positionScope,
        activeManifest,
        studioWorldSpawn(activeManifest).point,
      );
      setWorldManifest(activeManifest);
      setAuthoringDraft(activeManifest);
      setCurrentInteraction(null);
      if (!point) {
        setWorldLoaded(false);
        setWorldLoadError(true);
        return;
      }
      const self = studioWorldPresenceState(activeManifest, { ...selfRef.current, ...point, moving: false });
      selfRef.current = self;
      setSnapshot((current) => ({ ...current, self }));
      setWorldLoadError(false);
      setLoadedPositionScope(positionScopeKey);
      setWorldLoaded(true);
    });
    return () => abortController.abort();
  }, [authoringMode, engineBridge, positionScope, positionScopeKey, projectId, publishedWorld]);

  const setFollowingPeer = useCallback((sessionId: string | null) => {
    engineBridge.setFollowingPeer(sessionId);
    setFollowingPeerId(sessionId);
  }, [engineBridge]);

  const applyAuthoringManifest = useCallback((nextManifest: StudioVirtualSpaceWorldManifest) => {
    if (validateStudioWorldManifest(nextManifest).length > 0) return;
    engineBridge.clearMovement();
    setFollowingPeer(null);
    setCurrentInteraction(null);
    movingRef.current = false;
    setMoving(false);

    const current = selfRef.current;
    const point = resolveStudioWorldSpawn(nextManifest, current);
    if (!point) return;
    const self = studioWorldPresenceState(nextManifest, {
      ...current,
      ...point,
      moving: false,
    });
    selfRef.current = self;
    setWorldManifest(nextManifest);

    const controller = controllerRef.current;
    if (controller) {
      controller.update(
        point,
        self.facing,
        self.activity,
        false,
        self.avatarIndex,
        self.zoneId,
      );
      setSnapshot(controller.snapshot());
    } else {
      setSnapshot((snapshot) => ({ ...snapshot, self }));
    }
  }, [engineBridge, setFollowingPeer]);

  useEffect(() => {
    if (!authoringMode || !worldReady) return;
    if (validateStudioWorldManifest(authoringDraft).length > 0) return;
    const timeout = globalThis.setTimeout(() => {
      applyAuthoringManifest(authoringDraft);
    }, 180);
    return () => globalThis.clearTimeout(timeout);
  }, [applyAuthoringManifest, authoringDraft, authoringMode, worldReady]);

  const resetAuthoringManifest = useCallback(() => {
    clearStudioWorldAuthoringDraft(projectId);
    setAuthoringDraft(baselineWorldManifestRef.current);
    setDraftBaseRevision(publishedWorld?.publication.revisionId ?? null);
  }, [projectId, publishedWorld]);

  useEffect(() => {
    if (!worldReady) return;
    const timeout = globalThis.setTimeout(() => {
      writeStudioVirtualSpaceSessionPoint(positionScope, {
        x: snapshot.self.x,
        y: snapshot.self.y,
      });
    }, 180);
    return () => globalThis.clearTimeout(timeout);
  }, [positionScope, snapshot.self.x, snapshot.self.y, worldReady]);

  useEffect(() => {
    const save = () => { if (worldReady) writeStudioVirtualSpaceSessionPoint(positionScope, selfRef.current); };
    globalThis.addEventListener("pagehide", save);
    return () => { globalThis.removeEventListener("pagehide", save); save(); };
  }, [positionScope, worldReady]);

  useEffect(() => startStudioConnectivityRuntime(), []);

  const clearLocalReactionTimer = useCallback(() => {
    if (localReactionTimerRef.current === null) return;
    globalThis.clearTimeout(localReactionTimerRef.current);
    localReactionTimerRef.current = null;
  }, []);

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

  useEffect(() => () => clearLocalReactionTimer(), [clearLocalReactionTimer]);

  const openAssistant = useCallback(() => {
    globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open"));
  }, []);

  useEffect(() => {
    const room = live.room;
    if (!worldReady) return;
    if (authoringMode || !sharedWorldAllowed || !connectivity.serverAvailable || !room?.direct || live.availability !== "ready") {
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
      { appearanceForAvatarIndex: studioCharacterAppearanceForAvatarIndex, worldScope: publishedScope },
    );
    clearLocalReactionTimer();
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
  }, [authoringMode, clearLocalReactionTimer, connectivity.serverAvailable, live.availability, live.room, worldReady, publishedScope, sharedWorldAllowed]);

  const updatePosition = useCallback((
    point: StudioVirtualSpacePoint,
    facing: StudioVirtualSpaceFacing,
    zoneId?: string,
  ) => {
    const bounded = clampStudioWorldPoint(worldManifest, point);
    const nextState = studioWorldPresenceState(worldManifest, {
      ...selfRef.current, ...bounded, facing, activity, moving: movingRef.current,
      zoneId: zoneId ?? selfRef.current.zoneId,
    });
    selfRef.current = nextState;
    const controller = controllerRef.current;
    if (controller) {
      controller.update(
        bounded,
        facing,
        activity,
        movingRef.current,
        selfRef.current.avatarIndex,
        zoneId,
      );
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => ({
      ...current,
      self: nextState,
    }));
  }, [activity, worldManifest]);

  const activateAction = useCallback((action: StudioWorldInteractionDefinition["action"]) => {
    setWorkspacePanel(null);
    writeStudioVirtualSpaceSessionPoint(positionScope, selfRef.current);
    if (action === "assistant") {
      openAssistant();
      return;
    }
    if (action === "community") {
      navigate("/community");
      return;
    }
    const destination = personal ? (action === "assets" ? "/studio/assets" : "/studio/new") : studioVirtualSpaceDestination(projectId, action);
    if (destination) navigate(destination);
  }, [navigate, openAssistant, personal, positionScope, projectId]);

  const worldRuleGate = useStudioWorldRuleGate(worldManifest, activity, activateAction);
  const activateInteraction = worldRuleGate.request;

  const handleEngineLocalState = useCallback((next: StudioVirtualSpaceEngineLocalState) => {
    if (movingRef.current !== next.moving) {
      movingRef.current = next.moving;
      setMoving(next.moving);
    }
    updatePosition(next.point, next.facing, next.zoneId);
  }, [updatePosition]);

  const queuePathTo = useCallback((point: StudioVirtualSpacePoint) => {
    if (!worldReady) return;
    void cancelSlotsRef.current();
    setFollowingPeer(null);
    engineBridge.requestMove(point);
  }, [engineBridge, setFollowingPeer, worldReady]);

  const slots = useStudioVirtualSpaceSlots({
    room: live.room, manifest: worldManifest, publishedScope,
    enabled: signedIn && sharedWorldAllowed && worldReady && !authoringMode && activity !== "focused" && activity !== "away" && atmosphere !== "focus",
    point: snapshot.self, moving,
    onApproach: (point) => { setFollowingPeer(null); engineBridge.requestMove(point); },
  });
  useEffect(() => { cancelSlotsRef.current = slots.cancel; }, [slots.cancel]);
  const seatedActors = useMemo(() => studioVirtualSpaceSeatedActors({ manifest: worldManifest, lease: slots.snapshot,
    selfSessionId: live.room?.participant.sessionId, selfActorId: fallbackIdentity,
    self: snapshot.self, peers: snapshot.peers }), [worldManifest, slots.snapshot, live.room?.participant.sessionId, fallbackIdentity, snapshot.self, snapshot.peers]);

  const startFollowingPeer = useCallback((sessionId: string) => {
    const peer = peersRef.current.find((candidate) => candidate.participant.sessionId === sessionId);
    if (!peer) return;
    void cancelSlotsRef.current();
    setFollowingPeer(sessionId);
  }, [setFollowingPeer]);

  const roomById = useMemo(
    () => new Map(worldManifest.rooms.map((room) => [room.id, room] as const)),
    [worldManifest.rooms],
  );
  const currentRoom = roomById.get(snapshot.self.zoneId)
    ?? worldManifest.rooms[0]
    ?? DEFAULT_STUDIO_WORLD_MANIFEST.rooms[0]!;

  const activateCurrentRoom = useCallback(() => {
    if (!worldReady) return;
    if (currentInteraction) {
      activateInteraction(currentInteraction);
      return;
    }
    if (currentRoom.action) activateAction(currentRoom.action);
  }, [activateAction, activateInteraction, currentInteraction, currentRoom, worldReady]);

  const handleEngineInteract = useCallback((interaction: StudioWorldInteractionDefinition | null) => {
    if (interaction) {
      activateInteraction(interaction);
      return;
    }
    activateCurrentRoom();
  }, [activateCurrentRoom, activateInteraction]);

  const followingPeer = followingPeerId
    ? snapshot.peers.find((peer) => peer.participant.sessionId === followingPeerId) ?? null
    : null;

  const handleEnginePeerSelect = useCallback((sessionId: string) => {
    setSelectedPeerId(sessionId);
    setWorkspacePanel("people");
    engineBridge.clearMovement();
    setFollowingPeer(null);
  }, [engineBridge, setFollowingPeer]);

  const handleEnginePortal = useCallback((portal: StudioWorldPortalDefinition) => {
    void cancelSlotsRef.current();
    if (portal.href) {
      navigate(portal.href);
      return;
    }
    // Local portal teleport is owned by the physics runtime, not a second path request.
  }, [navigate]);
  const localName = live.room?.participant.displayName.replace(/\s*·\s*이 탭$/u, "") || bt("나", "Me");

  const sendReaction = useCallback((reaction: StudioVirtualSpaceReaction) => {
    const controller = controllerRef.current;
    if (controller) {
      clearLocalReactionTimer();
      controller.sendReaction(reaction);
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => ({ ...current, selfReaction: reaction }));
    if (localReactionTimerRef.current !== null) {
      globalThis.clearTimeout(localReactionTimerRef.current);
    }
    localReactionTimerRef.current = globalThis.setTimeout(() => {
      if (controllerRef.current) {
        localReactionTimerRef.current = null;
        return;
      }
      setSnapshot((current) => ({ ...current, selfReaction: null }));
      localReactionTimerRef.current = null;
    }, STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS);
  }, [clearLocalReactionTimer]);

  const { snapshot: socialSnapshot, interactive: socialInteractive, request: requestSocial, respond: respondSocial, cancel: cancelSocial, requestReview, respondReview, setPeerBlocked, wave } = useStudioVirtualSpaceSocial({
    workId: projectId,
    participant: live.room?.participant,
    port: live.room?.direct,
    manifest: worldManifest, publishedScope,
    presence: snapshot,
    acousticBindingAvailable: worldReady && !authoringMode && snapshot.direct,
    enabled: signedIn && sharedWorldAllowed && worldReady && !authoringMode && snapshot.direct
      && activity !== "focused" && activity !== "away" && atmosphere !== "focus",
    onAccepted: (request) => acceptedActivityHandler.current(request),
  });
  const finishSharedActivity = useCallback(() => {
    const current = sharedActivityRef.current;
    if (!current) return;
    // Clear ownership first: closing Huddle synchronously notifies the social surface.
    sharedActivityRef.current = null;
    setSharedActivity(null);
    setFollowingPeer(null);
    cancelSocial(current.id);
    closeStudioP2pHuddle({ conversationId: current.id });
  }, [cancelSocial, setFollowingPeer]);
  const gestureGreeting = socialSnapshot.greetings.find((greeting) => greeting.status === "delivered" || greeting.status === "received");
  useEffect(() => {
    setWaveActorIds([]);
    if (!socialSnapshot.available || !gestureGreeting || shownGreetings.current.has(gestureGreeting.id)
      || Date.now() - gestureGreeting.createdAt > 4_000) return;
    shownGreetings.current.add(gestureGreeting.id);
    if (shownGreetings.current.size > 64) shownGreetings.current.delete(shownGreetings.current.values().next().value!);
    setWaveActorIds([gestureGreeting.direction === "outgoing" ? fallbackIdentity : gestureGreeting.peer.sessionId]);
    const timer = globalThis.setTimeout(() => setWaveActorIds([]), 1_600);
    return () => globalThis.clearTimeout(timer);
  }, [gestureGreeting, socialSnapshot.available, fallbackIdentity]);
  useEffect(() => {
    const suspend = () => { if (sharedActivityRef.current?.action === "follow") finishSharedActivity(); setReviewPeerId(null); };
    const visibility = () => { if (document.visibilityState === "hidden") suspend(); };
    globalThis.addEventListener("blur", suspend);
    document.addEventListener("visibilitychange", visibility);
    return () => { globalThis.removeEventListener("blur", suspend); document.removeEventListener("visibilitychange", visibility); };
  }, [finishSharedActivity]);
  const conversation = useStudioVirtualSpaceConversation({
    participant: live.room?.participant, port: live.room?.direct, manifest: worldManifest, publishedScope,
    presence: snapshot,
    acousticBindingAvailable: worldReady && !authoringMode && snapshot.direct,
    enabled: signedIn && sharedWorldAllowed && worldReady && !authoringMode && snapshot.direct
      && activity !== "focused" && activity !== "away" && atmosphere !== "focus",
    blockedPeerIds: socialSnapshot.blockedPeerIds,
    onReady: (scope) => {
      finishSharedActivity();
      setFollowingPeer(null);
      setWorkspacePanel(null);
      openStudioP2pHuddle({ conversationId: scope.id,
        peerIds: scope.memberIds.filter((id) => id !== live.room?.participant.sessionId), source: "virtual-space" });
    },
  });
  const privateZones = worldManifest.acousticZones?.filter(zone => Boolean(zone.doorId)) ?? [];
  const privateZoneId = privateZones.find(zone=>zone.id===privateZoneSelection)?.id ?? privateZones[0]?.id ?? null;
  const privateRoom = useStudioPrivateRoom({workId:projectId,actorId:privateActorId,
    world:publishedWorld ? {worldId:publishedWorld.publication.manifest.id,revisionId:publishedWorld.publication.revisionId,contentHash:publishedWorld.publication.contentHash} : null,
    zones:worldManifest.acousticZones??[],zoneId:privateZoneId,room:live.room,presence:snapshot,
    enabled:signedIn&&worldReady&&!authoringMode&&activity!=="focused"&&activity!=="away"&&atmosphere!=="focus",
    onConversation:()=>{finishSharedActivity();if(conversation.snapshot.active)conversation.leave(conversation.snapshot.active.id);},
  });
  const pairConversation = useMemo(() => sharedActivity?.action === "talk" && live.room?.participant
    ? { id: sharedActivity.id, memberIds: [live.room.participant.sessionId, sharedActivity.peer.sessionId].sort() }
    : null, [sharedActivity, live.room]);
  const activeConversation = conversation.snapshot.active;
  const leaveConversation = conversation.leave;
  const handleAcceptedActivity = useCallback((request: StudioSpaceSocialRequest) => {
    if (activeConversation) leaveConversation(activeConversation.id);
    if (sharedActivityRef.current?.id !== request.id) finishSharedActivity();
    sharedActivityRef.current = request;
    setSharedActivity(request);
    setSelectedPeerId(request.peer.sessionId);
    if (request.action === "talk") {
      setWorkspacePanel(null);
      openStudioP2pHuddle({ conversationId: request.id, peerIds: [request.peer.sessionId], source: "virtual-space" });
    } else if (request.action === "follow" && request.direction === "outgoing") {
      startFollowingPeer(request.peer.sessionId);
    } else if (request.action === "high-five") {
      // Current packs use a celebration reaction; do not claim an unsupported hand pose.
      sendReaction("sparkles");
    }
  }, [activeConversation, leaveConversation, finishSharedActivity, sendReaction, startFollowingPeer]);
  useEffect(() => { acceptedActivityHandler.current = handleAcceptedActivity; }, [handleAcceptedActivity]);
  useEffect(() => {
    const handleClosed = (event: Event) => {
      const id = (event as CustomEvent<StudioP2pHuddleClosedDetail>).detail?.conversationId;
      if (id && sharedActivityRef.current?.id === id) finishSharedActivity();
    };
    globalThis.addEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT, handleClosed);
    return () => globalThis.removeEventListener(STUDIO_P2P_HUDDLE_CLOSED_EVENT, handleClosed);
  }, [finishSharedActivity]);
  useEffect(() => {
    if (!sharedActivity) return;
    const peer = snapshot.peers.find((item) => item.participant.sessionId === sharedActivity.peer.sessionId);
    const request = socialSnapshot.requests.find((item) => item.id === sharedActivity.id);
    const distance = peer ? Math.hypot(peer.state.x - snapshot.self.x, peer.state.y - snapshot.self.y) : Infinity;
    if (!peer || activity === "focused" || activity === "away" || atmosphere === "focus"
      || peer.state.activity === "focused" || peer.state.activity === "away"
      || !socialSnapshot.available || !request || request.status !== "accepted"
      || ((sharedActivity.action === "talk" || sharedActivity.action === "high-five") && distance > 156)
      || (sharedActivity.action === "follow" && sharedActivity.direction === "outgoing" && !followingPeerId)) finishSharedActivity();
  }, [sharedActivity, snapshot.peers, snapshot.self.x, snapshot.self.y, activity, atmosphere, socialSnapshot, followingPeerId, finishSharedActivity]);
  useEffect(() => () => {
    const current = sharedActivityRef.current;
    sharedActivityRef.current = null;
    if (current) closeStudioP2pHuddle({ conversationId: current.id });
  }, []);
  useEffect(() => {
    if (sharedActivity?.action !== "high-five") return;
    const timer = globalThis.setTimeout(finishSharedActivity, STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS);
    return () => globalThis.clearTimeout(timer);
  }, [sharedActivity?.action, sharedActivity?.id, finishSharedActivity]);
  const requestActivity = (sessionId: string, action: StudioSpaceSocialAction) => {
    const peer = snapshot.peers.find((item) => item.participant.sessionId === sessionId);
    if (!peer) return;
    if (action === "review") { setReviewPeerId(sessionId); return; }
    if ((action === "talk" || action === "high-five") && Math.hypot(peer.state.x - snapshot.self.x, peer.state.y - snapshot.self.y) > 120) {
      setSocialNotice(bt("조금 더 가까이 이동한 뒤 요청해 주세요.", "Move a little closer before sending this invitation."));
      return;
    }
    const id = requestSocial(sessionId, action);
    setSocialNotice(id ? "" : bt("아직 연결을 확인 중입니다. 잠시 후 다시 요청해 주세요.", "Still confirming the connection. Please try again shortly."));
  };
  const cancelSocialRequest = (id: string) => {
    if (sharedActivity?.id === id) finishSharedActivity();
    else cancelSocial(id);
  };
  const openSharedReview = async () => {
    const current = sharedActivityRef.current;
    if (!current?.reviewSubject || openingReview || current.reviewSubject.workId !== projectId) return;
    setOpeningReview(true);
    try {
      const verified = await verifyStudioVirtualSpaceReviewSubject(current.reviewSubject, "view");
      if (sharedActivityRef.current?.id !== current.id) return;
      if (!verified.ok) {
        setSocialNotice(bt("검수본이나 열람 권한이 변경되어 열 수 없어요. 새 초대를 요청해 주세요.", "The review or your access changed. Ask for a new invitation.")); return;
      }
      writeStudioVirtualSpaceSessionPoint(positionScope, selfRef.current);
      navigate(verified.href);
    } finally { setOpeningReview(false); }
  };
  const changeAtmosphere = (next: "focus" | "balanced" | "lively") => {
    setAtmosphere(next);
    try { localStorage.setItem("toonspectrum:virtual-atmosphere:v1", next); } catch { /* Session preference still applies. */ }
    if (next === "focus") { engineBridge.clearMovement(); finishSharedActivity(); }
  };
  const cancelSlotApproach = slots.cancel;
  const cancelFollowing = useCallback(() => {
    void cancelSlotApproach();
    if (sharedActivity?.action === "follow") finishSharedActivity();
    else setFollowingPeer(null);
  }, [cancelSlotApproach, sharedActivity?.action, finishSharedActivity, setFollowingPeer]);
  const startGuideTour = useCallback((guideId: string) => {
    if (!worldReady || authoringMode || atmosphere === "focus" || activity === "focused" || activity === "away"
      || !worldManifest.npcs.some((npc) => npc.id === guideId && studioNpcRole(npc) === "guide")) return;
    const request = { id: `guide-tour:${++guideSequence.current}`, guideId };
    // Relinquish follow ownership and fence pending seat approaches before the
    // guide starts. Clearing only the engine cannot cancel a delayed release.
    cancelFollowing();
    engineBridge.clearMovement();
    guideRequestRef.current = request; setGuideTour(null); setGuideTourRequest(request);
  }, [worldReady, authoringMode, atmosphere, activity, worldManifest, engineBridge, cancelFollowing]);

  const setPresenceActivity = (next: StudioVirtualSpaceActivity) => {
    if (next === "focused" || next === "away") { engineBridge.clearMovement(); finishSharedActivity(); }
    setActivity(next);
    controllerRef.current?.setActivity(next);
    setSnapshot((current) => ({
      ...current,
      self: studioWorldPresenceState(worldManifest, { ...current.self, activity: next }),
    }));
  };

  const selectAvatar = useCallback((nextIndex: number) => {
    if (
      !Number.isInteger(nextIndex)
      || nextIndex < STUDIO_VIRTUAL_SPACE_AUTO_AVATAR
      || nextIndex >= VIRTUAL_AVATARS.length
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
      const self = studioWorldPresenceState(worldManifest, { ...current.self, avatarIndex: nextIndex });
      selfRef.current = self;
      return { ...current, self };
    });
  }, [worldManifest]);

  return (
    <div className="vs2-shell vs2-shell--project" data-studio-live-shell="true" data-studio-personal-space={personal || undefined} data-route-ready="studio-live-space">
      <Container size="wide" className="vs2-live-container">
        {worldRuleGate.element}
        {homeHeader ?? <LiveStudioTopbar
          projectId={projectId}
          preparing={preparing}
          snapshot={snapshot}
          fallbackIdentity={fallbackIdentity}
          localName={localName}
        />}
        <WorkspaceNavigation activeId="workspace-home"
          studioHref={personal ? "/home?scope=personal" : `/home?project=${encodeURIComponent(projectId)}`}
          teamHref={personal ? "/team?scope=personal" : `/team?project=${encodeURIComponent(projectId)}`} />
        <div className="studio-space-commandbar" data-space-interactive="true">
          <StudioSpaceWorkContext workId={projectId} personal={personal} />
          <div className="studio-space-command-actions">
            <button type="button" aria-haspopup="dialog" aria-expanded={workspacePanel === "search"}
              onClick={() => setWorkspacePanel("search")}>{bt("방·팀원 찾기", "Find rooms & people")} <kbd>⌘ / Ctrl K</kbd></button>
            <button type="button" aria-haspopup="dialog" aria-expanded={workspacePanel === "work"}
              onClick={() => setWorkspacePanel("work")}>{bt("검수·작업함", "Reviews & inbox")}</button>
            <button type="button" aria-haspopup="dialog" aria-expanded={workspacePanel === "sessions"} onClick={() => setWorkspacePanel("sessions")}>{bt("공동 작업 세션", "Work sessions")}</button>
          </div>
        </div>


        <section className="vs2-live-layout">
          <div className="vs2-world-wrap vs2-world-wrap--live">
            <div className="vs2-live-stage-host">
              <div
                role="application"
                aria-label={bt("가상 스튜디오 공간. WASD 또는 방향키로 이동하고 E 키로 현재 방과 상호작용합니다.", "Virtual studio space. Move with WASD or arrow keys and press E to interact with the current room.")}
                className="studio-vspace-stage relative aspect-[850/798] min-h-[30rem] w-full cursor-crosshair overflow-hidden rounded-[2rem] border border-line shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent lg:min-h-[34rem]"
                data-studio-virtual-space="true"
              >
                {worldReady ? <StudioVirtualSpacePhaserCanvas
                  manifest={worldManifest}
                  worldAssetUrls={publishedWorld?.assetUrls}
                  snapshot={snapshot}
                  bridge={engineBridge}
                  selfIdentity={fallbackIdentity}
                  seatedActors={seatedActors}
                  waveActorIds={waveActorIds}
                  guideTourRequest={guideTourRequest}
                  onGuideTourChange={updateGuideTour}
                  debugWorld={authoringMode}
                  atmosphere={activity === "focused" || activity === "away" ? "focus" : atmosphere}
                  onNpcInteract={activateInteraction}
                  onLocalState={handleEngineLocalState}
                  onInteract={handleEngineInteract}
                  onNearbyInteractionChange={setCurrentInteraction}
                  onPeerSelect={handleEnginePeerSelect}
                  onCancelFollow={cancelFollowing}
                  onPortal={handleEnginePortal}
                /> : <div className="studio-vspace-engine-message" role="status">{worldLoadError
                  ? bt("이 월드에는 안전하게 시작할 수 있는 바닥이 없습니다.", "This world has no safe floor where a player can start.")
                  : bt("공간 데이터 불러오는 중…", "Loading world data…")}</div>}

                {worldReady ? <>
                <VirtualSpaceMiniMap
                  snapshot={snapshot}
                  currentRoom={currentRoom}
                  manifest={worldManifest}
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
                    {bt(currentRoom.labelKo, currentRoom.labelEn)}
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
                      onClick={cancelFollowing}
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
                    data-interact-prompt={currentInteraction ? "true" : undefined}
                    onClick={() => { if (currentInteraction) engineBridge.requestInteract(); else activateCurrentRoom(); }}
                  >
                    E · {currentInteraction
                      ? bt(currentInteraction.labelKo, currentInteraction.labelEn)
                      : bt("방 열기", "Open room")}
                  </button>
                </div>

                <div className="absolute bottom-4 right-4 z-50 lg:hidden" data-space-interactive="true">
                  <StudioVirtualSpaceJoystick
                    onVectorChange={(vector) => {
                      engineBridge.setJoystick(vector);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="studio-vspace-touch-action absolute bottom-5 left-4 z-50 inline-flex min-h-12 max-w-[11rem] items-center gap-2 rounded-2xl border border-accent/35 bg-panel/90 px-4 text-xs font-black text-accent shadow-xl backdrop-blur lg:hidden"
                  data-space-interactive="true"
                  data-interact-prompt={currentInteraction ? "true" : undefined}
                  onClick={() => { if (currentInteraction) engineBridge.requestInteract(); else activateCurrentRoom(); }}
                >
                  <Gamepad2 size={15} aria-hidden />
                  <span className="truncate">
                    {currentInteraction
                      ? bt(currentInteraction.labelKo, currentInteraction.labelEn)
                      : bt("상호작용", "Interact")}
                  </span>
                </button>
                <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-line bg-panel/85 px-3 py-1.5 text-[0.65rem] font-black text-fg shadow-lg backdrop-blur lg:hidden">
                  {bt(currentRoom.labelKo, currentRoom.labelEn)}
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
                </> : null}
              </div>
            </div>

            {authoringMode && worldReady ? (
              <StudioWorldAuthoringEntry
                projectId={projectId}
                basePublishedRevisionId={draftBaseRevision}
                disabled={publication.enabled && (["reading", "publishing", "preparing"].includes(publication.snapshot.phase) || !publication.snapshot.viewVerified)}
                manifest={authoringDraft}
                onChange={setAuthoringDraft}
                onReset={resetAuthoringManifest}
              />
            ) : null}


          </div>

          <WorkspaceContextPanel open={workspacePanel !== null}
            presentation={workspacePanel === "search" ? "modal" : "adaptive"}
            initialFocusRef={workspacePanel === "search" ? spaceSearchRef : undefined}
            title={workspacePanel === "space" ? bt("공간과 꾸미기", "Space and customization")
              : workspacePanel === "search" ? bt("방·팀원 찾기", "Find rooms & people")
                : workspacePanel === "work" ? bt("검수·작업함", "Reviews & inbox") : workspacePanel === "sessions" ? bt("공동 작업 세션", "Work sessions") : bt("사람과 대화", "People and conversations")}
            onClose={() => setWorkspacePanel(null)}>
          <div className="vs2-live-inspector-content">
          {workspacePanel === "work" ? personal ? <p>{bt("작품을 만든 뒤 검수와 담당 작업을 연결할 수 있습니다.", "Create a work to connect reviews and assignments.")} <Link href="/studio/new">{bt("새 작품 만들기", "Create a work")}</Link></p> : <StudioWorkspaceInbox workId={projectId} /> : null}
          {workspacePanel === "sessions" ? personal ? <p>{bt("작품을 만들면 대본 리딩·콘티·검수·소재 검토를 고정 입력본과 함께 기록할 수 있습니다.", "Create a work to organize reading, storyboard, review and material sessions around a pinned input.")} <Link href="/studio/new">{bt("새 작품 만들기", "Create a work")}</Link></p> : <Suspense fallback={<p role="status">{bt("작업 세션 불러오는 중…", "Loading work sessions…")}</p>}><WorkSessionWorkspace workId={projectId} initialSessionId={new URLSearchParams(location.search).get("session")} /></Suspense> : null}
          <div hidden={workspacePanel !== "search"}>
            {worldReady ? <StudioVirtualSpaceDirectory manifest={worldManifest} peers={snapshot.peers}
              inputRef={spaceSearchRef} expanded onMove={queuePathTo} onOpen={activateAction} onSelectPeer={handleEnginePeerSelect} />
              : <p role="status">{bt("공간 목록을 확인 중입니다.", "Checking the space directory.")}</p>}
          </div>
          <div hidden={workspacePanel !== "space"}>
            <details><summary>{bt("방별 작업 바로가기", "Room work shortcuts")}</summary>
            {worldReady ? <div className="workspace-live-room-links">
              {worldManifest.rooms.map((room) => (
                <MobileZoneCard
                  key={room.id}
                  room={room}
                  projectId={projectId}
                  personal={personal}
                  onAssistant={personal ? () => navigate("/studio/new") : openAssistant}
                />
              ))}
            </div> : null}
            </details>
            <StudioWorldPublicationPanel publication={publication} draft={authoringMode ? authoringDraft : undefined} draftBaseRevision={draftBaseRevision}
              onRebaseDraft={(revisionId) => { if (!writeStudioWorldAuthoringDraft(projectId, authoringDraft, revisionId)) return false;
                setDraftBaseRevision(revisionId); return true; }}
              onEdit={() => { const search = new URLSearchParams(location.search); search.set("worldEdit", "1"); navigate({ pathname: location.pathname, search: search.toString() }); }}
              onApplied={() => { if (authoringMode) { const search = new URLSearchParams(location.search); search.delete("worldEdit");
                navigate({ pathname: location.pathname, search: search.toString() }); } }} />
            {worldReady ? <StudioVirtualSpaceGuide manifest={worldManifest} onMove={queuePathTo} onOpen={activateAction}
              onStop={() => engineBridge.clearMovement()} onFocus={() => changeAtmosphere("focus")}
              guideTour={guideTour} tourRequested={guideTourRequest !== null}
              onStartTour={atmosphere === "focus" || activity === "focused" || activity === "away" || authoringMode ? undefined : startGuideTour}
              onCancelTour={cancelGuideTour} /> : null}

            <section className="vs2-panel studio-vspace-atmosphere" data-space-interactive="true">
              <h2>{bt("작업실 분위기", "Studio atmosphere")}</h2>
              <div role="group" aria-label={bt("작업실 분위기", "Studio atmosphere")}>
                {([ ["focus", "집중", "Focus"], ["balanced", "일상", "Balanced"], ["lively", "활기", "Lively"] ] as const).map(([mode, ko, en]) =>
                  <button key={mode} type="button" aria-pressed={atmosphere === mode} onClick={() => changeAtmosphere(mode)}>{bt(ko, en)}</button>)}
              </div>
              <p>{bt("NPC의 움직임과 인사 빈도를 조절해요. 집중 모드에서는 대화 요청도 잠시 쉬어갑니다.", "Adjust NPC movement and greetings. Focus mode also pauses social invitations.")}</p>
              {connectivity.localOnly ? <details data-studio-virtual-offline="true"><summary>{bt("로컬 작업 중", "Working locally")}</summary><p>{bt("이동과 캐시된 작업은 계속할 수 있어요. 팀원 연결은 온라인으로 돌아오면 복구됩니다.", "Movement and cached work remain available. Teammates reconnect when you return online.")}</p></details> : null}
            </section>
            <StudioVirtualSpaceAmbientAudio key={projectId} scope={worldManifest} ready={worldReady && !authoringMode}
              focused={atmosphere === "focus" || activity === "focused"} away={activity === "away"} />
            {worldReady ? <StudioVirtualSpaceNpcPanel manifest={worldManifest} onInteract={activateInteraction} /> : null}
            {worldReady ? <StudioVirtualSpaceSeatsPanel slots={worldManifest.interactionSlots ?? []}
              snapshot={slots.snapshot} approachingSlotId={slots.approachingSlotId}
              onSelect={slots.requestSlot} onRelease={() => { void slots.cancel(); engineBridge.clearMovement(); }} /> : null}

            <StudioPrivateRoomPanel key={`${privateActorId}:${projectId}:${publishedScope}:${privateZoneId}`} room={privateRoom}
              zones={privateZones} zoneId={privateZoneId} onZone={setPrivateZoneSelection} peers={snapshot.peers}
              onWalk={worldReady&&!authoringMode&&activity!=="focused"&&activity!=="away"&&atmosphere!=="focus"?()=>{
                const target=privateZoneId?studioPrivateRoomWalkTarget(worldManifest,privateZoneId,snapshot.self):null;
                if(!target)return false;queuePathTo(target);return true;
              }:undefined}
              labels={Object.fromEntries(privateZones.map(zone=>{const room=worldManifest.rooms.find(item=>item.id===zone.roomId);return [zone.id,room?bt(room.labelKo,room.labelEn):bt("비공개 방","Private room")];}))} />
          </div>
          <div hidden={workspacePanel !== "people"}>

            <StudioVirtualSpaceSocialPanel
              renderPeerAvatar={(peer) => <ChibiAvatar identity={peer.participant.sessionId} name={peer.participant.displayName} activity={peer.state.activity} avatarIndex={peer.state.avatarIndex} appearance={peer.state.appearance} compact />}
              selectedPeer={snapshot.peers.find((peer) => peer.participant.sessionId === selectedPeerId) ?? null}
              peers={snapshot.peers} social={socialSnapshot}
              nearbyPeerIds={snapshot.nearbyPeers.map((peer) => peer.participant.sessionId)}
              conversationPeerIds={activeConversation?.memberIds ?? pairConversation?.memberIds ?? []}
              disabled={!signedIn || !snapshot.direct || authoringMode || !socialInteractive}
              focused={activity === "focused" || activity === "away" || atmosphere === "focus"}
              onSelect={setSelectedPeerId} onWave={() => {
                if (selectedPeerId && !wave(selectedPeerId)) setSocialNotice(bt("인사를 보내지 못했어요. 상대 연결을 확인하거나 잠시 뒤 다시 시도해 주세요.", "The greeting was not sent. Check the connection or try again shortly."));
              }}
              onRequest={requestActivity}
              onRespond={(id, response) => {
                const request = socialSnapshot.requests.find((item) => item.id === id);
                if (request?.action === "review") { void respondReview(id, response); }
                else respondSocial(id, response);
              }}
              onCancel={cancelSocialRequest}
              onBlock={(id, blocked) => {
                if(blocked){const privateConversation=privateRoom.snapshot.conversations.filter(record=>record.status!=="revoked")
                  .sort((a,b)=>Number(b.status==="active")-Number(a.status==="active"))
                  .find(record=>record.members.some(member=>member.binding.clientInstanceId===id));
                  const member=privateConversation?.members.find(item=>item.binding.clientInstanceId===id);
                  if(privateConversation&&member)void privateRoom.controller?.change(privateConversation.conversationId,"block",member.sessionEpoch);}
                if (blocked) for (const record of conversation.snapshot.records) {
                  if (record.memberIds.includes(id)) conversation.leave(record.id);
                }
                if (blocked && sharedActivityRef.current?.peer.sessionId === id) finishSharedActivity();
                if (blocked && reviewPeerId === id) setReviewPeerId(null);
                setPeerBlocked(id, blocked);
              }}
            />
            {signedIn && snapshot.peers.length > 0 ? <StudioVirtualSpaceConversationPanel
              self={live.room?.participant} snapshot={conversation.snapshot} currentConversation={pairConversation}
              onPropose={conversation.propose} onRespond={conversation.respond}
              onLeave={(id) => { if (sharedActivityRef.current?.id === id) finishSharedActivity(); else conversation.leave(id); }} /> : null}
            {reviewPeerId ? <StudioVirtualSpaceReviewPicker key={reviewPeerId} workId={projectId}
              peerName={snapshot.peers.find((peer) => peer.participant.sessionId === reviewPeerId)?.participant.displayName ?? bt("팀원", "Teammate")}
              disabled={!socialInteractive || !socialSnapshot.reviewReadyPeerIds.includes(reviewPeerId)}
              onInvite={async (subject, signal) => Boolean(await requestReview(reviewPeerId, subject, signal))}
              onClose={() => setReviewPeerId(null)} /> : null}
            {socialNotice ? <p className="studio-vspace-social-notice" role="status">{socialNotice}</p> : null}
            {sharedActivity?.action === "review" ? <section className="vs2-panel studio-vspace-shared-review">
              <h2>{bt("함께 검토하기", "Review together")}</h2>
              <p>{bt(`${sharedActivity.peer.displayName} 님과 초대에서 선택한 같은 검수 버전을 확인합니다.`, `Review the same invited snapshot with ${sharedActivity.peer.displayName}.`)}</p>
              <p className="break-all text-xs">{sharedActivity.reviewSubject?.revisionId ?? bt("검수 버전을 확인할 수 없어요.", "The review version could not be verified.")}</p>
              <button type="button" onClick={() => { const review = worldManifest.interactions.find((item) => item.action === "review"); if (review) queuePathTo(review.point); }}>{bt("리뷰 데스크로 이동", "Walk to review desk")}</button>
              <button type="button" disabled={openingReview || !sharedActivity.reviewSubject} onClick={() => { void openSharedReview(); }}>{openingReview ? bt("권한 확인 중…", "Verifying access…") : bt("초대한 검수본 열기", "Open invited snapshot")}</button>
            </section> : null}
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
                    appearance={snapshot.self.appearance}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold">{localName} · {bt("나", "Me")}</p>
                    <p className="truncate text-[0.68rem] text-accent">{bt(currentRoom.labelKo, currentRoom.labelEn)}</p>
                  </div>
                </div>
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
                        src={avatar.directional.down}
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
          </div>
          </div>
          </WorkspaceContextPanel>
        </section>

        <footer className="workspace-live-status">
          <div className="workspace-live-state">
            <span>{bt(currentRoom.labelKo, currentRoom.labelEn)}</span>
            {personal ? <span>{bt("개인 로컬 공간", "Personal local space")}</span> : <ConnectionBadge preparing={preparing} />}
            {sharedActivity ? <span role="status">{bt("공동 작업 진행 중", "Shared activity active")}</span> : null}
          </div>
          <div className="workspace-live-actions" data-space-interactive="true">
            <button type="button" onClick={() => { engineBridge.clearMovement(); setWorkspacePanel("people"); }}>
              <UsersRound size={18} aria-hidden />{bt("사람·대화", "People & conversations")}
              {socialSnapshot.requests.some((request) => request.direction === "incoming" && request.status === "offered") ? <span>{bt("요청 있음", "Request")}</span> : null}
            </button>
            <button type="button" onClick={() => { engineBridge.clearMovement(); setWorkspacePanel("space"); }}>
              <Settings size={18} aria-hidden />{bt("공간·꾸미기", "Space & settings")}
            </button>
            <Link data-workspace-primary-action="true" href={personal ? "/studio/new" : `/studio/p/${encodeURIComponent(projectId)}/production?view=documents`}>{personal ? bt("새 작품 만들기", "Create a work") : bt("원고 목록", "Manuscript list")}<ExternalLink size={16} aria-hidden /></Link>
            <Suspense fallback={null}><StudioP2pHuddleLauncher placement="inline" /></Suspense>
          </div>
        </footer>
      </Container>
    </div>
  );
}

export function StudioVirtualSpacePage({ projectIdOverride, homeHeader, personal = false }: { readonly projectIdOverride?: string; readonly homeHeader?: ReactNode; readonly personal?: boolean } = {}) {
  const bt = useBilingual("StudioVirtualSpacePage");
  const { projectId = "" } = useParams<{ projectId: string }>();
  const decodedProjectId = projectIdOverride ?? decodeProjectId(projectId);
  const session = useSession();
  const userId = session.data?.user.id ?? null;
  const publication = useStudioWorldPublication(decodedProjectId, userId, !personal && session.ready && Boolean(userId)
    && validProjectId(decodedProjectId) && !/^(?:virtual-demo|draft|local)(?:$|[:_-])/u.test(decodedProjectId));
  const transportFactory = useStudioLiveTransportAuth({
    authReady: session.ready && !personal,
    userId: personal ? null : userId,
  });
  const participant = useMemo(() => {
    if (personal || !session.ready || !transportFactory) return null;
    return {
      displayName: session.data?.user.name
        ?? session.data?.user.email
        ?? bt("게스트 크리에이터", "Guest creator"),
      role: session.data ? "editor" as const : "viewer" as const,
    };
  }, [bt, personal, session.data, session.ready, transportFactory]);

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
      showHuddleLauncher={false}
    >
      <VirtualSpaceExperience
        key={JSON.stringify([decodedProjectId, userId, publication.snapshot.active?.scope ?? "bundled"])}
        publication={publication}
        projectId={decodedProjectId}
        homeHeader={homeHeader}
        personal={personal}
        preparing={!personal && (!session.ready || !transportFactory)}
        signedIn={!personal && Boolean(session.data)}
      />
    </StudioLiveCollaborationProvider>
  );
}

export default StudioVirtualSpacePage;
