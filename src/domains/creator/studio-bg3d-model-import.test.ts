import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_IMPORT_MAX_FILE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_FILES,
  STUDIO_BG3D_IMPORT_MAX_OUTPUT_TOTAL_BYTES,
  StudioBg3dModelImportError,
  convertStudioBg3dModelFilesToGlb,
  planStudioBg3dModelImports,
  type StudioBg3dImportFile,
} from "./studio-bg3d-model-import";

function sourceFile(
  name: string,
  contents: BlobPart | Uint8Array<ArrayBufferLike> = new Uint8Array([1]),
  relativePath = "",
): StudioBg3dImportFile {
  const blobPart: BlobPart = contents instanceof Uint8Array
    ? new Uint8Array(contents).buffer
    : contents;
  const blob = new Blob([blobPart]);
  Object.defineProperties(blob, {
    name: { configurable: false, enumerable: true, value: name },
    webkitRelativePath: { configurable: false, enumerable: true, value: relativePath },
  });
  return blob as StudioBg3dImportFile;
}

function virtualFile(
  name: string,
  size: number,
  arrayBuffer: () => Promise<ArrayBuffer> = async () => new ArrayBuffer(Math.min(size, 1)),
): StudioBg3dImportFile {
  return {
    name,
    size,
    type: "",
    arrayBuffer,
  } as StudioBg3dImportFile;
}

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

class TestFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then(
      (buffer) => {
        this.result = buffer;
        this.onloadend?.();
      },
      () => this.onerror?.(),
    );
  }

  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then(
      (buffer) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onloadend?.();
      },
      () => this.onerror?.(),
    );
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("planStudioBg3dModelImports", () => {
  it("plans all standard primary formats while retaining bounded companion resources", () => {
    const files = [
      sourceFile("room.gltf", "{}", "set/room.gltf"),
      sourceFile("room.bin", new Uint8Array([1, 2]), "set/room.bin"),
      sourceFile("albedo.png", new Uint8Array([3]), "set/textures/albedo.png"),
      sourceFile("chair.obj", "v 0 0 0", "set/chair.obj"),
      sourceFile("chair.mtl", "newmtl material", "set/chair.mtl"),
      sourceFile("actor.fbx", new Uint8Array([4]), "set/actor.fbx"),
      sourceFile("prop.glb", new Uint8Array([5]), "set/prop.glb"),
      sourceFile("legacy.dae", "<COLLADA />", "set/legacy.dae"),
      sourceFile("scan.stl", "solid scan", "set/scan.stl"),
      sourceFile("cloud.ply", "ply", "set/cloud.ply"),
      sourceFile("archive.3ds", new Uint8Array([6]), "set/archive.3ds"),
      sourceFile("LICENSE.txt", "license", "set/LICENSE.txt"),
    ];

    const plan = planStudioBg3dModelImports(files);

    expect(plan.items.map(({ format, primaryPath }) => [format, primaryPath])).toEqual([
      ["gltf", "set/room.gltf"],
      ["obj", "set/chair.obj"],
      ["fbx", "set/actor.fbx"],
      ["glb", "set/prop.glb"],
      ["dae", "set/legacy.dae"],
      ["stl", "set/scan.stl"],
      ["ply", "set/cloud.ply"],
      ["3ds", "set/archive.3ds"],
    ]);
    expect([...plan.resources.keys()]).toEqual([
      "set/room.gltf",
      "set/room.bin",
      "set/textures/albedo.png",
      "set/chair.obj",
      "set/chair.mtl",
      "set/actor.fbx",
      "set/prop.glb",
      "set/legacy.dae",
      "set/scan.stl",
      "set/cloud.ply",
      "set/archive.3ds",
    ]);
    expect(plan.ignoredFiles).toEqual(["set/LICENSE.txt"]);
    expect(plan.totalBytes).toBe(
      files.filter((file) => file.name !== "LICENSE.txt").reduce((sum, file) => sum + file.size, 0),
    );
  });

  it("ignores empty or oversized unrelated directory files without charging import bytes", () => {
    const model = sourceFile("room.glb", new Uint8Array([1]), "set/room.glb");
    const emptyReadme = virtualFile("README.md", 0);
    const hugeLicense = virtualFile("LICENSE.txt", STUDIO_BG3D_IMPORT_MAX_FILE_BYTES + 1);

    const plan = planStudioBg3dModelImports([model, emptyReadme, hugeLicense]);

    expect(plan.items).toHaveLength(1);
    expect(plan.ignoredFiles).toEqual(["README.md", "LICENSE.txt"]);
    expect(plan.totalBytes).toBe(model.size);
  });

  it("rejects case-folded collisions and traversal paths before reading bytes", () => {
    expect(() => planStudioBg3dModelImports([
      sourceFile("model.glb", new Uint8Array([1]), "Assets/Model.glb"),
      sourceFile("model.glb", new Uint8Array([2]), "assets/model.glb"),
    ])).toThrowError(expect.objectContaining<Partial<StudioBg3dModelImportError>>({
      code: "duplicate-resource",
    }));

    expect(() => planStudioBg3dModelImports([
      sourceFile("model.gltf", "{}", "models/../model.gltf"),
    ])).toThrowError(expect.objectContaining<Partial<StudioBg3dModelImportError>>({
      code: "invalid-path",
    }));
  });

  it("enforces file-count and per-file byte limits before materializing content", () => {
    const tooMany = Array.from(
      { length: STUDIO_BG3D_IMPORT_MAX_FILES + 1 },
      (_, index) => virtualFile(`model-${index}.glb`, 1),
    );
    expect(() => planStudioBg3dModelImports(tooMany)).toThrowError(
      expect.objectContaining({ code: "too-many-files" }),
    );
    expect(() => planStudioBg3dModelImports([
      virtualFile("huge.glb", STUDIO_BG3D_IMPORT_MAX_FILE_BYTES + 1),
    ])).toThrowError(expect.objectContaining({ code: "file-too-large" }));
  });
});

describe("convertStudioBg3dModelFilesToGlb", () => {
  it("passes GLB through to the existing validation boundary and reports deterministic progress", async () => {
    const file = sourceFile("prop.glb", new Uint8Array([1, 2, 3, 4]));
    const progress = vi.fn();

    const converted = await convertStudioBg3dModelFilesToGlb([file], { onProgress: progress });

    expect(converted).toEqual([file]);
    expect(progress.mock.calls.map(([event]) => event)).toEqual([
      { stage: "planning", completedModels: 0, totalModels: 1, sourceName: "" },
      { stage: "reading", completedModels: 0, totalModels: 1, sourceName: "prop.glb" },
      { stage: "ready", completedModels: 1, totalModels: 1, sourceName: "prop.glb" },
    ]);
  });

  it("rejects network references, missing local resources, and unsupported required extensions", async () => {
    const gltf = (root: object) => sourceFile("scene.gltf", JSON.stringify({
      asset: { version: "2.0" },
      scenes: [{ nodes: [] }],
      scene: 0,
      ...root,
    }));

    await expect(convertStudioBg3dModelFilesToGlb([
      gltf({ buffers: [{ byteLength: 4, uri: "https://example.com/model.bin" }] }),
    ])).rejects.toMatchObject({ code: "unsafe-resource-uri" });

    await expect(convertStudioBg3dModelFilesToGlb([
      gltf({ buffers: [{ byteLength: 4, uri: "model.bin" }] }),
    ])).rejects.toMatchObject({ code: "missing-resource" });

    await expect(convertStudioBg3dModelFilesToGlb([
      gltf({ extensionsRequired: ["KHR_draco_mesh_compression"] }),
    ])).rejects.toMatchObject({ code: "unsupported-extension" });
  });

  it("honors cancellation before files are read", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(convertStudioBg3dModelFilesToGlb([
      sourceFile("prop.glb", new Uint8Array([1, 2, 3, 4])),
    ], { signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
  });

  it("rejects oversized or cumulatively explosive companion textures before Three decodes them", async () => {
    const obj = sourceFile("triangle.obj", [
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3",
    ].join("\n"));
    await expect(convertStudioBg3dModelFilesToGlb([
      obj,
      sourceFile("oversized.png", pngHeader(8_193, 1)),
    ])).rejects.toMatchObject({ code: "image-dimension-too-large" });

    await expect(convertStudioBg3dModelFilesToGlb([
      obj,
      sourceFile("texture-a.png", pngHeader(6_000, 6_000)),
      sourceFile("texture-b.png", pngHeader(6_000, 6_000)),
    ])).rejects.toMatchObject({ code: "image-memory-too-large" });
  });

  it("caps cumulative GLB output at the downstream library default without reading pass-through files", async () => {
    const overHalf = Math.floor(STUDIO_BG3D_IMPORT_MAX_OUTPUT_TOTAL_BYTES / 2) + 1;
    const firstRead = vi.fn(async () => new ArrayBuffer(1));
    const secondRead = vi.fn(async () => new ArrayBuffer(1));
    const first = virtualFile("first.glb", overHalf, firstRead);
    const second = virtualFile("second.glb", overHalf, secondRead);

    await expect(convertStudioBg3dModelFilesToGlb([first, second])).rejects.toMatchObject({
      code: "output-total-too-large",
    });
    expect(firstRead).not.toHaveBeenCalled();
    expect(secondRead).not.toHaveBeenCalled();
  });

  it("observes cancellation immediately after an in-flight source read settles", async () => {
    const controller = new AbortController();
    let resolveRead: ((buffer: ArrayBuffer) => void) | undefined;
    const arrayBuffer = vi.fn(() => new Promise<ArrayBuffer>((resolve) => {
      resolveRead = resolve;
    }));
    const file = sourceFile("delayed.gltf", new Uint8Array([0x7b, 0x7d]));
    Object.defineProperty(file, "arrayBuffer", { value: arrayBuffer });
    const pending = convertStudioBg3dModelFilesToGlb([file], { signal: controller.signal });
    const observed = pending.catch((error: unknown) => error);

    await vi.waitFor(() => expect(arrayBuffer).toHaveBeenCalledOnce());
    controller.abort();
    resolveRead?.(new Uint8Array([0x7b, 0x7d]).buffer);

    await expect(observed).resolves.toMatchObject({ code: "aborted" });
    expect(arrayBuffer).toHaveBeenCalledOnce();
  });

  it("cancels at the parse-to-export boundary before materializing output", async () => {
    const controller = new AbortController();
    const stages: string[] = [];
    const obj = sourceFile("cancel-before-export.obj", [
      "o triangle",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3",
    ].join("\n"));

    const pending = convertStudioBg3dModelFilesToGlb([obj], {
      signal: controller.signal,
      onProgress(progress) {
        stages.push(progress.stage);
        if (progress.stage === "exporting") controller.abort();
      },
    });

    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect(stages).toEqual(["planning", "reading", "parsing", "exporting"]);
  });

  it("does not resolve a batch when cancellation is requested from the final ready callback", async () => {
    const controller = new AbortController();
    const file = sourceFile("ready.glb", new Uint8Array([1, 2, 3, 4]));

    const pending = convertStudioBg3dModelFilesToGlb([file], {
      signal: controller.signal,
      onProgress(progress) {
        if (progress.stage === "ready") controller.abort();
      },
    });

    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });

  it("converts a real OBJ mesh into a self-contained GLB container", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const obj = sourceFile("triangle.obj", [
      "o triangle",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "f 1 2 3",
    ].join("\n"));

    const [converted] = await convertStudioBg3dModelFilesToGlb([obj]);
    const buffer = await converted.arrayBuffer();
    const view = new DataView(buffer);

    expect(converted).toMatchObject({
      name: "triangle.glb",
      type: "model/gltf-binary",
      size: buffer.byteLength,
    });
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(buffer.byteLength);
  });

  it("embeds an inline glTF buffer into the canonical GLB output", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    vi.stubGlobal("ProgressEvent", class {
      readonly lengthComputable: boolean;
      readonly loaded: number;
      readonly total: number;
      readonly type: string;

      constructor(type: string, init: { lengthComputable?: boolean; loaded?: number; total?: number } = {}) {
        this.type = type;
        this.lengthComputable = init.lengthComputable ?? false;
        this.loaded = init.loaded ?? 0;
        this.total = init.total ?? 0;
      }
    });
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]);
    const uri = `data:application/octet-stream;base64,${Buffer.from(positions.buffer).toString("base64")}`;
    const gltf = sourceFile("inline.gltf", JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ byteLength: positions.byteLength, uri }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
      accessors: [{
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    }));

    const [converted] = await convertStudioBg3dModelFilesToGlb([gltf]);
    const buffer = await converted.arrayBuffer();

    expect(converted.name).toBe("inline.glb");
    expect(new DataView(buffer).getUint32(0, true)).toBe(0x46546c67);
  });

  it("resolves companion resources relative to the primary model before same-named root files", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    vi.stubGlobal("ProgressEvent", class {
      readonly lengthComputable = false;
      readonly loaded = 0;
      readonly total = 0;
      readonly type: string;

      constructor(type: string) {
        this.type = type;
      }
    });
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]);
    const gltf = sourceFile("scene.gltf", JSON.stringify({
      asset: { version: "2.0" },
      buffers: [{ byteLength: positions.byteLength, uri: "data.bin" }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
      accessors: [{
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }],
      scenes: [{ nodes: [0] }],
      scene: 0,
    }), "models/scene.gltf");
    const wrongRootResource = sourceFile("data.bin", new Uint8Array(4), "data.bin");
    const correctSiblingResource = sourceFile(
      "data.bin",
      new Uint8Array(positions.buffer),
      "models/data.bin",
    );

    const [converted] = await convertStudioBg3dModelFilesToGlb([
      gltf,
      wrongRootResource,
      correctSiblingResource,
    ]);

    expect(converted.name).toBe("scene.glb");
    expect(new DataView(await converted.arrayBuffer()).getUint32(0, true)).toBe(0x46546c67);
  });

  it("converts a real ASCII STL mesh through the same canonical GLB boundary", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const stl = sourceFile("triangle.stl", [
      "solid triangle",
      "facet normal 0 0 1",
      "outer loop",
      "vertex 0 0 0",
      "vertex 1 0 0",
      "vertex 0 1 0",
      "endloop",
      "endfacet",
      "endsolid triangle",
    ].join("\n"));

    const [converted] = await convertStudioBg3dModelFilesToGlb([stl]);
    const buffer = await converted.arrayBuffer();

    expect(converted.name).toBe("triangle.glb");
    expect(new DataView(buffer).getUint32(0, true)).toBe(0x46546c67);
  });
});
