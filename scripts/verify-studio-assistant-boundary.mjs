import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ASSISTANT_ENTRY = "src/domains/creator/assistant/StudioWebtoonAssistantContent.tsx";
const roots = ["index.html", "src/domains/creator/studio-legacy-editor-adapter.tsx"];

/** Inspect emitted production edges, not a source-text claim of laziness. */
export function verifyStudioAssistantBoundary(manifest) {
  const closure = (key, visited = new Set()) => {
    if (visited.has(key)) return visited;
    assert.ok(manifest[key]?.file, `Missing manifest entry: ${key}`);
    visited.add(key);
    for (const dependency of manifest[key].imports ?? []) closure(dependency, visited);
    return visited;
  };
  assert.ok(manifest[ASSISTANT_ENTRY]?.isDynamicEntry, "Assistant must remain an emitted dynamic entry");
  const initial = new Set(roots.flatMap((root) => [...closure(root)]));
  const assistantFile = manifest[ASSISTANT_ENTRY].file;
  assert.ok(![...initial].some((key) => manifest[key].file === assistantFile), "Assistant leaked into startup graph");
  assert.ok([...initial].some((key) => (manifest[key].dynamicImports ?? []).includes(ASSISTANT_ENTRY)), "Assistant must remain reachable from its real startup owner");
  const optional = [...closure(ASSISTANT_ENTRY)].filter((key) => !initial.has(key));
  return { initialAssistantRequests: 0, assistantFile, deferredChunks: optional.length, deferredFiles: optional.map((key) => manifest[key].file) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(readFileSync(process.argv[2] ?? "dist/.vite/manifest.json", "utf8"));
  console.log(JSON.stringify(verifyStudioAssistantBoundary(manifest), null, 2));
}
