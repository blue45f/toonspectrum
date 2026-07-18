import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { loadVerifiedStudioBg3dGlbWithThree } from "./studio-background-3d-model";
import {
  DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
  STUDIO_BG3D_GLB_MIME_TYPE,
  validateStudioBg3dGlb,
} from "./studio-bg3d-glb-validation";
import { STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS } from "./studio-bg3d-meshopt";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

const COMPRESSED_TRIANGLE_POSITIONS = new Uint8Array([
  160, 0, 0, 1, 60, 0, 0, 0, 255, 255, 1, 60, 0, 0, 0, 126, 125, 0, 0, 1, 12, 0,
  0, 0, 255, 1, 12, 0, 0, 0, 126, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

function pad(bytes: Uint8Array, fill: number): Uint8Array {
  const result = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4);
  result.fill(fill);
  result.set(bytes);
  return result;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer).setUint32(offset, value, true);
}

function compressedTriangleGlb(): Uint8Array {
  const root = {
    asset: { version: "2.0", generator: "ToonSpectrum Meshopt integration fixture" },
    extensionsUsed: ["EXT_meshopt_compression"],
    extensionsRequired: ["EXT_meshopt_compression"],
    buffers: [
      { byteLength: COMPRESSED_TRIANGLE_POSITIONS.byteLength },
      { byteLength: 36, extensions: { EXT_meshopt_compression: { fallback: true } } },
    ],
    bufferViews: [{
      buffer: 1,
      byteOffset: 0,
      byteLength: 36,
      byteStride: 12,
      target: 34962,
      extensions: {
        EXT_meshopt_compression: {
          buffer: 0,
          byteOffset: 0,
          byteLength: COMPRESSED_TRIANGLE_POSITIONS.byteLength,
          byteStride: 12,
          count: 3,
          mode: "ATTRIBUTES",
          filter: "NONE",
        },
      },
    }],
    accessors: [{
      bufferView: 0,
      byteOffset: 0,
      componentType: 5126,
      count: 3,
      type: "VEC3",
      min: [0, 0, 0],
      max: [1, 1, 0],
    }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  const json = pad(new TextEncoder().encode(JSON.stringify(root)), 0x20);
  const bin = pad(COMPRESSED_TRIANGLE_POSITIONS, 0);
  const total = 12 + 8 + json.byteLength + 8 + bin.byteLength;
  const bytes = new Uint8Array(total);
  writeU32(bytes, 0, 0x46546c67);
  writeU32(bytes, 4, 2);
  writeU32(bytes, 8, total);
  writeU32(bytes, 12, json.byteLength);
  writeU32(bytes, 16, 0x4e4f534a);
  bytes.set(json, 20);
  const binHeader = 20 + json.byteLength;
  writeU32(bytes, binHeader, bin.byteLength);
  writeU32(bytes, binHeader + 4, 0x004e4942);
  bytes.set(bin, binHeader + 8);
  return bytes;
}

describe("Meshopt verified GLB integration", () => {
  it("validates, decodes, and materializes a real compressed triangle through the production boundary", async () => {
    const bytes = compressedTriangleGlb();
    const verification = await validateStudioBg3dGlb(bytes, {
      declared: {
        byteSize: bytes.byteLength,
        sha256: "0".repeat(64),
        mimeType: STUDIO_BG3D_GLB_MIME_TYPE,
      },
      cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 },
      profile: "desktop",
      budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
      supportedRequiredExtensions: STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS,
      digest: async () => "0".repeat(64),
    });
    expect(verification).toMatchObject({
      ok: true,
      metrics: { triangles: 1, estimatedDecodedGeometryBytes: 36 },
    });
    if (!verification.ok) throw new Error("compressed fixture did not pass verification");

    const loaded = await loadVerifiedStudioBg3dGlbWithThree(
      verification,
      DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets,
    );

    expect(loaded).toMatchObject({ ok: true, metrics: { triangles: 1 } });
    if (!loaded.ok) throw new Error("compressed fixture did not load");
    const mesh = loaded.root.getObjectByProperty("isMesh", true) as THREE.Mesh | undefined;
    const positions = mesh?.geometry.getAttribute("position");
    expect(positions?.count).toBe(3);
    expect(Array.from({ length: positions?.count ?? 0 }, (_, index) => [
      positions?.getX(index),
      positions?.getY(index),
      positions?.getZ(index),
    ])).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ]);
    loaded.dispose();
  });
});
