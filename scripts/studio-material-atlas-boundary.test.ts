import { describe, expect, it } from "vitest";

import { createStudioManualChunks } from "../apps/web/config/vite-manual-chunks";

import { verifyStudioMaterialAtlasBoundary } from "./verify-studio-material-atlas-boundary.mjs";

const entry = "src/domains/creator/studio-legacy-editor-adapter.tsx";
const runtime = "src/domains/creator/brush/studio-brush-pack-runtime.ts";
const atlas = "_studio-material-tip-atlas-a.js";
function manifest() {
  return {
    "index.html": { file: "assets/app.js", imports: [] as string[] },
    [entry]: { file: "assets/studio.js", imports: [] as string[] },
    [runtime]: { file: "assets/pack.js", imports: [atlas] },
    [atlas]: { file: "assets/studio-material-tip-atlas-a.js", name: "studio-material-tip-atlas", imports: [] as string[] },
  };
}

describe("material alpha atlas loading boundary", () => {
  it("assigns only the dependency-free generated atlas to the optional data chunk", () => {
    const chunk = createStudioManualChunks({ isInitialIconModule: () => false, isStudioCoreIconModule: () => false });
    const root = "/workspace/apps/web/src/domains/creator/brush/";
    expect(chunk(`${root}studio-material-tip-atlas.generated.json`)).toBe("studio-material-tip-atlas");
    for (const file of ["studio-material-morphology-runtime.ts", "studio-material-tip-kernels.ts", "studio-material-brush-catalog.ts", "studio-brush-pack-runtime.ts"]) {
      expect(chunk(root + file), file).not.toBe("studio-material-tip-atlas");
    }
  });

  it("requires zero initial atlas requests while retaining the exact selection dependency", () => {
    expect(verifyStudioMaterialAtlasBoundary(manifest())).toMatchObject({ initialAtlasRequests: 0, runtimeKey: runtime });
  });

  it.each(["index.html", entry])("rejects a direct or indirect eager atlas dependency from %s", (root) => {
    const input = manifest();
    input[root]!.imports.push(runtime);
    expect(() => verifyStudioMaterialAtlasBoundary(input)).toThrow("leaked into initial static graph");
  });

  it("rejects dependency capture, missing payloads, orphaned payloads and broken references", () => {
    const captured = manifest();
    captured[atlas]!.imports.push("index.html");
    expect(() => verifyStudioMaterialAtlasBoundary(captured)).toThrow("must not capture");
    const missing = manifest();
    delete (missing as Record<string, unknown>)[atlas];
    expect(() => verifyStudioMaterialAtlasBoundary(missing)).toThrow("exactly one");
    const orphaned = manifest();
    orphaned[runtime]!.imports = [];
    expect(() => verifyStudioMaterialAtlasBoundary(orphaned)).toThrow("must still load");
    const broken = manifest();
    broken[entry]!.imports.push("missing.js");
    expect(() => verifyStudioMaterialAtlasBoundary(broken)).toThrow("Broken static manifest reference");
  });
});
