import * as THREE from "three";
import { hideStudioBg3dCaptureExcludedObjects } from "./studio-bg3d-capture-exclusion";
/** Viewport-dependent stochastic/custom shading is not silently treated as tile-invariant. */
export function assertStudioBg3dTiledSceneAdmission(scene: THREE.Scene): void {
  if (scene.overrideMaterial)
    throw new Error(
      "A scene-wide override material cannot be mixed with exact tiled export.",
    );
  const restore = hideStudioBg3dCaptureExcludedObjects(scene);
  try {
    scene.traverseVisible((object) => {
      if (
        (object as THREE.Points).isPoints ||
        (object as THREE.Sprite).isSprite
      )
        throw new Error(
          "Screen-sized point/sprite primitives are not supported by exact tiled output.",
        );
      const materials = (object as THREE.Mesh).material;
      for (const material of Array.isArray(materials)
        ? materials
        : materials
          ? [materials]
          : []) {
        if (
          (material as THREE.MeshPhysicalMaterial).transmission > 0 ||
          material.alphaHash ||
          material.dithering ||
          (material as THREE.ShaderMaterial).isShaderMaterial ||
          material.type === "LineMaterial" ||
          material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
        ) {
          throw new Error(
            "Transmissive, custom, stochastic or viewport-dependent materials require a tile-compatible shader adapter before high-resolution output.",
          );
        }
        const node = material as THREE.Material & { isNodeMaterial?: boolean };
        if (
          node.isNodeMaterial &&
          ![
            "MeshBasicNodeMaterial",
            "MeshLambertNodeMaterial",
            "MeshPhongNodeMaterial",
            "MeshStandardNodeMaterial",
            "MeshPhysicalNodeMaterial",
            "MeshNormalNodeMaterial",
          ].includes(node.type)
        ) {
          throw new Error(
            "This custom node material has not been verified for tiled output.",
          );
        }
        if (
          node.isNodeMaterial &&
          Object.entries(node).some(
            ([key, value]) =>
              key.endsWith("Node") &&
              key !== "isNode" &&
              key !== "isNodeMaterial" &&
              value != null,
          )
        ) {
          throw new Error(
            "Custom material node expressions require an explicit tile-compatible adapter.",
          );
        }
      }
    });
  } finally {
    restore();
  }
}
