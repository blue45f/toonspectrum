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
import { advanceStudioWorldPath } from "./studio-virtual-space-path-steering";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  StudioWorldPortalTracker,
  studioWorldArrivalInput,
  studioWorldHasModalBlocker,
  studioWorldInputBlocked,
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
  studioCharacterSkinForAvatarIndex,
  studioCharacterWalkClip,
  type StudioCharacterMotionState,
  type StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";
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
  studioWorldPortalTarget,
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
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly selfIdentity?: string;
  /** AUTO in product; Canvas is useful for lifecycle-only browser harnesses. */
  readonly renderer?: "auto" | "webgl" | "canvas";
  readonly debugWorld?: boolean;
  readonly atmosphere?: StudioNpcAtmosphere;
  readonly onNpcInteract?: (interaction: StudioWorldInteractionDefinition) => void;
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
}

function staticTextureKey(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState = "idle",
): string {
  if ((state === "talk" || state === "draw" || state === "review") && skin.state?.[state]) {
    return `studio-player-${skin.key}-state-${state}`;
  }
  return `studio-player-${skin.key}-direction-${facing}`;
}

function walkSheetKey(skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing): string {
  return `studio-player-${skin.key}-walk-sheet-${facing}`;
}

function walkAnimationKey(skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing): string {
  return `studio-player-${skin.key}-walk-animation-${facing}`;
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
  snapshot,
  bridge,
  selfIdentity = "local",
  renderer = "auto",
  debugWorld = false,
  atmosphere = "balanced",
  onNpcInteract,
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
  const identityRef = useRef(selfIdentity);
  identityRef.current = selfIdentity;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef(snapshot);
  const callbacksRef = useRef({
    onLocalState,
    onInteract,
    onNearbyInteractionChange,
    onNpcInteract,
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
      const interactionMarkers = new Map<string, import("phaser").GameObjects.Text>();
      const interactions = studioWorldInteractions(manifest);
      const portals = studioWorldPortals(manifest);
      const backgroundTextureKey = `studio-world-background-${manifest.backgroundAssetKey}`;
      const portalTracker = new StudioWorldPortalTracker();
      const failedTextures = new Set<string>();
      const requestedWalkSheets = new Set<string>();
      // Keep full-resolution artwork, but do not upload absent characters' atlases at boot.
      const warmWalkSkins = new Set([
        studioCharacterSkinForAvatarIndex(snapshotRef.current.self.avatarIndex, identityRef.current).key,
        ...snapshotRef.current.peers.map((peer) => studioCharacterSkinForAvatarIndex(peer.state.avatarIndex, peer.participant.sessionId).key),
        ...manifest.npcs.map((npc) => studioCharacterSkinByKey(npc.skinKey).key),
      ]);
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
      let routeOverlay: import("phaser").GameObjects.Graphics | null = null;
      let motion = { velocity: { x: 0, y: 0 } };
      let facing: StudioVirtualSpaceFacing = snapshotRef.current.self.facing;
      let moving = false;
      let lastPublishAt = -Infinity;
      let lastDiagnosticAt = -Infinity;
      let lastPublishedFacing = facing;
      let lastPublishedMoving = moving;
      let lastFollowPathAt = -Infinity;
      let gamepadInteractHeld = false;
      let keyboardInteractQueued = false;
      let wasInputBlocked = false;
      let modalInputBlocked = studioWorldHasModalBlocker(document);
      let lastStopRevision = bridge.getStopRevision();
      let lastPosition: StudioVirtualSpacePoint | null = null;
      let lastMovedAt = -Infinity;
      let lastPublishedPoint: StudioVirtualSpacePoint | null = null;
      let nearbyInteractionId: string | null = null;
      let keys: Record<string, import("phaser").Input.Keyboard.Key> | null = null;

      const requestWalkSheet = (skin: StudioCharacterSkin, direction: StudioVirtualSpaceFacing) => {
        const clip = studioCharacterWalkClip(skin, direction);
        const key = walkSheetKey(skin, direction);
        if (!clip || !sceneReady || cancelled || scene.textures.exists(key) || failedTextures.has(key) || requestedWalkSheets.has(key)) return;
        requestedWalkSheets.add(key);
        scene.load.once(`filecomplete-spritesheet-${key}`, () => {
          if (cancelled || scene.anims.exists(walkAnimationKey(skin, direction))) return;
          const texture = scene.textures.get(key);
          if (clip.end < clip.start || clip.start < 0 || clip.end >= texture.frameTotal - 1) return;
          scene.anims.create({ key: walkAnimationKey(skin, direction), frames: scene.anims.generateFrameNumbers(key, { start: clip.start, end: clip.end }), frameRate: clip.frameRate, repeat: clip.repeat ?? -1 });
        });
        scene.load.spritesheet(key, clip.textureUrl, { frameWidth: clip.frameWidth, frameHeight: clip.frameHeight });
        scene.load.start();
      };

      const updateDisplaySize = (sprite: import("phaser").GameObjects.Sprite) => {
        sprite.setDisplaySize(Number(sprite.getData("visualWidth") ?? 92), Number(sprite.getData("visualHeight") ?? 123));
      };
      const applySpriteVisual = (
        sprite: import("phaser").GameObjects.Sprite,
        skin: StudioCharacterSkin,
        nextFacing: StudioVirtualSpaceFacing,
        nextState: StudioCharacterMotionState,
      ) => {
        if (nextState === "walk") {
          const clip = studioCharacterWalkClip(skin, nextFacing);
          const animationKey = walkAnimationKey(skin, nextFacing);
          if (clip && !scene.anims.exists(animationKey)) requestWalkSheet(skin, nextFacing);
          if (clip && scene.anims.exists(animationKey)) {
            if (clip.distancePerCycle || reducedMotion.matches) {
              if (sprite.anims.isPlaying) sprite.stop();
              const frame = clip.start + (reducedMotion.matches ? 0 : studioGaitFrame(
                Number(sprite.getData("walkDistance") ?? 0), clip.end - clip.start + 1, clip.distancePerCycle,
              ));
              const sheet = walkSheetKey(skin, nextFacing);
              if (sprite.texture.key !== sheet || String(sprite.frame.name) !== String(frame)) sprite.setTexture(sheet, frame);
            } else {
              sprite.play(animationKey, true);
            }
            updateDisplaySize(sprite);
            return;
          }
        }
        if (sprite.anims.isPlaying) sprite.stop();
        const key = staticTextureKey(skin, nextFacing, nextState);
        const fallback = staticTextureKey(STUDIO_CHARACTER_SKINS[0]!, "down");
        const texture = scene.textures.exists(key) ? key : fallback;
        if (scene.textures.exists(texture) && sprite.texture.key !== texture) sprite.setTexture(texture);
        updateDisplaySize(sprite);
      };

      const applyAvatarVisual = (
        sprite: import("phaser").GameObjects.Sprite,
        avatarIndex: number,
        nextFacing: StudioVirtualSpaceFacing,
        nextState: StudioCharacterMotionState,
        identity?: string,
      ) => {
        applySpriteVisual(sprite, studioCharacterSkinForAvatarIndex(avatarIndex, identity), nextFacing, nextState);
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
        const skin = studioCharacterSkinForAvatarIndex(peer.state.avatarIndex, id);
        const key = staticTextureKey(skin, peer.state.facing, state);
        if (!visual) {
          const sprite = scene.add.sprite(peer.state.x, peer.state.y, key)
            .setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
            .setData({ visualWidth: 92, visualHeight: 123 })
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
              callbacksRef.current.onPeerSelect(id);
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
        visual.facing = peer.state.facing;
        visual.moving = peer.state.moving;
        visual.activity = peer.state.activity;
        visual.nearby = nearby;
        applyAvatarVisual(visual.sprite, visual.avatarIndex, visual.facing, state, id);
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
            next.self.avatarIndex,
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
        this.load.image(backgroundTextureKey, manifest.backgroundUrl);

        const loadedStatic = new Set<string>();
        for (const skin of STUDIO_CHARACTER_SKINS) {
          for (const direction of ["down", "left", "right", "up"] as const) {
            const directionalKey = staticTextureKey(skin, direction);
            if (!loadedStatic.has(directionalKey)) {
              loadedStatic.add(directionalKey);
              this.load.image(directionalKey, skin.directional[direction]);
            }
            for (const state of ["talk", "draw", "review"] as const) {
              const url = skin.state?.[state];
              if (!url) continue;
              const stateKey = staticTextureKey(skin, direction, state);
              if (loadedStatic.has(stateKey)) continue;
              loadedStatic.add(stateKey);
              this.load.image(stateKey, url);
            }
            const clip = studioCharacterWalkClip(skin, direction);
            if (clip && warmWalkSkins.has(skin.key)) {
              this.load.spritesheet(walkSheetKey(skin, direction), clip.textureUrl, {
                frameWidth: clip.frameWidth,
                frameHeight: clip.frameHeight,
              });
            }
          }
        }

        const loadedProps = new Set<string>();
        for (const prop of manifest.props) {
          if (!prop.assetUrl) continue;
          const key = propTextureKey(prop);
          if (loadedProps.has(key)) continue;
          loadedProps.add(key);
          this.load.image(key, prop.assetUrl);
        }
      };

      scene.create = function create() {
        if (cancelled) return;
        const fallbackTexture = staticTextureKey(STUDIO_CHARACTER_SKINS[0]!, "down");
        if (failedTextures.has(backgroundTextureKey) || !this.textures.exists(fallbackTexture)) { fail(); return; }
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

        routeOverlay = this.add.graphics().setDepth(650);

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

        for (const skin of STUDIO_CHARACTER_SKINS) {
          for (const direction of ["down", "left", "right", "up"] as const) {
            const clip = studioCharacterWalkClip(skin, direction);
            if (!clip) continue;
            const animationKey = walkAnimationKey(skin, direction);
            const sheetKey = walkSheetKey(skin, direction);
            if (this.anims.exists(animationKey) || failedTextures.has(sheetKey) || !this.textures.exists(sheetKey)) continue;
            if (!Number.isSafeInteger(clip.start) || !Number.isSafeInteger(clip.end)
              || clip.start < 0 || clip.end < clip.start || clip.end >= this.textures.get(sheetKey).frameTotal - 1) continue;
            this.anims.create({
              key: animationKey,
              frames: this.anims.generateFrameNumbers(walkSheetKey(skin, direction), {
                start: clip.start,
                end: clip.end,
              }),
              frameRate: clip.frameRate,
              repeat: clip.repeat ?? -1,
            });
          }
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
                const current = { x: localBody?.x ?? 0, y: localBody?.y ?? 0 };
                const distance = Math.hypot(interaction.point.x - current.x, interaction.point.y - current.y);
                if (distance <= interaction.radius) callbacksRef.current.onInteract(interaction);
                else setPathTo(interaction.point);
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
        const localSkin = studioCharacterSkinForAvatarIndex(self.avatarIndex, identityRef.current);
        localSprite = this.add.sprite(
          initialPoint.x,
          initialPoint.y,
          staticTextureKey(localSkin, facing),
        ).setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
          .setData({ visualWidth: 98, visualHeight: 131 })
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
              const current = { x: localBody?.x ?? initialPoint.x, y: localBody?.y ?? initialPoint.y };
              const distance = Math.hypot(interaction.point.x - current.x, interaction.point.y - current.y);
              if (distance <= interaction.radius) callbacksRef.current.onInteract(interaction);
              else setPathTo(interaction.point);
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
          const sprite = this.add.sprite(view.point.x, view.point.y, staticTextureKey(skin, view.facing, view.animation))
            .setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
            .setData({ visualWidth: 92 * visualScale, visualHeight: 123 * visualScale })
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
          npcs.set(view.id, { definition: npcDefinition, skin, sprite, label, reaction, shadow, phase: view.phase });
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
          setPathTo({ x: pointer.worldX, y: pointer.worldY });
        });

        const camera = this.cameras.main;
        camera.setBounds(0, 0, manifest.width, manifest.height);
        camera.startFollow(cameraTarget, false, reducedMotion.matches ? 1 : 0.12, reducedMotion.matches ? 1 : 0.12);
        camera.setDeadzone(150, 100);
        const resizeCamera = (gameSize: { width: number; height: number }) => {
          const cover = Math.max(gameSize.width / manifest.width, gameSize.height / manifest.height);
          camera.setZoom(Math.max(0.72 * viewport.ratio, Math.min(1.28 * viewport.ratio, cover)));
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
        this.input.keyboard?.on("keydown-E", queueKeyboardInteraction);
        const stopMovement = () => {
          bridge.clearMovement();
          path = [];
          motion = { velocity: { x: 0, y: 0 } };
          keyboardInteractQueued = false;
          localBodyPhysics?.setVelocity(0, 0);
          this.input.keyboard?.resetKeys();
          gamepadInteractHeld = true;
          if (moving && localBody && !cancelled) {
            moving = false;
            lastPublishedMoving = false;
            callbacksRef.current.onLocalState({ point: { x: localBody.x, y: localBody.y }, facing, moving: false, zoneId: studioWorldRoomAt(manifest, localBody) });
          }
          callbacksRef.current.onCancelFollow();
        };
        const preventGameScrolling = (event: KeyboardEvent) => {
          if (event.target === canvas && !event.metaKey && !event.ctrlKey && !event.altKey
            && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
        };
        const refocus = () => {
          if (this.input.keyboard) this.input.keyboard.enabled = document.activeElement === canvas;
          if (document.activeElement !== canvas) stopMovement();
        };
        const visibility = () => { if (document.hidden) stopMovement(); };
        const reduceMotionChanged = () => camera.setLerp(reducedMotion.matches ? 1 : 0.12, reducedMotion.matches ? 1 : 0.12);
        canvas.addEventListener("pointerdown", focusCanvas);
        canvas.addEventListener("keydown", preventGameScrolling);
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
          this.input.keyboard?.off("keydown-E", queueKeyboardInteraction);
          canvas.removeEventListener("pointerdown", focusCanvas);
          canvas.removeEventListener("keydown", preventGameScrolling);
          document.removeEventListener("focusin", refocus);
          document.removeEventListener("visibilitychange", visibility);
          globalThis.removeEventListener("blur", stopMovement);
          reducedMotion.removeEventListener("change", reduceMotionChanged);
          modalObserver.disconnect();
        });
        portalTracker.seed(portals, initialPoint);
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
        fixedStepClock.reconcile(this.game.loop.time);
        const blocked = studioWorldInputBlocked(document, modalInputBlocked);
        if (blocked && !wasInputBlocked) {
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
        }
        let ix = blocked ? 0 : bridge.getJoystick().x;
        let iy = blocked ? 0 : bridge.getJoystick().y;
        if (!typing) {
          if (keys?.left?.isDown || keys?.a?.isDown) ix -= 1;
          if (keys?.right?.isDown || keys?.d?.isDown) ix += 1;
          if (keys?.up?.isDown || keys?.w?.isDown) iy -= 1;
          if (keys?.down?.isDown || keys?.s?.isDown) iy += 1;
        }

        const pads = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
          ? Array.from(navigator.getGamepads())
          : [];
        const gamepad = readStudioVirtualSpaceGamepadsInput(pads);
        if (!typing) { ix += gamepad.x; iy += gamepad.y; }

        const sprint = !typing && Boolean(keys?.shift?.isDown || gamepad.sprint);
        const config = {
          ...DEFAULT_STUDIO_MOTION_CONFIG,
          maxSpeed: STUDIO_VIRTUAL_SPACE_WALK_SPEED * (sprint ? 1.35 : 1),
        };

        const currentPoint = { x: localBodyPhysics.center.x, y: localBodyPhysics.center.y };
        const nearbyNpc = [...npcs.values()].filter((npc) => Math.hypot(npc.sprite.x - currentPoint.x, npc.sprite.y - currentPoint.y) < 55)
          .sort((left, right) => Math.hypot(left.sprite.x - currentPoint.x, left.sprite.y - currentPoint.y) - Math.hypot(right.sprite.x - currentPoint.x, right.sprite.y - currentPoint.y))
          .find((npc) => studioNpcInteraction(manifest, npc.definition));
        const npcInteraction = nearbyNpc ? studioNpcInteraction(manifest, nearbyNpc.definition) : null;
        const nearbyInteraction = npcInteraction ?? nearestInteraction(interactions, currentPoint);
        const nextNearbyId = nearbyInteraction?.id ?? null;
        if (nextNearbyId !== nearbyInteractionId) {
          nearbyInteractionId = nextNearbyId;
          callbacksRef.current.onNearbyInteractionChange?.(nearbyInteraction);
          for (const [id, marker] of interactionMarkers) {
            const active = id === nextNearbyId;
            marker.setAlpha(active ? 1 : 0.62);
            marker.setScale(active ? 1.16 : 1);
          }
        }

        const interactPressed = !typing && Boolean(
          keyboardInteractQueued
          || (gamepad.interact && !gamepadInteractHeld),
        );
        keyboardInteractQueued = false;
        gamepadInteractHeld = gamepad.interact;
        if (interactPressed) {
          if (npcInteraction) (callbacksRef.current.onNpcInteract ?? callbacksRef.current.onInteract)(npcInteraction);
          else callbacksRef.current.onInteract(nearbyInteraction);
        }

        const moveRequest = bridge.consumeMoveTarget();
        if (moveRequest && !blocked) setPathTo(moveRequest);

        const followPeerId = bridge.getFollowingPeer();
        if (!blocked && followPeerId && time - lastFollowPathAt >= 320) {
          const peer = getPeerSnapshot(followPeerId);
          if (!peer) {
            bridge.setFollowingPeer(null);
            callbacksRef.current.onCancelFollow();
          } else {
            const distance = Math.hypot(peer.state.x - localBody.x, peer.state.y - localBody.y);
            if (distance > 86) setPathTo({ x: peer.state.x, y: peer.state.y });
            else path = [];
          }
          lastFollowPathAt = time;
        }

        const directInput = Math.hypot(ix, iy) > 0.04;
        if (directInput) {
          path = [];
          if (followPeerId) {
            bridge.setFollowingPeer(null);
            callbacksRef.current.onCancelFollow();
          }
        } else if (!blocked && path.length > 0) {
          path = advanceStudioWorldPath(manifest, currentPoint, path, Math.hypot(motion.velocity.x, motion.velocity.y));
          const target = path[0]!;
          const dx = target.x - currentPoint.x;
          const dy = target.y - currentPoint.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= 3) {
            path = path.slice(1);
          } else {
            const input = studioWorldArrivalInput(currentPoint, target, config.maxSpeed, config.deceleration);
            ix = input.x;
            iy = input.y;
          }
        }

        motion = stepStudioVirtualSpaceMotion(motion, { x: ix, y: iy }, dt, config);
        localBodyPhysics.setVelocity(motion.velocity.x, motion.velocity.y);

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
        const speed = Math.hypot(motion.velocity.x, motion.velocity.y);
        const traveled = lastPosition ? Math.hypot(currentPoint.x - lastPosition.x, currentPoint.y - lastPosition.y) : 0;
        if (traveled > 0.015) lastMovedAt = time;
        // Render frames can outnumber fixed physics steps. Do not toggle idle/walk on zero-step frames.
        const nextMoving = !blocked && speed > 5 && time - lastMovedAt < 100;
        lastPosition = currentPoint;
        if (speed > 10) facing = studioStableFacing(motion.velocity, facing);

        const activity = snapshotRef.current.self.activity;
        const localState = activityState(nextMoving, false, activity);
        const localSkin = studioCharacterSkinForAvatarIndex(snapshotRef.current.self.avatarIndex, identityRef.current);
        const rendered = localPose.sample(this.game.loop.time);
        if (previousRendered) {
          const distance = Math.hypot(rendered.x - previousRendered.x, rendered.y - previousRendered.y);
          if (distance < 64) localDistance += distance;
        }
        previousRendered = rendered;
        localSprite.setData("walkDistance", localDistance);
        applySpriteVisual(localSprite, localSkin, facing, localState);
        cameraTarget.x = rendered.x; cameraTarget.y = rendered.y;
        const followAmount = reducedMotion.matches ? 1 : studioCameraLerp(dt);
        this.cameras.main.setLerp(followAmount, followAmount);

        const hasWalkClip = scene.anims.exists(walkAnimationKey(localSkin, facing)) || reducedMotion.matches;
        const bob = nextMoving && !hasWalkClip ? Math.sin(time * 0.024) * 2.8 : 0;
        localSprite.setPosition(rendered.x, rendered.y + bob);
        localSprite.setAngle(nextMoving && !hasWalkClip ? Math.sin(time * 0.018) * 0.8 : 0);
        localSprite.setDepth(Math.round(localBody.y) + 1_001);
        localShadow.setPosition(rendered.x, rendered.y + 1);
        localShadow.setScale(nextMoving && !reducedMotion.matches ? 0.86 + Math.cos(time * 0.024) * 0.07 : 1, 1);
        localShadow.setDepth(Math.round(localBody.y) + 990);
        localLabel.setPosition(rendered.x, rendered.y + 12).setDepth(Math.round(currentPoint.y) + 1_002);
        localReaction?.setPosition(rendered.x, rendered.y - 125);

        for (const [peerId, visual] of peers) {
          const target = visual.timeline.sample(Date.now()) ?? {
            x: visual.targetX,
            y: visual.targetY,
            moving: visual.moving,
            facing: visual.facing,
          };
          const distance = Math.hypot(target.x - visual.sprite.x, target.y - visual.sprite.y);
          if (distance < 128) visual.sprite.setData("walkDistance", Number(visual.sprite.getData("walkDistance") ?? 0) + distance);
          visual.sprite.setPosition(target.x, target.y);
          const peerState = activityState(target.moving, visual.nearby, visual.activity);
          const peerSkin = studioCharacterSkinForAvatarIndex(visual.avatarIndex, peerId);
          applySpriteVisual(visual.sprite, peerSkin, target.facing, peerState);
          if (target.moving && !reducedMotion.matches && !scene.anims.exists(walkAnimationKey(peerSkin, target.facing))) {
            visual.sprite.setAngle(Math.sin(time * 0.017 + visual.targetX * 0.01) * 0.65);
          } else {
            visual.sprite.setAngle(0);
          }
          visual.sprite.setDepth(Math.round(visual.sprite.y) + 1_001);
          visual.label.setPosition(visual.sprite.x, visual.sprite.y + 18)
            .setDepth(Math.round(visual.sprite.y) + 1_002);
          visual.reaction.setPosition(visual.sprite.x, visual.sprite.y - 125);
        }

        const npcViews = npcDirector.advance(dt, {
          atmosphere: atmosphereRef.current,
          reducedMotion: reducedMotion.matches,
          focused: activity === "focused" || blocked,
          people: [
            { id: identityRef.current, point: currentPoint, velocity: motion.velocity, focused: activity === "focused" || blocked },
            ...[...peers].map(([id, peer]) => ({
              id, point: { x: peer.sprite.x, y: peer.sprite.y }, focused: peer.activity === "focused",
              velocity: peer.moving ? {
                x: peer.facing === "left" ? -STUDIO_VIRTUAL_SPACE_WALK_SPEED : peer.facing === "right" ? STUDIO_VIRTUAL_SPACE_WALK_SPEED : 0,
                y: peer.facing === "up" ? -STUDIO_VIRTUAL_SPACE_WALK_SPEED : peer.facing === "down" ? STUDIO_VIRTUAL_SPACE_WALK_SPEED : 0,
              } : { x: 0, y: 0 },
            })),
          ],
        });
        for (const view of npcViews) {
          const npc = npcs.get(view.id);
          if (!npc) continue;
          npc.phase = view.phase;
          npc.sprite.setPosition(view.point.x, view.point.y).setDepth(Math.round(view.point.y) + 1_000);
          npc.sprite.setData("walkDistance", view.distance);
          applySpriteVisual(npc.sprite, npc.skin, view.facing, view.animation);
          npc.shadow.setPosition(view.point.x, view.point.y + 1).setDepth(Math.round(view.point.y) + 990);
          npc.label.setPosition(view.point.x, view.point.y + 9).setDepth(Math.round(view.point.y) + 1_002);
          const greeting = studioNpcActivityLabel(npc.definition, view.phase);
          npc.reaction.setPosition(view.point.x, view.point.y - Number(npc.sprite.getData("visualHeight")) - 8)
            .setVisible(view.greeting && !reducedMotion.matches && atmosphereRef.current !== "focus");
          if (view.greeting) npc.reaction.setText(btRef.current(greeting.ko, greeting.en));
        }

        const portal = blocked ? null : portalTracker.enter(portals, currentPoint);
        if (portal) {
          const target = studioWorldPortalTarget(manifest, portal);
          if (target && studioWorldCanOccupy(manifest, target)) {
            localBodyPhysics.reset(target.x, target.y);
            localPose.reset(target, fixedStepClock.time);
            previousRendered = null;
            motion = { velocity: { x: 0, y: 0 } };
            path = [];
            bridge.clearMovement();
            lastPosition = target;
            portalTracker.seed(portals, target);
          }
          callbacksRef.current.onPortal?.(portal);
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
          parent.dataset.walkFrame = String(localSprite.frame.name);
          parent.dataset.pathLength = String(path.length);
          parent.dataset.loadedWalkSheets = String(this.textures.getTextureKeys().filter((key) => key.includes("walk-sheet")).length);
          parent.dataset.walkDistance = localDistance.toFixed(2);
          parent.dataset.pixelRatio = viewport.ratio.toFixed(2);
          parent.dataset.localMoving = String(nextMoving);
          parent.dataset.localFacing = facing;
          parent.dataset.texture = localSprite.texture.key;
          parent.dataset.reaction = localReaction?.visible ? localReaction.text : "";
          parent.dataset.peers = JSON.stringify([...peers].map(([id, peer]) => ({ id, x: peer.sprite.x, y: peer.sprite.y, targetX: peer.targetX, targetY: peer.targetY, texture: peer.sprite.texture.key, reaction: peer.reaction.visible ? peer.reaction.text : "" })));
          parent.dataset.npcs = JSON.stringify([...npcs].map(([id, npc]) => ({ id, x: npc.sprite.x, y: npc.sprite.y, phase: npc.phase, texture: npc.sprite.texture.key })));
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
  }, [attempt, bridge, debugWorld, manifest, renderer]);

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
