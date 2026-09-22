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
  StudioNpcDirector, studioNpcActivityLabel, studioNpcInteraction, studioNpcLabel,
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
  studioWorldHasModalBlocker,
  studioWorldInputBlocked,
  studioWorldPresenceZone,
  type StudioWorldApproachState,
  type StudioWorldWalkOverState,
} from "./studio-virtual-space-runtime-policy";

import { readStudioVirtualSpaceGamepadsInput } from "./studio-virtual-space-gamepad";
import {
  STUDIO_VIRTUAL_SPACE_WALK_SPEED,
} from "./studio-virtual-space-navigation";
import {
  DEFAULT_STUDIO_MOTION_CONFIG,
  stepStudioVirtualSpaceMotion,
} from "./studio-virtual-space-motion";
import {
  STUDIO_CHARACTER_SKINS,
  studioCharacterSkinByKey,
  resolveStudioCharacterAppearance,
  studioCharacterWalkClip,
  studioCharacterActionClip,
  type StudioCharacterMotionState,
  type StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";
import {
  StudioCharacterAssetResidency,
  studioCharacterFrameGeometry,
  studioCharacterActionTextureKey,
  studioCharacterActionFrame,
  studioCharacterActionSheetMatches,
  studioCharacterPoseTextureKey,
  studioCharacterStaticAsset,
  studioCharacterStaticTextureKey as staticTextureKey,
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

export interface StudioVirtualSpaceEngineLocalState {
  readonly point: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
  readonly moving: boolean;
  readonly zoneId: string;
}

export interface StudioVirtualSpacePhaserCanvasProps {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  /** Decoded publication bytes, owned and disposed by the publication controller. */
  readonly worldAssetUrls?: ReadonlyMap<string, string>;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly selfIdentity?: string;
  /** AUTO in product; Canvas is useful for lifecycle-only browser harnesses. */
  readonly renderer?: "auto" | "webgl" | "canvas";
  readonly debugWorld?: boolean;
  readonly atmosphere?: StudioNpcAtmosphere;
  readonly selfPose?: { readonly state: "sit"; readonly facing: StudioVirtualSpaceFacing };
  readonly waveActorIds?: readonly string[];
  /** Membership/lease authority belongs to the caller. Anchor attaches the rendered hips only. */
  readonly seatedActors?: readonly { readonly id: string; readonly anchorPoint: StudioVirtualSpacePoint; readonly facing: StudioVirtualSpaceFacing }[];
  readonly onNpcInteract?: (interaction: StudioWorldInteractionDefinition) => void;
  readonly guideTourRequest?: StudioVirtualNpcGuideTourRequest | null;
  readonly onGuideTourChange?: (state: StudioVirtualNpcGuideTourState) => void;
  readonly onLocalState: (state: StudioVirtualSpaceEngineLocalState) => void;
  readonly onInteract: (interaction: StudioWorldInteractionDefinition | null) => void;
  readonly onNearbyInteractionChange?: (interaction: StudioWorldInteractionDefinition | null) => void;
  readonly onPeerSelect: (sessionId: string) => void;
  readonly onCancelFollow: () => void;
  readonly onPortal?: (portal: StudioWorldPortalDefinition) => void;
}

interface InputEventLike {
  stopPropagation(): void;
}

interface PeerVisual {
  readonly timeline: StudioPeerTimeline;
  readonly sprite: import("phaser").GameObjects.Sprite;
  readonly label: import("phaser").GameObjects.Text;
  readonly reaction: import("phaser").GameObjects.Text;
  targetX: number;
  targetY: number;
  avatarIndex: number;
  appearance?: StudioVirtualSpacePeer["state"]["appearance"];
  facing: StudioVirtualSpaceFacing;
  moving: boolean;
  activity: StudioVirtualSpacePeer["state"]["activity"];
  nearby: boolean;
}

interface NpcVisual {
  readonly definition: StudioWorldNpcDefinition;
  readonly skin: StudioCharacterSkin;
  readonly sprite: import("phaser").GameObjects.Sprite;
  readonly label: import("phaser").GameObjects.Text;
  readonly reaction: import("phaser").GameObjects.Text;
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

function interactionMarkerText(interaction: StudioWorldInteractionDefinition): string {
  const emojiByAction: Record<string, string> = {
    assistant: "🤖",
    assets: "📦",
    canvas: "🎨",
    community: "☕",
    comic: "🖼️",
    live: "🎬",
    review: "✅",
    story: "📝",
  };
  return emojiByAction[interaction.action] ?? "✦";
}

function propTextureKey(prop: StudioWorldPropDefinition): string {
  return `studio-world-prop-${prop.assetKey ?? prop.id}`;
}

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
  renderer = "auto",
  debugWorld = false,
  atmosphere = "balanced",
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
  const guideTourRef = useRef(guideTourRequest);
  guideTourRef.current = guideTourRequest;
  const identityRef = useRef(selfIdentity);
  identityRef.current = selfIdentity;
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
  ]);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return undefined;

    const mount = document.createElement("div");
    mount.className = "studio-vspace-engine-mount";
    parent.append(mount);
    setFailure(false);
    setReady(false);
    let cancelled = false;
    let sceneReady = false;
    const cleanup: (() => void)[] = [];
    const fail = () => { if (!cancelled) { setFailure(true); setReady(false); } };
    const bootDeadline = globalThis.setTimeout(fail, 25000);
    cleanup.push(() => globalThis.clearTimeout(bootDeadline));
    let game: import("phaser").Game | null = null;

    void (async () => {
      // React StrictMode can destroy and recreate this WebGL game in the same task.
      // Yield one frame so Chromium releases the previous framebuffer before Phaser
      // allocates the replacement, and never let RESIZE observe a 0×0 mount.
      await new Promise<void>((resolve) => globalThis.requestAnimationFrame(() => resolve()));
      if (cancelled || !mount.isConnected) return;
      const mountRect = parent.getBoundingClientRect();
      let viewport = studioRenderViewport(mountRect.width, mountRect.height, globalThis.devicePixelRatio || 1);
      mount.style.width = `${Math.max(1, Math.round(mountRect.width || parent.clientWidth || 1))}px`;
      mount.style.height = `${Math.max(1, Math.round(mountRect.height || parent.clientHeight || 1))}px`;

      const Phaser = await import("phaser");
      if (cancelled || !mount.isConnected) return;

      const reducedMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
      const scene = new Phaser.Scene("ToonSpectrumVirtualStudio") as import("phaser").Scene & {
        preload: () => void;
        create: () => void;
        update: (time: number, deltaMs: number) => void;
      };
      const peers = new Map<string, PeerVisual>();
      const npcs = new Map<string, NpcVisual>();
      const npcDirector = new StudioNpcDirector(manifest);
      cleanup.push(() => npcDirector.dispose());
      let lastGuideRequestId: string | null = null;
      let lastGuideState = "";
      const interactionMarkers = new Map<string, import("phaser").GameObjects.Text>();
      const interactions = studioWorldInteractions(manifest);
      const portals = studioWorldPortals(manifest);
      const backgroundTextureKey = `studio-world-background-${manifest.backgroundAssetKey}`;
      const portalTracker = new StudioWorldPortalTracker();
      const zoneTracker = new StudioWorldZoneTracker();
      const failedTextures = new Set<string>();
      const fallbackAsset = studioCharacterStaticAsset(STUDIO_CHARACTER_SKINS[0]!, "down");
      const bootSelfAsset = studioCharacterStaticAsset(
        resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current).skin,
        snapshotRef.current.self.facing,
      );
      const characterAssets = new StudioCharacterAssetResidency({
        has: (asset) => scene.textures.exists(asset.key),
        load: (asset, complete) => {
          const event = `filecomplete-${asset.type}-${asset.key}`;
          const loaded = () => complete(true);
          const failed = (file: import("phaser").Loader.File) => {
            if (file.key === asset.key) complete(false);
          };
          scene.load.once(event, loaded);
          scene.load.on("loaderror", failed);
          if (asset.type === "spritesheet") {
            scene.load.spritesheet(asset.key, asset.url, { frameWidth: asset.frameWidth!, frameHeight: asset.frameHeight! });
          } else scene.load.image(asset.key, asset.url);
          scene.load.start();
          return () => { scene.load.off(event, loaded); scene.load.off("loaderror", failed); };
        },
        remove: (asset) => {
          if (asset.animationKey && scene.anims.exists(asset.animationKey)) scene.anims.remove(asset.animationKey);
          if (scene.textures.exists(asset.key)) scene.textures.remove(asset.key);
        },
      });
      cleanup.push(() => characterAssets.close());
      const interactionById = new Map(interactions.map((interaction) => [interaction.id, interaction] as const));

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
      let localReaction: import("phaser").GameObjects.Text | null = null;
      let path: readonly StudioVirtualSpacePoint[] = [];
      let approachState: StudioWorldApproachState = EMPTY_STUDIO_WORLD_APPROACH;
      let queuedInteraction: StudioWorldInteractionDefinition | null = null;
      let walkOverState: StudioWorldWalkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
      let queuedWalkOver: { id: string; point: StudioVirtualSpacePoint } | null = null;
      let zoneVeil: import("phaser").GameObjects.Graphics | null = null;
      let highlightRing: import("phaser").GameObjects.Graphics | null = null;
      let zoneNote: HTMLParagraphElement | null = null;
      let routeOverlay: import("phaser").GameObjects.Graphics | null = null;
      let motion = { velocity: { x: 0, y: 0 } };
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

      const ensureWalkAnimation = (skin: StudioCharacterSkin, direction: StudioVirtualSpaceFacing) => {
        const clip = studioCharacterWalkClip(skin, direction);
        const key = walkSheetKey(skin, direction);
        if (!clip || cancelled || !scene.textures.exists(key) || scene.anims.exists(walkAnimationKey(skin, direction))) return;
        const texture = scene.textures.get(key);
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
      const applySpriteVisual = (
        sprite: import("phaser").GameObjects.Sprite,
        skin: StudioCharacterSkin,
        nextFacing: StudioVirtualSpaceFacing,
        nextState: StudioCharacterMotionState,
      ) => {
        const owner = sprite.getData("assetOwner") as string;
        if (sceneReady && owner) characterAssets.use(owner, studioCharacterVisualAssets(skin, nextFacing, nextState), sprite.texture.key);
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
        const pose = nextState === "wave" || nextState === "sit" ? skin.poses?.[nextState] : undefined;
        if (pose && (nextState === "wave" || nextState === "sit")) {
          const poseKey = studioCharacterPoseTextureKey(skin, nextState);
          if (scene.textures.exists(poseKey)) {
            if (sprite.anims.isPlaying) sprite.stop();
            const frame = pose.directionFrames[nextFacing];
            sprite.setTexture(poseKey, frame).setData("framePresentation", pose.frames[frame]);
            updateDisplaySize(sprite);
            return;
          }
        }
        if (nextState === "walk") {
          const clip = studioCharacterWalkClip(skin, nextFacing);
          const animationKey = walkAnimationKey(skin, nextFacing);
          ensureWalkAnimation(skin, nextFacing);
          if (clip && scene.anims.exists(animationKey)) {
            if (clip.distancePerCycle || reducedMotion.matches) {
              if (sprite.anims.isPlaying) sprite.stop();
              const frame = clip.start + (reducedMotion.matches ? 0 : studioGaitFrame(
                Number(sprite.getData("walkDistance") ?? 0), clip.end - clip.start + 1, clip.distancePerCycle,
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
        const key = staticTextureKey(skin, nextFacing, nextState);
        const directional = staticTextureKey(skin, nextFacing);
        const texture = scene.textures.exists(key) ? key
          : scene.textures.exists(directional) ? directional
            : scene.textures.exists(sprite.texture.key) ? sprite.texture.key : fallbackAsset.key;
        if (scene.textures.exists(texture) && sprite.texture.key !== texture) {
          sprite.setTexture(texture).setData("framePresentation", undefined);
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
        const resolved = resolveStudioCharacterAppearance(avatar, identity, nextState === "walk" ? `walk-${nextFacing}` : nextState);
        const state = resolved.clip.startsWith("walk-") ? "walk" : resolved.clip as StudioCharacterMotionState;
        sprite.setData("appearanceIssues", resolved.issues);
        applySpriteVisual(sprite, resolved.skin, nextFacing, state);
      };

      const getPeerSnapshot = (id: string) =>
        snapshotRef.current.peers.find((peer) => peer.participant.sessionId === id);

      const setPathTo = (point: StudioVirtualSpacePoint) => {
        if (!localBody) return;
        path = findStudioWorldPath(
          manifest,
          { x: localBodyPhysics?.center.x ?? localBody.x, y: localBodyPhysics?.center.y ?? localBody.y },
          point,
        );
      };

      const syncPeer = (peer: StudioVirtualSpacePeer, nearby: boolean) => {
        const id = peer.participant.sessionId;
        let visual = peers.get(id);
        const state = activityState(peer.state.moving, nearby, peer.state.activity);
        const skin = resolveStudioCharacterAppearance(peer.state, id).skin;
        const key = staticTextureKey(skin, peer.state.facing, state);
        if (!visual) {
          const sprite = scene.add.sprite(peer.state.x, peer.state.y, scene.textures.exists(key) ? key : fallbackAsset.key)
            .setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
            .setData({ visualWidth: 92, visualHeight: 123, assetOwner: `peer:${id}` })
            .setDisplaySize(92, 123)
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
              queuedWalkOver = { id, point: { x: sprite.x, y: sprite.y } };
              bridge.setFollowingPeer(id);
            },
          );
          const label = scene.add.text(peer.state.x, peer.state.y + 18, peer.participant.displayName, {
            fontFamily: "Inter, Pretendard, sans-serif",
            fontSize: "11px",
            color: "#ffffff",
            backgroundColor: "#111827dd",
            padding: { x: 6, y: 3 },
          }).setOrigin(0.5, 0).setDepth(Math.round(peer.state.y) + 1_002);
          const reaction = scene.add.text(peer.state.x, peer.state.y - 125, "", {
            fontSize: "24px", backgroundColor: "#182332", padding: { x: 6, y: 4 },
          }).setOrigin(0.5).setDepth(160_000).setVisible(false);
          visual = {
            timeline: new StudioPeerTimeline(),
            sprite,
            label,
            reaction,
            targetX: peer.state.x,
            targetY: peer.state.y,
            avatarIndex: peer.state.avatarIndex,
            appearance: peer.state.appearance,
            facing: peer.state.facing,
            moving: peer.state.moving,
            activity: peer.state.activity,
            nearby,
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
        visual.targetX = peer.state.x;
        visual.targetY = peer.state.y;
        visual.avatarIndex = peer.state.avatarIndex;
        visual.appearance = peer.state.appearance;
        visual.facing = peer.state.facing;
        visual.moving = peer.state.moving;
        visual.activity = peer.state.activity;
        visual.nearby = nearby;
        applyAvatarVisual(visual.sprite, visual, visual.facing, state, id);
        visual.label.setText(peer.participant.displayName);
        visual.sprite.setAlpha(peer.state.activity === "away" ? 0.62 : 1);
      };

      const reactionGlyph = (reaction: string | null | undefined) => ({ wave: "👋", heart: "💗", sparkles: "✨", "thumbs-up": "👍" })[reaction ?? ""] ?? "";
      const syncSnapshot = (next: StudioVirtualSpaceSnapshot) => {
        if (!sceneReady || cancelled) return;
        const nearby = new Set(next.nearbyPeers.map((peer) => peer.participant.sessionId));
        const present = new Set<string>();
        for (const peer of next.peers) {
          present.add(peer.participant.sessionId);
          syncPeer(peer, nearby.has(peer.participant.sessionId));
          const reaction = next.peerReactions.find((item) => item.sessionId === peer.participant.sessionId && item.expiresAt > Date.now());
          peers.get(peer.participant.sessionId)?.reaction.setText(reactionGlyph(reaction?.reaction)).setVisible(Boolean(reaction));
        }
        for (const [id, visual] of peers) {
          if (present.has(id)) continue;
          visual.sprite.destroy();
          visual.label.destroy();
          visual.reaction.destroy();
          peers.delete(id);
          characterAssets.release(`peer:${id}`);
        }
        if (localBody && localSprite && localBodyPhysics) {
          const distance = Math.hypot(next.self.x - localBody.x, next.self.y - localBody.y);
          if (!moving && distance > 96 && studioWorldCanOccupy(manifest, next.self)) {
            localBody.setPosition(next.self.x, next.self.y);
            localBodyPhysics.reset(next.self.x, next.self.y);
            localPose.reset(next.self, fixedStepClock.time);
            previousRendered = null;
          }
          applyAvatarVisual(
            localSprite,
            next.self,
            facing,
            activityState(moving, false, next.self.activity),
            identityRef.current,
          );
          localReaction?.setText(reactionGlyph(next.selfReaction)).setVisible(Boolean(next.selfReaction));
        }
      };
      const runtime = { syncSnapshot };
      runtimeRef.current = runtime;

      scene.preload = function preload() {
        this.load.on("loaderror", (file: import("phaser").Loader.File) => failedTextures.add(file.key));
        this.load.image(backgroundTextureKey, worldAssetUrls?.get(manifest.backgroundUrl) ?? manifest.backgroundUrl);

        // Ready means the world and a safe actor frame exist, not that every clip has downloaded.
        for (const asset of new Map([fallbackAsset, bootSelfAsset].map((item) => [item.key, item])).values()) {
          this.load.image(asset.key, asset.url);
        }

        const loadedProps = new Set<string>();
        for (const prop of manifest.props) {
          if (!prop.assetUrl) continue;
          const key = propTextureKey(prop);
          if (loadedProps.has(key)) continue;
          loadedProps.add(key);
          this.load.image(key, worldAssetUrls?.get(prop.assetUrl) ?? prop.assetUrl);
        }
      };

      scene.create = function create() {
        if (cancelled) return;
        const fallbackTexture = staticTextureKey(STUDIO_CHARACTER_SKINS[0]!, "down");
        if (failedTextures.has(backgroundTextureKey) || !this.textures.exists(fallbackTexture)) { fail(); return; }
        characterAssets.use("fallback", [fallbackAsset]);
        if (this.textures.exists(bootSelfAsset.key)) characterAssets.use("self", [bootSelfAsset]);
        this.physics.world.setBounds(0, 0, manifest.width, manifest.height);

        const backgroundSource = this.textures.get(backgroundTextureKey).getSourceImage();
        const backgroundRect = studioCoverRect(
          manifest.width,
          manifest.height,
          backgroundSource.width,
          backgroundSource.height,
        );
        this.add.image(backgroundRect.x, backgroundRect.y, backgroundTextureKey)
          .setOrigin(0)
          .setDisplaySize(backgroundRect.width, backgroundRect.height)
          .setDepth(-1_000);

        for (const layer of manifest.occlusionLayers ?? []) {
          const maskGraphics = this.add.graphics().fillStyle(0xffffff).fillPoints([...layer.polygon], true).setVisible(false);
          const mask = maskGraphics.createGeometryMask();
          const foreground = this.add.image(backgroundRect.x, backgroundRect.y, backgroundTextureKey)
            .setOrigin(0).setDisplaySize(backgroundRect.width, backgroundRect.height)
            .setDepth(layer.depth).setMask(mask);
          cleanup.push(() => { foreground.clearMask(true); foreground.destroy(); maskGraphics.destroy(); });
        }

        routeOverlay = this.add.graphics().setDepth(650);
        zoneVeil = this.add.graphics().setDepth(40_000);
        highlightRing = this.add.graphics().setDepth(80_000);

        if (debugWorld) {
          const graphics = this.add.graphics().setDepth(170_000);
          graphics.lineStyle(2, 0x66aaff, 0.86);
          for (const room of manifest.rooms) {
            graphics.strokeRect(room.x, room.y, room.width, room.height);
            this.add.text(room.x + 5, room.y + 5, room.id, {
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "10px",
              color: "#dcecff",
              backgroundColor: "#10233ddd",
              padding: { x: 4, y: 2 },
            }).setDepth(170_001);
          }
          graphics.lineStyle(2, 0xff5f6d, 0.88);
          for (const collider of studioWorldCollisionRects(manifest)) {
            graphics.strokeRect(collider.x, collider.y, collider.width, collider.height);
          }
          graphics.lineStyle(2, 0x4ade80, 0.75);
          for (const interaction of interactions) {
            graphics.strokeCircle(interaction.point.x, interaction.point.y, interaction.radius);
          }
          graphics.lineStyle(2, 0xfacc15, 0.9);
          for (const spawn of manifest.spawns) {
            graphics.strokeCircle(spawn.point.x, spawn.point.y, 10);
            graphics.lineBetween(spawn.point.x - 7, spawn.point.y, spawn.point.x + 7, spawn.point.y);
            graphics.lineBetween(spawn.point.x, spawn.point.y - 7, spawn.point.x, spawn.point.y + 7);
          }
          parent.dataset.authoringOverlay = "true";
        } else {
          delete parent.dataset.authoringOverlay;
        }

        for (const prop of manifest.props) {
          if (!prop.assetUrl || !this.textures.exists(propTextureKey(prop))) continue;
          const image = this.add.image(prop.x, prop.y, propTextureKey(prop))
            .setOrigin(prop.originX ?? 0.5, prop.originY ?? 1)
            .setAngle(prop.rotation ?? 0)
            .setAlpha(Math.max(0, Math.min(1, prop.alpha ?? 1)))
            .setDepth(studioWorldPropDepth(prop));
          if (prop.width && prop.height) {
            image.setDisplaySize(prop.width, prop.height);
          } else {
            image.setScale(prop.scale ?? 1);
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
        const initialPoint = resolveStudioWorldSpawn(manifest, self);
        if (!initialPoint) { fail(); return; }
        facing = studioWorldCanOccupy(manifest, self)
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
          if (localBodyPhysics) localPose.observe(localBodyPhysics.center, fixedStepClock.advance(fixedDelta));
        };
        this.physics.world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, observePhysics);
        cleanup.push(() => this.physics.world.off(Phaser.Physics.Arcade.Events.WORLD_STEP, observePhysics));

        for (const collider of studioWorldCollisionRects(manifest)) {
          const zone = this.add.zone(collider.x, collider.y, collider.width, collider.height).setOrigin(0);
          this.physics.add.existing(zone, true);
          this.physics.add.collider(bodyZone, zone);
        }

        localShadow = this.add.ellipse(initialPoint.x, initialPoint.y + 3, 50, 14, 0x1c1111, 0.28)
          .setDepth(Math.round(initialPoint.y) + 990);
        const localSkin = resolveStudioCharacterAppearance(self, identityRef.current).skin;
        localSprite = this.add.sprite(
          initialPoint.x,
          initialPoint.y,
          this.textures.exists(staticTextureKey(localSkin, facing)) ? staticTextureKey(localSkin, facing) : fallbackAsset.key,
        ).setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
          .setData({ visualWidth: 98, visualHeight: 131, assetOwner: "self" })
          .setDisplaySize(98, 131)
          .setDepth(Math.round(initialPoint.y) + 1_001);
        localLabel = this.add.text(initialPoint.x, initialPoint.y + 20, "ME", {
          fontFamily: "Inter, Pretendard, sans-serif",
          fontSize: "10px",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#7657eedd",
          padding: { x: 6, y: 3 },
        }).setOrigin(0.5, 0).setDepth(Math.round(initialPoint.y) + 1_002);

        localReaction = this.add.text(initialPoint.x, initialPoint.y - 125, "", {
          fontSize: "24px", backgroundColor: "#182332", padding: { x: 6, y: 4 },
        }).setOrigin(0.5).setDepth(160_000).setVisible(false);
        for (const interaction of interactions) {
          const marker = this.add.text(interaction.point.x, interaction.point.y, interactionMarkerText(interaction), {
            fontSize: "18px",
            backgroundColor: "#111827b8",
            padding: { x: 5, y: 4 },
          }).setOrigin(0.5)
            .setDepth(150_000)
            .setAlpha(0.62)
            .setInteractive({ useHandCursor: true });
          marker.on(
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
          interactionMarkers.set(interaction.id, marker);
        }

        for (const portal of portals) {
          this.add.ellipse(
            portal.point.x,
            portal.point.y,
            portal.radius * 1.55,
            portal.radius * 0.72,
            0x8b5cf6,
            0.08,
          ).setStrokeStyle(2, 0x9b7cff, 0.45)
            .setDepth(600);
        }

        for (const view of npcDirector.views) {
          const npcDefinition = manifest.npcs.find((definition) => definition.id === view.id)!;
          const skin = studioCharacterSkinByKey(npcDefinition.skinKey);
          const visualScale = npcDefinition.scale ?? 0.72;
          const identity = studioNpcLabel(npcDefinition);
          const shadow = this.add.ellipse(view.point.x, view.point.y + 1, 30 * visualScale, 10 * visualScale, 0x15151c, 0.2)
            .setDepth(Math.round(view.point.y) + 990);
          const sprite = this.add.sprite(view.point.x, view.point.y, fallbackAsset.key)
            .setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
            .setData({ visualWidth: 92 * visualScale, visualHeight: 123 * visualScale, assetOwner: `npc:${view.id}` })
            .setDisplaySize(92 * visualScale, 123 * visualScale)
            .setDepth(Math.round(view.point.y) + 1_000);
          const selectNpc = (_pointer: import("phaser").Input.Pointer, _x: number, _y: number, event: InputEventLike) => {
            event.stopPropagation();
            if (studioWorldInputBlocked(document, modalInputBlocked)) return;
            const interaction = studioNpcInteraction(manifest, npcDefinition);
            if (interaction) (callbacksRef.current.onNpcInteract ?? callbacksRef.current.onInteract)(interaction);
          };
          if (studioNpcInteraction(manifest, npcDefinition)) {
            sprite.setInteractive({ useHandCursor: true }).on("pointerdown", selectNpc);
          }
          const label = this.add.text(view.point.x, view.point.y + 9, btRef.current(identity.ko, identity.en), {
            fontFamily: "Inter, Pretendard, sans-serif", fontSize: "9px", color: "#f5e9cb",
            backgroundColor: "#292532e8", padding: { x: 5, y: 3 },
          }).setOrigin(0.5, 0).setDepth(Math.round(view.point.y) + 1_002);
          if (studioNpcInteraction(manifest, npcDefinition)) label.setInteractive({ useHandCursor: true }).on("pointerdown", selectNpc);
          const reaction = this.add.text(view.point.x, view.point.y - 123 * visualScale - 8, "", {
            fontFamily: "Inter, Pretendard, sans-serif", fontSize: "10px", color: "#fff8e8",
            backgroundColor: "#292532ed", padding: { x: 6, y: 4 },
          }).setOrigin(0.5, 1).setDepth(140_000).setVisible(false);
          applySpriteVisual(sprite, skin, view.facing, view.animation);
          npcs.set(view.id, { definition: npcDefinition, skin, sprite, label, reaction, shadow, phase: view.phase, groundPoint: view.point });
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
          if (!pointer.leftButtonDown()) return;
          bridge.setFollowingPeer(null);
          callbacksRef.current.onCancelFollow();
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
          queuedInteraction = null;
          setPathTo({ x: pointer.worldX, y: pointer.worldY });
        });

        const camera = this.cameras.main;
        camera.setBounds(0, 0, manifest.width, manifest.height);
        camera.startFollow(cameraTarget, false, reducedMotion.matches ? 1 : 0.12, reducedMotion.matches ? 1 : 0.12);
        camera.setDeadzone(150, 100);
        const resizeCamera = (gameSize: { width: number; height: number }) => {
          const cover = Math.max(gameSize.width / manifest.width, gameSize.height / manifest.height);
          camera.setZoom(Math.max(0.72 * viewport.ratio, cover));
        };
        resizeCamera({ width: this.scale.width, height: this.scale.height });
        this.scale.on("resize", (gameSize: { width: number; height: number }) => resizeCamera(gameSize));

        const canvas = this.game.canvas;
        canvas.tabIndex = 0;
        canvas.setAttribute("role", "application");
        canvas.setAttribute("aria-label", "Virtual Studio · WASD / arrows · E: interact · Tab: leave game");
        const focusCanvas = () => canvas.focus({ preventScroll: true });
        const queueKeyboardInteraction = () => {
          if (document.activeElement === canvas && !studioWorldInputBlocked(document)) {
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
            callbacksRef.current.onLocalState({ point: { x: localBody.x, y: localBody.y }, facing, moving: false, zoneId: studioWorldRoomAt(manifest, localBody) });
          }
          callbacksRef.current.onCancelFollow();
        };
        // Capture only canvas-owned keys before preventing browser scrolling. Phaser's
        // window keyboard handler ignores defaultPrevented events from focused elements.
        const preventGameScrolling = (event: KeyboardEvent) => {
          if (event.target !== canvas) return;
          if (event.key === "Escape") { npcDirector.cancelGuideTour(); stopMovement(); return; }
          if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || studioWorldInputBlocked(document)) return;
          if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "KeyE"].includes(event.code)) return;
          heldKeys.add(event.code);
          if (event.code === "KeyE" && !event.repeat) queueKeyboardInteraction();
          event.preventDefault();
        };
        const releaseKey = (event: KeyboardEvent) => { heldKeys.delete(event.code); };
        const refocus = () => {
          if (this.input.keyboard) this.input.keyboard.enabled = document.activeElement === canvas;
          if (document.activeElement !== canvas) stopMovement();
        };
        const visibility = () => { if (document.hidden) { npcDirector.cancelGuideTour(); stopMovement(); } };
        const reduceMotionChanged = () => camera.setLerp(reducedMotion.matches ? 1 : 0.12, reducedMotion.matches ? 1 : 0.12);
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
          attributeFilter: ["open", "role", "aria-modal", "aria-hidden", "hidden", "data-state", "data-studio-input-blocker"],
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
        zoneNote = document.createElement("p");
        zoneNote.hidden = true;
        zoneNote.setAttribute("role", "status");
        Object.assign(zoneNote.style, {
          position: "absolute", top: "12px", left: "50%", transform: "translateX(-50%)",
          zIndex: "6", margin: "0", padding: "6px 12px", borderRadius: "999px",
          background: "#14120fd9", color: "#f6edd8", font: "700 12px/1.2 Pretendard, sans-serif",
          pointerEvents: "none",
        });
        const unstuckButton = document.createElement("button");
        unstuckButton.type = "button";
        unstuckButton.textContent = btRef.current("빠져나오기", "Unstuck");
        unstuckButton.setAttribute("aria-label", unstuckButton.textContent);
        Object.assign(unstuckButton.style, {
          position: "absolute", left: "50%", bottom: "12px", transform: "translateX(-50%)",
          zIndex: "6", border: "0", borderRadius: "999px", padding: "8px 14px",
          background: "#f6edd8", color: "#241c14", font: "800 12px/1 Pretendard, sans-serif",
          cursor: "pointer",
        });
        unstuckButton.addEventListener("click", () => bridge.requestUnstuck());
        parent.append(zoneNote, unstuckButton);
        cleanup.push(() => { zoneNote.remove(); unstuckButton.remove(); });
        sceneReady = true;
        globalThis.clearTimeout(bootDeadline);
        setFailure(false);
        setReady(true);
        const contextLost = (event: Event) => { event.preventDefault(); stopMovement(); fail(); };
        canvas.addEventListener("webglcontextlost", contextLost);
        cleanup.push(() => canvas.removeEventListener("webglcontextlost", contextLost));
        if (document.activeElement === document.body) focusCanvas();
        syncSnapshot(snapshotRef.current);
      };

      scene.update = function update(time: number, deltaMs: number) {
        if (!localBody || !localBodyPhysics || !localSprite || !localShadow || !localLabel) return;
        const dt = Math.min(0.05, Math.max(0, deltaMs / 1000));
        if (!sceneReady || cancelled) return;
        if (time - lastAssetCollectionAt >= 1_000) {
          characterAssets.collect();
          lastAssetCollectionAt = time;
        }
        fixedStepClock.reconcile(this.game.loop.time);
        const blocked = studioWorldInputBlocked(document, modalInputBlocked);
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

        const sprint = !typing && Boolean(heldKeys.has("ShiftLeft") || heldKeys.has("ShiftRight") || keys?.shift?.isDown || gamepad.sprint);
        const config = {
          ...DEFAULT_STUDIO_MOTION_CONFIG,
          maxSpeed: STUDIO_VIRTUAL_SPACE_WALK_SPEED * (sprint ? 1.35 : 1),
        };

        let currentPoint = { x: localBodyPhysics.center.x, y: localBodyPhysics.center.y };
        const nearbyNpc = [...npcs.values()].filter((npc) => Math.hypot(npc.groundPoint.x - currentPoint.x, npc.groundPoint.y - currentPoint.y) < 55)
          .sort((left, right) => Math.hypot(left.sprite.x - currentPoint.x, left.sprite.y - currentPoint.y) - Math.hypot(right.sprite.x - currentPoint.x, right.sprite.y - currentPoint.y))
          .find((npc) => studioNpcInteraction(manifest, npc.definition));
        const npcInteraction = nearbyNpc ? studioNpcInteraction(manifest, nearbyNpc.definition) : null;
        const nearbyInteraction = npcInteraction ?? nearestInteraction(interactions, currentPoint);
        const interactPressed = !typing && Boolean(
          keyboardInteractQueued
          || (gamepad.interact && !gamepadInteractHeld)
          || bridge.consumeInteract(),
        );
        keyboardInteractQueued = false;
        gamepadInteractHeld = gamepad.interact;
        const directInput = Math.hypot(ix, iy) > 0.04;
        const selection = queuedInteraction;
        queuedInteraction = null;
        if (interactPressed && npcInteraction && !selection) {
          (callbacksRef.current.onNpcInteract ?? callbacksRef.current.onInteract)(npcInteraction);
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
        } else {
          const previousApproach = approachState.pending;
          const focus = nearbyInteraction && !npcInteraction
            ? { id: nearbyInteraction.id, point: nearbyInteraction.point, radius: nearbyInteraction.radius }
            : null;
          const decision = stepStudioWorldInteractionApproach(manifest, approachState, currentPoint, {
            selection: selection ? { id: selection.id, point: selection.point, radius: selection.radius } : null,
            inRangeInteract: interactPressed && !selection,
            nearby: focus,
            focus,
          });
          approachState = decision.state;
          const highlighted = decision.prompt ? interactionById.get(decision.highlightId ?? "") ?? null : null;
          if ((highlighted?.id ?? null) !== nearbyInteractionId) {
            nearbyInteractionId = highlighted?.id ?? null;
            callbacksRef.current.onNearbyInteractionChange?.(highlighted);
            for (const [id, marker] of interactionMarkers) {
              const active = id === nearbyInteractionId;
              marker.setAlpha(active ? 1 : 0.62);
              marker.setScale(active ? 1.16 : 1);
            }
          }
          highlightRing?.clear();
          if (highlighted) {
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
              const nextPath = findStudioWorldPath(manifest, currentPoint, decision.walkTarget);
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
            const walked = stepStudioWorldWalkOver(manifest, walkOverState, currentPoint, {
              choice: walkChoice,
              followTarget: followPeer ? { id: followPeerId!, point: { x: followPeer.state.x, y: followPeer.state.y } } : null,
              direct: directInput,
            });
            walkOverState = walked.state;
            if (walked.follow && walked.state.targetId) bridge.setFollowingPeer(walked.state.targetId);
            const routeMoved = walked.routeTarget
              && (!previousRoute || previousRoute.x !== walked.routeTarget.x || previousRoute.y !== walked.routeTarget.y);
            if (walked.routeTarget && routeMoved && !directInput) {
              approachState = EMPTY_STUDIO_WORLD_APPROACH;
              setPathTo(walked.routeTarget);
            } else if (walked.follow && !walked.routeTarget) path = [];
          }
        }

        const cruise = steerStudioWorldCruise({
          manifest,
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

        motion = stepStudioVirtualSpaceMotion(motion, { x: ix, y: iy }, dt, config);
        localBodyPhysics.setVelocity(motion.velocity.x, motion.velocity.y);
        let portal: StudioWorldPortalDefinition | null = null;
        let snapCamera = false;
        if (bridge.consumeUnstuck()) {
          const rescue = resolveStudioWorldUnstuck(manifest, currentPoint);
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
          }
        } else if (!blocked) {
          const arrival = resolveStudioWorldPortalArrival(
            portalTracker,
            manifest,
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
          if (portal) callbacksRef.current.onPortal?.(portal);
        }

        if (routeOverlay) {
          routeOverlay.clear();
          const destination = path.at(-1);
          if (destination) {
            routeOverlay.lineStyle(1.5, 0xc8b8ff, 0.42);
            routeOverlay.beginPath(); routeOverlay.moveTo(currentPoint.x, currentPoint.y);
            for (const waypoint of path) routeOverlay.lineTo(waypoint.x, waypoint.y);
            routeOverlay.strokePath();
            routeOverlay.lineStyle(2, 0xe8ddff, 0.8);
            routeOverlay.strokeEllipse(destination.x, destination.y, 20, 10);
          }
        }
        const zone = resolveStudioWorldZonePresence(zoneTracker, manifest, currentPoint, reducedMotion.matches);
        zoneVeil?.clear();
        if (zone.separated && zone.rect) {
          const rect = zone.rect;
          const veil = reducedMotion.matches ? 0.42 : 0.55;
          zoneVeil?.fillStyle(0x07060b, veil);
          zoneVeil?.fillRect(0, 0, manifest.width, rect.y);
          zoneVeil?.fillRect(0, rect.y, rect.x, rect.height);
          zoneVeil?.fillRect(rect.x + rect.width, rect.y, Math.max(0, manifest.width - rect.x - rect.width), rect.height);
          zoneVeil?.fillRect(0, rect.y + rect.height, manifest.width, Math.max(0, manifest.height - rect.y - rect.height));
        }
        if (zoneNote) {
          zoneNote.style.transition = reducedMotion.matches ? "none" : "opacity 180ms linear";
          if (!zone.separated) zoneNote.hidden = true;
          else if (zone.announce) {
            zoneNote.hidden = false;
            zoneNote.textContent = btRef.current("이 공간에 들어왔어요", "Entered this area");
          }
        }
        parent.dataset.zoneId = zone.zoneId ?? "";
        parent.dataset.zoneSeparated = String(zone.separated);
        parent.dataset.zoneAnnounced = String(zone.announce);
        const speed = Math.hypot(motion.velocity.x, motion.velocity.y);
        const traveled = lastPosition ? Math.hypot(currentPoint.x - lastPosition.x, currentPoint.y - lastPosition.y) : 0;
        if (traveled > 0.015) lastMovedAt = time;
        // Render frames can outnumber fixed physics steps. Do not toggle idle/walk on zero-step frames.
        const nextMoving = !blocked && speed > 5 && time - lastMovedAt < 100;
        lastPosition = currentPoint;
        if (speed > 10) facing = studioStableFacing(motion.velocity, facing);

        const activity = snapshotRef.current.self.activity;
        const localSkin = resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current).skin;
        const localSeatRequested = !nextMoving && !directInput && resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current, "sit").clip === "sit" ? poseRef.current.seatedActors.find((actor) => actor.id === identityRef.current) : undefined;
        const localSeat = scene.textures.exists(studioCharacterPoseTextureKey(localSkin, "sit")) ? localSeatRequested : undefined;
        const localPoseOverride = !nextMoving && !directInput && resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current, "sit").clip === "sit" ? poseRef.current.selfPose : undefined;
        const localWaving = snapshotRef.current.selfReaction === "wave" || poseRef.current.waveActorIds.includes(identityRef.current);
        const localState = nextMoving ? "walk" : localSeatRequested || localPoseOverride ? "sit" : localWaving ? "wave" : activityState(false, false, activity);
        const rendered = localPose.sample(this.game.loop.time);
        if (previousRendered) {
          const distance = Math.hypot(rendered.x - previousRendered.x, rendered.y - previousRendered.y);
          if (distance < 64) localDistance += distance;
        }
        previousRendered = rendered;
        localSprite.setData("walkDistance", localDistance);
        localSprite.setData("seatAttached", Boolean(localSeat));
        applyAvatarVisual(localSprite, snapshotRef.current.self, localSeatRequested?.facing ?? localPoseOverride?.facing ?? facing, localState, identityRef.current);
        cameraTarget.x = rendered.x; cameraTarget.y = rendered.y;
        const followAmount = snapCamera || reducedMotion.matches ? 1 : studioCameraLerp(dt);
        this.cameras.main.setLerp(followAmount, followAmount);
        if (snapCamera) this.cameras.main.centerOn(rendered.x, rendered.y);

        const hasWalkClip = scene.anims.exists(walkAnimationKey(localSkin, facing)) || reducedMotion.matches;
        const bob = nextMoving && !hasWalkClip ? Math.sin(time * 0.024) * 2.8 : 0;
        const localVisualPoint = localSeat?.anchorPoint ?? rendered;
        localSprite.setPosition(localVisualPoint.x, localVisualPoint.y + bob);
        localSprite.setAngle(nextMoving && !hasWalkClip ? Math.sin(time * 0.018) * 0.8 : 0);
        localSprite.setDepth(Math.round(localVisualPoint.y) + 1_001);
        localShadow.setPosition(rendered.x, rendered.y + 1);
        localShadow.setVisible(!localSeat).setScale(nextMoving && !reducedMotion.matches ? 0.86 + Math.cos(time * 0.024) * 0.07 : 1, 1);
        localShadow.setDepth(Math.round(localBody.y) + 990);
        const localHeadY = localVisualPoint.y - localSprite.displayHeight * localSprite.originY;
        localLabel.setPosition(localVisualPoint.x, localSeat ? localHeadY - 24 : localVisualPoint.y + 12).setDepth(localSeat ? 160_000 : Math.round(localVisualPoint.y) + 1_002);
        localReaction?.setPosition(localVisualPoint.x, localSeat ? localHeadY - 48 : localVisualPoint.y - 125);

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
          const peerSkin = resolveStudioCharacterAppearance(visual, peerId).skin;
          const peerSeatRequested = !target.moving && resolveStudioCharacterAppearance(visual, peerId, "sit").clip === "sit" ? poseRef.current.seatedActors.find((actor) => actor.id === peerId) : undefined;
          const peerSeat = scene.textures.exists(studioCharacterPoseTextureKey(peerSkin, "sit")) ? peerSeatRequested : undefined;
          const peerWaving = poseRef.current.waveActorIds.includes(peerId)
            || snapshotRef.current.peerReactions.some((reaction) => reaction.sessionId === peerId && reaction.reaction === "wave");
          const peerVisualPoint = peerSeat?.anchorPoint ?? target;
          visual.sprite.setPosition(peerVisualPoint.x, peerVisualPoint.y).setData("seatAttached", Boolean(peerSeat));
          const peerState = target.moving ? "walk" : peerSeatRequested ? "sit" : peerWaving ? "wave" : activityState(false, visual.nearby, visual.activity);
          applyAvatarVisual(visual.sprite, visual, peerSeatRequested?.facing ?? target.facing, peerState, peerId);
          if (target.moving && !reducedMotion.matches && !scene.anims.exists(walkAnimationKey(peerSkin, target.facing))) {
            visual.sprite.setAngle(Math.sin(time * 0.017 + visual.targetX * 0.01) * 0.65);
          } else {
            visual.sprite.setAngle(0);
          }
          visual.sprite.setDepth(Math.round(visual.sprite.y) + 1_001);
          const peerHeadY = visual.sprite.y - visual.sprite.displayHeight * visual.sprite.originY;
          visual.label.setPosition(visual.sprite.x, peerSeat ? peerHeadY - 24 : visual.sprite.y + 18)
            .setDepth(peerSeat ? 160_000 : Math.round(visual.sprite.y) + 1_002);
          visual.reaction.setPosition(visual.sprite.x, peerSeat ? peerHeadY - 48 : visual.sprite.y - 125);
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
        const tourState = npcDirector.guideTourState;
        const serializedTour = JSON.stringify(tourState);
        if (tourState && serializedTour !== lastGuideState) { lastGuideState = serializedTour; callbacksRef.current.onGuideTourChange?.(tourState); }
        for (const view of npcViews) {
          const npc = npcs.get(view.id);
          if (!npc) continue;
          npc.phase = view.phase;
          npc.groundPoint = view.point;
          const attached = view.seatAttachmentPoint && scene.textures.exists(studioCharacterPoseTextureKey(npc.skin, "sit"));
          const visualPoint = attached ? view.seatAttachmentPoint! : view.point;
          npc.sprite.setPosition(visualPoint.x, visualPoint.y).setDepth(Math.round(visualPoint.y) + 1_000).setData("seatAttached", Boolean(attached));
          npc.sprite.setData("activityStage", view.activityStage).setData("activityAnchorId", view.activityAnchorId);
          npc.sprite.setData("walkDistance", view.distance);
          applySpriteVisual(npc.sprite, npc.skin, view.facing, view.animation);
          npc.shadow.setPosition(view.point.x, view.point.y + 1).setDepth(Math.round(view.point.y) + 990).setVisible(!attached);
          const headY = npc.sprite.y - npc.sprite.displayHeight * npc.sprite.originY;
          npc.label.setPosition(visualPoint.x, attached ? headY - 22 : view.point.y + 9).setDepth(attached ? 160_000 : Math.round(view.point.y) + 1_002);
          const greeting = studioNpcActivityLabel(npc.definition, view.phase);
          npc.reaction.setPosition(visualPoint.x, headY - (attached ? 45 : 8))
            .setVisible(view.greeting && !reducedMotion.matches && atmosphereRef.current !== "focus");
          if (view.greeting) npc.reaction.setText(btRef.current(greeting.ko, greeting.en));
        }

        const changed = !lastPublishedPoint || Math.hypot(localBody.x - lastPublishedPoint.x, localBody.y - lastPublishedPoint.y) > 0.02
          || nextMoving !== lastPublishedMoving || facing !== lastPublishedFacing;
        const shouldPublish = changed && (time - lastPublishAt >= 80 || nextMoving !== lastPublishedMoving || Boolean(portal));
        if (shouldPublish) {
          const point = { x: localBodyPhysics.center.x, y: localBodyPhysics.center.y };
          callbacksRef.current.onLocalState({
            point,
            facing,
            moving: nextMoving,
            zoneId: studioWorldRoomAt(manifest, point),
          });
          lastPublishedPoint = point;
          lastPublishAt = time;
          lastPublishedMoving = nextMoving;
          lastPublishedFacing = facing;
        }
        if (import.meta.env.DEV && time - lastDiagnosticAt >= 100) {
          lastDiagnosticAt = time;
          parent.dataset.localX = currentPoint.x.toFixed(3);
          parent.dataset.localY = currentPoint.y.toFixed(3);
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
          parent.dataset.pixelRatio = viewport.ratio.toFixed(2);
          parent.dataset.localMoving = String(nextMoving);
          parent.dataset.localFacing = facing;
          parent.dataset.texture = localSprite.texture.key;
          parent.dataset.appearanceIssues = JSON.stringify(localSprite.getData("appearanceIssues") ?? []);
          parent.dataset.reaction = localReaction?.visible ? localReaction.text : "";
          parent.dataset.peers = JSON.stringify([...peers].map(([id, peer]) => ({ id, x: peer.sprite.x, y: peer.sprite.y, targetX: peer.targetX, targetY: peer.targetY, texture: peer.sprite.texture.key, reaction: peer.reaction.visible ? peer.reaction.text : "" })));
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
        antialias: true,
        roundPixels: false,
        pixelArt: false,
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
      const resize = () => {
        if (cancelled || !mount.isConnected) return;
        const rect = parent.getBoundingClientRect();
        const next = studioRenderViewport(rect.width, rect.height, globalThis.devicePixelRatio || 1);
        mount.style.width = `${next.cssWidth}px`; mount.style.height = `${next.cssHeight}px`;
        if (game?.isBooted && (next.width !== viewport.width || next.height !== viewport.height || next.ratio !== viewport.ratio)) {
          viewport = next;
          game.scale.setZoom(1 / next.ratio);
          game.scale.resize(next.width, next.height);
        }
      };
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
  }, [attempt, bridge, debugWorld, manifest, renderer, worldAssetUrls]);

  return (
    <div
      ref={hostRef}
      className="studio-vspace-phaser-canvas absolute inset-0 z-[2]"
      data-studio-phaser-runtime="true"
      data-studio-engine-status={failure ? "error" : ready ? "ready" : "loading"}
      data-world-id={manifest.id}
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
