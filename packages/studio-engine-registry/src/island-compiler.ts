import {
  collectRenderDocumentIds,
  createEmptyRenderScene,
  type IsolationContextIR,
  type RenderNodeIR,
  type RenderSceneIR,
} from "@toonspectrum/studio-project-model";

import {
  skiaMustCompleteFeature,
  velloCanOwnFeature,
} from "./feature-contract";
import {
  chooseProviderHint,
  collectRenderFeatures,
  fingerprintRenderScene,
  type RenderWorkloadFingerprint,
  type V13ProviderHint,
} from "./workload-fingerprint";

import type { CopyCost, PlanMode } from "./planner";

/**
 * RenderIslandCompiler (V13 §5.2–5.3).
 *
 * Objects are never routed one-by-one. Consecutive nodes that share a provider
 * hint and isolation context are merged into the largest legal island.
 */

export interface CompiledRenderIsland {
  readonly id: string;
  readonly providerHint: V13ProviderHint;
  readonly features: readonly string[];
  readonly fingerprint: RenderWorkloadFingerprint;
  readonly nodes: readonly RenderNodeIR[];
  readonly documentIds: readonly string[];
  readonly isolation: IsolationContextIR;
  readonly transport: CopyCost;
}

export interface CompiledIslandPlan {
  readonly scene: RenderSceneIR;
  readonly mode: PlanMode;
  readonly islands: readonly CompiledRenderIsland[];
  readonly rejectedInteractiveCpuReadback: boolean;
}

const DEFAULT_ISOLATION: IsolationContextIR = {
  opacity: 1,
  clip: false,
  mask: false,
  filter: false,
  blend: "src-over",
  backdropDependent: false,
  colorSpace: "srgb",
  transform: false,
};

function defaultTransport(hint: V13ProviderHint, mode: PlanMode): CopyCost {
  if (hint === "skia-cpu-reference") {
    return mode === "interactive" ? "image-bitmap" : "cpu-readback";
  }
  if (hint === "skia-gpu") return "image-bitmap";
  return "same-gpu-texture";
}

function nodeHint(
  node: RenderNodeIR,
  mode: PlanMode,
  fingerprintSeed: RenderWorkloadFingerprint,
): V13ProviderHint {
  if (node.kind === "mask-group" && !node.isolated) return "skia-gpu";
  if (node.kind === "filter-group" && node.graph.nodes.length > 1) return "skia-gpu";
  const features = collectRenderFeatures([node]);
  return chooseProviderHint(features, fingerprintSeed, mode);
}

function expandForBackdrop(node: RenderNodeIR): boolean {
  return node.kind === "mask-group" && !node.isolated;
}

function velloOwnsNode(node: RenderNodeIR, hybrid: boolean): boolean {
  return collectRenderFeatures([node]).every((feature) => velloCanOwnFeature(feature, hybrid));
}

export function compileRenderIslands(
  scene: RenderSceneIR,
  options: { readonly mode?: PlanMode; readonly dpr?: number } = {},
): CompiledIslandPlan {
  const mode = options.mode ?? "interactive";
  const islands: CompiledRenderIsland[] = [];
  let rejectedInteractiveCpuReadback = false;

  const flush = (
    nodes: RenderNodeIR[],
    hint: V13ProviderHint,
    isolation: IsolationContextIR,
  ): void => {
    if (nodes.length === 0) return;
    if (mode === "interactive" && hint === "skia-cpu-reference") {
      rejectedInteractiveCpuReadback = true;
      hint = "skia-gpu";
    }
    const subset: RenderSceneIR = {
      ...createEmptyRenderScene(scene.width, scene.height),
      background: { r: 0, g: 0, b: 0, a: 0 },
      nodes,
      isolation,
    };
    const features = collectRenderFeatures(nodes);
    const fingerprint = fingerprintRenderScene(subset, { dpr: options.dpr });
    const transport = defaultTransport(hint, mode);
    if (mode === "interactive" && transport === "cpu-readback") {
      rejectedInteractiveCpuReadback = true;
      return;
    }
    islands.push({
      id: `island-${islands.length}-${hint}`,
      providerHint: hint,
      features,
      fingerprint,
      nodes,
      documentIds: collectRenderDocumentIds(nodes),
      isolation,
      transport,
    });
  };

  let current: RenderNodeIR[] = [];
  let currentHint: V13ProviderHint | null = null;

  const sceneFingerprint = fingerprintRenderScene(scene, { dpr: options.dpr });

  for (const node of scene.nodes) {
    if (expandForBackdrop(node) || !velloOwnsNode(node, true)) {
      if (skiaMustCompleteFeature(collectRenderFeatures([node])[0] ?? "render.mask")
        || expandForBackdrop(node)
        || !velloOwnsNode(node, true)) {
        flush(current, currentHint ?? "vello-classic", scene.isolation ?? DEFAULT_ISOLATION);
        current = [];
        currentHint = null;
        flush(
          [node],
          nodeHint(node, mode, sceneFingerprint),
          {
            ...(scene.isolation ?? DEFAULT_ISOLATION),
            mask: node.kind === "mask-group",
            filter: node.kind === "filter-group",
            backdropDependent: expandForBackdrop(node),
          },
        );
        continue;
      }
    }

    const hint = nodeHint(node, mode, sceneFingerprint);
    if (currentHint === null) {
      currentHint = hint;
      current.push(node);
      continue;
    }
    if (hint === currentHint) {
      current.push(node);
      continue;
    }
    flush(current, currentHint, scene.isolation ?? DEFAULT_ISOLATION);
    current = [node];
    currentHint = hint;
  }
  flush(current, currentHint ?? "vello-classic", scene.isolation ?? DEFAULT_ISOLATION);

  return {
    scene,
    mode,
    islands,
    rejectedInteractiveCpuReadback,
  };
}
