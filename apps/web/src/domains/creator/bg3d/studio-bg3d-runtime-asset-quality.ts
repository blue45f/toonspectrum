import * as THREE from "three";

const STUDIO_BG3D_RUNTIME_MAX_ANISOTROPY = 16;

export interface StudioBg3dRuntimeAssetQualityInput {
  castShadow: boolean;
  receiveShadow: boolean;
  /**
   * Renderer that will draw the asset, used only to read the device anisotropy ceiling.
   *
   * WebGL exposes it under `capabilities`; WebGPU exposes it on the renderer itself. Naming one
   * type would silently fall back to the constant on the other, so both shapes are accepted.
   */
  readonly renderer?:
    | (Partial<THREE.WebGLRenderer> & { getMaxAnisotropy?: () => number })
    | null;
  /** qualityBudget lowers anisotropy only; mesh lighting/casting is still controlled by flags. */
  readonly qualityBudget?: number;
}

function clampQualityBudget(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0.2, Math.min(1, value));
}

function collectMaterialTextures(material: THREE.Material): THREE.Texture[] {
  const textures: THREE.Texture[] = [];

  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      textures.push(value);
    }
  }

  if ((material as THREE.ShaderMaterial).isShaderMaterial === true) {
    const shaderUniforms = (material as THREE.ShaderMaterial).uniforms;
    if (shaderUniforms) {
      for (const uniform of Object.values(shaderUniforms)) {
        const candidate = uniform?.value;
        if (candidate instanceof THREE.Texture) {
          textures.push(candidate);
        }
      }
    }
  }

  return textures;
}

/** The importer owns color space, filters, and mip levels, including compressed and NPOT maps. */
function improveTextureAnisotropyForRuntime(
  texture: THREE.Texture,
  qualityBudget: number,
  maxAnisotropy: number,
): void {
  const effectiveAnisotropy = Math.max(1, Math.floor(maxAnisotropy * qualityBudget));
  if (texture.anisotropy !== effectiveAnisotropy) {
    texture.anisotropy = effectiveAnisotropy;
    texture.needsUpdate = true;
  }
}

export function applyStudioBg3dRuntimeAssetQuality(
  root: THREE.Object3D,
  quality: StudioBg3dRuntimeAssetQualityInput
): void {
  const qualityBudget = clampQualityBudget(quality.qualityBudget);
  const rendererMaxAnisotropy = quality.renderer?.capabilities?.getMaxAnisotropy?.()
    ?? quality.renderer?.getMaxAnisotropy?.()
    ?? 1;
  const maxAnisotropy = Number.isFinite(rendererMaxAnisotropy)
    ? Math.max(1, Math.min(STUDIO_BG3D_RUNTIME_MAX_ANISOTROPY, rendererMaxAnisotropy))
    : 1;
  const visitedTextures = new Set<THREE.Texture>();

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if ((mesh as THREE.Mesh).isMesh === true) {
      mesh.castShadow = quality.castShadow;
      mesh.receiveShadow = quality.receiveShadow;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!(material instanceof THREE.Material)) continue;
        for (const texture of collectMaterialTextures(material)) {
          if (visitedTextures.has(texture)) continue;
          visitedTextures.add(texture);
          improveTextureAnisotropyForRuntime(texture, qualityBudget, maxAnisotropy);
        }
      }
    }
  });
}
