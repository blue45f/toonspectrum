import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DIST_DIR } from "./lib/repo-paths.mjs";

export const SCENE3D_SPECIALIST_BUNDLE_ENTRIES = Object.freeze({
  app: "index.html",
  studio: "src/domains/creator/studio-legacy-editor-adapter.tsx",
  editor: "src/domains/creator/bg3d/StudioBackground3D.tsx",
  tools: "src/domains/creator/scene3d/specialists/StudioScene3dAssetToolsPanel.tsx",
  reference: "src/domains/creator/scene3d/specialists/StudioScene3dSplatReferencePanel.tsx",
  spark: "src/domains/creator/scene3d/specialists/splat-reference-runtime.ts",
});
/** Numeric size approval must never permit optional engines to become eager. */
export function verifyScene3dSpecialistBundle(manifest, files) {
  const closure = (key) => {
    const seen = new Set(); const pending = [key];
    while (pending.length) {
      const next = pending.pop(); if (seen.has(next)) continue;
      const entry = manifest[next]; if (!entry) throw new Error("Missing manifest entry: " + next);
      seen.add(next); pending.push(...(entry.imports ?? []));
    }
    return seen;
  };
  const entry = SCENE3D_SPECIALIST_BUNDLE_ENTRIES;
  const sparkEntries = Object.keys(manifest).filter((key) => /@sparkjsdev.*spark.*spark\.module/u.test(key));
  if (sparkEntries.length !== 1) throw new Error("Exactly one Spark module must be visible behind its lazy entry.");
  const optional = [entry.tools, entry.reference, entry.spark, ...sparkEntries];
  for (const key of optional) if (manifest[key]?.isDynamicEntry !== true) throw new Error("Missing dynamic specialist entry: " + key);
  const startup = {};
  for (const key of [entry.app, entry.studio, entry.editor]) {
    const reachable = closure(key);
    for (const specialist of optional) if (reachable.has(specialist)) throw new Error("Specialist leaked into startup: " + specialist + " via " + key);
    startup[key] = reachable.size;
  }
  const mainThreadKernels = Object.keys(manifest).filter((key) => /(?:specialist-(?:runtime|assets|geometry|csg|navigation|ik)\.ts|recast-navigation|three-bvh-csg|closed-chain-ik)/u.test(key));
  if (mainThreadKernels.length) throw new Error("Processing kernels escaped the Worker graph: " + mainThreadKernels.join(", "));
  const workers = files.filter((file) => /^specialist\.worker-[A-Za-z0-9_-]+\.js$/u.test(file));
  if (workers.length !== 1) throw new Error("Exactly one emitted specialist Worker is required.");
  return Object.freeze({ status: "passed", startupStaticChunks: startup, isolatedDynamicEntries: optional, worker: workers[0] });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.env.STUDIO_BUNDLE_DIR ?? DIST_DIR;
  const manifest = JSON.parse(readFileSync(join(root, ".vite/manifest.json"), "utf8"));
  console.log(JSON.stringify(verifyScene3dSpecialistBundle(manifest, readdirSync(join(root, "assets"))), null, 2));
}
