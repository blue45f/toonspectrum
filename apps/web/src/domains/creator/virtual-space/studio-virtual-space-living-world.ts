import type * as Phaser from "phaser";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioVirtualEnvironmentEffect } from "./studio-virtual-space-engine-bridge";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioSemanticSurfaceAt, studioSemanticWorldGraph } from "./studio-virtual-space-semantic-world";
import { STUDIO_TOWN_WATERFALLS, studioTownPathSegments } from "./studio-virtual-space-town-layout";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { DEFAULT_STUDIO_ENVIRONMENT_STATE, decayStudioEnvironmentState, stepStudioEnvironmentState, studioEnvironmentFlowMultiplier, type StudioEnvironmentObjectState } from "./studio-virtual-space-environment-state";
import { studioTownSeasonAt } from "./studio-virtual-space-town-program";

export type StudioVirtualTerrainKind = "grass" | "path" | "stone" | "bridge" | "boardwalk" | "shallow-water";

export interface StudioVirtualTerrainProfile {
  readonly kind: StudioVirtualTerrainKind;
  readonly speedMultiplier: number;
  readonly dragMultiplier: number;
  readonly footprint: "dust" | "leaf" | "ripple" | "spark";
  readonly walkable: boolean;
}

const TERRAIN: Readonly<Record<StudioVirtualTerrainKind, StudioVirtualTerrainProfile>> = Object.freeze({
  grass: { kind: "grass", speedMultiplier: 0.38, dragMultiplier: 1.8, footprint: "leaf", walkable: false },
  path: { kind: "path", speedMultiplier: 1, dragMultiplier: 1, footprint: "dust", walkable: true },
  stone: { kind: "stone", speedMultiplier: 0.97, dragMultiplier: 1.02, footprint: "dust", walkable: true },
  bridge: { kind: "bridge", speedMultiplier: 0.92, dragMultiplier: 1.08, footprint: "dust", walkable: true },
  boardwalk: { kind: "boardwalk", speedMultiplier: 0.9, dragMultiplier: 1.1, footprint: "dust", walkable: true },
  "shallow-water": { kind: "shallow-water", speedMultiplier: 0.62, dragMultiplier: 1.5, footprint: "ripple", walkable: true },
});

const WATER_PATCHES = Object.freeze([
  { x: 555, y: 528, width: 66, height: 62 },
  { x: 908, y: 536, width: 58, height: 58 },
]);
function inRect(point: StudioVirtualSpacePoint, rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function studioVirtualTerrainAt(
  manifest: Pick<StudioVirtualSpaceWorldManifest, "id" | "backgroundAssetKey" | "width" | "height" | "rooms">,
  point: StudioVirtualSpacePoint,
): StudioVirtualTerrainProfile {
  if (WATER_PATCHES.some((patch) => inRect(point, patch))) return TERRAIN["shallow-water"];
  const surface = studioSemanticSurfaceAt(manifest, point);
  if (surface.kind === "room") return TERRAIN.stone;
  if (surface.kind === "bridge") return TERRAIN.bridge;
  if (surface.kind === "boardwalk") return TERRAIN.boardwalk;
  if (surface.kind === "shallow-water") return TERRAIN["shallow-water"];
  if (surface.kind === "road" || surface.kind === "stairs") return TERRAIN.path;
  return TERRAIN.grass;
}

export type StudioVirtualDayPhase = "dawn" | "day" | "dusk" | "night";

export function studioVirtualDayPhase(elapsedMs: number, cycleMs = 12 * 60 * 1000): StudioVirtualDayPhase {
  const ratio = ((elapsedMs % cycleMs) + cycleMs) % cycleMs / cycleMs;
  if (ratio < 0.12) return "dawn";
  if (ratio < 0.58) return "day";
  if (ratio < 0.72) return "dusk";
  return "night";
}
export interface StudioLivingWorldTextureKeys {
  readonly cloudBack: string;
  readonly cloudFront: string;
  readonly water: string;
  readonly foliage: string;
  readonly lights: string;
  readonly weather: string;
  readonly pathOverlay: string;
  readonly waterfall: string;
  readonly waterfallSplash: string;
  readonly interactionFx: string;
}

interface AmbientActor {
  readonly body: Phaser.GameObjects.Ellipse;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly baseY: number;
  readonly speed: number;
  readonly amplitude: number;
}

interface FootstepMark {
  readonly shape: Phaser.GameObjects.Arc;
  bornAt: number;
  lifetime: number;
}

export class StudioLivingWorldRuntime {
  private readonly cloudBack: Phaser.GameObjects.TileSprite;
  private readonly cloudFront: Phaser.GameObjects.TileSprite;
  private readonly water: readonly Phaser.GameObjects.Sprite[];
  private readonly foliage: readonly Phaser.GameObjects.Sprite[];
  private readonly lights: readonly Phaser.GameObjects.Sprite[];
  private readonly weather: readonly Phaser.GameObjects.Sprite[];
  private readonly pathOverlay: Phaser.GameObjects.Image;
  private readonly elevationGraphics: Phaser.GameObjects.Graphics;
  private readonly waterfalls: readonly Phaser.GameObjects.Sprite[];
  private readonly waterfallSplashes: readonly Phaser.GameObjects.Sprite[];
  private readonly activeEffects: Phaser.GameObjects.Sprite[] = [];
  private readonly interactionFxKey: string;
  private readonly fountainAura: Phaser.GameObjects.Ellipse;
  private readonly portalAura: Phaser.GameObjects.Ellipse;
  private readonly treeAura: Phaser.GameObjects.Ellipse;
  private environmentState: StudioEnvironmentObjectState = DEFAULT_STUDIO_ENVIRONMENT_STATE;
  private readonly dayNight: Phaser.GameObjects.Rectangle;
  private readonly ambientActors: readonly AmbientActor[];
  private readonly footsteps: FootstepMark[] = [];
  private lastFootstepAt = -Infinity;
  private lanternBoostUntil = -Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly manifest: StudioVirtualSpaceWorldManifest,
    private readonly style: StudioVirtualArtStyleKey,
    keys: StudioLivingWorldTextureKeys,
  ) {
    this.interactionFxKey = keys.interactionFx;
    const liveRoom = manifest.rooms.find((room) => room.id === "live");
    const lobbyRoom = manifest.rooms.find((room) => room.id === "lobby");
    const loungeRoom = manifest.rooms.find((room) => room.id === "lounge");
    const roomPoint = (room: typeof liveRoom, fallback: StudioVirtualSpacePoint): StudioVirtualSpacePoint => room
      ? { x: room.x + room.width / 2, y: room.y + room.height / 2 } : fallback;
    const fountain = roomPoint(liveRoom, { x: 780, y: 490 });
    const portal = roomPoint(lobbyRoom, { x: 780, y: 880 });
    const tree = roomPoint(loungeRoom, { x: 1120, y: 470 });
    this.fountainAura = scene.add.ellipse(fountain.x, fountain.y, 100, 46, 0x9deaff, .05).setDepth(fountain.y + 830).setBlendMode("ADD");
    this.portalAura = scene.add.ellipse(portal.x, portal.y, 92, 42, 0xc8a8ff, .04).setDepth(portal.y + 830).setBlendMode("ADD");
    this.treeAura = scene.add.ellipse(tree.x, tree.y, 112, 48, 0xffb5d0, .03).setDepth(tree.y + 830).setBlendMode("ADD");
    this.cloudBack = scene.add.tileSprite(0, 0, manifest.width, manifest.height, keys.cloudBack)
      .setOrigin(0).setScrollFactor(0.76).setDepth(-998).setAlpha(style === "neon" ? 0.26 : 0.52);
    this.cloudFront = scene.add.tileSprite(0, 0, manifest.width, manifest.height, keys.cloudFront)
      .setOrigin(0).setScrollFactor(1.08).setDepth(39_500).setAlpha(style === "ink" ? 0.2 : 0.18);
    this.pathOverlay = scene.add.image(0, 0, keys.pathOverlay).setOrigin(0).setDisplaySize(manifest.width, manifest.height)
      .setDepth(-889).setAlpha(style === "neon" ? .72 : .88);
    this.elevationGraphics = scene.add.graphics().setDepth(-872);
    const semantic = studioSemanticWorldGraph(manifest);
    const edgeById = new Map(semantic.edges.map((edge) => [edge.id, edge] as const));
    for (const segment of studioTownPathSegments(manifest)) {
      const edge = edgeById.get(segment.id);
      if (!edge || (edge.kind !== "bridge" && edge.kind !== "stairs")) continue;
      const shadowWidth = segment.width + (edge.kind === "bridge" ? 16 : 8);
      this.elevationGraphics.lineStyle(shadowWidth, 0x101827, edge.kind === "bridge" ? .38 : .22)
        .lineBetween(segment.from.x + 5, segment.from.y + 9, segment.to.x + 5, segment.to.y + 9);
      this.elevationGraphics.lineStyle(segment.width, edge.kind === "bridge" ? 0x9d744f : 0xc9b9a4, .72)
        .lineBetween(segment.from.x, segment.from.y, segment.to.x, segment.to.y);
      if (edge.kind === "stairs") {
        const steps = 8;
        for (let index = 1; index < steps; index += 1) {
          const ratio = index / steps;
          const x = segment.from.x + (segment.to.x - segment.from.x) * ratio;
          const y = segment.from.y + (segment.to.y - segment.from.y) * ratio;
          const horizontal = Math.abs(segment.to.x - segment.from.x) > Math.abs(segment.to.y - segment.from.y);
          this.elevationGraphics.lineStyle(2, 0xffffff, .28);
          if (horizontal) this.elevationGraphics.lineBetween(x, y - segment.width * .35, x, y + segment.width * .35);
          else this.elevationGraphics.lineBetween(x - segment.width * .35, y, x + segment.width * .35, y);
        }
      }
    }
    this.waterfalls = STUDIO_TOWN_WATERFALLS.map((waterfall) => scene.add.sprite(
      waterfall.top.x, waterfall.top.y + waterfall.height / 2, keys.waterfall, 0,
    ).setDisplaySize(waterfall.width * 1.65, waterfall.height).setDepth(-860).setAlpha(.96));
    this.waterfallSplashes = STUDIO_TOWN_WATERFALLS.map((waterfall) => scene.add.sprite(
      waterfall.bottom.x, waterfall.bottom.y, keys.waterfallSplash, 0,
    ).setDisplaySize(waterfall.width * 2.2, 42).setDepth(waterfall.bottom.y + 840).setAlpha(.9));
    this.water = WATER_PATCHES.map((patch, index) => scene.add.sprite(
      patch.x + patch.width / 2,
      patch.y + patch.height / 2,
      keys.water,
      index % 4,
    ).setDisplaySize(patch.width, patch.height).setDepth(-875).setAlpha(0.9));
    const foliagePoints = [
      [78, 252], [308, 260], [635, 258], [952, 260], [1190, 252],
      [86, 552], [320, 548], [640, 548], [944, 548], [1192, 552],
      [318, 816], [640, 812], [936, 820],
    ] as const;
    const season = studioTownSeasonAt();
    this.foliage = foliagePoints.map(([x, y], index) => {
      const sprite = scene.add.sprite(x, y, keys.foliage, index % 4)
        .setDisplaySize(92, 46).setDepth(y + 850).setAlpha(style === "ink" ? 0.66 : 0.84);
      if (style !== "ink" && style !== "neon") sprite.setTint(season.foliageTint);
      return sprite;
    });
    const lightPoints = [
      [315, 230], [625, 230], [935, 230], [315, 540], [625, 540], [935, 540],
      [315, 820], [625, 820], [935, 820], [780, 835],
    ] as const;
    this.lights = lightPoints.map(([x, y], index) => scene.add.sprite(x, y, keys.lights, index % 4)
      .setDisplaySize(64, 32).setDepth(y + 920).setBlendMode("ADD"));
    this.weather = Array.from({ length: 12 }, (_, index) => {
      const sprite = scene.add.sprite(
        (index * 109 + 47) % manifest.width,
        (index * 173 + 31) % manifest.height,
        keys.weather,
        index % 4,
      ).setDepth(42_000).setAlpha(style === "neon" ? 0.5 : 0.26);
      if (style !== "ink" && style !== "neon") sprite.setTint(season.weatherTint);
      return sprite;
    });
    this.dayNight = scene.add.rectangle(0, 0, manifest.width, manifest.height, 0x111b3b, 0)
      .setOrigin(0).setDepth(41_000).setBlendMode("MULTIPLY").setScrollFactor(1);
    this.ambientActors = Array.from({ length: style === "sky-island" ? 10 : 6 }, (_, index) => {
      const body = scene.add.ellipse(80 + index * 119, 145 + (index % 4) * 173, 9, 5,
        style === "neon" ? 0x3ce6ff : style === "ink" ? 0x303039 : 0xffffff, 0.8).setDepth(30_000);
      const shadow = scene.add.ellipse(body.x, body.y + 20, 13, 4, 0x111827, 0.16).setDepth(29_999);
      return { body, shadow, baseY: body.y, speed: 0.018 + index * 0.0018, amplitude: 5 + index % 4 };
    });
  }

  update(time: number, deltaMs: number, focus: StudioVirtualSpacePoint, speed: number, reducedMotion = false): void {
    const dt = reducedMotion ? 0 : Math.min(48, Math.max(0, deltaMs));
    this.environmentState = decayStudioEnvironmentState(this.environmentState, time);
    const flowMultiplier = studioEnvironmentFlowMultiplier(this.environmentState);
    this.cloudBack.tilePositionX += dt * 0.006;
    this.cloudBack.tilePositionY += Math.sin(time * 0.00007) * dt * 0.0008;
    this.cloudFront.tilePositionX -= dt * 0.011;
    this.cloudFront.tilePositionY += Math.cos(time * 0.00011) * dt * 0.0012;
    const motionTime = reducedMotion ? 0 : time;
    const frame = reducedMotion ? 0 : Math.floor(time / 170) % 4;
    const waterfallFrame = reducedMotion ? 0 : Math.floor(time / Math.max(44, 92 / flowMultiplier)) % 8;
    this.pathOverlay.setAlpha(this.style === "neon" ? .72 : .84 + Math.sin(motionTime * .0008) * (reducedMotion ? 0 : .04));
    this.waterfalls.forEach((sprite, index) => sprite.setFrame((waterfallFrame + index) % 8)
      .setAlpha(Math.min(1, .82 + this.environmentState.waterfallEnergy * .018)));
    this.waterfallSplashes.forEach((sprite, index) => sprite.setFrame((waterfallFrame + index * 2) % 8)
      .setScale(1 + this.environmentState.waterfallEnergy * .012 + Math.sin(motionTime * .003 + index) * (reducedMotion ? 0 : .04), 1));
    this.water.forEach((sprite, index) => sprite.setFrame((frame + index) % 4));
    this.foliage.forEach((sprite, index) => sprite.setFrame((frame + index) % 4)
      .setScale(1 + Math.sin(motionTime * 0.0015 + index) * (reducedMotion ? 0 : 0.018), 1));
    const lightBoost = time < this.lanternBoostUntil ? .28 : 0;
    this.lights.forEach((sprite, index) => sprite.setFrame((frame + index) % 4)
      .setAlpha(Math.min(1, (reducedMotion ? 0.58 : 0.48 + Math.sin(time * 0.002 + index * 1.7) * 0.24) + lightBoost)));
    this.weather.forEach((sprite, index) => {
      sprite.setFrame((frame + index) % 4);
      sprite.x -= dt * (this.style === "neon" || this.style === "ink" ? 0.045 : 0.015);
      sprite.y += dt * (this.style === "neon" || this.style === "ink" ? 0.11 : 0.025);
      if (sprite.x < -128) sprite.x = this.manifest.width + 128;
      if (sprite.y > this.manifest.height + 128) sprite.y = -128;
    });
    const phase = studioVirtualDayPhase(time);
    const alpha = phase === "night" ? 0.32 : phase === "dusk" ? 0.17 : phase === "dawn" ? 0.08 : 0;
    this.dayNight.setAlpha(this.style === "neon" ? alpha * 0.25 : alpha);
    this.dayNight.setFillStyle(phase === "dusk" ? 0x4e204d : 0x101a3c, 1);
    const pulse = reducedMotion ? 0 : Math.sin(time * .003) * .025;
    this.fountainAura.setAlpha(.04 + Math.min(.32, this.environmentState.fountainWishes * .018) + pulse);
    this.portalAura.setAlpha(.03 + this.environmentState.portalCharge * .025 + pulse).setScale(1 + this.environmentState.portalCharge * .008);
    this.treeAura.setAlpha(.025 + this.environmentState.treeBloom * .022 + pulse).setScale(1 + this.environmentState.treeBloom * .006);
    this.ambientActors.forEach((actor, index) => {
      actor.body.x = (actor.body.x + dt * actor.speed * (18 + index)) % (this.manifest.width + 30);
      actor.body.y = actor.baseY + Math.sin(motionTime * 0.0017 + index) * (reducedMotion ? 0 : actor.amplitude);
      actor.shadow.setPosition(actor.body.x, actor.baseY + 20);
      const distance = Math.hypot(actor.body.x - focus.x, actor.body.y - focus.y);
      actor.body.setAlpha(distance < 160 ? 0.28 : 0.8);
    });
    for (let index = this.activeEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.activeEffects[index]!;
      const bornAt = Number(effect.getData("bornAt") ?? time);
      const progress = Math.max(0, Math.min(1, (time - bornAt) / 920));
      effect.setFrame(Math.min(7, Math.floor(progress * 8))).setAlpha(1 - progress * .45);
      if (progress >= 1) { effect.destroy(); this.activeEffects.splice(index, 1); }
    }
    this.updateFootsteps(time, reducedMotion ? 0 : speed);
  }

  triggerEnvironmentEffect(effect: StudioVirtualEnvironmentEffect, point: StudioVirtualSpacePoint, time: number): void {
    this.environmentState = stepStudioEnvironmentState(this.environmentState, effect, time);
    if (effect === "lanterns") this.lanternBoostUntil = time + 5_000;
    const sprite = this.scene.add.sprite(point.x, point.y - 12, this.interactionFxKey, 0)
      .setDisplaySize(effect === "gong" || effect === "spotlight" ? 180 : effect === "photo" ? 150 : 126, effect === "photo" || effect === "spotlight" ? 150 : 126)
      .setDepth(Math.round(point.y) + 2_200)
      .setBlendMode(effect === "waterfall-splash" ? "NORMAL" : "ADD")
      .setData("bornAt", time);
    this.activeEffects.push(sprite);
    const color = effect === "waterfall-splash" ? 0x9cecff
      : effect === "petals" || effect === "pet" ? 0xffa5cd
        : effect === "lanterns" ? 0xffdf7d
          : effect === "gong" ? 0xffc857
            : effect === "spotlight" ? 0xaee9ff : 0xd7c5ff;
    const count = effect === "photo" ? 6 : effect === "gong" || effect === "spotlight" ? 18 : 12;
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2;
      const particle = this.scene.add.circle(point.x, point.y - 8, effect === "pet" ? 4 : 3, color, .85)
        .setDepth(Math.round(point.y) + 2_201);
      this.scene.tweens.add({
        targets: particle,
        x: point.x + Math.cos(angle) * (effect === "gong" || effect === "spotlight" ? 95 : 54),
        y: point.y - 8 + Math.sin(angle) * (effect === "waterfall-splash" ? 22 : 54),
        alpha: 0,
        scale: effect === "gong" ? 2.2 : .4,
        duration: effect === "gong" || effect === "spotlight" ? 900 : 680,
        ease: "Cubic.easeOut",
        onComplete: () => particle.destroy(),
      });
    }
    if (effect === "photo") this.scene.cameras.main.flash(170, 255, 248, 224, false);
    if (effect === "waterfall-splash" || effect === "gong") this.scene.cameras.main.shake(100, effect === "gong" ? .003 : .0015);
  }

  emitFootstep(point: StudioVirtualSpacePoint, terrain: StudioVirtualTerrainProfile, time: number): void {
    if (time - this.lastFootstepAt < 115) return;
    this.lastFootstepAt = time;
    const color = terrain.footprint === "ripple" ? 0x9ce9ff
      : terrain.footprint === "leaf" ? 0x7fbd79
        : this.style === "neon" ? 0x47e5ff : 0xe6d4ad;
    const radius = terrain.footprint === "ripple" ? 7 : 3;
    const alpha = terrain.footprint === "ripple" ? 0.34 : 0.42;
    const mark = this.scene.add.circle(point.x, point.y + 2, radius, color, alpha).setDepth(point.y + 989);
    if (terrain.footprint === "ripple") mark.setStrokeStyle(1, color, 0.62).setFillStyle(color, 0.05);
    this.footsteps.push({ shape: mark, bornAt: time, lifetime: terrain.footprint === "ripple" ? 700 : 420 });
  }

  private updateFootsteps(time: number, speed: number): void {
    for (const mark of this.footsteps) {
      const progress = Math.max(0, Math.min(1, (time - mark.bornAt) / mark.lifetime));
      mark.shape.setAlpha((1 - progress) * (speed > 5 ? 0.62 : 0.36));
      mark.shape.setScale(1 + progress * 1.6);
    }
    const alive = this.footsteps.filter((mark) => time - mark.bornAt < mark.lifetime);
    for (const mark of this.footsteps) {
      if (!alive.includes(mark)) mark.shape.destroy();
    }
    this.footsteps.splice(0, this.footsteps.length, ...alive);
  }

  destroy(): void {
    this.cloudBack.destroy();
    this.cloudFront.destroy();
    this.pathOverlay.destroy();
    this.elevationGraphics.destroy();
    this.fountainAura.destroy();
    this.portalAura.destroy();
    this.treeAura.destroy();
    this.waterfalls.forEach((item) => item.destroy());
    this.waterfallSplashes.forEach((item) => item.destroy());
    this.activeEffects.forEach((item) => item.destroy());
    this.water.forEach((item) => item.destroy());
    this.foliage.forEach((item) => item.destroy());
    this.lights.forEach((item) => item.destroy());
    this.weather.forEach((item) => item.destroy());
    this.ambientActors.forEach((actor) => { actor.body.destroy(); actor.shadow.destroy(); });
    this.footsteps.forEach((mark) => mark.shape.destroy());
    this.dayNight.destroy();
  }
}
