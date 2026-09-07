import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { applyStudioBg3dRuntimeAssetQuality } from "./studio-bg3d-runtime-asset-quality";

function texture(width = 8, height = 8): THREE.Texture {
  const result = new THREE.Texture();
  result.image = { width, height };
  return result;
}

function mesh(material: THREE.Material | THREE.Material[]): THREE.Mesh {
  return new THREE.Mesh(new THREE.BufferGeometry(), material);
}

function applyQuality(root: THREE.Object3D, qualityBudget = 1, maxAnisotropy = 8): void {
  applyStudioBg3dRuntimeAssetQuality(root, {
    castShadow: true,
    receiveShadow: true,
    qualityBudget,
    renderer: { getMaxAnisotropy: () => maxAnisotropy },
  });
}

describe("imported asset runtime quality", () => {
  it("preserves imported base, data, extension, HDR, and shader texture color spaces", () => {
    const baseColor = texture();
    baseColor.colorSpace = THREE.SRGBColorSpace;
    const normal = texture();
    normal.colorSpace = THREE.NoColorSpace;
    const specularColor = texture();
    specularColor.colorSpace = THREE.SRGBColorSpace;
    const environment = new THREE.DataTexture(
      new Float32Array(4 * 4 * 4), 4, 4, THREE.RGBAFormat, THREE.FloatType,
    );
    environment.colorSpace = THREE.LinearSRGBColorSpace;
    const shaderColor = texture();
    shaderColor.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshPhysicalMaterial({
      map: baseColor,
      normalMap: normal,
      specularColorMap: specularColor,
      envMap: environment,
    });
    const shader = new THREE.ShaderMaterial({ uniforms: { colorMap: { value: shaderColor } } });

    applyQuality(mesh([material, shader]));

    expect(baseColor.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(normal.colorSpace).toBe(THREE.NoColorSpace);
    expect(specularColor.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(environment.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(shaderColor.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(material.map).toBe(baseColor);
    expect(material.version).toBe(0);
    expect(shader.version).toBe(0);
  });

  it("keeps NPOT mipmaps and the authored sampler when the device quality budget is lower", () => {
    const map = texture(300, 150);
    map.generateMipmaps = true;
    map.minFilter = THREE.NearestMipmapLinearFilter;
    map.magFilter = THREE.NearestFilter;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.MirroredRepeatWrapping;
    const source = map.source;

    applyQuality(mesh(new THREE.MeshStandardMaterial({ map })), 0.5);

    expect(map.generateMipmaps).toBe(true);
    expect(map.minFilter).toBe(THREE.NearestMipmapLinearFilter);
    expect(map.magFilter).toBe(THREE.NearestFilter);
    expect(map.wrapS).toBe(THREE.RepeatWrapping);
    expect(map.wrapT).toBe(THREE.MirroredRepeatWrapping);
    expect(map.source).toBe(source);
    expect(map.anisotropy).toBe(4);
  });

  it("preserves authored compressed mip levels without requesting automatic mip generation", () => {
    const mipmaps = [
      { data: new Uint8Array(32), width: 8, height: 4 },
      { data: new Uint8Array(16), width: 4, height: 2 },
      { data: new Uint8Array(16), width: 2, height: 1 },
      { data: new Uint8Array(16), width: 1, height: 1 },
    ];
    const map = new THREE.CompressedTexture(mipmaps, 8, 4, THREE.RGBA_S3TC_DXT5_Format);
    map.colorSpace = THREE.SRGBColorSpace;
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    const root = mesh(new THREE.MeshStandardMaterial({ map }));

    applyQuality(root);
    applyQuality(root, 0.5);

    expect(map.mipmaps).toBe(mipmaps);
    expect(map.generateMipmaps).toBe(false);
    expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it("preserves a deliberately unfiltered texture with no mipmaps", () => {
    const map = texture();
    map.generateMipmaps = false;
    map.minFilter = THREE.NearestFilter;
    map.magFilter = THREE.NearestFilter;

    applyQuality(mesh(new THREE.MeshBasicMaterial({ map })));

    expect(map.generateMipmaps).toBe(false);
    expect(map.minFilter).toBe(THREE.NearestFilter);
    expect(map.magFilter).toBe(THREE.NearestFilter);
  });

  it("caps anisotropy to the renderer and updates shared textures only once", () => {
    const map = texture();
    const material = new THREE.MeshStandardMaterial({ map, emissiveMap: map });
    const root = new THREE.Group();
    root.add(mesh(material), mesh(material));
    const initialVersion = map.version;

    applyQuality(root, 0.75, 4);

    expect(map.anisotropy).toBe(3);
    expect(map.version).toBe(initialVersion + 1);
    applyQuality(root, 0.75, 4);
    expect(map.version).toBe(initialVersion + 1);
    applyQuality(root, 1, 32);
    expect(map.anisotropy).toBe(16);
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, 0])(
    "uses a conservative anisotropy limit for an unavailable device cap (%s)",
    (maximum) => {
      const map = texture();
      applyStudioBg3dRuntimeAssetQuality(mesh(new THREE.MeshStandardMaterial({ map })), {
        castShadow: false,
        receiveShadow: false,
        ...(maximum === undefined ? {} : { renderer: { getMaxAnisotropy: () => maximum } }),
      });

      expect(map.anisotropy).toBe(1);
    },
  );

  it.each([
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ])("applies shadow casting %s and receiving %s independently", (castShadow, receiveShadow) => {
    const root = mesh(new THREE.MeshStandardMaterial());

    applyStudioBg3dRuntimeAssetQuality(root, { castShadow, receiveShadow });

    expect(root.castShadow).toBe(castShadow);
    expect(root.receiveShadow).toBe(receiveShadow);
  });
});
