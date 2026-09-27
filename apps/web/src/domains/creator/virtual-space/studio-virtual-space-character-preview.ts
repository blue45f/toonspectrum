import { studioCharacterStaticSheetMatches, type StudioCharacterTextureAsset } from "./studio-virtual-space-character-assets";
import { studioCharacterAtlasGridFrames, type StudioCharacterAtlasGridFrame } from "./studio-virtual-space-character-atlas";

/** 검수된 프레임 전체를 사용한다. 투명 여백이나 머리·발의 원본 범위를 임의로 잘라내지 않는다. */
export function studioCharacterPreviewFrame(asset: StudioCharacterTextureAsset): StudioCharacterAtlasGridFrame | null {
  if (asset.frame === undefined || !asset.atlas
    || !studioCharacterStaticSheetMatches(asset, asset.atlas.width, asset.atlas.height)) return null;
  if (asset.atlas.slicing !== undefined) return studioCharacterAtlasGridFrames(asset.atlas)[asset.frame] ?? null;
  if (!asset.frameWidth || !asset.frameHeight) return null;
  return { index: asset.frame, x: asset.frame % 2 * asset.frameWidth, y: Math.floor(asset.frame / 2) * asset.frameHeight,
    width: asset.frameWidth, height: asset.frameHeight };
}
