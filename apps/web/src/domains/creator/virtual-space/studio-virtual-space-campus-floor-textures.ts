/**
 * 캠퍼스 테마 바닥 텍스처(공간 테마 시스템).
 *
 * - 구역 바닥에 반복해서 까는 128px 타일을 Canvas 2D로 그려 Phaser 텍스처로 캐시한다.
 * - 아트 스타일과 무관하게 테마 팔레트로만 그리므로 어떤 스타일 팩 위에서도 테마가 또렷이 드러난다.
 * - 패턴·색이 텍스처 키에 들어가 테마를 바꿔도 캐시가 섞이지 않는다.
 * - 공용 프리미티브(createCanvasTexture·rect·line·roundRect·campusShade·campusHex)는
 *   campus-textures가 소유하고, 이 모듈은 바닥 패턴만 소유한다. (파일 크기 래칫 해소로 분리)
 */
import {
  campusHex,
  campusShade,
  createCanvasTexture,
  line,
  rect,
  roundRect,
  type CampusTextureScene,
} from "./studio-virtual-space-campus-textures";
import type { StudioSpaceThemeFloorSpec } from "./studio-virtual-space-theme";

/* ---------------------------------------------------------------------------------------------- */
/* 테마 바닥 (공간 테마 시스템)                                                                     */
/* ---------------------------------------------------------------------------------------------- */

/** 테마 바닥 타일 한 장의 논리 크기(px). 구역 바닥에 반복해서 깐다. */
export const CAMPUS_THEME_FLOOR_TILE = 128;

/** 좌표 기반 결정적 해시(0~1). 같은 타일은 어디에 깔아도 같은 무늬가 되게 한다. */
function floorHash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43_758.5453;
  return value - Math.floor(value);
}

function drawFloorPlanks(context: CanvasRenderingContext2D, spec: StudioSpaceThemeFloorSpec, vertical: boolean): void {
  rect(context, spec.base, 0, 0, CAMPUS_THEME_FLOOR_TILE, CAMPUS_THEME_FLOOR_TILE);
  const board = 32;
  for (let index = 0; index < CAMPUS_THEME_FLOOR_TILE / board; index += 1) {
    const offset = index * board;
    const tone = (floorHash(index, vertical ? 1 : 0) - 0.5) * 0.09;
    if (vertical) rect(context, campusShade(spec.base, tone), offset, 0, board, CAMPUS_THEME_FLOOR_TILE);
    else rect(context, campusShade(spec.base, tone), 0, offset, CAMPUS_THEME_FLOOR_TILE, board);
    // 판자 이음선과 나뭇결.
    if (vertical) {
      line(context, campusShade(spec.accent, -0.15), offset, 0, offset, CAMPUS_THEME_FLOOR_TILE, 2, 0.8);
      for (let g = 0; g < 3; g += 1) {
        const gx = offset + 8 + floorHash(index, g + 4) * 16;
        line(context, spec.accent, gx, 10 + g * 34, gx + 3, 34 + g * 34, 1, 0.28);
      }
      const joint = floorHash(index, 9) * 80 + 20;
      line(context, campusShade(spec.accent, -0.15), offset, joint, offset + board, joint, 1.5, 0.6);
    } else {
      line(context, campusShade(spec.accent, -0.15), 0, offset, CAMPUS_THEME_FLOOR_TILE, offset, 2, 0.8);
      for (let g = 0; g < 3; g += 1) {
        const gy = offset + 8 + floorHash(index, g + 4) * 16;
        line(context, spec.accent, 10 + g * 34, gy, 34 + g * 34, gy + 3, 1, 0.28);
      }
      const joint = floorHash(index, 9) * 80 + 20;
      line(context, campusShade(spec.accent, -0.15), joint, offset, joint, offset + board, 1.5, 0.6);
    }
  }
}

function drawFloorMarble(context: CanvasRenderingContext2D, spec: StudioSpaceThemeFloorSpec): void {
  rect(context, spec.base, 0, 0, CAMPUS_THEME_FLOOR_TILE, CAMPUS_THEME_FLOOR_TILE);
  const tile = 64;
  for (let ty = 0; ty < 2; ty += 1) {
    for (let tx = 0; tx < 2; tx += 1) {
      const x = tx * tile, y = ty * tile;
      rect(context, campusShade(spec.base, (floorHash(tx + 3, ty + 5) - 0.5) * 0.05), x, y, tile, tile);
      // 대리석 결: 굵은 결 1줄 + 잔가지 2줄.
      context.strokeStyle = campusHex(spec.accent);
      context.globalAlpha = 0.5;
      context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(x + 6, y + 14 + floorHash(tx, ty) * 20);
      context.bezierCurveTo(x + 24, y + 22, x + 34, y + 34, x + 58, y + 44 + floorHash(ty, tx) * 10);
      context.stroke();
      context.globalAlpha = 0.3;
      context.lineWidth = 0.8;
      context.beginPath();
      context.moveTo(x + 20, y + 30);
      context.lineTo(x + 30, y + 40);
      context.moveTo(x + 38, y + 18);
      context.lineTo(x + 46, y + 28);
      context.stroke();
      context.globalAlpha = 1;
    }
  }
  for (let i = 0; i <= 2; i += 1) {
    line(context, campusShade(spec.accent, -0.1), i * tile, 0, i * tile, CAMPUS_THEME_FLOOR_TILE, 1.5, 0.7);
    line(context, campusShade(spec.accent, -0.1), 0, i * tile, CAMPUS_THEME_FLOOR_TILE, i * tile, 1.5, 0.7);
  }
}

function drawFloorSpeckle(context: CanvasRenderingContext2D, spec: StudioSpaceThemeFloorSpec, blades: boolean): void {
  rect(context, spec.base, 0, 0, CAMPUS_THEME_FLOOR_TILE, CAMPUS_THEME_FLOOR_TILE);
  for (let i = 0; i < 260; i += 1) {
    const x = floorHash(i, 1) * CAMPUS_THEME_FLOOR_TILE;
    const y = floorHash(i, 2) * CAMPUS_THEME_FLOOR_TILE;
    const color = i % 3 === 0 ? campusShade(spec.base, 0.16) : i % 3 === 1 ? campusShade(spec.base, -0.13) : spec.accent;
    if (blades) {
      line(context, color, x, y, x + (floorHash(i, 3) - 0.5) * 3, y - 3 - floorHash(i, 4) * 3, 1.1, 0.55);
    } else {
      rect(context, color, x, y, 1.8, 1.8, 0.5);
    }
  }
}

function drawFloorSlate(context: CanvasRenderingContext2D, spec: StudioSpaceThemeFloorSpec): void {
  rect(context, campusShade(spec.base, -0.12), 0, 0, CAMPUS_THEME_FLOOR_TILE, CAMPUS_THEME_FLOOR_TILE);
  const tile = 64;
  for (let ty = 0; ty < 2; ty += 1) {
    for (let tx = 0; tx < 2; tx += 1) {
      const tone = (floorHash(tx + 7, ty + 2) - 0.5) * 0.07;
      rect(context, campusShade(spec.base, tone), tx * tile + 1, ty * tile + 1, tile - 2, tile - 2);
      rect(context, campusShade(spec.base, 0.14), tx * tile + 5, ty * tile + 4, tile - 10, 2, 0.35);
    }
  }
  for (let i = 0; i <= 2; i += 1) {
    line(context, spec.accent, i * tile, 0, i * tile, CAMPUS_THEME_FLOOR_TILE, 1.6, 0.85);
    line(context, spec.accent, 0, i * tile, CAMPUS_THEME_FLOOR_TILE, i * tile, 1.6, 0.85);
  }
}

function drawFloorStone(context: CanvasRenderingContext2D, spec: StudioSpaceThemeFloorSpec): void {
  rect(context, spec.accent, 0, 0, CAMPUS_THEME_FLOOR_TILE, CAMPUS_THEME_FLOOR_TILE);
  const cellW = 44, cellH = 34;
  for (let row = 0; row * cellH < CAMPUS_THEME_FLOOR_TILE + cellH; row += 1) {
    for (let col = -1; col * cellW < CAMPUS_THEME_FLOOR_TILE + cellW; col += 1) {
      const x = col * cellW + (row % 2 === 0 ? 0 : cellW / 2);
      const y = row * cellH;
      const tone = (floorHash(col + 11, row + 13) - 0.5) * 0.1;
      roundRect(context, campusShade(spec.base, tone), x + 2, y + 2, cellW - 4, cellH - 4, 9);
      roundRect(context, campusShade(spec.base, 0.18), x + 6, y + 5, cellW - 14, 6, 3, 0.4);
    }
  }
}

function drawFloorChecker(context: CanvasRenderingContext2D, spec: StudioSpaceThemeFloorSpec): void {
  const tile = 32;
  for (let ty = 0; ty < CAMPUS_THEME_FLOOR_TILE / tile; ty += 1) {
    for (let tx = 0; tx < CAMPUS_THEME_FLOOR_TILE / tile; tx += 1) {
      rect(context, (tx + ty) % 2 === 0 ? spec.base : spec.accent, tx * tile, ty * tile, tile, tile);
      rect(context, campusShade((tx + ty) % 2 === 0 ? spec.base : spec.accent, 0.1), tx * tile + 2, ty * tile + 2, tile - 4, 3, 0.35);
    }
  }
}

/**
 * 테마 바닥 타일(128px 반복). 아트 스타일과 무관하게 테마 팔레트로만 그리므로
 * 어떤 스타일 팩 위에서도 테마가 또렷이 드러난다. 패턴·색이 키에 들어가 테마를 바꿔도 캐시가 섞이지 않는다.
 */
export function campusThemeFloorTexture(scene: CampusTextureScene, spec: StudioSpaceThemeFloorSpec): string {
  const key = `campus-theme-floor-${spec.pattern}-${spec.base.toString(16)}-${spec.accent.toString(16)}`;
  return createCanvasTexture(scene, key, CAMPUS_THEME_FLOOR_TILE, CAMPUS_THEME_FLOOR_TILE, (context) => {
    switch (spec.pattern) {
      case "planks": drawFloorPlanks(context, spec, false); break;
      case "deck": drawFloorPlanks(context, spec, true); break;
      case "marble": drawFloorMarble(context, spec); break;
      case "carpet": drawFloorSpeckle(context, spec, false); break;
      case "sand": drawFloorSpeckle(context, spec, false); break;
      case "lawn": drawFloorSpeckle(context, spec, true); break;
      case "slate": drawFloorSlate(context, spec); break;
      case "stone": drawFloorStone(context, spec); break;
      case "checker": drawFloorChecker(context, spec); break;
    }
  });
}
