import { MToonMaterial } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createStudioVrmTexturePaintBindingDescriptor } from "./studio-vrm-texture-paint-binding";
import { studioVrmTexturePaintChannelEncoding } from "./studio-vrm-texture-paint-channel";
import {
  StudioVrmTexturePaintMaterialChannels,
  studioVrmMaterialSupportsPaintChannel,
} from "./studio-vrm-texture-paint-material";

const signal = () => new AbortController().signal;
function texture(rgba = [19, 128, 64, 99]): THREE.DataTexture {
  const result = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
  result.channel = 1;
  result.repeat.set(2, 3);
  result.offset.set(0.2, 0.1);
  result.flipY = false;
  return result;
}
function read(input: THREE.Texture) {
  const image = input.image as { width: number; height: number; data: Uint8Array };
  return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

describe("material channel authoring", () => {
  it("isolates roughness and metalness from one packed ORM source and restores original bindings", async () => {
    const packed = texture();
    const material = new THREE.MeshStandardMaterial({ roughnessMap: packed, metalnessMap: packed, roughness: 0.5, metalness: 0.25 });
    const channels = new StudioVrmTexturePaintMaterialChannels();
    const roughness = channels.get(material, "roughness")!;
    const metalness = channels.get(material, "metalness")!;
    expect(roughness).not.toBe(metalness);
    expect(roughness).not.toBe(packed);
    expect((await channels.read(roughness, signal(), read)).data).toEqual(new Uint8ClampedArray([64, 64, 64, 255]));
    expect((await channels.read(metalness, signal(), read)).data).toEqual(new Uint8ClampedArray([16, 16, 16, 255]));
    expect(packed.image.data).toEqual(new Uint8Array([19, 128, 64, 99]));
    expect(roughness.channel).toBe(1);
    expect(roughness.repeat.toArray()).toEqual([2, 3]);
    expect(roughness.colorSpace).toBe(THREE.NoColorSpace);
    const roughPaint = texture([255, 255, 255, 255]);
    channels.set(material, "roughness", roughPaint);
    expect(material.roughnessMap).toBe(roughPaint);
    expect(material.roughness).toBe(1);
    expect(material.metalnessMap).toBe(packed);
    expect(material.metalness).toBe(0.25);
    channels.set(material, "roughness", roughness);
    expect(material.roughnessMap).toBe(packed);
    expect(material.roughness).toBe(0.5);
    channels.dispose();
  });

  it("shares same-channel material atlases only when their effective source factors agree", () => {
    const packed = texture();
    const a = new THREE.MeshStandardMaterial({ roughnessMap: packed, roughness: 0.5 });
    const b = new THREE.MeshStandardMaterial({ roughnessMap: packed, roughness: 0.5 });
    const c = new THREE.MeshStandardMaterial({ roughnessMap: packed, roughness: 0.25 });
    const channels = new StudioVrmTexturePaintMaterialChannels();
    expect(channels.get(a, "roughness")).toBe(channels.get(b, "roughness"));
    expect(channels.get(a, "roughness")).not.toBe(channels.get(c, "roughness"));
    channels.dispose();
  });

  it("prepares missing channels without changing the unpainted material or decoding a color texture", async () => {
    const material = new THREE.MeshStandardMaterial({ map: texture(), roughness: 0.8, metalness: 0 });
    const channels = new StudioVrmTexturePaintMaterialChannels();
    const reader = vi.fn(read);
    const roughness = channels.get(material, "roughness")!;
    const metalness = channels.get(material, "metalness")!;
    expect((await channels.read(roughness, signal(), reader)).data).toEqual(new Uint8ClampedArray([204, 204, 204, 255]));
    expect((await channels.read(metalness, signal(), reader)).data).toEqual(new Uint8ClampedArray([0, 0, 0, 255]));
    expect(reader).not.toHaveBeenCalled();
    expect(material.roughnessMap).toBeNull();
    expect(material.metalnessMap).toBeNull();
    expect(material.roughness).toBe(0.8);
    channels.dispose();
  });

  it("bakes emissive color factors in linear light and preserves the source texture", async () => {
    const source = texture([128, 128, 128, 23]);
    const material = new THREE.MeshStandardMaterial({ emissiveMap: source, emissive: new THREE.Color().setRGB(0.5, 0.25, 0), emissiveIntensity: 2 });
    const channels = new StudioVrmTexturePaintMaterialChannels();
    const emissive = channels.get(material, "emissive")!;
    const image = await channels.read(emissive, signal(), read);
    // 128 sRGB decodes to about .216; factors are applied in linear light, then encoded again.
    expect([...image.data]).toEqual([92, 66, 0, 255]);
    expect(emissive.colorSpace).toBe(THREE.SRGBColorSpace);
    channels.set(material, "emissive", texture([255, 0, 0, 255]));
    expect(material.emissive.toArray()).toEqual([1, 1, 1]);
    expect(material.emissiveIntensity).toBe(2);
    channels.dispose();
    expect(material.emissive.toArray()).toEqual([0.5, 0.25, 0]);
    expect(material.emissiveMap).toBe(source);
    expect(source.image.data).toEqual(new Uint8Array([128, 128, 128, 23]));
  });

  it("uses scalar alpha-map coverage without turning brush strength into stored PNG alpha", async () => {
    const source = texture([19, 128, 64, 0]);
    const material = new THREE.MeshStandardMaterial({ alphaMap: source, opacity: 0.7 });
    const channels = new StudioVrmTexturePaintMaterialChannels();
    const opacity = channels.get(material, "opacity")!;
    expect([...((await channels.read(opacity, signal(), read)).data)]).toEqual([128, 128, 128, 255]);
    channels.set(material, "opacity", texture([64, 64, 64, 255]));
    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.7);
    channels.dispose();
    expect(material.transparent).toBe(false);
    expect(material.alphaMap).toBe(source);
  });

  it("rejects unsupported toon material channels instead of writing unused shader properties", () => {
    const material = new MToonMaterial();
    expect(studioVrmMaterialSupportsPaintChannel(material, "baseColor")).toBe(true);
    expect(studioVrmMaterialSupportsPaintChannel(material, "emissive")).toBe(true);
    expect(studioVrmMaterialSupportsPaintChannel(material, "roughness")).toBe(false);
    expect(studioVrmMaterialSupportsPaintChannel(material, "metalness")).toBe(false);
    expect(studioVrmMaterialSupportsPaintChannel(material, "opacity")).toBe(false);
    const channels = new StudioVrmTexturePaintMaterialChannels();
    expect(channels.get(material, "metalness")).toBeNull();
    expect("metalnessMap" in material).toBe(false);
    material.dispose();
    channels.dispose();
  });

  it("does not overwrite a material texture replaced outside the paint session", () => {
    const material = new THREE.MeshStandardMaterial({ roughnessMap: texture() });
    const channels = new StudioVrmTexturePaintMaterialChannels();
    channels.get(material, "roughness");
    channels.set(material, "roughness", texture());
    const replacement = texture([0, 0, 0, 255]);
    material.roughnessMap = replacement;
    expect(() => channels.get(material, "roughness")).toThrow("paint-channel-source-changed");
    channels.dispose();
    expect(material.roughnessMap).toBe(replacement);
  });

  it("preserves legacy binding keys and gives each exported channel a distinct stable identity", () => {
    expect(createStudioVrmTexturePaintBindingDescriptor("gltf-material:3")?.bindingKey).toBe("gltf-material-3-baseColor");
    expect(createStudioVrmTexturePaintBindingDescriptor("gltf-material:3", "roughness")?.bindingKey).toBe("gltf-material-3-roughness");
    expect(createStudioVrmTexturePaintBindingDescriptor("gltf-material:3", "metalness")?.bindingKey).toBe("gltf-material-3-metalness");
    expect(studioVrmTexturePaintChannelEncoding("opacity")).toEqual({ colorSpace: "linear", channelPacking: "grayscale" });
    expect(studioVrmTexturePaintChannelEncoding("emissive")).toEqual({ colorSpace: "srgb", channelPacking: "rgb" });
  });
});
