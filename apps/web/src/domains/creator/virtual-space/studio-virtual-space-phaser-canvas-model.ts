import type { StudioPeerTimeline } from "./studio-virtual-space-presentation";
import type { StudioNpcAtmosphere, StudioNpcPhase } from "./studio-virtual-space-npc-director";
import type { StudioVirtualNpcGuideTourRequest, StudioVirtualNpcGuideTourState } from "./studio-virtual-space-npc-guide";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioSpaceThemeKey } from "./studio-virtual-space-theme";
import type { StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import type { StudioVirtualExperiencePreference } from "./studio-virtual-space-experience-preference";
import type { StudioVirtualEnvironmentPreference } from "./studio-virtual-space-environment-preference";
import type { StudioVirtualRuntimeMetrics } from "./studio-virtual-space-observability";
import type { StudioSpacePose } from "./studio-virtual-space-pose-controller";
import type { StudioCharacterMotionState, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import type { StudioEmotePose } from "./studio-virtual-space-emote-runtime";
import type { StudioTileEffectDefinition, StudioTileEffectTrigger } from "./studio-virtual-space-tile-effects";
import type {
  StudioVirtualSpaceFacing,
  StudioVirtualSpacePeer,
  StudioVirtualSpacePoint,
} from "./studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import type {
  StudioSpaceUiEvent,
  StudioVirtualSpaceEngineStatus,
  StudioVirtualSpaceNearbyNpc,
  StudioVirtualSpaceZoneChange,
} from "./studio-virtual-space-engine-events";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionDefinition,
  StudioWorldNpcDefinition,
  StudioWorldPortalDefinition,
  StudioWorldPropDefinition,
} from "./studio-virtual-space-world-manifest";

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
  /** 공간 테마(트랙 H): 바닥·벽·배경 스타일. 없으면 테마 미적용(기존 렌더 그대로). */
  readonly spaceTheme?: StudioSpaceThemeKey;
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

export interface InputEventLike {
  stopPropagation(): void;
}

export interface PeerVisual {
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
  /** 말풍선 채팅 텍스트. 있으면 프레즌스 말풍선보다 먼저 보인다. */
  chatBubble?: string | null;
  /** 채팅 입력 중인지. 말풍선이 없을 때 타이핑 말풍선(···)으로 보인다. */
  typing?: boolean;
}

/** 대상 쪽을 보는 방향(객체를 만들지 않는다). 가로가 더 멀면 좌우, 아니면 상하. */
export function studioFacingToward(dx: number, dy: number): StudioVirtualSpaceFacing {
  return Math.abs(dx) > Math.abs(dy) ? dx < 0 ? "left" : "right" : dy < 0 ? "up" : "down";
}

/** NPC가 다가온 사람을 돌아보는 거리와, 같은 NPC가 다시 '!'로 반응하기까지의 간격. */
export const NPC_LOOK_DISTANCE = 96;
export const NPC_NOTICE_COOLDOWN_MS = 15_000;

export interface OcclusionVisual {
  readonly polygon: readonly StudioVirtualSpacePoint[];
  readonly object: import("phaser").GameObjects.Image | import("phaser").GameObjects.Graphics;
  readonly outsideAlpha: number;
}

export interface NpcVisual {
  readonly definition: StudioWorldNpcDefinition;
  readonly skin: StudioCharacterSkin;
  readonly sprite: import("phaser").GameObjects.Sprite;
  readonly label: import("phaser").GameObjects.Text;
  readonly shadow: import("phaser").GameObjects.Ellipse;
  phase: StudioNpcPhase;
  groundPoint: StudioVirtualSpacePoint;
}

export function activityState(
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
export const STUDIO_EMOTE_DEDUPE_MS = 220;

/** 춤은 방향 프레임을 순환하고, 표정이 있는 이모트는 정면(down)을 보게 해 표정 시트를 쓴다. */
export function studioEmoteFacing(pose: StudioEmotePose | null): StudioVirtualSpaceFacing | null {
  if (!pose) return null;
  return pose.facing ?? (pose.expression ? "down" : null);
}

/** 캔버스 포커스에서 월드가 소유하는 키. 1~9·Z·M·P 등 HUD 단축키는 여기에 넣지 않는다. */
export const WORLD_KEY_CODES: ReadonlySet<string> = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "KeyX", "KeyG",
]);

/** 입력 요소나 편집 가능한 요소에 포커스가 있으면 월드가 포커스를 빼앗지 않는다. */
export function studioWorldMayTakeFocus(active: Element | null, stage: Element | null): boolean {
  if (!active || active === document.body || active === document.documentElement) return true;
  if (active.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return false;
  return Boolean(stage?.contains(active));
}

export function propTextureKey(prop: StudioWorldPropDefinition): string {
  return `studio-world-prop-${prop.assetKey ?? prop.id}`;
}

export const EMPTY_DECORATIONS: StudioVirtualDecorationState = Object.freeze({
  presetKey: "minimal",
  districtKey: "story-terrace",
  presentationMode: "minimal",
  placements: Object.freeze([]),
  revision: 0,
});

export function nearestInteraction(
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
