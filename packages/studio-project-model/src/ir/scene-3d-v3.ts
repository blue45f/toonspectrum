import { z } from "zod";

import { sha256Schema, studioEntityIdSchema } from "../graph/ids";

import type { RevisionId, Sha256 } from "../graph/ids";

export const vec3V3Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export type Vec3V3 = z.infer<typeof vec3V3Schema>;

export const quaternionV3Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export type QuaternionV3 = z.infer<typeof quaternionV3Schema>;

export interface Transform3DV3 {
  readonly translation: Vec3V3;
  readonly rotation: QuaternionV3;
  readonly scale: Vec3V3;
}

export const transform3DV3Schema = z
  .object({
    translation: vec3V3Schema,
    rotation: quaternionV3Schema,
    scale: vec3V3Schema,
  })
  .strict()
  .superRefine((transform, context) => {
    if (transform.scale.some((value) => value === 0)) {
      context.addIssue({ code: "custom", path: ["scale"], message: "3D scale components must be non-zero" });
    }
    const length = Math.hypot(...transform.rotation);
    if (Math.abs(length - 1) > 0.0001) {
      context.addIssue({ code: "custom", path: ["rotation"], message: "3D rotation quaternion must be normalized" });
    }
  });

export const sceneNodeKindV3Schema = z.enum([
  "group",
  "mesh",
  "component-instance",
  "character",
  "camera",
  "light",
  "section-plane",
  "guide",
]);
export type SceneNodeKindV3 = z.infer<typeof sceneNodeKindV3Schema>;

export interface SceneNode3DV3 {
  readonly id: string;
  readonly kind: SceneNodeKindV3;
  readonly name: string;
  readonly parentId?: string;
  readonly childIds: readonly string[];
  readonly transform: Transform3DV3;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly assetId?: string;
  readonly materialVariantId?: string;
  readonly contentHash?: Sha256;
}

export const sceneNode3DV3Schema = z
  .object({
    id: studioEntityIdSchema,
    kind: sceneNodeKindV3Schema,
    name: z.string().trim().min(1).max(240),
    parentId: studioEntityIdSchema.optional(),
    childIds: z.array(studioEntityIdSchema).max(100_000),
    transform: transform3DV3Schema,
    visible: z.boolean(),
    locked: z.boolean(),
    assetId: studioEntityIdSchema.optional(),
    materialVariantId: studioEntityIdSchema.optional(),
    contentHash: sha256Schema.optional(),
  })
  .strict();

export interface Camera3DV3 {
  readonly id: string;
  readonly nodeId: string;
  readonly projection: "perspective" | "orthographic" | "two-point";
  readonly focalLengthMm?: number;
  readonly orthographicSize?: number;
  readonly near: number;
  readonly far: number;
  readonly target?: Vec3V3;
  readonly depthOfField?: {
    readonly focusDistance: number;
    readonly aperture: number;
  };
}

export const camera3DV3Schema = z
  .object({
    id: studioEntityIdSchema,
    nodeId: studioEntityIdSchema,
    projection: z.enum(["perspective", "orthographic", "two-point"]),
    focalLengthMm: z.number().finite().positive().max(1_000).optional(),
    orthographicSize: z.number().finite().positive().optional(),
    near: z.number().finite().positive(),
    far: z.number().finite().positive(),
    target: vec3V3Schema.optional(),
    depthOfField: z
      .object({
        focusDistance: z.number().finite().positive(),
        aperture: z.number().finite().positive().max(64),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((camera, context) => {
    if (camera.far <= camera.near) {
      context.addIssue({ code: "custom", path: ["far"], message: "camera far plane must exceed near plane" });
    }
    if (camera.projection === "orthographic" && camera.orthographicSize === undefined) {
      context.addIssue({ code: "custom", path: ["orthographicSize"], message: "orthographic camera requires size" });
    }
    if (camera.projection !== "orthographic" && camera.focalLengthMm === undefined) {
      context.addIssue({ code: "custom", path: ["focalLengthMm"], message: "perspective camera requires focal length" });
    }
  });

export interface SceneVariant3DV3 {
  readonly id: string;
  readonly name: string;
  readonly visibleNodeIds: readonly string[];
  readonly hiddenNodeIds: readonly string[];
  readonly materialOverrides: Readonly<Record<string, string>>;
  readonly lightPresetId?: string;
}

export const sceneVariant3DV3Schema = z
  .object({
    id: studioEntityIdSchema,
    name: z.string().trim().min(1).max(240),
    visibleNodeIds: z.array(studioEntityIdSchema).max(100_000),
    hiddenNodeIds: z.array(studioEntityIdSchema).max(100_000),
    materialOverrides: z.record(studioEntityIdSchema, studioEntityIdSchema),
    lightPresetId: studioEntityIdSchema.optional(),
  })
  .strict()
  .superRefine((variant, context) => {
    const overlap = variant.visibleNodeIds.filter((id) => variant.hiddenNodeIds.includes(id));
    if (overlap.length > 0) {
      context.addIssue({ code: "custom", path: ["hiddenNodeIds"], message: "node cannot be both visible and hidden" });
    }
  });

export const webtoonRenderPassV3Schema = z.enum([
  "color",
  "line",
  "tone",
  "shadow",
  "ambient-occlusion",
  "depth",
  "normal",
  "object-id",
  "material-id",
  "character-mask",
  "background-mask",
  "transparent-color",
]);
export type WebtoonRenderPassV3 = z.infer<typeof webtoonRenderPassV3Schema>;

export interface SceneDocument3DV3 {
  readonly schemaVersion: 3;
  readonly rootNodeIds: readonly string[];
  readonly nodes: Readonly<Record<string, SceneNode3DV3>>;
  readonly cameras: Readonly<Record<string, Camera3DV3>>;
  readonly variants: Readonly<Record<string, SceneVariant3DV3>>;
  readonly activeCameraId?: string;
  readonly activeVariantId?: string;
}

export const sceneDocument3DV3ShapeSchema = z
  .object({
    schemaVersion: z.literal(3),
    rootNodeIds: z.array(studioEntityIdSchema).max(100_000),
    nodes: z.record(studioEntityIdSchema, sceneNode3DV3Schema),
    cameras: z.record(studioEntityIdSchema, camera3DV3Schema),
    variants: z.record(studioEntityIdSchema, sceneVariant3DV3Schema),
    activeCameraId: studioEntityIdSchema.optional(),
    activeVariantId: studioEntityIdSchema.optional(),
  })
  .strict();

export class Scene3DInvariantError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`invalid SceneDocument3DV3: ${issues.join("; ")}`);
    this.name = "Scene3DInvariantError";
  }
}

export function validateSceneDocument3DV3(scene: SceneDocument3DV3): string[] {
  const issues: string[] = [];
  if (new Set(scene.rootNodeIds).size !== scene.rootNodeIds.length) issues.push("root 3D node ids must be unique");
  for (const rootId of scene.rootNodeIds) {
    const root = scene.nodes[rootId];
    if (root === undefined) issues.push(`root 3D node ${rootId} is missing`);
    else if (root.parentId !== undefined) issues.push(`root 3D node ${rootId} cannot have a parent`);
  }
  for (const [key, node] of Object.entries(scene.nodes)) {
    if (key !== node.id) issues.push(`3D node map key ${key} differs from id ${node.id}`);
    if (new Set(node.childIds).size !== node.childIds.length) issues.push(`3D node ${node.id} has duplicate children`);
    if (node.parentId !== undefined) {
      const parent = scene.nodes[node.parentId];
      if (parent === undefined) issues.push(`3D node ${node.id} parent is missing`);
      else if (!parent.childIds.includes(node.id)) issues.push(`3D node ${node.id} is not listed by its parent`);
    } else if (!scene.rootNodeIds.includes(node.id)) {
      issues.push(`parentless 3D node ${node.id} must be a root`);
    }
    for (const childId of node.childIds) {
      const child = scene.nodes[childId];
      if (child === undefined) issues.push(`3D node ${node.id} child ${childId} is missing`);
      else if (child.parentId !== node.id) issues.push(`3D child ${childId} does not point back to ${node.id}`);
    }
  }
  for (const [key, camera] of Object.entries(scene.cameras)) {
    if (key !== camera.id) issues.push(`camera map key ${key} differs from id ${camera.id}`);
    if (scene.nodes[camera.nodeId]?.kind !== "camera") issues.push(`camera ${camera.id} node is missing or not a camera node`);
  }
  if (scene.activeCameraId !== undefined && scene.cameras[scene.activeCameraId] === undefined) {
    issues.push(`active camera ${scene.activeCameraId} is missing`);
  }
  if (scene.activeVariantId !== undefined && scene.variants[scene.activeVariantId] === undefined) {
    issues.push(`active variant ${scene.activeVariantId} is missing`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      issues.push(`3D scene graph contains a cycle at ${nodeId}`);
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const childId of scene.nodes[nodeId]?.childIds ?? []) visit(childId);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const rootId of scene.rootNodeIds) visit(rootId);
  for (const nodeId of Object.keys(scene.nodes)) if (!visited.has(nodeId)) issues.push(`3D node ${nodeId} is unreachable`);
  return [...new Set(issues)];
}

export function parseSceneDocument3DV3(value: unknown): SceneDocument3DV3 {
  const scene = sceneDocument3DV3ShapeSchema.parse(value) as SceneDocument3DV3;
  const issues = validateSceneDocument3DV3(scene);
  if (issues.length > 0) throw new Scene3DInvariantError(issues);
  return scene;
}

export interface ThreeDLiveLayerLinkV3 {
  readonly sceneArtifactId: string;
  readonly sceneRevisionId: RevisionId;
  readonly cameraId: string;
  readonly variantId?: string;
  readonly renderProfileId: string;
  readonly outputPasses: readonly WebtoonRenderPassV3[];
  readonly pinMode: "follow-working" | "pinned-revision";
}

export const threeDLiveLayerLinkV3Schema = z
  .object({
    sceneArtifactId: studioEntityIdSchema,
    sceneRevisionId: studioEntityIdSchema,
    cameraId: studioEntityIdSchema,
    variantId: studioEntityIdSchema.optional(),
    renderProfileId: studioEntityIdSchema,
    outputPasses: z.array(webtoonRenderPassV3Schema).min(1).max(32),
    pinMode: z.enum(["follow-working", "pinned-revision"]),
  })
  .strict()
  .superRefine((link, context) => {
    if (new Set(link.outputPasses).size !== link.outputPasses.length) {
      context.addIssue({ code: "custom", path: ["outputPasses"], message: "3D output passes must be unique" });
    }
    if (link.pinMode === "pinned-revision" && link.sceneRevisionId.length === 0) {
      context.addIssue({ code: "custom", path: ["sceneRevisionId"], message: "pinned live layer requires scene revision" });
    }
  });
