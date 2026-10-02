import {
  Armchair,
  BookOpen,
  Brush,
  ClipboardList,
  CircleHelp,
  Images,
  LifeBuoy,
  MessageCircle,
  Mic,
  PenTool,
  Presentation,
  Radio,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { StudioLiveCollaborationProvider } from "../live/StudioLiveCollaborationProvider";
import { useStudioLiveCollaboration } from "../live/studio-live-collaboration-context";
import {
  closeStudioP2pHuddle,
  openStudioP2pHuddle,
  STUDIO_P2P_HUDDLE_CLOSED_EVENT,
  type StudioP2pHuddleClosedDetail,
} from "../live/huddle/studio-p2p-huddle-events";
import { useStudioLiveTransportAuth } from "../live/use-studio-live-transport-auth";
import {
  getStudioConnectivityServerSnapshot,
  getStudioConnectivitySnapshot,
  startStudioConnectivityRuntime,
  subscribeStudioConnectivity,
} from "../offline/studio-connectivity";
import { StudioVirtualSpaceActionSheet } from "./StudioVirtualSpaceActionSheet";
import { StudioVirtualSpaceAmbientAudio } from "./StudioVirtualSpaceAmbientAudio";
import { StudioVirtualSpaceDirectory } from "./StudioVirtualSpaceDirectory";
import { StudioVirtualSpaceEntryLobby } from "./StudioVirtualSpaceEntryLobby";
import { StudioVirtualSpaceGuide, StudioVirtualSpaceMiniTour, type StudioVirtualSpaceMiniTourProgress } from "./StudioVirtualSpaceGuide";
import { StudioVirtualSpaceJoystick } from "./StudioVirtualSpaceJoystick";
import { StudioVirtualSpaceNpcDialoguePanel, type StudioNpcDialogueAction } from "./StudioVirtualSpaceNpcDialoguePanel";
import { StudioVirtualSpaceOfficeStart } from "./StudioVirtualSpaceOfficeStart";
import { StudioVirtualSpacePanelGate } from "./StudioVirtualSpacePanelGate";
import {
  StudioVirtualSpacePhaserCanvas,
  type StudioVirtualSpaceEngineLocalState,
} from "./StudioVirtualSpacePhaserCanvas";
import type { StudioSpaceSocialAction, StudioSpaceSocialRequest } from "./StudioVirtualSpaceSocialPanel";
import { StudioVirtualSpaceUserList } from "./StudioVirtualSpaceUserList";
import { StudioVirtualExperienceArtPreview } from "./StudioVirtualExperienceArtPreview";
import { StudioVirtualThemeCharacterPicker } from "./StudioVirtualThemeCharacterPicker";
import { StudioWorldAuthoringEntry } from "./StudioWorldAuthoringEntry";
import { useStudioWorldRuleGate } from "./StudioWorldRuleGate";
import { readStudioOfficeDeskPreference, studioOfficeDeskPreferenceStorageKey, writeStudioOfficeDeskPreference } from "./office-desk-preference";
import { useStudioPrivateRoom } from "./private-room/use-studio-private-room";
import { studioPrivateRoomWalkTarget } from "./private-room/studio-private-room-walk";
import { STUDIO_VIRTUAL_ART_STYLES, writeStudioVirtualArtStyle, readStudioVirtualArtStyle, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import {
  isStudioVirtualCampusRoom,
  resolveStudioVirtualBuiltinWorld,
  studioVirtualCampusZoneMeta,
  STUDIO_VIRTUAL_CAMPUS_COMMONS_ID,
} from "./studio-virtual-space-campus-world";
import { STUDIO_CHARACTER_SKINS, studioCharacterAppearanceForAvatarIndex } from "./studio-virtual-space-character-skins";
import { studioVirtualDecorationNavigationWorld } from "./studio-virtual-space-decoration-layout";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import {
  DEFAULT_STUDIO_FOLLOW_CONFIG,
  studioFollowModeCopy,
  type StudioFollowConfig,
} from "./studio-virtual-space-follow";
import type { StudioVirtualSpaceEngineStatus, StudioVirtualSpaceNearbyNpc, StudioVirtualSpaceZoneChange } from "./studio-virtual-space-engine-events";
import {
  normalizeStudioVirtualSpaceNickname,
  readStudioVirtualSpaceAvatarIndex,
  readStudioVirtualSpaceEntryPreference,
  readStudioVirtualSpaceTourSeen,
  studioVirtualSpaceNicknameFromAccount,
  validStudioVirtualSpaceAvatarIndex,
  writeStudioVirtualSpaceAvatarIndex,
  writeStudioVirtualSpaceEntryPreference,
  writeStudioVirtualSpaceTourSeen,
} from "./studio-virtual-space-entry-preference";
import {
  createStudioGuestSession,
  parseStudioGuestInviteFragment,
  readStudioGuestSession,
  writeStudioGuestSession,
  type StudioGuestSession,
} from "./studio-virtual-space-guest-session";
import {
  acceptStudioSuggestion,
  dismissStudioSuggestion,
  pickStudioSuggestion,
  reduceStudioSuggestion,
  studioSuggestionPlaceKind,
  EMPTY_STUDIO_SUGGESTION_STATE,
  type StudioSuggestionState,
} from "./studio-virtual-space-context-suggestions";
import {
  createStudioFocusSession,
  pauseStudioFocusSession,
  resumeStudioFocusSession,
  startStudioFocusSession,
  stopStudioFocusSession,
  studioFocusSessionActive,
  tickStudioFocusSession,
  type StudioFocusSession,
} from "./studio-virtual-space-focus-session";
import { orchestrateStudioSpatialInteraction } from "./studio-virtual-space-interaction-orchestrator";
import { EMPTY_STUDIO_SPATIAL_INTERACTION_STATE, reduceStudioSpatialInteraction } from "./studio-virtual-space-interaction-state";
import {
  STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  studioVirtualSpaceDestination,
  studioVirtualSpaceInitialPoint,
  studioVirtualSpaceState,
  type StudioVirtualSpaceActivity,
  type StudioVirtualSpaceFacing,
  type StudioVirtualSpacePoint,
  type StudioVirtualSpaceZoneId,
} from "./studio-virtual-space-model";
import { studioNpcRole } from "./studio-virtual-space-npc-director";
import type { StudioVirtualNpcGuideTourRequest, StudioVirtualNpcGuideTourState } from "./studio-virtual-space-npc-guide";
import { EMPTY_STUDIO_VIRTUAL_RUNTIME_METRICS, type StudioVirtualRuntimeMetrics } from "./studio-virtual-space-observability";
import { resolveStudioOfficeDestination, studioVirtualPersonalDeskPoint } from "./studio-virtual-space-office-navigation";
import {
  studioVirtualWorkspacePanelForScope,
  type StudioVirtualWorkspacePanel,
} from "./studio-virtual-space-panel-scope";
import { captureStudioVirtualPhoto } from "./studio-virtual-space-photo-mode";
import {
  readStudioVirtualPlaceId,
  studioVirtualPlaceIdForMode,
  studioVirtualPlaceIdFromPortalHref,
  studioVirtualPlaceSearch,
  studioVirtualPlaceWorldScope,
} from "./studio-virtual-space-place-world";
import { studioVirtualSpaceDefaultGalleryFrames } from "./studio-virtual-space-gallery-defaults";
import type { StudioGalleryStats } from "./studio-virtual-space-gallery";
import type { StudioProjectAudioAssetDescriptor } from "./studio-virtual-space-recording-booth";
import { studioDefaultRecordingBoothConfig } from "./studio-virtual-space-recording-booth-defaults";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
  StudioVirtualSpace as StudioBookableSpace,
} from "./studio-virtual-space-space-booking";
import {
  sanitizeStudioPresenceBubble,
  STUDIO_PRESENCE_BUBBLE_TTL_MS,
  STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS,
  StudioVirtualSpacePresenceController,
  type StudioVirtualSpaceSnapshot,
} from "./studio-virtual-space-presence";
import {
  appendStudioChatMessage,
  maskStudioChatProfanity,
  studioChatBubbleDurationMs,
  type StudioVirtualSpaceChatBubble,
  type StudioVirtualSpaceChatMessage,
  type StudioVirtualSpaceChatScope,
} from "./studio-virtual-space-chat";
import { verifyStudioVirtualSpaceReviewSubject } from "./studio-virtual-space-review-invitation";
import { studioDistrictEnvironment } from "./studio-virtual-space-scene-direction";
import { studioVirtualSpaceSeatedActors } from "./studio-virtual-space-seated-actors";
import {
  resolveStudioVirtualSpaceSessionPoint,
  studioVirtualSpacePositionScope,
  studioVirtualSpacePositionStorageKey,
  writeStudioVirtualSpaceSessionPoint,
} from "./studio-virtual-space-session-position";
import { studioSpatialActions, type StudioSpatialActionId } from "./studio-virtual-space-spatial-actions";
import { studioTownDeskPodForActor, type StudioTownEvent } from "./studio-virtual-space-town-program";
import type { StudioUserStatus } from "./studio-virtual-space-user-status";
import type { StudioWorkDecision } from "./studio-virtual-space-work-bridge";
import { loadStudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-loader";
import {
  clearStudioWorldAuthoringDraft,
  readStudioWorldAuthoringDraftRecord,
  writeStudioWorldAuthoringDraft,
} from "./studio-virtual-space-world-authoring";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  studioWorldPresenceState,
  studioWorldSpawn,
  validateStudioWorldManifest,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldNpcDefinition,
  type StudioWorldPortalDefinition,
} from "./studio-virtual-space-world-manifest";
import { clampStudioWorldPoint, resolveStudioWorldSpawn } from "./studio-virtual-space-world-pathfinding";
import { createStudioWorldStarterTemplate } from "./studio-world-template-package";
import { useStudioOfficePeerApproach } from "./use-studio-office-peer-approach";
import { useStudioVirtualSpaceConversation } from "./use-studio-virtual-space-conversation";
import { useStudioVirtualSpaceOperations } from "./use-studio-virtual-space-operations";
import { useStudioVirtualSpaceP2pBoard } from "./use-studio-virtual-space-p2p-board";
import { useStudioVirtualSpaceSlots } from "./use-studio-virtual-space-slots";
import { useStudioVirtualSpaceSocial } from "./use-studio-virtual-space-social";
import { useStudioWorldPublication } from "./world-publication/use-studio-world-publication";
import { SpaceAtmosphereSettings, type SpaceAtmosphere } from "./hud/SpaceAtmosphereSettings";
import { SpaceAvatar } from "./hud/SpaceAvatar";
import { SpaceAvatarDetailSection } from "./hud/SpaceAvatarDetailSection";
import { SpaceChatPanel } from "./hud/SpaceChatPanel";
import { SpaceDock } from "./hud/SpaceDock";
import { SpaceHudLayout } from "./hud/SpaceHudLayout";
import { SpaceInteractPrompt, type SpaceInteractTarget } from "./hud/SpaceInteractPrompt";
import { SpaceChatInput } from "./hud/SpaceChatInput";
import { SpaceLocationChip } from "./hud/SpaceLocationChip";
import { SpaceMinimap } from "./hud/SpaceMinimap";
import { SpaceMobileDock } from "./hud/SpaceMobileDock";
import { SpacePopover } from "./hud/SpacePopover";
import { SpaceProximityStrip } from "./hud/SpaceProximityStrip";
import { SpaceRequestToast } from "./hud/SpaceRequestToast";
import { SpaceSelfCard } from "./hud/SpaceSelfCard";
import { SpaceShortcutsHelp } from "./hud/SpaceShortcutsHelp";
import { SpaceSidePanel } from "./hud/SpaceSidePanel";
import { SpaceEventBanner } from "./hud/SpaceEventBanner";
import { SpaceContextSuggestion } from "./hud/SpaceContextSuggestion";
import { SpaceFocusChip } from "./hud/SpaceFocusChip";
import { SpaceToasts } from "./hud/SpaceToasts";
import { SpaceTownBanner } from "./hud/SpaceTownBanner";
import { SpaceWorkLauncher } from "./hud/SpaceWorkLauncher";
import { spaceStatusOptionById, type SpaceDockPopover, type SpaceStatusOption } from "./hud/space-dock-model";
import { spaceKoParticle } from "./hud/space-korean";
import { spaceMoreItems } from "./hud/space-more-items";
import { spaceKoParticle } from "./hud/space-korean";
import { useSpaceAttentionLoss } from "./hud/use-space-attention-loss";
import { useSpaceConnectionStatus } from "./hud/use-space-connection-status";
import { useSpaceDockClearance } from "./hud/use-space-dock-clearance";
import { useSpaceDesktop } from "./hud/use-space-media-query";
import { useSpacePreferences } from "./hud/use-space-preferences";
import { useSpaceShortcuts } from "./hud/use-space-shortcuts";
import { useSpacePrivateZoneNotice, useSpaceToasts } from "./hud/use-space-toasts";
import { useSpaceUiEvents } from "./hud/use-space-ui-events";
import { useSpaceAutoMeeting } from "./hud/use-space-auto-meeting";
import { SpaceCoworkSheet, type SpaceCoworkAction } from "./hud/SpaceCoworkSheet";
import { SpaceProximityConsent, SpaceProximityVideo } from "./hud/SpaceProximityVideo";
import { SpaceZoneWorkbar } from "./hud/SpaceZoneWorkbar";
import { SpaceZoneSplash, type SpaceZoneSplashInput } from "./hud/SpaceZoneSplash";
import { SPACE_PROXIMITY_MEDIA_RADIUS, spacePrivateZoneAt, spaceProximityMediaScopePeers, type SpaceProximityRangeMode } from "./hud/space-proximity-media";
import { spaceZoneWorkItems, spaceZoneWorkKind } from "./hud/space-zone-workflow";
import { useSpaceProximityMedia } from "./hud/use-space-proximity-media";
import { useSpaceWorkProject } from "./hud/use-space-work-project";
import { StudioVirtualSpaceLightingPanel } from "./StudioVirtualSpaceLightingPanel";
import {
  setStudioLightFixtureDimmer,
  studioAmbientLightFor,
  toggleStudioLightFixture,
  type StudioLightFixture,
} from "./studio-virtual-space-lighting";
import {
  STUDIO_DAY_NIGHT_CYCLE_MS,
  studioDayNightTimeOfDay,
} from "./studio-virtual-space-day-night-cycle";
import {
  createStudioLightFixturesForPreset,
  type StudioLightingPresetKey,
} from "./studio-virtual-space-lighting-presets";
import {
  modulateStudioDayNightFixtures,
  studioDayNightLightingPhaseAt,
  studioLightingPresetForDayNightPhase,
  type StudioDayNightLightingPhase,
} from "./studio-virtual-space-day-night-lighting";
import type { StudioSpacePose } from "./studio-virtual-space-pose-controller";
import {
  StudioWorkspaceInbox,
  StudioPrivateRoomPanel,
  StudioVirtualSpaceCustomizationPanel,
  StudioVirtualSpaceExperiencePanel,
  StudioWorldPublicationPanel,
  StudioVirtualSpaceNpcPanel,
  StudioVirtualSpaceTeamHub,
  StudioVirtualSpaceTodayBoard,
  StudioVirtualSpaceRtcPanel,
  StudioVirtualSpaceP2pBoard,
  StudioVirtualSpaceLiveAnnotationPanel,
  StudioVirtualSpaceTownProgramPanel,
  StudioVirtualSpaceRoomCatalog,
  StudioVirtualSpaceSeatsPanel,
  StudioVirtualSpaceSocialPanel,
  StudioVirtualSpaceConversationPanel,
  StudioVirtualSpaceReviewPicker,
  StudioVirtualSpacePlaceGallery,
  StudioVirtualSpaceRecordingBoothPanel,
  StudioVirtualSpaceSpaceBookingPanel,
  StudioVirtualSpaceGalleryViewer,
  StudioVirtualSpaceEnvironmentPanel,
  WorkSessionWorkspace,
  StudioP2pHuddleLauncher,
} from "./hud/space-lazy-panels";
import "./studio-virtual-space.css";
import "./studio-workspace-live.css";
import "./hud/space-hud.css";

const SIDE_PANEL_ID = "studio-space-side-panel";
const TALK_DISTANCE = 120;
const SHARED_ACTIVITY_DISTANCE = 156;

function decodeProjectId(projectId: string): string {
  try {
    return decodeURIComponent(projectId);
  } catch {
    return projectId;
  }
}

function validProjectId(projectId: string): boolean {
  return Boolean(projectId && projectId !== "." && projectId !== ".." && projectId.length <= 160 && !projectId.includes("\\"));
}

function initialPanel(search: string): StudioVirtualWorkspacePanel | null {
  const query = new URLSearchParams(search);
  if (query.get("activity") === "board") return "board";
  return query.has("session") || query.get("activity") === "sessions" ? "sessions" : null;
}

function distanceBetween(left: StudioVirtualSpacePoint, right: StudioVirtualSpacePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function VirtualSpaceExperience({
  projectId,
  preparing,
  signedIn,
  publication,
  homeHeader,
  personal = false,
  initialAvatarIndexOverride,
  initialArtStyleOverride,
  nickname,
  onNicknameChange,
  isGuest = false,
  guestSpawn = null,
  entryJustConfirmed = false,
}: {
  readonly homeHeader?: ReactNode;
  readonly personal?: boolean;
  readonly initialAvatarIndexOverride?: number;
  readonly initialArtStyleOverride?: StudioVirtualArtStyleKey;
  readonly nickname: string;
  readonly onNicknameChange: (nickname: string) => void;
  readonly publication: ReturnType<typeof useStudioWorldPublication>;
  readonly projectId: string;
  readonly preparing: boolean;
  readonly signedIn: boolean;
  /** Invite-link guest: no authoring, spawn at the inviter-chosen point. */
  readonly isGuest?: boolean;
  readonly guestSpawn?: { readonly x: number; readonly y: number } | null;
  /** 이번 세션에서 입장 로비를 처음 통과했으면 3단계 미니 투어를 띄운다. */
  readonly entryJustConfirmed?: boolean;
}) {
  const bt = useBilingual("StudioVirtualSpaceExperience");
  const location = useLocation();
  const navigate = useNavigate();
  const desktop = useSpaceDesktop();
  const { toasts, notify, dismiss: dismissToast } = useSpaceToasts();
  /** 이벤트 디렉터(Canvas onSpaceUiEvent): toast → 알림, banner → 상단 배너. */
  const spaceUi = useSpaceUiEvents(bt, notify);
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const authoringMode = searchParams.get("worldEdit") === "1" && !isGuest;
  const explicitPlace = searchParams.has("place");
  const arrivalFrom = searchParams.get("from");
  const publishedWorld = publication.snapshot.active;
  const publishedScope = publishedWorld?.scope;
  const selectedPlaceId = useMemo(() => readStudioVirtualPlaceId(location.search, personal), [location.search, personal]);
  const builtinPlaceWorld = !publishedWorld && !authoringMode;
  const builtin = useMemo(() => builtinPlaceWorld ? resolveStudioVirtualBuiltinWorld(selectedPlaceId, personal, { arrivalFrom }) : null,
    [arrivalFrom, builtinPlaceWorld, personal, selectedPlaceId]);
  const builtinKey = builtin?.key ?? null;
  const builtinRef = useRef(builtin);
  builtinRef.current = builtin;
  const explicitPlaceRef = useRef(explicitPlace);
  explicitPlaceRef.current = explicitPlace;
  const activeWorldScope = publishedScope ?? builtin?.worldScope ?? studioVirtualPlaceWorldScope(selectedPlaceId);
  const [draftBaseRevision, setDraftBaseRevision] = useState<string | null | undefined>(undefined);
  const sharedWorldAllowed = !publication.enabled || (publication.snapshot.viewVerified && (Boolean(publishedWorld) || !publication.snapshot.hasPublishedWorld));
  const positionPlaceId = builtin?.positionPlaceId;
  const positionScope = useMemo(
    () => studioVirtualSpacePositionScope(projectId, authoringMode, positionPlaceId),
    [authoringMode, positionPlaceId, projectId],
  );
  const positionScopeKey = studioVirtualSpacePositionStorageKey(positionScope);
  const live = useStudioLiveCollaboration();
  const privateActorId = useSession().data?.user?.id ?? null;
  const [privateZoneSelection, setPrivateZoneSelection] = useState<string | null>(null);
  const connectivity = useSyncExternalStore(subscribeStudioConnectivity, getStudioConnectivitySnapshot, getStudioConnectivityServerSnapshot);
  const connection = useSpaceConnectionStatus(preparing);
  const workProject = useSpaceWorkProject(projectId, personal);
  const controllerRef = useRef<StudioVirtualSpacePresenceController | null>(null);
  const fallbackIdentity = live.room?.participant.sessionId ?? `space:${projectId}`;
  const decorationScope = JSON.stringify([projectId, activeWorldScope, authoringMode]);
  const preferences = useSpacePreferences({ initialArtStyle: initialArtStyleOverride, decorationScope, notify });
  const {
    artStyle, selectArtStyle, characterCustomization, selectCharacterCustomization, rewardInventory, claimReward, equipReward,
    initialExperiencePreference, experiencePreference, selectExperiencePreference, environmentPreference, selectEnvironmentPreference,
    spaceTheme, selectSpaceTheme,
    decorations, selectDecorations,
  } = preferences;
  const participantRole = live.room?.participant.role;
  const startLocation = initialExperiencePreference.startLocation;
  const initial = useMemo(() => {
    const preferred = studioVirtualSpaceInitialPoint(fallbackIdentity);
    if (startLocation === "lobby") return studioWorldSpawn(DEFAULT_STUDIO_WORLD_MANIFEST, "lobby").point;
    if (startLocation === "desk") return studioTownDeskPodForActor(fallbackIdentity, participantRole).point;
    return resolveStudioVirtualSpaceSessionPoint(positionScope, DEFAULT_STUDIO_WORLD_MANIFEST, preferred) ?? preferred;
  }, [fallbackIdentity, startLocation, participantRole, positionScope]);
  const initialAvatarIndex = useMemo(() => initialAvatarIndexOverride ?? readStudioVirtualSpaceAvatarIndex(), [initialAvatarIndexOverride]);
  const [snapshot, setSnapshot] = useState<StudioVirtualSpaceSnapshot>(() => ({
    self: studioVirtualSpaceState(initial, "down", "available", false, initialAvatarIndex),
    peers: [],
    nearbyPeers: [],
    selfReaction: null,
    peerReactions: [],
    chatMessages: [],
    chatBubbles: [],
    selfChatBubble: null,
    peerTyping: [],
    direct: false,
  }));
  // ── 말풍선 채팅 ──────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  // 컨트롤러가 없는(개인 공간·연결 대기) 경우의 로컬 폴백: 내 말만 로그와 말풍선에 남긴다.
  const [localChatMessages, setLocalChatMessages] = useState<readonly StudioVirtualSpaceChatMessage[]>([]);
  const [localSelfChatBubble, setLocalSelfChatBubble] = useState<StudioVirtualSpaceChatBubble | null>(null);
  const localChatBubbleTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (localChatBubbleTimerRef.current !== null) globalThis.clearTimeout(localChatBubbleTimerRef.current);
  }, []);
  const chatSnapshot: StudioVirtualSpaceSnapshot = snapshot.direct ? snapshot : {
    ...snapshot,
    chatMessages: localChatMessages,
    chatBubbles: [],
    selfChatBubble: localSelfChatBubble,
    peerTyping: [],
  };
  const chatTypingNames = snapshot.peerTyping
    .map((typing) => snapshot.peers.find((peer) => peer.participant.sessionId === typing.sessionId)?.participant.displayName)
    .filter((name): name is string => Boolean(name));
  const sendSpaceChat = useCallback((scope: StudioVirtualSpaceChatScope, text: string) => {
    const controller = controllerRef.current;
    if (controller) {
      controller.sendChat(scope, text);
      return;
    }
    const sanitized = sanitizeStudioPresenceBubble(text);
    if (!sanitized) return;
    const masked = maskStudioChatProfanity(sanitized);
    const now = Date.now();
    const duration = studioChatBubbleDurationMs(masked);
    setLocalChatMessages((current) => appendStudioChatMessage(current, {
      id: `local:${now}`, sessionId: "self", displayName: nickname, scope, text: masked, at: now, self: true,
    }));
    setLocalSelfChatBubble({ sessionId: "self", text: masked, expiresAt: now + duration });
    if (localChatBubbleTimerRef.current !== null) globalThis.clearTimeout(localChatBubbleTimerRef.current);
    localChatBubbleTimerRef.current = globalThis.setTimeout(() => setLocalSelfChatBubble(null), duration);
  }, [nickname]);
  const sendSpaceChatTyping = useCallback((scope: StudioVirtualSpaceChatScope, typing: boolean) => {
    controllerRef.current?.setChatTyping(scope, typing);
  }, []);
  const [activity, setActivity] = useState<StudioVirtualSpaceActivity>("available");
  const [avatarIndex, setAvatarIndex] = useState(initialAvatarIndex);
  const [runtimeMetrics, setRuntimeMetrics] = useState<StudioVirtualRuntimeMetrics>(EMPTY_STUDIO_VIRTUAL_RUNTIME_METRICS);
  const captureVirtualPhoto = useCallback(() => {
    void captureStudioVirtualPhoto().then((capture) => {
      const kilobytes = Math.max(1, Math.round(capture.bytes / 1024));
      notify(bt(`월드 사진을 저장했어요 · ${kilobytes}KB`, `World photo saved · ${kilobytes}KB`), "success");
    }).catch(() => notify(bt("월드 사진을 저장하지 못했어요.", "The world photo could not be saved."), "error"));
  }, [bt, notify]);
  const [moving, setMoving] = useState(false);
  const [followingPeerId, setFollowingPeerId] = useState<string | null>(null);
  // T8 따라가기 설정 (도슨트·벽 통과). 브리지가 소유하고 칩에서 토글한다.
  const [followConfig, setFollowConfig] = useState<StudioFollowConfig>(DEFAULT_STUDIO_FOLLOW_CONFIG);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  // 트랙3 움직임 배선: 자세·고스트·이동 목적지·주야 사이클·조명 상태
  const localPoseRef = useRef<StudioSpacePose>("stand");
  const [ghostMode, setGhostMode] = useState(false);
  const [moveDestination, setMoveDestination] = useState<StudioVirtualSpacePoint | null>(null);
  const [lightFixtures, setLightFixtures] = useState<readonly StudioLightFixture[]>([]);
  const [lightHourOverride, setLightHourOverride] = useState<number | null>(null);
  const [dayNightEnabled, setDayNightEnabled] = useState(false);
  const [dayNightSpeedMs, setDayNightSpeedMs] = useState(STUDIO_DAY_NIGHT_CYCLE_MS);
  const [dayNightNowMs, setDayNightNowMs] = useState(0);
  const dayNightStartRef = useRef(0);
  const dayNightSpeedRef = useRef(STUDIO_DAY_NIGHT_CYCLE_MS);
  /** 주야 사이클 자동 조명 (시간대 프리셋 자동 적용) on/off. 수동 조작 시 꺼진다. */
  const [lightAutoMode, setLightAutoMode] = useState(true);
  const lastAutoLightingPhaseRef = useRef<StudioDayNightLightingPhase | null>(null);
  const [requestedPanel, setPanel] = useState<StudioVirtualWorkspacePanel | null>(() => initialPanel(location.search));
  const panel = studioVirtualWorkspacePanelForScope(requestedPanel, personal);
  // 트랙 B: 녹음부스 예약(예약 패널과 부스 입장 게이트가 공유)과 전시관 집계.
  const [boothBookings, setBoothBookings] = useState<readonly StudioSpaceBooking[]>([]);
  const [boothWaitlist, setBoothWaitlist] = useState<readonly StudioSpaceWaitlistEntry[]>([]);
  const [galleryStats, setGalleryStats] = useState<StudioGalleryStats>({});
  const boothConfig = useMemo(() => studioDefaultRecordingBoothConfig(), []);
  const galleryFrames = useMemo(() => studioVirtualSpaceDefaultGalleryFrames(), []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [dockPopover, setDockPopover] = useState<SpaceDockPopover | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [minimapExpanded, setMinimapExpanded] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  /** 3단계 미니 투어: 로비를 처음 통과한 세션에만 자동으로 뜨고, 실제로 걷기·상호작용·리액션을 하면 넘어간다. */
  const [tourOpen, setTourOpen] = useState(() => entryJustConfirmed && !readStudioVirtualSpaceTourSeen());
  const [tourProgress, setTourProgress] = useState<StudioVirtualSpaceMiniTourProgress>({ moved: false, interacted: false, emoted: false });
  const markCoach = useCallback((key: keyof StudioVirtualSpaceMiniTourProgress) => {
    setTourProgress((current) => current[key] ? current : { ...current, [key]: true });
  }, []);
  const [zone, setZone] = useState<StudioVirtualSpaceZoneChange | null>(null);
  // 근접 음성 범위(기본/좁게/끄기). 상태 메뉴에서 고르고, 세션 동안만 유지한다.
  const [proximityRange, setProximityRange] = useState<SpaceProximityRangeMode>("standard");
  const [nearbyNpcs, setNearbyNpcs] = useState<readonly StudioVirtualSpaceNearbyNpc[]>([]);
  const [stuck, setStuck] = useState(false);
  const [engineStatus, setEngineStatus] = useState<StudioVirtualSpaceEngineStatus>("loading");
  const spaceSearchRef = useRef<HTMLInputElement>(null);
  const desktopDockRef = useRef<HTMLDivElement>(null);
  const mobileDockRef = useRef<HTMLElement>(null);
  useSpaceDockClearance(desktop ? desktopDockRef : mobileDockRef);
  const [reviewPeerId, setReviewPeerId] = useState<string | null>(null);
  const [openingReview, setOpeningReview] = useState(false);
  const cancelSlotsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const cancelOfficeApproachRef = useRef<() => void>(() => undefined);
  const [sharedActivity, setSharedActivity] = useState<StudioSpaceSocialRequest | null>(null);
  const [waveActorIds, setWaveActorIds] = useState<readonly string[]>([]);
  const shownGreetings = useRef(new Set<string>());
  const sharedActivityRef = useRef<StudioSpaceSocialRequest | null>(null);
  const acceptedActivityHandler = useRef<(request: StudioSpaceSocialRequest) => void>(() => undefined);
  const [guideTourRequest, setGuideTourRequest] = useState<StudioVirtualNpcGuideTourRequest | null>(null);
  const [guideTour, setGuideTour] = useState<StudioVirtualNpcGuideTourState | null>(null);
  const guideRequestRef = useRef<StudioVirtualNpcGuideTourRequest | null>(null);
  const guideSequence = useRef(0);
  const [atmosphere, setAtmosphere] = useState<SpaceAtmosphere>(() => {
    try { const saved = localStorage.getItem("toonspectrum:virtual-atmosphere:v1"); return saved === "focus" || saved === "lively" ? saved : "balanced"; }
    catch { return "balanced"; }
  });
  const [spotlightEventId, setSpotlightEventId] = useState<string | null>(null);
  // ── 같이 작업하기: 팀원을 고르고 무엇을 함께 할지 고르면 기존 동의 요청을 보낸다 ──
  const [coworkOpen, setCoworkOpen] = useState(false);
  const [coworkTargetId, setCoworkTargetId] = useState<string | null>(null);
  const openCowork = useCallback((peerId: string | null) => {
    setDockPopover(null);
    setCoworkTargetId(peerId);
    setCoworkOpen(true);
  }, []);

  const [worldManifest, setWorldManifest] = useState<StudioVirtualSpaceWorldManifest>(DEFAULT_STUDIO_WORLD_MANIFEST);
  // 예약 패널의 스페이스 목록: 녹음부스를 맨 앞에 두고 월드 방을 함께 예약할 수 있게 한다.
  const boothSpaces = useMemo<readonly StudioBookableSpace[]>(() => [
    { id: boothConfig.roomId, name: "녹음부스", capacity: 2, equipmentTags: ["마이크", "방음"] },
    ...worldManifest.rooms
      .filter((room) => room.id !== boothConfig.roomId)
      .map((room) => ({ id: room.id, name: room.labelKo, capacity: 8, equipmentTags: [] as readonly string[] })),
  ], [boothConfig, worldManifest]);
  const navigationWorld = useMemo(() => studioVirtualDecorationNavigationWorld(worldManifest, decorations), [worldManifest, decorations]);
  const deskScope = useMemo(() => ({ userId: privateActorId, projectId, activeWorldScope, authoringMode }), [privateActorId, projectId, activeWorldScope, authoringMode]);
  const deskScopeKey = studioOfficeDeskPreferenceStorageKey(deskScope);
  const [deskPreferences, setDeskPreferences] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  const storedDeskPreference = useMemo(() => readStudioOfficeDeskPreference(deskScope, worldManifest), [deskScope, worldManifest]);
  const candidateDeskPreference = deskPreferences.has(deskScopeKey) ? deskPreferences.get(deskScopeKey) : storedDeskPreference;
  const preferredSlotId = worldManifest.interactionSlots?.some((slot) => slot.id === candidateDeskPreference) ? candidateDeskPreference ?? null : null;
  const preferDesk = (id: string) => {
    const next = preferredSlotId === id ? null : id;
    if (!writeStudioOfficeDeskPreference(deskScope, worldManifest, next)) {
      notify(bt("이 기기에 자리를 기억하지 못했어요. 저장 공간을 확인해 주세요.", "Your desk could not be saved on this device. Check available storage."), "warn");
      return;
    }
    setDeskPreferences((current) => new Map(current).set(deskScopeKey, next));
  };
  const pendingArrival = useRef<{ scope: string; placeId: string; roomId: string; point?: StudioVirtualSpacePoint; desk?: boolean } | null>(null);
  const officeNavigationScope = JSON.stringify([privateActorId, projectId, authoringMode, publishedScope]);
  const [authoringDraft, setAuthoringDraft] = useState<StudioVirtualSpaceWorldManifest>(DEFAULT_STUDIO_WORLD_MANIFEST);
  const baselineWorldManifestRef = useRef<StudioVirtualSpaceWorldManifest>(DEFAULT_STUDIO_WORLD_MANIFEST);
  const [worldLoaded, setWorldLoaded] = useState(false);
  const [loadedPositionScope, setLoadedPositionScope] = useState<string | null>(null);
  const [worldLoadError, setWorldLoadError] = useState(false);
  const [currentInteraction, setCurrentInteraction] = useState<StudioWorldInteractionDefinition | null>(null);
  const [pendingInteraction, setPendingInteraction] = useState<StudioWorldInteractionDefinition | null>(null);
  const [interactionState, dispatchInteraction] = useReducer(reduceStudioSpatialInteraction, EMPTY_STUDIO_SPATIAL_INTERACTION_STATE);
  const [dialogueNpc, setDialogueNpc] = useState<StudioWorldNpcDefinition | null>(null);
  const operations = useStudioVirtualSpaceOperations(projectId, signedIn && !personal);
  const engineBridge = useMemo(() => new StudioVirtualSpaceEngineBridge(), []);
  // 데스크톱의 NPC 대화·상호작용 카드는 비모달이라 걷기를 막지 않는다. 모바일 시트와 검색 팔레트만 이동을 멈춘다.
  // 모바일 리액션 줄(react)도 화면을 막지 않으므로 이동을 멈추지 않는다.
  const modalSurfaceOpen = searchOpen
    || (!desktop && (panel !== null || (dockPopover !== null && dockPopover !== "react") || mapOpen || pendingInteraction !== null || dialogueNpc !== null));
  useEffect(() => { if (modalSurfaceOpen) engineBridge.clearMovement(); }, [modalSurfaceOpen, engineBridge]);
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      if (document.querySelector('dialog[open][aria-modal="true"]') && !searchOpen) return;
      event.preventDefault(); event.stopImmediatePropagation();
      engineBridge.clearMovement(); setDockPopover(null); setSearchOpen(true);
      spaceSearchRef.current?.focus();
    };
    window.addEventListener("keydown", openSearch, true);
    return () => window.removeEventListener("keydown", openSearch, true);
  }, [engineBridge, searchOpen]);
  useEffect(() => { if (searchOpen) spaceSearchRef.current?.focus({ preventScroll: true }); }, [searchOpen]);
  const selfRef = useRef(snapshot.self);
  const peersRef = useRef(snapshot.peers);
  const localReactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movingRef = useRef(false);
  const worldReady = worldLoaded && loadedPositionScope === positionScopeKey;
  const boardScope = useMemo(() => ({ boardId: "main-board", worldId: worldManifest.id, contentRevision: activeWorldScope }), [activeWorldScope, worldManifest.id]);
  const p2pBoard = useStudioVirtualSpaceP2pBoard({
    participant: live.room?.participant,
    port: live.room?.direct,
    scope: boardScope,
    storageOwnerId: privateActorId,
    enabled: (panel === "board" || panel === "annotation") && signedIn && worldReady && !authoringMode,
  });
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
    window.addEventListener("keydown", escape);
    return () => {
      guideRequestRef.current = null;
      window.removeEventListener("keydown", escape);
    };
  }, [cancelGuideTour]);
  useSpaceAttentionLoss(cancelGuideTour);

  useEffect(() => {
    selfRef.current = snapshot.self;
    peersRef.current = snapshot.peers;
  }, [snapshot.peers, snapshot.self]);

  useEffect(() => {
    const abortController = new AbortController();
    const resolved = builtinRef.current;
    engineBridge.clearMovement();
    movingRef.current = false;
    setMoving(false);
    setFollowingPeerId(null);
    setCurrentInteraction(null);
    setZone(null);
    setNearbyNpcs([]);
    setStuck(false);
    setWorldLoaded(false);
    setLoadedPositionScope(null);
    setWorldLoadError(false);
    const manifestRequest = publishedWorld
      ? Promise.resolve(publishedWorld.publication.manifest)
      : resolved
        ? Promise.resolve(resolved.manifest)
        : loadStudioVirtualSpaceWorldManifest(undefined, undefined, abortController.signal);
    void manifestRequest.then((manifest) => {
      if (abortController.signal.aborted) return;
      baselineWorldManifestRef.current = manifest;
      const storedDraft = authoringMode ? readStudioWorldAuthoringDraftRecord(projectId) : null;
      const activeManifest = storedDraft?.manifest ?? manifest;
      setDraftBaseRevision(storedDraft ? storedDraft.basePublishedRevisionId : publishedWorld?.publication.revisionId ?? null);
      const spawn = studioWorldSpawn(activeManifest, resolved?.spawnId).point;
      // 주소에 장소가 명시되면(딥링크·하위 맵 복귀) 저장 위치보다 그 장소 입구를 우선한다.
      const point = publishedWorld
        ? resolveStudioWorldSpawn(activeManifest, studioWorldSpawn(activeManifest).point)
        : resolved && explicitPlaceRef.current && !guestSpawn
          ? resolveStudioWorldSpawn(activeManifest, spawn)
          : resolveStudioVirtualSpaceSessionPoint(positionScope, activeManifest, guestSpawn ?? spawn);
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
  }, [authoringMode, builtinKey, engineBridge, positionScope, positionScopeKey, projectId, publishedWorld, guestSpawn]);

  const setFollowingPeer = useCallback((sessionId: string | null) => {
    engineBridge.setFollowingPeer(sessionId);
    setFollowingPeerId(sessionId);
  }, [engineBridge]);

  const updateFollowConfig = useCallback((patch: Partial<StudioFollowConfig>) => {
    setFollowConfig((current) => ({ ...current, ...patch }));
  }, []);

  // 따라가기 설정을 엔진 브리지(외부 시스템)에 동기화한다.
  useEffect(() => {
    engineBridge.setFollowConfig(followConfig);
  }, [engineBridge, followConfig]);

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
    const self = studioWorldPresenceState(nextManifest, { ...current, ...point, moving: false });
    selfRef.current = self;
    setWorldManifest(nextManifest);
    const controller = controllerRef.current;
    if (controller) {
      controller.update(point, self.facing, self.activity, false, self.avatarIndex, self.zoneId);
      setSnapshot(controller.snapshot());
    } else {
      setSnapshot((value) => ({ ...value, self }));
    }
  }, [engineBridge, setFollowingPeer]);

  useEffect(() => {
    if (!authoringMode || !worldReady) return undefined;
    if (validateStudioWorldManifest(authoringDraft).length > 0) return undefined;
    const timeout = globalThis.setTimeout(() => applyAuthoringManifest(authoringDraft), 180);
    return () => globalThis.clearTimeout(timeout);
  }, [applyAuthoringManifest, authoringDraft, authoringMode, worldReady]);

  const resetAuthoringManifest = useCallback(() => {
    clearStudioWorldAuthoringDraft(projectId);
    setAuthoringDraft(baselineWorldManifestRef.current);
    setDraftBaseRevision(publishedWorld?.publication.revisionId ?? null);
  }, [projectId, publishedWorld]);

  useEffect(() => {
    if (!worldReady) return undefined;
    const timeout = globalThis.setTimeout(() => {
      writeStudioVirtualSpaceSessionPoint(positionScope, { x: snapshot.self.x, y: snapshot.self.y });
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
  useEffect(() => () => clearLocalReactionTimer(), [clearLocalReactionTimer]);

  const openAssistant = useCallback(() => {
    globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open"));
  }, []);

  useEffect(() => {
    const room = live.room;
    if (!worldReady) return undefined;
    if (authoringMode || !sharedWorldAllowed || !connectivity.serverAvailable || !room?.direct || live.availability !== "ready") {
      controllerRef.current?.close();
      controllerRef.current = null;
      setSnapshot((current) => ({ ...current, peers: [], nearbyPeers: [], selfReaction: null, peerReactions: [], chatMessages: [], chatBubbles: [], selfChatBubble: null, peerTyping: [], direct: false }));
      return undefined;
    }
    const controller = new StudioVirtualSpacePresenceController(room.participant, room.direct, selfRef.current, {
      appearanceForAvatarIndex: (index, identity) => studioCharacterAppearanceForAvatarIndex(index, identity, characterCustomization),
      worldScope: activeWorldScope,
    });
    clearLocalReactionTimer();
    controllerRef.current = controller;
    controller.setAvatarIndex(selfRef.current.avatarIndex);
    controller.setAppearance?.(studioCharacterAppearanceForAvatarIndex(selfRef.current.avatarIndex, fallbackIdentity, characterCustomization));
    const refresh = () => setSnapshot(controller.snapshot());
    const unsubscribe = controller.subscribe(refresh);
    controller.start();
    refresh();
    return () => {
      unsubscribe();
      controller.close();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [authoringMode, characterCustomization, clearLocalReactionTimer, connectivity.serverAvailable, fallbackIdentity,
    live.availability, live.room, worldReady, activeWorldScope, sharedWorldAllowed]);

  useEffect(() => {
    const appearance = studioCharacterAppearanceForAvatarIndex(avatarIndex, fallbackIdentity, characterCustomization);
    controllerRef.current?.setAppearance?.(appearance);
    const nextSelf = Object.freeze({ ...selfRef.current, avatarIndex, appearance });
    selfRef.current = nextSelf;
    setSnapshot((current) => ({ ...current, self: nextSelf }));
  }, [avatarIndex, characterCustomization, fallbackIdentity]);

  const updatePosition = useCallback((point: StudioVirtualSpacePoint, facing: StudioVirtualSpaceFacing, zoneId?: string) => {
    const bounded = clampStudioWorldPoint(worldManifest, point);
    const nextState = studioWorldPresenceState(worldManifest, {
      ...selfRef.current, ...bounded, facing, activity, moving: movingRef.current,
      zoneId: zoneId ?? selfRef.current.zoneId,
    });
    selfRef.current = nextState;
    const controller = controllerRef.current;
    if (controller) {
      controller.update(bounded, facing, activity, movingRef.current, selfRef.current.avatarIndex, zoneId);
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => ({ ...current, self: nextState }));
  }, [activity, worldManifest]);

  const activateAction = useCallback((action: StudioWorldInteractionDefinition["action"]) => {
    setPanel(null);
    writeStudioVirtualSpaceSessionPoint(positionScope, selfRef.current);
    if (action === "assistant") { openAssistant(); return; }
    if (action === "community") {
      if (personal) setPanel("people");
      else navigate("/community");
      return;
    }
    if (personal && action === "live") { setPanel("town"); return; }
    const destination = personal
      ? action === "assets" ? "/studio/assets" : action === "canvas" || action === "review" ? "/studio" : "/studio/new"
      : studioVirtualSpaceDestination(projectId, action);
    if (destination) navigate(destination);
  }, [navigate, openAssistant, personal, positionScope, projectId]);

  const worldRuleGate = useStudioWorldRuleGate(worldManifest, activity, activateAction);

  const handleEngineLocalState = useCallback((next: StudioVirtualSpaceEngineLocalState) => {
    if (movingRef.current !== next.moving) {
      movingRef.current = next.moving;
      setMoving(next.moving);
      if (next.moving) markCoach("moved");
    }
    const pose = next.pose ?? "stand";
    if (localPoseRef.current !== pose) {
      localPoseRef.current = pose;
    }
    updatePosition(next.point, next.facing, next.zoneId);
  }, [markCoach, updatePosition]);

  const queuePathTo = useCallback((point: StudioVirtualSpacePoint) => {
    if (!worldReady) return;
    cancelOfficeApproachRef.current();
    void cancelSlotsRef.current();
    setFollowingPeer(null);
    engineBridge.requestMove(point);
    setMoveDestination(point);
  }, [engineBridge, setFollowingPeer, worldReady]);

  // 이동 목적지 마커 정리: 도착(12px 이내)하면 미니맵 마커를 숨긴다
  useEffect(() => {
    if (!moveDestination) return;
    const distance = Math.hypot(snapshot.self.x - moveDestination.x, snapshot.self.y - moveDestination.y);
    if (distance < 12) setMoveDestination(null);
  }, [moveDestination, snapshot.self]);

  // 팀원 찾기 안내선: 선택한 팀원을 locate 타깃으로 지정한다
  useEffect(() => {
    engineBridge.setLocateTarget(selectedPeerId);
  }, [selectedPeerId, engineBridge]);

  // 주야 사이클 가상 시계: 활성화 동안 1초마다 브릿지에 가상 시각을 갱신한다
  useEffect(() => {
    dayNightSpeedRef.current = dayNightSpeedMs;
  }, [dayNightSpeedMs]);
  useEffect(() => {
    if (!dayNightEnabled) {
      engineBridge.setDayNightCycle({ enabled: false, startMs: 0, now: 0 });
      return;
    }
    const tick = () => {
      const now = Date.now();
      engineBridge.setDayNightCycle({ enabled: true, startMs: dayNightStartRef.current, now, cycleMs: dayNightSpeedRef.current });
      setDayNightNowMs(now);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => { clearInterval(id); };
  }, [dayNightEnabled, engineBridge]);
  // 사이클을 끄면 마지막 자동 적용 시간대를 잊어, 다시 켤 때 즉시 적용한다.
  useEffect(() => {
    if (!dayNightEnabled) lastAutoLightingPhaseRef.current = null;
  }, [dayNightEnabled]);

  // 조명 기구 상태를 캔버스의 오브젝트 광원 런타임으로 전달한다 (국소 글로우 렌더용).
  useEffect(() => {
    engineBridge.setLightFixtures(lightFixtures);
  }, [engineBridge, lightFixtures]);

  // 주야 자동 조명: 사이클이 켜져 있고 자동 모드면 시간대가 바뀔 때마다
  // 해당 시간대 프리셋을 창문·네온 국소 보정과 함께 자동 적용한다.
  useEffect(() => {
    if (!dayNightEnabled || !lightAutoMode) return;
    const fraction = studioDayNightTimeOfDay(dayNightNowMs, dayNightStartRef.current, dayNightSpeedMs);
    const phase = studioDayNightLightingPhaseAt(fraction);
    if (lastAutoLightingPhaseRef.current === phase) return;
    lastAutoLightingPhaseRef.current = phase;
    setLightFixtures(modulateStudioDayNightFixtures(
      createStudioLightFixturesForPreset(studioLightingPresetForDayNightPhase(phase)),
      fraction,
    ));
  }, [dayNightEnabled, lightAutoMode, dayNightNowMs, dayNightSpeedMs]);

  const toggleDayNight = useCallback(() => {
    setDayNightEnabled((current) => {
      if (!current) {
        // 켜는 순간 가상 시계는 실제 시간대에서 시작한다
        const now = Date.now();
        const date = new Date(now);
        const realFraction = (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) / 86400;
        dayNightStartRef.current = now - realFraction * dayNightSpeedRef.current;
        setDayNightNowMs(now);
      }
      return !current;
    });
  }, []);
  const scrubDayNight = useCallback((timeOfDay: number) => {
    const now = Date.now();
    dayNightStartRef.current = now - timeOfDay * dayNightSpeedRef.current;
    engineBridge.setDayNightCycle({ enabled: true, startMs: dayNightStartRef.current, now, cycleMs: dayNightSpeedRef.current });
    setDayNightNowMs(now);
  }, [engineBridge]);
  const changeDayNightSpeed = useCallback((cycleMs: number) => {
    const now = Date.now();
    const fraction = studioDayNightTimeOfDay(now, dayNightStartRef.current, dayNightSpeedRef.current);
    dayNightStartRef.current = now - fraction * cycleMs;
    setDayNightSpeedMs(cycleMs);
    if (dayNightEnabled) {
      engineBridge.setDayNightCycle({ enabled: true, startMs: dayNightStartRef.current, now, cycleMs });
    }
  }, [dayNightEnabled, engineBridge]);

  // 자세 토글: 서 있으면 쉬기를 요청하고(의자 근처면 앉기, 빈 공간이면 눕기를 상태 머신이 고른다), 앉거나 누워 있으면 일어선다.
  const togglePose = useCallback(() => {
    engineBridge.requestPose(localPoseRef.current === "stand" ? "rest" : "stand");
  }, [engineBridge]);

  const lightHour = new Date().getHours();
  const lightAmbient = studioAmbientLightFor(lightHourOverride ?? lightHour, null);
  const toggleLightFixture = useCallback((id: string) => {
    setLightAutoMode(false);
    setLightFixtures((current) => toggleStudioLightFixture(current, id));
  }, []);
  const changeLightDimmer = useCallback((id: string, dimmer: number) => {
    setLightAutoMode(false);
    setLightFixtures((current) => setStudioLightFixtureDimmer(current, id, dimmer));
  }, []);
  const applyLightPreset = useCallback((key: StudioLightingPresetKey) => {
    setLightAutoMode(false);
    setLightFixtures(createStudioLightFixturesForPreset(key));
  }, []);

  const slots = useStudioVirtualSpaceSlots({
    room: live.room, manifest: worldManifest, publishedScope: activeWorldScope,
    enabled: signedIn && sharedWorldAllowed && worldReady && !authoringMode && activity !== "focused" && activity !== "away" && atmosphere !== "focus",
    point: snapshot.self, moving,
    onApproach: (point) => { cancelOfficeApproachRef.current(); setFollowingPeer(null); engineBridge.requestMove(point); },
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

  const roomById = useMemo(() => new Map(worldManifest.rooms.map((room) => [room.id, room] as const)), [worldManifest.rooms]);
  const currentRoom = roomById.get(snapshot.self.zoneId) ?? worldManifest.rooms[0] ?? null;
  const productionProjectId = operations.snapshot.project?.aggregate.projectId ?? null;
  const nearbyPeerCount = snapshot.peers.filter((peer) => distanceBetween(peer.state, snapshot.self) <= TALK_DISTANCE).length;

  const requestInteraction = useCallback((interaction: StudioWorldInteractionDefinition) => {
    engineBridge.clearMovement();
    setDialogueNpc(null);
    setPendingInteraction(interaction);
    markCoach("interacted");
    dispatchInteraction({ type: "choose", interactionId: interaction.id });
  }, [engineBridge, markCoach]);

  const activateCurrentRoom = useCallback(() => {
    if (!worldReady) return;
    if (currentInteraction) { requestInteraction(currentInteraction); return; }
    if (currentRoom?.action) requestInteraction({
      id: `room-${currentRoom.id}`, zoneId: currentRoom.id, point: { x: snapshot.self.x, y: snapshot.self.y }, radius: 48,
      labelKo: currentRoom.labelKo, labelEn: currentRoom.labelEn, action: currentRoom.action,
    });
  }, [currentInteraction, currentRoom, requestInteraction, snapshot.self.x, snapshot.self.y, worldReady]);

  const handleEngineInteract = useCallback((interaction: StudioWorldInteractionDefinition | null) => {
    if (interaction) requestInteraction(interaction);
    else activateCurrentRoom();
  }, [activateCurrentRoom, requestInteraction]);

  const handleEngineNpcInteract = useCallback((interaction: StudioWorldInteractionDefinition, npc: StudioWorldNpcDefinition) => {
    engineBridge.clearMovement();
    setPendingInteraction(null);
    dispatchInteraction({ type: "close" });
    setDialogueNpc(npc);
    setCurrentInteraction(interaction);
    markCoach("interacted");
  }, [engineBridge, markCoach]);

  const handleNearbyInteractionChange = useCallback((interaction: StudioWorldInteractionDefinition | null) => {
    setCurrentInteraction(interaction);
    dispatchInteraction(interaction ? { type: "nearby", interactionId: interaction.id } : { type: "leave" });
  }, []);

  const spatialContext = useMemo(() => ({ personal, nearbyPeerCount }), [personal, nearbyPeerCount]);
  const executeSpatialAction = useCallback((id: StudioSpatialActionId) => {
    const interaction = pendingInteraction;
    if (!interaction) return;
    dispatchInteraction({ type: "run" });
    setPendingInteraction(null);
    try {
      const decision = orchestrateStudioSpatialInteraction(id, { interaction, projectId, productionProjectId });
      if (decision.kind === "world-rule") worldRuleGate.request(decision.interaction);
      else if (decision.kind === "panel") setPanel(decision.panel);
      else if (decision.kind === "effect") {
        engineBridge.requestEnvironmentEffect(decision.effect, interaction.point);
        if (decision.effect === "wish" || decision.effect === "gong") controllerRef.current?.sendReaction("sparkles");
        if (decision.effect === "pet") controllerRef.current?.sendReaction("heart");
        notify(bt("상호작용 이펙트를 실행했어요.", "Interaction effect activated."), "success");
      } else navigate(decision.href);
      dispatchInteraction({ type: "complete" });
    } catch (error) {
      dispatchInteraction({ type: "fail", error: error instanceof Error ? error.message : "interaction-failed" });
      notify(bt("상호작용을 완료하지 못했어요.", "The interaction could not be completed."), "error");
    }
  }, [bt, engineBridge, navigate, notify, pendingInteraction, productionProjectId, projectId, worldRuleGate]);

  const handleSpatialAction = useCallback((id: StudioSpatialActionId) => {
    const interaction = pendingInteraction;
    if (!interaction) return;
    const selected = studioSpatialActions(interaction, roomById.get(interaction.zoneId), spatialContext).find((item) => item.id === id);
    if (!selected) return;
    const guarded = selected.risk === "authority" || selected.risk === "collaborative";
    dispatchInteraction({ type: "select-action", actionId: id, authority: guarded });
    if (guarded) {
      dispatchInteraction({ type: "confirm" });
      return;
    }
    executeSpatialAction(id);
  }, [executeSpatialAction, pendingInteraction, roomById, spatialContext]);

  const confirmSpatialAction = useCallback(() => {
    const actionId = interactionState.actionId as StudioSpatialActionId | null;
    if (!actionId || interactionState.phase !== "confirming") return;
    executeSpatialAction(actionId);
  }, [executeSpatialAction, interactionState.actionId, interactionState.phase]);

  const followingPeer = followingPeerId ? snapshot.peers.find((peer) => peer.participant.sessionId === followingPeerId) ?? null : null;

  const handleEnginePeerSelect = useCallback((sessionId: string) => {
    setSelectedPeerId(sessionId);
    setPanel("people");
    engineBridge.clearMovement();
    setFollowingPeer(null);
  }, [engineBridge, setFollowingPeer]);

  const selectPlace = useCallback((placeId: string) => {
    const nextPlaceId = studioVirtualPlaceIdForMode(placeId, personal);
    if (pendingArrival.current?.placeId !== nextPlaceId) pendingArrival.current = null;
    if (!builtinPlaceWorld) return;
    const current = builtinRef.current;
    if (current?.kind === "campus" && isStudioVirtualCampusRoom(nextPlaceId)) {
      // 캠퍼스 안의 구역은 주소를 바꾸지 않고 걸어서 간다.
      const spawn = worldManifest.spawns.find((item) => item.id === nextPlaceId)?.point ?? studioWorldSpawn(worldManifest, nextPlaceId).point;
      setPanel(null);
      setMapOpen(false);
      queuePathTo(spawn);
      return;
    }
    if (current?.kind === "place" && nextPlaceId === current.placeId) return;
    void cancelSlotsRef.current();
    engineBridge.clearMovement();
    setFollowingPeer(null);
    setCurrentInteraction(null);
    setPanel(null);
    setMapOpen(false);
    const nextSearch = new URLSearchParams(studioVirtualPlaceSearch(location.search, nextPlaceId, personal));
    // 하위 맵에서 캠퍼스로 돌아갈 때는 그 하위 맵 게이트 앞에서 나오도록 출발지를 알린다.
    if (current?.kind === "place" && isStudioVirtualCampusRoom(nextPlaceId)) nextSearch.set("from", current.placeId);
    else nextSearch.delete("from");
    const value = nextSearch.toString();
    navigate({ pathname: location.pathname, search: value ? `?${value}` : "" });
  }, [builtinPlaceWorld, engineBridge, location.pathname, location.search, navigate, personal, queuePathTo, setFollowingPeer, worldManifest]);

  const moveToRoomOrPlace = useCallback((roomId: StudioVirtualSpaceZoneId, point?: StudioVirtualSpacePoint) => {
    if (!worldReady) return;
    const destination = resolveStudioOfficeDestination({ manifest: navigationWorld, builtinPlaceWorld,
      selectedPlaceId: builtinRef.current?.placeId ?? selectedPlaceId, personal, self: selfRef.current, roomId, point });
    if (!destination) {
      notify(bt("이 작업 자리까지 이동할 수 없어요. 통로와 장소를 확인해 주세요.", "This workspace cannot be reached. Check the route and place."), "warn");
      return;
    }
    setPanel(null);
    if (destination.type === "place") {
      pendingArrival.current = { scope: officeNavigationScope, placeId: destination.placeId, roomId: destination.roomId ?? roomId, point: destination.point };
      selectPlace(destination.placeId);
    } else queuePathTo(destination.point);
  }, [worldReady, navigationWorld, builtinPlaceWorld, selectedPlaceId, personal, bt, notify, officeNavigationScope, selectPlace, queuePathTo]);
  useEffect(() => {
    const pending = pendingArrival.current;
    if (!pending) return;
    if (pending.scope !== officeNavigationScope || !builtinPlaceWorld) { pendingArrival.current = null; return; }
    const arrived = builtinRef.current;
    if (!worldReady || !arrived || (arrived.placeId !== pending.placeId && !worldManifest.rooms.some((room) => room.id === pending.placeId))) return;
    pendingArrival.current = null;
    const point = pending.desk ? studioVirtualPersonalDeskPoint(navigationWorld) : pending.point;
    const destination = resolveStudioOfficeDestination({ manifest: navigationWorld, builtinPlaceWorld,
      selectedPlaceId: arrived.placeId, personal, self: selfRef.current, roomId: pending.roomId, point });
    if (destination?.type === "move") queuePathTo(destination.point);
    else notify(bt("장소에 도착했어요. 이동할 작업 자리를 다시 선택해 주세요.", "You have arrived. Choose an accessible workspace here."), "info");
  }, [worldReady, navigationWorld, worldManifest, builtinPlaceWorld, personal, officeNavigationScope, queuePathTo, bt, notify]);

  const walkToPersonalDesk = useCallback(() => {
    if (!worldReady) return;
    const deskRoomId = "personal-atelier";
    if (!worldManifest.rooms.some((room) => room.id === deskRoomId) && builtinPlaceWorld) {
      pendingArrival.current = { scope: officeNavigationScope, placeId: deskRoomId, roomId: deskRoomId, desk: true };
      selectPlace(deskRoomId);
      return;
    }
    moveToRoomOrPlace("drawing", builtinPlaceWorld ? studioVirtualPersonalDeskPoint(navigationWorld) : undefined);
  }, [builtinPlaceWorld, moveToRoomOrPlace, navigationWorld, officeNavigationScope, selectPlace, worldManifest.rooms, worldReady]);
  const openOfficeSeats = useCallback(() => {
    setDockPopover(null);
    if (personal) walkToPersonalDesk();
    else setPanel("seats");
  }, [personal, walkToPersonalDesk]);

  const handleEnginePortal = useCallback((portal: StudioWorldPortalDefinition) => {
    void cancelSlotsRef.current();
    const placeId = builtinPlaceWorld ? studioVirtualPlaceIdFromPortalHref(portal.href) : null;
    if (placeId) {
      selectPlace(placeId);
      // 같은 장소로 확정되면 월드가 바뀌지 않으니 출발 베일을 걷는 신호를 보낸다.
      // (다른 장소면 새 월드의 스폰 시퀀스가 화면을 연다.)
      if (placeId === selectedPlaceId) engineBridge.requestPortalReveal();
      return;
    }
    if (portal.href) navigate(portal.href);
    // Local portal teleport is owned by the physics runtime, not a second path request.
  }, [builtinPlaceWorld, navigate, selectPlace, selectedPlaceId]);
  const localName = live.room?.participant.displayName.replace(/\s*·\s*이 탭$/u, "") || nickname || bt("나", "Me");

  const sendReaction = useCallback((reaction: StudioSpaceEmoteId) => {
    engineBridge.requestEmote(reaction);
    markCoach("emoted");
    const controller = controllerRef.current;
    if (controller) {
      clearLocalReactionTimer();
      controller.sendReaction(reaction);
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => ({ ...current, selfReaction: reaction }));
    if (localReactionTimerRef.current !== null) globalThis.clearTimeout(localReactionTimerRef.current);
    localReactionTimerRef.current = globalThis.setTimeout(() => {
      localReactionTimerRef.current = null;
      if (!controllerRef.current) setSnapshot((current) => ({ ...current, selfReaction: null }));
    }, STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS);
  }, [clearLocalReactionTimer, engineBridge, markCoach]);
  const emote = useCallback((reaction: StudioSpaceEmoteId) => {
    sendReaction(reaction);
    engineBridge.focusWorld();
  }, [engineBridge, sendReaction]);
  // 말풍선 채팅: 컨트롤러가 있으면 presence로 보내고, 없으면(개인 공간)
  // 로컬 스냅샷에만 띄운 뒤 TTL이 지나면 지운다 — 리액션의 폴백 패턴과 같다.
  const sendChatMessage = useCallback((text: string) => {
    const controller = controllerRef.current;
    if (controller) {
      controller.setBubbleText(text);
      setSnapshot(controller.snapshot());
      return;
    }
    setSnapshot((current) => ({ ...current, self: Object.freeze({ ...current.self, bubble: text }) }));
    if (localBubbleTimerRef.current !== null) globalThis.clearTimeout(localBubbleTimerRef.current);
    localBubbleTimerRef.current = globalThis.setTimeout(() => {
      localBubbleTimerRef.current = null;
      if (!controllerRef.current) {
        setSnapshot((current) => ({ ...current, self: Object.freeze({ ...current.self, bubble: undefined }) }));
      }
    }, STUDIO_PRESENCE_BUBBLE_TTL_MS);
  }, []);
  const setChatTyping = useCallback((typing: boolean) => {
    // 말풍선 입력의 타이핑 신호는 W-1 채팅 패킷 설계(setChatTyping, 근처 범위)를 그대로 쓴다.
    controllerRef.current?.setChatTyping("nearby", typing);
  }, []);
  useEffect(() => () => {
    if (localBubbleTimerRef.current !== null) globalThis.clearTimeout(localBubbleTimerRef.current);
  }, []);

  const { snapshot: socialSnapshot, interactive: socialInteractive, request: requestSocial, respond: respondSocial, cancel: cancelSocial, requestReview, respondReview, setPeerBlocked, wave } = useStudioVirtualSpaceSocial({
    workId: projectId,
    participant: live.room?.participant,
    port: live.room?.direct,
    manifest: worldManifest, publishedScope: activeWorldScope,
    presence: snapshot,
    acousticBindingAvailable: worldReady && !authoringMode && snapshot.direct,
    enabled: signedIn && sharedWorldAllowed && worldReady && !authoringMode && snapshot.direct
      && activity !== "focused" && activity !== "away" && atmosphere !== "focus",
    onAccepted: (request) => acceptedActivityHandler.current(request),
  });
  const officeApproachEnabled = !personal && signedIn && worldReady && sharedWorldAllowed && !authoringMode
    && snapshot.direct && connectivity.serverAvailable && socialInteractive
    && activity !== "focused" && activity !== "away" && atmosphere !== "focus";
  const officeApproach = useStudioOfficePeerApproach({
    manifest: navigationWorld, scope: `${officeNavigationScope}:${activeWorldScope}`, self: snapshot.self,
    peers: snapshot.peers, blockedPeerIds: socialSnapshot.blockedPeerIds, moving, enabled: officeApproachEnabled,
    onMove: (point) => { void cancelSlotsRef.current(); setFollowingPeer(null); engineBridge.requestMove(point); },
    onStop: () => engineBridge.clearMovement(),
    onArrive: (sessionId) => {
      setSelectedPeerId(sessionId); setPanel("people");
      notify(bt("동료 가까이에 도착했어요. 대화 요청을 보내면 상대가 참여 여부를 선택해요.", "You are near your teammate. Send a conversation request so they can choose whether to join."), "success");
    },
  });
  const cancelOfficeApproach = officeApproach.cancel;
  const approachingOfficePeerId = officeApproach.approachingPeerId;
  useEffect(() => { cancelOfficeApproachRef.current = cancelOfficeApproach; }, [cancelOfficeApproach]);
  const blockingSurfaceOpen = searchOpen || (!desktop && panel !== null) || pendingInteraction !== null || dialogueNpc !== null;
  useEffect(() => {
    if (blockingSurfaceOpen && approachingOfficePeerId) cancelOfficeApproach();
  }, [blockingSurfaceOpen, approachingOfficePeerId, cancelOfficeApproach]);
  const approachOfficePeer = (sessionId: string) => {
    if (officeApproach.start(sessionId)) {
      setSelectedPeerId(sessionId); setPanel(null); setSearchOpen(false);
    }
  };
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
      || Date.now() - gestureGreeting.createdAt > 4_000) return undefined;
    shownGreetings.current.add(gestureGreeting.id);
    if (shownGreetings.current.size > 64) {
      const oldest = shownGreetings.current.values().next().value;
      if (oldest !== undefined) shownGreetings.current.delete(oldest);
    }
    setWaveActorIds([gestureGreeting.direction === "outgoing" ? fallbackIdentity : gestureGreeting.peer.sessionId]);
    const timer = globalThis.setTimeout(() => setWaveActorIds([]), 1_600);
    return () => globalThis.clearTimeout(timer);
  }, [gestureGreeting, socialSnapshot.available, fallbackIdentity]);
  // 창을 떠나면 따라가기와 열려 있던 검수 초대 선택을 멈춘다.
  useSpaceAttentionLoss(() => { if (sharedActivityRef.current?.action === "follow") finishSharedActivity(); setReviewPeerId(null); });
  const conversation = useStudioVirtualSpaceConversation({
    participant: live.room?.participant, port: live.room?.direct, manifest: worldManifest, publishedScope: activeWorldScope,
    presence: snapshot,
    acousticBindingAvailable: worldReady && !authoringMode && snapshot.direct,
    enabled: signedIn && sharedWorldAllowed && worldReady && !authoringMode && snapshot.direct
      && activity !== "focused" && activity !== "away" && atmosphere !== "focus",
    blockedPeerIds: socialSnapshot.blockedPeerIds,
    onReady: (scope) => {
      finishSharedActivity();
      setFollowingPeer(null);
      setPanel("chat");
      openStudioP2pHuddle({ conversationId: scope.id,
        peerIds: scope.memberIds.filter((id) => id !== live.room?.participant.sessionId), source: "virtual-space" });
    },
  });
  const privateZones = worldManifest.acousticZones?.filter((item) => Boolean(item.doorId)) ?? [];
  const privateZoneId = privateZones.find((item) => item.id === privateZoneSelection)?.id ?? privateZones[0]?.id ?? null;
  const privateRoom = useStudioPrivateRoom({ workId: projectId, actorId: privateActorId,
    world: publishedWorld ? { worldId: publishedWorld.publication.manifest.id, revisionId: publishedWorld.publication.revisionId, contentHash: publishedWorld.publication.contentHash } : null,
    zones: worldManifest.acousticZones ?? [], zoneId: privateZoneId, room: live.room, presence: snapshot,
    enabled: signedIn && worldReady && !authoringMode && activity !== "focused" && activity !== "away" && atmosphere !== "focus",
    onConversation: () => { finishSharedActivity(); if (conversation.snapshot.active) conversation.leave(conversation.snapshot.active.id); },
  });
  const pairConversation = useMemo(() => sharedActivity?.action === "talk" && live.room?.participant
    ? { id: sharedActivity.id, memberIds: [live.room.participant.sessionId, sharedActivity.peer.sessionId].sort() }
    : null, [sharedActivity, live.room]);
  const activeConversation = conversation.snapshot.active;
  const leaveConversation = conversation.leave;
  const stopSpotlight = useCallback(() => setSpotlightEventId(null), []);
  const startSpotlight = useCallback((event: StudioTownEvent) => {
    const scope = activeConversation ?? pairConversation;
    const selfSessionId = live.room?.participant.sessionId;
    if (!event.spotlight) return;
    if (!scope || !selfSessionId) {
      notify(bt("발표 전에 근처 팀원과 근처 소그룹 대화나 회의를 먼저 합의해 주세요.", "Agree on a nearby group chat or meeting before starting Spotlight."), "warn");
      setPanel("people");
      return;
    }
    const peerIds = scope.memberIds.filter((id) => id !== selfSessionId);
    if (!peerIds.length) return;
    setSpotlightEventId(event.id);
    engineBridge.requestEnvironmentEffect("spotlight", studioWorldSpawn(worldManifest, event.roomId).point);
    openStudioP2pHuddle({ conversationId: scope.id, peerIds, source: "virtual-space" });
    notify(bt("현재 동의한 대화 그룹에 Spotlight를 준비했어요. 마이크·카메라·화면은 직접 선택해요.", "Spotlight is prepared for the consenting conversation. Choose microphone, camera and screen explicitly."), "success");
  }, [activeConversation, pairConversation, live.room?.participant.sessionId, bt, engineBridge, notify, worldManifest]);
  const handleAcceptedActivity = useCallback((request: StudioSpaceSocialRequest) => {
    if (activeConversation) leaveConversation(activeConversation.id);
    if (sharedActivityRef.current?.id !== request.id) finishSharedActivity();
    sharedActivityRef.current = request;
    setSharedActivity(request);
    setSelectedPeerId(request.peer.sessionId);
    if (request.action === "talk") {
      setPanel("chat");
      openStudioP2pHuddle({ conversationId: request.id, peerIds: [request.peer.sessionId], source: "virtual-space" });
    } else if (request.action === "follow" && request.direction === "outgoing") {
      startFollowingPeer(request.peer.sessionId);
    } else if (request.action === "high-five") {
      // Current packs use a celebration reaction; do not claim an unsupported hand pose.
      sendReaction("party");
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
    const distance = peer ? distanceBetween(peer.state, snapshot.self) : Infinity;
    if (!peer || activity === "focused" || activity === "away" || atmosphere === "focus"
      || peer.state.activity === "focused" || peer.state.activity === "away"
      || !socialSnapshot.available || !request || request.status !== "accepted"
      || ((sharedActivity.action === "talk" || sharedActivity.action === "high-five") && distance > SHARED_ACTIVITY_DISTANCE)
      || (sharedActivity.action === "follow" && sharedActivity.direction === "outgoing" && !followingPeerId)) finishSharedActivity();
  }, [sharedActivity, snapshot.peers, snapshot.self, activity, atmosphere, socialSnapshot, followingPeerId, finishSharedActivity]);
  useEffect(() => () => {
    const current = sharedActivityRef.current;
    sharedActivityRef.current = null;
    if (current) closeStudioP2pHuddle({ conversationId: current.id });
  }, []);
  useEffect(() => {
    if (sharedActivity?.action !== "high-five") return undefined;
    const timer = globalThis.setTimeout(finishSharedActivity, STUDIO_VIRTUAL_SPACE_REACTION_TTL_MS);
    return () => globalThis.clearTimeout(timer);
  }, [sharedActivity?.action, sharedActivity?.id, finishSharedActivity]);
  const requestActivity = (sessionId: string, action: StudioSpaceSocialAction) => {
    const peer = snapshot.peers.find((item) => item.participant.sessionId === sessionId);
    if (!peer) return;
    if (action === "review") { setReviewPeerId(sessionId); return; }
    if ((action === "talk" || action === "high-five") && distanceBetween(peer.state, snapshot.self) > TALK_DISTANCE) {
      notify(bt("조금 더 가까이 이동한 뒤 요청해 주세요.", "Move a little closer before sending this invitation."), "warn");
      return;
    }
    const id = requestSocial(sessionId, action);
    if (!id) notify(bt("아직 연결을 확인하는 중이에요. 잠시 후 다시 요청해 주세요.", "Still confirming the connection. Please try again shortly."), "warn");
  };
  const cancelSocialRequest = (id: string) => {
    if (sharedActivity?.id === id) finishSharedActivity();
    else cancelSocial(id);
  };
  const respondToRequest = (id: string, response: "accept" | "decline") => {
    const request = socialSnapshot.requests.find((item) => item.id === id);
    if (request?.action === "review") void respondReview(id, response);
    else respondSocial(id, response);
  };
  const waveTo = (sessionId: string) => {
    if (!wave(sessionId)) notify(bt("인사를 보내지 못했어요. 상대 연결을 확인하거나 잠시 뒤 다시 시도해 주세요.", "The greeting was not sent. Check the connection or try again shortly."), "warn");
  };
  const openSharedReview = async () => {
    const current = sharedActivityRef.current;
    if (!current?.reviewSubject || openingReview || current.reviewSubject.workId !== projectId) return;
    setOpeningReview(true);
    try {
      const verified = await verifyStudioVirtualSpaceReviewSubject(current.reviewSubject, "view");
      if (sharedActivityRef.current?.id !== current.id) return;
      if (!verified.ok) {
        notify(bt("검수본이나 열람 권한이 변경되어 열 수 없어요. 새 초대를 요청해 주세요.", "The review or your access changed. Ask for a new invitation."), "warn"); return;
      }
      writeStudioVirtualSpaceSessionPoint(positionScope, selfRef.current);
      navigate(verified.href);
    } finally { setOpeningReview(false); }
  };
  const changeAtmosphere = (next: SpaceAtmosphere) => {
    setAtmosphere(next);
    try { localStorage.setItem("toonspectrum:virtual-atmosphere:v1", next); } catch { /* Session preference still applies. */ }
    if (next === "focus") { engineBridge.clearMovement(); finishSharedActivity(); }
  };
  const cancelSlotApproach = slots.cancel;
  const cancelFollowing = useCallback(() => {
    cancelOfficeApproach();
    void cancelSlotApproach();
    if (sharedActivity?.action === "follow") finishSharedActivity();
    else setFollowingPeer(null);
  }, [cancelOfficeApproach, cancelSlotApproach, sharedActivity?.action, finishSharedActivity, setFollowingPeer]);
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

  const handleNpcDialogueAction = useCallback((action: StudioNpcDialogueAction) => {
    if (action === "guide") {
      const guide = worldManifest.npcs.find((npc) => studioNpcRole(npc) === "guide");
      if (guide) startGuideTour(guide.id);
      setDialogueNpc(null);
      return;
    }
    if (action === "cowork") {
      setDialogueNpc(null);
      openCowork(null);
      return;
    }
    if (action === "today") setPanel(personal ? "places" : "today");
    else if (action === "team") setPanel(personal ? "people" : "team");
    else if (action === "people") setPanel("people");
    else if (action === "town") setPanel("town");
    else if (action === "review") setPanel(personal ? "places" : "work");
    else if (action === "assets") navigate(personal ? "/studio/assets" : `/studio/p/${encodeURIComponent(projectId)}/assets`);
    else {
      const productionId = operations.snapshot.project?.aggregate.projectId;
      if (action === "schedule") navigate(productionId ? `/production/projects/${encodeURIComponent(productionId)}/schedule` : `/studio/p/${encodeURIComponent(projectId)}/production`);
      else navigate(productionId ? `/production/projects/${encodeURIComponent(productionId)}/control` : `/studio/p/${encodeURIComponent(projectId)}/production`);
    }
    setDialogueNpc(null);
  }, [navigate, openCowork, operations.snapshot.project?.aggregate.projectId, personal, projectId, startGuideTour, worldManifest.npcs]);

  const closeDialogue = useCallback(() => { setDialogueNpc(null); engineBridge.focusWorld(); }, [engineBridge]);
  const closePendingInteraction = useCallback(() => {
    setPendingInteraction(null); dispatchInteraction({ type: "close" }); engineBridge.focusWorld();
  }, [engineBridge]);
  // NPC와 대화하는 동안 카메라를 살짝 당긴다(Canvas가 소비). 닫으면 원래대로.
  useEffect(() => {
    engineBridge.setConversationFocus(dialogueNpc ? { point: dialogueNpc.point, npcId: dialogueNpc.id } : null);
  }, [dialogueNpc, engineBridge]);
  useEffect(() => () => engineBridge.setConversationFocus(null), [engineBridge]);
  // 데스크톱 비모달 대화는 걸어서 멀어지면 닫는다(근처 NPC 목록에서 사라지면). 모바일 시트는 이동을 막으므로 그대로 둔다.
  const dialogueSeenNearby = useRef(false);
  useEffect(() => {
    if (!dialogueNpc) { dialogueSeenNearby.current = false; return; }
    const near = nearbyNpcs.some((item) => item.npc.id === dialogueNpc.id);
    if (near) { dialogueSeenNearby.current = true; return; }
    if (desktop && dialogueSeenNearby.current) {
      dialogueSeenNearby.current = false;
      setDialogueNpc(null);
    }
  }, [desktop, dialogueNpc, nearbyNpcs]);
  // 근처에서 연 상호작용 카드도 그 대상에서 멀어지면 닫는다(데스크톱 비모달).
  const pendingOpenedNearby = useRef(false);
  useEffect(() => {
    if (!pendingInteraction) { pendingOpenedNearby.current = false; return; }
    if (currentInteraction?.id === pendingInteraction.id) { pendingOpenedNearby.current = true; return; }
    if (desktop && pendingOpenedNearby.current) {
      pendingOpenedNearby.current = false;
      setPendingInteraction(null);
      dispatchInteraction({ type: "close" });
    }
  }, [currentInteraction, desktop, pendingInteraction]);
  const dialogueRoomInteractions = useMemo(() => dialogueNpc
    ? worldManifest.interactions.filter((item) => item.zoneId === dialogueNpc.roomId).map((item) => ({ labelKo: item.labelKo, labelEn: item.labelEn }))
    : [], [dialogueNpc, worldManifest.interactions]);

  const setPresenceActivity = (next: StudioVirtualSpaceActivity) => {
    if (next === "focused" || next === "away") { engineBridge.clearMovement(); finishSharedActivity(); }
    setActivity(next);
    controllerRef.current?.setActivity(next);
    setSnapshot((current) => ({ ...current, self: studioWorldPresenceState(worldManifest, { ...current.self, activity: next }) }));
  };
  /** 도크 '나' 메뉴의 상태 6종: 활동과 명시 상태(회의·휴식·자리 비움)를 함께 바꾼다. */
  const setPresenceStatus = (option: SpaceStatusOption) => {
    if (option.activity !== activity) setPresenceActivity(option.activity);
    controllerRef.current?.setUserStatus?.(option.userStatus);
    setSnapshot((current) => ({ ...current, self: Object.freeze({ ...current.self, userStatus: option.userStatus ?? undefined }) }));
  };

  const selectAvatar = useCallback((nextIndex: number) => {
    if (!Number.isInteger(nextIndex) || nextIndex < STUDIO_VIRTUAL_SPACE_AUTO_AVATAR || nextIndex >= STUDIO_CHARACTER_SKINS.length) return;
    setAvatarIndex(nextIndex);
    writeStudioVirtualSpaceAvatarIndex(nextIndex);
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

  // ── HUD 조작 ────────────────────────────────────────────────────────────────
  const closeTopLayer = useCallback((): boolean => {
    if (chatOpen) { setChatOpen(false); engineBridge.focusWorld(); return true; }
    if (dockPopover) { setDockPopover(null); engineBridge.focusWorld(); return true; }
    if (helpOpen) { setHelpOpen(false); engineBridge.focusWorld(); return true; }
    if (mapOpen) { setMapOpen(false); engineBridge.focusWorld(); return true; }
    // 비모달 대화·상호작용 카드는 포커스가 월드에 있어도 Esc로 닫힌다.
    if (dialogueNpc) { closeDialogue(); return true; }
    if (pendingInteraction) { closePendingInteraction(); return true; }
    if (panel) { setPanel(null); engineBridge.focusWorld(); return true; }
    return false;
  }, [chatOpen, closeDialogue, closePendingInteraction, dialogueNpc, dockPopover, engineBridge, helpOpen, mapOpen, panel, pendingInteraction]);
  const closePanel = useCallback(() => { setPanel(null); engineBridge.focusWorld(); }, [engineBridge]);
  const togglePanel = useCallback((next: StudioVirtualWorkspacePanel) => {
    setDockPopover(null);
    setPanel((current) => current === next ? null : next);
  }, []);
  const toggleMap = useCallback(() => { setDockPopover(null); setMapOpen((current) => !current); }, []);
  useSpaceShortcuts({
    onEmote: emote,
    onToggleMap: toggleMap,
    onTogglePeople: () => togglePanel("people"),
    onHelp: () => { setDockPopover(null); setHelpOpen((current) => !current); },
    onChat: () => setChatOpen(true),
    onEscape: closeTopLayer,
  }, worldReady && !searchOpen);
  const exitSpace = useCallback(() => {
    writeStudioVirtualSpaceSessionPoint(positionScope, selfRef.current);
    navigate(personal ? "/home?scope=personal" : `/home?project=${encodeURIComponent(projectId)}`);
  }, [navigate, personal, positionScope, projectId]);
  const finishMiniTour = useCallback((seen: boolean) => {
    if (seen) writeStudioVirtualSpaceTourSeen(true);
    setTourOpen(false);
    engineBridge.focusWorld();
  }, [engineBridge]);
  /** 미니 투어 다시 보기: '다시 보지 않기'를 지우고 처음 단계부터 연다. */
  const replayMiniTour = useCallback(() => {
    writeStudioVirtualSpaceTourSeen(false);
    setTourProgress({ moved: false, interacted: false, emoted: false });
    setPanel(null);
    setTourOpen(true);
  }, []);
  const mediaAvailable = !personal && Boolean(live.canChat);
  const openMedia = useCallback(() => {
    if (!mediaAvailable) {
      notify(bt("팀 프로젝트 공간에서 대화가 연결되면 쓸 수 있어요.", "Available once a team project space conversation is connected."), "info");
      return;
    }
    setPanel("chat");
    openStudioP2pHuddle({ source: "virtual-space" });
  }, [bt, mediaAvailable, notify]);

  // ── 가까이 가면 영상: 한 번 켜면 근처 팀원(같은 프라이빗 구역끼리)과 자동으로 연결·해제한다 ──
  const proximityPrevious = useRef<ReadonlySet<string>>(new Set());
  const acousticZones = worldManifest.acousticZones;
  const proximityPeers = spaceProximityMediaScopePeers({
    self: { point: snapshot.self, activity, privateZoneId: spacePrivateZoneAt(acousticZones, snapshot.self) },
    peers: snapshot.peers.map((peer) => ({ id: peer.participant.sessionId, point: peer.state, activity: peer.state.activity,
      privateZoneId: spacePrivateZoneAt(acousticZones, peer.state) })),
    previous: proximityPrevious.current,
    blockedIds: socialSnapshot.blockedPeerIds,
    range: proximityRange,
  });
  const proximityGainById = new Map(proximityPeers.map((peer) => [peer.id, peer.gain] as const));
  const proximityKey = proximityPeers.map((peer) => peer.id).join("\u0000");
  // id 목록은 키 문자열에서 그대로 파생한다. 미디어 훅이 내용 비교로 재적용을 막아 새 배열이어도 안전하다.
  const proximityScopeIds = proximityKey ? proximityKey.split("\u0000") : [];
  useEffect(() => { proximityPrevious.current = new Set(proximityKey ? proximityKey.split("\u0000") : []); }, [proximityKey]);
  const proximityAvailable = mediaAvailable && signedIn && worldReady && !authoringMode && snapshot.direct
    && connectivity.serverAvailable && Boolean(live.room?.direct);
  const proximity = useSpaceProximityMedia({ participant: live.room?.participant, port: live.room?.direct,
    available: proximityAvailable, scopeIds: proximityScopeIds });
  const [mediaConsentOpen, setMediaConsentOpen] = useState(false);
  const proximityWaitingReason = proximity.phase !== "waiting" ? null : proximity.viewer
    ? bt("초대 링크 게스트는 근접 영상을 쓸 수 없어요. 팀원으로 로그인하면 쓸 수 있어요.", "Invite-link guests cannot use proximity video. Sign in as a teammate to use it.")
    : bt("팀원 연결을 확인하는 중이에요. 연결되면 자동으로 시작해요.", "Checking the teammate connection. It starts automatically once connected.");
  const proximityLive = proximity.phase === "live";
  const proximityControl = (toggle: () => void) => () => {
    if (!mediaAvailable) { openMedia(); return; }
    if (proximity.enabled) { if (proximityLive) toggle(); return; }
    setDockPopover(null);
    setMediaConsentOpen(true);
  };
  const shareScreenNearby = () => {
    if (proximityLive) { proximity.toggleScreen(); return; }
    if (!mediaAvailable) { openMedia(); return; }
    notify(bt("근접 영상을 켜면 근처 팀원과 화면을 공유할 수 있어요.", "Turn on proximity video to share your screen with teammates nearby."), "info");
    setMediaConsentOpen(true);
  };
  const proximityScopeNames = proximityScopeIds.map((id) => ({ id,
    name: snapshot.peers.find((peer) => peer.participant.sessionId === id)?.participant.displayName ?? bt("팀원", "Teammate"),
    gain: proximityGainById.get(id) }));


  const zoneRoomId = zone?.roomId ?? currentRoom?.id ?? null;
  const locationZone = useMemo(() => {
    const meta = zoneRoomId ? studioVirtualCampusZoneMeta(zoneRoomId) : null;
    const commons = zoneRoomId === STUDIO_VIRTUAL_CAMPUS_COMMONS_ID;
    return {
      roomId: zoneRoomId,
      labelKo: commons ? "캠퍼스 산책로" : meta?.labelKo ?? zone?.labelKo ?? currentRoom?.labelKo ?? "",
      labelEn: commons ? "Campus walkway" : meta?.labelEn ?? zone?.labelEn ?? currentRoom?.labelEn ?? "",
      privateZone: zone?.privateZone ?? false,
    };
  }, [currentRoom?.labelEn, currentRoom?.labelKo, zone, zoneRoomId]);
  useSpacePrivateZoneNotice(!personal && worldReady && !authoringMode && locationZone.privateZone, notify, () => bt(
    "프라이빗 구역에 들어왔어요. 안에서는 같은 구역에 있는 사람끼리만 들려요.",
    "You entered a private zone. Inside, only people in the same zone can hear each other.",
  ));
  // 구역 진입 안내는 구석 토스트 대신 스플래시 카드가 맡는다(첫 진입 initial 포함).
  const zoneSplashInput = useMemo<SpaceZoneSplashInput>(() => {
    const officeZone = zone?.roomId
      ? worldManifest.zones?.find((candidate) => candidate.roomId === zone.roomId)
      : undefined;
    return {
      roomId: zone?.roomId ?? null,
      labelKo: locationZone.labelKo,
      labelEn: locationZone.labelEn,
      descriptionKo: officeZone?.descriptionKo,
      descriptionEn: officeZone?.descriptionEn,
      privateZone: zone?.privateZone ?? false,
      reason: zone?.reason ?? "enter",
      worldReady,
    };
  }, [locationZone, worldManifest.zones, worldReady, zone]);
  // 프라이빗 회의 구역에 들어가면 '회의 중'으로, 나오면 되돌린다(직접 고른 상태는 건드리지 않음).
  useSpaceAutoMeeting({ inPrivateZone: locationZone.privateZone, userStatus: snapshot.self.userStatus ?? null, activity,
    enabled: !personal && worldReady && !authoringMode }, (status) => {
    setPresenceStatus(spaceStatusOptionById(status ?? "available"));
    notify(status
      ? bt("회의 공간에 들어와 상태를 '회의 중'으로 바꿨어요. 나가면 되돌려요.", "You entered a meeting space, so your status is now 'In a meeting'. It resets when you leave.")
      : bt("회의 공간을 나와 상태를 '대화 가능'으로 되돌렸어요.", "You left the meeting space, so your status is back to 'Available'."), "info");
  });

  // ── 공간 맥락 제안·집중 세션 (Track J) ────────────────────────────────────
  // 장소(룸)·자세(책상 착석) 신호를 제안 엔진에 넣고, 수락한 제안의 업무 결정을
  // 기존 실행 경로(상태·패널·이동·이모트)로만 적용한다. 자동 실행은 없다.
  const [focusSession, setFocusSession] = useState<StudioFocusSession>(() => createStudioFocusSession());
  const [focusNow, setFocusNow] = useState(() => Date.now());
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [suggestionState, setSuggestionState] = useState<StudioSuggestionState>(EMPTY_STUDIO_SUGGESTION_STATE);
  const focusSessionRef = useRef(focusSession);
  focusSessionRef.current = focusSession;

  const applyWorkStatus = (userStatus: StudioUserStatus, nextActivity?: "focused" | "available") => {
    if (nextActivity) setPresenceActivity(nextActivity);
    controllerRef.current?.setUserStatus?.(userStatus === "available" ? null : userStatus);
    setSnapshot((current) => ({
      ...current,
      self: Object.freeze({ ...current.self, userStatus: userStatus === "available" ? undefined : userStatus }),
    }));
  };

  const applyWorkDecisions = (decisions: readonly StudioWorkDecision[]) => {
    for (const decisionItem of decisions) {
      switch (decisionItem.kind) {
        case "route": navigate(decisionItem.href); break;
        case "panel": setPanel(decisionItem.panel); break;
        case "status": applyWorkStatus(decisionItem.userStatus, decisionItem.activity); break;
        case "emote": emote(decisionItem.emoteId); break;
        case "focus":
          setFocusSession((current) => decisionItem.command === "start"
            ? startStudioFocusSession(current, Date.now())
            : stopStudioFocusSession(current));
          break;
        case "huddle": setPanel("chat"); break;
        case "notice": break;
      }
    }
  };

  // 룸이 바뀌면 장소 신호를 넣는다. 첫 진입 판정은 ref로 한 번만 보낸다.
  const suggestionZoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!worldReady || authoringMode) return;
    const roomId = locationZone.roomId;
    if (suggestionZoneRef.current === roomId) return;
    suggestionZoneRef.current = roomId;
    setSuggestionState((current) => reduceStudioSuggestion(current,
      roomId ? { kind: "enter-place", place: studioSuggestionPlaceKind(roomId) } : { kind: "exit-place" }));
  }, [authoringMode, locationZone.roomId, worldReady]);

  // 책상 슬롯에 앉거나 일어나면 자세 신호를 넣는다.
  const selfSeatedAtDesk = seatedActors.some((actor) => actor.id === fallbackIdentity);
  const suggestionSeatedRef = useRef(false);
  useEffect(() => {
    if (!worldReady || authoringMode) return;
    if (suggestionSeatedRef.current === selfSeatedAtDesk) return;
    suggestionSeatedRef.current = selfSeatedAtDesk;
    setSuggestionState((current) => reduceStudioSuggestion(current,
      selfSeatedAtDesk ? { kind: "seated-at-desk" } : { kind: "stood-up" }));
  }, [authoringMode, selfSeatedAtDesk, worldReady]);

  // 집중·휴식 구간이 도는 동안 1초마다 세션을 흘려보내고, 마침 이벤트를 알림·제안으로 잇는다.
  const focusTimerActive = focusSession.phase === "running" || focusSession.phase === "break";
  useEffect(() => {
    if (!focusTimerActive) return undefined;
    const tick = () => {
      const now = Date.now();
      setFocusNow(now);
      const { session, event } = tickStudioFocusSession(focusSessionRef.current, now);
      if (session !== focusSessionRef.current) setFocusSession(session);
      if (event === "focus-completed") {
        notify(bt("집중 세션을 마쳤어요. 잠깐 쉬어 가세요.", "Focus session complete. Take a short break."), "success");
        setSuggestionState((current) => reduceStudioSuggestion(current, { kind: "focus-completed" }));
      } else if (event === "break-completed") {
        notify(bt("휴식이 끝났어요.", "Your break is over."), "info");
      }
    };
    tick();
    const id = globalThis.setInterval(tick, 1000);
    return () => globalThis.clearInterval(id);
  }, [bt, focusTimerActive, notify]);

  // 제안 쿨다운 판정용 시계. 렌더에서 직접 Date.now()를 부르지 않고 30초 간격으로만 갱신한다.
  useEffect(() => {
    const id = globalThis.setInterval(() => setClockNow(Date.now()), 30_000);
    return () => globalThis.clearInterval(id);
  }, []);

  const activeSuggestion = worldReady && !authoringMode
    ? pickStudioSuggestion(suggestionState, {
      userStatus: snapshot.self.userStatus ?? null,
      focusActive: studioFocusSessionActive(focusSession),
    }, clockNow)
    : null;
  const acceptSuggestion = () => {
    if (!activeSuggestion) return;
    const accepted = acceptStudioSuggestion(suggestionState, activeSuggestion.id, Date.now());
    setSuggestionState(accepted.state);
    applyWorkDecisions(accepted.decisions);
  };
  const dismissSuggestion = () => {
    if (!activeSuggestion) return;
    setSuggestionState((current) => dismissStudioSuggestion(current, activeSuggestion.id, Date.now()));
  };
  const pauseFocusSession = () => setFocusSession((current) => pauseStudioFocusSession(current, Date.now()));
  const resumeFocusSession = () => setFocusSession((current) => resumeStudioFocusSession(current, Date.now()));
  const stopFocusSession = () => {
    setFocusSession((current) => stopStudioFocusSession(current));
    if ((snapshot.self.userStatus ?? null) === "focusing") applyWorkStatus("available", "available");
  };

  const promptNpc = nearbyNpcs.find((npc) => npc.interaction) ?? null;
  const interactTarget = useMemo<SpaceInteractTarget | null>(() => currentInteraction
    ? { kind: "interaction", labelKo: currentInteraction.labelKo, labelEn: currentInteraction.labelEn }
    : promptNpc ? { kind: "npc", labelKo: promptNpc.labelKo, labelEn: promptNpc.labelEn } : null, [currentInteraction, promptNpc]);
  const activateInteractPrompt = useCallback(() => {
    if (currentInteraction) { engineBridge.requestInteract(); return; }
    if (promptNpc?.interaction) handleEngineNpcInteract(promptNpc.interaction, promptNpc.npc);
  }, [currentInteraction, engineBridge, handleEngineNpcInteract, promptNpc]);
  const incomingRequests = socialSnapshot.requests.filter((request) => request.direction === "incoming" && request.status === "offered");
  const socialFocused = activity === "focused" || activity === "away" || atmosphere === "focus";
  const socialDisabledReason = !signedIn || !snapshot.direct || authoringMode || !socialInteractive
    ? bt("팀원 연결을 확인하는 중이에요", "Checking the teammate connection")
    : socialFocused ? bt("집중·자리 비움 중에는 요청을 보내지 않아요", "Requests pause while focusing or away") : null;
  const conversationMemberIds = activeConversation?.memberIds ?? pairConversation?.memberIds ?? [];
  const peopleBadge = { nearby: personal ? 0 : snapshot.nearbyPeers.length, incoming: incomingRequests.length };
  const selfDock = { identity: fallbackIdentity, name: localName, activity: snapshot.self.activity, userStatus: snapshot.self.userStatus,
    avatarIndex: snapshot.self.avatarIndex, appearance: snapshot.self.appearance };
  const spaceName = personal ? bt("나의 스튜디오", "My studio") : workProject.title ?? bt("현재 작품", "Current work");
  const touch = !desktop;

  const moreItems = spaceMoreItems({ personal, desktop, panel, proximityVideoOn: proximity.enabled, pose: localPoseRef.current }, {
    toggleProximityVideo: mediaAvailable ? () => { if (proximity.enabled) proximity.stop(); else setMediaConsentOpen(true); } : undefined,
    openPanel: setPanel, openSeats: openOfficeSeats, openSearch: () => setSearchOpen(true), capturePhoto: captureVirtualPhoto,
    unstuck: () => engineBridge.requestUnstuck(), openHelp: () => setHelpOpen(true), exit: exitSpace, togglePose,
  });

  const selfListId = live.room?.participant.sessionId ?? fallbackIdentity;
  const userListUsers = [
    { id: selfListId, name: localName, zoneId: snapshot.self.zoneId, activity: snapshot.self.activity, userStatus: snapshot.self.userStatus ?? null },
    ...snapshot.peers.map((peer) => ({ id: peer.participant.sessionId, name: peer.participant.displayName, zoneId: peer.state.zoneId,
      activity: peer.state.activity, userStatus: peer.state.userStatus ?? null })),
  ];
  const userListZones = worldManifest.rooms.map((room) => {
    const meta = studioVirtualCampusZoneMeta(room.id);
    return { id: room.id, labelKo: meta?.labelKo ?? room.labelKo, labelEn: meta?.labelEn ?? room.labelEn };
  });

  const officeStart = <StudioVirtualSpaceOfficeStart snapshot={operations.snapshot} workId={projectId} showHeader={false}
    personal={personal} peerCount={snapshot.peers.length} onRefresh={operations.refresh}
    onOpenWork={() => { setDockPopover(null); setPanel("work"); }} onOpenPeople={() => { setDockPopover(null); setPanel("people"); }}
    onOpenSeats={openOfficeSeats}
    onGuide={(destination) => { setDockPopover(null); moveToRoomOrPlace(destination === "story" ? "writers" : destination); }} />;
  const workLauncher = <SpaceWorkLauncher project={workProject} open={dockPopover === "work"} sheet={!desktop}
    onOpenChange={(open) => setDockPopover(open ? "work" : null)}
    trigger={(trigger) => <button type="button" {...trigger} data-workspace-primary-action="true" />}>
    {officeStart}
  </SpaceWorkLauncher>;

  // 트랙 B 배선: 저장 시점 로그인 안내와 에셋 편입 알림. 부스 자동 음소는
  // 근접 미디어 마이크에 값이 다를 때만 적용해 사용자 토글과 충돌하지 않는다.
  const requestSaveLogin = useCallback(() => {
    notify(bt("로그인하면 프로젝트에 저장할 수 있어요.", "Sign in to save this to your project."), "info");
  }, [bt, notify]);
  const handleBoothProjectAsset = useCallback((descriptor: StudioProjectAudioAssetDescriptor) => {
    notify(bt(`${spaceKoParticle(descriptor.name, "을")} 프로젝트 에셋에 넣었어요.`, `Added "${descriptor.name}" to the project assets.`), "success");
  }, [bt, notify]);
  const applyBoothMicMuted = useCallback((muted: boolean) => {
    if (proximity.snapshot && proximity.snapshot.muted !== muted) proximity.toggleMic();
  }, [proximity]);

  const renderPanel = (): ReactNode => {
    switch (panel) {
      case "people": return <>
        <SpaceSelfCard identity={fallbackIdentity} name={localName} self={snapshot.self}
          zoneLabelKo={locationZone.labelKo} zoneLabelEn={locationZone.labelEn} onEditCharacter={() => setPanel("build")} />
        {personal ? <p className="space-panel-note">{bt(
          "개인 스튜디오에는 나만 있어요. 동네를 오가는 NPC는 도우미이며 접속 인원에 포함되지 않아요.",
          "Only you are in your personal studio. NPC residents are helpers and never counted as online people.",
        )}</p> : <>
          <p className="space-panel-count" aria-live="polite">{connectivity.serverAvailable
            ? bt(`접속 중 ${snapshot.peers.length + 1}명 · NPC 제외`, `${snapshot.peers.length + 1} online · NPCs excluded`)
            : bt("서버 연결 없음 · 로컬 작업", "Server unavailable · local work")}</p>
          {/* 누가 어디서 무엇을 하는지: 상태 배지·구역·방향키 탐색. Enter로 고르면 아래에서 바로 인사·요청한다. */}
          <StudioVirtualSpaceUserList users={userListUsers} zones={userListZones} selfId={selfListId} onActivate={setSelectedPeerId} />
          <StudioVirtualSpacePanelGate active>
            <StudioVirtualSpaceSocialPanel manifest={worldManifest}
              renderPeerAvatar={(peer) => <SpaceAvatar identity={peer.participant.sessionId} activity={peer.state.activity} avatarIndex={peer.state.avatarIndex} appearance={peer.state.appearance} />}
              selectedPeer={snapshot.peers.find((peer) => peer.participant.sessionId === selectedPeerId) ?? null}
              peers={snapshot.peers} social={socialSnapshot}
              nearbyPeerIds={snapshot.peers.filter((peer) => distanceBetween(peer.state, snapshot.self) <= TALK_DISTANCE).map((peer) => peer.participant.sessionId)}
              onApproachPeer={approachOfficePeer} approachingPeerId={officeApproach.approachingPeerId} approachDisabled={!officeApproachEnabled}
              conversationPeerIds={conversationMemberIds}
              disabled={!signedIn || !snapshot.direct || authoringMode || !socialInteractive}
              focused={socialFocused}
              onSelect={setSelectedPeerId} onWave={() => { if (selectedPeerId) waveTo(selectedPeerId); }}
              onRequest={requestActivity}
              onRespond={respondToRequest}
              onCancel={cancelSocialRequest}
              onBlock={(id, blocked) => {
                if (blocked) {
                  const privateConversation = privateRoom.snapshot.conversations.filter((record) => record.status !== "revoked")
                    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active"))
                    .find((record) => record.members.some((member) => member.binding.clientInstanceId === id));
                  const member = privateConversation?.members.find((item) => item.binding.clientInstanceId === id);
                  if (privateConversation && member) void privateRoom.controller?.change(privateConversation.conversationId, "block", member.sessionEpoch);
                  for (const record of conversation.snapshot.records) if (record.memberIds.includes(id)) conversation.leave(record.id);
                  if (sharedActivityRef.current?.peer.sessionId === id) finishSharedActivity();
                  if (reviewPeerId === id) setReviewPeerId(null);
                }
                setPeerBlocked(id, blocked);
              }} />
            {reviewPeerId ? <StudioVirtualSpaceReviewPicker key={reviewPeerId} workId={projectId}
              peerName={snapshot.peers.find((peer) => peer.participant.sessionId === reviewPeerId)?.participant.displayName ?? bt("팀원", "Teammate")}
              disabled={!socialInteractive || !socialSnapshot.reviewReadyPeerIds.includes(reviewPeerId)}
              onInvite={async (subject, signal) => Boolean(await requestReview(reviewPeerId, subject, signal))}
              onClose={() => setReviewPeerId(null)} /> : null}
          </StudioVirtualSpacePanelGate>
          {sharedActivity?.action === "review" ? <section className="vs2-panel studio-vspace-shared-review">
            <h2>{bt("함께 검토하기", "Review together")}</h2>
            <p>{bt(`${sharedActivity.peer.displayName} 님과 초대에서 선택한 같은 검수 버전을 함께 봐요.`, `Review the same invited snapshot with ${sharedActivity.peer.displayName}.`)}</p>
            <p className="break-all text-xs">{sharedActivity.reviewSubject?.revisionId ?? bt("검수 버전을 확인할 수 없어요.", "The review version could not be verified.")}</p>
            <button type="button" onClick={() => { const review = worldManifest.interactions.find((item) => item.action === "review"); if (review) queuePathTo(review.point); }}>{bt("리뷰 데스크로 이동", "Walk to review desk")}</button>
            <button type="button" disabled={openingReview || !sharedActivity.reviewSubject} onClick={() => { void openSharedReview(); }}>{openingReview ? bt("권한 확인 중…", "Verifying access…") : bt("초대한 검수본 열기", "Open invited snapshot")}</button>
          </section> : null}
          <button type="button" className="space-link-row" onClick={() => setPanel("team")}><UserPlus size={17} aria-hidden />{bt("팀·그룹·초대", "Teams, groups & invites")}</button>
        </>}
        {worldReady ? <StudioVirtualSpacePanelGate active><StudioVirtualSpaceNpcPanel manifest={worldManifest} onInteract={requestInteraction} /></StudioVirtualSpacePanelGate> : null}
      </>;
      case "chat": return personal ? <div className="space-empty">
        <MessageCircle size={22} aria-hidden />
        <p>{bt("대화와 통화는 팀 프로젝트 공간에서 쓸 수 있어요.", "Chat and calls are available in team project spaces.")}</p>
        <Link href="/studio/new" className="space-pill-button">{bt("팀 작품 만들기", "Create a team work")}</Link>
      </div> : <>
        <p className="space-panel-note">{bt("근처 팀원과 소그룹 대화를 제안하거나 P2P 채팅·통화에 참여하세요. 마이크·카메라는 직접 켤 때만 켜져요.", "Propose a nearby group chat or join P2P chat and calls. Microphone and camera turn on only when you choose.")}</p>
        {signedIn && snapshot.peers.length > 0 ? <StudioVirtualSpacePanelGate active><StudioVirtualSpaceConversationPanel
          self={live.room?.participant} snapshot={conversation.snapshot} currentConversation={pairConversation}
          onPropose={conversation.propose} onRespond={conversation.respond} onSetLocked={conversation.setLocked}
          onLeave={(id) => { if (sharedActivityRef.current?.id === id) finishSharedActivity(); else conversation.leave(id); }} /></StudioVirtualSpacePanelGate>
          : <p className="space-panel-note">{bt("근처에 팀원이 오면 소그룹 대화를 제안할 수 있어요.", "When teammates come near, you can propose a group chat.")}</p>}
        <div className="space-link-grid">
          <button type="button" className="space-link-row" onClick={() => setPanel("board")}><PenTool size={17} aria-hidden />{bt("공유 화이트보드", "Shared whiteboard")}</button>
          <button type="button" className="space-link-row" onClick={() => setPanel("annotation")}><Presentation size={17} aria-hidden />{bt("라이브 화면 주석", "Live annotation")}</button>
        </div>
      </>;
      case "today": return <StudioVirtualSpacePanelGate active><StudioVirtualSpaceTodayBoard snapshot={operations.snapshot} workId={projectId}
        onRefresh={operations.refresh} onGuide={(destination) => moveToRoomOrPlace(destination === "story" ? "writers" : destination)} />
        <div className="space-link-grid">
          <button type="button" className="space-link-row" onClick={() => setPanel("work")}><ClipboardList size={17} aria-hidden />{bt("검수·작업함", "Reviews & inbox")}</button>
          <button type="button" className="space-link-row" onClick={() => setPanel("sessions")}><BookOpen size={17} aria-hidden />{bt("공동 작업 세션", "Work sessions")}</button>
        </div></StudioVirtualSpacePanelGate>;
      case "places": return <StudioVirtualSpacePanelGate active>
        {builtinPlaceWorld ? <StudioVirtualSpacePlaceGallery personal={personal} currentPlaceId={builtin?.kind === "campus" ? locationZone.roomId ?? selectedPlaceId : selectedPlaceId}
          onSelectPlace={selectPlace} onOpen={activateAction} />
          : <p className="space-panel-note">{bt("게시된 커스텀 월드의 방과 포털을 사용합니다.", "Using the published custom world's rooms and portals.")}</p>}
        {/* 캠퍼스는 위 장소 카드가 같은 구역을 보여 주므로 커스텀·하위 맵에서만 구역 목록을 둔다. */}
        {worldReady && builtin?.kind !== "campus" ? <section className="space-panel-section" aria-label={bt("구역 바로가기", "Zone shortcuts")}>
          <h3>{bt("이 월드의 구역", "Zones in this world")}</h3>
          <ul className="space-zone-list workspace-live-room-links">
            {worldManifest.rooms.filter((room) => room.id !== STUDIO_VIRTUAL_CAMPUS_COMMONS_ID).map((room) => <li key={room.id}>
              <span>{bt(room.labelKo, room.labelEn)}</span>
              <button type="button" className="space-pill-button" onClick={() => { setPanel(null); queuePathTo(worldManifest.spawns.find((spawn) => spawn.id === room.id)?.point ?? { x: room.x + room.width / 2, y: room.y + room.height / 2 }); }}>
                {bt("걸어가기", "Walk")}</button>
              {room.action ? <button type="button" className="space-pill-button" onClick={() => {
                const action = room.action;
                if (action) activateAction(action);
              }} aria-label={bt(`${room.labelKo} 도구 열기`, `Open ${room.labelEn} tool`)}>{bt("열기 ↗", "Open ↗")}</button> : null}
            </li>)}
          </ul>
        </section> : null}
        <button type="button" className="space-link-row" onClick={() => setPanel("seats")}><Armchair size={17} aria-hidden />{personal ? bt("내 작업 자리", "My desk") : bt("작업 자리 고르기", "Choose a desk")}</button>
        <button type="button" className="space-link-row" onClick={() => setPanel("town")}><Sparkles size={17} aria-hidden />{bt("제작 공간·미니게임", "Production spaces & games")}</button>
        <button type="button" className="space-link-row" onClick={() => setPanel("booth")}><Mic size={17} aria-hidden />{bt("녹음부스", "Recording booth")}</button>
        <button type="button" className="space-link-row" onClick={() => setPanel("gallery")}><Images size={17} aria-hidden />{bt("전시관", "Exhibition hall")}</button>
        {worldReady ? <StudioVirtualSpaceGuide manifest={worldManifest} onMove={queuePathTo} onOpen={activateAction}
          onStop={() => engineBridge.clearMovement()} onFocus={() => changeAtmosphere("focus")}
          guideTour={guideTour} tourRequested={guideTourRequest !== null}
          onStartTour={atmosphere === "focus" || activity === "focused" || activity === "away" || authoringMode ? undefined : startGuideTour}
          onCancelTour={cancelGuideTour} onReplayMiniTour={replayMiniTour} /> : null}
        <StudioVirtualSpaceRoomCatalog projectAvailable={!personal} onPanel={(next) => setPanel(next)} onZone={moveToRoomOrPlace}
          onTemplate={(template) => {
            try { setAuthoringDraft((current) => createStudioWorldStarterTemplate(template, current)); } catch { /* The authoring template panel reports the failure. */ }
            const nextSearch = new URLSearchParams(location.search);
            nextSearch.set("worldEdit", "1");
            navigate({ pathname: location.pathname, search: nextSearch.toString() });
          }} />
        {!personal ? <StudioPrivateRoomPanel key={`${privateActorId}:${projectId}:${activeWorldScope}:${privateZoneId}`} room={privateRoom}
          zones={privateZones} zoneId={privateZoneId} onZone={setPrivateZoneSelection} peers={snapshot.peers}
          onWalk={worldReady && !authoringMode && !socialFocused ? () => {
            const target = privateZoneId ? studioPrivateRoomWalkTarget(worldManifest, privateZoneId, snapshot.self) : null;
            if (!target) return false;
            queuePathTo(target);
            return true;
          } : undefined}
          labels={Object.fromEntries(privateZones.map((item) => {
            const room = worldManifest.rooms.find((candidate) => candidate.id === item.roomId);
            return [item.id, room ? bt(room.labelKo, room.labelEn) : bt("비공개 방", "Private room")];
          }))} /> : null}
      </StudioVirtualSpacePanelGate>;
      case "build": return <StudioVirtualSpacePanelGate active>
        <section className="space-panel-section" aria-label={bt("내 캐릭터", "My character")}>
          <StudioVirtualThemeCharacterPicker mode="all" includeAuto artStyle={artStyle} avatarIndex={avatarIndex} onSelect={selectAvatar} />
          <p className="space-panel-note">{personal ? bt("캐릭터 선택은 이 브라우저에 저장됩니다.", "Your character choice is saved in this browser.")
            : bt("이 선택은 이 브라우저에만 저장되고 P2P로 팀원에게 공유됩니다.", "This choice stays in this browser and is shared with teammates over P2P.")}</p>
        </section>
        <SpaceAvatarDetailSection identity={fallbackIdentity} />
        <fieldset className="space-panel-section studio-vspace-art-style-picker">
          <legend>{bt("공간 아트 스타일", "World art direction")}</legend>
          <p className="space-panel-note">{bt("건물·가구·바닥의 작화를 선택해요. 내 캐릭터는 직접 고른 모습을 유지해요.", "Choose the art for buildings, furniture and floors. Your character keeps the look you chose.")}</p>
          <div className="studio-vspace-art-style-grid">
            {STUDIO_VIRTUAL_ART_STYLES.map((style) => <button key={style.key} type="button" data-art-style={style.key} aria-pressed={artStyle === style.key}
              title={bt(style.descriptionKo, style.descriptionEn)} onClick={() => selectArtStyle(style.key)}>
              <StudioVirtualExperienceArtPreview kind="landmarks" artStyle={style.key} frame={0} preserveAspectRatio="xMidYMid slice" />
              <small>{bt(style.labelKo, style.labelEn)}</small>
            </button>)}
          </div>
        </fieldset>
        {!personal ? <button type="button" className="space-link-row" onClick={() => {
          const nextSearch = new URLSearchParams(location.search);
          nextSearch.set("worldEdit", "1");
          navigate({ pathname: location.pathname, search: nextSearch.toString() });
        }}><Brush size={17} aria-hidden />{bt("월드 편집기 열기", "Open the world editor")}</button> : null}
      </StudioVirtualSpacePanelGate>;
      case "settings": return <StudioVirtualSpacePanelGate active>
        <SpaceAtmosphereSettings value={atmosphere} localOnly={connectivity.localOnly} onChange={changeAtmosphere} />
        <StudioVirtualSpaceEnvironmentPanel value={environmentPreference} artStyle={artStyle} onChange={selectEnvironmentPreference}
          spaceTheme={spaceTheme} onSpaceThemeChange={selectSpaceTheme} />
        <StudioVirtualSpaceLightingPanel fixtures={lightFixtures} ambient={lightAmbient} hour={lightHour}
          hourOverride={lightHourOverride} onToggleFixture={toggleLightFixture} onDimmerChange={changeLightDimmer}
          onHourOverride={setLightHourOverride} onClearHourOverride={() => setLightHourOverride(null)}
          onApplyPreset={applyLightPreset}
          cycleEnabled={dayNightEnabled}
          cycleAutoLighting={lightAutoMode} onCycleAutoLightingChange={setLightAutoMode}
          cycleTimeOfDay={studioDayNightTimeOfDay(dayNightNowMs, dayNightStartRef.current, dayNightSpeedMs)}
          cycleSpeedMs={dayNightSpeedMs} onToggleCycle={toggleDayNight} onCycleScrub={scrubDayNight}
          onCycleSpeedChange={changeDayNightSpeed} />
        <StudioVirtualSpaceAmbientAudio key={projectId} scope={worldManifest} ready={worldReady && !authoringMode}
          focused={atmosphere === "focus" || activity === "focused"} away={activity === "away"} />
        <StudioVirtualSpaceExperiencePanel value={experiencePreference} metrics={runtimeMetrics} onChange={selectExperiencePreference} onCapture={captureVirtualPhoto} />
        <button type="button" className="space-link-row" onClick={() => setHelpOpen(true)}><CircleHelp size={17} aria-hidden />{bt("단축키 도움말 · 처음 안내 다시 보기", "Shortcuts · replay the first-visit guide")}</button>
        {!personal ? <>
          <button type="button" className="space-link-row" onClick={() => setPanel("rtc")}><Radio size={17} aria-hidden />{bt("실시간 연결 상태", "Live connection status")}</button>
          <StudioWorldPublicationPanel publication={publication} draft={authoringMode ? authoringDraft : undefined} draftBaseRevision={draftBaseRevision}
            onRebaseDraft={(revisionId) => { if (!writeStudioWorldAuthoringDraft(projectId, authoringDraft, revisionId)) return false; setDraftBaseRevision(revisionId); return true; }}
            onEdit={() => { const nextSearch = new URLSearchParams(location.search); nextSearch.set("worldEdit", "1"); navigate({ pathname: location.pathname, search: nextSearch.toString() }); }}
            onApplied={() => { if (authoringMode) { const nextSearch = new URLSearchParams(location.search); nextSearch.delete("worldEdit"); navigate({ pathname: location.pathname, search: nextSearch.toString() }); } }} />
        </> : null}
      </StudioVirtualSpacePanelGate>;
      case "work": return <StudioVirtualSpacePanelGate active><StudioWorkspaceInbox workId={projectId} /></StudioVirtualSpacePanelGate>;
      case "sessions": return <StudioVirtualSpacePanelGate active><WorkSessionWorkspace workId={projectId} initialSessionId={searchParams.get("session")} /></StudioVirtualSpacePanelGate>;
      case "board": return <StudioVirtualSpacePanelGate active><StudioVirtualSpaceP2pBoard snapshot={p2pBoard.snapshot} selfSessionId={live.room?.participant.sessionId}
        onStroke={p2pBoard.addStroke} onNote={p2pBoard.addNote} onRemove={p2pBoard.remove} onClearOwn={p2pBoard.clearOwn} /></StudioVirtualSpacePanelGate>;
      case "annotation": return <StudioVirtualSpacePanelGate active><StudioVirtualSpaceLiveAnnotationPanel snapshot={p2pBoard.snapshot} selfSessionId={live.room?.participant.sessionId}
        onStroke={p2pBoard.addStroke} onNote={p2pBoard.addNote} onRemove={p2pBoard.remove} onClearOwn={p2pBoard.clearOwn} /></StudioVirtualSpacePanelGate>;
      case "team": return <StudioVirtualSpacePanelGate active><StudioVirtualSpaceTeamHub productionProjectId={productionProjectId} workId={projectId} /></StudioVirtualSpacePanelGate>;
      case "rtc": return <StudioVirtualSpacePanelGate active><StudioVirtualSpaceRtcPanel live={live} /></StudioVirtualSpacePanelGate>;
      case "town": return <StudioVirtualSpacePanelGate active><StudioVirtualSpaceTownProgramPanel selfPoint={snapshot.self} personal={personal}
        operations={operations.snapshot} manifest={worldManifest} decorations={decorations} rewards={rewardInventory}
        spotlightActive={Boolean(spotlightEventId)} onDecorations={selectDecorations}
        onClaimReward={(id) => { claimReward(id); notify(bt("꾸미기 보상을 획득했어요.", "Cosmetic reward unlocked."), "success"); }}
        onEquipReward={(id) => { equipReward(id); notify(bt("꾸미기 보상을 적용했어요.", "Cosmetic reward equipped."), "success"); }}
        onMoveToRoom={moveToRoomOrPlace} onMoveToDesk={(pod) => moveToRoomOrPlace(pod.roomId, builtinPlaceWorld ? undefined : pod.point)}
        onOpenPeople={() => setPanel("people")} onOpenAnnotation={() => setPanel("annotation")} onOpenSessions={() => setPanel("sessions")}
        onStartSpotlight={startSpotlight} onStopSpotlight={stopSpotlight} /></StudioVirtualSpacePanelGate>;
      case "seats": return <StudioVirtualSpacePanelGate active>
        <p className="space-panel-note">{bt("작업실 안에서 쓸 자리를 선택하세요. 원고와 검수는 작업함에서 바로 열 수 있어요.", "Choose a desk in this space. Open manuscripts and reviews directly from your work inbox.")}</p>
        {worldReady && worldManifest.interactionSlots?.length ? <StudioVirtualSpaceSeatsPanel slots={worldManifest.interactionSlots} snapshot={slots.snapshot}
          approachingSlotId={slots.approachingSlotId} preferredSlotId={preferredSlotId} onPreferSlot={preferDesk}
          onSelect={(id) => { setPanel(null); slots.requestSlot(id); }} onRelease={() => { void slots.cancel(); engineBridge.clearMovement(); }} />
          : <p role="status">{worldReady
            ? builtinPlaceWorld
              ? bt("현재 장소에는 공유 작업 자리가 없어요. 아래 버튼으로 공유 자리가 있는 로비로 이동할 수 있어요.", "This place has no shared desks. Use the button below to go to the lobby with shared workspaces.")
              : bt("현재 장소에는 공유 작업 자리가 없어요.", "This place has no shared desks.")
            : bt("작업 자리를 확인하고 있어요.", "Checking the workspaces.")}</p>}
        {builtinPlaceWorld ? <button type="button" className="space-link-row" onClick={() => moveToRoomOrPlace("lobby")}><Armchair size={17} aria-hidden />{bt("공유 자리 있는 로비로 이동", "Go to shared workspaces in the lobby")}</button> : null}
        {personal ? <button type="button" className="space-link-row" onClick={walkToPersonalDesk}><Brush size={17} aria-hidden />{bt("내 드로잉 책상으로 걷기", "Walk to my drawing desk")}</button>
          : <button type="button" className="space-link-row" onClick={() => setPanel("work")}><BookOpen size={17} aria-hidden />{bt("내 작업 열기", "Open my work")}</button>}
      </StudioVirtualSpacePanelGate>;
      case "booth": return <StudioVirtualSpacePanelGate active>
        <StudioVirtualSpaceSpaceBookingPanel spaces={boothSpaces} bookings={boothBookings} waitlist={boothWaitlist}
          onBookingsChange={setBoothBookings} onWaitlistChange={setBoothWaitlist} />
        <StudioVirtualSpaceRecordingBoothPanel config={boothConfig} bookings={boothBookings}
          position={{ x: snapshot.self.x, y: snapshot.self.y }} userName={localName}
          micMutedByUser={proximity.snapshot?.muted ?? false}
          projectId={personal ? null : projectId} isGuest={isGuest}
          onRequireLogin={requestSaveLogin} onProjectAsset={handleBoothProjectAsset}
          onEffectiveMicMuted={applyBoothMicMuted} />
      </StudioVirtualSpacePanelGate>;
      case "gallery": return <StudioVirtualSpacePanelGate active>
        <StudioVirtualSpaceGalleryViewer frames={galleryFrames}
          position={{ x: snapshot.self.x, y: snapshot.self.y }} userId={privateActorId}
          stats={galleryStats} onStatsChange={setGalleryStats} onRequireLogin={requestSaveLogin} />
      </StudioVirtualSpacePanelGate>;
      default: return null;
    }
  };

  // 대화 런처는 열기 이벤트를 계속 받아야 하고, 저장 전 닉네임·꾸미기 초안은 탭을 옮기거나 패널을 닫아도 유지한다.
  const sidePanelKeepAlive = [
    ...(!personal ? [{ id: "huddle", visible: panel === "chat", node: <Suspense fallback={null}><StudioP2pHuddleLauncher placement="inline" /></Suspense> }] : []),
    { id: "customization", visible: panel === "build", node: <StudioVirtualSpacePanelGate active={panel === "build"} preserveAfterOpen>
      <StudioVirtualSpaceCustomizationPanel artStyle={artStyle} key={decorationScope} world={worldManifest} nickname={nickname}
        character={characterCustomization} decorations={decorations} selfPoint={snapshot.self}
        onNickname={onNicknameChange} onCharacter={selectCharacterCustomization} onDecorations={selectDecorations}
        onSelectDistrict={(district) => selectEnvironmentPreference(studioDistrictEnvironment(district))} />
    </StudioVirtualSpacePanelGate> },
  ];
  const minimapPeople = useMemo(() => snapshot.peers.map((peer) => ({ id: peer.participant.sessionId, name: peer.participant.displayName, point: peer.state })), [snapshot.peers]);
  const nearbyPeopleCards = personal ? [] : snapshot.nearbyPeers.map((peer) => ({
    id: peer.participant.sessionId, name: peer.participant.displayName, activity: peer.state.activity, userStatus: peer.state.userStatus ?? null,
    avatarIndex: peer.state.avatarIndex, appearance: peer.state.appearance,
    inConversation: conversationMemberIds.includes(peer.participant.sessionId),
  }));
  const nearbyNpcCards = nearbyNpcs.map((npc) => ({
    id: npc.id, labelKo: npc.labelKo, labelEn: npc.labelEn, activityKo: npc.activityKo, activityEn: npc.activityEn,
    skinKey: npc.skinKey, canTalk: Boolean(npc.interaction),
  }));
  const dockMedia = {
    available: mediaAvailable, onOpen: openMedia,
    micOn: proximityLive && proximity.snapshot ? !proximity.snapshot.muted : false,
    cameraOn: proximityLive && Boolean(proximity.snapshot?.camera),
    screenOn: proximityLive && Boolean(proximity.snapshot?.sharing),
    ...(mediaAvailable ? { onMic: proximityControl(proximity.toggleMic), onCamera: proximityControl(proximity.toggleCamera), onScreen: shareScreenNearby } : {}),
  };
  const zoneWorkKind = worldReady && !authoringMode ? spaceZoneWorkKind(locationZone.roomId, currentRoom?.action) : null;
  const zoneWorkItems = zoneWorkKind ? spaceZoneWorkItems(zoneWorkKind, { projectId, productionProjectId, personal }) : [];
  const coworkPeers = snapshot.peers
    .map((peer) => ({ peer, distance: distanceBetween(peer.state, snapshot.self) }))
    .sort((left, right) => left.distance - right.distance)
    .map(({ peer, distance }) => ({ id: peer.participant.sessionId, name: peer.participant.displayName, activity: peer.state.activity,
      userStatus: peer.state.userStatus ?? null, avatarIndex: peer.state.avatarIndex, appearance: peer.state.appearance, near: distance <= TALK_DISTANCE }));
  const coworkLinks = personal ? [] : [
    { id: "board", href: productionProjectId ? `/production/projects/${encodeURIComponent(productionProjectId)}/episodes` : `/studio/p/${encodeURIComponent(projectId)}/production`, labelKo: "회차 보드", labelEn: "Episode board" },
    { id: "review", href: productionProjectId ? `/production/projects/${encodeURIComponent(productionProjectId)}/review` : `/studio/p/${encodeURIComponent(projectId)}/review?view=inbox`, labelKo: "원고 검토", labelEn: "Page review" },
  ];
  const requestCowork = (peerId: string, action: SpaceCoworkAction) => {
    setCoworkOpen(false);
    setSelectedPeerId(peerId);
    if (action === "review") setPanel("people");
    requestActivity(peerId, action);
  };
  const coach = worldReady && tourOpen ? <StudioVirtualSpaceMiniTour progress={tourProgress} touch={touch} onDone={finishMiniTour} /> : null;
  const dock = desktop
    ? <SpaceDock self={selfDock} media={dockMedia} panel={panel} mapOpen={mapOpen}
      peopleBadge={peopleBadge} popover={dockPopover} moreItems={moreItems} workLauncher={workLauncher} panelId={SIDE_PANEL_ID}
      dockRef={desktopDockRef} proximityRange={proximityRange} onProximityRange={setProximityRange}
      onPopover={setDockPopover} onStatus={setPresenceStatus} onEditCharacter={() => setPanel("build")} onEmote={emote}
      onTogglePanel={togglePanel} onToggleMap={toggleMap} onExit={exitSpace} />
    : <SpaceMobileDock popover={dockPopover} peopleBadge={peopleBadge} peopleOpen={panel === "people"} mapOpen={mapOpen}
      moreItems={moreItems} workLauncher={workLauncher} dockRef={mobileDockRef} onPopover={setDockPopover} onEmote={emote}
      onTogglePeople={() => togglePanel("people")} onToggleMap={toggleMap} />;

  return (
    <div className="space-hud" data-studio-live-shell="true" data-studio-personal-space={personal || undefined}
      data-route-ready="studio-live-space" data-hud-layout={desktop ? "desktop" : "mobile"} data-panel-open={panel ? "true" : undefined}
      data-world-kind={builtin?.kind ?? "custom"} data-engine-status={engineStatus} data-handedness={experiencePreference.handedness}>
      <h1 className="sr-only">{spaceName} · {bt("가상 스튜디오", "Virtual studio")}</h1>
      <div className="space-hud__stage" data-studio-virtual-space="true"
        data-handedness={experiencePreference.handedness} data-control-mode={experiencePreference.controlMode}
        data-quality-preset={experiencePreference.qualityPreset} data-spotlight-active={spotlightEventId ? "true" : undefined}>
        {worldReady ? <StudioVirtualSpacePhaserCanvas
          manifest={worldManifest}
          worldAssetUrls={publishedWorld?.assetUrls}
          snapshot={chatSnapshot}
          bridge={engineBridge}
          selfIdentity={fallbackIdentity}
          selfDisplayName={nickname}
          seatedActors={seatedActors}
          waveActorIds={waveActorIds}
          guideTourRequest={guideTourRequest}
          onGuideTourChange={updateGuideTour}
          debugWorld={authoringMode}
          atmosphere={activity === "focused" || activity === "away" ? "focus" : atmosphere}
          artStyle={artStyle}
          spaceTheme={spaceTheme}
          decorations={decorations}
          experiencePreference={experiencePreference}
          environmentPreference={environmentPreference}
          onRuntimeMetrics={setRuntimeMetrics}
          onNpcInteract={handleEngineNpcInteract}
          onLocalState={handleEngineLocalState}
          onInteract={handleEngineInteract}
          onNearbyInteractionChange={handleNearbyInteractionChange}
          onPeerSelect={handleEnginePeerSelect}
          onCancelFollow={cancelFollowing}
          onPortal={handleEnginePortal}
          onZoneChange={setZone}
          onNearbyNpcsChange={setNearbyNpcs}
          onStuckChange={setStuck}
          onEngineStatusChange={setEngineStatus}
          onGhostModeChange={setGhostMode}
          onSpaceUiEvent={spaceUi.handleSpaceUiEvent}
        /> : <div className="studio-vspace-engine-message" role="status">{worldLoadError
          ? bt("이 월드에는 안전하게 시작할 수 있는 바닥이 없습니다.", "This world has no safe floor where a player can start.")
          : bt("공간 데이터 불러오는 중…", "Loading world data…")}</div>}
      </div>
      <SpaceZoneSplash input={zoneSplashInput} />
      <SpaceHudLayout
        topLeft={<>
          <SpaceLocationChip spaceName={spaceName} zone={locationZone} compact={touch}
            connection={personal ? null : connection} onExit={exitSpace} />
          {homeHeader}
          {desktop ? coach : null}
          <SpaceZoneWorkbar kind={zoneWorkKind} items={zoneWorkItems} onPanel={setPanel} onCowork={() => openCowork(null)} onShare={shareScreenNearby} />
        </>}
        topCenter={<>
          {desktop ? null : coach}
          {worldRuleGate.element}
          <SpaceTownBanner personal={personal} spotlightActive={Boolean(spotlightEventId)} onStopSpotlight={stopSpotlight} onViewTown={() => setPanel("town")} />
          <SpaceEventBanner banner={spaceUi.banner} onDismiss={spaceUi.dismissBanner} />
          {!personal ? <SpaceRequestToast requests={incomingRequests} acceptDisabledReason={socialFocused ? bt("집중·자리 비움 중에는 수락할 수 없어요", "You can't accept while focusing or away") : null}
            onRespond={respondToRequest} onOpenPeople={() => setPanel("people")} /> : null}
          <SpaceProximityVideo phase={proximity.phase} snapshot={proximity.snapshot} busy={proximity.busy} scopeNames={proximityScopeNames}
            selfName={localName} waitingReason={proximityWaitingReason}
            onToggleCamera={proximity.toggleCamera} onToggleMic={proximity.toggleMic} onToggleScreen={proximity.toggleScreen} onStop={proximity.stop} />
          {worldReady ? <SpaceProximityStrip people={nearbyPeopleCards} npcs={nearbyNpcCards} artStyle={artStyle}
            socialDisabled={socialDisabledReason} followingPeerId={followingPeerId} onCowork={(id) => openCowork(id)}
            onWave={waveTo} onTalk={(id) => requestActivity(id, "talk")}
            onFollow={(id) => { if (followingPeerId === id) cancelFollowing(); else startFollowingPeer(id); }}
            onNpcTalk={(id) => { const npc = nearbyNpcs.find((item) => item.id === id); if (npc?.interaction) handleEngineNpcInteract(npc.interaction, npc.npc); }} /> : null}
          <SpaceToasts toasts={toasts} onDismiss={dismissToast} />
        </>}
        topRight={worldReady && desktop ? <SpaceMinimap manifest={worldManifest} self={snapshot.self} people={minimapPeople}
          currentRoomId={locationZone.roomId} expanded={minimapExpanded} onToggleExpanded={() => setMinimapExpanded((current) => !current)}
          onOpenFull={toggleMap} onMoveTo={queuePathTo} destination={moveDestination} /> : null}
        bottomCenter={<>
          <div className="space-hud__prompts">
            {officeApproach.status === "walking" || officeApproach.status === "unreachable" ? <div className="space-status-chip" data-space-interactive="true">
              <p role="status">{officeApproach.status === "walking"
                ? bt(`${officeApproach.peerName ?? "동료"} 님에게 가는 중 · 도착 후 대화를 요청하세요.`, `Walking to ${officeApproach.peerName ?? "your teammate"} · request a conversation when you arrive.`)
                : bt("동료에게 갈 수 있는 통로를 찾지 못했어요. 위치를 확인하고 다시 선택해 주세요.", "No reachable route to your teammate was found. Check their location and try again.")}</p>
              <button type="button" className="space-pill-button" onClick={officeApproach.cancel}>{officeApproach.status === "walking" ? bt("이동 취소", "Cancel walk") : bt("닫기", "Dismiss")}</button>
            </div> : null}
            {followingPeer ? <button type="button" className="space-status-chip" data-space-interactive="true" onClick={cancelFollowing}>
              {bt(`${followingPeer.participant.displayName} 따라가는 중`, `Following ${followingPeer.participant.displayName}`)} <X size={14} aria-hidden />
            </button> : null}
            {followingPeer ? <div className="space-status-chip" data-space-interactive="true">
              <p role="status">{studioFollowModeCopy(bt, followConfig.mode)}</p>
              <button type="button" className="space-pill-button" aria-pressed={followConfig.mode === "docent"} onClick={() => updateFollowConfig({ mode: followConfig.mode === "docent" ? "standard" : "docent" })}>{bt("도슨트", "Docent")}</button>
              <button type="button" className="space-pill-button" aria-pressed={followConfig.ignoreCollisions} onClick={() => updateFollowConfig({ ignoreCollisions: !followConfig.ignoreCollisions })}>{bt("벽 통과", "Pass walls")}</button>
            </div> : null}
            {stuck ? <button type="button" className="space-status-chip space-status-chip--warn" data-space-interactive="true" onClick={() => engineBridge.requestUnstuck()}>
              <LifeBuoy size={16} aria-hidden />{bt("끼었나요? 제자리로 이동", "Stuck? Move to a safe spot")}
            </button> : null}
            {ghostMode ? <div className="space-status-chip" data-space-interactive="true">
              <p role="status">{bt("고스트 모드 · 벽과 사람을 통과합니다 (G)", "Ghost mode · passing through walls and people (G)")}</p>
              <button type="button" className="space-pill-button" onClick={() => engineBridge.setGhostMode(false)}>{bt("끄기", "Turn off")}</button>
            </div> : null}
            {worldReady && !authoringMode ? <SpaceFocusChip session={focusSession} now={focusNow}
              onPause={pauseFocusSession} onResume={resumeFocusSession} onStop={stopFocusSession} /> : null}
            {worldReady && !authoringMode && activeSuggestion ? <SpaceContextSuggestion suggestion={activeSuggestion}
              onAccept={acceptSuggestion} onDismiss={dismissSuggestion} /> : null}
            {worldReady ? <SpaceInteractPrompt target={interactTarget} touch={touch} onActivate={activateInteractPrompt} /> : null}
            {worldReady ? <SpaceChatInput blocked={blockingSurfaceOpen || panel !== null || dockPopover !== null || mapOpen || helpOpen}
              touch={touch} onTypingChange={setChatTyping} onSend={sendChatMessage}
              onClosed={() => engineBridge.focusWorld()} /> : null}
          </div>
          {dock}
        </>}
        bottomEnd={touch && worldReady && experiencePreference.controlMode !== "tap" ? <div className="space-joystick" data-handedness={experiencePreference.handedness} data-space-interactive="true">
          <StudioVirtualSpaceJoystick mode={experiencePreference.controlMode} onVectorChange={(vector) => engineBridge.setJoystick(vector)} />
        </div> : null}
        rightPanel={<SpaceSidePanel id={SIDE_PANEL_ID} panel={panel} personal={personal} desktop={desktop} onSelect={setPanel} onClose={closePanel}
          keepAlive={sidePanelKeepAlive}>
          <Suspense fallback={<p role="status">{bt("패널 불러오는 중…", "Loading panel…")}</p>}>
            {renderPanel()}
          </Suspense>
        </SpaceSidePanel>}
      />
      {worldReady ? <SpaceChatPanel messages={chatSnapshot.chatMessages} typingNames={chatTypingNames} open={chatOpen}
        onOpenChange={setChatOpen} onSend={sendSpaceChat} onTyping={sendSpaceChatTyping}
        onReturnFocus={() => engineBridge.focusWorld()} /> : null}
      {worldReady ? <SpacePopover open={mapOpen} sheet={!desktop} onClose={() => { setMapOpen(false); engineBridge.focusWorld(); }}
        title={builtin?.kind === "campus" ? bt("캠퍼스 전체 지도", "Campus map") : bt("전체 지도", "Full map")}
        toggleSelector='[data-space-toggle="map"]' className="space-popover--map" focusFirst={false}>
        <SpaceMinimap manifest={worldManifest} self={snapshot.self} people={minimapPeople} currentRoomId={locationZone.roomId}
          variant="full" destination={moveDestination} onMoveTo={(point) => { setMapOpen(false); queuePathTo(point); }} />
      </SpacePopover> : null}
      <SpaceShortcutsHelp open={helpOpen} sheet={!desktop} onClose={() => setHelpOpen(false)} onReplayTour={replayMiniTour} />
      <SpacePopover open={searchOpen} sheet={!desktop} palette onClose={() => { setSearchOpen(false); engineBridge.focusWorld(); }}
        title={bt("방·팀원 찾기", "Find rooms & people")} className="space-palette--search" focusFirst={false}>
        {worldReady ? <StudioVirtualSpaceDirectory manifest={worldManifest} peers={snapshot.peers}
          onApproachPeer={approachOfficePeer} approachingPeerId={officeApproach.approachingPeerId} approachDisabled={!officeApproachEnabled}
          inputRef={spaceSearchRef} expanded onMove={(point) => { setSearchOpen(false); queuePathTo(point); }} onOpen={(action) => { setSearchOpen(false); activateAction(action); }}
          onSelectPeer={(id) => { setSearchOpen(false); handleEnginePeerSelect(id); }} />
          : <p role="status">{bt("공간 목록을 확인하는 중이에요.", "Checking the space directory.")}</p>}
      </SpacePopover>
      <SpacePopover open={mediaConsentOpen} sheet={!desktop} onClose={() => { setMediaConsentOpen(false); engineBridge.focusWorld(); }}
        title={bt("가까이 가면 영상으로 대화하기", "Video when you get close")} className="space-popover--consent">
        <SpaceProximityConsent radiusTiles={Math.round(SPACE_PROXIMITY_MEDIA_RADIUS / 32)}
          unavailableReason={proximityAvailable ? null : bt("팀원 연결을 확인하는 중이에요. 잠시 뒤 다시 시도해 주세요.", "Checking the teammate connection. Try again shortly.")}
          onStart={(capture) => { setMediaConsentOpen(false); proximity.start(capture); engineBridge.focusWorld(); }}
          onCancel={() => { setMediaConsentOpen(false); engineBridge.focusWorld(); }} />
      </SpacePopover>
      <SpacePopover open={coworkOpen} sheet={!desktop} onClose={() => { setCoworkOpen(false); engineBridge.focusWorld(); }}
        title={bt("같이 작업하기", "Work together")} className="space-popover--cowork">
        <SpaceCoworkSheet peers={personal ? [] : coworkPeers} targetId={coworkTargetId} disabledReason={socialDisabledReason}
          links={coworkLinks} onSelectTarget={setCoworkTargetId} onRequest={requestCowork}
          onApproach={(id) => { setCoworkOpen(false); approachOfficePeer(id); }}
          onOpenTeam={() => { setCoworkOpen(false); setPanel(personal ? "people" : "team"); }} />
      </SpacePopover>
      {pendingInteraction ? <StudioVirtualSpaceActionSheet
        interaction={pendingInteraction}
        room={roomById.get(pendingInteraction.zoneId)}
        actions={studioSpatialActions(pendingInteraction, roomById.get(pendingInteraction.zoneId), spatialContext)}
        phase={interactionState.phase}
        selectedActionId={interactionState.actionId as StudioSpatialActionId | null}
        onChoose={handleSpatialAction}
        onConfirm={confirmSpatialAction}
        onClose={closePendingInteraction}
        modal={!desktop}
      /> : null}
      {dialogueNpc ? <StudioVirtualSpaceNpcDialoguePanel
        npc={dialogueNpc}
        room={roomById.get(dialogueNpc.roomId)}
        operations={operations.snapshot}
        peers={snapshot.peers}
        artStyle={artStyle}
        dialogueScale={experiencePreference.dialogueScale}
        ttsEnabled={experiencePreference.ttsEnabled}
        onDialogueScale={(dialogueScale) => selectExperiencePreference({ ...experiencePreference, dialogueScale })}
        onAction={handleNpcDialogueAction}
        onClose={closeDialogue}
        modal={!desktop}
        personal={personal}
        roomInteractions={dialogueRoomInteractions}
      /> : null}
      {authoringMode && worldReady ? <div className="space-hud__authoring">
        <Suspense fallback={<p role="status">{bt("공간 편집기 불러오는 중…", "Loading world editor…")}</p>}><StudioWorldAuthoringEntry
          projectId={projectId}
          basePublishedRevisionId={draftBaseRevision}
          disabled={publication.enabled && (["reading", "publishing", "preparing"].includes(publication.snapshot.phase) || !publication.snapshot.viewVerified)}
          manifest={authoringDraft}
          onChange={setAuthoringDraft}
          onReset={resetAuthoringManifest}
        /></Suspense>
      </div> : null}
    </div>
  );
}

export function StudioVirtualSpacePage({ projectIdOverride, homeHeader, personal = false }: { readonly projectIdOverride?: string; readonly homeHeader?: ReactNode; readonly personal?: boolean } = {}) {
  const bt = useBilingual("StudioVirtualSpacePage");
  const { projectId = "" } = useParams<{ projectId: string }>();
  const decodedProjectId = projectIdOverride ?? decodeProjectId(projectId);
  const location = useLocation();
  const initialEntryPreference = useMemo(() => readStudioVirtualSpaceEntryPreference(), []);
  const [entryAvatarIndex, setEntryAvatarIndex] = useState(initialEntryPreference.avatarIndex);
  const [entryArtStyle, setEntryArtStyle] = useState<StudioVirtualArtStyleKey>(() => readStudioVirtualArtStyle());
  const [entryNickname, setEntryNickname] = useState(initialEntryPreference.nickname);
  const [entryOpen, setEntryOpen] = useState(() =>
    !initialEntryPreference.confirmed || new URLSearchParams(location.search).get("lobby") === "1",
  );
  const session = useSession();
  const guestInvite = useMemo(() => parseStudioGuestInviteFragment(location.hash), [location.hash]);
  const [guestSession, setGuestSession] = useState<StudioGuestSession | null>(() => readStudioGuestSession());
  const isGuest = !personal && session.ready && !session.data
    && (guestInvite.token !== null || guestSession !== null);
  const userId = session.data?.user.id ?? null;
  const accountNickname = studioVirtualSpaceNicknameFromAccount(session.data?.user.name);
  useEffect(() => {
    if (entryNickname.trim()) return;
    setEntryNickname(accountNickname ?? bt("크리에이터", "Creator"));
  }, [accountNickname, bt, entryNickname]);
  const publication = useStudioWorldPublication(decodedProjectId, userId, !entryOpen && !personal && session.ready && Boolean(userId)
    && validProjectId(decodedProjectId) && !/^(?:virtual-demo|draft|local)(?:$|[:_-])/u.test(decodedProjectId));
  const transportFactory = useStudioLiveTransportAuth({
    authReady: !entryOpen && session.ready && !personal,
    userId: personal ? null : userId,
  });
  const publicNickname = normalizeStudioVirtualSpaceNickname(entryNickname)
    ?? accountNickname
    ?? bt("게스트 크리에이터", "Guest creator");
  const participant = useMemo(() => {
    if (personal || !session.ready || !transportFactory) return null;
    return {
      displayName: publicNickname,
      role: session.data ? "editor" as const : "viewer" as const,
    };
  }, [personal, publicNickname, session.data, session.ready, transportFactory]);

  useDocumentTitle(`${personal ? bt("나의 스튜디오", "My studio") : bt("협업 스튜디오", "Collaboration Studio")} · ToonStudio`);

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

  if (entryOpen) {
    const guestMode = isGuest;
    return <StudioVirtualSpaceEntryLobby
      avatarIndex={guestMode ? 0 : entryAvatarIndex}
      artStyle={entryArtStyle}
      nickname={entryNickname}
      returning={initialEntryPreference.confirmed && !guestMode}
      personal={personal}
      guestMode={guestMode}
      projectName={personal ? bt("나의 스튜디오", "My studio") : decodedProjectId}
      onAvatarIndex={setEntryAvatarIndex}
      onArtStyle={setEntryArtStyle}
      onNickname={setEntryNickname}
      onEnter={() => {
        const resolvedNickname = normalizeStudioVirtualSpaceNickname(entryNickname);
        if (!resolvedNickname) return;
        if (guestMode && guestInvite.token) {
          const guest = createStudioGuestSession({
            token: guestInvite.token,
            spaceId: decodedProjectId,
            nickname: resolvedNickname,
            spawn: guestInvite.spawn,
          });
          writeStudioGuestSession(guest);
          setGuestSession(guest);
          setEntryNickname(resolvedNickname);
          setEntryOpen(false);
          return;
        }
        if (!validStudioVirtualSpaceAvatarIndex(entryAvatarIndex)) return;
        setEntryNickname(resolvedNickname);
        void writeStudioVirtualSpaceEntryPreference(entryAvatarIndex, resolvedNickname);
        void writeStudioVirtualArtStyle(entryArtStyle);
        setEntryOpen(false);
      }}
    />;
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
        initialAvatarIndexOverride={isGuest ? 0 : entryAvatarIndex}
        initialArtStyleOverride={entryArtStyle}
        nickname={publicNickname}
        onNicknameChange={(value) => {
          const resolvedNickname = normalizeStudioVirtualSpaceNickname(value);
          if (!resolvedNickname) return;
          setEntryNickname(resolvedNickname);
          if (validStudioVirtualSpaceAvatarIndex(entryAvatarIndex)) {
            void writeStudioVirtualSpaceEntryPreference(entryAvatarIndex, resolvedNickname);
          }
        }}
        homeHeader={homeHeader}
        personal={personal}
        preparing={!personal && (!session.ready || !transportFactory)}
        signedIn={!personal && Boolean(session.data)}
        isGuest={isGuest}
        guestSpawn={guestSession?.spawn ?? guestInvite.spawn}
        entryJustConfirmed={!initialEntryPreference.confirmed}
      />
    </StudioLiveCollaborationProvider>
  );
}

export default StudioVirtualSpacePage;
