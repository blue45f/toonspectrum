/** Verify real Blender ZIP outputs through the browser preflight and the actual Three.js loader. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { prepareBlenderCharacterPackage } from "../apps/web/src/domains/creator/vrm/studio-vrm-blender-package-import";

const receipt = JSON.parse(readFileSync(
  process.argv[2] ?? "batch_generated/blender-bridge-verification/verification.json", "utf8",
)) as { blender: string; runtimeArchive: string; authoredArchive: string };
const results: Record<string, unknown>[] = [];
for (const [label, path] of [["edited", receipt.runtimeArchive], ["authored", receipt.authoredArchive]] as const) {
  assert.equal(typeof path, "string", `${label} archive missing; run the Blender smoke script first`);
  const archive = new File([readFileSync(path)], `${label}.toonchar.zip`);
  const preview = await prepareBlenderCharacterPackage([archive]);
  assert.equal(preview.asset.role, "glb");
  assert.ok(preview.morphTargets > 0, `${label}: morph targets missing`);
  const loaded = await new GLTFLoader().parseAsync(await preview.runtimeFile.arrayBuffer(), "");
  let meshes = 0;
  let morphs = 0;
  loaded.scene.traverse((object) => {
    if ("isMesh" in object && object.isMesh) {
      meshes += 1;
      if ("morphTargetInfluences" in object && Array.isArray(object.morphTargetInfluences)) {
        morphs += object.morphTargetInfluences.length;
      }
    }
  });
  assert.ok(meshes > 0 && morphs > 0, `${label}: the real GLTFLoader lost geometry or shape keys`);
  if (label === "edited") assert.ok(loaded.animations.length > 0, "Edited animation was lost");
  if (label === "authored") {
    assert.equal(preview.manifest.capabilities.authoredHair.enabled, true);
    assert.ok(preview.manifest.capabilities.semanticFaceShapes.shapeKeys.length > 0);
  }
  results.push({ label, bytes: archive.size, qualityScore: preview.manifest.quality.score,
    loadedMeshes: meshes, loadedMorphTargets: morphs, loadedAnimations: loaded.animations.length });
}
console.log(JSON.stringify({ success: true, blender: receipt.blender, results }, null, 2));
