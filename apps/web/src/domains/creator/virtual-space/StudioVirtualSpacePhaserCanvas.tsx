import { studioVisibleBootDeadline } from "./experience/studio-visible-boot-deadline";
import { studioCinematicBackdropUrl } from "./experience/studio-cinematic-art";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  StudioFixedStepClock, StudioFixedStepPose, StudioPeerTimeline, STUDIO_CHARACTER_FOOT_ORIGIN,
  studioGaitFrame, studioStableFacing, studioRenderViewport, studioCameraLerp, studioCoverRect,
} from "./studio-virtual-space-presentation";
import {
  StudioNpcDirector, studioNpcActivityLabel, studioNpcInteraction, studioNpcLabel, studioNpcRole,
  type StudioNpcAtmosphere, type StudioNpcPhase,
} from "./studio-virtual-space-npc-director";
import type { StudioVirtualNpcGuideTourRequest, StudioVirtualNpcGuideTourState } from "./studio-virtual-space-npc-guide";
import { steerStudioWorldCruise } from "./studio-virtual-space-path-steering";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  EMPTY_STUDIO_WORLD_APPROACH,
  EMPTY_STUDIO_WORLD_WALK_OVER,
  StudioWorldPortalTracker,
  StudioWorldZoneTracker,
  resolveStudioWorldPortalArrival,
  resolveStudioWorldUnstuck,
  resolveStudioWorldZonePresence,
  stepStudioWorldInteractionApproach,
  stepStudioWorldWalkOver,
  studioWorldFloorFocusTarget,
  studioWorldHasModalBlocker,
  studioWorldInputBlocked,
  studioWorldPresenceZone,
  studioWorldPromptInteractGate,
  type StudioWorldApproachState,
  type StudioWorldWalkOverState,
} from "./studio-virtual-space-runtime-policy";
import { resolveStudioFollowStandOffPx } from "./studio-virtual-space-follow";

import { readStudioVirtualSpaceGamepadsInput } from "./studio-virtual-space-gamepad";
import {
  STUDIO_VIRTUAL_SPACE_WALK_SPEED,
} from "./studio-virtual-space-navigation";
import {
  DEFAULT_STUDIO_MOTION_CONFIG,
} from "./studio-virtual-space-motion";
import { DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG } from "./studio-virtual-space-physics";
import {
  createStudioFacingTurnState,
  facingAngleFromVelocity,
  locomotionSquashStretch,
  shortestAngleDelta,
  stepTurnAngleSmooth,
  turnSlowdownFactor,
} from "./studio-virtual-space-locomotion-feel";
import { StudioMotionEaser } from "./studio-virtual-space-motion-easing";
import {
  advanceBreathPhase,
  advanceWalkPhase,
  applyCameraDeadzone,
  breathOffset,
  dampPeerOffset,
  nextLocomotionMode,
  STUDIO_CAMERA_DEADZONE_RADIUS,
  turnLeanAngle,
  type StudioLocomotionMode,
} from "./studio-virtual-space-locomotion-transitions";
import { buildMovePathDisplay } from "./studio-virtual-space-move-path-display";
import {
  studioDayNightAmbientAt,
  studioDayNightTimeOfDay,
  studioDayNightTintAlpha,
} from "./studio-virtual-space-day-night-cycle";
import {
  studioGhostCollisionOverrides,
  studioGhostSeekInput,
  STUDIO_GHOST_SPRITE_ALPHA,
  STUDIO_GHOST_TOGGLE_KEY,
} from "./studio-virtual-space-ghost-mode";
import { buildStudioLocateGuide } from "./studio-virtual-space-locate-guide";
import {
  buildStudioMotionRequest,
  neutralStudioMotionRequest,
  type StudioMotionRequest,
} from "./studio-virtual-space-motion-api";
import type { StudioSpacePose } from "./studio-virtual-space-pose-controller";
import {
  createMotionStateMachine,
  motionOneShotFinished,
  requestMotionState,
  sampleMotionRender,
  type StudioMotionKind,
  type StudioMotionState,
} from "./studio-virtual-space-character-motion";
import {
  customSpriteSheetSkin,
  getActiveSpriteSheetConfig,
  onSpriteSheetConfigChanged,
} from "./studio-virtual-space-sprite-sheet";
import {
  STUDIO_CHARACTER_SKINS,
  resolveStudioCharacterAppearance,
  studioCharacterSkinForArtStyle,
  studioCharacterWalkClip,
  studioCharacterActionClip,
  type StudioCharacterMotionState,
  type StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";
import { STUDIO_NPC_CAST, studioNpcCastSkinByKey, studioProceduralNpcSkinByKey } from "./studio-virtual-space-npc-cast";
import {
  DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  studioVirtualArtObjectUrl,
  studioVirtualArtStyle,
  studioVirtualArtTextureUrl,
  studioVirtualLivingTownAssetUrl,
  type StudioVirtualArtStyleKey,
} from "./studio-virtual-space-art-style";
import { drawStudioModularCampus } from "./studio-virtual-space-modular-campus";
import { studioIllustratedPropFrame, studioRenderedTileWorld } from "./studio-virtual-space-scene-direction";
import { studioExperienceAssetUrl, studioExperienceAtlas, studioExperienceFrameGeometry } from "./studio-virtual-space-experience-art";
import { STUDIO_EXPERIENCE_ATLAS, STUDIO_ACTOR_EXPRESSION_PRESENTATION, registerStudioSceneAtlas,
  StudioVirtualSetDressingRuntime, studioSceneActorScale, studioSceneOverlayScale } from "./studio-virtual-space-scene-art-runtime";
import { studioVirtualWorldSetDressing } from "./studio-virtual-space-world-set-dressing";
import { studioVirtualWorldKind } from "./studio-virtual-space-world-presentation";
import { applyStudioWorldCamera, fitStudioHorizonArtwork } from "./studio-virtual-space-world-camera";
import { StudioCampusRuntime, createStudioCampusRuntimeFrame, type StudioCampusRuntimeFrame } from "./studio-virtual-space-campus-runtime";
import { studioVirtualCampusScene } from "./studio-virtual-space-campus-world";
import {
  StudioWorldPromptRuntime, studioWorldMarkerVisible, studioWorldPromptTarget, type StudioWorldPromptCandidate,
} from "./studio-virtual-space-world-prompt";
import { studioCharacterExpressionFrame } from "./studio-virtual-space-expressions";
import { studioProjectTownPoint, studioTownDepthForPoint } from "./studio-virtual-space-semantic-world";
import {
  StudioLivingWorldRuntime,
  queueStudioLivingWorldTextures,
  studioLivingWorldTextureKeys,
  studioVirtualDayPhase,
  studioVirtualTerrainAt,
} from "./studio-virtual-space-living-world";
import {
  queueStudioAmbienceTextures,
  studioAmbienceCondition,
  StudioVirtualAmbienceRenderRuntime,
} from "./studio-virtual-space-ambience-render";
import { StudioWorldObjectRuntime } from "./studio-virtual-space-object-runtime";
import { createStudioWorldTileRuntime, type StudioWorldTileRuntime } from "./studio-virtual-space-tile-runtime";
import { StudioTileEffectRuntimeTracker } from "./studio-virtual-space-tile-effect-runtime";
import type { StudioTileEffectDefinition, StudioTileEffectTrigger } from "./studio-virtual-space-tile-effects";
import { studioVirtualPlaceTileAssetUrl } from "./studio-virtual-space-place-world";
import { studioWorldPointInsideOcclusionPolygon } from "./studio-virtual-space-occlusion";
import { StudioVirtualDecorationRuntime } from "./studio-virtual-space-decoration-runtime";
import { StudioDeskPodRuntime } from "./studio-virtual-space-desk-pods";
import { studioRuntimeBudget, studioTownInterestSnapshot } from "./studio-virtual-space-town-program";
import type { StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import { studioVirtualDecorationNavigationWorld, studioVirtualDecorationStateForWorld } from "./studio-virtual-space-decoration-layout";
import { StudioCameraFollowModeController, studioGaitBodyOffset, studioGaitShadowScale, studioPlayerLocomotionProfile } from "./studio-virtual-space-locomotion-presentation";
import {
  DEFAULT_STUDIO_VIRTUAL_EXPERIENCE,
  type StudioVirtualExperiencePreference,
} from "./studio-virtual-space-experience-preference";
import {
  DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT,
  type StudioVirtualEnvironmentPreference,
} from "./studio-virtual-space-environment-preference";
import {
  StudioVirtualAdaptiveQualityController,
  studioVirtualAutomaticQualityTier,
  studioVirtualQualityProfile,
} from "./studio-virtual-space-quality";
import {
  sanitizeStudioVirtualRuntimeMetrics,
  type StudioVirtualRuntimeMetrics,
} from "./studio-virtual-space-observability";
import {
  layoutStudioVirtualNameplates,
  studioVirtualNameplatePresentation,
  type StudioVirtualNameplateStatus,
} from "./studio-virtual-space-nameplate-layout";
import {
  studioTownEnvironmentInteractions,
} from "./studio-virtual-space-town-layout";
import {
  StudioCharacterAssetResidency,
  studioCharacterFrameGeometry,
  studioCharacterActionTextureKey,
  studioCharacterActionFrame,
  studioCharacterActionSheetMatches,
  studioCharacterPoseTextureKey,
  studioCharacterPoseSheetMatches,
  studioCharacterTextureSheetMatches,
  studioCharacterStaticAsset,
  studioCharacterStaticSheetMatches,
  studioCharacterVisualAssets,
  studioCharacterWalkAnimationKey as walkAnimationKey,
  studioCharacterWalkTextureKey as walkSheetKey,
} from "./studio-virtual-space-character-assets";
import type {
  StudioVirtualSpaceFacing,
  StudioVirtualSpacePeer,
  StudioVirtualSpacePoint,
} from "./studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import {
  StudioStuckDetector,
  StudioZoneChangeTracker,
  studioNearbyNpcCandidates,
  studioNearbyNpcIdsKey,
  type StudioSpaceUiEvent,
  type StudioVirtualSpaceEngineStatus,
  type StudioVirtualSpaceNearbyNpc,
  type StudioVirtualSpaceZoneChange,
} from "./studio-virtual-space-engine-events";
import { StudioWorldEventFeed, StudioWorldFeelController } from "./studio-virtual-space-world-feel";
import {
  StudioMotionFeelRuntime, createStudioMotionFeelFrame, studioCampusFloorSurface, studioMotionFeelTerrainSurface,
} from "./studio-virtual-space-motion-feel-runtime";
import { studioPresenceEmoteBob, studioPresenceEmoteIndicator, studioPresenceEmoteParticleColor, studioPresenceEmoteReaction } from "./studio-virtual-space-presence-emote";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import {
  StudioEmoteRuntime, StudioSpeechBubbleRuntime, studioCanvasBubbleColors, studioCanvasNameplateColors, studioColorHex,
  type StudioEmotePose,
} from "./studio-virtual-space-emote-runtime";
import { StudioNpcChatterScheduler, type StudioNpcChatterActor, type StudioNpcSpeechBubble } from "./studio-virtual-space-npc-chatter";
import {
  studioWorldCollisionRects,
  studioWorldInteractions,
  studioWorldPropDepth,
  studioWorldPortals,
  studioWorldRoomAt,
  studioWorldSpawn,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldNpcDefinition,
  type StudioWorldPortalDefinition,
  type StudioWorldPropDefinition,
} from "./studio-virtual-space-world-manifest";
import {
  findStudioWorldPath,
  resolveStudioWorldSpawn,
  studioWorldCanOccupy,
  STUDIO_WORLD_PLAYER_RADIUS,
} from "./studio-virtual-space-world-pathfinding";
import {
  createStudioInteractionMarkers, createStudioPortalGateways, drawStudioPrivateZoneOverlay, drawStudioWorldDebugOverlay,
} from "./studio-virtual-space-world-overlays";

export interface StudioVirtualSpaceEngineLocalState {
  readonly point: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly moving: boolean;
  readonly zoneId: string;
  /** 아바타 자세 (서기/앉기/눕기). 피어 동기화·HUD 표시에 쓴다. */
  readonly pose?: StudioSpacePose;
}

export interface StudioVirtualSpacePhaserCanvasProps {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  /** Decoded publication bytes, owned and disposed by the publication controller. */
  readonly worldAssetUrls?: ReadonlyMap<string, string>;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly selfIdentity?: string;
  readonly selfDisplayName?: string;
  /** AUTO in product; Canvas is useful for lifecycle-only browser harnesses. */
  readonly renderer?: "auto" | "webgl" | "canvas";
  readonly debugWorld?: boolean;
  readonly atmosphere?: StudioNpcAtmosphere;
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly decorations?: StudioVirtualDecorationState;
  readonly experiencePreference?: StudioVirtualExperiencePreference;
  readonly environmentPreference?: StudioVirtualEnvironmentPreference;
  readonly onRuntimeMetrics?: (metrics: StudioVirtualRuntimeMetrics) => void;
  readonly selfPose?: { readonly state: "sit"; readonly facing: StudioVirtualSpaceFacing };
  readonly waveActorIds?: readonly string[];
  /** Membership/lease authority belongs to the caller. Anchor attaches the rendered hips only. */
  readonly seatedActors?: readonly { readonly id: string; readonly anchorPoint: StudioVirtualSpacePoint; readonly facing: StudioVirtualSpaceFacing }[];
  readonly onNpcInteract?: (interaction: StudioWorldInteractionDefinition, npc: StudioWorldNpcDefinition) => void;
  readonly guideTourRequest?: StudioVirtualNpcGuideTourRequest | null;
  readonly onGuideTourChange?: (state: StudioVirtualNpcGuideTourState) => void;
  readonly onLocalState: (state: StudioVirtualSpaceEngineLocalState) => void;
  readonly onInteract: (interaction: StudioWorldInteractionDefinition | null) => void;
  readonly onNearbyInteractionChange?: (interaction: StudioWorldInteractionDefinition | null) => void;
  readonly onPeerSelect: (sessionId: string) => void;
  readonly onCancelFollow: () => void;
  readonly onPortal?: (portal: StudioWorldPortalDefinition) => void;
  /** roomId나 privateZone이 바뀔 때만 호출한다. 준비 직후 1회는 reason "initial". */
  readonly onZoneChange?: (zone: StudioVirtualSpaceZoneChange) => void;
  /** 반경 180px, 가까운 순 최대 3명. id 집합이 바뀔 때만 호출한다. */
  readonly onNearbyNpcsChange?: (npcs: readonly StudioVirtualSpaceNearbyNpc[]) => void;
  /** 방향 입력을 1.5초 유지해도 4px 미만 이동했거나 점유 불가 위치를 보정하면 true. 다시 움직이면 false. */
  readonly onStuckChange?: (stuck: boolean) => void;
  /** 고스트 모드 토글 알림 (G 키). HUD 표시용. */
  readonly onGhostModeChange?: (enabled: boolean) => void;
  readonly onEngineStatusChange?: (status: StudioVirtualSpaceEngineStatus) => void;
  /** 이벤트 디렉터(근접 트리거·NPC 인사·동료 접근·타운 이벤트)의 UI 이벤트. 이벤트마다 한 번 호출한다. */
  readonly onSpaceUiEvent?: (event: StudioSpaceUiEvent) => void;
  /** 저작된 타일 이펙트 배치. 캔버스가 매 프레임 진입 판정을 소비한다. */
  readonly tileEffects?: readonly StudioTileEffectDefinition[];
  /** 타일 이펙트에 새로 진입했을 때만 호출한다. 같은 타일에 머물면 반복하지 않는다. */
  readonly onTileEffectTrigger?: (trigger: StudioTileEffectTrigger) => void;
}

/** main 캔버스 호환: Page가 이 모듈에서 이벤트 타입을 가져온다. */
export type { StudioSpaceUiEvent };

interface InputEventLike {
  stopPropagation(): void;
}

interface PeerVisual {
  readonly timeline: StudioPeerTimeline;
  readonly sprite: import("phaser").GameObjects.Sprite;
  readonly label: import("phaser").GameObjects.Text;
  /** 마지막으로 재생한 리액션(id@만료 시각). 같은 이모트를 다시 보내면 만료 시각이 바뀌어 다시 재생한다. */
  emoteKey: string;
  displayName: string;
  targetX: number;
  targetY: number;
  avatarIndex: number;
  appearance?: StudioVirtualSpacePeer["state"]["appearance"];
  facing: StudioVirtualSpaceFacing;
  moving: boolean;
  activity: StudioVirtualSpacePeer["state"]["activity"];
  nearby: boolean;
  /** 프레즌스 명시 상태(회의 중·휴식 중 등). 이름표 상태를 덮어쓴다. */
  userStatus?: StudioVirtualSpacePeer["state"]["userStatus"];
  /** 프레즌스 지속 이모트(main StudioEmoteKind). 바뀌는 순간 말풍선·파티클을 재생하고 지속 중에는 몸을 띄운다. */
  presenceEmote: string | null;
  /** 프레즌스 말풍선(짧은 채팅). 머리 위 사람 말풍선으로 보인다. */
  bubble?: string | null;
}

/** 대상 쪽을 보는 방향(객체를 만들지 않는다). 가로가 더 멀면 좌우, 아니면 상하. */
function studioFacingToward(dx: number, dy: number): StudioVirtualSpaceFacing {
  return Math.abs(dx) > Math.abs(dy) ? dx < 0 ? "left" : "right" : dy < 0 ? "up" : "down";
}

/** NPC가 다가온 사람을 돌아보는 거리와, 같은 NPC가 다시 '!'로 반응하기까지의 간격. */
const NPC_LOOK_DISTANCE = 96;
const NPC_NOTICE_COOLDOWN_MS = 15_000;

interface OcclusionVisual {
  readonly polygon: readonly StudioVirtualSpacePoint[];
  readonly object: import("phaser").GameObjects.Image | import("phaser").GameObjects.Graphics;
  readonly outsideAlpha: number;
}

interface NpcVisual {
  readonly definition: StudioWorldNpcDefinition;
  readonly skin: StudioCharacterSkin;
  readonly sprite: import("phaser").GameObjects.Sprite;
  readonly label: import("phaser").GameObjects.Text;
  readonly shadow: import("phaser").GameObjects.Ellipse;
  phase: StudioNpcPhase;
  groundPoint: StudioVirtualSpacePoint;
}

function activityState(
  moving: boolean,
  nearby: boolean,
  activity: StudioVirtualSpacePeer["state"]["activity"],
): StudioCharacterMotionState {
  if (moving) return "walk";
  if (activity === "focused") return "draw";
  if (activity === "reviewing") return "review";
  if (nearby) return "talk";
  return "idle";
}

/** 브리지 요청과 프레즌스 스냅샷이 같은 이모트를 거의 동시에 알릴 때 하나로 합치는 간격. */
const STUDIO_EMOTE_DEDUPE_MS = 220;

/** 춤은 방향 프레임을 순환하고, 표정이 있는 이모트는 정면(down)을 보게 해 표정 시트를 쓴다. */
function studioEmoteFacing(pose: StudioEmotePose | null): StudioVirtualSpaceFacing | null {
  if (!pose) return null;
  return pose.facing ?? (pose.expression ? "down" : null);
}

/** 캔버스 포커스에서 월드가 소유하는 키. 1~9·Z·M·P 등 HUD 단축키는 여기에 넣지 않는다. */
const WORLD_KEY_CODES: ReadonlySet<string> = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "KeyE", "KeyX", "KeyG",
]);

/** 입력 요소나 편집 가능한 요소에 포커스가 있으면 월드가 포커스를 빼앗지 않는다. */
function studioWorldMayTakeFocus(active: Element | null, stage: Element | null): boolean {
  if (!active || active === document.body || active === document.documentElement) return true;
  if (active.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return false;
  return Boolean(stage?.contains(active));
}

function propTextureKey(prop: StudioWorldPropDefinition): string {
  return `studio-world-prop-${prop.assetKey ?? prop.id}`;
}

const EMPTY_DECORATIONS: StudioVirtualDecorationState = Object.freeze({
  presetKey: "minimal",
  districtKey: "story-terrace",
  presentationMode: "minimal",
  placements: Object.freeze([]),
  revision: 0,
});

function nearestInteraction(
  interactions: readonly StudioWorldInteractionDefinition[],
  point: StudioVirtualSpacePoint,
): StudioWorldInteractionDefinition | null {
  let nearest: StudioWorldInteractionDefinition | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const interaction of interactions) {
    const distance = Math.hypot(interaction.point.x - point.x, interaction.point.y - point.y);
    if (distance > interaction.radius || distance >= nearestDistance) continue;
    nearest = interaction;
    nearestDistance = distance;
  }
  return nearest;
}

export function StudioVirtualSpacePhaserCanvas({
  manifest,
  worldAssetUrls,
  snapshot,
  bridge,
  selfIdentity = "local",
  selfDisplayName = "Me",
  renderer = "auto",
  debugWorld = false,
  atmosphere = "balanced",
  artStyle = DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  decorations = EMPTY_DECORATIONS,
  experiencePreference = DEFAULT_STUDIO_VIRTUAL_EXPERIENCE,
  environmentPreference = DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT,
  onRuntimeMetrics,
  selfPose,
  waveActorIds = [],
  seatedActors = [],
  onNpcInteract,
  guideTourRequest = null,
  onGuideTourChange,
  onLocalState,
  onInteract,
  onNearbyInteractionChange,
  onPeerSelect,
  onCancelFollow,
  onPortal,
  onZoneChange,
  onNearbyNpcsChange,
  onStuckChange,
  onGhostModeChange,
  onEngineStatusChange,
  onSpaceUiEvent,
  tileEffects = [],
  onTileEffectTrigger,
}: StudioVirtualSpacePhaserCanvasProps) {
  const bt = useBilingual("StudioVirtualSpacePhaserCanvas");
  const btRef = useRef(bt);
  btRef.current = bt;
  const [failure, setFailure] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const atmosphereRef = useRef(atmosphere);
  atmosphereRef.current = atmosphere;
  const poseRef = useRef({ selfPose, waveActorIds, seatedActors });
  poseRef.current = { selfPose, waveActorIds, seatedActors };
  const decorationsRef = useRef(decorations);
  decorationsRef.current = decorations;
  const experienceRef = useRef(experiencePreference);
  experienceRef.current = experiencePreference;
  const environmentRef = useRef(environmentPreference);
  environmentRef.current = environmentPreference;
  const metricsCallbackRef = useRef(onRuntimeMetrics);
  metricsCallbackRef.current = onRuntimeMetrics;
  const guideTourRef = useRef(guideTourRequest);
  guideTourRef.current = guideTourRequest;
  const identityRef = useRef(selfIdentity);
  identityRef.current = selfIdentity;
  const displayNameRef = useRef(selfDisplayName);
  displayNameRef.current = selfDisplayName;
  const tileEffectsRef = useRef(tileEffects);
  tileEffectsRef.current = tileEffects;
  const tileTriggerCallbackRef = useRef(onTileEffectTrigger);
  tileTriggerCallbackRef.current = onTileEffectTrigger;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef(snapshot);
  const callbacksRef = useRef({
    onLocalState,
    onInteract,
    onNearbyInteractionChange,
    onNpcInteract,
    onGuideTourChange,
    onPeerSelect,
    onCancelFollow,
    onPortal,
    onZoneChange,
    onNearbyNpcsChange,
    onStuckChange,
    onGhostModeChange,
    onSpaceUiEvent,
  });
  const runtimeRef = useRef<{
    syncSnapshot: (next: StudioVirtualSpaceSnapshot) => void;
  } | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
    runtimeRef.current?.syncSnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => {
    callbacksRef.current = {
      onLocalState,
      onInteract,
      onNearbyInteractionChange,
      onNpcInteract,
      onGuideTourChange,
      onPeerSelect,
      onCancelFollow,
      onPortal,
      onZoneChange,
      onNearbyNpcsChange,
      onStuckChange,
      onGhostModeChange,
      onSpaceUiEvent,
    };
  }, [
    onCancelFollow,
    onInteract,
    onLocalState,
    onNearbyInteractionChange,
    onNpcInteract,
    onGuideTourChange,
    onPeerSelect,
    onPortal,
    onZoneChange,
    onNearbyNpcsChange,
    onStuckChange,
    onGhostModeChange,
    onSpaceUiEvent,
  ]);

  const engineStatus: StudioVirtualSpaceEngineStatus = failure ? "error" : ready ? "ready" : "loading";
  const engineStatusCallbackRef = useRef(onEngineStatusChange);
  engineStatusCallbackRef.current = onEngineStatusChange;
  useEffect(() => {
    engineStatusCallbackRef.current?.(engineStatus);
  }, [engineStatus]);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return undefined;

    parent.dataset.artStyle = artStyle;
    parent.dataset.bootStage = "waiting-frame";
    delete parent.dataset.engineError;
    delete parent.dataset.tileError;
    delete parent.dataset.sceneArt;
    const artProfile = studioVirtualArtStyle(artStyle);
    const mount = document.createElement("div");
    mount.className = "studio-vspace-engine-mount";
    parent.append(mount);
    setFailure(false);
    setReady(false);
    let cancelled = false;
    let sceneReady = false;
    let engineFailed = false;
    const cleanup: (() => void)[] = [];
    const fail = (reason?: unknown) => {
      if (cancelled) return;
      if (!engineFailed) parent.dataset.engineError = reason instanceof Error ? reason.message : "runtime-failure";
      engineFailed = true;
      bridge.clearMovement();
      setFailure(true);
      setReady(false);
    };
    const cancelBootDeadline = studioVisibleBootDeadline(document, () => fail(new Error(`boot-timeout:${parent.dataset.bootStage}`)));
    cleanup.push(() => cancelBootDeadline());
    let game: import("phaser").Game | null = null;

    void (async () => {
      // React StrictMode can destroy and recreate this WebGL game in the same task.
      // Yield one frame so Chromium releases the previous framebuffer before Phaser
      // allocates the replacement, and never let RESIZE observe a 0×0 mount.
      await new Promise<void>((resolve) => globalThis.requestAnimationFrame(() => resolve()));
      if (cancelled || !mount.isConnected) return;
      parent.dataset.bootStage = "loading-engine";
      const mountRect = parent.getBoundingClientRect();
      const reducedMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
      const qualityEnvironment = () => ({
        viewportWidth: parent.clientWidth,
        reducedMotion: reducedMotion.matches,
        deviceMemory: (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      let currentQualityProfile = studioVirtualQualityProfile(experienceRef.current.qualityPreset, qualityEnvironment());
      const adaptiveQuality = new StudioVirtualAdaptiveQualityController(currentQualityProfile.tier);
      let resizeRuntime: () => void = () => undefined;
      let lastMetricsAt = -Infinity;
      let lastQualityTier = currentQualityProfile.tier;
      let lastRequestedQualityPreset = experienceRef.current.qualityPreset;
      let viewport = studioRenderViewport(
        mountRect.width,
        mountRect.height,
        Math.min(globalThis.devicePixelRatio || 1, currentQualityProfile.dprCap),
      );
      mount.style.width = `${Math.max(1, Math.round(mountRect.width || parent.clientWidth || 1))}px`;
      mount.style.height = `${Math.max(1, Math.round(mountRect.height || parent.clientHeight || 1))}px`;

      const Phaser = await import("phaser");
      if (cancelled || !mount.isConnected) return;
      parent.dataset.bootStage = "preparing-scene";

      const scene = new Phaser.Scene("ToonStudioVirtualStudio") as import("phaser").Scene & {
        preload: () => void;
        create: () => void;
        update: (time: number, deltaMs: number) => void;
      };
      const peers = new Map<string, PeerVisual>();
      const npcs = new Map<string, NpcVisual>();
      let navigationWorld = studioVirtualDecorationNavigationWorld(manifest, decorationsRef.current);
      const npcDirector = new StudioNpcDirector(manifest);
      npcDirector.updateNavigationWorld(navigationWorld);
      cleanup.push(() => npcDirector.dispose());
      let lastGuideRequestId: string | null = null;
      let lastGuideState = "";
      const interactionMarkers = new Map<string, import("phaser").GameObjects.Container>();
      const occlusionVisuals: OcclusionVisual[] = [];
      const interactions = Object.freeze([
        ...studioWorldInteractions(manifest),
        ...(manifest.tilemap ? [] : studioTownEnvironmentInteractions()),
      ]) as readonly StudioWorldInteractionDefinition[];
      const portals = studioWorldPortals(manifest);
      const backgroundTextureKey = `studio-world-background-${manifest.backgroundAssetKey}-${artStyle}`;
      const backgroundUrl = studioVirtualArtTextureUrl(artStyle, "world-base");
      const horizonTextureKey = `studio-imagegen25-horizon-${artStyle}-${environmentPreference.backdrop}`;
      const horizonUrl = studioCinematicBackdropUrl(environmentPreference.backdrop, artStyle, studioSceneActorScale(manifest) < 1);
      const livingTextureKeys = studioLivingWorldTextureKeys(artStyle);
      const decorationTextureKeys = {
        decor: `studio-living-${artStyle}-decor`,
        accessory: `studio-living-${artStyle}-accessory`,
        furniture: `studio-experience-v8-furniture-${artStyle}`,
        cat: "studio-experience-v8-cat",
        illustratedFurniture: true,
        artStyle,
      } as const;
      const landmarksTextureKey = `studio-experience-v8-landmarks-${artStyle}`;
      const actorExpressionTextureKey = "studio-experience-v8-actor-expressions";
      const sceneArtAtlases = new Map([
        [decorationTextureKeys.furniture, studioExperienceAtlas("furniture", artStyle)],
        [landmarksTextureKey, studioExperienceAtlas("landmarks", artStyle)],
        [decorationTextureKeys.cat, STUDIO_EXPERIENCE_ATLAS],
        [actorExpressionTextureKey, STUDIO_EXPERIENCE_ATLAS],
      ]);
      const actorVisualScale = studioSceneActorScale(manifest);
      const playerLocomotion = studioPlayerLocomotionProfile(actorVisualScale < 1);
      const worldSetDressing = studioVirtualWorldSetDressing(manifest);
      const objectTextureKeys = {
        door: `studio-object-${artStyle}-door`,
        crate: `studio-object-${artStyle}-crate`,
        lantern: `studio-object-${artStyle}-lantern`,
        bench: `studio-object-${artStyle}-bench`,
      } as const;
      const portalTracker = new StudioWorldPortalTracker();
      const zoneTracker = new StudioWorldZoneTracker();
      const failedTextures = new Set<string>();
      const fallbackAsset = studioCharacterStaticAsset(studioCharacterSkinForArtStyle(STUDIO_CHARACTER_SKINS[0]!, artStyle), "down");
      const npcFallbackAsset = studioCharacterStaticAsset(studioCharacterSkinForArtStyle(STUDIO_NPC_CAST[0]!, artStyle), "down");
      const npcBootAssets = manifest.npcs.map((definition) => studioCharacterStaticAsset(
        studioNpcCastSkinByKey(definition.skinKey, artStyle),
        definition.facing ?? "down",
      ));
      // 커스텀 스프라이트 시트가 활성 상태면 로컬 아바타 스킨을 교체한다 (피어는 그대로).
      const initialSheetConfig = getActiveSpriteSheetConfig();
      /** 활성 커스텀 스프라이트 시트 스킨 (로컬 전용). 없으면 프로시저럴 스킨을 쓴다. */
      let selfCustomSheetSkin: StudioCharacterSkin | null =
        initialSheetConfig ? customSpriteSheetSkin(initialSheetConfig) : null;
      const bootSelfSkin = selfCustomSheetSkin
        ?? studioCharacterSkinForArtStyle(resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current).skin, artStyle);
      const bootSelfAsset = studioCharacterStaticAsset(bootSelfSkin, snapshotRef.current.self.facing);
      const prepareCharacterTexture = (asset: ReturnType<typeof studioCharacterStaticAsset>) => {
        if (!scene.textures.exists(asset.key)) return false;
        if (asset.type !== "spritesheet") return true;
        const texture = scene.textures.get(asset.key);
        const source = texture.getSourceImage();
        const valid = studioCharacterTextureSheetMatches(asset, source.width, source.height)
          && (!asset.atlas?.slicing || registerStudioSceneAtlas(texture, asset.atlas));
        if (!valid) { failedTextures.add(asset.key); scene.textures.remove(asset.key); }
        return valid;
      };
      const queueCharacterTexture = (asset: ReturnType<typeof studioCharacterStaticAsset>) => {
        if (asset.type === "spritesheet" && !asset.atlas?.slicing) {
          scene.load.spritesheet(asset.key, asset.url, { frameWidth: asset.frameWidth!, frameHeight: asset.frameHeight! });
        } else scene.load.image(asset.key, asset.url);
      };
      const characterAssets = new StudioCharacterAssetResidency({
        has: prepareCharacterTexture,
        load: (asset, complete) => {
          const loaderType = asset.atlas?.slicing ? "image" : asset.type;
          const event = `filecomplete-${loaderType}-${asset.key}`;
          const loaded = () => complete(prepareCharacterTexture(asset));
          const failed = (file: import("phaser").Loader.File) => {
            if (file.key === asset.key) complete(false);
          };
          scene.load.once(event, loaded);
          scene.load.on("loaderror", failed);
          queueCharacterTexture(asset);
          scene.load.start();
          return () => { scene.load.off(event, loaded); scene.load.off("loaderror", failed); };
        },
        remove: (asset) => {
          for (const key of asset.animationKeys ?? (asset.animationKey ? [asset.animationKey] : [])) {
            if (scene.anims.exists(key)) scene.anims.remove(key);
          }
          if (scene.textures.exists(asset.key)) scene.textures.remove(asset.key);
        },
      });
      cleanup.push(() => characterAssets.close());
      const interactionById = new Map(interactions.map((interaction) => [interaction.id, interaction] as const));

      let applyCameraMode: () => void = () => undefined;
      let focusWorldOnReady: () => void = () => undefined;
      let localPose = new StudioFixedStepPose(snapshotRef.current.self);
      const fixedStepClock = new StudioFixedStepClock();
      const cameraTarget = { x: snapshotRef.current.self.x, y: snapshotRef.current.self.y };
      let localDistance = 0;
      let previousRendered: StudioVirtualSpacePoint | null = null;
      let localBody: import("phaser").GameObjects.Zone | null = null;
      let localBodyPhysics: import("phaser").Physics.Arcade.Body | null = null;
      let localSprite: import("phaser").GameObjects.Sprite | null = null;
      let localShadow: import("phaser").GameObjects.Ellipse | null = null;
      let localLabel: import("phaser").GameObjects.Text | null = null;
      /** 로컬 캐릭터 모션 상태머신 (트랙1 소유: 블렌딩·렌더링. 전이 시점은 트랙3). */
      let localMotion: StudioMotionState = createMotionStateMachine("idle", 0);
      let emotes: StudioEmoteRuntime | null = null;
      /** 이름표 색은 CSS 토큰에서 읽는다(최소 11px). 내 이름표는 accent, NPC는 accent-2 글자. */
      const nameplateColors = studioCanvasNameplateColors(parent);
      const nameplateStyle = (kind: "peer" | "self" | "npc") => ({
        fontFamily: "Pretendard, Inter, sans-serif",
        fontSize: "11px",
        fontStyle: kind === "self" ? "bold" : "",
        color: studioColorHex(kind === "self" ? nameplateColors.selfText : kind === "npc" ? nameplateColors.npcText : nameplateColors.text),
        backgroundColor: `${studioColorHex(kind === "self" ? nameplateColors.self : nameplateColors.plate)}${kind === "self" ? "f0" : "e6"}`,
        padding: { x: 6, y: 3 },
      });
      const statusDots = new Map<string, import("phaser").GameObjects.Arc>();
      /** 상태가 있으면 이름표 왼쪽 안쪽에 색 점을 둔다. 글자 라벨이 같은 상태를 말하므로 색만으로 전달하지 않는다. */
      const syncStatusDot = (id: string, label: import("phaser").GameObjects.Text, status: StudioVirtualNameplateStatus | null) => {
        const padding = status ? "dot" : "plain";
        if (label.getData("statusPadding") !== padding) {
          label.setPadding(status ? 17 : 6, 3, 6, 3).setData("statusPadding", padding);
        }
        const existing = statusDots.get(id);
        if (!status) { existing?.setVisible(false); return; }
        const dot = existing ?? scene.add.circle(0, 0, 3.5, nameplateColors.status[status]);
        if (!existing) statusDots.set(id, dot);
        const scale = label.scaleX;
        dot.setFillStyle(nameplateColors.status[status], 1).setStrokeStyle(1, nameplateColors.plate, 0.9)
          .setScale(scale)
          .setPosition(label.x - label.displayWidth * label.originX + 9 * scale, label.y + label.displayHeight * (0.5 - label.originY))
          .setDepth(label.depth + 1).setAlpha(label.alpha).setVisible(label.visible);
      };
      let speech: StudioSpeechBubbleRuntime | null = null;
      /** NPC 대사·이모트 반응은 이 브라우저에서만 연출하고 프레즌스로 보내지 않는다. */
      const chatter = new StudioNpcChatterScheduler(manifest.id);
      let chatterBubbles: readonly StudioNpcSpeechBubble[] = [];
      /** 근처 NPC가 반응할 사람 이모트. point가 null이면 내 위치다(피어는 보낸 사람 위치). */
      const pendingEmoteReactions: { readonly emote: StudioSpaceEmoteId; readonly point: StudioVirtualSpacePoint | null }[] = [];
      const queueEmoteReaction = (emote: StudioSpaceEmoteId, point: StudioVirtualSpacePoint | null) => {
        if (pendingEmoteReactions.length < 16) pendingEmoteReactions.push({ emote, point });
      };
      /** update(time)의 rAF 시각. 스냅샷 동기화처럼 프레임 밖에서 시작한 이모트도 같은 시계를 쓴다(loop.time과 다르다). */
      let frameTime = 0;
      let lastSelfReaction: StudioVirtualSpaceSnapshot["selfReaction"] = snapshotRef.current.selfReaction;
      let path: readonly StudioVirtualSpacePoint[] = [];
      let approachState: StudioWorldApproachState = EMPTY_STUDIO_WORLD_APPROACH;
      let queuedInteraction: StudioWorldInteractionDefinition | null = null;
      let walkOverState: StudioWorldWalkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
      let queuedWalkOver: { id: string; point: StudioVirtualSpacePoint } | null = null;
      let campusRuntime: StudioCampusRuntime | null = null;
      let campusFrame: StudioCampusRuntimeFrame | null = null;
      let promptRuntime: StudioWorldPromptRuntime | null = null;
      let lastMarkerCullAt = -Infinity;
      let zoneVeil: import("phaser").GameObjects.Graphics | null = null;
      let highlightRing: import("phaser").GameObjects.Graphics | null = null;
      let routeOverlay: import("phaser").GameObjects.Graphics | null = null;
      let proximityOverlay: import("phaser").GameObjects.Graphics | null = null;
      /** 참가자 locate 안내선 오버레이. */
      let locateOverlay: import("phaser").GameObjects.Graphics | null = null;
      /** 주야 사이클·조명 전역 틴트 오버레이. */
      let lightingOverlay: import("phaser").GameObjects.Graphics | null = null;
      /** 고스트 모드에서 비활성화하는 물리 충돌기들. */
      const ghostColliders: import("phaser").Physics.Arcade.Collider[] = [];
      /** T8: 따라가기 벽 통과가 현재 물리 충돌기에 적용돼 있는지. */
      let followWallPassApplied = false;
      /** 이동 느낌 상태 (트랙3 locomotion-feel 연결). */
      let walkPhase = 0;
      let breathPhase = 0;
      let locomotionMode: StudioLocomotionMode = "idle";
      let turnState = createStudioFacingTurnState(0);
      /** 클릭 이동 목적지 마커 펄스 시작 시각. */
      let markerStartedAt = 0;
      /** 트랙1 모션 렌더러 연결 지점: 매 프레임 조립되는 모션 요청. */
      // 트랙1 모션 렌더러 핸드오프용: 매 프레임 최신 요청을 보관한다 (트랙1 API 연결 시 소비).
      let _lastMotionRequest: StudioMotionRequest = neutralStudioMotionRequest();
      let lastPublishedPose: StudioSpacePose = "stand";
      let motion = { velocity: { x: 0, y: 0 } };
      const motionEaser = new StudioMotionEaser();
      let facing: StudioVirtualSpaceFacing = snapshotRef.current.self.facing;
      let moving = false;
      let lastPublishAt = -Infinity;
      let lastDiagnosticAt = -Infinity;
      let lastAssetCollectionAt = -Infinity;
      let lastPublishedFacing = facing;
      let lastPublishedMoving = moving;
      let gamepadInteractHeld = false;
      const heldKeys = new Set<string>();
      let keyboardInteractQueued = false;
      let wasInputBlocked = false;
      let modalInputBlocked = studioWorldHasModalBlocker(document);
      let lastStopRevision = bridge.getStopRevision();
      let lastPosition: StudioVirtualSpacePoint | null = null;
      let lastMovedAt = -Infinity;
      let lastPublishedPoint: StudioVirtualSpacePoint | null = null;
      let nearbyInteractionId: string | null = null;
      let keys: Record<string, import("phaser").Input.Keyboard.Key> | null = null;
      let livingWorld: StudioLivingWorldRuntime | null = null;
      let ambienceRender: StudioVirtualAmbienceRenderRuntime | null = null;
      let tileWorld: StudioWorldTileRuntime | null = null;
      let initialTilesReady = false;
      const runtimeInputBlocked = () => engineFailed || (manifest.tilemap !== undefined && !initialTilesReady)
        || studioWorldInputBlocked(document, modalInputBlocked);
      let objectRuntime: StudioWorldObjectRuntime | null = null;
      let decorationRuntime: StudioVirtualDecorationRuntime | null = null;
      let setDressingRuntime: StudioVirtualSetDressingRuntime | null = null;
      let startOptionalSceneArt: (() => void) | null = null;
      const illustratedProps: Array<{ readonly image: import("phaser").GameObjects.Image; readonly frame: number;
        readonly width: number; readonly height: number; readonly originX: number; readonly originY: number }> = [];
      let deskPodRuntime: StudioDeskPodRuntime | null = null;
      let lastDecorationState = decorationsRef.current;
      let lastWalkablePoint: StudioVirtualSpacePoint = { x: snapshotRef.current.self.x, y: snapshotRef.current.self.y };
      const staticColliderObjects: import("phaser").GameObjects.GameObject[] = [];
      let lastFootstepDistance = 0;
      const stuckDetector = new StudioStuckDetector();
      const emitStuck = (changed: boolean) => { if (changed) callbacksRef.current.onStuckChange?.(stuckDetector.value); };
      const zoneChanges = new StudioZoneChangeTracker(manifest);
      // 타일 이펙트 실행 판정: 배치가 바뀌면 트래커를 새로 만들어 기준선을 다시 잡는다.
      let tileTracker = new StudioTileEffectRuntimeTracker({ effects: tileEffectsRef.current, officeZones: manifest.zones ?? [] });
      let tileTrackerEffects = tileEffectsRef.current;
      let nearbyNpcKey = "";
      // main 게임필 이식: 입력 감도·가속·끼임 탈출·충돌 흔들림·카메라 디렉터(world-feel), 발밑 연출(motion-feel),
      // 이벤트 디렉터(근접 트리거·NPC 인사·동료 접근 → onSpaceUiEvent). 매 프레임 객체를 만들지 않는다.
      const worldFeel = new StudioWorldFeelController();
      const motionFrame = createStudioMotionFeelFrame();
      let motionFeel: StudioMotionFeelRuntime | null = null;
      const eventFeed = new StudioWorldEventFeed(manifest, interactions, (event) => {
        if (import.meta.env.DEV) parent.dataset.spaceUiEvent = `${event.kind}:${event.titleKo}`.slice(0, 120);
        callbacksRef.current.onSpaceUiEvent?.(event);
      });
      const cameraGround = { x: 0, y: 0 };
      // 데드존이 비교할 직전 카메라 기준점(흔들림 제외). 첫 프레임은 NaN이라 목표를 그대로 따른다.
      const cameraBase = { x: Number.NaN, y: Number.NaN };
      // 캠퍼스 바닥 아틀라스만 재질 표를 알고 있다. 게시 월드의 다른 타일셋은 지형 분류를 쓴다.
      const campusFloorMap = studioVirtualCampusScene(manifest) ? manifest.tilemap ?? null : null;
      const motionConfig: { acceleration: number; deceleration: number; maxSpeed: number } = { ...DEFAULT_STUDIO_MOTION_CONFIG };
      let cameraBaseZoom = 1;
      let cameraFollows = true;
      let lastPromptNpcId: string | null = null;
      const npcNoticedAt = new Map<string, number>();

      const ensureWalkAnimation = (skin: StudioCharacterSkin, direction: StudioVirtualSpaceFacing) => {
        const clip = studioCharacterWalkClip(skin, direction);
        const key = walkSheetKey(skin, direction);
        if (!clip || cancelled || !scene.textures.exists(key) || scene.anims.exists(walkAnimationKey(skin, direction))) return;
        const texture = scene.textures.get(key);
        const source = texture.source[0];
        if (clip.atlas && (!source || !studioCharacterActionSheetMatches(clip, source.width, source.height))) return;
        if (!Number.isSafeInteger(clip.start) || !Number.isSafeInteger(clip.end)
          || clip.end < clip.start || clip.start < 0 || clip.end >= texture.frameTotal - 1) return;
        scene.anims.create({ key: walkAnimationKey(skin, direction), frames: scene.anims.generateFrameNumbers(key, { start: clip.start, end: clip.end }), frameRate: clip.frameRate, repeat: clip.repeat ?? -1 });
      };

      const updateDisplaySize = (sprite: import("phaser").GameObjects.Sprite) => {
        const presentation = sprite.getData("framePresentation") as Parameters<typeof studioCharacterFrameGeometry>[0];
        const geometry = studioCharacterFrameGeometry(presentation, sprite.frame.width, sprite.frame.height,
          Number(sprite.getData("visualWidth") ?? 92), Number(sprite.getData("visualHeight") ?? 123), Boolean(sprite.getData("seatAttached")));
        sprite.setDisplaySize(geometry.width, geometry.height).setOrigin(geometry.originX, geometry.originY);
      };
      const hasStaticAsset = (asset: ReturnType<typeof studioCharacterStaticAsset>) => {
        if (!scene.textures.exists(asset.key)) return false;
        const source = scene.textures.get(asset.key).source[0];
        return Boolean(source && studioCharacterStaticSheetMatches(asset, source.width, source.height));
      };
      const applySpriteVisual = (
        sprite: import("phaser").GameObjects.Sprite,
        skin: StudioCharacterSkin,
        nextFacing: StudioVirtualSpaceFacing,
        nextState: StudioCharacterMotionState,
      ) => {
        const owner = sprite.getData("assetOwner") as string;
        if (sceneReady && owner) characterAssets.use(owner, studioCharacterVisualAssets(skin, nextFacing, nextState), sprite.texture.key);
        if (sprite.getData("visualMotionState") !== nextState) {
          sprite.setData("visualMotionState", nextState).setData("visualStateStartedAt", scene.time.now);
        }
        const action = studioCharacterActionClip(skin, nextFacing, nextState);
        const actionKey = action ? studioCharacterActionTextureKey(skin, nextFacing, nextState) : null;
        const actionSource = actionKey && scene.textures.exists(actionKey) ? scene.textures.get(actionKey).source[0] : undefined;
        if (action && actionKey && scene.textures.exists(actionKey)
          && actionSource && studioCharacterActionSheetMatches(action, actionSource.width, actionSource.height)
          && action.end < scene.textures.get(actionKey).frameTotal - 1) {
          if (sprite.anims.isPlaying) sprite.stop();
          if (sprite.getData("actionKey") !== actionKey) {
            sprite.setData("actionKey", actionKey).setData("actionStartedAt", scene.time.now);
          }
          const frame = studioCharacterActionFrame(action, scene.time.now - Number(sprite.getData("actionStartedAt")), reducedMotion.matches);
          sprite.setTexture(actionKey, frame).setData("framePresentation", action.frames?.[frame - action.start]);
          updateDisplaySize(sprite);
          return;
        }
        sprite.setData("actionKey", null);
        sprite.setData("poseTextureUsed", false);
        // 손 인사는 전신 wave 포즈 시트를 표정 프레임보다 우선한다(몸 전체가 인사하는 편이 멀리서도 읽힌다).
        // 눕기(lie)도 포즈 텍스처가 등록되면(트랙1) 자동 사용, 없으면 idle 프레임+회전 폴백.
        const pose = nextState === "wave" || nextState === "sit" || nextState === "lie" ? skin.poses?.[nextState] : undefined;
        if (pose && (nextState === "wave" || nextState === "sit" || nextState === "lie")) {
          const poseKey = studioCharacterPoseTextureKey(skin, nextState);
          const poseSource = scene.textures.exists(poseKey) ? scene.textures.get(poseKey).getSourceImage() : undefined;
          if (poseSource && studioCharacterPoseSheetMatches(pose, poseSource.width, poseSource.height)) {
            if (sprite.anims.isPlaying) sprite.stop();
            const frame = pose.directionFrames[nextFacing];
            sprite.setTexture(poseKey, frame).setData("framePresentation", pose.frames[frame]);
            sprite.setData("poseTextureUsed", true);
            updateDisplaySize(sprite);
            return;
          }
        }
        const expression = artStyle === "sky-island" && scene.textures.exists(actorExpressionTextureKey)
          ? studioCharacterExpressionFrame({ skinKey: skin.key, time: scene.time.now,
            idleForMs: scene.time.now - Number(sprite.getData("visualStateStartedAt") ?? scene.time.now),
            moving: nextState === "walk", facing: nextFacing, reducedMotion: reducedMotion.matches,
            motionState: nextState, identity: owner,
            reaction: sprite.getData("actorReaction") as StudioVirtualSpaceSnapshot["selfReaction"] }) : null;
        if (expression !== null) {
          if (sprite.anims.isPlaying) sprite.stop();
          sprite.setTexture(actorExpressionTextureKey, expression).setData("framePresentation", STUDIO_ACTOR_EXPRESSION_PRESENTATION[expression]);
          updateDisplaySize(sprite);
          return;
        }
        if (nextState === "walk") {
          const clip = studioCharacterWalkClip(skin, nextFacing);
          const animationKey = walkAnimationKey(skin, nextFacing);
          ensureWalkAnimation(skin, nextFacing);
          if (clip && scene.anims.exists(animationKey)) {
            if (clip.distancePerCycle || reducedMotion.matches) {
              if (sprite.anims.isPlaying) sprite.stop();
              const frame = clip.start + (reducedMotion.matches ? 0 : studioGaitFrame(
                Number(sprite.getData("walkDistance") ?? 0), clip.end - clip.start + 1,
                (sprite.getData("gaitDistancePerCycle") as number | undefined) ?? clip.distancePerCycle,
              ));
              const sheet = walkSheetKey(skin, nextFacing);
              if (sprite.texture.key !== sheet || String(sprite.frame.name) !== String(frame)) sprite.setTexture(sheet, frame);
              sprite.setData("framePresentation", clip.frames?.[frame - clip.start]);
            } else {
              sprite.play(animationKey, true);
              sprite.setData("framePresentation", clip.frames?.[Number(sprite.frame.name) - clip.start]);
            }
            updateDisplaySize(sprite);
            return;
          }
        }
        if (sprite.anims.isPlaying) sprite.stop();
        const current = studioCharacterStaticAsset(skin, nextFacing, nextState);
        const standing = studioCharacterStaticAsset(skin, nextFacing);
        const asset = hasStaticAsset(current) ? current
          : hasStaticAsset(standing) ? standing
            : scene.textures.exists(sprite.texture.key) ? undefined : fallbackAsset;
        if (asset && scene.textures.exists(asset.key)) {
          // 걷기와 idle은 같은 텍스처여도 선택 프레임이 다르므로 반드시 함께 비교한다.
          if (sprite.texture.key !== asset.key || (asset.frame !== undefined && String(sprite.frame.name) !== String(asset.frame))) {
            sprite.setTexture(asset.key, asset.frame);
          }
          sprite.setData("framePresentation", asset.presentation);
        }
        updateDisplaySize(sprite);
      };

      const applyAvatarVisual = (
        sprite: import("phaser").GameObjects.Sprite,
        avatar: Pick<StudioVirtualSpacePeer["state"], "avatarIndex" | "appearance">,
        nextFacing: StudioVirtualSpaceFacing,
        nextState: StudioCharacterMotionState,
        identity?: string,
      ) => {
        // "lie"는 appearance clip 목록에 없다(트랙1이 lie 시트를 추가하면 연결).
        // resolver에는 "idle"로 요청하고, 비주얼 상태는 "lie"로 유지한다.
        const resolved = resolveStudioCharacterAppearance(avatar, identity,
          nextState === "walk" ? `walk-${nextFacing}` : nextState === "lie" ? "idle" : nextState);
        const state = nextState === "lie" ? "lie"
          : resolved.clip.startsWith("walk-") ? "walk" : resolved.clip as StudioCharacterMotionState;
        sprite.setData("appearanceIssues", resolved.issues);
        // 로컬 아바타는 활성 커스텀 시트 스킨을 우선한다 (피어는 프로시저럴 유지).
        const selfSkin = identity === identityRef.current ? selfCustomSheetSkin : null;
        applySpriteVisual(sprite, selfSkin ?? studioCharacterSkinForArtStyle(resolved.skin, artStyle), nextFacing, state);
      };

      const getPeerSnapshot = (id: string) =>
        snapshotRef.current.peers.find((peer) => peer.participant.sessionId === id);

      const setPathTo = (point: StudioVirtualSpacePoint) => {
        if (runtimeInputBlocked()) return;
        if (!localBody) return;
        markerStartedAt = Date.now();
        path = findStudioWorldPath(
          navigationWorld,
          { x: localBodyPhysics?.center.x ?? localBody.x, y: localBodyPhysics?.center.y ?? localBody.y },
          point,
        );
      };

      /** 월드 충돌기(벽·장애물) 활성/비활성. 고스트 모드와 따라가기 벽 통과가 공유한다. */
      const setWorldCollidersActive = (active: boolean) => {
        for (const collider of ghostColliders) collider.active = active;
      };

      /**
       * 고스트 모드 적용: 충돌기 비활성화(통과 이동) + 반투명.
       * 반투명은 트랙1이 ghost 플래그 렌더 API를 노출하면 그쪽으로 이관한다
       * (STUDIO_GHOST_SPRITE_ALPHA 값을 공유).
       * 고스트를 꺼도 따라가기 벽 통과 중이면 충돌기는 계속 비활성이다.
       */
      const applyGhostMode = (enabled: boolean) => {
        setWorldCollidersActive(!enabled && !followWallPassApplied);
        localSprite?.setAlpha(enabled ? STUDIO_GHOST_SPRITE_ALPHA : 1);
        callbacksRef.current.onGhostModeChange?.(enabled);
      };

      const syncPeer = (peer: StudioVirtualSpacePeer, nearby: boolean) => {
        const id = peer.participant.sessionId;
        let visual = peers.get(id);
        const state = activityState(peer.state.moving, nearby, peer.state.activity);
        const skin = studioCharacterSkinForArtStyle(resolveStudioCharacterAppearance(peer.state, id).skin, artStyle);
        const requestedPeerAsset = studioCharacterStaticAsset(skin, peer.state.facing, state);
        const peerInitialAsset = hasStaticAsset(requestedPeerAsset) ? requestedPeerAsset : fallbackAsset;
        if (!visual) {
          const sprite = scene.add.sprite(peer.state.x, peer.state.y, peerInitialAsset.key, peerInitialAsset.frame)
            .setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
            .setData({ visualWidth: 92 * actorVisualScale, visualHeight: 123 * actorVisualScale, assetOwner: `peer:${id}`,
              gaitDistancePerCycle: playerLocomotion.gaitDistancePerCycle })
            .setDisplaySize(92 * actorVisualScale, 123 * actorVisualScale)
            .setDepth(Math.round(peer.state.y) + 1_001)
            .setInteractive({ useHandCursor: true });
          sprite.on(
            "pointerdown",
            (
              _pointer: import("phaser").Input.Pointer,
              _localX: number,
              _localY: number,
              event: InputEventLike,
            ) => {
              event.stopPropagation();
              if (runtimeInputBlocked()) return;
              queuedWalkOver = { id, point: { x: sprite.x, y: sprite.y } };
              bridge.setFollowingPeer(id);
            },
          );
          const label = scene.add.text(peer.state.x, peer.state.y + 18, peer.participant.displayName, nameplateStyle("peer"))
            .setOrigin(0.5, 0).setDepth(Math.round(peer.state.y) + 1_002);
          visual = {
            timeline: new StudioPeerTimeline(),
            sprite,
            label,
            emoteKey: "",
            displayName: peer.participant.displayName,
            targetX: peer.state.x,
            targetY: peer.state.y,
            avatarIndex: peer.state.avatarIndex,
            appearance: peer.state.appearance,
            facing: peer.state.facing,
            moving: peer.state.moving,
            activity: peer.state.activity,
            nearby,
            presenceEmote: null,
          };
          peers.set(id, visual);
        }
        visual.timeline.push({
          x: peer.state.x,
          y: peer.state.y,
          at: peer.lastSeen,
          sequence: peer.sequence,
          moving: peer.state.moving,
          facing: peer.state.facing,
        });
        visual.displayName = peer.participant.displayName;
        visual.targetX = peer.state.x;
        visual.targetY = peer.state.y;
        visual.avatarIndex = peer.state.avatarIndex;
        visual.appearance = peer.state.appearance;
        visual.facing = peer.state.facing;
        visual.moving = peer.state.moving;
        visual.activity = peer.state.activity;
        visual.nearby = nearby;
        visual.userStatus = peer.state.userStatus;
        visual.bubble = peer.state.bubble ?? null;
        // main 프레즌스 지속 이모트: 바뀌는 순간 같은 뜻의 리액션 말풍선과 머리 위 파티클을 한 번 재생한다.
        const presenceEmote = peer.state.emote ?? null;
        if (presenceEmote !== visual.presenceEmote) {
          visual.presenceEmote = presenceEmote;
          const reaction = studioPresenceEmoteReaction(presenceEmote);
          if (reaction) emotes?.play(`peer:${id}`, reaction, frameTime);
          const color = studioPresenceEmoteParticleColor(presenceEmote);
          if (color !== null && !reducedMotion.matches) {
            motionFeel?.burst(visual.sprite.x, visual.sprite.y - visual.sprite.displayHeight * visual.sprite.originY - 6,
              visual.sprite.depth + 2, 6, color);
          }
        }
        applyAvatarVisual(visual.sprite, visual, visual.facing, state, id);
        visual.label.setText(peer.participant.displayName);
        visual.sprite.setAlpha(peer.state.activity === "away" ? 0.62 : 1);
      };

      const syncSnapshot = (next: StudioVirtualSpaceSnapshot) => {
        if (!sceneReady || cancelled) return;
        const nearby = new Set(next.nearbyPeers.map((peer) => peer.participant.sessionId));
        const present = new Set<string>();
        const reactionsBySession = new Map(next.peerReactions.map((item) => [item.sessionId, item] as const));
        const now = Date.now();
        for (const peer of next.peers) {
          const id = peer.participant.sessionId;
          present.add(id);
          syncPeer(peer, nearby.has(id));
          const reaction = reactionsBySession.get(id);
          const visual = peers.get(id);
          const key = reaction && reaction.expiresAt > now ? `${reaction.reaction}@${reaction.expiresAt}` : "";
          if (visual && key !== visual.emoteKey) {
            visual.emoteKey = key;
            if (reaction && key) {
              emotes?.play(`peer:${id}`, reaction.reaction, frameTime);
              queueEmoteReaction(reaction.reaction, { x: peer.state.x, y: peer.state.y });
            }
          }
        }
        for (const [id, visual] of peers) {
          if (present.has(id)) continue;
          visual.sprite.destroy();
          visual.label.destroy();
          statusDots.get(id)?.destroy();
          statusDots.delete(id);
          emotes?.remove(`peer:${id}`);
          speech?.remove(`peer:${id}`);
          decorationRuntime?.removeActor(id);
          peers.delete(id);
          characterAssets.release(`peer:${id}`);
        }
        if (localBody && localSprite && localBodyPhysics) {
          const distance = Math.hypot(next.self.x - localBody.x, next.self.y - localBody.y);
          if (!moving && distance > 96 && studioWorldCanOccupy(navigationWorld, next.self)) {
            localBody.setPosition(next.self.x, next.self.y);
            localBodyPhysics.reset(next.self.x, next.self.y);
            localPose.reset(next.self, fixedStepClock.time);
            lastWalkablePoint = { x: next.self.x, y: next.self.y };
            previousRendered = null;
          }
          applyAvatarVisual(
            localSprite,
            next.self,
            facing,
            activityState(moving, false, next.self.activity),
            identityRef.current,
          );
        }
        // 컨트롤러 경로(상호작용 보상 등)로만 바뀐 내 리액션도 머리 위에 보여 준다.
        // 같은 id를 bridge.requestEmote로 방금 재생했다면 두 번 재생하지 않는다.
        if (next.selfReaction !== lastSelfReaction) {
          lastSelfReaction = next.selfReaction;
          const clock = frameTime;
          if (next.selfReaction && emotes?.activeId("self", clock) !== next.selfReaction) {
            emotes?.play("self", next.selfReaction, clock, "person", STUDIO_EMOTE_DEDUPE_MS);
            queueEmoteReaction(next.selfReaction, null);
          }
        }
      };
      const runtime = { syncSnapshot };
      runtimeRef.current = runtime;

      scene.preload = function preload() {
        parent.dataset.bootStage = "loading-textures";
        this.load.on("loaderror", (file: import("phaser").Loader.File) => failedTextures.add(file.key));
        this.load.image(backgroundTextureKey, backgroundUrl);
        this.load.image(horizonTextureKey, horizonUrl);
        queueStudioLivingWorldTextures(this.load, livingTextureKeys, artStyle);
        queueStudioAmbienceTextures(this.load);
        this.load.spritesheet(decorationTextureKeys.decor, studioVirtualLivingTownAssetUrl(artStyle, "decor-sheet"), { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet(decorationTextureKeys.accessory, studioVirtualLivingTownAssetUrl(artStyle, "accessory-sheet"), { frameWidth: 96, frameHeight: 96 });
        this.load.image(objectTextureKeys.door, studioVirtualArtObjectUrl(artStyle, "door"));
        this.load.image(objectTextureKeys.crate, studioVirtualArtObjectUrl(artStyle, "crate"));
        this.load.image(objectTextureKeys.lantern, studioVirtualArtObjectUrl(artStyle, "lantern"));
        this.load.image(objectTextureKeys.bench, studioVirtualArtObjectUrl(artStyle, "bench"));

        // Ready means the world and a safe actor frame exist, not that every clip has downloaded.
        for (const asset of new Map([fallbackAsset, bootSelfAsset, npcFallbackAsset, ...npcBootAssets].map((item) => [item.key, item])).values()) {
          queueCharacterTexture(asset);
        }

        const loadedProps = new Set<string>();
        for (const prop of manifest.props) {
          if (!prop.assetUrl) continue;
          const key = propTextureKey(prop);
          if (loadedProps.has(key)) continue;
          loadedProps.add(key);
          this.load.image(key, worldAssetUrls?.get(prop.assetUrl) ?? studioVirtualPlaceTileAssetUrl(prop.assetUrl, artStyle));
        }
      };

      scene.create = function create() {
        if (cancelled || engineFailed) return;
        parent.dataset.bootStage = "creating-scene";
        for (const [key, atlas] of sceneArtAtlases) {
          if (this.textures.exists(key) && !registerStudioSceneAtlas(this.textures.get(key), atlas)) {
            failedTextures.add(key);
            this.textures.remove(key);
          }
        }
        for (const asset of [fallbackAsset, bootSelfAsset, npcFallbackAsset, ...npcBootAssets]) prepareCharacterTexture(asset);
        if ((!manifest.tilemap && failedTextures.has(backgroundTextureKey))
          || !this.textures.exists(fallbackAsset.key)) { fail(); return; }
        characterAssets.use("fallback", [fallbackAsset]);
        if (this.textures.exists(bootSelfAsset.key)) characterAssets.use("self", [bootSelfAsset]);
        // 커스터마이저에서 시트를 바꾸면 로컬 스킨을 교체하고 텍스처를 확보한다.
        // applyAvatarVisual이 다음 프레임부터 새 스킨을 쓴다.
        const disposeSpriteSheetListener = onSpriteSheetConfigChanged(() => {
          const config = getActiveSpriteSheetConfig();
          const next = config ? customSpriteSheetSkin(config) : null;
          if (next?.key === selfCustomSheetSkin?.key) return;
          selfCustomSheetSkin = next;
          if (next) characterAssets.use("self", [studioCharacterStaticAsset(next, facing)]);
        });
        cleanup.push(disposeSpriteSheetListener);
        this.physics.world.setBounds(0, 0, manifest.width, manifest.height);

        const backgroundSource = this.textures.exists(backgroundTextureKey)
          ? this.textures.get(backgroundTextureKey).getSourceImage() : { width: manifest.width, height: manifest.height };
        const backgroundRect = studioCoverRect(
          manifest.width,
          manifest.height,
          backgroundSource.width,
          backgroundSource.height,
        );
        let horizonArtwork: import("phaser").GameObjects.Image | null = null;
        if (this.textures.exists(horizonTextureKey)) {
          const horizonSource = this.textures.get(horizonTextureKey).getSourceImage();
          const horizonRect = studioCoverRect(manifest.width * 3, manifest.height * 3, horizonSource.width, horizonSource.height);
          horizonArtwork = this.add.image(manifest.width / 2, manifest.height / 2, horizonTextureKey)
          .setDisplaySize(horizonRect.width, horizonRect.height)
          .setScrollFactor(0.92)
          .setDepth(-1_004)
          .setAlpha(environmentPreference.backdrop === "city" ? 0.96 : 0.90);
        }
        if (this.textures.exists(backgroundTextureKey)) {
          this.add.image(backgroundRect.x, backgroundRect.y, backgroundTextureKey)
            .setOrigin(0)
            .setDisplaySize(backgroundRect.width, backgroundRect.height)
            .setDepth(-1_000)
            .setAlpha(manifest.tilemap ? 0.24 : environmentPreference.backdrop === "sky" ? 0.96 : 0.72);
        }
        if (manifest.tilemap) {
          tileWorld = createStudioWorldTileRuntime(this, studioRenderedTileWorld(manifest.tilemap, artStyle), `studio-world-${manifest.id}`, {
            resolveUrl: (url) => worldAssetUrls?.get(url) ?? studioVirtualPlaceTileAssetUrl(url, artStyle),
            parseGid: Phaser.Tilemaps.Parsers.Tiled.ParseGID,
            onError: (message) => { parent.dataset.tileError = message; fail(); },
          });
          cleanup.push(() => { tileWorld?.destroy(); tileWorld = null; });
        }
        const campusScene = studioVirtualCampusScene(manifest);
        if (campusScene) {
          // 캠퍼스 벽·문·표지판·오브젝트·절벽은 전용 런타임이 그린다(Canvas 비대화 방지).
          campusRuntime = new StudioCampusRuntime(this, campusScene, { style: artStyle, translate: (ko, en) => btRef.current(ko, en) });
          campusFrame = createStudioCampusRuntimeFrame(this.cameras.main.worldView);
          cleanup.push(() => { campusRuntime?.destroy(); campusRuntime = null; });
        }

        livingWorld = new StudioLivingWorldRuntime(this, manifest, artStyle, livingTextureKeys);
        cleanup.push(() => { livingWorld?.destroy(); livingWorld = null; });
        // 날씨 파티클·앰비언트 순찰(가이드 NPC+동물) 렌더는 전용 런타임이 전담한다.
        const ambienceGuideSkin = studioProceduralNpcSkinByKey("npc-guide");
        const ambienceGuideAsset = studioCharacterStaticAsset(ambienceGuideSkin, "down");
        const ambienceGuideInitialAsset = hasStaticAsset(ambienceGuideAsset) ? ambienceGuideAsset
          : hasStaticAsset(npcFallbackAsset) ? npcFallbackAsset : fallbackAsset;
        ambienceRender = new StudioVirtualAmbienceRenderRuntime(this, manifest, {
          skin: ambienceGuideSkin,
          textureKey: ambienceGuideInitialAsset.key,
          textureFrame: ambienceGuideInitialAsset.frame,
          visualWidth: 92 * 0.72 * actorVisualScale,
          visualHeight: 123 * 0.72 * actorVisualScale,
          applyVisual: applySpriteVisual,
        });
        cleanup.push(() => { ambienceRender?.destroy(); ambienceRender = null; });
        if (!manifest.tilemap) {
          deskPodRuntime = new StudioDeskPodRuntime(this);
          cleanup.push(() => { deskPodRuntime?.destroy(); deskPodRuntime = null; });
        }

        const modularCampus = manifest.tilemap ? [] : drawStudioModularCampus(this, manifest, artStyle);
        parent.dataset.worldPresentation = worldSetDressing.length > 0 ? "illustrated-place" : manifest.tilemap ? "tilemap" : modularCampus.length > 0 ? "modular-campus" : "illustrated";
        cleanup.push(() => modularCampus.forEach((item) => item.destroy()));
        setDressingRuntime = new StudioVirtualSetDressingRuntime(this, manifest, {
          landmarks: landmarksTextureKey, furniture: decorationTextureKeys.furniture, cat: decorationTextureKeys.cat, artStyle,
        }, artProfile.palette);
        cleanup.push(() => { setDressingRuntime?.destroy(); setDressingRuntime = null; });

        for (const layer of worldSetDressing.length > 0 ? [] : manifest.occlusionLayers ?? []) {
          if (manifest.tilemap) {
            const foreground = this.add.graphics().setDepth(layer.depth);
            foreground.fillStyle(artProfile.palette.room, 1).fillPoints([...layer.polygon], true);
            foreground.lineStyle(4, artProfile.palette.wall, 0.86).strokePoints([...layer.polygon], true);
            const minX = Math.min(...layer.polygon.map((point) => point.x));
            const maxX = Math.max(...layer.polygon.map((point) => point.x));
            const minY = Math.min(...layer.polygon.map((point) => point.y));
            const maxY = Math.max(...layer.polygon.map((point) => point.y));
            foreground.lineStyle(2, artProfile.palette.line, 0.42)
              .lineBetween(minX + 18, (minY + maxY) / 2, maxX - 18, (minY + maxY) / 2);
            foreground.setAlpha(0.9);
            occlusionVisuals.push({ polygon: layer.polygon, object: foreground, outsideAlpha: 0.9 });
            cleanup.push(() => foreground.destroy());
            continue;
          }
          const maskGraphics = this.add.graphics().fillStyle(0xffffff).fillPoints([...layer.polygon], true).setVisible(false);
          const mask = maskGraphics.createGeometryMask();
          const foreground = this.add.image(backgroundRect.x, backgroundRect.y, backgroundTextureKey)
            .setOrigin(0).setDisplaySize(backgroundRect.width, backgroundRect.height)
            .setDepth(layer.depth).setMask(mask);
          occlusionVisuals.push({ polygon: layer.polygon, object: foreground, outsideAlpha: 1 });
          cleanup.push(() => { foreground.clearMask(true); foreground.destroy(); maskGraphics.destroy(); });
        }

        routeOverlay = this.add.graphics().setDepth(650);
        locateOverlay = this.add.graphics().setDepth(60_001);
        lightingOverlay = this.add.graphics().setDepth(200_000);
        proximityOverlay = this.add.graphics().setDepth(780);
        zoneVeil = this.add.graphics().setDepth(40_000);
        highlightRing = this.add.graphics().setDepth(80_000);

        drawStudioPrivateZoneOverlay(this, manifest, btRef.current("프라이빗", "Private"));
        if (debugWorld) {
          drawStudioWorldDebugOverlay(this, manifest, interactions);
          parent.dataset.authoringOverlay = "true";
        } else {
          delete parent.dataset.authoringOverlay;
        }

        for (const prop of manifest.props) {
          if (!prop.assetUrl || !this.textures.exists(propTextureKey(prop))) continue;
          const illustratedFrame = worldAssetUrls?.has(prop.assetUrl) || !this.textures.exists(decorationTextureKeys.furniture)
            ? undefined : studioIllustratedPropFrame(prop.assetUrl, artStyle);
          const image = this.add.image(prop.x, prop.y,
            illustratedFrame === undefined ? propTextureKey(prop) : decorationTextureKeys.furniture, illustratedFrame)
            .setOrigin(prop.originX ?? 0.5, prop.originY ?? 1)
            .setAngle(prop.rotation ?? 0)
            .setAlpha(Math.max(0, Math.min(1, prop.alpha ?? 1)))
            .setDepth(studioWorldPropDepth(prop));
          if (prop.width && prop.height) {
            image.setDisplaySize(prop.width, prop.height);
          } else {
            image.setScale(prop.scale ?? 1);
          }
          const replacementFrame = worldAssetUrls?.has(prop.assetUrl) ? undefined : studioIllustratedPropFrame(prop.assetUrl, artStyle);
          if (replacementFrame !== undefined) {
            const info = { image, frame: replacementFrame, width: image.displayWidth, height: image.displayHeight,
              originX: prop.originX ?? .5, originY: prop.originY ?? 1 };
            illustratedProps.push(info);
            if (illustratedFrame !== undefined) {
              const geometry = studioExperienceFrameGeometry("furniture", artStyle, replacementFrame, info.width, info.height, info.originX, info.originY);
              image.setDisplaySize(geometry.width, geometry.height).setOrigin(geometry.originX, geometry.originY);
            }
          }
          const interaction = interactionById.get(prop.id);
          if (interaction) {
            image.setInteractive({ useHandCursor: true });
            image.on(
              "pointerdown",
              (
                _pointer: import("phaser").Input.Pointer,
                _localX: number,
                _localY: number,
                event: InputEventLike,
              ) => {
                event.stopPropagation();
                queuedInteraction = interaction;
              },
            );
          }
        }

        const self = snapshotRef.current.self;
        const spawn = studioWorldSpawn(manifest);
        const initialPoint = resolveStudioWorldSpawn(navigationWorld, self);
        if (!initialPoint) { fail(); return; }
        facing = studioWorldCanOccupy(navigationWorld, self)
          ? self.facing
          : spawn.facing ?? "down";
        localPose = new StudioFixedStepPose(initialPoint);
        fixedStepClock.reset(this.game.loop.time);
        localPose.reset(initialPoint, fixedStepClock.time);
        cameraTarget.x = initialPoint.x; cameraTarget.y = initialPoint.y;

        const bodyZone = this.add.zone(initialPoint.x, initialPoint.y, STUDIO_WORLD_PLAYER_RADIUS * 2, STUDIO_WORLD_PLAYER_RADIUS * 2);
        localBody = bodyZone;
        this.physics.add.existing(bodyZone);
        localBodyPhysics = bodyZone.body as import("phaser").Physics.Arcade.Body;
        localBodyPhysics.setCircle(STUDIO_WORLD_PLAYER_RADIUS);
        localBodyPhysics.setCollideWorldBounds(true);
        localBodyPhysics.setMaxVelocity(STUDIO_VIRTUAL_SPACE_WALK_SPEED * 1.4);
        const observePhysics = (fixedDelta: number) => {
          if (localBodyPhysics) {
            localPose.observe(localBodyPhysics.center, fixedStepClock.advance(fixedDelta));
            // 충돌 뒤의 실제 속도를 받아 벽에서 반대로 움직일 때 불필요한 제동을 없앤다.
            motion = { velocity: { x: localBodyPhysics.velocity.x, y: localBodyPhysics.velocity.y } };
          }
        };
        this.physics.world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, observePhysics);
        cleanup.push(() => this.physics.world.off(Phaser.Physics.Arcade.Events.WORLD_STEP, observePhysics));

        for (const collider of studioWorldCollisionRects(manifest)) {
          const zone = this.add.zone(collider.x, collider.y, collider.width, collider.height).setOrigin(0);
          this.physics.add.existing(zone, true);
          // 고스트 모드에서 비활성화할 수 있게 충돌기를 보관한다.
          ghostColliders.push(this.physics.add.collider(bodyZone, zone));
          staticColliderObjects.push(zone);
        }
        if (!manifest.tilemap) {
          objectRuntime = new StudioWorldObjectRuntime(this, manifest, bodyZone, staticColliderObjects, objectTextureKeys);
          cleanup.push(() => { objectRuntime?.destroy(); objectRuntime = null; });
        }

        localShadow = this.add.ellipse(initialPoint.x, initialPoint.y + 3, 50 * actorVisualScale, 14 * actorVisualScale, 0x1c1111, 0.28)
          .setDepth(Math.round(initialPoint.y) + 990);
        const localSkin = selfCustomSheetSkin
          ?? studioCharacterSkinForArtStyle(resolveStudioCharacterAppearance(self, identityRef.current).skin, artStyle);
        const requestedLocalAsset = studioCharacterStaticAsset(localSkin, facing);
        const localInitialAsset = hasStaticAsset(requestedLocalAsset) ? requestedLocalAsset : fallbackAsset;
        localSprite = this.add.sprite(
          initialPoint.x,
          initialPoint.y,
          localInitialAsset.key,
          localInitialAsset.frame,
        ).setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
          .setData({ visualWidth: 98 * actorVisualScale, visualHeight: 131 * actorVisualScale, assetOwner: "self", framePresentation: localInitialAsset.presentation,
            gaitDistancePerCycle: playerLocomotion.gaitDistancePerCycle })
          .setDisplaySize(98 * actorVisualScale, 131 * actorVisualScale)
          .setDepth(Math.round(initialPoint.y) + 1_001);
        updateDisplaySize(localSprite);
        localLabel = this.add.text(initialPoint.x, initialPoint.y + 20, displayNameRef.current, nameplateStyle("self"))
          .setOrigin(0.5, 0).setDepth(Math.round(initialPoint.y) + 1_002);
        lastWalkablePoint = initialPoint;
        decorationRuntime = new StudioVirtualDecorationRuntime(this, bodyZone, decorationTextureKeys);
        decorationRuntime.syncDecorations(studioVirtualDecorationStateForWorld(decorationsRef.current, manifest));
        lastDecorationState = decorationsRef.current;
        cleanup.push(() => { decorationRuntime?.destroy(); decorationRuntime = null; });

        const bubbleColors = studioCanvasBubbleColors(parent);
        emotes = new StudioEmoteRuntime(this, { nearestFilter: Phaser.Textures.FilterMode.NEAREST, colors: bubbleColors });
        speech = new StudioSpeechBubbleRuntime(this, bubbleColors);
        cleanup.push(() => { emotes?.destroy(); emotes = null; speech?.destroy(); speech = null; chatter.reset(); });
        promptRuntime = new StudioWorldPromptRuntime(this, bubbleColors);
        cleanup.push(() => { promptRuntime?.destroy(); promptRuntime = null; });
        motionFeel = new StudioMotionFeelRuntime(this);
        cleanup.push(() => { motionFeel?.destroy(); motionFeel = null; });
        for (const [id, marker] of createStudioInteractionMarkers(this, interactions, artProfile, Phaser.Geom,
          (interaction) => { queuedInteraction = interaction; })) interactionMarkers.set(id, marker);
        createStudioPortalGateways(this, manifest, portals, artProfile, (ko, en) => btRef.current(ko, en), (portal) => setPathTo(portal.point));

        for (const view of npcDirector.views) {
          const npcDefinition = manifest.npcs.find((definition) => definition.id === view.id)!;
          const skin = studioNpcCastSkinByKey(npcDefinition.skinKey, artStyle);
          const visualScale = npcDefinition.scale ?? 0.72;
          const identity = studioNpcLabel(npcDefinition);
          const shadow = this.add.ellipse(view.point.x, view.point.y + 1, 30 * visualScale * actorVisualScale, 10 * visualScale * actorVisualScale, 0x15151c, 0.2)
            .setDepth(Math.round(view.point.y) + 990);
          const requestedNpcAsset = studioCharacterStaticAsset(skin, view.facing);
          const npcInitialAsset = hasStaticAsset(requestedNpcAsset) ? requestedNpcAsset
            : hasStaticAsset(npcFallbackAsset) ? npcFallbackAsset : fallbackAsset;
          const sprite = this.add.sprite(
            view.point.x,
            view.point.y,
            npcInitialAsset.key,
            npcInitialAsset.frame,
          )
            .setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
            .setData({ visualWidth: 92 * visualScale * actorVisualScale, visualHeight: 123 * visualScale * actorVisualScale, assetOwner: `npc:${view.id}` })
            .setDisplaySize(92 * visualScale * actorVisualScale, 123 * visualScale * actorVisualScale)
            .setDepth(Math.round(view.point.y) + 1_000);
          const selectNpc = (_pointer: import("phaser").Input.Pointer, _x: number, _y: number, event: InputEventLike) => {
            event.stopPropagation();
            if (runtimeInputBlocked()) return;
            const interaction = studioNpcInteraction(manifest, npcDefinition);
            if (!interaction) return;
            if (callbacksRef.current.onNpcInteract) callbacksRef.current.onNpcInteract(interaction, npcDefinition);
            else callbacksRef.current.onInteract(interaction);
          };
          if (studioNpcInteraction(manifest, npcDefinition)) {
            sprite.setInteractive({ useHandCursor: true }).on("pointerdown", selectNpc);
          }
          const label = this.add.text(view.point.x, view.point.y + 9, btRef.current(identity.ko, identity.en), nameplateStyle("npc"))
            .setOrigin(0.5, 0).setDepth(Math.round(view.point.y) + 1_002);
          if (studioNpcInteraction(manifest, npcDefinition)) label.setInteractive({ useHandCursor: true }).on("pointerdown", selectNpc);
          applySpriteVisual(sprite, skin, view.facing, view.animation);
          npcs.set(view.id, { definition: npcDefinition, skin, sprite, label, shadow, phase: view.phase, groundPoint: view.point });
        }

        keys = this.input.keyboard?.addKeys({
          w: Phaser.Input.Keyboard.KeyCodes.W,
          a: Phaser.Input.Keyboard.KeyCodes.A,
          s: Phaser.Input.Keyboard.KeyCodes.S,
          d: Phaser.Input.Keyboard.KeyCodes.D,
          up: Phaser.Input.Keyboard.KeyCodes.UP,
          down: Phaser.Input.Keyboard.KeyCodes.DOWN,
          left: Phaser.Input.Keyboard.KeyCodes.LEFT,
          right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
          shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
          interact: Phaser.Input.Keyboard.KeyCodes.E,
        }, false, false) as Record<string, import("phaser").Input.Keyboard.Key> | null;

        this.input.on("pointerdown", (pointer: import("phaser").Input.Pointer) => {
          if (!pointer.leftButtonDown() || runtimeInputBlocked()) return;
          const nativePointer = pointer.event as PointerEvent | undefined;
          if (nativePointer?.pointerType === "touch" && experienceRef.current.controlMode !== "tap") return;
          bridge.setFollowingPeer(null);
          callbacksRef.current.onCancelFollow();
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
          queuedInteraction = null;
          setPathTo({ x: pointer.worldX, y: pointer.worldY });
        });

        const camera = this.cameras.main;
        camera.setBounds(0, 0, manifest.width, manifest.height);
        camera.startFollow(cameraTarget, false, reducedMotion.matches ? 1 : 0.12, reducedMotion.matches ? 1 : 0.12);
        const cameraModeController = new StudioCameraFollowModeController(camera);
        applyCameraMode = () => cameraModeController.update(experienceRef.current.cameraMode);
        applyCameraMode();
        const resizeCamera = (gameSize: { width: number; height: number }) => {
          parent.dataset.cameraMode = applyStudioWorldCamera(camera, manifest, gameSize.width / viewport.ratio, gameSize.height / viewport.ratio, viewport.ratio);
          // 카메라 디렉터의 속도 줌·대화 줌은 추종(follow) 카메라에서만, 이 기준 줌에 곱한다.
          cameraBaseZoom = camera.zoom;
          cameraFollows = parent.dataset.cameraMode === "follow";
          if (horizonArtwork && horizonUrl.includes("/cinematic-v9/")) fitStudioHorizonArtwork(horizonArtwork, gameSize, camera.zoom);
        };
        resizeCamera({ width: this.scale.width, height: this.scale.height });
        this.scale.on("resize", (gameSize: { width: number; height: number }) => resizeCamera(gameSize));
        // 하위 맵·월드 전환 뒤 새 장면은 짧게 밝아지며 나타난다(모션 줄이기면 바로 보인다).
        if (!reducedMotion.matches) camera.fadeIn(260, 7, 6, 11);

        const canvas = this.game.canvas;
        canvas.tabIndex = 0;
        canvas.setAttribute("role", "application");
        canvas.setAttribute("aria-label", btRef.current(
          "가상 스튜디오 · WASD/방향키로 이동 · E 또는 X로 상호작용 · Tab으로 메뉴 이동",
          "Virtual studio · WASD/arrows to move · E or X to interact · Tab to menus",
        ));
        const focusCanvas = () => canvas.focus({ preventScroll: true });
        bridge.setFocusHandler(focusCanvas);
        cleanup.push(() => bridge.setFocusHandler(null));
        const queueKeyboardInteraction = () => {
          if (document.activeElement === canvas && !runtimeInputBlocked()) {
            keyboardInteractQueued = true;
          }
        };

        const stopMovement = () => {
          bridge.clearMovement();
          path = [];
          motion = { velocity: { x: 0, y: 0 } };
          keyboardInteractQueued = false;
          localBodyPhysics?.setVelocity(0, 0);
          heldKeys.clear();
          this.input.keyboard?.resetKeys();
          gamepadInteractHeld = true;
          if (moving && localBody && !cancelled) {
            moving = false;
            lastPublishedMoving = false;
            callbacksRef.current.onLocalState({ point: { x: localBody.x, y: localBody.y }, facing, moving: false, zoneId: studioWorldRoomAt(manifest, localBody), pose: bridge.getPose() });
          }
          callbacksRef.current.onCancelFollow();
        };
        // Capture only canvas-owned keys before preventing browser scrolling. Phaser's
        // window keyboard handler ignores defaultPrevented events from focused elements.
        const preventGameScrolling = (event: KeyboardEvent) => {
          if (event.target !== canvas) return;
          if (event.key === "Escape") { npcDirector.cancelGuideTour(); stopMovement(); return; }
          if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || runtimeInputBlocked()) return;
          if (!WORLD_KEY_CODES.has(event.code)) return;
          heldKeys.add(event.code);
          if ((event.code === "KeyE" || event.code === "KeyX") && !event.repeat) queueKeyboardInteraction();
          // 고스트 모드 토글: 반투명 + 장애물 통과 이동 (대규모 이벤트 끼임 해소)
          if (event.code === STUDIO_GHOST_TOGGLE_KEY && !event.repeat) {
            const next = !bridge.isGhostMode();
            bridge.setGhostMode(next);
            applyGhostMode(next);
          }
          event.preventDefault();
        };
        const releaseKey = (event: KeyboardEvent) => { heldKeys.delete(event.code); };
        const promptHasFocus = () => document.activeElement?.matches('[data-interact-prompt="true"]') ?? false;
        const refocus = () => {
          if (this.input.keyboard) this.input.keyboard.enabled = document.activeElement === canvas;
          if (document.activeElement !== canvas && !promptHasFocus()) stopMovement();
        };
        const visibility = () => { if (document.hidden) { npcDirector.cancelGuideTour(); stopMovement(); } };
        const reduceMotionChanged = () => {
          camera.setLerp(reducedMotion.matches ? 1 : 0.12, reducedMotion.matches ? 1 : 0.12);
          currentQualityProfile = studioVirtualQualityProfile(experienceRef.current.qualityPreset, qualityEnvironment());
          adaptiveQuality.reset(currentQualityProfile.tier);
          lastQualityTier = currentQualityProfile.tier;
          resizeRuntime();
        };
        canvas.addEventListener("pointerdown", focusCanvas);
        canvas.addEventListener("keydown", preventGameScrolling);
        globalThis.addEventListener("keyup", releaseKey);
        document.addEventListener("focusin", refocus);
        document.addEventListener("visibilitychange", visibility);
        globalThis.addEventListener("blur", stopMovement);
        reducedMotion.addEventListener("change", reduceMotionChanged);
        const modalObserver = new MutationObserver(() => {
          modalInputBlocked = studioWorldHasModalBlocker(document);
        });
        modalObserver.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["open", "role", "aria-modal", "aria-hidden", "hidden", "data-state", "data-presentation", "data-studio-input-blocker"],
        });
        cleanup.push(() => {
          canvas.removeEventListener("pointerdown", focusCanvas);
          canvas.removeEventListener("keydown", preventGameScrolling);
          globalThis.removeEventListener("keyup", releaseKey);
          document.removeEventListener("focusin", refocus);
          document.removeEventListener("visibilitychange", visibility);
          globalThis.removeEventListener("blur", stopMovement);
          reducedMotion.removeEventListener("change", reduceMotionChanged);
          modalObserver.disconnect();
        });
        portalTracker.seed(portals, initialPoint);
        zoneTracker.seed(studioWorldPresenceZone(manifest, initialPoint)?.id ?? null);
        // 구역 안내와 끼임 해제 버튼은 HUD가 onZoneChange·onStuckChange로 그린다.
        sceneReady = true;
        parent.dataset.bootStage = manifest.tilemap ? "loading-tiles" : "ready";
        setFailure(false);
        if (!manifest.tilemap) {
          cancelBootDeadline();
          setReady(true);
        }
        const contextLost = (event: Event) => { event.preventDefault(); stopMovement(); fail(); };
        canvas.addEventListener("webglcontextlost", contextLost);
        cleanup.push(() => canvas.removeEventListener("webglcontextlost", contextLost));
        focusWorldOnReady = () => {
          const stage = parent.closest('[data-studio-virtual-space="true"]') ?? parent.parentElement ?? parent;
          if (studioWorldMayTakeFocus(document.activeElement, stage)) focusCanvas();
        };
        if (!manifest.tilemap) focusWorldOnReady();
        syncSnapshot(snapshotRef.current);
        startOptionalSceneArt = () => {
          // 선택 PNG의 다운로드나 실패가 입장·이동 준비를 막지 않게 필수 장면 생성 후 요청한다.
          const optionalArt = [
            { key: decorationTextureKeys.furniture, url: studioExperienceAssetUrl("furniture", artStyle) },
            { key: decorationTextureKeys.cat, url: "/assets/virtual-studio/experience-v8/cat-emotions.png" },
            ...(worldSetDressing.length > 0 ? [{ key: landmarksTextureKey, url: studioExperienceAssetUrl("landmarks", artStyle) }] : []),
            ...(artStyle === "sky-island" ? [{ key: actorExpressionTextureKey, url: "/assets/virtual-studio/experience-v8/actor-emotions.png" }] : []),
          ];
          const refreshSceneArt = () => {
            if (cancelled || engineFailed) return;
            setDressingRuntime?.destroy();
            setDressingRuntime = new StudioVirtualSetDressingRuntime(this, manifest, {
              landmarks: landmarksTextureKey, furniture: decorationTextureKeys.furniture, cat: decorationTextureKeys.cat, artStyle,
            }, artProfile.palette);
            decorationRuntime?.refreshTextures();
            if (this.textures.exists(decorationTextureKeys.furniture)) for (const { image, frame, width, height, originX, originY } of illustratedProps) {
              const geometry = studioExperienceFrameGeometry("furniture", artStyle, frame, width, height, originX, originY);
              image.setTexture(decorationTextureKeys.furniture, frame).setDisplaySize(geometry.width, geometry.height)
                .setOrigin(geometry.originX, geometry.originY);
            }
            parent.dataset.sceneArt = optionalArt.filter((asset) => this.textures.exists(asset.key)).map((asset) => asset.key).join(",");
          };
          for (const asset of optionalArt) {
            const event = `filecomplete-image-${asset.key}`;
            const loaded = () => {
              if (cancelled || engineFailed) return;
              if (!registerStudioSceneAtlas(this.textures.get(asset.key), sceneArtAtlases.get(asset.key) ?? STUDIO_EXPERIENCE_ATLAS)) {
                failedTextures.add(asset.key); this.textures.remove(asset.key);
              }
              refreshSceneArt();
            };
            this.load.once(event, loaded);
            cleanup.push(() => this.load.off(event, loaded));
            this.load.image(asset.key, asset.url);
          }
          this.load.start();
        };
        if (!manifest.tilemap) { startOptionalSceneArt(); startOptionalSceneArt = null; }
      };

      scene.update = function update(time: number, deltaMs: number) {
        frameTime = time;
        if (!localBody || !localBodyPhysics || !localSprite || !localShadow || !localLabel) return;
        const dt = Math.min(0.05, Math.max(0, deltaMs / 1000));
        if (!sceneReady || cancelled) return;
        if (decorationsRef.current !== lastDecorationState) {
          lastDecorationState = decorationsRef.current;
          navigationWorld = studioVirtualDecorationNavigationWorld(manifest, lastDecorationState);
          decorationRuntime?.syncDecorations(studioVirtualDecorationStateForWorld(lastDecorationState, manifest));
          npcDirector.updateNavigationWorld(navigationWorld);
          const destination = path.at(-1);
          if (destination) path = findStudioWorldPath(navigationWorld, localBodyPhysics.center, destination);
        }
        const requestedQuality = experienceRef.current.qualityPreset;
        if (requestedQuality !== lastRequestedQualityPreset) {
          lastRequestedQualityPreset = requestedQuality;
          currentQualityProfile = studioVirtualQualityProfile(requestedQuality, qualityEnvironment());
          adaptiveQuality.reset(currentQualityProfile.tier);
          lastQualityTier = currentQualityProfile.tier;
          resizeRuntime();
        }
        const qualitySample = adaptiveQuality.sample(deltaMs, requestedQuality === "auto" && !reducedMotion.matches, studioVirtualAutomaticQualityTier(qualityEnvironment()));
        if (qualitySample.tier !== lastQualityTier) {
          lastQualityTier = qualitySample.tier;
          currentQualityProfile = studioVirtualQualityProfile(qualitySample.tier, qualityEnvironment());
          resizeRuntime();
        }
        parent.dataset.qualityTier = currentQualityProfile.tier;
        if (time - lastAssetCollectionAt >= 1_000) {
          characterAssets.collect();
          lastAssetCollectionAt = time;
        }
        fixedStepClock.reconcile(this.game.loop.time);
        const blocked = runtimeInputBlocked();
        const worldReadyForHud = manifest.tilemap === undefined || initialTilesReady;
        if (blocked && !wasInputBlocked) {
          heldKeys.clear();
          bridge.clearMovement();
          path = [];
          motion = { velocity: { x: 0, y: 0 } };
          keyboardInteractQueued = false;
          localBodyPhysics.setVelocity(0, 0);
          this.input.keyboard?.resetKeys();
          callbacksRef.current.onCancelFollow();
        }
        wasInputBlocked = blocked;
        const typing = blocked || document.activeElement !== this.game.canvas;
        if (bridge.getStopRevision() !== lastStopRevision) {
          lastStopRevision = bridge.getStopRevision();
          path = [];
          motion = { velocity: { x: 0, y: 0 } };
          localBodyPhysics.setVelocity(0, 0);
          walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
        }
        const requestedEmote = bridge.consumeEmote();
        if (requestedEmote) {
          // 같은 요청이 스냅샷(selfReaction) 경로로 이미 막 시작됐다면 두 번 재시작하지 않는다.
          emotes?.play("self", requestedEmote, time, "person", STUDIO_EMOTE_DEDUPE_MS);
          queueEmoteReaction(requestedEmote, null);
        }
        let ix = blocked ? 0 : bridge.getJoystick().x;
        let iy = blocked ? 0 : bridge.getJoystick().y;
        if (!typing) {
          if (heldKeys.has("ArrowLeft") || heldKeys.has("KeyA") || keys?.left?.isDown || keys?.a?.isDown) ix -= 1;
          if (heldKeys.has("ArrowRight") || heldKeys.has("KeyD") || keys?.right?.isDown || keys?.d?.isDown) ix += 1;
          if (heldKeys.has("ArrowUp") || heldKeys.has("KeyW") || keys?.up?.isDown || keys?.w?.isDown) iy -= 1;
          if (heldKeys.has("ArrowDown") || heldKeys.has("KeyS") || keys?.down?.isDown || keys?.s?.isDown) iy += 1;
        }

        const pads = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
          ? Array.from(navigator.getGamepads())
          : [];
        const gamepad = readStudioVirtualSpaceGamepadsInput(pads);
        if (!typing) { ix += gamepad.x; iy += gamepad.y; }
        // 게임필 설정(1초 캐시): 입력 감도, 끼임 탈출 밀기.
        worldFeel.refresh(time, reducedMotion.matches);
        const shapedInput = worldFeel.shapeInput(ix, iy, time);
        ix = shapedInput.x;
        iy = shapedInput.y;

        const sprint = !typing && Boolean(heldKeys.has("ShiftLeft") || heldKeys.has("ShiftRight") || keys?.shift?.isDown || gamepad.sprint);
        let currentPoint = { x: localBodyPhysics.center.x, y: localBodyPhysics.center.y };
        // 고스트 모드에서는 벽 안을 의도적으로 통과하므로 점유 보정을 건너뛴다.
        const ghostActive = bridge.isGhostMode();
        const ghostOverrides = studioGhostCollisionOverrides(ghostActive);
        // T8: 따라가기 중 벽 통과를 켜면 고스트와 같은 기준으로 충돌을 우회한다 (물리 충돌기 + 점유 보정).
        const frameFollowConfig = bridge.getFollowConfig();
        const followWallPass = Boolean(bridge.getFollowingPeer()) && frameFollowConfig.ignoreCollisions;
        if (followWallPass !== followWallPassApplied) {
          followWallPassApplied = followWallPass;
          if (!ghostActive) setWorldCollidersActive(!followWallPass);
        }
        const skipOccupancyCorrection = ghostOverrides.skipOccupancyCorrection || followWallPass;
        if (!skipOccupancyCorrection && !studioWorldCanOccupy(navigationWorld, currentPoint)) {
          const fallback = studioWorldCanOccupy(navigationWorld, lastWalkablePoint)
            ? lastWalkablePoint
            : resolveStudioWorldSpawn(navigationWorld, currentPoint);
          if (!fallback) { fail(); return; }
          localBodyPhysics.reset(fallback.x, fallback.y);
          localBody.setPosition(fallback.x, fallback.y);
          localPose.reset(fallback, fixedStepClock.time);
          motion = { velocity: { x: 0, y: 0 } };
          path = [];
          currentPoint = fallback;
          emitStuck(stuckDetector.markCorrected(fallback));
        } else if (studioWorldCanOccupy(navigationWorld, currentPoint)) {
          // 통과 중 벽 안 좌표는 마지막 정상 위치로 남기지 않는다 (해제 직후 보정 되돌림 방지).
          lastWalkablePoint = currentPoint;
        }
        const terrain = studioVirtualTerrainAt(manifest, currentPoint);
        for (const visual of occlusionVisuals) {
          const inside = studioWorldPointInsideOcclusionPolygon(currentPoint, visual.polygon);
          const target = visual.outsideAlpha * (inside ? 0.18 : 1);
          const ratio = reducedMotion.matches ? 1 : Math.min(1, Math.max(0, deltaMs) / 140);
          visual.object.setAlpha(visual.object.alpha + (target - visual.object.alpha) * ratio);
        }
        // 매 프레임 같은 객체를 고쳐 쓴다. 가속·감속에는 게임필 가속 배율을 곱한다.
        const config = motionConfig;
        config.acceleration = DEFAULT_STUDIO_MOTION_CONFIG.acceleration / terrain.dragMultiplier * worldFeel.accelerationFactor;
        config.deceleration = DEFAULT_STUDIO_MOTION_CONFIG.deceleration * terrain.dragMultiplier * worldFeel.accelerationFactor;
        config.maxSpeed = playerLocomotion.walkSpeed * (sprint ? playerLocomotion.sprintMultiplier : 1) * terrain.speedMultiplier;
        const sprintSpeed = playerLocomotion.walkSpeed * playerLocomotion.sprintMultiplier * terrain.speedMultiplier;
        // 55px 안에서 대화 도구가 있는 가장 가까운 NPC 하나(매 프레임 배열 복사·정렬 없이 한 번 순회).
        let nearbyNpc: NpcVisual | undefined;
        let npcInteraction: StudioWorldInteractionDefinition | null = null;
        let nearbyNpcGap = 55;
        for (const npc of npcs.values()) {
          const gap = Math.hypot(npc.groundPoint.x - currentPoint.x, npc.groundPoint.y - currentPoint.y);
          if (gap >= nearbyNpcGap) continue;
          const candidate = studioNpcInteraction(manifest, npc.definition);
          if (!candidate) continue;
          nearbyNpc = npc; npcInteraction = candidate; nearbyNpcGap = gap;
        }
        const radiusInteraction = nearestInteraction(interactions, currentPoint);
        const floorFocus = studioWorldFloorFocusTarget({
          npcNearby: Boolean(npcInteraction),
          interaction: radiusInteraction
            ? { id: radiusInteraction.id, point: radiusInteraction.point, radius: radiusInteraction.radius }
            : null,
        });
        const promptInteract = studioWorldPromptInteractGate({
          requested: bridge.consumeInteract(),
          canvasFocused: document.activeElement === this.game.canvas,
          promptFocused: document.activeElement?.matches('[data-interact-prompt="true"]') ?? false,
          blocked,
        });
        const interactPressed = promptInteract || (!typing && Boolean(
          keyboardInteractQueued
          || (gamepad.interact && !gamepadInteractHeld),
        ));
        keyboardInteractQueued = false;
        gamepadInteractHeld = gamepad.interact;
        const directInput = Math.hypot(ix, iy) > 0.04;
        emitStuck(stuckDetector.sample({ time, directional: directInput && !blocked, point: currentPoint }));
        const selection = queuedInteraction;
        queuedInteraction = null;
        let promptInteraction: StudioWorldInteractionDefinition | null = null;
        if (interactPressed && npcInteraction && !selection && !floorFocus) {
          if (callbacksRef.current.onNpcInteract && nearbyNpc) callbacksRef.current.onNpcInteract(npcInteraction, nearbyNpc.definition);
          else callbacksRef.current.onInteract(npcInteraction);
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
        } else {
          const previousApproach = approachState.pending;
          const decision = stepStudioWorldInteractionApproach(navigationWorld, approachState, currentPoint, {
            selection: selection ? { id: selection.id, point: selection.point, radius: selection.radius } : null,
            inRangeInteract: interactPressed && !selection,
            nearby: floorFocus,
            focus: floorFocus,
          });
          approachState = decision.state;
          const highlighted = decision.prompt ? interactionById.get(decision.highlightId ?? "") ?? null : null;
          promptInteraction = highlighted;
          const highlightChanged = (highlighted?.id ?? null) !== nearbyInteractionId;
          if (highlightChanged) {
            nearbyInteractionId = highlighted?.id ?? null;
            callbacksRef.current.onNearbyInteractionChange?.(highlighted);
          }
          // 2글자 원형 표식은 '모든 표식 보기'일 때 320px 안에서만 보이고, 프롬프트 대상은 'E' 키캡이 대신한다.
          if (highlightChanged || time - lastMarkerCullAt >= 200) {
            lastMarkerCullAt = time;
            for (const [id, marker] of interactionMarkers) {
              marker.setVisible(studioWorldMarkerVisible({ prompted: id === nearbyInteractionId, showAll: experienceRef.current.interactionRings,
                distance: Math.hypot(marker.x - currentPoint.x, marker.y - currentPoint.y) }));
            }
          }
          highlightRing?.clear();
          if (highlighted && experienceRef.current.interactionRings) {
            highlightRing?.lineStyle(3, 0xf5d78a, 1).strokeCircle(highlighted.point.x, highlighted.point.y, highlighted.radius);
          }
          if (decision.activateId) {
            const chosen = interactionById.get(decision.activateId) ?? (selection?.id === decision.activateId ? selection : null);
            if (chosen) callbacksRef.current.onInteract(chosen);
          } else if (interactPressed && !selection) {
            callbacksRef.current.onInteract(null);
          }
          if (decision.walkTarget && !directInput && !blocked) {
            const sameWalk = previousApproach
              && previousApproach.id === decision.state.pending?.id
              && previousApproach.walkTarget.x === decision.walkTarget.x
              && previousApproach.walkTarget.y === decision.walkTarget.y;
            if (!sameWalk) {
              const nextPath = findStudioWorldPath(navigationWorld, currentPoint, decision.walkTarget);
              if (nextPath.length === 0) approachState = EMPTY_STUDIO_WORLD_APPROACH;
              else path = nextPath;
            }
          }
        }

        const moveRequest = bridge.consumeMoveTarget();
        if (moveRequest && !blocked && !selection) {
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
          setPathTo(moveRequest);
        }

        const followPeerId = bridge.getFollowingPeer();
        const followPeer = followPeerId ? getPeerSnapshot(followPeerId) : null;
        const walkChoice = queuedWalkOver;
        queuedWalkOver = null;
        if (!blocked && (walkChoice || followPeerId)) {
          if (followPeerId && !followPeer && !walkChoice) {
            bridge.setFollowingPeer(null);
            callbacksRef.current.onCancelFollow();
            walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
          } else {
            const previousRoute = walkOverState.routeTarget;
            const followConfig = bridge.getFollowConfig();
            const followStandOffPx = resolveStudioFollowStandOffPx(followConfig);
            const walked = stepStudioWorldWalkOver(navigationWorld, walkOverState, currentPoint, {
              choice: walkChoice,
              followTarget: followPeer ? { id: followPeerId!, point: { x: followPeer.state.x, y: followPeer.state.y } } : null,
              direct: directInput,
              standOffPx: followStandOffPx,
              ignoreCollisions: followConfig.ignoreCollisions,
              // 도슨트 모드: 가이드가 멈추면 스탠드오프 2배 안에서는 붙으러 가지 않고 대기한다.
              holdSlackPx: followConfig.mode === "docent" ? followStandOffPx : 0,
            });
            walkOverState = walked.state;
            if (walked.follow && walked.state.targetId) bridge.setFollowingPeer(walked.state.targetId);
            const routeMoved = walked.routeTarget
              && (!previousRoute || previousRoute.x !== walked.routeTarget.x || previousRoute.y !== walked.routeTarget.y);
            if (walked.routeTarget && routeMoved && !directInput) {
              approachState = EMPTY_STUDIO_WORLD_APPROACH;
              if (followConfig.ignoreCollisions) {
                // 충돌 무시: 경로탐색을 건너뛰고 스탠드오프 지점으로 직행한다.
                path = [walked.routeTarget];
              } else {
                setPathTo(walked.routeTarget);
              }
            } else if (walked.follow && !walked.routeTarget) path = [];
          }
        }

        const cruise = steerStudioWorldCruise({
          manifest: navigationWorld,
          current: currentPoint,
          path,
          maxSpeed: config.maxSpeed,
          deceleration: config.deceleration,
          direct: blocked ? { x: 0, y: 0 } : { x: ix, y: iy },
        });
        if (directInput) {
          const interruptedNavigation = cruise.cleared || path.length > 0 || Boolean(followPeerId);
          if (followPeerId) bridge.setFollowingPeer(null);
          if (interruptedNavigation) callbacksRef.current.onCancelFollow();
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
          walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
        }
        if (!blocked) {
          path = cruise.path;
          ix = cruise.input.x;
          iy = cruise.input.y;
        }
        if (ghostActive && !blocked) {
          // 고스트: 내비게이션 게이팅을 우회해 목적지로 직진한다 (키보드 입력은 그대로 둔다).
          const destination = path.at(-1) ?? null;
          const seek = studioGhostSeekInput(currentPoint, destination);
          if (seek) { ix = seek.x; iy = seek.y; }
          else if (destination) { path = []; ix = 0; iy = 0; }
        }

        // locomotion-feel 연결: 커브 가속/감속 + 급정지 스키드
        const inputMagnitude = Math.hypot(ix, iy);
        const feelTarget = inputMagnitude > 0.001
          ? { x: ix / Math.max(1, inputMagnitude) * config.maxSpeed, y: iy / Math.max(1, inputMagnitude) * config.maxSpeed }
          : { x: 0, y: 0 };
        const feelConfig = {
          ...DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
          acceleration: config.acceleration,
          deceleration: config.deceleration,
          maxSpeed: config.maxSpeed,
        };
        const previousVelocity = motion.velocity;
        // 출발 120ms ease-in 램프와 방향 반전 감속을 얹은 이징 스텝 (필 커브 자체는 easer가 위임)
        motion = { velocity: motionEaser.step(previousVelocity, feelTarget, dt, feelConfig, reducedMotion.matches) };
        // 급회전 감속: 몸이 돌아가는 동안 일시적으로 속도를 줄인다
        let turnFactor = 1;
        const feelSpeed = Math.hypot(motion.velocity.x, motion.velocity.y);
        if (feelSpeed > 4 && inputMagnitude > 0.001) {
          turnFactor = turnSlowdownFactor(shortestAngleDelta(
            Math.atan2(previousVelocity.y, previousVelocity.x),
            Math.atan2(feelTarget.y, feelTarget.x),
          ));
        }
        localBodyPhysics.setVelocity(motion.velocity.x * turnFactor, motion.velocity.y * turnFactor);
        // 벽에 비비며 제자리면 직각 방향으로 잠깐 밀어 준다(1.5초 끼임 판정·HUD 버튼은 stuckDetector가 그대로 맡는다).
        const body = localBodyPhysics;
        worldFeel.sampleStuck(currentPoint.x, currentPoint.y, ix, iy, body.blocked.left || body.blocked.right,
          body.blocked.up || body.blocked.down, time, directInput && !blocked);
        let portal: StudioWorldPortalDefinition | null = null;
        let snapCamera = false;
        const teleportRequest = worldReadyForHud ? bridge.consumeTeleport() : null;
        const teleportTarget = teleportRequest ? resolveStudioWorldSpawn(navigationWorld, teleportRequest) : null;
        if (teleportTarget) {
          localBodyPhysics.reset(teleportTarget.x, teleportTarget.y);
          localBody.setPosition(teleportTarget.x, teleportTarget.y);
          localPose.reset(teleportTarget, fixedStepClock.time);
          previousRendered = null;
          motion = { velocity: { x: 0, y: 0 } };
          motionEaser.reset();
          localBodyPhysics.setVelocity(0, 0);
          path = [];
          walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
          if (bridge.getFollowingPeer()) { bridge.setFollowingPeer(null); callbacksRef.current.onCancelFollow(); }
          portalTracker.seed(portals, teleportTarget);
          lastWalkablePoint = teleportTarget;
          lastPosition = teleportTarget;
          currentPoint = teleportTarget;
          lastPublishedPoint = null;
          snapCamera = true;
          emitStuck(stuckDetector.reset());
          worldFeel.resetStuck();
        } else if (bridge.consumeUnstuck()) {
          const rescue = resolveStudioWorldUnstuck(navigationWorld, currentPoint);
          if (rescue.spawn) {
            localBodyPhysics.reset(rescue.spawn.x, rescue.spawn.y);
            localPose.reset(rescue.spawn, fixedStepClock.time);
            previousRendered = null;
            motion = { velocity: rescue.velocity };
            localBodyPhysics.setVelocity(rescue.velocity.x, rescue.velocity.y);
            path = [];
            walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
            approachState = EMPTY_STUDIO_WORLD_APPROACH;
            bridge.setFollowingPeer(null);
            lastPosition = rescue.spawn;
            currentPoint = rescue.cameraAnchor;
            snapCamera = true;
            emitStuck(stuckDetector.reset());
            worldFeel.resetStuck();
          }
        } else if (!blocked) {
          const arrival = resolveStudioWorldPortalArrival(
            portalTracker,
            navigationWorld,
            portals,
            currentPoint,
            motion.velocity,
            reducedMotion.matches,
          );
          portal = arrival.portal;
          const moved = arrival.body.x !== currentPoint.x || arrival.body.y !== currentPoint.y;
          if (portal && moved) {
            localBodyPhysics.reset(arrival.body.x, arrival.body.y);
            localPose.reset(arrival.body, fixedStepClock.time);
            previousRendered = null;
            motion = { velocity: arrival.velocity };
            localBodyPhysics.setVelocity(arrival.velocity.x, arrival.velocity.y);
            path = [];
            bridge.clearMovement();
            lastPosition = arrival.body;
            currentPoint = arrival.body;
            approachState = EMPTY_STUDIO_WORLD_APPROACH;
            snapCamera = true;
          }
          if (portal) {
            const leaving = portal;
            // 하위 맵으로 가는 문은 짧게 어두워진 뒤 넘기고, 같은 월드 안 순간이동은 다시 밝아지며 나타난다.
            if (leaving.href && !reducedMotion.matches) {
              this.cameras.main.fadeOut(180, 7, 6, 11);
              this.time.delayedCall(180, () => { if (!cancelled) callbacksRef.current.onPortal?.(leaving); });
              // 장소가 바뀌지 않으면(같은 월드 유지) 화면을 다시 밝힌다.
              this.time.delayedCall(1_400, () => { if (!cancelled) this.cameras.main.fadeIn(200, 7, 6, 11); });
            } else {
              if (moved && !reducedMotion.matches) this.cameras.main.fadeIn(200, 7, 6, 11);
              callbacksRef.current.onPortal?.(leaving);
            }
          }
        }

        if (routeOverlay) {
          routeOverlay.clear();
          // 클릭 이동 경로 표시: 목적지 마커(펄스) + 간소화된 경로 폴리라인
          const pathDisplay = buildMovePathDisplay({
            current: currentPoint,
            path,
            destination: path.at(-1) ?? null,
            moving: feelSpeed > 5,
            now: Date.now(),
            markerStartedAt,
            reducedMotion: reducedMotion.matches,
          });
          if (pathDisplay.visible) {
            routeOverlay.lineStyle(1.5, 0xc8b8ff, 0.42);
            routeOverlay.beginPath();
            const [firstPoint, ...restPoints] = pathDisplay.polyline;
            if (firstPoint) {
              routeOverlay.moveTo(firstPoint.x, firstPoint.y);
              for (const waypoint of restPoints) routeOverlay.lineTo(waypoint.x, waypoint.y);
            }
            routeOverlay.strokePath();
            const marker = pathDisplay.marker;
            if (marker) {
              const pulseScale = reducedMotion.matches ? 1 : 1 + marker.pulse * 0.35;
              routeOverlay.lineStyle(2, 0xe8ddff, 0.8);
              routeOverlay.strokeEllipse(marker.point.x, marker.point.y, 20 * pulseScale, 10 * pulseScale);
            }
          }
        }
        if (locateOverlay) {
          // 참가자 locate 안내선: 선택한 참가자 방향으로 안내선 + 가장자리 화살표 마커
          locateOverlay.clear();
          const locateId = bridge.getLocateTarget();
          const locateVisual = locateId ? peers.get(locateId) : undefined;
          const locatePoint = locateVisual ? { x: locateVisual.targetX, y: locateVisual.targetY } : null;
          const camera = this.cameras.main;
          const guide = buildStudioLocateGuide({
            self: currentPoint,
            target: locatePoint,
            cameraCenter: { x: camera.scrollX + camera.width / 2, y: camera.scrollY + camera.height / 2 },
            viewWidth: camera.width / camera.zoom,
            viewHeight: camera.height / camera.zoom,
          });
          if (guide.visible) {
            const markerPulse = reducedMotion.matches ? 1 : 1 + 0.22 * Math.sin(time * 0.008);
            if (!guide.onScreen) {
              locateOverlay.lineStyle(2, 0xffd166, 0.85);
              locateOverlay.lineBetween(currentPoint.x, currentPoint.y, guide.markerPoint.x, guide.markerPoint.y);
              const arrowAngle = guide.angle;
              const tipX = guide.markerPoint.x + Math.cos(arrowAngle) * 22;
              const tipY = guide.markerPoint.y + Math.sin(arrowAngle) * 22;
              locateOverlay.fillStyle(0xffd166, 0.9);
              locateOverlay.fillTriangle(
                tipX, tipY,
                guide.markerPoint.x + Math.cos(arrowAngle + 2.5) * 14,
                guide.markerPoint.y + Math.sin(arrowAngle + 2.5) * 14,
                guide.markerPoint.x + Math.cos(arrowAngle - 2.5) * 14,
                guide.markerPoint.y + Math.sin(arrowAngle - 2.5) * 14,
              );
            }
            locateOverlay.lineStyle(2.5, 0xffd166, 0.95);
            locateOverlay.strokeCircle(guide.markerPoint.x, guide.markerPoint.y, 14 * markerPulse);
          }
        }
        if (lightingOverlay) {
          // 주야 사이클·조명 전역 틴트 (fullscreen 오버레이)
          lightingOverlay.clear();
          const dayNight = bridge.getDayNightCycle();
          if (dayNight.enabled) {
            const timeOfDay = studioDayNightTimeOfDay(dayNight.now, dayNight.startMs, dayNight.cycleMs);
            const ambient = studioDayNightAmbientAt(timeOfDay);
            const tintAlpha = studioDayNightTintAlpha(ambient.ambient);
            if (tintAlpha > 0.001) {
              lightingOverlay.fillStyle(ambient.tint, tintAlpha);
              lightingOverlay.fillRect(0, 0, manifest.width, manifest.height);
            }
          }
        }
        const zone = resolveStudioWorldZonePresence(zoneTracker, manifest, currentPoint, reducedMotion.matches);
        zoneVeil?.clear();
        if (zone.separated && zone.rect) {
          const rect = zone.rect;
          const veil = artProfile.key === "neon" ? 0.18 : reducedMotion.matches ? 0.22 : 0.28;
          zoneVeil?.fillStyle(0x07060b, veil);
          zoneVeil?.fillRect(0, 0, manifest.width, rect.y);
          zoneVeil?.fillRect(0, rect.y, rect.x, rect.height);
          zoneVeil?.fillRect(rect.x + rect.width, rect.y, Math.max(0, manifest.width - rect.x - rect.width), rect.height);
          zoneVeil?.fillRect(0, rect.y + rect.height, manifest.width, Math.max(0, manifest.height - rect.y - rect.height));
        }
        const zoneChange = worldReadyForHud ? zoneChanges.next(currentPoint) : null;
        if (zoneChange) callbacksRef.current.onZoneChange?.(zoneChange);
        if (worldReadyForHud) {
          // 타일 이펙트·오피스 존 입장 파티클 소비: 진입 순간만 반응한다.
          if (tileEffectsRef.current !== tileTrackerEffects) {
            tileTrackerEffects = tileEffectsRef.current;
            tileTracker = new StudioTileEffectRuntimeTracker({ effects: tileTrackerEffects, officeZones: manifest.zones ?? [] });
          }
          const tileStep = tileTracker.next(currentPoint, { reducedMotion: reducedMotion.matches });
          if (tileStep.zoneEntryParticle) livingWorld?.triggerZoneEntryParticles(tileStep.zoneEntryParticle, currentPoint);
          if (tileStep.trigger) tileTriggerCallbackRef.current?.(tileStep.trigger);
        }
        parent.dataset.zoneId = zone.zoneId ?? "";
        parent.dataset.zoneSeparated = String(zone.separated);
        parent.dataset.zoneAnnounced = String(zone.announce);
        const activity = snapshotRef.current.self.activity;
        const speed = Math.hypot(motion.velocity.x, motion.velocity.y);
        // 빠르게 달리다 벽에 부딪혀 멈추면 화면을 짧게 흔든다(게임필 설정·모션 줄이기 존중).
        worldFeel.noteImpact(body.touching.left || body.touching.right || body.touching.up || body.touching.down, speed, time);
        const runtimeBudget = studioRuntimeBudget(parent.clientWidth, reducedMotion.matches, peers.size);
        const maxActiveNpcs = Math.min(runtimeBudget.maxActiveNpcs, currentQualityProfile.maxActiveNpcs);
        const peerInterest = studioTownInterestSnapshot(manifest, currentPoint, [...peers].map(([id, peer]) => ({
          id: `peer:${id}`,
          point: { x: peer.targetX, y: peer.targetY },
          kind: "peer" as const,
          important: bridge.getFollowingPeer() === id,
        })), currentQualityProfile.interestRadius);
        proximityOverlay?.clear();
        if (proximityOverlay && atmosphereRef.current !== "focus" && activity !== "focused" && activity !== "away") {
          // 대화 거리(게더타운식 근접 버블): 기본은 120px 안 동료가 있을 때만 발밑 버블과 연결선을 보이고,
          // '모든 표식 보기'면 190px 안까지 넓은 링도 함께 그린다. 배열을 만들지 않고 한 번 순회한다.
          const showAll = experienceRef.current.interactionRings;
          const reach = showAll ? 190 : 120;
          const origin = studioProjectTownPoint(manifest, currentPoint);
          let inRange = 0;
          for (const peer of peers.values()) {
            const distance = Math.hypot(peer.targetX - currentPoint.x, peer.targetY - currentPoint.y);
            if (distance > reach) continue;
            inRange += 1;
            const strength = Math.max(.08, .36 * (1 - distance / reach));
            proximityOverlay.lineStyle(distance < 80 ? 2 : 1, peer.activity === "focused" ? 0xf9b95d : 0x82e6ff, strength)
              .lineBetween(origin.x, origin.y - 6, peer.sprite.x, peer.sprite.y - 6);
          }
          if (inRange > 0) {
            proximityOverlay.fillStyle(0x8fdcff, .07).fillEllipse(origin.x, origin.y, 150, 70);
            proximityOverlay.lineStyle(2, 0xc5f4ff, .26).strokeEllipse(origin.x, origin.y, 150, 70);
            if (showAll) proximityOverlay.lineStyle(1.5, 0x8fdcff, .13).strokeCircle(origin.x, origin.y, 140);
          }
        }
        objectRuntime?.update(time, currentPoint);
        deskPodRuntime?.update([
          { point: currentPoint, focused: activity === "focused" },
          ...[...peers].map(([, peer]) => ({ point: { x: peer.targetX, y: peer.targetY }, focused: peer.activity === "focused" })),
        ], time, reducedMotion.matches);
        decorationRuntime?.update(time, currentPoint, reducedMotion.matches, speed);
        setDressingRuntime?.update(time, currentPoint, reducedMotion.matches, speed);
        tileWorld?.update(this.cameras.main.worldView);
        if (tileWorld) {
          const tileMetrics = tileWorld.diagnostics;
          parent.dataset.tileChunks = String(tileMetrics.chunks);
          parent.dataset.tileTextures = String(tileMetrics.textures);
          if (!engineFailed && !initialTilesReady && tileMetrics.ready) {
            initialTilesReady = true;
            startOptionalSceneArt?.(); startOptionalSceneArt = null;
            cancelBootDeadline();
            parent.dataset.bootStage = "ready";
            setReady(true);
            focusWorldOnReady();
          }
        }
        const environmentEffect = bridge.consumeEnvironmentEffect();
        if (environmentEffect) livingWorld?.triggerEnvironmentEffect(environmentEffect.effect, environmentEffect.point, time);
        livingWorld?.update(
          time,
          deltaMs,
          currentPoint,
          speed,
          reducedMotion.matches,
          currentQualityProfile,
          experienceRef.current.effectLevel,
          environmentRef.current,
          decorationsRef.current.presentationMode,
        );
        // 날씨 파티클과 앰비언트 순찰 배우는 앰비언스 렌더 런타임이 매 프레임 동기화한다.
        const ambienceCondition = studioAmbienceCondition(environmentRef.current.weather);
        const ambienceDayNight = bridge.getDayNightCycle();
        ambienceRender?.update({
          time,
          deltaMs,
          viewport: this.cameras.main.worldView,
          condition: ambienceCondition.particles,
          particleRatio: currentQualityProfile.weather ? currentQualityProfile.particleRatio : 0,
          reducedMotion: reducedMotion.matches,
          patrolWeather: ambienceCondition.patrol,
          timeOfDay: ambienceDayNight.enabled
            ? studioDayNightTimeOfDay(ambienceDayNight.now, ambienceDayNight.startMs, ambienceDayNight.cycleMs)
            : null,
          players: [currentPoint],
          ambientActorsEnabled: currentQualityProfile.ambientActors,
        });
        const traveled = lastPosition ? Math.hypot(currentPoint.x - lastPosition.x, currentPoint.y - lastPosition.y) : 0;
        if (traveled > 0.015) lastMovedAt = time;
        // Render frames can outnumber fixed physics steps. Do not toggle idle/walk on zero-step frames.
        const nextMoving = !blocked && speed > 5 && time - lastMovedAt < 100;
        lastPosition = currentPoint;
        if (speed > 10) facing = studioStableFacing(motion.velocity, facing);

        const localResolved = resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current);
        const localSkin = studioCharacterSkinForArtStyle(localResolved.skin, artStyle);
        const localSeatRequested = !nextMoving && !directInput && resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current, "sit").clip === "sit" ? poseRef.current.seatedActors.find((actor) => actor.id === identityRef.current) : undefined;
        const localSeat = scene.textures.exists(studioCharacterPoseTextureKey(localSkin, "sit")) ? localSeatRequested : undefined;
        const localPoseOverride = !nextMoving && !directInput && resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current, "sit").clip === "sit" ? poseRef.current.selfPose : undefined;
        const shownLocalEmote = emotes?.activeId("self", time) ?? null;
        const localEmotePose = emotes?.pose("self", time, reducedMotion.matches) ?? null;
        const localWaving = shownLocalEmote === "wave" || poseRef.current.waveActorIds.includes(identityRef.current);
        // 자세 상태 머신: 휴식 요청(앉기/눕기) 판정 + 이동 시작 시 자동 일어서기
        const seatAnchors = poseRef.current.seatedActors.map((actor) => ({
          point: actor.anchorPoint, facing: actor.facing, radius: 56,
        }));
        const clearanceOffsets = [{ x: 44, y: 0 }, { x: -44, y: 0 }, { x: 0, y: 44 }, { x: 0, y: -44 }];
        const openArea = clearanceOffsets.every((offset) =>
          studioWorldCanOccupy(navigationWorld, { x: currentPoint.x + offset.x, y: currentPoint.y + offset.y }))
          && [...peers.values()].every((visual) =>
            Math.hypot(visual.targetX - currentPoint.x, visual.targetY - currentPoint.y) > 70);
        const poseFrame = bridge.updatePoseState({
          position: currentPoint,
          moving: nextMoving || directInput,
          seatAnchors,
          openArea,
          now: Date.now(),
        });
        const localState = nextMoving ? "walk" : poseFrame.pose !== "stand" ? poseFrame.pose
          : localSeatRequested || localPoseOverride ? "sit" : localWaving ? "wave" : activityState(false, false, activity);
        const rendered = localPose.sample(this.game.loop.time);
        if (previousRendered) {
          const distance = Math.hypot(rendered.x - previousRendered.x, rendered.y - previousRendered.y);
          if (distance < 64) localDistance += distance;
        }
        const footstepGap = terrain.kind === "shallow-water" ? 18 : sprint ? 32 : 25;
        if (nextMoving && localDistance - lastFootstepDistance >= footstepGap) {
          livingWorld?.emitFootstep(rendered, terrain, time);
          lastFootstepDistance = localDistance;
        }
        previousRendered = rendered;
        localSprite.setData("walkDistance", localDistance).setData("actorReaction", shownLocalEmote);
        localSprite.setData("seatAttached", Boolean(localSeat));
        const localEmoteFacing = localSeatRequested || localPoseOverride || nextMoving ? null : studioEmoteFacing(localEmotePose);
        applyAvatarVisual(localSprite, snapshotRef.current.self,
          localSeatRequested?.facing ?? localPoseOverride?.facing ?? localEmoteFacing ?? facing, localState, identityRef.current);
        applyCameraMode();
        const cameraMode = experienceRef.current.cameraMode;
        const lookAhead = reducedMotion.matches || cameraMode === "steady" ? 0
          : cameraMode === "cinematic" ? sprint ? .32 : .24
            : sprint ? .24 : .16;
        // 카메라 디렉터: 이동 방향 룩어헤드·달리기 줌아웃·방 전환 패닝·충돌 흔들림·대화 포커스(HUD 브리지).
        const cameraInput = worldFeel.cameraInput;
        cameraInput.x = rendered.x;
        cameraInput.y = rendered.y;
        cameraInput.velocityX = motion.velocity.x;
        cameraInput.velocityY = motion.velocity.y;
        cameraInput.maxSpeed = sprintSpeed;
        cameraInput.roomId = zone.zoneId;
        cameraInput.now = time;
        cameraInput.deltaSeconds = dt;
        cameraInput.lookAheadSeconds = lookAhead;
        cameraInput.reducedMotion = reducedMotion.matches;
        cameraInput.sprinting = sprint && nextMoving;
        const conversationFocus = bridge.getConversationFocus();
        worldFeel.camera.setFocus(conversationFocus ? conversationFocus.x : null, conversationFocus?.y ?? 0);
        const directed = worldFeel.camera.step(cameraInput);
        cameraGround.x = Math.max(0, Math.min(manifest.width, directed.targetX));
        cameraGround.y = Math.max(0, Math.min(manifest.height, directed.targetY));
        const cameraVisualTarget = studioProjectTownPoint(manifest, cameraGround);
        // 카메라 데드존(트랙3): 목표가 작은 반경 안에서 떨 때는 기준점을 고정한다.
        // 방 전환 패닝·대화 포커스·모션 줄이기에서는 디렉터가 직접 이끌므로 데드존을 쓰지 않는다.
        const directedPan = directed.roomTransitioning || conversationFocus !== null || reducedMotion.matches;
        const deadzonedTarget = directedPan || !Number.isFinite(cameraBase.x) ? cameraVisualTarget : applyCameraDeadzone({
          playerX: cameraVisualTarget.x,
          playerY: cameraVisualTarget.y,
          cameraTargetX: cameraBase.x,
          cameraTargetY: cameraBase.y,
          deadzoneRadius: STUDIO_CAMERA_DEADZONE_RADIUS,
        });
        cameraBase.x = deadzonedTarget.x;
        cameraBase.y = deadzonedTarget.y;
        cameraTarget.x = cameraBase.x + directed.shakeX;
        cameraTarget.y = cameraBase.y + directed.shakeY;
        if (cameraFollows) this.cameras.main.setZoom(cameraBaseZoom * directed.zoomFactor);
        const followBase = cameraMode === "steady" ? .075 : cameraMode === "cinematic" ? .16 : .12;
        const followAmount = snapCamera || reducedMotion.matches ? 1
          : studioCameraLerp(dt, directed.roomTransitioning ? followBase * 2.2 : followBase);
        this.cameras.main.setLerp(followAmount, followAmount);
        if (snapCamera) this.cameras.main.centerOn(cameraVisualTarget.x, cameraVisualTarget.y);

        const hasWalkClip = scene.anims.exists(walkAnimationKey(localSkin, facing)) || reducedMotion.matches;
        const bodyOffset = playerLocomotion.gaitDistancePerCycle
          ? studioGaitBodyOffset(localDistance, playerLocomotion.gaitDistancePerCycle, nextMoving, reducedMotion.matches)
          : { offsetX: 0, offsetY: nextMoving && !hasWalkClip ? Math.sin(time * 0.024) * 2.8 : 0 };
        const localGroundPoint = localSeat?.anchorPoint ?? rendered;
        const localVisualPoint = studioProjectTownPoint(manifest, localGroundPoint);
        const localShadowPoint = studioProjectTownPoint(manifest, rendered);
        const localEmoteBody = localSeat || nextMoving ? null : localEmotePose;
        // 이동 모드·걸음 위상·호흡 (locomotion-feel 연결)
        locomotionMode = nextLocomotionMode(locomotionMode, feelSpeed);
        walkPhase = advanceWalkPhase(walkPhase, feelSpeed, dt, config.maxSpeed);
        breathPhase = advanceBreathPhase(breathPhase, dt);
        const breathY = breathOffset(breathPhase, locomotionMode);
        localSprite.setPosition(localVisualPoint.x + bodyOffset.offsetX + (localEmoteBody?.bodyX ?? 0),
          localVisualPoint.y + bodyOffset.offsetY + (localEmoteBody?.bodyY ?? 0) + breathY);
        // 눕기 폴백(포즈 텍스처가 없을 때 idle 프레임+회전) + 급회전 린(lean)
        const poseTextureUsed = localSprite.getData("poseTextureUsed") === true;
        const lieFallbackAngle = poseFrame.pose === "lie" && !poseTextureUsed ? 90 : 0;
        const turnTargetAngle = feelSpeed > 4 ? facingAngleFromVelocity(motion.velocity, turnState.angle) : turnState.angle;
        turnState = stepTurnAngleSmooth(turnState, turnTargetAngle, dt, feelSpeed, feelConfig);
        const leanDegrees = turnLeanAngle(turnState.angularVelocity * 180 / Math.PI);
        localSprite.setAngle((playerLocomotion.gaitDistancePerCycle ? 0 : nextMoving && !hasWalkClip ? Math.sin(time * 0.018) * 0.8 : 0)
          + (localEmoteBody?.bodyAngle ?? 0) + lieFallbackAngle + leanDegrees);
        // 캐릭터 모션 오버레이 (트랙1): 상태머신이 블렌딩한 변형을 가산한다.
        // 전이 시점(어떤 모션을 언제)은 트랙3 소유라, 아래는 기존 이동·자세 신호를
        // 그대로 쓰는 잠정 매핑이다. 프로시저럴 스킨은 기존 포즈 시트 경로를 유지해
        // 회귀를 막고, 커스텀 시트에만 오버레이를 적용한다.
        if (selfCustomSheetSkin && !localSeat) {
          const desiredMotion: StudioMotionKind = nextMoving ? (sprint ? "run" : "walk") : localState;
          localMotion = requestMotionState(localMotion, desiredMotion, time);
          if (motionOneShotFinished(localMotion, time)) localMotion = requestMotionState(localMotion, "idle", time);
          if (!reducedMotion.matches) {
            const motionSample = sampleMotionRender(localMotion, time);
            localSprite.y += motionSample.offsetYPx;
            localSprite.angle += motionSample.rotationDeg + (motionSample.tiltRad * 180) / Math.PI;
            if (motionSample.scaleY !== 1) localSprite.setScale(localSprite.scaleX, localSprite.scaleX * motionSample.scaleY);
          }
        }
        // 고스트 모드 (트랙1 렌더링): 반투명 + 그림자 옅게. 물리적 통과 판정은 트랙3 담당.
        localSprite.setAlpha(ghostActive ? STUDIO_GHOST_SPRITE_ALPHA : 1);
        localShadow.setAlpha(ghostActive ? 0.1 : 0.28);
        // 스쿼시 & 스트레치: 속도에 비례해 이동 방향으로 늘어난다
        const squash = locomotionSquashStretch(feelSpeed, config.maxSpeed, reducedMotion.matches);
        localSprite.setScale(localSprite.scaleX * squash.scaleX, localSprite.scaleY * squash.scaleY);
        // 트랙1 모션 렌더러 연결 지점 (StudioMotionRequest 계약)
        _lastMotionRequest = buildStudioMotionRequest({
          pose: poseFrame.pose,
          locomotionMode,
          speed: feelSpeed,
          facing,
          walkPhase,
          poseBlend: poseFrame.poseBlend,
          squashX: squash.scaleX,
          squashY: squash.scaleY,
          leanDegrees,
          breathOffset: breathY,
          ghost: ghostActive,
        });
        localSprite.setDepth(studioTownDepthForPoint(manifest, localGroundPoint, 1_001));
        localShadow.setPosition(localShadowPoint.x, localShadowPoint.y + 1);
        const shadowScale = playerLocomotion.gaitDistancePerCycle
          ? studioGaitShadowScale(localDistance, playerLocomotion.gaitDistancePerCycle, nextMoving, reducedMotion.matches)
          : nextMoving && !reducedMotion.matches ? 0.86 + Math.cos(time * 0.024) * 0.07 : 1;
        localShadow.setVisible(!localSeat).setScale(shadowScale, 1);
        localShadow.setDepth(studioTownDepthForPoint(manifest, rendered, 990));
        // 발밑 연출: 먼지·발걸음 조각·미끄럼·급정지 퍼프·달리기 잔상(캠퍼스는 바닥 재질별 색).
        if (motionFeel && !localSeat) {
          motionFrame.time = time;
          motionFrame.deltaSeconds = dt;
          motionFrame.x = localShadowPoint.x;
          motionFrame.y = localShadowPoint.y;
          motionFrame.depth = localSprite.depth;
          motionFrame.speed = speed;
          motionFrame.sprintSpeed = sprintSpeed;
          motionFrame.inputSpeed = config.maxSpeed * Math.min(1, Math.hypot(ix, iy));
          motionFrame.surface = (campusFloorMap && studioCampusFloorSurface(campusFloorMap, rendered.x, rendered.y))
            || studioMotionFeelTerrainSurface(terrain.kind);
          motionFrame.particleDensity = worldFeel.effective.particleDensity * currentQualityProfile.particleRatio
            * (experienceRef.current.effectLevel === "low" ? 0.5 : 1);
          motionFrame.reducedMotion = reducedMotion.matches || worldFeel.effective.reducedMotion;
          motionFeel.step(motionFrame, localSprite);
        }
        const overlayScale = studioSceneOverlayScale(actorVisualScale, this.cameras.main.zoom, viewport.ratio);
        // 내 이름표도 집중·검토·자리 비움 상태를 같은 bt 라벨과 색 점으로 보여 준다.
        const selfNameplate = studioVirtualNameplatePresentation({
          name: displayNameRef.current, sessionId: "self", duplicateCount: 1, distance: 0, mode: "full",
          activity, userStatus: snapshotRef.current.self.userStatus, translate: btRef.current,
        });
        localLabel.setText(selfNameplate.text).setVisible(true).setAlpha(1).setScale(overlayScale);
        const localHeadY = localVisualPoint.y - localSprite.displayHeight * localSprite.originY;
        const localLabelOffset = localLabel.displayHeight + 6 * overlayScale;
        localLabel.setPosition(localVisualPoint.x, localSeat || actorVisualScale < 1 ? localHeadY - localLabelOffset : localVisualPoint.y + 12).setDepth(localSeat ? 160_000 : Math.round(localVisualPoint.y) + 1_002);
        emotes?.place("self", localVisualPoint.x,
          localHeadY - (localSeat || actorVisualScale < 1 ? localLabelOffset + 4 * overlayScale : 4), overlayScale, time, reducedMotion.matches);
        decorationRuntime?.syncActor(
          identityRef.current, localSprite, localLabel, localVisualPoint,
          localSeatRequested?.facing ?? localPoseOverride?.facing ?? facing, nextMoving, localResolved, time,
        );
        const duplicateNames = new Map<string, number>();
        for (const name of [displayNameRef.current, ...[...peers.values()].map((peer) => peer.displayName)]) {
          duplicateNames.set(name, (duplicateNames.get(name) ?? 0) + 1);
        }
        const nameplateCandidates: Array<{ id: string; x: number; y: number; width: number; height: number; priority: number }> = [];
        const nameplateBases = new Map<string, {
          label: import("phaser").GameObjects.Text; x: number; y: number; status: StudioVirtualNameplateStatus | null;
        }>();
        nameplateCandidates.push({ id: "self", x: localLabel.x, y: localLabel.y, width: localLabel.displayWidth, height: localLabel.displayHeight, priority: 100 });
        nameplateBases.set("self", { label: localLabel, x: localLabel.x, y: localLabel.y, status: selfNameplate.status });

        for (const [peerId, visual] of peers) {
          const target = visual.timeline.sample(Date.now()) ?? {
            x: visual.targetX,
            y: visual.targetY,
            moving: visual.moving,
            facing: visual.facing,
          };
          const previousPoint = visual.sprite.getData("previousGroundPoint") as StudioVirtualSpacePoint | undefined;
          const distance = previousPoint ? Math.hypot(target.x - previousPoint.x, target.y - previousPoint.y) : 0;
          visual.sprite.setData("previousGroundPoint", { x: target.x, y: target.y });
          if (distance < 128) visual.sprite.setData("walkDistance", Number(visual.sprite.getData("walkDistance") ?? 0) + distance);
          const peerResolved = resolveStudioCharacterAppearance(visual, peerId);
          const peerSkin = studioCharacterSkinForArtStyle(peerResolved.skin, artStyle);
          const peerSeatRequested = !target.moving && resolveStudioCharacterAppearance(visual, peerId, "sit").clip === "sit" ? poseRef.current.seatedActors.find((actor) => actor.id === peerId) : undefined;
          const peerSeat = scene.textures.exists(studioCharacterPoseTextureKey(peerSkin, "sit")) ? peerSeatRequested : undefined;
          const peerEmote = emotes?.activeId(`peer:${peerId}`, time) ?? null;
          const peerEmotePose = target.moving || peerSeatRequested ? null : emotes?.pose(`peer:${peerId}`, time, reducedMotion.matches) ?? null;
          visual.sprite.setData("actorReaction", peerEmote);
          const peerWaving = poseRef.current.waveActorIds.includes(peerId) || peerEmote === "wave";
          const peerGroundPoint = peerSeat?.anchorPoint ?? target;
          const peerVisualPoint = studioProjectTownPoint(manifest, peerGroundPoint);
          // main 이모트 렌더 힌트: 춤·환호는 몸을 띄우고 절·수면은 낮춘다(이동·앉기·모션 줄이기에서는 쓰지 않는다).
          const presenceBob = target.moving || peerSeatRequested || reducedMotion.matches ? 0 : studioPresenceEmoteBob(visual.presenceEmote);
          const peerTargetX = peerVisualPoint.x + (peerEmotePose?.bodyX ?? 0);
          const peerTargetY = peerVisualPoint.y + (peerEmotePose?.bodyY ?? 0) + presenceBob;
          if (distance >= 128) {
            // 텔레포트급 점프는 즉시 스냅
            visual.sprite.setPosition(peerTargetX, peerTargetY);
          } else {
            // 피어 스냅샷 지터 감쇠: 작은 흔들림은 무시하고 큰 이동만 따라간다
            visual.sprite.setPosition(
              visual.sprite.x + dampPeerOffset(peerTargetX - visual.sprite.x),
              visual.sprite.y + dampPeerOffset(peerTargetY - visual.sprite.y),
            );
          }
          visual.sprite.setData("seatAttached", Boolean(peerSeat));
          const peerState = target.moving ? "walk" : peerSeatRequested ? "sit" : peerWaving ? "wave" : activityState(false, visual.nearby, visual.activity);
          applyAvatarVisual(visual.sprite, visual, peerSeatRequested?.facing ?? studioEmoteFacing(peerEmotePose) ?? target.facing, peerState, peerId);
          if (target.moving && !reducedMotion.matches && !scene.anims.exists(walkAnimationKey(peerSkin, target.facing))) {
            visual.sprite.setAngle(Math.sin(time * 0.017 + visual.targetX * 0.01) * 0.65);
          } else {
            visual.sprite.setAngle(peerEmotePose?.bodyAngle ?? 0);
          }
          visual.sprite.setDepth(studioTownDepthForPoint(manifest, peerGroundPoint, 1_001));
          const peerHeadY = visual.sprite.y - visual.sprite.displayHeight * visual.sprite.originY;
          const nameplate = studioVirtualNameplatePresentation({
            name: visual.displayName,
            sessionId: peerId,
            duplicateCount: duplicateNames.get(visual.displayName) ?? 1,
            distance: Math.hypot(target.x - currentPoint.x, target.y - currentPoint.y),
            mode: experienceRef.current.nameplateMode,
            important: bridge.getFollowingPeer() === peerId || visual.nearby,
            activity: visual.activity,
            userStatus: visual.userStatus,
            emote: studioPresenceEmoteIndicator(visual.presenceEmote),
            translate: btRef.current,
          });
          visual.label.setText(nameplate.text).setScale(Math.max(actorVisualScale < 1 ? 1 : 0, nameplate.scale) * overlayScale);
          const peerLabelOffset = visual.label.displayHeight + 6 * overlayScale;
          const peerLabelY = peerSeat || actorVisualScale < 1 ? peerHeadY - peerLabelOffset : visual.sprite.y + 18;
          visual.label.setPosition(visual.sprite.x, peerLabelY)
            .setDepth(peerSeat ? 160_000 : Math.round(visual.sprite.y) + 1_002)
            .setAlpha(nameplate.alpha);
          const peerVisible = peerInterest.activeIds.has("peer:" + peerId);
          const peerBubbleBase = peerHeadY - (peerSeat || actorVisualScale < 1 ? peerLabelOffset + 4 * overlayScale : 4);
          const peerEmoteHeight = emotes?.place(`peer:${peerId}`, visual.sprite.x, peerBubbleBase, overlayScale, time, reducedMotion.matches, peerVisible) ?? 0;
          // 프레즌스 말풍선(짧은 채팅)은 이모트 위에 사람 말풍선으로 띄운다.
          if (visual.bubble && peerVisible) {
            speech?.show(`peer:${peerId}`, visual.bubble, "person");
            speech?.place(`peer:${peerId}`, visual.sprite.x, peerBubbleBase - peerEmoteHeight, overlayScale);
          } else speech?.hide(`peer:${peerId}`);
          const labelVisible = peerVisible && nameplate.visible;
          visual.sprite.setVisible(peerVisible);
          visual.label.setVisible(labelVisible);
          if (labelVisible) {
            nameplateCandidates.push({ id: peerId, x: visual.label.x, y: visual.label.y, width: visual.label.displayWidth, height: visual.label.displayHeight, priority: visual.nearby ? 30 : 10 });
            nameplateBases.set(peerId, { label: visual.label, x: visual.label.x, y: visual.label.y, status: nameplate.status });
          }
          decorationRuntime?.syncActor(
            peerId, visual.sprite, visual.label, peerVisualPoint,
            peerSeatRequested?.facing ?? target.facing, target.moving, peerResolved, time,
          );
        }
        const tourRequest = guideTourRef.current;
        if ((tourRequest?.id ?? null) !== lastGuideRequestId) {
          lastGuideRequestId = tourRequest?.id ?? null;
          if (tourRequest) npcDirector.startGuideTour(tourRequest, identityRef.current); else npcDirector.cancelGuideTour();
        }
        const npcViews = npcDirector.advance(dt, {
          atmosphere: atmosphereRef.current,
          reducedMotion: reducedMotion.matches,
          focused: activity === "focused" || blocked,
          mobile: parent.clientWidth < 600,
          eventActive: studioVirtualDayPhase(time) === "dusk" || studioVirtualDayPhase(time) === "night",
          precipitation: Math.floor(time / 45_000) % 4 === 2,
          viewport: this.cameras.main.worldView,
          people: [
            { id: identityRef.current, point: currentPoint, velocity: motion.velocity, focused: activity === "focused" || blocked },
            ...[...peers].map(([id, peer]) => ({
              id, point: { x: peer.targetX, y: peer.targetY }, focused: peer.activity === "focused",
              velocity: peer.moving ? {
                x: peer.facing === "left" ? -STUDIO_VIRTUAL_SPACE_WALK_SPEED : peer.facing === "right" ? STUDIO_VIRTUAL_SPACE_WALK_SPEED : 0,
                y: peer.facing === "up" ? -STUDIO_VIRTUAL_SPACE_WALK_SPEED : peer.facing === "down" ? STUDIO_VIRTUAL_SPACE_WALK_SPEED : 0,
              } : { x: 0, y: 0 },
            })),
          ],
        });
        const mobileNameplates = parent.clientWidth < 600;
        const nearestMobileNpcId = mobileNameplates && npcViews.length > 0
          ? npcViews.reduce((nearest, candidate) => {
              const nearestDistance = Math.hypot(nearest.point.x - currentPoint.x, nearest.point.y - currentPoint.y);
              const candidateDistance = Math.hypot(candidate.point.x - currentPoint.x, candidate.point.y - currentPoint.y);
              return candidateDistance < nearestDistance ? candidate : nearest;
            }).id
          : null;
        const tourState = npcDirector.guideTourState;
        if (worldReadyForHud && callbacksRef.current.onNearbyNpcsChange) {
          const nearbyCandidates = studioNearbyNpcCandidates(npcViews, currentPoint);
          const key = studioNearbyNpcIdsKey(nearbyCandidates.map((candidate) => candidate.view));
          if (key !== nearbyNpcKey) {
            nearbyNpcKey = key;
            callbacksRef.current.onNearbyNpcsChange(nearbyCandidates.flatMap(({ view, distance }): StudioVirtualSpaceNearbyNpc[] => {
              const npc = npcs.get(view.id);
              if (!npc) return [];
              const identity = studioNpcLabel(npc.definition);
              const doing = studioNpcActivityLabel(npc.definition, view.phase);
              return [{ id: view.id, npc: npc.definition, labelKo: identity.ko, labelEn: identity.en,
                activityKo: doing.ko, activityEn: doing.en, skinKey: npc.definition.skinKey, distance,
                interaction: studioNpcInteraction(manifest, npc.definition) }];
            }));
          }
        }
        const npcInterest = studioTownInterestSnapshot(manifest, currentPoint, npcViews.map((view) => ({
          id: "npc:" + view.id, point: view.point, kind: "npc" as const, important: view.id === tourState?.guideId,
        })), currentQualityProfile.interestRadius);
        let visibleNpcCount = 0;
        const worldView = this.cameras.main.worldView;
        const chatterActors: StudioNpcChatterActor[] = [];
        for (const view of npcViews) {
          const npc = npcs.get(view.id);
          if (!npc) continue;
          chatterActors.push({
            id: view.id, role: studioNpcRole(npc.definition), point: view.point, phase: view.phase, greeting: view.greeting,
            visible: view.point.x >= worldView.x && view.point.x <= worldView.right && view.point.y >= worldView.y && view.point.y <= worldView.bottom,
          });
        }
        const chatterQuiet = blocked || atmosphereRef.current === "focus" || activity === "focused" || activity === "away";
        chatterBubbles = chatter.step({ time, actors: chatterActors, quiet: chatterQuiet, reducedMotion: reducedMotion.matches });
        for (const reaction of pendingEmoteReactions.splice(0)) {
          chatter.reactToPlayerEmote(reaction.emote, time, reaction.point ?? currentPoint, chatterActors, chatterQuiet);
        }
        for (const response of chatter.dueResponses(time)) emotes?.play(`npc:${response.npcId}`, response.emote, time, "npc");
        const speechByNpc = new Map(chatterBubbles.map((bubble) => [bubble.npcId, bubble] as const));
        // 매 프레임 JSON 직렬화 대신 바뀔 수 있는 필드만 이은 짧은 키로 변화를 비교한다.
        const tourKey = tourState
          ? `${tourState.requestId}|${tourState.guideId}|${tourState.status}|${tourState.stopIndex}|${tourState.stopCount}|${tourState.stopAction ?? ""}` : "";
        if (tourState && tourKey !== lastGuideState) { lastGuideState = tourKey; callbacksRef.current.onGuideTourChange?.(tourState); }
        for (const view of npcViews) {
          const npc = npcs.get(view.id);
          if (!npc) continue;
          const importantNpc = view.id === tourState?.guideId;
          const npcVisible = importantNpc || (npcInterest.activeIds.has("npc:" + view.id) && visibleNpcCount < maxActiveNpcs);
          if (npcVisible) visibleNpcCount += 1;
          npc.sprite.setVisible(npcVisible);
          npc.shadow.setVisible(npcVisible);
          if (!npcVisible) {
            npc.label.setVisible(false);
            emotes?.place(`npc:${view.id}`, 0, 0, 1, time, reducedMotion.matches, false);
            speech?.hide(`npc:${view.id}`);
            continue;
          }
          npc.phase = view.phase;
          npc.groundPoint = view.point;
          const attached = view.seatAttachmentPoint && scene.textures.exists(studioCharacterPoseTextureKey(npc.skin, "sit"));
          const groundPoint = attached ? view.seatAttachmentPoint! : view.point;
          const visualPoint = studioProjectTownPoint(manifest, groundPoint);
          const shadowPoint = studioProjectTownPoint(manifest, view.point);
          const npcEmote = emotes?.activeId(`npc:${view.id}`, time) ?? null;
          const npcEmotePose = view.moving || attached ? null : emotes?.pose(`npc:${view.id}`, time, reducedMotion.matches) ?? null;
          npc.sprite.setPosition(visualPoint.x + (npcEmotePose?.bodyX ?? 0), visualPoint.y + (npcEmotePose?.bodyY ?? 0))
            .setAngle(npcEmotePose?.bodyAngle ?? 0)
            .setDepth(studioTownDepthForPoint(manifest, groundPoint, 1_000)).setData("seatAttached", Boolean(attached));
          npc.sprite.setData("activityStage", view.activityStage).setData("activityAnchorId", view.activityAnchorId);
          npc.sprite.setData("walkDistance", view.distance).setData("actorReaction", npcEmote);
          // 다가온 사람을 돌아본다(서 있을 때만). 대화 중(HUD 대화 포커스)인 NPC는 말하는 동작을 한다.
          const npcGap = Math.hypot(view.point.x - currentPoint.x, view.point.y - currentPoint.y);
          const lookAtPlayer = !view.moving && !attached && !blocked && npcGap < NPC_LOOK_DISTANCE;
          const talking = lookAtPlayer && conversationFocus !== null
            && Math.hypot(conversationFocus.x - view.point.x, conversationFocus.y - view.point.y) < 32;
          applySpriteVisual(npc.sprite, npc.skin,
            studioEmoteFacing(npcEmotePose) ?? (lookAtPlayer ? studioFacingToward(currentPoint.x - view.point.x, currentPoint.y - view.point.y) : view.facing),
            npcEmote === "wave" && !view.moving && !attached ? "wave" : talking ? "talk" : view.animation);
          npc.shadow.setPosition(shadowPoint.x, shadowPoint.y + 1).setDepth(studioTownDepthForPoint(manifest, view.point, 990)).setVisible(!attached);
          const headY = npc.sprite.y - npc.sprite.displayHeight * npc.sprite.originY;
          const identity = studioNpcLabel(npc.definition);
          const npcName = btRef.current(identity.ko, identity.en);
          const npcNameplate = studioVirtualNameplatePresentation({
            name: npcName,
            sessionId: `npc:${view.id}`,
            duplicateCount: 1,
            distance: npcGap,
            mode: experienceRef.current.nameplateMode,
            important: importantNpc || Boolean(view.greeting),
            // NPC가 쉬는 동안은 사람의 "자리 비움"이 아니라 "휴식 중"이다. 잠깐 기다리는 단계에는 상태를 붙이지 않는다.
            activity: view.phase === "inspect" ? "reviewing" : view.phase === "rest" ? "break" : "available",
            translate: btRef.current,
          });
          npc.label.setText(npcNameplate.text).setScale(Math.max(actorVisualScale < 1 ? 1 : 0, npcNameplate.scale) * overlayScale);
          const npcLabelOffset = npc.label.displayHeight + 6 * overlayScale;
          const npcLabelY = attached || actorVisualScale < 1 ? headY - npcLabelOffset : visualPoint.y + 9;
          const npcLabelVisible = npcNameplate.visible
            && (!mobileNameplates || importantNpc || Boolean(view.greeting) || view.id === nearestMobileNpcId);
          npc.label.setPosition(visualPoint.x, npcLabelY)
            .setDepth(attached ? 160_000 : studioTownDepthForPoint(manifest, groundPoint, 1_002))
            .setAlpha(npcNameplate.alpha).setVisible(npcLabelVisible);
          if (npcLabelVisible) {
            const id = `npc:${view.id}`;
            nameplateCandidates.push({
              id, x: npc.label.x, y: npc.label.y, width: npc.label.displayWidth,
              height: npc.label.displayHeight, priority: importantNpc ? 60 : view.greeting ? 35 : 8,
            });
            nameplateBases.set(id, { label: npc.label, x: npc.label.x, y: npc.label.y, status: npcNameplate.status });
          }
          const bubbleBase = headY - (attached || actorVisualScale < 1 ? npcLabelOffset + 2 * overlayScale : 4);
          const emoteHeight = emotes?.place(`npc:${view.id}`, visualPoint.x, bubbleBase, overlayScale, time, reducedMotion.matches) ?? 0;
          // 이벤트 디렉터가 고른 인사 대사(다가오면 1회)가 잡담보다 먼저 보인다.
          const greetingLine = eventFeed.greeting(view.id, time);
          const line = greetingLine ?? speechByNpc.get(view.id)?.text;
          if (line) {
            speech?.show(`npc:${view.id}`, btRef.current(line.ko, line.en), "npc");
            speech?.place(`npc:${view.id}`, visualPoint.x, bubbleBase - emoteHeight, overlayScale);
          } else speech?.hide(`npc:${view.id}`);
        }

        // 가장 가까운 상호작용 또는 NPC 하나에만 'E' 키캡과 바닥 링을 띄운다(interactionRings 설정과 무관).
        const promptCandidates: StudioWorldPromptCandidate[] = [];
        if (promptInteraction) promptCandidates.push({ id: promptInteraction.id, kind: "interaction", point: promptInteraction.point,
          radius: promptInteraction.radius, labelKo: promptInteraction.labelKo, labelEn: promptInteraction.labelEn });
        if (nearbyNpc && npcInteraction) {
          const identity = studioNpcLabel(nearbyNpc.definition);
          promptCandidates.push({ id: nearbyNpc.definition.id, kind: "npc", point: nearbyNpc.groundPoint, radius: 55,
            labelKo: `${identity.ko} · 대화`, labelEn: `${identity.en} · Talk` });
        }
        const promptTarget = blocked ? null : studioWorldPromptTarget(currentPoint, promptCandidates);
        const promptNpc = promptTarget?.kind === "npc" ? npcs.get(promptTarget.id) : undefined;
        promptRuntime?.update(promptTarget ? {
          target: promptTarget,
          anchorY: promptNpc
            ? promptNpc.sprite.y - promptNpc.sprite.displayHeight * promptNpc.sprite.originY - 26 * overlayScale
            : promptTarget.point.y - 58,
          label: btRef.current(promptTarget.labelKo, promptTarget.labelEn),
        } : null, time, reducedMotion.matches, overlayScale);
        // 대화할 수 있을 만큼 가까워지면 NPC 머리 위에 '!'가 뜬다(같은 NPC는 15초에 한 번).
        const promptNpcId = promptNpc ? promptNpc.definition.id : null;
        if (promptNpcId !== lastPromptNpcId) {
          lastPromptNpcId = promptNpcId;
          if (promptNpcId && time - (npcNoticedAt.get(promptNpcId) ?? -Infinity) >= NPC_NOTICE_COOLDOWN_MS) {
            npcNoticedAt.set(promptNpcId, time);
            emotes?.play(`npc:${promptNpcId}`, "exclaim", time, "npc");
          }
        }
        // 이벤트 디렉터(150ms 간격): 환영·미니게임 초대·오브젝트 강조·NPC 인사·동료 접근·타운 이벤트 → onSpaceUiEvent.
        if (worldReadyForHud && !blocked && eventFeed.due(time)) {
          const phasePreference = environmentRef.current.dayPhase;
          eventFeed.begin(time, identityRef.current, currentPoint.x, currentPoint.y, speed,
            phasePreference === "auto" ? studioVirtualDayPhase(time) : phasePreference);
          for (const [id, peer] of peers) eventFeed.addPeer(id, peer.displayName, peer.targetX, peer.targetY);
          for (const npc of npcs.values()) {
            if (!npc.sprite.visible) continue;
            const identity = studioNpcLabel(npc.definition);
            eventFeed.addNpc(npc.definition.id, btRef.current(identity.ko, identity.en), npc.groundPoint.x, npc.groundPoint.y);
          }
          eventFeed.run();
        }
        if (campusRuntime && campusFrame) {
          // 캠퍼스 근접 연출(액자 스포트라이트·오락기 빛·게이트 고리·무대 조명)과 생동감(나비·새·물고기·김·반딧불).
          campusFrame.time = time;
          campusFrame.reducedMotion = reducedMotion.matches;
          campusFrame.playerX = currentPoint.x;
          campusFrame.playerY = currentPoint.y;
          const phasePreference = environmentRef.current.dayPhase;
          campusFrame.phase = phasePreference === "auto" ? studioVirtualDayPhase(time) : phasePreference;
          campusFrame.quality = currentQualityProfile;
          campusRuntime.update(campusFrame);
        }

        const nameplateLayout = layoutStudioVirtualNameplates(nameplateCandidates);
        for (const [id, base] of nameplateBases) {
          const offset = nameplateLayout.get(id) ?? { x: 0, y: 0 };
          base.label.setPosition(base.x + offset.x, base.y + offset.y);
          syncStatusDot(id, base.label, base.status);
        }
        for (const [id, dot] of statusDots) if (!nameplateBases.has(id)) dot.setVisible(false);

        if (metricsCallbackRef.current && time - lastMetricsAt >= 1_000) {
          lastMetricsAt = time;
          metricsCallbackRef.current(sanitizeStudioVirtualRuntimeMetrics({
            fps: qualitySample.fps,
            frameTimeMs: qualitySample.frameTimeMs,
            qualityTier: currentQualityProfile.tier,
            peerCount: peers.size,
            visiblePeerCount: peerInterest.activeIds.size,
            npcCount: npcs.size,
            visibleNpcCount,
            routeWaypoints: path.length,
            failedTextures: failedTextures.size,
            updatedAt: Date.now(),
          }));
        }

        const changed = !lastPublishedPoint || Math.hypot(localBody.x - lastPublishedPoint.x, localBody.y - lastPublishedPoint.y) > 0.02
          || nextMoving !== lastPublishedMoving || facing !== lastPublishedFacing || poseFrame.pose !== lastPublishedPose;
        const shouldPublish = changed && (time - lastPublishAt >= 80 || nextMoving !== lastPublishedMoving || Boolean(portal) || Boolean(teleportTarget));
        if (shouldPublish) {
          const point = { x: localBodyPhysics.center.x, y: localBodyPhysics.center.y };
          callbacksRef.current.onLocalState({
            point,
            facing,
            moving: nextMoving,
            zoneId: studioWorldRoomAt(manifest, point),
            pose: poseFrame.pose,
          });
          lastPublishedPoint = point;
          lastPublishAt = time;
          lastPublishedMoving = nextMoving;
          lastPublishedFacing = facing;
          lastPublishedPose = poseFrame.pose;
        }
        if (import.meta.env.DEV && time - lastDiagnosticAt >= 250) {
          lastDiagnosticAt = time;
          parent.dataset.localX = currentPoint.x.toFixed(3);
          parent.dataset.localY = currentPoint.y.toFixed(3);
          parent.dataset.cameraScroll = `${Math.round(this.cameras.main.scrollX)},${Math.round(this.cameras.main.scrollY)},${this.cameras.main.zoom.toFixed(3)}`;
          parent.dataset.renderX = rendered.x.toFixed(3);
          parent.dataset.renderY = rendered.y.toFixed(3);
          parent.dataset.visualX = localSprite.x.toFixed(3);
          parent.dataset.visualY = localSprite.y.toFixed(3);
          parent.dataset.spriteOriginY = localSprite.originY.toFixed(6);
          parent.dataset.spriteHeight = localSprite.displayHeight.toFixed(3);
          parent.dataset.seated = String(Boolean(localSeat));
          parent.dataset.walkFrame = String(localSprite.frame.name);
          parent.dataset.pathLength = String(path.length);
          parent.dataset.loadedWalkSheets = String(this.textures.getTextureKeys().filter((key) => key.includes("walk-sheet")).length);
          parent.dataset.loadedActionSheets = String(this.textures.getTextureKeys().filter((key) => /-(talk|draw|review)-sheet-/u.test(key)).length);
          parent.dataset.walkDistance = localDistance.toFixed(2);
          parent.dataset.walkSpeed = String(playerLocomotion.walkSpeed);
          parent.dataset.gaitDistancePerCycle = String(playerLocomotion.gaitDistancePerCycle ?? "native");
          parent.dataset.pixelRatio = viewport.ratio.toFixed(2);
          parent.dataset.localMoving = String(nextMoving);
          parent.dataset.localFacing = facing;
          parent.dataset.terrain = terrain.kind;
          parent.dataset.pathAllowed = String(studioWorldCanOccupy(navigationWorld, currentPoint));
          parent.dataset.dayPhase = environmentRef.current.dayPhase === "auto"
            ? studioVirtualDayPhase(time) : environmentRef.current.dayPhase;
          parent.dataset.weather = environmentRef.current.weather;
          parent.dataset.backdrop = environmentRef.current.backdrop;
          parent.dataset.livingWorld = String(Boolean(livingWorld));
          parent.dataset.objectPhysics = String(Boolean(objectRuntime));
          parent.dataset.decorationCount = String(decorationsRef.current.placements.length);
          parent.dataset.environmentInteractions = String(studioTownEnvironmentInteractions().length);
          parent.dataset.interestKey = peerInterest.key;
          parent.dataset.activePeerVisuals = String(peerInterest.activeIds.size);
          parent.dataset.activeNpcVisuals = String(visibleNpcCount);
          parent.dataset.maxParticles = String(Math.round(runtimeBudget.maxParticles * currentQualityProfile.particleRatio));
          parent.dataset.qualityTier = currentQualityProfile.tier;
          parent.dataset.controlMode = experienceRef.current.controlMode;
          parent.dataset.cameraPreference = experienceRef.current.cameraMode;
          parent.dataset.texture = localSprite.texture.key;
          parent.dataset.appearanceIssues = JSON.stringify(localSprite.getData("appearanceIssues") ?? []);
          parent.dataset.reaction = shownLocalEmote ?? "";
          parent.dataset.npcSpeech = JSON.stringify(chatterBubbles.map((bubble) => ({ id: bubble.npcId, ko: bubble.text.ko })));
          parent.dataset.emoteSequence = String(emotes?.sequence("self") ?? 0);
          parent.dataset.frameTime = time.toFixed(0);
          parent.dataset.emoteDebug = emotes?.debug("self") ?? "";
          parent.dataset.peers = JSON.stringify([...peers].map(([id, peer]) => ({ id, x: peer.sprite.x, y: peer.sprite.y, targetX: peer.targetX, targetY: peer.targetY, texture: peer.sprite.texture.key, reaction: emotes?.activeId(`peer:${id}`, time) ?? "" })));
          parent.dataset.npcs = JSON.stringify([...npcs].map(([id, npc]) => ({ id, x: npc.sprite.x, y: npc.sprite.y, floor: npc.groundPoint, phase: npc.phase, stage: npc.sprite.getData("activityStage"), anchor: npc.sprite.getData("activityAnchorId"), texture: npc.sprite.texture.key,
            frame: npc.sprite.frame.name, originX: npc.sprite.originX, originY: npc.sprite.originY,
            displayWidth: npc.sprite.displayWidth, displayHeight: npc.sprite.displayHeight })));
          parent.dataset.props = JSON.stringify(manifest.props.filter((prop) => prop.assetUrl).map((prop) => ({ id: prop.id, depth: studioWorldPropDepth(prop) })));
        }
        moving = nextMoving;
      };

      const rendererType = renderer === "canvas"
        ? Phaser.CANVAS
        : renderer === "webgl"
          ? Phaser.WEBGL
          : Phaser.AUTO;
      game = new Phaser.Game({
        type: rendererType,
        parent: mount,
        loader: { timeout: 15000, maxParallelDownloads: 6 },
        transparent: false,
        backgroundColor: "#17181b",
        antialias: !artProfile.pixelated,
        roundPixels: artProfile.pixelated,
        pixelArt: artProfile.pixelated,
        scale: {
          mode: Phaser.Scale.NONE,
          width: viewport.width,
          height: viewport.height,
          zoom: 1 / viewport.ratio,
        },
        physics: {
          default: "arcade",
          arcade: {
            debug: false,
            gravity: { x: 0, y: 0 },
            fps: 60,
            fixedStep: true,
          },
        },
        scene,
      });
      if (parent.dataset.bootStage === "preparing-scene") parent.dataset.bootStage = "booting-game";
      const resize = () => {
        if (cancelled || !mount.isConnected) return;
        const rect = parent.getBoundingClientRect();
        const next = studioRenderViewport(
          rect.width,
          rect.height,
          Math.min(globalThis.devicePixelRatio || 1, currentQualityProfile.dprCap),
        );
        mount.style.width = `${next.cssWidth}px`; mount.style.height = `${next.cssHeight}px`;
        if (game?.isBooted && (next.width !== viewport.width || next.height !== viewport.height || next.ratio !== viewport.ratio)) {
          viewport = next;
          game.scale.setZoom(1 / next.ratio);
          game.scale.resize(next.width, next.height);
        }
      };
      resizeRuntime = resize;
      const observer = new ResizeObserver(resize);
      observer.observe(parent);
      globalThis.addEventListener("resize", resize);
      cleanup.push(() => { observer.disconnect(); globalThis.removeEventListener("resize", resize); });
    })().catch(fail);

    return () => {
      cancelled = true;
      sceneReady = false;
      cleanup.forEach((dispose) => dispose());
      bridge.clearMovement();
      runtimeRef.current = null;
      callbacksRef.current.onNearbyInteractionChange?.(null);
      game?.destroy(true);
      mount.remove();
    };
  }, [artStyle, attempt, bridge, debugWorld, environmentPreference.backdrop, manifest, renderer, worldAssetUrls]);

  return (
    <div
      ref={hostRef}
      className="studio-vspace-phaser-canvas absolute inset-0 z-[2]"
      data-studio-phaser-runtime="true"
      data-studio-engine-status={failure ? "error" : ready ? "ready" : "loading"}
      data-world-id={manifest.id}
      data-world-kind={studioVirtualWorldKind(manifest)}
      data-art-style={artStyle}
      data-backdrop={environmentPreference.backdrop}
    >
      {failure ? (
        <div className="studio-vspace-engine-message" role="alert">
          <p>{bt("공간을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.", "The studio could not load. Check the connection and retry.")}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>{bt("다시 시도", "Retry")}</button>
        </div>
      ) : !ready ? (
        <div className="studio-vspace-engine-message" role="status">{bt("스튜디오 불러오는 중…", "Loading studio…")}</div>
      ) : null}
    </div>
  );
}
