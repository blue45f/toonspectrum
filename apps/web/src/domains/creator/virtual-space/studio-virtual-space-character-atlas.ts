/** 기존 2×2 원본은 검수된 여백을 유지하고 신규 격자는 원본 전체를 정수 경계로 나눈다. */
export type StudioCharacterAtlasLayout = {
  readonly width: number;
  readonly height: number;
  readonly slicing?: never;
  readonly columns?: never;
  readonly rows?: never;
  readonly remainder: {
    readonly right: 0 | 1;
    readonly bottom: 0 | 1;
    readonly maxAlpha: 0 | 1;
    readonly nonzeroAlphaPixels: 0 | 1;
  };
} | {
  readonly width: number;
  readonly height: number;
  readonly slicing: "rounded-grid";
  readonly columns: number;
  readonly rows: number;
  readonly remainder?: never;
} | {
  readonly width: number;
  readonly height: number;
  readonly slicing: "explicit-frames";
  readonly columns: number;
  readonly rows: number;
  /** 생성 원본의 불균등 간격을 보존하는 검수된 객체별 정수 영역. */
  readonly frames: readonly StudioCharacterAtlasGridFrame[];
  readonly remainder?: never;
};

export interface StudioCharacterAtlasGridFrame {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function isValidGrid(atlas: StudioCharacterAtlasLayout): boolean {
  return atlas.slicing === "rounded-grid"
    && [atlas.width, atlas.height, atlas.columns, atlas.rows].every((value) => Number.isSafeInteger(value) && value > 0)
    && atlas.columns <= atlas.width && atlas.rows <= atlas.height
    && atlas.columns * atlas.rows <= 256;
}

function isValidExplicit(atlas: StudioCharacterAtlasLayout): boolean {
  return atlas.slicing === "explicit-frames"
    && [atlas.width, atlas.height, atlas.columns, atlas.rows].every((value) => Number.isSafeInteger(value) && value > 0)
    && atlas.frames.length === atlas.columns * atlas.rows && atlas.frames.length <= 256
    && atlas.frames.every((frame, index) => frame.index === index
      && [frame.x, frame.y, frame.width, frame.height].every(Number.isSafeInteger)
      && frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0
      && frame.x + frame.width <= atlas.width && frame.y + frame.height <= atlas.height);
}

/** Phaser texture.add의 숫자 프레임에 사용한다. 경계가 겹치거나 잘리는 픽셀 없이 원본 전체를 보존한다. */
export function studioCharacterAtlasGridFrames(atlas: StudioCharacterAtlasLayout): readonly StudioCharacterAtlasGridFrame[] {
  if (atlas.slicing === "explicit-frames") return isValidExplicit(atlas) ? atlas.frames : [];
  if (atlas.slicing !== "rounded-grid" || !isValidGrid(atlas)) return [];
  const frames: StudioCharacterAtlasGridFrame[] = [];
  for (let row = 0; row < atlas.rows; row++) {
    const y = Math.round(row * atlas.height / atlas.rows);
    const nextY = Math.round((row + 1) * atlas.height / atlas.rows);
    for (let column = 0; column < atlas.columns; column++) {
      const x = Math.round(column * atlas.width / atlas.columns);
      const nextX = Math.round((column + 1) * atlas.width / atlas.columns);
      frames.push({ index: row * atlas.columns + column, x, y, width: nextX - x, height: nextY - y });
    }
  }
  return frames;
}

export function studioCharacterAtlasSheetMatches(
  sheet: { readonly frameWidth: number; readonly frameHeight: number; readonly atlas?: StudioCharacterAtlasLayout },
  width: number,
  height: number,
): boolean {
  if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0)) return false;
  const { atlas, frameWidth, frameHeight } = sheet;
  if (!atlas) return width === frameWidth * 2 && height === frameHeight * 2;
  if (width !== atlas.width || height !== atlas.height) return false;
  if (atlas.slicing === "explicit-frames") return isValidExplicit(atlas)
    && frameWidth === width / atlas.columns && frameHeight === height / atlas.rows;
  if (atlas.slicing === "rounded-grid") return isValidGrid(atlas)
    && frameWidth === width / atlas.columns && frameHeight === height / atlas.rows;
  const remainder = atlas.remainder;
  return [frameWidth, frameHeight].every((value) => Number.isSafeInteger(value) && value > 0)
    && (remainder.right === 0 || remainder.right === 1) && (remainder.bottom === 0 || remainder.bottom === 1)
    && width === frameWidth * 2 + remainder.right && height === frameHeight * 2 + remainder.bottom
    && (remainder.maxAlpha === 0 || remainder.maxAlpha === 1)
    && (remainder.nonzeroAlphaPixels === 0 || remainder.nonzeroAlphaPixels === 1);
}

export function studioCharacterAtlasFrameCount(atlas?: StudioCharacterAtlasLayout): number {
  if (atlas?.slicing === "explicit-frames") return isValidExplicit(atlas) ? atlas.frames.length : 0;
  return atlas?.slicing === "rounded-grid" ? isValidGrid(atlas) ? atlas.columns * atlas.rows : 0 : 4;
}
