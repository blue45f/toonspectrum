import {
  STUDIO_EFFECT_GRAPH_VERSION,
  planStudioEffectGraphRender,
  validateStudioAdjustmentEffectGraph,
  type StudioAdjustmentEffectGraph,
  type StudioEffectGraphEdge,
  type StudioEffectGraphNode,
  type StudioEffectGraphRenderPlan,
  type StudioLiveEffectKind,
} from "../filter/studio-adjustment-effect-graph";
import { studioDeterministicContentId } from "../studio-deterministic-serialization";
import type {
  StudioLayerEffect,
  StudioLayerEffectsStack,
} from "./studio-layer-effects-stack";

type StudioLayerEffectParameter = number | string | boolean | readonly number[];

function effectParameters(
  effect: StudioLayerEffect,
): Readonly<Record<string, StudioLayerEffectParameter>> {
  switch (effect.kind) {
    case "glow":
      return Object.freeze({
        type: effect.type,
        color: effect.color,
        blur: effect.blur,
        intensity: effect.intensity,
      });
    case "drop-shadow":
      return Object.freeze({
        color: effect.color,
        blur: effect.blur,
        offsetX: effect.offsetX,
        offsetY: effect.offsetY,
        opacity: effect.opacity,
        angleDeg: effect.angleDeg,
        distance: effect.distance,
      });
    case "relief":
      return Object.freeze({
        elevationDeg: effect.elevationDeg,
        azimuthDeg: effect.azimuthDeg,
        depth: effect.depth,
        smoothness: effect.smoothness,
        lightIntensity: effect.lightIntensity,
        ambient: effect.ambient,
        invert: effect.invert,
      });
    case "border":
      return Object.freeze({
        thickness: effect.thickness,
        color: effect.color,
        type: effect.type,
        respectTransparency: effect.respectTransparency,
        antiAliased: effect.antiAliased,
      });
  }
}

function liveEffectKind(effect: StudioLayerEffect): StudioLiveEffectKind {
  if (effect.kind === "drop-shadow") return "drop-shadow";
  if (effect.kind === "relief") return "inflate";
  return "glow";
}

function normalizedNodeId(index: number, effectId: string): string {
  const safeId = effectId
    .trim()
    .replace(/[^\w.:-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 160);
  return `layer-effect-${index}-${safeId || "effect"}`;
}

export function studioLayerEffectsStackToGraph(
  stack: StudioLayerEffectsStack,
  sourceHash: string,
): StudioAdjustmentEffectGraph {
  const normalizedSourceHash = sourceHash.trim();
  if (!normalizedSourceHash) throw new TypeError("sourceHash is required.");

  const nodes: StudioEffectGraphNode[] = [
    Object.freeze({
      id: "layer-source",
      kind: "source",
      sourceHash: normalizedSourceHash,
      embedded: true,
      enabled: true,
      opacity: 1,
      blendMode: "normal",
    }),
  ];
  const edges: StudioEffectGraphEdge[] = [];
  let inputNodeId = "layer-source";

  stack.effects.forEach((effect, index) => {
    const nodeId = normalizedNodeId(index, effect.id);
    nodes.push(
      Object.freeze({
        id: nodeId,
        kind: "live-effect",
        effect: liveEffectKind(effect),
        enabled: effect.enabled,
        opacity: 1,
        blendMode: "normal",
        parameters: Object.freeze({
          sourceKind: effect.kind,
          ...effectParameters(effect),
        }),
        preferredBackend: "auto",
      }),
    );
    edges.push(Object.freeze({ from: inputNodeId, to: nodeId, input: "source" }));
    inputNodeId = nodeId;
  });

  nodes.push(
    Object.freeze({
      id: "layer-output",
      kind: "output",
      outputColorSpace: "srgb",
      enabled: true,
      opacity: 1,
      blendMode: "normal",
    }),
  );
  edges.push(Object.freeze({ from: inputNodeId, to: "layer-output", input: "source" }));

  const graph: StudioAdjustmentEffectGraph = Object.freeze({
    version: STUDIO_EFFECT_GRAPH_VERSION,
    id: "layer-effects-live-graph",
    revision: stack.effects.length,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    outputNodeId: "layer-output",
  });
  validateStudioAdjustmentEffectGraph(graph);
  return graph;
}

export interface StudioLayerEffectsRenderPlan extends StudioEffectGraphRenderPlan {
  readonly backend: "cpu" | "webgpu";
  readonly cacheKey: string;
}

export function planStudioLayerEffectsStack(
  stack: StudioLayerEffectsStack,
  sourceHash: string,
  backend: "cpu" | "webgpu" = "webgpu",
): StudioLayerEffectsRenderPlan {
  const renderPlan = planStudioEffectGraphRender({
    graph: studioLayerEffectsStackToGraph(stack, sourceHash),
    purpose: "preview",
    webGpuAvailable: backend === "webgpu",
    sourceColorSpace: "srgb",
  });
  const cacheKey = studioDeterministicContentId({
    backend,
    graphHash: renderPlan.graphHash,
    purpose: renderPlan.purpose,
    steps: renderPlan.steps,
  });
  return Object.freeze({ ...renderPlan, backend, cacheKey });
}
