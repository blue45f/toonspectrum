import {
  studioCharacterWalkClip,
  studioCharacterActionClip,
  type StudioCharacterMotionState,
  type StudioCharacterSkin,
  type StudioCharacterFramePresentation,
  type StudioCharacterAtlasClip,
} from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import { STUDIO_CHARACTER_FOOT_ORIGIN } from "./studio-virtual-space-presentation";

export interface StudioCharacterTextureAsset {
  readonly key: string;
  readonly url: string;
  readonly type: "image" | "spritesheet";
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly animationKey?: string;
}

export function studioCharacterStaticTextureKey(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState = "idle",
): string {
  return (state === "talk" || state === "draw" || state === "review") && skin.state?.[state]
    ? `studio-player-${skin.key}-state-${state}`
    : `studio-player-${skin.key}-direction-${facing}`;
}

export const studioCharacterWalkTextureKey = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing) =>
  `studio-player-${skin.key}-walk-sheet-${facing}`;
export const studioCharacterWalkAnimationKey = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing) =>
  `studio-player-${skin.key}-walk-animation-${facing}`;
export const studioCharacterPoseTextureKey = (skin: StudioCharacterSkin, state: "sit" | "wave") =>
  `studio-player-${skin.key}-pose-sheet-${state}`;
export const studioCharacterActionTextureKey = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing, state: StudioCharacterMotionState) =>
  `studio-player-${skin.key}-${state}-sheet-${facing}`;

/** Local scene time drives actions; floor distance only drives walking. */
export function studioCharacterActionFrame(clip: StudioCharacterAtlasClip, elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return clip.start;
  return clip.start + Math.floor(elapsedMs * clip.frameRate / 1_000) % (clip.end - clip.start + 1);
}

/** Never infer a different cell grid from an unexpected CDN/source image. */
export function studioCharacterActionSheetMatches(clip: StudioCharacterAtlasClip, width: number, height: number): boolean {
  const atlas = clip.atlas;
  if (!atlas) return width === clip.frameWidth * 2 && height === clip.frameHeight * 2;
  const remainder = atlas.remainder;
  return [width, height, clip.frameWidth, clip.frameHeight].every((n) => Number.isSafeInteger(n) && n > 0)
    && width === atlas.width && height === atlas.height
    && (remainder.right === 0 || remainder.right === 1) && (remainder.bottom === 0 || remainder.bottom === 1)
    && width === clip.frameWidth * 2 + remainder.right && height === clip.frameHeight * 2 + remainder.bottom
    && (remainder.maxAlpha === 0 || remainder.maxAlpha === 1)
    && (remainder.nonzeroAlphaPixels === 0 || remainder.nonzeroAlphaPixels === 1);
}

export function studioCharacterFrameGeometry(
  frame: StudioCharacterFramePresentation | undefined,
  frameWidth: number,
  frameHeight: number,
  visualWidth: number,
  visualHeight: number,
  seatAttached = false,
) {
  if (!frame) return { width: visualWidth, height: visualHeight, originX: 0.5, originY: STUDIO_CHARACTER_FOOT_ORIGIN };
  const height = visualHeight * frame.displayHeightRatio;
  return { width: height * frameWidth / frameHeight, height, originX: frame.originX,
    originY: seatAttached && frame.seatOriginY !== undefined ? frame.seatOriginY : frame.originY };
}

export function studioCharacterStaticAsset(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState = "idle",
): StudioCharacterTextureAsset {
  const stateUrl = state === "talk" || state === "draw" || state === "review" ? skin.state?.[state] : undefined;
  return { key: studioCharacterStaticTextureKey(skin, facing, state), url: stateUrl ?? skin.directional[facing], type: "image" };
}

/** Only the displayed direction/state is needed. Never make unrelated skins block entry. */
export function studioCharacterVisualAssets(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState,
): readonly StudioCharacterTextureAsset[] {
  const idle = studioCharacterStaticAsset(skin, facing);
  const current = studioCharacterStaticAsset(skin, facing, state);
  const assets = current.key === idle.key ? [idle] : [idle, current];
  const clip = state === "walk" ? studioCharacterWalkClip(skin, facing) : undefined;
  if (clip) assets.push({ key: studioCharacterWalkTextureKey(skin, facing), url: clip.textureUrl,
    type: "spritesheet", frameWidth: clip.frameWidth, frameHeight: clip.frameHeight,
    animationKey: studioCharacterWalkAnimationKey(skin, facing) });
  const action = studioCharacterActionClip(skin, facing, state);
  if (action) assets.push({ key: studioCharacterActionTextureKey(skin, facing, state), url: action.textureUrl,
    type: "spritesheet", frameWidth: action.frameWidth, frameHeight: action.frameHeight });
  const pose = state === "sit" || state === "wave" ? skin.poses?.[state] : undefined;
  if (pose) assets.push({ key: studioCharacterPoseTextureKey(skin, state as "sit" | "wave"), url: pose.textureUrl,
    type: "spritesheet", frameWidth: pose.frameWidth, frameHeight: pose.frameHeight });
  return assets;
}

interface TextureRecord {
  readonly asset: StudioCharacterTextureAsset;
  readonly owners: Set<string>;
  state: "loading" | "ready" | "failed";
  unusedAt: number | null;
  dispose?: () => void;
}

export interface StudioCharacterTextureBackend {
  readonly has: (asset: StudioCharacterTextureAsset) => boolean;
  /** Complete exactly once; dispose removes loader listeners without mutating any actor. */
  readonly load: (asset: StudioCharacterTextureAsset, complete: (success: boolean) => void) => () => void;
  readonly remove: (asset: StudioCharacterTextureAsset) => void;
}

/** Scene-local residency; completion never retains a sprite or writes to a departed actor. */
export class StudioCharacterAssetResidency {
  private readonly owners = new Map<string, Set<string>>();
  private readonly records = new Map<string, TextureRecord>();
  private closed = false;

  constructor(
    private readonly backend: StudioCharacterTextureBackend,
    private readonly now: () => number = () => performance.now(),
    private readonly idleRetentionMs = 30_000,
  ) {}

  use(owner: string, assets: readonly StudioCharacterTextureAsset[], displayedKey?: string): void {
    if (this.closed) return;
    const desired = new Map(assets.map((asset) => [asset.key, asset]));
    // Retain the previous visible frame until the new skin/direction has loaded and is applied.
    const displayed = displayedKey ? this.records.get(displayedKey)?.asset : undefined;
    if (displayed) desired.set(displayed.key, displayed);
    const previous = this.owners.get(owner) ?? new Set<string>();
    const keys = new Set(desired.keys());
    for (const key of previous) {
      if (!keys.has(key)) this.unref(owner, key);
    }
    this.owners.set(owner, keys);
    for (const asset of desired.values()) {
      let record = this.records.get(asset.key);
      if (record) {
        record.owners.add(owner);
        record.unusedAt = null;
        continue;
      }
      record = { asset, owners: new Set([owner]), state: this.backend.has(asset) ? "ready" : "loading", unusedAt: null };
      this.records.set(asset.key, record);
      if (record.state !== "loading") continue;
      const current = record;
      const dispose = this.backend.load(asset, (success) => {
        // The closure belongs to one scene generation and one request record only.
        if (this.closed || this.records.get(asset.key) !== current || current.state !== "loading") return;
        current.state = success ? "ready" : "failed";
        current.dispose?.();
        current.dispose = undefined;
        if (current.owners.size === 0) {
          if (success) this.backend.remove(asset);
          this.records.delete(asset.key);
        }
      });
      if (current.state === "loading") current.dispose = dispose;
      else dispose();
    }
  }

  release(owner: string): void {
    for (const key of this.owners.get(owner) ?? []) this.unref(owner, key);
    this.owners.delete(owner);
  }

  private unref(owner: string, key: string): void {
    const record = this.records.get(key);
    if (!record) return;
    record.owners.delete(owner);
    if (record.owners.size === 0) record.unusedAt = this.now();
  }

  /** A short cache prevents repeated direction changes from downloading the same atlas. */
  collect(): void {
    if (this.closed) return;
    for (const [key, record] of this.records) {
      if (record.owners.size > 0 || record.unusedAt === null || record.state === "loading"
        || this.now() - record.unusedAt < this.idleRetentionMs) continue;
      if (record.state === "ready") this.backend.remove(record.asset);
      this.records.delete(key);
    }
  }

  close(): void {
    this.closed = true;
    for (const record of this.records.values()) record.dispose?.();
    this.records.clear();
    this.owners.clear();
    // Phaser's Game owns final GPU destruction; don't touch a replacement scene's textures.
  }
}
