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

/** 흉상 크롭 시작 높이: 프레임 상단 여백 바로 아래(머리 꼭대기)에서 시작한다. */
export const STUDIO_CHARACTER_BUST_TOP_RATIO = 0.04;
/** 흉상 크롭 높이: 머리·목·어깨가 들어가는 프레임 높이 비율(하단 58% 지점까지). */
export const STUDIO_CHARACTER_BUST_HEIGHT_RATIO = 0.54;
/** 흉상 크롭 가로 상한(세로 대비). 너무 넓으면 얼굴이 작아져서 가운데를 이 비율로 제한한다. */
export const STUDIO_CHARACTER_BUST_MAX_ASPECT = 1.3;

const roundBust = (value: number): number => Math.round(value * 100) / 100;

/**
 * 초상화용 흉상 크롭 rect(원본 이미지 좌표). 전체 프레임이 아니라 머리·어깨만 담는다.
 * 프레임 정보가 없는 단일 이미지 에셋은 null — 호출 측이 CSS 확대 크롭으로 대체한다.
 */
export function studioCharacterBustFrame(asset: StudioCharacterTextureAsset): StudioCharacterAtlasGridFrame | null {
  const frame = studioCharacterPreviewFrame(asset);
  if (!frame) return null;
  const height = frame.height * STUDIO_CHARACTER_BUST_HEIGHT_RATIO;
  const width = Math.min(frame.width, height * STUDIO_CHARACTER_BUST_MAX_ASPECT);
  return {
    index: frame.index,
    x: roundBust(frame.x + (frame.width - width) / 2),
    y: roundBust(frame.y + frame.height * STUDIO_CHARACTER_BUST_TOP_RATIO),
    width: roundBust(width),
    height: roundBust(height),
  };
}
