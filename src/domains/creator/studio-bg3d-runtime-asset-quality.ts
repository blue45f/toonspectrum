import * as THREE from "three";

const STUDIO_BG3D_RUNTIME_LIGHTING_HINTS = {
  default: {
    castShadow: true,
    receiveShadow: true,
  },
  off: {
    castShadow: false,
    receiveShadow: false,
  },
};

export interface StudioBg3dRuntimeAssetQualityInput {
  castShadow: boolean;
  receiveShadow: boolean;
}

export function applyStudioBg3dRuntimeAssetQuality(
  root: THREE.Object3D,
  quality: StudioBg3dRuntimeAssetQualityInput
): void {
  const hints =
    quality.castShadow || quality.receiveShadow
      ? STUDIO_BG3D_RUNTIME_LIGHTING_HINTS.default
      : STUDIO_BG3D_RUNTIME_LIGHTING_HINTS.off;

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if ((mesh as THREE.Mesh).isMesh === true) {
      mesh.castShadow = hints.castShadow;
      mesh.receiveShadow = hints.receiveShadow;
    }
  });
}
