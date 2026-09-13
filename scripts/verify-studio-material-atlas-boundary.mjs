/** Production-manifest proof for the optional, lossless material alpha atlas. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** @param {Record<string, {file: string, name?: string, imports?: string[]}>} manifest */
export function verifyStudioMaterialAtlasBoundary(manifest) {
  const atlases = Object.entries(manifest).filter(([, entry]) =>
    entry.name === "studio-material-tip-atlas"
    || /(?:^|\/)studio-material-tip-atlas-[^/]+\.js$/u.test(entry.file));
  assert.equal(atlases.length, 1, "Expected exactly one named material atlas data leaf");
  const [atlasKey, atlas] = atlases[0];
  assert.equal(atlas.imports?.length ?? 0, 0, "The data leaf must not capture runtime dependencies");

  /** @param {string} root */
  const closure = (root) => {
    assert.ok(manifest[root], `Missing required production entry: ${root}`);
    const visited = new Set();
    const pending = [root];
    while (pending.length) {
      const key = pending.pop();
      if (visited.has(key)) continue;
      assert.ok(manifest[key], `Broken static manifest reference: ${key}`);
      visited.add(key);
      pending.push(...(manifest[key].imports ?? []));
    }
    return visited;
  };
  const launchEntries = [
    "index.html",
    "src/domains/creator/studio-legacy-editor-adapter.tsx",
  ];
  for (const root of launchEntries) {
    assert.ok(!closure(root).has(atlasKey), `Material alpha atlas leaked into initial static graph: ${root}`);
  }
  const runtimeKey = "src/domains/creator/brush/studio-brush-pack-runtime.ts";
  assert.ok(closure(runtimeKey).has(atlasKey), "Optional brush selection must still load its exact original fields");
  return { atlasKey, file: atlas.file, launchEntries, runtimeKey, initialAtlasRequests: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = JSON.parse(readFileSync(resolve(process.env.STUDIO_BUNDLE_DIR ?? "dist", ".vite/manifest.json"), "utf8"));
  console.log(JSON.stringify(verifyStudioMaterialAtlasBoundary(manifest), null, 2));
}
