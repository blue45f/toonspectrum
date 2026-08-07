import { z } from "zod";

import { blendModeIRSchema, colorIRSchema, paintIRSchema } from "./color";
import { pathIRSchema } from "./path";

import type { PathIR } from "./path";

/**
 * SceneIR — the renderer-neutral document scene (V11 §2.1).
 *
 * This is the persistence source of truth. `SkPath`, `vello::Scene` and other
 * engine objects are rebuildable caches derived from this structure.
 */

const nodeBaseShape = {
  id: z.string().min(1),
  opacity: z.number().min(0).max(1).default(1),
  blend: blendModeIRSchema.default("src-over"),
};

export const fillPathNodeIRSchema = z.object({
  ...nodeBaseShape,
  kind: z.literal("fill-path"),
  path: pathIRSchema,
  paint: paintIRSchema,
  fillRule: z.enum(["nonzero", "evenodd"]).default("nonzero"),
});
export type FillPathNodeIR = z.infer<typeof fillPathNodeIRSchema>;

export const strokePathNodeIRSchema = z.object({
  ...nodeBaseShape,
  kind: z.literal("stroke-path"),
  path: pathIRSchema,
  paint: paintIRSchema,
  strokeWidth: z.number().positive(),
  cap: z.enum(["butt", "round", "square"]).default("round"),
  join: z.enum(["miter", "round", "bevel"]).default("round"),
  miterLimit: z.number().positive().default(4),
});
export type StrokePathNodeIR = z.infer<typeof strokePathNodeIRSchema>;

/**
 * TextIR is part of the stable IR from day one, but rendering it is a
 * capability: adapters that cannot shape paragraphs must declare the gap so
 * the HybridExecutionPlanner routes text islands to a capable provider
 * (CanvasKit Paragraph baseline; Parley lane arrives via benchmark gate).
 */
export const textNodeIRSchema = z.object({
  ...nodeBaseShape,
  kind: z.literal("text"),
  x: z.number(),
  y: z.number(),
  text: z.string(),
  fontSizePx: z.number().positive(),
  color: colorIRSchema,
  fontFamily: z.string().default("sans-serif"),
});
export type TextNodeIR = z.infer<typeof textNodeIRSchema>;

export type SceneNodeIR =
  | FillPathNodeIR
  | StrokePathNodeIR
  | TextNodeIR
  | {
      id: string;
      kind: "group";
      opacity: number;
      blend: z.infer<typeof blendModeIRSchema>;
      /** Layer-scoped clip mask (panel boundary etc.); null = no clipping. */
      clip: PathIR | null;
      children: SceneNodeIR[];
    };

export const sceneNodeIRSchema: z.ZodType<SceneNodeIR> = z.lazy(() =>
  z.union([
    fillPathNodeIRSchema,
    strokePathNodeIRSchema,
    textNodeIRSchema,
    z.object({
      ...nodeBaseShape,
      kind: z.literal("group"),
      clip: pathIRSchema.nullable().default(null),
      children: z.array(sceneNodeIRSchema),
    }),
  ]),
) as unknown as z.ZodType<SceneNodeIR>;

export const sceneIRSchema = z.object({
  version: z.literal(11),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background: colorIRSchema,
  nodes: z.array(sceneNodeIRSchema),
});
export type SceneIR = z.infer<typeof sceneIRSchema>;

export function createEmptyScene(width: number, height: number): SceneIR {
  return {
    version: 11,
    width,
    height,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: [],
  };
}

export function findNode(scene: SceneIR, id: string): SceneNodeIR | null {
  const visit = (nodes: SceneNodeIR[]): SceneNodeIR | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.kind === "group") {
        const found = visit(node.children);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(scene.nodes);
}

/** Depth-first list of node ids — used by tests and HUD inspectors. */
export function listNodeIds(scene: SceneIR): string[] {
  const ids: string[] = [];
  const visit = (nodes: SceneNodeIR[]): void => {
    for (const node of nodes) {
      ids.push(node.id);
      if (node.kind === "group") visit(node.children);
    }
  };
  visit(scene.nodes);
  return ids;
}
