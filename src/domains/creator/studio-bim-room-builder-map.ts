/**
 * CAD-019 BIM → Room Builder mapping — wall/slab/door/window/space → room parts.
 */

import { importStudioIfcShell } from "./studio-mesh-format-adapters";

export const STUDIO_BIM_ROOM_MAP_REVISION = 1 as const;

export type StudioBimRoomPart = {
  readonly id: string;
  readonly kind: "wall" | "slab" | "door" | "window" | "space" | "column" | "beam";
  readonly name: string;
};

export function mapStudioBimIfcToRoomBuilder(ifcText: string): {
  readonly revision: typeof STUDIO_BIM_ROOM_MAP_REVISION;
  readonly parts: readonly StudioBimRoomPart[];
  readonly spaces: number;
  readonly walls: number;
  readonly slabs: number;
  readonly doors: number;
  readonly windows: number;
  readonly meshCount: number;
  readonly pointCount: number;
} {
  const imported = importStudioIfcShell(ifcText);
  const extras = imported.extras ?? {};
  const parts: StudioBimRoomPart[] = [];
  const spaces = Number(extras.spaceCount ?? (extras.spaces as string[] | undefined)?.length ?? 0);
  const walls = Number(extras.wallCount ?? 0);
  const slabs = Number(extras.slabCount ?? 0);
  const doors = Number(extras.doorCount ?? 0);
  const windows = Number(extras.windowCount ?? 0);
  const spaceNames = (extras.spaces as string[] | undefined) ?? [];
  spaceNames.forEach((name, i) => {
    parts.push({ id: `space-${i}`, kind: "space", name });
  });
  for (let i = 0; i < walls; i += 1) parts.push({ id: `wall-${i}`, kind: "wall", name: `Wall${i + 1}` });
  for (let i = 0; i < slabs; i += 1) parts.push({ id: `slab-${i}`, kind: "slab", name: `Slab${i + 1}` });
  for (let i = 0; i < doors; i += 1) parts.push({ id: `door-${i}`, kind: "door", name: `Door${i + 1}` });
  for (let i = 0; i < windows; i += 1) parts.push({ id: `window-${i}`, kind: "window", name: `Window${i + 1}` });
  const columns = Number(extras.columnCount ?? 0);
  const beams = Number(extras.beamCount ?? 0);
  for (let i = 0; i < columns; i += 1) parts.push({ id: `col-${i}`, kind: "column", name: `Column${i + 1}` });
  for (let i = 0; i < beams; i += 1) parts.push({ id: `beam-${i}`, kind: "beam", name: `Beam${i + 1}` });
  return {
    revision: STUDIO_BIM_ROOM_MAP_REVISION,
    parts,
    spaces: spaces || spaceNames.length,
    walls,
    slabs,
    doors,
    windows,
    meshCount: imported.meshes.length,
    pointCount: Number(extras.pointCount ?? 0),
  };
}
