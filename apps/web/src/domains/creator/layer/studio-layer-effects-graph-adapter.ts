import {
  planStudioAdjustmentEffectGraph,
  validateStudioAdjustmentEffectGraph,
  type StudioAdjustmentEffectGraph,
  type StudioAdjustmentEffectPlan,
  type StudioEffectGraphNode,
} from "../filter/studio-adjustment-effect-graph";
import type {
  StudioLayerEffect,
  StudioLayerEffectsStack,
} from "./studio-layer-effects-stack";

function effectParameters(effect: StudioLayerEffect): Readonly<Record<string, unknown>> {
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

export function studioLayerEffectsStackToGraph(
  stack: StudioLayerEffectsStack,
  sourceHash: string,
): StudioAdjustmentEffectGraph {
  const nodes: StudioEffectGraphNode[] = [
    Object.freeze({
      id: "layer-source",
      kind: "source",
      source: Object.freeze({
        mode: "embedded",
        contentHash: sourceHash,
        colorSpace: "sRGB",
      }),
    }),
  ];
  let inputNodeId = "layer-source";
  stack.effects.forEach((effect, index) => {
    const nodeId = `layer-effect-${index}-${effect.id}`;
    nodes.push(
      Object.freeze({
        id: nodeId,
        kind: "live-effect",
        inputNodeId,
        effect: liveEffectKind(effect),
        enabled: effect.enabled,
        opacity: 1,
        blendMode: "normal",
        parameters: Object.freeze({
          sourceKind: effect.kind,
          ...effectParameters(effect),
        }),
      }),
    );
    inputNodeId = nodeId;
  });
  nodes.push(
    Object.freeze({
      id: "layer-output",
      kind: "output",
      inputNodeId,
    }),
  );
  return validateStudioAdjustmentEffectGraph({
    schemaVersion: 1,
    id: "layer-effects-live-graph",
    revision: stack.effects.length,
    nodes,
    outputNodeId: "layer-output",
  });
}

export function planStudioLayerEffectsStack(
  stack: StudioLayerEffectsStack,
  sourceHash: string,
  backend: "cpu" | "webgpu" = "webgpu",
): StudioAdjustmentEffectPlan {
  return planStudioAdjustmentEffectGraph(
    studioLayerEffectsStackToGraph(stack, sourceHash),
    {
      purpose: "preview",
      backend,
      colorSpace: "sRGB",
      deviceProfile: backend === "webgpu" ? "studio-webgpu" : "studio-cpu",
    },
  );
}
