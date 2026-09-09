import { studioDeterministicContentId } from "../studio-deterministic-serialization";
import {
  planStudioEffectGraphRender,
  validateStudioAdjustmentEffectGraph,
  type StudioAdjustmentEffectGraph,
  type StudioEffectGraphEdge,
  type StudioEffectGraphNode,
  type StudioEffectGraphRenderPlan,
} from "../filter/studio-adjustment-effect-graph";
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

function liveEffectKind(effect: StudioLayerEffect): "glow" | "drop-shadow" | "inflate" {
  if (effect.kind === "drop-shadow") return "drop-shadow";
  if (effect.kind === "relief") return "inflate";
  return "glow";
}

export interface StudioLayerEffectsRenderPlan extends StudioEffectGraphRenderPlan {
  readonly backend: "cpu" | "webgpu";
  readonly cacheKey: string;
}

export function studioLayerEffectsStackToGraph(
  stack: StudioLayerEffectsStack,
  sourceHash: string,
): StudioAdjustmentEffectGraph {
  const nodes: StudioEffectGraphNode[] = [
    Object.freeze({
      id: "layer-source",
      kind: "source",
      sourceHash,
      embedded: true,
      enabled: true,
      opacity: 1,
      blendMode: "normal",
    }),
  ];
  const edges: StudioEffectGraphEdge[] = [];
  let inputNodeId = "layer-source";
  stack.effects.forEach((effect, index) => {
    const nodeId = `layer-effect-${index}-${effect.id}`;
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
      enabled: true,
      opacity: 1,
      blendMode: "normal",
      outputColorSpace: "srgb",
    }),
  );
  edges.push(Object.freeze({ from: inputNodeId, to: "layer-output", input: "source" }));

  const graph: StudioAdjustmentEffectGraph = Object.freeze({
    version: 1,
    id: "layer-effects-live-graph",
    revision: stack.effects.length,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    outputNodeId: "layer-output",
  });
  validateStudioAdjustmentEffectGraph(graph);
  return graph;
}

export function planStudioLayerEffectsStack(
  stack: StudioLayerEffectsStack,
  sourceHash: string,
  backend: "cpu" | "webgpu" = "webgpu",
): StudioLayerEffectsRenderPlan {
  const plan = planStudioEffectGraphRender({
    graph: studioLayerEffectsStackToGraph(stack, sourceHash),
    purpose: "preview",
    webGpuAvailable: backend === "webgpu",
    sourceColorSpace: "srgb",
  });
  return Object.freeze({
    ...plan,
    backend,
    cacheKey: studioDeterministicContentId({
      graphHash: plan.graphHash,
      purpose: plan.purpose,
      backend,
    }),
  });
}
