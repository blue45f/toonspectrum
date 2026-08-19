import type { V13RenderFeature } from "./feature-contract";
import type { RenderNodeIR, RenderSceneIR } from "@toonspectrum/studio-project-model";


/**
 * Workload fingerprint used by Classic vs Hybrid vs Skia routing (V13 §7.2).
 */
export interface RenderWorkloadFingerprint {
  pathCount: number;
  segmentCount: number;
  changedPathRatio: number;
  imageCount: number;
  externalTextureCount: number;
  glyphCount: number;
  textNodeCount: number;
  gradientCount: number;
  isolatedLayerCount: number;
  maskDepth: number;
  filterNodeCount: number;
  backdropBlendCount: number;
  visibleAreaRatio: number;
  expectedOverdraw: number;
  dpr: number;
}

export type V13ProviderHint =
  | "vello-classic"
  | "vello-hybrid"
  | "skia-gpu"
  | "skia-cpu-reference";

export function emptyWorkloadFingerprint(
  overrides: Partial<RenderWorkloadFingerprint> = {},
): RenderWorkloadFingerprint {
  return {
    pathCount: 0,
    segmentCount: 0,
    changedPathRatio: 0,
    imageCount: 0,
    externalTextureCount: 0,
    glyphCount: 0,
    textNodeCount: 0,
    gradientCount: 0,
    isolatedLayerCount: 0,
    maskDepth: 0,
    filterNodeCount: 0,
    backdropBlendCount: 0,
    visibleAreaRatio: 1,
    expectedOverdraw: 1,
    dpr: 1,
    ...overrides,
  };
}

function countPathSegments(node: Extract<RenderNodeIR, { path: { verbs: readonly unknown[] } }>): number {
  return node.path.verbs.length;
}

export function fingerprintRenderScene(
  scene: RenderSceneIR,
  options: { readonly dpr?: number; readonly changedPathRatio?: number } = {},
): RenderWorkloadFingerprint {
  const fingerprint = emptyWorkloadFingerprint({
    dpr: options.dpr ?? 1,
    changedPathRatio: options.changedPathRatio ?? 0,
  });

  const visit = (nodes: readonly RenderNodeIR[], maskDepth: number): void => {
    for (const node of nodes) {
      if (node.kind === "fill-path" || node.kind === "stroke-path") {
        fingerprint.pathCount += 1;
        fingerprint.segmentCount += countPathSegments(node);
        if (node.paint.kind !== "solid") fingerprint.gradientCount += 1;
      } else if (node.kind === "text") {
        fingerprint.textNodeCount += 1;
        fingerprint.glyphCount += Array.from(node.text).length;
      } else if (node.kind === "image" || node.kind === "raster-tile") {
        fingerprint.imageCount += 1;
      } else if (node.kind === "external-texture") {
        fingerprint.externalTextureCount += 1;
      } else if (node.kind === "group") {
        if (node.opacity < 1 || node.blend !== "src-over" || node.clip !== null) {
          fingerprint.isolatedLayerCount += 1;
        }
        visit(node.children, maskDepth);
      } else if (node.kind === "mask-group") {
        fingerprint.maskDepth = Math.max(fingerprint.maskDepth, maskDepth + 1);
        if (!node.isolated) fingerprint.backdropBlendCount += 1;
        visit(node.children, maskDepth + 1);
      } else if (node.kind === "filter-group") {
        fingerprint.filterNodeCount += node.graph.nodes.length;
        fingerprint.isolatedLayerCount += 1;
        visit(node.children, maskDepth);
      }
    }
  };
  visit(scene.nodes, 0);
  return fingerprint;
}

export function collectRenderFeatures(nodes: readonly RenderNodeIR[]): V13RenderFeature[] {
  const features = new Set<V13RenderFeature>();
  const visit = (items: readonly RenderNodeIR[]): void => {
    for (const node of items) {
      switch (node.kind) {
        case "fill-path":
          features.add("render.vector.fill");
          if (node.paint.kind !== "solid") features.add("render.vector.gradient");
          if (node.paint.kind === "sweep-gradient") features.add("render.vector.gradient.sweep");
          break;
        case "stroke-path":
          features.add("render.vector.stroke");
          if (node.paint.kind !== "solid") features.add("render.vector.gradient");
          if (node.paint.kind === "sweep-gradient") features.add("render.vector.gradient.sweep");
          break;
        case "text":
          features.add(
            node.text.includes("\n") || node.text.length > 48
              ? "render.text.paragraph"
              : "render.text.simple",
          );
          break;
        case "image":
        case "raster-tile":
          features.add("render.image");
          break;
        case "external-texture":
          features.add("render.external-texture");
          break;
        case "group":
          features.add("render.group.opacity");
          if (node.clip !== null) features.add("render.group.clip");
          visit(node.children);
          break;
        case "mask-group":
          features.add("render.mask");
          if (!node.isolated) features.add("render.blend.backdrop");
          visit(node.children);
          break;
        case "filter-group":
          features.add(
            node.graph.nodes.length > 1 ? "render.filter.image" : "render.filter.simple",
          );
          visit(node.children);
          break;
      }
    }
  };
  visit(nodes);
  return [...features];
}

export function isPathHeavyWorkload(fingerprint: RenderWorkloadFingerprint): boolean {
  if (fingerprint.imageCount > 0 || fingerprint.externalTextureCount > 0) return false;
  if (fingerprint.filterNodeCount > 0 || fingerprint.maskDepth > 0) return false;
  if (fingerprint.textNodeCount > 0 && fingerprint.pathCount < fingerprint.textNodeCount * 4) {
    return false;
  }
  return fingerprint.pathCount >= 8 || fingerprint.segmentCount >= 64;
}

export function isMixedGeneralWorkload(fingerprint: RenderWorkloadFingerprint): boolean {
  const mixedSignals =
    fingerprint.imageCount
    + fingerprint.externalTextureCount
    + fingerprint.gradientCount
    + fingerprint.textNodeCount;
  return mixedSignals > 0 && fingerprint.filterNodeCount === 0 && fingerprint.maskDepth === 0;
}

export function chooseProviderHint(
  features: readonly string[],
  fingerprint: RenderWorkloadFingerprint,
  mode: "interactive" | "final-export",
): V13ProviderHint {
  const needsSkia = features.some((feature) =>
    feature === "render.text.paragraph"
    || feature === "render.mask"
    || feature === "render.filter.image"
    || feature === "render.blend.backdrop"
    || feature === "render.path-effect",
  );
  if (needsSkia) {
    return mode === "interactive" ? "skia-gpu" : "skia-cpu-reference";
  }
  if (isPathHeavyWorkload(fingerprint)) return "vello-classic";
  if (isMixedGeneralWorkload(fingerprint) || features.includes("render.image")) {
    return "vello-hybrid";
  }
  if (fingerprint.pathCount > 0 || features.includes("render.vector.fill")
    || features.includes("render.vector.stroke")) {
    return "vello-classic";
  }
  return mode === "interactive" ? "vello-hybrid" : "skia-cpu-reference";
}
