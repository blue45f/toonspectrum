import type { SceneIR, SceneNodeIR } from "./scene";

/**
 * Scene feature inventory — lets renderer adapters and the planner agree on
 * what a scene actually requires, instead of discovering gaps mid-render.
 * An adapter that cannot honor a required feature must throw
 * UnsupportedSceneFeatureError (never silently skip a node — absolute rule 9).
 */

export type SceneFeature =
  | "render.vector.fill"
  | "render.vector.stroke"
  | "render.vector.gradient"
  | "render.text.paragraph"
  | "render.group.opacity"
  | `render.blend.${string}`;

export function collectSceneFeatures(scene: SceneIR): SceneFeature[] {
  const features = new Set<SceneFeature>();
  const visit = (nodes: SceneNodeIR[]): void => {
    for (const node of nodes) {
      if (node.blend !== "src-over") features.add(`render.blend.${node.blend}`);
      switch (node.kind) {
        case "fill-path":
          features.add("render.vector.fill");
          if (node.paint.kind !== "solid") features.add("render.vector.gradient");
          break;
        case "stroke-path":
          features.add("render.vector.stroke");
          if (node.paint.kind !== "solid") features.add("render.vector.gradient");
          break;
        case "text":
          features.add("render.text.paragraph");
          break;
        case "group":
          features.add("render.group.opacity");
          visit(node.children);
          break;
      }
    }
  };
  visit(scene.nodes);
  return [...features].sort();
}

export class UnsupportedSceneFeatureError extends Error {
  constructor(
    readonly providerId: string,
    readonly features: string[],
  ) {
    super(
      `provider ${providerId} cannot render required scene features: ${features.join(", ")}`,
    );
    this.name = "UnsupportedSceneFeatureError";
  }
}
