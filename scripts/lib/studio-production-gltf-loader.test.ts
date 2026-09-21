import { describe, expect, it } from "vitest";

import { resolveStudioProductionGltfLoaderExport } from "./studio-production-gltf-loader.mjs";

const implementation = `class Decoder { load() {} parse() {} parseAsync() {} setDRACOLoader() {} setKTX2Loader() {} setMeshoptDecoder() {} register() {} unregister() {} }`;
const sourceUrl = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;

describe("production GLTFLoader export resolution", () => {
  it("resolves renamed exports without constructing candidates", async () => {
    const source = implementation.replace("class Decoder {", 'class Decoder { constructor() { throw new Error("must not instantiate during selection"); }');
    expect(await resolveStudioProductionGltfLoaderExport(sourceUrl(`${source}; export { Decoder as t }; export const n = null;`))).toBe("t");
  });
  it("supports a public named export and aliases of the same implementation", async () => {
    expect(await resolveStudioProductionGltfLoaderExport(sourceUrl(`${implementation}; export { Decoder as t, Decoder as GLTFLoader };`))).toBe("GLTFLoader");
  });
  it("rejects unrelated and incomplete constructors instead of choosing the first function", async () => {
    await expect(resolveStudioProductionGltfLoaderExport(sourceUrl("export class GLTFLoader { parseAsync() {} }"))).rejects.toThrow("found 0");
  });
  it("rejects ambiguous implementations", async () => {
    await expect(resolveStudioProductionGltfLoaderExport(sourceUrl(`${implementation}; export { Decoder as a }; export class Other extends Decoder {}`))).rejects.toThrow("found 2");
  });
  it("preserves missing/broken module errors", async () => {
    await expect(resolveStudioProductionGltfLoaderExport(sourceUrl('throw new Error("module failed");'))).rejects.toThrow("module failed");
  });
});
