import { z } from "zod";

import { blendModeIRSchema, colorIRSchema } from "./color";
import { effectGraphIRSchema } from "./effect";
import { pathIRSchema } from "./path";
import { sceneIRSchema, sceneNodeIRSchema } from "./scene";

import type { BlendModeIR, ColorIR } from "./color";
import type { EffectGraphIR } from "./effect";
import type { PathIR } from "./path";
import type { SceneIR, SceneNodeIR } from "./scene";

/**
 * RenderSceneIR — transient render expression (V13 §8.2).
 *
 * Document persistence stays on SceneIR / the product element model. This
 * structure is rebuilt per compile: flattened transforms, isolation contexts,
 * image/mask/filter nodes, and conservative feature requirements. GPU handles
 * are never stored here.
 */

export const isolationContextIRSchema = z.object({
  opacity: z.number().min(0).max(1).default(1),
  clip: z.boolean().default(false),
  mask: z.boolean().default(false),
  filter: z.boolean().default(false),
  blend: blendModeIRSchema.default("src-over"),
  backdropDependent: z.boolean().default(false),
  colorSpace: z.enum(["srgb", "linear"]).default("srgb"),
  transform: z.boolean().default(false),
});
export type IsolationContextIR = z.infer<typeof isolationContextIRSchema>;

export const imageNodeIRSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("image"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  src: z.string().min(1),
  opacity: z.number().min(0).max(1).default(1),
  blend: blendModeIRSchema.default("src-over"),
  rotationDeg: z.number().default(0),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
});
export type ImageNodeIR = z.infer<typeof imageNodeIRSchema>;

export const rasterTileNodeIRSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("raster-tile"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  assetId: z.string().min(1),
  opacity: z.number().min(0).max(1).default(1),
  blend: blendModeIRSchema.default("src-over"),
});
export type RasterTileNodeIR = z.infer<typeof rasterTileNodeIRSchema>;

export const externalTextureNodeIRSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("external-texture"),
  textureHandle: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  opacity: z.number().min(0).max(1).default(1),
  blend: blendModeIRSchema.default("src-over"),
});
export type ExternalTextureNodeIR = z.infer<typeof externalTextureNodeIRSchema>;

export type RenderNodeIR =
  | SceneNodeIR
  | ImageNodeIR
  | RasterTileNodeIR
  | ExternalTextureNodeIR
  | {
      id: string;
      kind: "mask-group";
      opacity: number;
      blend: BlendModeIR;
      isolated: boolean;
      mask: PathIR | { kind: "alpha-image"; src: string };
      children: RenderNodeIR[];
    }
  | {
      id: string;
      kind: "filter-group";
      opacity: number;
      blend: BlendModeIR;
      graph: EffectGraphIR;
      children: RenderNodeIR[];
    };

export const renderNodeIRSchema: z.ZodType<RenderNodeIR> = z.lazy(() =>
  z.union([
    sceneNodeIRSchema,
    imageNodeIRSchema,
    rasterTileNodeIRSchema,
    externalTextureNodeIRSchema,
    z.object({
      id: z.string().min(1),
      kind: z.literal("mask-group"),
      opacity: z.number().min(0).max(1).default(1),
      blend: blendModeIRSchema.default("src-over"),
      isolated: z.boolean().default(true),
      mask: z.union([
        pathIRSchema,
        z.object({ kind: z.literal("alpha-image"), src: z.string().min(1) }),
      ]),
      children: z.array(renderNodeIRSchema),
    }),
    z.object({
      id: z.string().min(1),
      kind: z.literal("filter-group"),
      opacity: z.number().min(0).max(1).default(1),
      blend: blendModeIRSchema.default("src-over"),
      graph: effectGraphIRSchema,
      children: z.array(renderNodeIRSchema),
    }),
  ]),
) as unknown as z.ZodType<RenderNodeIR>;

export const renderSceneIRSchema = z.object({
  version: z.literal(13),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background: colorIRSchema,
  nodes: z.array(renderNodeIRSchema),
  isolation: isolationContextIRSchema.optional(),
});
export type RenderSceneIR = z.infer<typeof renderSceneIRSchema>;

export function createEmptyRenderScene(width: number, height: number): RenderSceneIR {
  return {
    version: 13,
    width,
    height,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: [],
  };
}

export function sceneIRToRenderScene(scene: SceneIR): RenderSceneIR {
  return {
    version: 13,
    width: scene.width,
    height: scene.height,
    background: scene.background,
    nodes: scene.nodes,
  };
}

export function isSceneNode(node: RenderNodeIR): node is SceneNodeIR {
  return (
    node.kind === "fill-path"
    || node.kind === "stroke-path"
    || node.kind === "text"
    || node.kind === "group"
  );
}

export function renderSceneContainsNonVector(nodes: readonly RenderNodeIR[]): boolean {
  for (const node of nodes) {
    if (
      node.kind === "image"
      || node.kind === "raster-tile"
      || node.kind === "external-texture"
      || node.kind === "mask-group"
      || node.kind === "filter-group"
    ) {
      return true;
    }
    if (node.kind === "group" && renderSceneContainsNonVector(node.children)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract a Vello-admissible SceneIR from a render scene. Non-vector nodes are
 * dropped only when the caller has already partitioned them into another island.
 */
export function renderSceneToSceneIR(
  scene: RenderSceneIR,
  nodes: readonly RenderNodeIR[] = scene.nodes,
): SceneIR {
  const vectorNodes: SceneNodeIR[] = [];
  for (const node of nodes) {
    if (isSceneNode(node)) vectorNodes.push(node);
  }
  return sceneIRSchema.parse({
    version: 11,
    width: scene.width,
    height: scene.height,
    background: scene.background,
    nodes: vectorNodes,
  });
}

export function collectRenderDocumentIds(nodes: readonly RenderNodeIR[]): string[] {
  const ids: string[] = [];
  const visit = (items: readonly RenderNodeIR[]): void => {
    for (const node of items) {
      ids.push(node.id);
      if (node.kind === "group" || node.kind === "mask-group" || node.kind === "filter-group") {
        visit(node.children);
      }
    }
  };
  visit(nodes);
  return ids;
}

export type { ColorIR };
