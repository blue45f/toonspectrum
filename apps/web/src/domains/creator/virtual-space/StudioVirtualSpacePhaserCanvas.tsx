import {
  useEffect,
  useRef,
} from "react";

import {
  readStudioVirtualSpaceGamepadInput,
} from "./studio-virtual-space-gamepad";
import {
  findStudioVirtualSpacePath,
  STUDIO_VIRTUAL_SPACE_CLICK_STOP_DISTANCE,
  STUDIO_VIRTUAL_SPACE_WALK_SPEED,
} from "./studio-virtual-space-navigation";
import {
  DEFAULT_STUDIO_MOTION_CONFIG,
  stepStudioVirtualSpaceMotion,
} from "./studio-virtual-space-motion";
import {
  STUDIO_CHARACTER_SKINS,
  studioCharacterSkinForAvatarIndex,
  studioCharacterTextureUrl,
} from "./studio-virtual-space-character-skins";
import type {
  StudioVirtualSpaceFacing,
  StudioVirtualSpacePeer,
  StudioVirtualSpacePoint,
} from "./studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import {
  studioWorldRoomAt,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldInteractionDefinition,
  type StudioWorldPortalDefinition,
} from "./studio-virtual-space-world-manifest";

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
  readonly onLocalState: (state: StudioVirtualSpaceEngineLocalState) => void;
  readonly onInteract: () => void;
  readonly onPeerSelect: (sessionId: string) => void;
  readonly onCancelFollow: () => void;
  readonly onPortal?: (portal: StudioWorldPortalDefinition) => void;
}

interface PeerVisual {
  readonly image: import("phaser").GameObjects.Image;
  readonly label: import("phaser").GameObjects.Text;
  targetX: number;
  targetY: number;
  avatarIndex: number;
  facing: StudioVirtualSpaceFacing;
  moving: boolean;
  activity: StudioVirtualSpacePeer["state"]["activity"];
  nearby: boolean;
}

function facingFromVector(x: number, y: number): StudioVirtualSpaceFacing {
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? "left" : "right";
  return y < 0 ? "up" : "down";
}

function textureKey(
  avatarIndex: number,
  facing: StudioVirtualSpaceFacing,
  state: "idle" | "walk" | "talk" | "draw" | "review" = "idle",
): string {
  const skin = studioCharacterSkinForAvatarIndex(avatarIndex);
  if ((state === "talk" || state === "draw" || state === "review") && skin.state?.[state]) {
    return `studio-player-${skin.key}-state-${state}`;
  }
  return `studio-player-${skin.key}-direction-${facing}`;
}

function activityState(
  moving: boolean,
  nearby: boolean,
  activity: StudioVirtualSpacePeer["state"]["activity"],
): "idle" | "walk" | "talk" | "draw" | "review" {
  if (moving) return "walk";
  if (activity === "focused") return "draw";
  if (activity === "reviewing") return "review";
  if (nearby) return "talk";
  return "idle";
}

function desiredTextureUrl(
  avatarIndex: number,
  facing: StudioVirtualSpaceFacing,
  state: "idle" | "walk" | "talk" | "draw" | "review",
): string {
  return studioCharacterTextureUrl(avatarIndex, facing, state);
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

export function StudioVirtualSpacePhaserCanvas({
  manifest,
  snapshot,
  bridge,
  onLocalState,
  onInteract,
  onPeerSelect,
  onCancelFollow,
  onPortal,
}: StudioVirtualSpacePhaserCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef(snapshot);
  const callbacksRef = useRef({
    onLocalState,
    onInteract,
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
      onPeerSelect,
      onCancelFollow,
      onPortal,
    };
  }, [onCancelFollow, onInteract, onLocalState, onPeerSelect, onPortal]);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return undefined;

    let cancelled = false;
    let game: import("phaser").Game | null = null;

    void (async () => {
      const Phaser = await import("phaser");
      if (cancelled || !parent) return;

      const scene = new Phaser.Scene("ToonSpectrumVirtualStudio") as import("phaser").Scene & {
        preload: () => void;
        create: () => void;
      };
      const peers = new Map<string, PeerVisual>();
      let localBody: import("phaser").GameObjects.Zone | null = null;
      let localBodyPhysics: import("phaser").Physics.Arcade.Body | null = null;
      let localImage: import("phaser").GameObjects.Image | null = null;
      let localShadow: import("phaser").GameObjects.Ellipse | null = null;
      let localLabel: import("phaser").GameObjects.Text | null = null;
      let path: readonly StudioVirtualSpacePoint[] = [];
      let motion = { velocity: { x: 0, y: 0 } };
      let facing: StudioVirtualSpaceFacing = snapshotRef.current.self.facing;
      let moving = false;
      let lastPublishAt = -Infinity;
      let lastPublishedFacing = facing;
      let lastPublishedMoving = moving;
      let lastFollowPathAt = -Infinity;
      let gamepadInteractHeld = false;
      let portalCooldownUntil = 0;
      let keys: Record<string, import("phaser").Input.Keyboard.Key> | null = null;

      const getPeerSnapshot = (id: string) =>
        snapshotRef.current.peers.find((peer) => peer.participant.sessionId === id);

      const setPathTo = (point: StudioVirtualSpacePoint) => {
        if (!localBody) return;
        path = findStudioVirtualSpacePath(
          { x: localBody.x, y: localBody.y },
          point,
        );
      };

      const updateTexture = (
        image: import("phaser").GameObjects.Image,
        avatarIndex: number,
        nextFacing: StudioVirtualSpaceFacing,
        nextState: "idle" | "walk" | "talk" | "draw" | "review",
      ) => {
        const key = textureKey(avatarIndex, nextFacing, nextState);
        if (scene.textures.exists(key) && image.texture.key !== key) image.setTexture(key);
      };

      const syncPeer = (peer: StudioVirtualSpacePeer, nearby: boolean) => {
        const id = peer.participant.sessionId;
        let visual = peers.get(id);
        const state = activityState(peer.state.moving, nearby, peer.state.activity);
        const key = textureKey(peer.state.avatarIndex, peer.state.facing, state);
        if (!visual) {
          const image = scene.add.image(peer.state.x, peer.state.y, key)
            .setOrigin(0.5, 0.88)
            .setDisplaySize(92, 123)
            .setDepth(Math.round(peer.state.y) + 200)
            .setInteractive({ useHandCursor: true });
          image.on("pointerdown", () => callbacksRef.current.onPeerSelect(id));
          const label = scene.add.text(peer.state.x, peer.state.y + 18, peer.participant.displayName, {
            fontFamily: "Inter, Pretendard, sans-serif",
            fontSize: "11px",
            color: "#ffffff",
            backgroundColor: "#111827dd",
            padding: { x: 6, y: 3 },
          }).setOrigin(0.5, 0).setDepth(Math.round(peer.state.y) + 201);
          visual = {
            image,
            label,
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
        visual.targetX = peer.state.x;
        visual.targetY = peer.state.y;
        visual.avatarIndex = peer.state.avatarIndex;
        visual.facing = peer.state.facing;
        visual.moving = peer.state.moving;
        visual.activity = peer.state.activity;
        visual.nearby = nearby;
        updateTexture(visual.image, visual.avatarIndex, visual.facing, state);
        visual.image.setAlpha(peer.state.activity === "away" ? 0.62 : 1);
      };

      const syncSnapshot = (next: StudioVirtualSpaceSnapshot) => {
        const nearby = new Set(next.nearbyPeers.map((peer) => peer.participant.sessionId));
        const present = new Set<string>();
        for (const peer of next.peers) {
          present.add(peer.participant.sessionId);
          syncPeer(peer, nearby.has(peer.participant.sessionId));
        }
        for (const [id, visual] of peers) {
          if (present.has(id)) continue;
          visual.image.destroy();
          visual.label.destroy();
          peers.delete(id);
        }
        if (localBody && localImage && localBodyPhysics) {
          const distance = Math.hypot(next.self.x - localBody.x, next.self.y - localBody.y);
          if (!moving && distance > 96) {
            localBody.setPosition(next.self.x, next.self.y);
            localBodyPhysics.reset(next.self.x, next.self.y);
          }
          const localState = activityState(moving, false, next.self.activity);
          updateTexture(localImage, next.self.avatarIndex, facing, localState);
        }
      };
      runtimeRef.current = { syncSnapshot };

      scene.preload = function preload() {
        this.load.image(manifest.backgroundAssetKey, manifest.backgroundUrl);
        const loaded = new Set<string>();
        for (let avatarIndex = 0; avatarIndex < STUDIO_CHARACTER_SKINS.length; avatarIndex += 1) {
          for (const direction of ["down", "left", "right", "up"] as const) {
            for (const state of ["idle", "walk", "talk", "draw", "review"] as const) {
              const url = desiredTextureUrl(avatarIndex, direction, state);
              const key = textureKey(avatarIndex, direction, state);
              if (loaded.has(key)) continue;
              loaded.add(key);
              this.load.image(key, url);
            }
          }
        }
      };

      scene.create = function create() {
        this.physics.world.setBounds(0, 0, manifest.width, manifest.height);

        this.add.image(0, 0, manifest.backgroundAssetKey)
          .setOrigin(0)
          .setDisplaySize(manifest.width, manifest.height)
          .setDepth(-1000);

        const self = snapshotRef.current.self;
        const bodyZone = this.add.zone(self.x, self.y, 30, 18);
        localBody = bodyZone;
        this.physics.add.existing(bodyZone);
        localBodyPhysics = bodyZone.body as import("phaser").Physics.Arcade.Body;
        localBodyPhysics.setCollideWorldBounds(true);
        localBodyPhysics.setMaxVelocity(STUDIO_VIRTUAL_SPACE_WALK_SPEED * 1.4);

        for (const collider of manifest.colliders) {
          const zone = this.add.zone(collider.x, collider.y, collider.width, collider.height).setOrigin(0);
          this.physics.add.existing(zone, true);
          this.physics.add.collider(bodyZone, zone);
        }

        localShadow = this.add.ellipse(self.x, self.y + 3, 50, 14, 0x1c1111, 0.28)
          .setDepth(Math.round(self.y) + 190);
        localImage = this.add.image(
          self.x,
          self.y,
          textureKey(self.avatarIndex, self.facing, "idle"),
        ).setOrigin(0.5, 0.88)
          .setDisplaySize(98, 131)
          .setDepth(Math.round(self.y) + 200);
        localLabel = this.add.text(self.x, self.y + 20, "ME", {
          fontFamily: "Inter, Pretendard, sans-serif",
          fontSize: "10px",
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#7657eedd",
          padding: { x: 6, y: 3 },
        }).setOrigin(0.5, 0).setDepth(Math.round(self.y) + 202);

        for (const interaction of manifest.interactions) {
          const marker = this.add.text(interaction.point.x, interaction.point.y, interactionMarkerText(interaction), {
            fontSize: "18px",
            backgroundColor: "#111827b8",
            padding: { x: 5, y: 4 },
          }).setOrigin(0.5).setDepth(Math.round(interaction.point.y) + 80).setAlpha(0.82)
            .setInteractive({ useHandCursor: true });
          marker.on("pointerdown", () => {
            const current = { x: localBody?.x ?? self.x, y: localBody?.y ?? self.y };
            const distance = Math.hypot(interaction.point.x - current.x, interaction.point.y - current.y);
            if (distance <= interaction.radius) callbacksRef.current.onInteract();
            else setPathTo(interaction.point);
          });
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
        }) as Record<string, import("phaser").Input.Keyboard.Key> | null;

        this.input.on("pointerdown", (pointer: import("phaser").Input.Pointer) => {
          if (!pointer.leftButtonDown()) return;
          bridge.setFollowingPeer(null);
          callbacksRef.current.onCancelFollow();
          setPathTo({ x: pointer.worldX, y: pointer.worldY });
        });

        const camera = this.cameras.main;
        camera.setBounds(0, 0, manifest.width, manifest.height);
        camera.startFollow(localBody, true, 0.085, 0.085);
        camera.setDeadzone(160, 110);
        const resizeCamera = (gameSize: { width: number; height: number }) => {
          const cover = Math.max(gameSize.width / manifest.width, gameSize.height / manifest.height);
          camera.setZoom(Math.max(0.72, Math.min(1.35, cover)));
        };
        resizeCamera({ width: this.scale.width, height: this.scale.height });
        this.scale.on("resize", (gameSize: { width: number; height: number }) => resizeCamera(gameSize));

        syncSnapshot(snapshotRef.current);
      };

      scene.update = function update(time: number, deltaMs: number) {
        if (!localBody || !localBodyPhysics || !localImage || !localShadow || !localLabel) return;
        const dt = Math.min(0.05, Math.max(0, deltaMs / 1000));
        let ix = bridge.getJoystick().x;
        let iy = bridge.getJoystick().y;
        if (keys?.left?.isDown || keys?.a?.isDown) ix -= 1;
        if (keys?.right?.isDown || keys?.d?.isDown) ix += 1;
        if (keys?.up?.isDown || keys?.w?.isDown) iy -= 1;
        if (keys?.down?.isDown || keys?.s?.isDown) iy += 1;

        const pads = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
          ? Array.from(navigator.getGamepads())
          : [];
        const pad = pads.find((candidate) => Boolean(candidate?.connected)) ?? null;
        const gamepad = readStudioVirtualSpaceGamepadInput(pad);
        ix += gamepad.x;
        iy += gamepad.y;

        const interactPressed = Boolean(keys?.interact && Phaser.Input.Keyboard.JustDown(keys.interact))
          || (gamepad.interact && !gamepadInteractHeld);
        gamepadInteractHeld = gamepad.interact;
        if (interactPressed) callbacksRef.current.onInteract();

        const moveRequest = bridge.consumeMoveTarget();
        if (moveRequest) setPathTo(moveRequest);

        const followPeerId = bridge.getFollowingPeer();
        if (followPeerId && time - lastFollowPathAt >= 320) {
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
        } else if (path.length > 0) {
          const target = path[0]!;
          const dx = target.x - localBody.x;
          const dy = target.y - localBody.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= STUDIO_VIRTUAL_SPACE_CLICK_STOP_DISTANCE + 2) {
            path = path.slice(1);
          } else {
            ix = dx / Math.max(1, distance);
            iy = dy / Math.max(1, distance);
          }
        }

        const sprint = Boolean(keys?.shift?.isDown || gamepad.sprint);
        const config = {
          ...DEFAULT_STUDIO_MOTION_CONFIG,
          maxSpeed: STUDIO_VIRTUAL_SPACE_WALK_SPEED * (sprint ? 1.35 : 1),
        };
        motion = stepStudioVirtualSpaceMotion(motion, { x: ix, y: iy }, dt, config);
        localBodyPhysics.setVelocity(motion.velocity.x, motion.velocity.y);

        const speed = Math.hypot(motion.velocity.x, motion.velocity.y);
        const nextMoving = speed > 5;
        if (speed > 10) facing = facingFromVector(motion.velocity.x, motion.velocity.y);

        const activity = snapshotRef.current.self.activity;
        const localState = activityState(nextMoving, false, activity);
        updateTexture(localImage, snapshotRef.current.self.avatarIndex, facing, localState);

        const bob = nextMoving ? Math.sin(time * 0.024) * 2.8 : 0;
        localImage.setPosition(localBody.x, localBody.y + 6 + bob);
        localImage.setAngle(nextMoving ? Math.sin(time * 0.018) * 0.8 : 0);
        localImage.setDepth(Math.round(localBody.y) + 200);
        localShadow.setPosition(localBody.x, localBody.y + 7);
        localShadow.setScale(nextMoving ? 0.86 + Math.cos(time * 0.024) * 0.07 : 1, 1);
        localShadow.setDepth(Math.round(localBody.y) + 190);
        localLabel.setPosition(localBody.x, localBody.y + 20).setDepth(Math.round(localBody.y) + 202);

        for (const visual of peers.values()) {
          const factor = 1 - Math.exp(-12 * dt);
          visual.image.x += (visual.targetX - visual.image.x) * factor;
          visual.image.y += (visual.targetY - visual.image.y) * factor;
          const peerState = activityState(visual.moving, visual.nearby, visual.activity);
          updateTexture(visual.image, visual.avatarIndex, visual.facing, peerState);
          const peerBob = visual.moving ? Math.sin(time * 0.021 + visual.targetX * 0.03) * 2.2 : 0;
          visual.image.setY(visual.image.y + peerBob * 0.05);
          visual.image.setDepth(Math.round(visual.image.y) + 200);
          visual.label.setPosition(visual.image.x, visual.image.y + 18).setDepth(Math.round(visual.image.y) + 201);
        }

        for (const portal of manifest.portals) {
          if (time < portalCooldownUntil) break;
          if (Math.hypot(portal.point.x - localBody.x, portal.point.y - localBody.y) <= portal.radius) {
            portalCooldownUntil = time + 900;
            callbacksRef.current.onPortal?.(portal);
            break;
          }
        }

        const shouldPublish = time - lastPublishAt >= 80
          || nextMoving !== lastPublishedMoving
          || facing !== lastPublishedFacing;
        if (shouldPublish) {
          const point = { x: localBody.x, y: localBody.y };
          callbacksRef.current.onLocalState({
            point,
            facing,
            moving: nextMoving,
            zoneId: studioWorldRoomAt(manifest, point),
          });
          lastPublishAt = time;
          lastPublishedMoving = nextMoving;
          lastPublishedFacing = facing;
        }
        moving = nextMoving;
      };

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        transparent: false,
        backgroundColor: "#17181b",
        antialias: true,
        roundPixels: false,
        pixelArt: false,
        scale: {
          mode: Phaser.Scale.RESIZE,
          width: parent.clientWidth || 842,
          height: parent.clientHeight || 827,
        },
        physics: {
          default: "arcade",
          arcade: {
            debug: false,
            gravity: { x: 0, y: 0 },
          },
        },
        scene,
      });
    })();

    return () => {
      cancelled = true;
      runtimeRef.current = null;
      game?.destroy(true);
      parent.replaceChildren();
    };
  }, [bridge, manifest]);

  return (
    <div
      ref={hostRef}
      className="studio-vspace-phaser-canvas absolute inset-0 z-[2]"
      data-studio-phaser-runtime="true"
      aria-hidden="true"
    />
  );
}
