import type { StudioCharacterAtlasClip, StudioCharacterFramePresentation } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";

const CELL = 627;
const ROOT = "/assets/virtual-studio/world-v2/characters/pixel-maker";

// 원본 alpha≥32 경계와 직접 검수한 몸 중심/신발 바닥이다. 낮은 알파 잡점은 기준에 포함하지 않는다.
export const PIXEL_MAKER_NATIVE_FRAME_MEASUREMENTS = Object.freeze({
  down: [[329, 563, 78], [329, 551, 78], [329, 560, 78], [329, 549, 78]],
  up: [[324, 568, 76], [324, 560, 76], [324, 563, 78], [324, 560, 78]],
  left: [[331, 589, 77], [321, 589, 80], [331, 568, 72], [317, 565, 68]],
  right: [[335, 581, 81], [308, 586, 81], [335, 564, 68], [308, 564, 68]],
} as const);

function presentation([groundX, groundY, headY]: readonly [number, number, number]): StudioCharacterFramePresentation {
  return Object.freeze({
    originX: groundX / CELL,
    originY: groundY / CELL,
    // 셀의 투명 여백 대신 실제 머리~발 높이를 맞추며 종횡비는 바꾸지 않는다.
    displayHeightRatio: 0.82 * CELL / (groundY - headY),
  });
}

export function pixelMakerNativeWalkClip(facing: StudioVirtualSpaceFacing): StudioCharacterAtlasClip {
  return Object.freeze({
    textureUrl: `${ROOT}/walk-${facing}.png`,
    frameWidth: CELL,
    frameHeight: CELL,
    atlas: Object.freeze({ width: 1254, height: 1254,
      remainder: Object.freeze({ right: 0, bottom: 0, maxAlpha: 0, nonzeroAlphaPixels: 0 }) }),
    start: 0,
    end: 3,
    frameRate: 8,
    repeat: -1,
    distancePerCycle: 70,
    technique: "drawn",
    frames: Object.freeze(PIXEL_MAKER_NATIVE_FRAME_MEASUREMENTS[facing].map(presentation)),
  });
}
