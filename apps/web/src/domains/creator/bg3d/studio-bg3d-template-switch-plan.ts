import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import { collectStudioBg3dTemplateInstances } from "./studio-bg3d-template-instance";

export interface StudioBg3dCatalogTemplateSwitchPlan {
  readonly insertionOffset: number;
  readonly removedNodeIds: ReadonlySet<string>;
  readonly occupiedNodeIds: ReadonlySet<string>;
  readonly retainedPrimitives: readonly BgPrimitive[];
  readonly retainedCustomModels: readonly BgCustomModelInstance[];
}

/**
 * Replaces the legacy "append another catalog template" behavior with a single active catalog
 * template slot while preserving ordinary user-authored scene content.
 *
 * Catalog templates are currently procedural-only. Fail closed if a future catalog template owns a
 * model attachment, or if an ordinary retained entity is parented under a template node; those need
 * an explicit attachment/reparent transaction rather than silent data loss.
 */
export function planStudioBg3dCatalogTemplateSwitch(input: {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
}): StudioBg3dCatalogTemplateSwitchPlan | null {
  const instances = collectStudioBg3dTemplateInstances(input.primitives, input.customModels)
    .filter((instance) => instance.sourceKind === "catalog");
  const removedNodeIds = new Set(instances.flatMap((instance) =>
    instance.nodes.map((node) => node.id),
  ));

  if (input.customModels.some((model) => removedNodeIds.has(model.id))) return null;

  const retainedPrimitives = input.primitives.filter((primitive) => !removedNodeIds.has(primitive.id));
  const retainedCustomModels = input.customModels.filter((model) => !removedNodeIds.has(model.id));
  const retainedEntities = [...retainedPrimitives, ...retainedCustomModels];
  if (retainedEntities.some((entity) => entity.parentId && removedNodeIds.has(entity.parentId))) {
    return null;
  }

  const occupiedNodeIds = new Set(retainedEntities.map((entity) => entity.id));
  const insertionOffset = instances.length > 0
    ? Math.min(...instances.map((instance) => instance.insertionOffset))
    : 0;

  return Object.freeze({
    insertionOffset,
    removedNodeIds,
    occupiedNodeIds,
    retainedPrimitives: Object.freeze(retainedPrimitives),
    retainedCustomModels: Object.freeze(retainedCustomModels),
  });
}
