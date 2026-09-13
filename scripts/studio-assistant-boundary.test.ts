import { describe, expect, it } from "vitest";

import { ASSISTANT_ENTRY, verifyStudioAssistantBoundary } from "./verify-studio-assistant-boundary.mjs";

function manifest() {
  return {
    "index.html": { file: "assets/app.js", imports: [] as string[], dynamicImports: [] as string[] },
    "src/domains/creator/studio-legacy-editor-adapter.tsx": { file: "assets/studio.js", imports: [] as string[], dynamicImports: [ASSISTANT_ENTRY] },
    [ASSISTANT_ENTRY]: { file: "assets/assistant.js", imports: [] as string[], isDynamicEntry: true },
  };
}
describe("assistant production lazy boundary", () => {
  it("retains an emitted, reachable assistant without any eager assistant request", () => {
    expect(verifyStudioAssistantBoundary(manifest())).toMatchObject({ initialAssistantRequests: 0, deferredChunks: 1 });
  });
  it.each(["index.html", "src/domains/creator/studio-legacy-editor-adapter.tsx"])("rejects an eager edge from %s", (root) => {
    const input = manifest(); input[root].imports.push(ASSISTANT_ENTRY);
    expect(() => verifyStudioAssistantBoundary(input)).toThrow("leaked");
  });
  it("rejects orphaned and deleted functionality instead of counting it as a saving", () => {
    const input = manifest(); input["src/domains/creator/studio-legacy-editor-adapter.tsx"].dynamicImports = [];
    expect(() => verifyStudioAssistantBoundary(input)).toThrow("reachable");
    delete (input as Record<string, unknown>)[ASSISTANT_ENTRY];
    expect(() => verifyStudioAssistantBoundary(input)).toThrow("dynamic entry");
  });
  it("rejects a broken static dependency", () => {
    const input = manifest(); input[ASSISTANT_ENTRY].imports.push("missing");
    expect(() => verifyStudioAssistantBoundary(input)).toThrow("Missing manifest entry");
  });
});
