import { describe, expect, it } from "vitest";

import {
  createUploadedBg3dModelRecord,
  detectBg3dModelFormat,
  getDeletableModelIds,
  SAMPLE_BG3D_MODEL_ENTRIES,
  SAMPLE_BG3D_MODELS,
  withDefaultBg3dModelEntry,
} from "./bg3d-model-library";

describe("bg3d-model-library", () => {
  it("detectBg3dModelFormat recognizes glb/gltf/obj case-insensitively and trims surrounding whitespace", () => {
    expect(detectBg3dModelFormat("house.glb")).toBe("glb");
    expect(detectBg3dModelFormat("House.GLB")).toBe("glb");
    expect(detectBg3dModelFormat("scene.gltf")).toBe("gltf");
    expect(detectBg3dModelFormat("Scene.GlTf")).toBe("gltf");
    expect(detectBg3dModelFormat("prop.obj")).toBe("obj");
    expect(detectBg3dModelFormat("  prop.OBJ  ")).toBe("obj");
  });

  it("detectBg3dModelFormat returns null for unsupported or missing extensions", () => {
    expect(detectBg3dModelFormat("model.fbx")).toBeNull();
    expect(detectBg3dModelFormat("model.skp")).toBeNull();
    expect(detectBg3dModelFormat("no-extension")).toBeNull();
    expect(detectBg3dModelFormat("")).toBeNull();
    // 확장자가 파일명 중간에 있으면(진짜 확장자가 아니면) 매치하지 않아야 한다.
    expect(detectBg3dModelFormat("glb.notes.txt")).toBeNull();
  });

  it("ships with an empty bundled sample list (no bundled 3D background models in v1)", () => {
    expect(SAMPLE_BG3D_MODELS).toEqual([]);
    expect(SAMPLE_BG3D_MODEL_ENTRIES).toEqual([]);
  });

  it("normalizes uploaded model names, strips the extension, and captures format + blob", () => {
    const file = new File(["glb-bytes"], "Cozy Cafe Exterior.glb", { type: "model/gltf-binary" });
    const record = createUploadedBg3dModelRecord(file, "fixed-id", 42);

    expect(record).toMatchObject({
      id: "fixed-id",
      name: "Cozy Cafe Exterior",
      format: "glb",
      createdAt: 42,
      updatedAt: 42,
      thumbnail: null,
    });
    expect(record.blob).toBe(file);
  });

  it("falls back to a generic name when the filename is only an extension", () => {
    const file = new File(["obj-bytes"], ".obj", { type: "text/plain" });
    const record = createUploadedBg3dModelRecord(file, "fixed-id-2", 7);
    expect(record.name).toBe("3D 모델");
    expect(record.format).toBe("obj");
  });

  it("rejects files with an unrecognized extension with a clear Korean error", () => {
    const file = new File(["skp-bytes"], "building.skp", { type: "application/octet-stream" });
    expect(() => createUploadedBg3dModelRecord(file, "fixed-id-3", 1)).toThrow(/glb·gltf·obj/);
  });

  it("withDefaultBg3dModelEntry lists uploaded entries newest-first with no bundled samples to prepend", () => {
    const entries = withDefaultBg3dModelEntry([
      { id: "old", name: "Old Building", format: "glb", blob: new Blob(["a"]), createdAt: 1, updatedAt: 1, thumbnail: null },
      { id: "new", name: "New Building", format: "obj", blob: new Blob(["b"]), createdAt: 2, updatedAt: 2, thumbnail: null },
    ]);

    expect(entries).toEqual([
      { id: "new", name: "New Building", format: "obj", source: "indexed-db", thumbnail: null, createdAt: 2, updatedAt: 2 },
      { id: "old", name: "Old Building", format: "glb", source: "indexed-db", thumbnail: null, createdAt: 1, updatedAt: 1 },
    ]);
  });

  it("getDeletableModelIds only returns indexed-db sourced entry ids", () => {
    const deletableIds = getDeletableModelIds([
      { id: "sample-1", name: "Sample Prop", format: "glb", source: "sample", thumbnail: null, createdAt: 0, updatedAt: 0 },
      { id: "upload-1", name: "My Building", format: "obj", source: "indexed-db", thumbnail: null, createdAt: 1, updatedAt: 1 },
    ]);

    expect(deletableIds).toEqual(["upload-1"]);
  });
});
