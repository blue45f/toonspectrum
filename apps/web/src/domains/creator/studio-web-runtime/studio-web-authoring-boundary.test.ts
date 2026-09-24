import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const CREATOR = resolve(HERE, "..");

const PRODUCTION_FILES = [
  resolve(HERE, "studio-web-authoring-runtime.ts"),
  resolve(HERE, "studio-web-authoring-project-v3.ts"),
  resolve(HERE, "studio-web-authoring-project-v3-repository.ts"),
  resolve(CREATOR, "character-platform/application/character-authoring-authority.ts"),
  resolve(CREATOR, "character-platform/document/character-document-v3.ts"),
  resolve(CREATOR, "character-platform/document/character-document-v3-repository.ts"),
  resolve(CREATOR, "character-platform/groom/character-groom-document.ts"),
  resolve(CREATOR, "character-platform/linked-layer/character-linked-layer.ts"),
  resolve(CREATOR, "character-platform/runtime/character-authoring-worker-client.ts"),
  resolve(CREATOR, "character-platform/runtime/character-authoring-worker-protocol.ts"),
  resolve(CREATOR, "character-platform/runtime/character-authoring-worker-runtime.ts"),
  resolve(CREATOR, "character-platform/runtime/character-authoring.worker.ts"),
  resolve(CREATOR, "character-platform/surface-ink/character-geometry-stroke.ts"),
  resolve(CREATOR, "character-platform/ui/use-character-authoring-authority.ts"),
] as const;

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Studio 3D browser-first architecture boundary", () => {
  it("keeps production modules free of Node and desktop-only imports", () => {
    for (const file of PRODUCTION_FILES) {
      const text = source(file);
      expect(text, file).not.toMatch(/(?:from\s+|import\s*\()\s*["']node:/u);
      expect(text, file).not.toMatch(/(?:electron|tauri|desktop-commander|child_process|spawn\()/iu);
    }
  });

  it("never marks native execution as required in production contracts", () => {
    for (const file of PRODUCTION_FILES) {
      const text = source(file);
      expect(text, file).not.toMatch(/nativeRequired\s*:\s*true/u);
    }
  });

  it("creates the heavy authoring worker as a browser module worker", () => {
    const client = source(resolve(
      CREATOR,
      "character-platform/runtime/character-authoring-worker-client.ts",
    ));
    expect(client).toContain('new URL("./character-authoring.worker.ts", import.meta.url)');
    expect(client).toMatch(/type:\s*["']module["']/u);
    expect(client).toContain("main-thread-fallback");
  });

  it("uses OPFS/IndexedDB browser persistence instead of native filesystem authority", () => {
    const runtime = source(resolve(HERE, "studio-web-authoring-runtime.ts"));
    const characterRepository = source(resolve(
      CREATOR,
      "character-platform/document/character-document-v3-repository.ts",
    ));
    expect(runtime).toContain("sqlite-wasm-opfs-worker");
    expect(runtime).toContain("indexeddb-project-store");
    expect(characterRepository).toContain("acquireStudioLocalDatabase");
  });
});
