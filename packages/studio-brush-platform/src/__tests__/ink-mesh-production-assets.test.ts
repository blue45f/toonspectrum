import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const loaderSource = readFileSync(
  new URL("../ink-mesh.ts", import.meta.url),
  "utf8",
);
const emscriptenSource = readFileSync(
  new URL("../ink-mesh/ink_mesh.mjs", import.meta.url),
  "utf8",
);
const wasmBytes = readFileSync(
  new URL("../ink-mesh/ink_mesh.wasm", import.meta.url),
);

describe("ink-mesh Vite production assets", () => {
  it("keeps the generated module and binary as separate statically discoverable assets", () => {
    expect(loaderSource).toContain('"./ink-mesh/ink_mesh.mjs"');
    expect(loaderSource).toContain('"./ink-mesh/ink_mesh.wasm"');
    expect(loaderSource).toContain("import(/* @vite-ignore */ href)");
    expect(loaderSource).toContain("locateFile: (path: string, scriptDirectory: string)");
    expect(loaderSource).toContain('path.endsWith(".wasm")');
    expect(loaderSource).toContain("? wasmHref");
  });

  it("pins locateFile-capable Emscripten glue to a real WebAssembly binary", () => {
    expect(emscriptenSource).toContain('if(Module["locateFile"])');
    expect(emscriptenSource).toContain('locateFile("ink_mesh.wasm")');
    expect([...wasmBytes.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
  });
});
