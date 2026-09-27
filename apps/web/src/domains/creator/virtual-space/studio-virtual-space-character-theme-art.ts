import { studioCharacterAtlasGridFrames, type StudioCharacterAtlasLayout } from "./studio-virtual-space-character-atlas";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioCharacterAtlasClip, StudioCharacterFramePresentation, StudioCharacterPoseSheet, StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";

const DIRECTION_ROW = Object.freeze({ down: 0, right: 1, left: 2, up: 3 });

export interface StudioThemeCharacterSource {
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly textureUrl: string;
  readonly width: number;
  readonly height: number;
  readonly atlas?: StudioCharacterAtlasLayout;
  /** 원본 32셀을 검수한 발 위치·머리 높이. 전혀 다른 작화의 기하값을 재사용하지 않는다. */
  readonly frames: readonly StudioCharacterFramePresentation[];
}

/** 방향별 8셀: 걷기 0~3, 대화 4, 인사 5, 좌석 6, 원고 작업 7. */
export function createStudioThemeCharacterSkin(source: StudioThemeCharacterSource): StudioCharacterSkin {
  const atlas: StudioCharacterAtlasLayout = source.atlas ?? Object.freeze({
    width: source.width, height: source.height, columns: 8, rows: 4, slicing: "rounded-grid",
  });
  if (atlas.width !== source.width || atlas.height !== source.height
    || studioCharacterAtlasGridFrames(atlas).length !== 32 || source.frames.length !== 32
    || source.frames.some((frame) => ![frame.originX, frame.originY, frame.displayHeightRatio].every(Number.isFinite)
      || frame.displayHeightRatio <= 0 || (frame.seatOriginY !== undefined && !Number.isFinite(frame.seatOriginY)))) {
    throw new Error("테마 캐릭터에는 검증된 8×4 원본과 32개 프레임 표시 좌표가 필요합니다.");
  }
  const frames = Object.freeze(source.frames.map((frame) => Object.freeze({ ...frame })));
  const sheet = { textureUrl: source.textureUrl, frameWidth: source.width / 8, frameHeight: source.height / 4, atlas };
  const walk = (facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip => {
    const start = DIRECTION_ROW[facing] * 8;
    return Object.freeze({ ...sheet, start, end: start + 3, frameRate: 8, repeat: -1, distancePerCycle: 76,
      technique: "drawn", frames: Object.freeze(frames.slice(start, start + 4)) });
  };
  const action = (column: 4 | 7) => {
    const direction = (facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip => {
      const index = DIRECTION_ROW[facing] * 8 + column;
      return Object.freeze({ ...sheet, start: index, end: index, frameRate: 1, repeat: 0,
        technique: "drawn", frames: Object.freeze(frames.slice(index, index + 1)) });
    };
    return Object.freeze({ down: direction("down"), right: direction("right"), left: direction("left"), up: direction("up") });
  };
  const pose = (column: 5 | 6): StudioCharacterPoseSheet => Object.freeze({ ...sheet, frames,
    directionFrames: Object.freeze({ down: column, right: 8 + column, left: 16 + column, up: 24 + column }) });
  return Object.freeze({
    key: `theme-avatar-${source.artStyle}`, labelKo: source.labelKo, labelEn: source.labelEn,
    nativeArtStyle: source.artStyle, selectionOnly: true, sharedAtlas: true,
    directional: Object.freeze({ down: source.textureUrl, right: source.textureUrl, left: source.textureUrl, up: source.textureUrl }),
    clips: Object.freeze({ "walk-down": walk("down"), "walk-right": walk("right"), "walk-left": walk("left"), "walk-up": walk("up") }),
    idleFrames: Object.freeze({ down: 0, right: 8, left: 16, up: 24 }),
    actions: Object.freeze({ talk: action(4), draw: action(7), review: action(7) }),
    poses: Object.freeze({ wave: pose(5), sit: pose(6) }),
  });
}
