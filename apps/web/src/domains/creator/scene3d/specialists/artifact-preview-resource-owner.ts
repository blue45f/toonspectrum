import type {
  BufferGeometry,
  Material,
  Mesh,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Texture,
} from "three";

export interface ArtifactResourceDisposal {
  readonly geometries: number;
  readonly materials: number;
  readonly textures: number;
  readonly skeletons: number;
  readonly bitmaps: number;
  readonly errors: readonly unknown[];
}
/** glTF scenes may share every kind of GPU object: dispose each owned resource once. */
export function createArtifactPreviewResourceOwner(roots: readonly Object3D[]) {
  let receipt: ArtifactResourceDisposal | undefined;
  return {
    dispose(): ArtifactResourceDisposal {
      if (receipt) return receipt;
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      const textures = new Set<Texture>();
      const skeletons = new Set<Skeleton>();
      const bitmaps = new Set<ImageBitmap>();
      const errors: unknown[] = [];
      for (const root of roots)
        root.traverse((object) => {
          const mesh = object as Mesh;
          if (mesh.geometry) geometries.add(mesh.geometry);
          for (const material of Array.isArray(mesh.material)
            ? mesh.material
            : mesh.material
              ? [mesh.material]
              : [])
            materials.add(material);
          const skin = object as SkinnedMesh;
          if (skin.isSkinnedMesh && skin.skeleton) skeletons.add(skin.skeleton);
        });
      for (const material of materials)
        for (const value of Object.values(material)) {
          if (value?.isTexture) textures.add(value as Texture);
        }
      const image = (value: unknown): void => {
        if (Array.isArray(value)) {
          for (const item of value) image(item);
        } else if (
          typeof ImageBitmap !== "undefined" &&
          value instanceof ImageBitmap
        )
          bitmaps.add(value);
      };
      for (const texture of textures) image(texture.source.data);
      const attempt = (action: () => void) => {
        try {
          action();
        } catch (error) {
          errors.push(error);
        }
      };
      for (const resource of [
        ...geometries,
        ...materials,
        ...textures,
        ...skeletons,
      ])
        attempt(() => resource.dispose());
      for (const bitmap of bitmaps) attempt(() => bitmap.close());
      receipt = Object.freeze({
        geometries: geometries.size,
        materials: materials.size,
        textures: textures.size,
        skeletons: skeletons.size,
        bitmaps: bitmaps.size,
        errors: Object.freeze(errors),
      });
      return receipt;
    },
  };
}
