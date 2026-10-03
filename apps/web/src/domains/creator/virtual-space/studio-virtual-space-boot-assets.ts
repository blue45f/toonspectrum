import { studioCinematicBackdropUrl } from "./experience/studio-cinematic-art";
import {
  studioCharacterStaticAsset,
} from "./studio-virtual-space-character-assets";
import {
  resolveStudioCharacterAppearance,
  studioCharacterSkinForArtStyle,
  STUDIO_CHARACTER_SKINS,
  type StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";
import { STUDIO_NPC_CAST, studioNpcCastSkinByKey } from "./studio-virtual-space-npc-cast";
import {
  studioVirtualArtTextureUrl,
  type StudioVirtualArtStyleKey,
} from "./studio-virtual-space-art-style";
import { studioLivingWorldTextureKeys } from "./studio-virtual-space-living-world";
import type { StudioVirtualBackdrop } from "./studio-virtual-space-environment-preference";
import type { StudioVirtualSpacePresenceState } from "./studio-virtual-space-model";
import { studioExperienceAtlas } from "./studio-virtual-space-experience-art";
import {
  STUDIO_EXPERIENCE_ATLAS,
  studioSceneActorScale,
} from "./studio-virtual-space-scene-art-runtime";
import {
  customSpriteSheetSkin,
  getActiveSpriteSheetConfig,
} from "./studio-virtual-space-sprite-sheet";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/** 씬 아트 텍스처 키·아틀라스 표. 아트 스타일과 배경 선택만으로 결정된다. */
export function studioSceneArtKeys(input: {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly backdrop: StudioVirtualBackdrop;
}) {
  const { manifest, artStyle } = input;
  const backgroundTextureKey = `studio-world-background-${manifest.backgroundAssetKey}-${artStyle}`;
  const backgroundUrl = studioVirtualArtTextureUrl(artStyle, "world-base");
  const horizonTextureKey = `studio-imagegen25-horizon-${artStyle}-${input.backdrop}`;
  const horizonUrl = studioCinematicBackdropUrl(input.backdrop, artStyle, studioSceneActorScale(manifest) < 1);
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
  return {
    backgroundTextureKey,
    backgroundUrl,
    horizonTextureKey,
    horizonUrl,
    livingTextureKeys,
    decorationTextureKeys,
    landmarksTextureKey,
    actorExpressionTextureKey,
    sceneArtAtlases,
  };
}

/** 부팅 시 캐릭터 에셋(폴백·NPC·로컬 아바타). 커스텀 시트가 활성이면 로컬 스킨만 교체한다. */
export function studioCharacterBootAssets(input: {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly self: StudioVirtualSpacePresenceState;
  readonly identity: string | undefined;
}): {
  readonly fallbackAsset: ReturnType<typeof studioCharacterStaticAsset>;
  readonly npcFallbackAsset: ReturnType<typeof studioCharacterStaticAsset>;
  readonly npcBootAssets: readonly ReturnType<typeof studioCharacterStaticAsset>[];
  readonly selfCustomSheetSkin: StudioCharacterSkin | null;
  readonly bootSelfAsset: ReturnType<typeof studioCharacterStaticAsset>;
} {
  const { manifest, artStyle } = input;
  const fallbackAsset = studioCharacterStaticAsset(studioCharacterSkinForArtStyle(STUDIO_CHARACTER_SKINS[0]!, artStyle), "down");
  const npcFallbackAsset = studioCharacterStaticAsset(studioCharacterSkinForArtStyle(STUDIO_NPC_CAST[0]!, artStyle), "down");
  const npcBootAssets = manifest.npcs.map((definition) => studioCharacterStaticAsset(
    studioNpcCastSkinByKey(definition.skinKey, artStyle),
    definition.facing ?? "down",
  ));
  // 커스텀 스프라이트 시트가 활성 상태면 로컬 아바타 스킨을 교체한다 (피어는 그대로).
  const initialSheetConfig = getActiveSpriteSheetConfig();
  /** 활성 커스텀 스프라이트 시트 스킨 (로컬 전용). 없으면 프로시저럴 스킨을 쓴다. */
  const selfCustomSheetSkin: StudioCharacterSkin | null =
    initialSheetConfig ? customSpriteSheetSkin(initialSheetConfig) : null;
  const bootSelfSkin = selfCustomSheetSkin
    ?? studioCharacterSkinForArtStyle(resolveStudioCharacterAppearance(input.self, input.identity).skin, artStyle);
  const bootSelfAsset = studioCharacterStaticAsset(bootSelfSkin, input.self.facing);
  return { fallbackAsset, npcFallbackAsset, npcBootAssets, selfCustomSheetSkin, bootSelfAsset };
}
