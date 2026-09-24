import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

function source(fileName: string): string {
  return readFileSync(resolve(HERE, fileName), "utf8");
}

describe("Studio offline host static boundary", () => {
  it("keeps scene planning and Yjs payload validation behind the lazy offline runtime", () => {
    const host = source("studio-offline-host-integration.ts");
    const runtime = source("studio-offline-branch-runtime.ts");

    expect(host).not.toContain("studio-offline-branch-scene-bridge");
    expect(host).not.toContain("studio-crdt-document-payload");
    expect(host).toContain("canMirrorPendingStrokeTransition");
    expect(runtime).toContain("planStudioOfflineSceneTransition");
  });
});
