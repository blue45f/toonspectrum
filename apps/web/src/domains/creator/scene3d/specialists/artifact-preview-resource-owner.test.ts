import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Bone,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  Texture,
} from "three";
import { createArtifactPreviewResourceOwner } from "./artifact-preview-resource-owner";

afterEach(() => vi.unstubAllGlobals());
describe("artifact preview resource lifetime", () => {
  it("disposes shared meshes, skeletons, textures and bitmap sources only once", () => {
    class Bitmap {
      close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", Bitmap);
    const image = new Bitmap();
    const first = new Texture(image);
    const second = new Texture(image);
    const material = new MeshStandardMaterial({
      map: first,
      normalMap: second,
    });
    const geometry = new BoxGeometry();
    const skeleton = new Skeleton([new Bone()]);
    const a = new SkinnedMesh(geometry, material);
    const b = new SkinnedMesh(geometry, material);
    a.skeleton = skeleton;
    b.skeleton = skeleton;
    const roots = [new Group().add(a), new Group().add(b)];
    const spies = [geometry, material, first, second, skeleton].map((value) =>
      vi.spyOn(value, "dispose"),
    );
    const owner = createArtifactPreviewResourceOwner(roots);
    const result = owner.dispose();
    expect(result).toMatchObject({
      geometries: 1,
      materials: 1,
      textures: 2,
      skeletons: 1,
      bitmaps: 1,
      errors: [],
    });
    expect(owner.dispose()).toBe(result);
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
    expect(image.close).toHaveBeenCalledOnce();
  });
  it("finishes releasing other resources even if one dispose listener fails", () => {
    const geometry = new BoxGeometry();
    const material = new MeshStandardMaterial();
    const error = new Error("dispose listener failed");
    vi.spyOn(geometry, "dispose").mockImplementation(() => {
      throw error;
    });
    const disposeMaterial = vi.spyOn(material, "dispose");
    const receipt = createArtifactPreviewResourceOwner([
      new Mesh(geometry, material),
    ]).dispose();
    expect(receipt.errors).toEqual([error]);
    expect(disposeMaterial).toHaveBeenCalledOnce();
  });
});
