import { describe, expect, it } from "vitest";

import { resolveStudioProductionGltfLoaderExport } from "./studio-production-gltf-loader.mjs";

class Loader {
  parse() {} parseAsync() {} setDRACOLoader() {} setKTX2Loader() {} setMeshoptDecoder() {} register() {} unregister() {}
}
describe("production GLTFLoader export contract", () => {
  it("uses canonical and minified exports without hard-coded alias guesses", async () => {
    expect(await resolveStudioProductionGltfLoaderExport({ GLTFLoader: Loader })).toBe("GLTFLoader");
    expect(await resolveStudioProductionGltfLoaderExport({ n: class Parser {}, t: Loader })).toBe("t");
  });
  it("deduplicates aliases of the same constructor, preferring the public name", async () => {
    expect(await resolveStudioProductionGltfLoaderExport({ t: Loader, GLTFLoader: Loader })).toBe("GLTFLoader");
  });
  it("fails closed for missing or incomplete loader contracts", async () => {
    await expect(resolveStudioProductionGltfLoaderExport({ GLTFLoader: class { parseAsync() {} } })).rejects.toThrow("found 0");
    await expect(resolveStudioProductionGltfLoaderExport({})).rejects.toThrow("found 0");
  });
  it("rejects ambiguous distinct constructors rather than selecting the first", async () => {
    await expect(resolveStudioProductionGltfLoaderExport({ a: Loader, b: class Other extends Loader {} })).rejects.toThrow("found 2");
  });
});
