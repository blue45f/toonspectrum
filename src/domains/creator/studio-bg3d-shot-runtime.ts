/**
 * Projects an already-canonical scene document's node visibility back to the editor's legacy
 * runtime arrays. Shot application is rejected when the two representations no longer describe
 * exactly the same node set; silently dropping or inventing an entity would make a storyboard cut
 * destructive.
 */

import type { BgCustomModelInstance } from "./studio-background-3d-model";
import type { BgPrimitive } from "./studio-background-3d-primitives";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

export interface StudioBg3dShotRuntimeProjection {
  readonly primitives: BgPrimitive[];
  readonly customModels: BgCustomModelInstance[];
}

export function projectStudioBg3dShotVisibilityToRuntime(
  primitives: readonly BgPrimitive[],
  customModels: readonly BgCustomModelInstance[],
  document: StudioBg3dSceneDocument,
): StudioBg3dShotRuntimeProjection | null {
  if (document.nodes.length !== primitives.length + customModels.length) return null;

  const nodeById = new Map(document.nodes.map((node) => [node.id, node] as const));
  if (nodeById.size !== document.nodes.length) return null;

  const nextPrimitives: BgPrimitive[] = [];
  for (const primitive of primitives) {
    const node = nodeById.get(primitive.id);
    if (!node || node.kind !== "primitive" || node.primitiveKind !== primitive.kind) return null;
    nextPrimitives.push({ ...primitive, visible: node.visible });
    nodeById.delete(primitive.id);
  }

  const nextCustomModels: BgCustomModelInstance[] = [];
  for (const model of customModels) {
    const node = nodeById.get(model.id);
    if (!node || node.kind !== "model") return null;
    nextCustomModels.push({ ...model, visible: node.visible });
    nodeById.delete(model.id);
  }

  return nodeById.size === 0
    ? { primitives: nextPrimitives, customModels: nextCustomModels }
    : null;
}
