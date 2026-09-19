import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { expect, it } from "vitest";
import { createSpecialistFixture } from "../specialists/specialist-fixtures";
import { runScene3dSpecialist } from "../specialists/specialist-runtime";
import { validateStudioBg3dGlb, DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES } from "../../bg3d/studio-bg3d-glb-validation";
import { loadStudioBg3dMeshoptDecoder, STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS } from "../../bg3d/studio-bg3d-meshopt";
import { createArtifactPreviewResourceOwner } from "../specialists/artifact-preview-resource-owner";
import { digestScene3dBytes } from "./scene3d-inplace-controller";

async function validate(bytes: Uint8Array<ArrayBuffer>) {
  return validateStudioBg3dGlb(bytes, { profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    declared: { byteSize: bytes.length, sha256: await digestScene3dBytes(bytes), mimeType: "model/gltf-binary" },
    cumulative: { usedBytes: 0, maximumBytes: 128 * 1024 * 1024 }, supportedRequiredExtensions: STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS });
}
it("admits actual generated meshopt/quantized LODs through the same product allowlist and pinned Three decoder", async () => {
  const source = await createSpecialistFixture("sphere");
  const result = await runScene3dSpecialist({ version: 1, id: 1, source: source.buffer, options: { kind: "lod", error: 0.01 } });
  const decoder = await loadStudioBg3dMeshoptDecoder(); await decoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(decoder);
  const original = await loader.parseAsync(source.slice().buffer, "");
  try {
    const sourceSize = new Box3().setFromObject(original.scene).getSize(new Vector3());
    for (const artifact of result.artifacts) {
      const admission = await validate(artifact.bytes); expect(admission.ok).toBe(true);
      if (!admission.ok) throw new Error(admission.code);
      expect(admission.metrics.triangles).toBe(artifact.stats?.triangles);
      const parsed = await loader.parseAsync(artifact.bytes.slice().buffer, "");
      try {
        const size = new Box3().setFromObject(parsed.scene).getSize(new Vector3());
        expect(size.toArray().every(Number.isFinite)).toBe(true);
        expect(size.distanceTo(sourceSize)).toBeLessThan(0.15);
      } finally { createArtifactPreviewResourceOwner(parsed.scenes).dispose(); }
    }
  } finally { createArtifactPreviewResourceOwner(original.scenes).dispose(); }
});
it("continues rejecting untrusted required extensions and malformed compressed buffer ranges", async () => {
  const source = await createSpecialistFixture("sphere");
  const result = await runScene3dSpecialist({ version: 1, id: 1, source: source.buffer, options: { kind: "compress" } });
  const bytes = result.artifacts[0]!.bytes;
  const mutate = (change: (root: { extensionsRequired: string[]; bufferViews: { extensions: { EXT_meshopt_compression: { byteLength: number } } }[] }) => void) => {
    const view = new DataView(bytes.buffer); const jsonSize = view.getUint32(12, true);
    const root = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonSize))); change(root);
    const encoded = new TextEncoder().encode(JSON.stringify(root)); const padded = Math.ceil(encoded.length / 4) * 4;
    const output = new Uint8Array(bytes.length - jsonSize + padded); const target = new DataView(output.buffer);
    output.set(bytes.subarray(0, 20)); target.setUint32(8, output.length, true); target.setUint32(12, padded, true);
    output.fill(32, 20, 20 + padded); output.set(encoded, 20); output.set(bytes.subarray(20 + jsonSize), 20 + padded); return output;
  };
  expect(await validate(mutate((root) => root.extensionsRequired.push("UNTRUSTED_runtime")))).toMatchObject({ ok: false, code: "unsupported-required-extension" });
  expect((await validate(mutate((root) => { root.bufferViews[0].extensions.EXT_meshopt_compression.byteLength = 2 ** 30; }))).ok).toBe(false);
});
