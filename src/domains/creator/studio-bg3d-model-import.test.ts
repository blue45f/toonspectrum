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

import type { Bg3dModelUploadSource } from "./bg3d-model-library";
import type { Mesh } from "three";

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

function concatBytes(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function littleEndianUint16(value: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function littleEndianUint32(value: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function littleEndianFloat32(value: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setFloat32(0, value, true);
  return bytes;
}

function nullTerminatedAscii(value: string): Uint8Array<ArrayBuffer> {
  return concatBytes([new TextEncoder().encode(value), new Uint8Array([0])]);
}

function tdsChunk(id: number, ...payload: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const body = concatBytes(payload);
  return concatBytes([
    littleEndianUint16(id),
    littleEndianUint32(body.byteLength + 6),
    body,
  ]);
}

/** A generated, public-domain-by-construction 3DS triangle containing no vendor asset bytes. */
function minimal3dsTriangle(): Uint8Array<ArrayBuffer> {
  const points = tdsChunk(
    0x4110,
    littleEndianUint16(3),
    littleEndianFloat32(0), littleEndianFloat32(0), littleEndianFloat32(0),
    littleEndianFloat32(1), littleEndianFloat32(0), littleEndianFloat32(0),
    littleEndianFloat32(0), littleEndianFloat32(1), littleEndianFloat32(0),
  );
  const faces = tdsChunk(
    0x4120,
    littleEndianUint16(1),
    littleEndianUint16(0),
    littleEndianUint16(1),
    littleEndianUint16(2),
    littleEndianUint16(0),
  );
  const triangleObject = tdsChunk(0x4100, points, faces);
  const namedObject = tdsChunk(0x4000, nullTerminatedAscii("Triangle"), triangleObject);
  const meshData = tdsChunk(0x3d3d, namedObject);
  const version = tdsChunk(0x0002, littleEndianUint32(3));
  return tdsChunk(0x4d4d, version, meshData);
}

async function expectCanonicalTriangleGlb(
  converted: Bg3dModelUploadSource,
  expectedName: string,
): Promise<void> {
  const buffer = await converted.arrayBuffer();
  const view = new DataView(buffer);

  expect(converted).toMatchObject({
    name: expectedName,
    type: "model/gltf-binary",
    size: buffer.byteLength,
  });
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(buffer.byteLength);

  const jsonChunkLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(0x4e4f534a);
  const jsonChunkEnd = 20 + jsonChunkLength;
  expect(jsonChunkEnd + 8).toBeLessThanOrEqual(buffer.byteLength);
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, jsonChunkLength)).trim(),
  ) as {
    accessors?: Array<{ count?: number; type?: string }>;
    asset?: { version?: string };
    buffers?: unknown[];
    meshes?: Array<{
      primitives?: Array<{ attributes?: { POSITION?: number } }>;
    }>;
    nodes?: unknown[];
    scenes?: unknown[];
  };
  expect(json).toMatchObject({ asset: { version: "2.0" } });
  expect(json.buffers?.length).toBeGreaterThanOrEqual(1);
  expect(json.meshes?.length).toBeGreaterThanOrEqual(1);
  expect(json.nodes?.length).toBeGreaterThanOrEqual(1);
  expect(json.scenes?.length).toBeGreaterThanOrEqual(1);
  const binChunkLength = view.getUint32(jsonChunkEnd, true);
  expect(binChunkLength).toBeGreaterThan(0);
  expect(view.getUint32(jsonChunkEnd + 4, true)).toBe(0x004e4942);
  expect(jsonChunkEnd + 8 + binChunkLength).toBe(buffer.byteLength);
  const positionAccessorIndex = json.meshes?.[0]?.primitives?.[0]?.attributes?.POSITION;
  expect(positionAccessorIndex).toEqual(expect.any(Number));
  expect(json.accessors?.[positionAccessorIndex ?? -1]).toMatchObject({
    count: 3,
    type: "VEC3",
  });

  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  const meshes: Mesh[] = [];
  gltf.scene.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  expect(meshes.length).toBeGreaterThanOrEqual(1);
  expect(meshes.reduce(
    (total, mesh) => total + (mesh.geometry.getAttribute("position")?.count ?? 0),
    0,
  )).toBeGreaterThanOrEqual(3);
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      material.dispose();
    }
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

    for (const extension of [
      "KHR_draco_mesh_compression",
      "EXT_meshopt_compression",
      "KHR_meshopt_compression",
    ]) {
      await expect(convertStudioBg3dModelFilesToGlb([
        gltf({ extensionsRequired: [extension] }),
      ])).rejects.toMatchObject({ code: "unsupported-extension" });
    }
  });

  it("rejects optional, undeclared, and malformed Meshopt buffer views before Three parses them", async () => {
    const gltf = (extensionPayload: unknown, extension = "EXT_meshopt_compression") => sourceFile(
      "scene.gltf",
      JSON.stringify({
        asset: { version: "2.0" },
        scenes: [{ nodes: [] }],
        scene: 0,
        bufferViews: [{
          buffer: 0,
          byteLength: 4,
          extensions: { [extension]: extensionPayload },
        }],
      }),
    );

    for (const file of [
      gltf({
        buffer: 0,
        byteOffset: 0,
        byteLength: 1,
        byteStride: 4,
        count: 1,
        mode: "ATTRIBUTES",
      }),
      gltf(null),
      gltf({}, "KHR_meshopt_compression"),
    ]) {
      const stages: string[] = [];
      await expect(convertStudioBg3dModelFilesToGlb([file], {
        onProgress: ({ stage }) => stages.push(stage),
      })).rejects.toMatchObject({ code: "unsupported-extension" });
      expect(stages).toEqual(["planning", "reading", "parsing"]);
    }
  });

  it("rejects malformed glTF extension and buffer-view containers at the JSON boundary", async () => {
    const gltf = (root: object) => sourceFile("scene.gltf", JSON.stringify({
      asset: { version: "2.0" },
      scenes: [{ nodes: [] }],
      scene: 0,
      ...root,
    }));

    for (const file of [
      gltf({ extensionsRequired: {} }),
      gltf({ bufferViews: {} }),
      gltf({ bufferViews: [{ extensions: [] }] }),
    ]) {
      await expect(convertStudioBg3dModelFilesToGlb([file])).rejects.toMatchObject({
        code: "parse-failed",
      });
    }
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

  it("preserves a selected companion MTL material while canonicalizing OBJ to GLB", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const obj = sourceFile("triangle.obj", [
      "mtllib triangle.mtl",
      "o triangle",
      "v 0 0 0",
      "v 1 0 0",
      "v 0 1 0",
      "usemtl webtoon-red",
      "f 1 2 3",
    ].join("\n"));
    const mtl = sourceFile("triangle.mtl", [
      "newmtl webtoon-red",
      "Kd 1 0 0",
    ].join("\n"));

    const [converted] = await convertStudioBg3dModelFilesToGlb([obj, mtl]);
    const buffer = await converted.arrayBuffer();
    const view = new DataView(buffer);
    const jsonChunkLength = view.getUint32(12, true);
    const jsonChunkType = view.getUint32(16, true);
    const json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(buffer, 20, jsonChunkLength)).trim(),
    ) as {
      materials?: Array<{
        name?: string;
        pbrMetallicRoughness?: { baseColorFactor?: number[] };
      }>;
    };

    expect(jsonChunkType).toBe(0x4e4f534a);
    expect(json.materials).toContainEqual(expect.objectContaining({
      name: "webtoon-red",
      pbrMetallicRoughness: expect.objectContaining({
        baseColorFactor: [1, 0, 0, 1],
      }),
    }));
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

  it("parses a generated ASCII FBX mesh and reloads its canonical GLB with Three", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const fbx = sourceFile("triangle.fbx", [
      "; FBX 7.4.0 project file",
      "FBXHeaderExtension:  {",
      "\tFBXHeaderVersion: 1003",
      "\tFBXVersion: 7400",
      "}",
      "Objects:  {",
      "\tGeometry: 1, \"Geometry::Triangle\", \"Mesh\" {",
      "\t\tVertices: *9 {",
      "\t\t\ta: 0,0,0,1,0,0,0,1,0",
      "\t\t}",
      "\t\tPolygonVertexIndex: *3 {",
      "\t\t\ta: 0,1,-3",
      "\t\t}",
      "\t}",
      "\tModel: 2, \"Model::Triangle\", \"Mesh\" {",
      "\t\tVersion: 232",
      "\t}",
      "}",
      "Connections:  {",
      "\tC: \"OO\",1,2",
      "\tC: \"OO\",2,0",
      "}",
    ].join("\n"));

    const [converted] = await convertStudioBg3dModelFilesToGlb([fbx]);

    await expectCanonicalTriangleGlb(converted, "triangle.glb");
  });

  it("parses a generated Collada mesh and reloads its canonical GLB with Three", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const { createRequire } = await import("node:module");
    const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
      JSDOM: new () => {
        window: {
          DOMParser: typeof DOMParser;
          close(): void;
        };
      };
    };
    const dom = new JSDOM();
    vi.stubGlobal("DOMParser", dom.window.DOMParser);
    const dae = sourceFile("triangle.dae", [
      "<?xml version=\"1.0\" encoding=\"utf-8\"?>",
      "<COLLADA xmlns=\"http://www.collada.org/2005/11/COLLADASchema\" version=\"1.4.1\">",
      "  <asset>",
      "    <created>2026-01-01T00:00:00Z</created>",
      "    <modified>2026-01-01T00:00:00Z</modified>",
      "    <unit meter=\"1\" name=\"meter\"/>",
      "    <up_axis>Y_UP</up_axis>",
      "  </asset>",
      "  <library_geometries>",
      "    <geometry id=\"triangle-geometry\" name=\"Triangle\">",
      "      <mesh>",
      "        <source id=\"triangle-positions\">",
      "          <float_array id=\"triangle-positions-array\" count=\"9\">0 0 0 1 0 0 0 1 0</float_array>",
      "          <technique_common>",
      "            <accessor source=\"#triangle-positions-array\" count=\"3\" stride=\"3\">",
      "              <param name=\"X\" type=\"float\"/><param name=\"Y\" type=\"float\"/><param name=\"Z\" type=\"float\"/>",
      "            </accessor>",
      "          </technique_common>",
      "        </source>",
      "        <vertices id=\"triangle-vertices\"><input semantic=\"POSITION\" source=\"#triangle-positions\"/></vertices>",
      "        <triangles count=\"1\"><input semantic=\"VERTEX\" source=\"#triangle-vertices\" offset=\"0\"/><p>0 1 2</p></triangles>",
      "      </mesh>",
      "    </geometry>",
      "  </library_geometries>",
      "  <library_visual_scenes>",
      "    <visual_scene id=\"Scene\" name=\"Scene\"><node id=\"Triangle\" name=\"Triangle\"><instance_geometry url=\"#triangle-geometry\"/></node></visual_scene>",
      "  </library_visual_scenes>",
      "  <scene><instance_visual_scene url=\"#Scene\"/></scene>",
      "</COLLADA>",
    ].join("\n"));

    try {
      const [converted] = await convertStudioBg3dModelFilesToGlb([dae]);
      await expectCanonicalTriangleGlb(converted, "triangle.glb");
    } finally {
      dom.window.close();
    }
  });

  it("parses a generated ASCII PLY face and reloads its canonical GLB with Three", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const ply = sourceFile("triangle.ply", [
      "ply",
      "format ascii 1.0",
      "comment generated triangle fixture",
      "element vertex 3",
      "property float x",
      "property float y",
      "property float z",
      "element face 1",
      "property list uchar int vertex_indices",
      "end_header",
      "0 0 0",
      "1 0 0",
      "0 1 0",
      "3 0 1 2",
    ].join("\n"));

    const [converted] = await convertStudioBg3dModelFilesToGlb([ply]);

    await expectCanonicalTriangleGlb(converted, "triangle.glb");
  });

  it("parses a generated binary 3DS mesh and reloads its canonical GLB with Three", async () => {
    vi.stubGlobal("FileReader", TestFileReader);
    const tds = sourceFile("triangle.3ds", minimal3dsTriangle());

    const [converted] = await convertStudioBg3dModelFilesToGlb([tds]);

    await expectCanonicalTriangleGlb(converted, "triangle.glb");
  });
});
