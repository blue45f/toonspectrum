import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createStudioVrmPropAssetRuntime } from "./vrm/studio-vrm-prop-asset-runtime";
import { propDefById, type PropGltfGeometrySource } from "./vrm/studio-vrm-props";

const REFINED_PROPS = [
  "hanging_sign", "traffic_light", "mailbox", "blackboard", "desk", "chair",
  "sofa", "bubble_tea", "ice_cream_cone", "fox_mask", "robot_pet",
] as const;
const WEARABLE_PROPS = [
  "hanging_sign", "traffic_light", "mailbox", "bubble_tea",
  "ice_cream_cone", "fox_mask", "robot_pet",
] as const;

interface GlbDocument {
  asset: { version: string };
  scenes: { nodes: number[] }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
  buffers?: { uri?: string }[];
  images?: { uri?: string; bufferView?: number }[];
}

describe("refined Blender props v8", () => {
  it.each(REFINED_PROPS)("ships an embedded replacement for %s and retains the original", (name) => {
    const directory = join(process.cwd(), "apps/web/public/assets/3d");
    const oldBytes = readFileSync(join(directory, `${name}.glb`));
    const bytes = readFileSync(join(directory, "refined-v8", `${name}.glb`));
    expect(bytes.equals(oldBytes)).toBe(false);
    expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
    const json = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12))) as GlbDocument;
    expect(json.asset.version).toBe("2.0");
    expect(json.scenes[0]?.nodes.length).toBeGreaterThan(0);
    expect(json.meshes.length).toBeGreaterThan(0);
    for (const mesh of json.meshes) {
      for (const primitive of mesh.primitives) {
        expect(primitive.attributes.POSITION).toBeTypeOf("number");
        expect(primitive.attributes.NORMAL).toBeTypeOf("number");
      }
    }
    for (const resource of [...(json.buffers ?? []), ...(json.images ?? [])]) {
      expect(resource.uri).toBeUndefined();
    }
    for (const image of json.images ?? []) expect(image.bufferView).toBeTypeOf("number");
  });

  it("uses replacement models for the existing prop IDs without changing saved identifiers", () => {
    for (const name of WEARABLE_PROPS) {
      expect(propDefById(`blender_${name}`)?.geometrySource).toEqual({
        kind: "gltf", url: `/assets/3d/refined-v8/${name}.glb`,
      });
    }
  });

  it("admits only the explicit revision directory and keeps legacy URLs usable", async () => {
    const loadRoot = vi.fn(async () => new THREE.Group());
    const runtime = createStudioVrmPropAssetRuntime({
      loadRoot,
      cloneRoot: async (root) => root.clone(true),
      disposeRoot: vi.fn(),
      scheduleCleanup: (callback) => queueMicrotask(callback),
    });
    for (const url of ["/assets/3d/refined-v8/fox_mask.glb", "/assets/3d/fox_mask.glb"] as const) {
      const lease = await runtime.acquire("blender_fox_mask", { kind: "gltf", url });
      lease.release();
    }
    expect(loadRoot).toHaveBeenCalledTimes(2);
    for (const url of [
      "/assets/3d/refined-v8/../fox_mask.glb", "/assets/3d/other/fox_mask.glb",
      "/assets/3d/refined-v8/fox_mask.glb?external=1", "/assets/3d/refined-v8/%2e%2e/fox_mask.glb",
    ]) {
      await expect(runtime.acquire("blender_fox_mask", { kind: "gltf", url } as PropGltfGeometrySource))
        .rejects.toThrow("Unsupported VRM prop GLTF URL");
    }
    expect(loadRoot).toHaveBeenCalledTimes(2);
  });
});
