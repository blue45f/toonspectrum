import { describe, expect, it } from "vitest";

import { collectStudioOfflineDrawingUrls, DRAWING_ROOTS } from "./studio-service-worker-drawing-plan";
import type { StudioViteManifest } from "./studio-service-worker-precache-plan";

const names = DRAWING_ROOTS;
const manifest: StudioViteManifest = {
  ...Object.fromEntries(names.map((name) => [name, { name, file: `assets/${name}-hash.js`, imports: ["shared"] }])),
  shared: { file: "assets/shared-hash.js", css: ["assets/shared-hash.css"], dynamicImports: ["heavy"] },
  heavy: { file: "assets/unrelated-heavy.js" },
};
const files = ["studio-local-database.worker-hash.js", "sqlite3-hash.wasm", "sqlite3-opfs-async-proxy-hash.js", "unrelated-heavy.wasm"];
describe("explicit offline drawing pack", () => {
  it("includes the complete static drawing and storage closure without unrelated lazy tools", () => {
    const urls = collectStudioOfflineDrawingUrls(manifest, files);
    expect(urls).toContain("/assets/shared-hash.css");
    expect(urls).toContain("/assets/studio-checkpoints-hash.js");
    expect(urls).toContain("/assets/studio-crdt-room-binding-hash.js");
    expect(urls).toContain("/assets/studio-autosave-opfs-session-hash.js");
    expect(urls).toContain("/assets/StudioEnhancedExportMenuPanel-hash.js");
    expect(urls).toContain("/assets/studio-capture-readiness-hash.js");
    expect(urls).toContain("/assets/studio-project-file-hash.js");
    expect(urls).toContain("/assets/studio-pages-history-durable-runtime-hash.js");
    expect(urls).toContain("/assets/studio-local-database.worker-hash.js");
    expect(urls).toContain("/assets/sqlite3-hash.wasm");
    expect(urls.some((url) => url.includes("unrelated-heavy"))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });
  it("fails the build instead of silently omitting a renamed core module", () => {
    expect(() => collectStudioOfflineDrawingUrls({}, files)).toThrow(/root missing/u);
  });
  it("requires the native storage worker and WASM", () => {
    expect(() => collectStudioOfflineDrawingUrls(manifest, [])).toThrow(/storage worker/u);
  });
});
