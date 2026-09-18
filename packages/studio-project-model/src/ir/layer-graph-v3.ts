import { z } from "zod";

import { studioEntityIdSchema } from "../graph/ids";

export const layerKindV3Schema = z.enum([
  "raster",
  "vector",
  "text",
  "balloon",
  "frame",
  "tone",
  "shape",
  "adjustment",
  "filter",
  "mask",
  "linked-object",
  "embedded-object",
  "3d-live",
  "reference",
  "audio",
  "animation-cel",
  "group",
]);
export type LayerKindV3 = z.infer<typeof layerKindV3Schema>;

export const layerBlendModeV3Schema = z.enum([
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
  "pass-through",
]);
export type LayerBlendModeV3 = z.infer<typeof layerBlendModeV3Schema>;

export const transformMatrixV3Schema = z.tuple([
  z.number().finite(), z.number().finite(), z.number().finite(),
  z.number().finite(), z.number().finite(), z.number().finite(),
  z.number().finite(), z.number().finite(), z.number().finite(),
]);
export type TransformMatrixV3 = z.infer<typeof transformMatrixV3Schema>;

export interface LayerNodeV3 {
  readonly id: string;
  readonly kind: LayerKindV3;
  readonly name: string;
  readonly parentId?: string;
  readonly childIds: readonly string[];
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
  readonly blendMode: LayerBlendModeV3;
  readonly transform: TransformMatrixV3;
  readonly contentRef?: string;
  readonly maskLayerIds: readonly string[];
  readonly effectNodeIds: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export const layerNodeV3Schema = z
  .object({
    id: studioEntityIdSchema,
    kind: layerKindV3Schema,
    name: z.string().trim().min(1).max(240),
    parentId: studioEntityIdSchema.optional(),
    childIds: z.array(studioEntityIdSchema).max(100_000),
    visible: z.boolean(),
    locked: z.boolean(),
    opacity: z.number().finite().min(0).max(1),
    blendMode: layerBlendModeV3Schema,
    transform: transformMatrixV3Schema,
    contentRef: z.string().trim().min(1).max(1_024).optional(),
    maskLayerIds: z.array(studioEntityIdSchema).max(64),
    effectNodeIds: z.array(studioEntityIdSchema).max(1_024),
    metadata: z.record(
      z.string().min(1).max(160),
      z.union([z.string().max(2_048), z.number().finite(), z.boolean(), z.null()]),
    ),
  })
  .strict();

export interface LayerGraphV3 {
  readonly schemaVersion: 3;
  readonly rootLayerIds: readonly string[];
  readonly layers: Readonly<Record<string, LayerNodeV3>>;
}

export const layerGraphV3ShapeSchema = z
  .object({
    schemaVersion: z.literal(3),
    rootLayerIds: z.array(studioEntityIdSchema).max(100_000),
    layers: z.record(studioEntityIdSchema, layerNodeV3Schema),
  })
  .strict();

export class LayerGraphInvariantError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`invalid LayerGraphV3: ${issues.join("; ")}`);
    this.name = "LayerGraphInvariantError";
  }
}

export function identityTransformV3(): TransformMatrixV3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function validateLayerGraphV3(graph: LayerGraphV3): string[] {
  const issues: string[] = [];
  if (new Set(graph.rootLayerIds).size !== graph.rootLayerIds.length) {
    issues.push("root layer ids must be unique");
  }
  for (const rootId of graph.rootLayerIds) {
    const root = graph.layers[rootId];
    if (root === undefined) issues.push(`root layer ${rootId} is missing`);
    else if (root.parentId !== undefined) issues.push(`root layer ${rootId} cannot have a parent`);
  }
  for (const [key, layer] of Object.entries(graph.layers)) {
    if (key !== layer.id) issues.push(`layer map key ${key} differs from id ${layer.id}`);
    if (new Set(layer.childIds).size !== layer.childIds.length) issues.push(`layer ${layer.id} has duplicate children`);
    if (new Set(layer.maskLayerIds).size !== layer.maskLayerIds.length) issues.push(`layer ${layer.id} has duplicate masks`);
    if (new Set(layer.effectNodeIds).size !== layer.effectNodeIds.length) issues.push(`layer ${layer.id} has duplicate effect nodes`);
    if (layer.kind !== "group" && layer.childIds.length > 0) issues.push(`non-group layer ${layer.id} cannot own children`);
    if (layer.parentId !== undefined) {
      const parent = graph.layers[layer.parentId];
      if (parent === undefined) issues.push(`layer ${layer.id} parent ${layer.parentId} is missing`);
      else if (!parent.childIds.includes(layer.id)) issues.push(`layer ${layer.id} is not listed by parent ${parent.id}`);
    } else if (!graph.rootLayerIds.includes(layer.id)) {
      issues.push(`parentless layer ${layer.id} must be a root`);
    }
    for (const childId of layer.childIds) {
      const child = graph.layers[childId];
      if (child === undefined) issues.push(`layer ${layer.id} child ${childId} is missing`);
      else if (child.parentId !== layer.id) issues.push(`child ${childId} does not point back to ${layer.id}`);
    }
    for (const maskId of layer.maskLayerIds) {
      const mask = graph.layers[maskId];
      if (mask === undefined) issues.push(`layer ${layer.id} mask ${maskId} is missing`);
      else if (mask.kind !== "mask") issues.push(`layer ${layer.id} mask ${maskId} is not a mask layer`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (layerId: string): void => {
    if (visiting.has(layerId)) {
      issues.push(`layer graph contains a cycle at ${layerId}`);
      return;
    }
    if (visited.has(layerId)) return;
    visiting.add(layerId);
    for (const childId of graph.layers[layerId]?.childIds ?? []) visit(childId);
    visiting.delete(layerId);
    visited.add(layerId);
  };
  for (const rootId of graph.rootLayerIds) visit(rootId);
  for (const layerId of Object.keys(graph.layers)) {
    if (!visited.has(layerId)) issues.push(`layer ${layerId} is unreachable from roots`);
  }
  return [...new Set(issues)];
}

export function parseLayerGraphV3(value: unknown): LayerGraphV3 {
  const graph = layerGraphV3ShapeSchema.parse(value) as LayerGraphV3;
  const issues = validateLayerGraphV3(graph);
  if (issues.length > 0) throw new LayerGraphInvariantError(issues);
  return graph;
}

export function createEmptyLayerGraphV3(): LayerGraphV3 {
  return { schemaVersion: 3, rootLayerIds: [], layers: {} };
}
