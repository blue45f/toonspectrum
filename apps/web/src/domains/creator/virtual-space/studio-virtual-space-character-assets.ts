import {
  studioCharacterWalkClip,
  studioCharacterActionClip,
  type StudioCharacterMotionState,
  type StudioCharacterSkin,
  type StudioCharacterFramePresentation,
  type StudioCharacterAtlasClip,
  type StudioCharacterPoseSheet,
} from "./studio-virtual-space-character-skins";
import { studioCharacterAtlasFrameCount, studioCharacterAtlasSheetMatches } from "./studio-virtual-space-character-atlas";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import { STUDIO_CHARACTER_FOOT_ORIGIN } from "./studio-virtual-space-presentation";

export interface StudioCharacterTextureAsset {
  readonly key: string;
  readonly url: string;
  readonly type: "image" | "spritesheet";
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly animationKey?: string;
  /** 공통 atlas를 해제할 때 함께 정리할 방향별 animation 목록. */
  readonly animationKeys?: readonly string[];
  /** 정지 자세도 원본 atlas의 한 셀과 동일한 기하 정보를 사용한다. */
  readonly frame?: number;
  readonly presentation?: StudioCharacterFramePresentation;
  readonly atlas?: StudioCharacterAtlasClip["atlas"];
  /**
   * 픽셀 아트 스킨(LPC)은 텍스처를 최근접(NEAREST) 필터로 샘플링해야 픽셀 경계가 번지지 않는다.
   * 렌더러는 이 값이 "nearest"면 텍스처 필터를 바꾼다(없으면 장면 기본 필터).
   */
  readonly textureFilter?: "nearest";
}

/** 픽셀 아트 스킨의 모든 텍스처 자산에 최근접 필터 힌트를 붙인다. */
const pixelTextureFilter = (skin: StudioCharacterSkin): Pick<StudioCharacterTextureAsset, "textureFilter"> =>
  skin.pixelArt ? { textureFilter: "nearest" } : {};

function idleAtlas(skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing) {
  const clip = studioCharacterWalkClip(skin, facing);
  const frame = skin.idleFrames?.[facing];
  if (!clip || frame === undefined || !Number.isSafeInteger(frame) || frame < 0) return undefined;
  if (frame >= clip.start && frame <= clip.end) return { clip, frame, presentation: clip.frames?.[frame - clip.start] };
  // 걷기 순환 밖의 서기 셀은 같은 격자 안이고 표시 좌표가 명시된 경우만 쓴다(LPC 걷기 시트 0열).
  return skin.idlePresentation && clip.atlas?.slicing && frame < studioCharacterAtlasFrameCount(clip.atlas)
    ? { clip, frame, presentation: skin.idlePresentation } : undefined;
}

export function studioCharacterStaticTextureKey(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState = "idle",
): string {
  if ((state === "talk" || state === "draw" || state === "review") && skin.state?.[state]) {
    return `studio-player-${skin.key}-state-${state}`;
  }
  return idleAtlas(skin, facing) ? studioCharacterWalkTextureKey(skin, facing) : `studio-player-${skin.key}-direction-${facing}`;
}

/** 동작별 공유 시트는 방향 접미사 없이 한 텍스처 키를 쓴다(같은 원본을 방향마다 따로 올리지 않는다). */
const motionSheetSuffix = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing) =>
  skin.sharedMotionSheets ? "" : `-${facing}`;

export const studioCharacterWalkTextureKey = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing) =>
  skin.sharedAtlas ? `studio-player-${skin.key}-atlas` : `studio-player-${skin.key}-walk-sheet${motionSheetSuffix(skin, facing)}`;
export const studioCharacterWalkAnimationKey = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing) =>
  `studio-player-${skin.key}-walk-animation-${facing}`;
export const studioCharacterPoseTextureKey = (skin: StudioCharacterSkin, state: "sit" | "wave") =>
  skin.sharedAtlas ? `studio-player-${skin.key}-atlas` : `studio-player-${skin.key}-pose-sheet-${state}`;
export const studioCharacterActionTextureKey = (skin: StudioCharacterSkin, facing: StudioVirtualSpaceFacing, state: StudioCharacterMotionState) =>
  skin.sharedAtlas ? `studio-player-${skin.key}-atlas` : `studio-player-${skin.key}-${state}-sheet${motionSheetSuffix(skin, facing)}`;

/** 네 방향 걷기 애니메이션이 한 텍스처를 쓰면 텍스처를 내릴 때 함께 정리한다. */
function sharedAtlasAnimations(skin: StudioCharacterSkin) {
  return skin.sharedAtlas || skin.sharedMotionSheets ? { animationKeys: (["down", "right", "left", "up"] as const)
    .map((facing) => studioCharacterWalkAnimationKey(skin, facing)) } : {};
}

/** Local scene time drives actions; floor distance only drives walking. */
export function studioCharacterActionFrame(clip: StudioCharacterAtlasClip, elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return clip.start;
  return clip.start + Math.floor(elapsedMs * clip.frameRate / 1_000) % (clip.end - clip.start + 1);
}

/** Never infer a different cell grid from an unexpected CDN/source image. */
export function studioCharacterActionSheetMatches(clip: StudioCharacterAtlasClip, width: number, height: number): boolean {
  return studioCharacterAtlasSheetMatches(clip, width, height)
    && Number.isSafeInteger(clip.start) && Number.isSafeInteger(clip.end)
    && clip.start >= 0 && clip.end >= clip.start && clip.end < studioCharacterAtlasFrameCount(clip.atlas);
}

export function studioCharacterPoseSheetMatches(pose: StudioCharacterPoseSheet, width: number, height: number): boolean {
  return studioCharacterAtlasSheetMatches(pose, width, height)
    && Object.values(pose.directionFrames).every((frame) => Number.isSafeInteger(frame)
      && frame >= 0 && frame < studioCharacterAtlasFrameCount(pose.atlas) && pose.frames[frame] !== undefined);
}

/** 로더는 선언된 원본 크기와 격자를 검증한 뒤 프레임을 등록한다. */
export function studioCharacterTextureSheetMatches(asset: StudioCharacterTextureAsset, width: number, height: number): boolean {
  return asset.type === "spritesheet" && asset.frameWidth !== undefined && asset.frameHeight !== undefined
    && studioCharacterAtlasSheetMatches({ frameWidth: asset.frameWidth, frameHeight: asset.frameHeight, atlas: asset.atlas }, width, height);
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

/** 원본 atlas 크기가 달라지면 전체 시트나 잘못된 셀을 정지 자세로 표시하지 않는다. */
export function studioCharacterStaticSheetMatches(asset: StudioCharacterTextureAsset, width: number, height: number): boolean {
  return asset.frame === undefined || (asset.atlas !== undefined && studioCharacterTextureSheetMatches(asset, width, height)
    && Number.isSafeInteger(asset.frame) && asset.frame >= 0 && asset.frame < studioCharacterAtlasFrameCount(asset.atlas));
}

export function studioCharacterStaticAsset(
  skin: StudioCharacterSkin,
  facing: StudioVirtualSpaceFacing,
  state: StudioCharacterMotionState = "idle",
): StudioCharacterTextureAsset {
  const stateUrl = state === "talk" || state === "draw" || state === "review" ? skin.state?.[state] : undefined;
  const idle = stateUrl ? undefined : idleAtlas(skin, facing);
  if (idle) return {
    key: studioCharacterWalkTextureKey(skin, facing), url: idle.clip.textureUrl, type: "spritesheet",
    frameWidth: idle.clip.frameWidth, frameHeight: idle.clip.frameHeight,
    animationKey: studioCharacterWalkAnimationKey(skin, facing), frame: idle.frame,
    presentation: idle.presentation,
    atlas: idle.clip.atlas,
    ...sharedAtlasAnimations(skin),
    ...pixelTextureFilter(skin),
  };
  return { key: studioCharacterStaticTextureKey(skin, facing, state), url: stateUrl ?? skin.directional[facing], type: "image", ...pixelTextureFilter(skin) };
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
  if (clip && !assets.some((asset) => asset.key === studioCharacterWalkTextureKey(skin, facing))) assets.push({ key: studioCharacterWalkTextureKey(skin, facing), url: clip.textureUrl,
    type: "spritesheet", frameWidth: clip.frameWidth, frameHeight: clip.frameHeight,
    animationKey: studioCharacterWalkAnimationKey(skin, facing), atlas: clip.atlas, ...sharedAtlasAnimations(skin), ...pixelTextureFilter(skin) });
  const action = studioCharacterActionClip(skin, facing, state);
  if (action && !assets.some((asset) => asset.key === studioCharacterActionTextureKey(skin, facing, state))) assets.push({ key: studioCharacterActionTextureKey(skin, facing, state), url: action.textureUrl,
    type: "spritesheet", frameWidth: action.frameWidth, frameHeight: action.frameHeight, atlas: action.atlas, ...pixelTextureFilter(skin) });
  const pose = state === "sit" || state === "wave" ? skin.poses?.[state] : undefined;
  if (pose && (state === "sit" || state === "wave") && !assets.some((asset) => asset.key === studioCharacterPoseTextureKey(skin, state))) assets.push({ key: studioCharacterPoseTextureKey(skin, state), url: pose.textureUrl,
    type: "spritesheet", frameWidth: pose.frameWidth, frameHeight: pose.frameHeight, atlas: pose.atlas, ...pixelTextureFilter(skin) });
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
