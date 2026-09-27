import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioCharacterAtlasLayout } from "./studio-virtual-space-character-atlas";
import atlasSources from "./studio-virtual-space-experience-atlases.json";

export type StudioExperienceAtlasKind = "landmarks" | "furniture";

/** 2026-09-27 원본 알파와 16종 의미 순서를 검수했다. PNG는 수정하지 않고 셀을 넘는 작화까지 보존한다. */
export function studioExperienceAtlas(kind: StudioExperienceAtlasKind, style: StudioVirtualArtStyleKey): StudioCharacterAtlasLayout {
  return { ...atlasSources[kind][style], slicing: "explicit-frames", columns: 4, rows: 4 };
}

/** 기존 격자의 화면 배율·고정점을 보존한다. 잘린 부분 복원 때문에 가구나 충돌체의 위치가 이동하지 않는다. */
export function studioExperienceFrameGeometry(kind: StudioExperienceAtlasKind, style: StudioVirtualArtStyleKey, index: number,
  width: number, height: number, originX = .5, originY = 1) {
  const atlas = atlasSources[kind][style], frame = atlas.frames[index];
  if (!frame || !Number.isInteger(index) || index < 0) return { width, height, originX, originY };
  const column = index % 4, row = Math.floor(index / 4);
  const cellX = Math.round(column * atlas.width / 4), cellY = Math.round(row * atlas.height / 4);
  const cellWidth = Math.round((column + 1) * atlas.width / 4) - cellX;
  const cellHeight = Math.round((row + 1) * atlas.height / 4) - cellY;
  return { width: width * frame.width / cellWidth, height: height * frame.height / cellHeight,
    originX: (cellX + cellWidth * originX - frame.x) / frame.width,
    originY: (cellY + cellHeight * originY - frame.y) / frame.height };
}

/** 모든 테마의 시트 순서는 같고 공중섬의 기존 파일명은 유지한다. */
export function studioExperienceAssetUrl(kind: "landmarks" | "furniture" | "terrain", style: StudioVirtualArtStyleKey): string {
  const suffix = kind !== "landmarks" && style === "sky-island" ? "" : `-${style}`;
  return `/assets/virtual-studio/experience-v8/${kind}${suffix}.png`;
}
