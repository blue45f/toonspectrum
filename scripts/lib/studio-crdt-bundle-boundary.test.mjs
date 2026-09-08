import { describe, expect, it } from "vitest";

import { isStudioCrdtRuntimeEntry } from "./studio-crdt-bundle-boundary.mjs";

const constants = {
  name: "studio-crdt-document-constants",
  file: "assets/studio-crdt-document-constants-Dm6BKGPB.js",
};

describe("Studio CRDT emitted bundle boundary", () => {
  it("admits the dependency-free data chunk split out by the production build", () => {
    expect(isStudioCrdtRuntimeEntry("_studio-crdt-document-constants-Dm6BKGPB.js", constants)).toBe(false);
  });

  it.each([
    ["src/domains/creator/live/studio-crdt-document.ts", { file: "assets/opaque.js" }],
    ["_studio-crdt-room-binding-HASH.js", { file: "assets/opaque.js" }],
    ["node_modules/.pnpm/yjs@13.6.31/node_modules/yjs/dist/yjs.mjs", { file: "assets/opaque.js" }],
    ["_opaque.js", { file: "assets/studio-crdt-document-HASH.js" }],
    ["_opaque.js", { src: "src/domains/creator/live/studio-crdt-document.ts", file: "assets/opaque.js" }],
    ["_studio-crdt-document-payload-HASH.js", { file: "assets/studio-crdt-document-payload-HASH.js" }],
  ])("rejects a CRDT runtime identified through %s", (key, entry) => {
    expect(isStudioCrdtRuntimeEntry(key, entry)).toBe(true);
  });

  it("does not let a constants label disguise the real document entry", () => {
    expect(isStudioCrdtRuntimeEntry("src/domains/creator/live/studio-crdt-document.ts", constants)).toBe(true);
  });

  it.each([
    { imports: ["_yjs-HASH.js"] },
    { dynamicImports: ["src/domains/creator/live/studio-crdt-document.ts"] },
    { src: "src/domains/creator/live/studio-crdt-document.ts" },
    { file: "assets/studio-crdt-document-HASH.js" },
    { name: "studio-crdt-document" },
  ])("keeps the constants exception closed when its emitted graph changes: %j", (change) => {
    expect(isStudioCrdtRuntimeEntry("_studio-crdt-document-constants-HASH.js", { ...constants, ...change })).toBe(true);
  });
});
