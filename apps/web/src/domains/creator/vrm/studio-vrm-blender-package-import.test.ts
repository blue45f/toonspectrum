import { createHash, webcrypto } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { promoZip } from "../promo/promo-zip";

import { prepareBlenderCharacterPackage } from "./studio-vrm-blender-package-import";

afterEach(() => vi.unstubAllGlobals());
function model(options: { vrm?: boolean; uri?: string; meshes?: boolean } = {}): Uint8Array<ArrayBuffer> {
  const json = JSON.stringify({ asset: { version: "2.0" },
    meshes: options.meshes === false ? [] : [{ primitives: [{ attributes: {}, targets: [{}] }] }],
    skins: [{}], animations: [{}],
    ...(options.vrm === false ? {} : { extensions: { VRMC_vrm: { specVersion: "1.0" } } }),
    ...(options.uri ? { images: [{ uri: options.uri }] } : {}),
  });
  const encoded = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, " "));
  const bytes = new Uint8Array(20 + encoded.length); const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, encoded.length, true); view.setUint32(16, 0x4e4f534a, true); bytes.set(encoded, 20);
  return bytes;
}
function manifest(bytes = model(), role: "vrm" | "glb" = "vrm") {
  return { schemaVersion: 1, kind: "toonstudio.character-package", characterId: "test-character", displayName: "수정본",
    pipelineVersion: 1, configDigest: "a".repeat(64),
    quality: { score: 92, passed: true, minimumScore: 86, report: "quality-report.json" },
    capabilities: { authoredHair: { enabled: false, style: null, lodTriangles: [], replacedSourceMeshes: [] },
      semanticFaceShapes: { mode: "none", confidence: 0, objects: [], shapeKeys: [] }, mtoonReady: false, lods: false },
    files: { [role]: { path: `models/character.${role}`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } },
    provenance: { author: "test" },
  };
}
function jsonFile(value: unknown, name = "character-package.json"): File { return new File([JSON.stringify(value)], name); }
function relative(file: File, path: string): File { Object.defineProperty(file, "webkitRelativePath", { value: path }); return file; }
function packageFiles(bytes = model(), role: "vrm" | "glb" = "vrm"): File[] {
  return [jsonFile(manifest(bytes, role)), new File([bytes], `character.${role}`)];
}

describe("local Blender package preflight", () => {
  it("checks a loose selection with real SHA-256 before returning runtime metadata", async () => {
    const result = await prepareBlenderCharacterPackage(packageFiles());
    expect(result).toMatchObject({ meshes: 1, animations: 1, skins: 1, morphTargets: 1, hasVrm: true });
    expect(result.runtimeFile.name).toBe("character.vrm");
  });
  it("resolves nested directory paths relative to the one manifest", async () => {
    const [json, vrm] = packageFiles();
    const result = await prepareBlenderCharacterPackage([relative(json!, "delivery/character-package.json"), relative(vrm!, "delivery/models/character.vrm")]);
    expect(result.asset.role).toBe("vrm");
  });
  it("reads a bounded ZIP without sending any request", async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const bytes = model(); const zip = new Uint8Array(promoZip({ "delivery/character-package.json": JSON.stringify(manifest(bytes)), "delivery/models/character.vrm": bytes }));
    const result = await prepareBlenderCharacterPackage([new File([zip], "delivery.toonchar.zip")]);
    expect(result.hasVrm).toBe(true); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("does not mistake quality-report.json for the package manifest", async () => {
    expect((await prepareBlenderCharacterPackage([jsonFile({ score: 92 }, "quality-report.json"), ...packageFiles()])).manifest.displayName).toBe("수정본");
  });
  it("rejects multiple manifests and duplicate/case-colliding runtime files", async () => {
    await expect(prepareBlenderCharacterPackage([...packageFiles(), jsonFile(manifest())])).rejects.toThrow(/중복/);
    await expect(prepareBlenderCharacterPackage([...packageFiles(), new File([model()], "CHARACTER.VRM")])).rejects.toThrow(/중복/);
  });
  it("does not match a runtime asset in another directory by basename", async () => {
    const [json, vrm] = packageFiles();
    await expect(prepareBlenderCharacterPackage([relative(json!, "delivery/character-package.json"), relative(vrm!, "other/character.vrm")])).rejects.toThrow(/함께 선택/);
  });
  it("rejects unsafe manifest paths", async () => {
    const value = manifest(); value.files.vrm!.path = "../character.vrm";
    await expect(prepareBlenderCharacterPackage([jsonFile(value), packageFiles()[1]!])).rejects.toThrow(/unsafe path/);
  });
  it("rejects a passed flag when the score is below the declared gate", async () => {
    const value = manifest(); value.quality.score = 40;
    await expect(prepareBlenderCharacterPackage([jsonFile(value)])).rejects.toThrow(/quality gate/);
  });
  it("rejects same-size tampering", async () => {
    const bytes = model(); const changed = new Uint8Array(bytes); changed[changed.length - 1] = 0;
    await expect(prepareBlenderCharacterPackage([jsonFile(manifest(bytes)), new File([changed], "character.vrm")])).rejects.toThrow(/SHA-256/);
  });
  it("never downgrades integrity checking when WebCrypto is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    await expect(prepareBlenderCharacterPackage(packageFiles())).rejects.toThrow(/HTTPS/);
  });
  it("can deliberately prefer GLB and identifies missing VRM extensions", async () => {
    const bytes = model({ vrm: false });
    const value = { ...manifest(), files: { ...manifest().files, ...manifest(bytes, "glb").files } };
    const result = await prepareBlenderCharacterPackage([jsonFile(value), new File([bytes], "character.glb")], { prefer: "glb" });
    expect(result).toMatchObject({ asset: { role: "glb" }, hasVrm: false });
  });
  it("rejects a GLB renamed to VRM", async () => {
    await expect(prepareBlenderCharacterPackage(packageFiles(model({ vrm: false })))).rejects.toThrow(/VRM 확장/);
  });
  it("rejects broken headers even when their hashes match", async () => {
    const bytes = model(); new DataView(bytes.buffer).setUint32(8, 100, true);
    await expect(prepareBlenderCharacterPackage(packageFiles(bytes))).rejects.toThrow(/glTF 2.0/);
  });
  it("rejects external resources before a renderer could fetch them", async () => {
    await expect(prepareBlenderCharacterPackage(packageFiles(model({ uri: "https://example.com/texture.png" })))).rejects.toThrow(/외부 텍스처/);
  });
  it("rejects packages with no visible meshes", async () => {
    await expect(prepareBlenderCharacterPackage(packageFiles(model({ meshes: false })))).rejects.toThrow(/메시/);
  });
  it("enforces model limits before reading or allocating large files", async () => {
    const value = manifest(); value.files.vrm!.bytes = 256_000_001;
    const file = new File([], "character.vrm"); Object.defineProperty(file, "size", { value: 256_000_001 });
    const read = vi.spyOn(file, "arrayBuffer");
    await expect(prepareBlenderCharacterPackage([jsonFile(value), file])).rejects.toThrow(/256 MB/);
    expect(read).not.toHaveBeenCalled();
  });
  it("honors cancellation before work and after an asynchronous digest", async () => {
    const early = new AbortController(); early.abort();
    await expect(prepareBlenderCharacterPackage(packageFiles(), { signal: early.signal })).rejects.toThrow();
    const late = new AbortController();
    vi.stubGlobal("crypto", { subtle: { digest: async (...args: Parameters<typeof webcrypto.subtle.digest>) => {
      const result = await webcrypto.subtle.digest(...args); late.abort(); return result;
    } } });
    await expect(prepareBlenderCharacterPackage(packageFiles(), { signal: late.signal })).rejects.toThrow();
  });
  it("rejects mixed archive and loose selections", async () => {
    await expect(prepareBlenderCharacterPackage([new File([], "package.zip"), ...packageFiles()])).rejects.toThrow(/하나만/);
  });
});
