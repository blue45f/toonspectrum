import { inspectSpecialistGlbImages } from "./specialist-image-budget";
import { z } from "zod";
import { WebIO, Logger } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { sha256HexPortable } from "../../studio-sha256";
import { SPECIALIST_LIMITS, SpecialistError } from "./specialist-contract";
import type { Document, GLTF } from "@gltf-transform/core";
import type {
  SpecialistArtifact,
  SpecialistStats,
} from "./specialist-contract";

export function sha256(bytes: Uint8Array): string {
  return "sha256:" + sha256HexPortable(bytes);
}
/** Validate all executable/resource references BEFORE any decoder or graph allocation. */
export function preflightSpecialistGlb(bytes: Uint8Array): GLTF.IGLTF {
  const fail = (detail: string): never => {
    throw new SpecialistError("unsupported", detail);
  };
  if (bytes.length < 20 || bytes.length > SPECIALIST_LIMITS.inputBytes)
    fail("Invalid GLB size.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.length
  )
    fail("Expected a self-contained GLB 2.0 file.");
  let offset = 12;
  let json: GLTF.IGLTF | undefined;
  let binBytes = 0;
  let binSeen = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail("Truncated GLB chunk.");
    const size = view.getUint32(offset, true);
    const kind = view.getUint32(offset + 4, true);
    if (size % 4 || offset + 8 + size > bytes.length)
      fail("Invalid GLB chunk size.");
    if (offset === 12 && kind !== 0x4e4f534a) fail("Missing GLB JSON.");
    if (kind === 0x4e4f534a) {
      if (json || size > SPECIALIST_LIMITS.jsonBytes)
        fail("Invalid GLB JSON budget.");
      json = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(offset + 8, offset + 8 + size),
        ),
      ) as GLTF.IGLTF;
    } else if (kind === 0x004e4942) {
      if (binSeen) fail("Duplicate BIN chunk.");
      binSeen = true;
      binBytes = size;
    } else fail("Unknown GLB chunk cannot be preserved.");
    offset += 8 + size;
  }
  if (!json || json.asset?.version !== "2.0") fail("Missing glTF 2.0 asset.");
  const data = json!;
  const supported = new Set(
    ALL_EXTENSIONS.map((extension) => extension.EXTENSION_NAME),
  );
  supported.delete("KHR_draco_mesh_compression");
  // Unknown/VRM extensions must never be silently stripped by glTF Transform.
  const pending: { value: unknown; depth: number }[] = [
    { value: data, depth: 0 },
  ];
  let visited = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++visited > 1_000_000 || depth > 64)
      fail("JSON traversal budget exceeded.");
    if (typeof value === "number" && !Number.isFinite(value))
      fail("Non-finite JSON numbers are not allowed.");
    if (!value || typeof value !== "object") continue;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "uri")
        fail(
          "External or data URI resources are not allowed. Embed resources as GLB bufferViews.",
        );
      if (key === "extensions" && entry && typeof entry === "object") {
        for (const name of Object.keys(entry))
          if (!supported.has(name)) fail("Unsupported extension: " + name);
      }
      if (key === "extensionsUsed" || key === "extensionsRequired") {
        if (
          !Array.isArray(entry) ||
          entry.some((name) => typeof name !== "string" || !supported.has(name))
        )
          fail("Unsupported or malformed extension declaration.");
      }
      pending.push({ value: entry, depth: depth + 1 });
    }
  }
  for (const key of [
    "nodes",
    "meshes",
    "accessors",
    "bufferViews",
    "buffers",
    "animations",
    "skins",
    "images",
    "materials",
  ] as const) {
    if (
      data[key] !== undefined &&
      (!Array.isArray(data[key]) || data[key]!.length > 16384)
    )
      fail("Invalid glTF table: " + key);
  }
  if (
    (data.nodes?.length ?? 0) > SPECIALIST_LIMITS.nodes ||
    (data.buffers?.length ?? 0) > 32
  )
    fail("Graph budget exceeded.");
  let allocation = 0;
  for (const [index, buffer] of (data.buffers ?? []).entries()) {
    const fallback =
      (
        buffer.extensions?.EXT_meshopt_compression as
          | { fallback?: unknown }
          | undefined
      )?.fallback === true;
    if (!Number.isSafeInteger(buffer.byteLength) || buffer.byteLength < 0)
      fail("Invalid buffer length.");
    if (index === 0 && (fallback || buffer.byteLength > binBytes))
      fail("Invalid primary BIN buffer.");
    if (index > 0 && !fallback)
      fail("Only explicit meshopt fallback buffers can omit binary data.");
    allocation += buffer.byteLength;
  }
  for (const accessor of data.accessors ?? []) {
    const size = (
      {
        SCALAR: 1,
        VEC2: 2,
        VEC3: 3,
        VEC4: 4,
        MAT2: 4,
        MAT3: 9,
        MAT4: 16,
      } as const
    )[accessor.type];
    if (
      !size ||
      !Number.isSafeInteger(accessor.count) ||
      accessor.count < 0 ||
      accessor.count > 8_000_000
    )
      fail("Invalid accessor count.");
    allocation += accessor.count * size * 4;
  }
  for (const bv of data.bufferViews ?? []) {
    if (
      !Number.isSafeInteger(bv.byteLength) ||
      bv.byteLength < 0 ||
      !Number.isSafeInteger(bv.byteOffset ?? 0) ||
      (bv.byteOffset ?? 0) < 0
    )
      fail("Invalid bufferView range.");
    const buffer = data.buffers?.[bv.buffer];
    if (!buffer || (bv.byteOffset ?? 0) + bv.byteLength > buffer.byteLength)
      fail("BufferView exceeds its buffer.");
    const compressed = bv.extensions?.EXT_meshopt_compression;
    if (compressed) {
      const ext = z
        .object({
          buffer: z.number().int().nonnegative(),
          byteOffset: z.number().int().nonnegative().default(0),
          byteLength: z.number().int().nonnegative(),
          byteStride: z.number().int().min(1).max(256),
          count: z.number().int().nonnegative(),
          mode: z.enum(["ATTRIBUTES", "TRIANGLES", "INDICES"]),
          filter: z
            .enum(["NONE", "OCTAHEDRAL", "QUATERNION", "EXPONENTIAL"])
            .optional(),
        })
        .parse(compressed);
      if (
        ext.buffer !== 0 ||
        ext.byteOffset + ext.byteLength > binBytes ||
        ext.count * ext.byteStride !== bv.byteLength
      )
        fail("Invalid compressed buffer view.");
    }
    allocation += bv.byteLength;
  }
  if (allocation > SPECIALIST_LIMITS.decodedBytes)
    fail("Decoded buffer budget exceeded.");
  for (const node of data.nodes ?? []) {
    for (const [key, count] of [
      ["translation", 3],
      ["rotation", 4],
      ["scale", 3],
      ["matrix", 16],
    ] as const) {
      const vector = node[key];
      if (
        vector !== undefined &&
        (!Array.isArray(vector) ||
          vector.length !== count ||
          vector.some((n) => typeof n !== "number" || !Number.isFinite(n)))
      )
        fail("Invalid node transform.");
    }
    if (
      node.name !== undefined &&
      (typeof node.name !== "string" || node.name.length > 256)
    )
      fail("Node names must be strings up to 256 characters.");
  }
  const parents = new Set<number>();
  for (const node of data.nodes ?? [])
    for (const child of node.children ?? []) {
      if (parents.has(child)) fail("A glTF node cannot have multiple parents.");
      parents.add(child);
    }
  const seen = new Set<number>();
  const active = new Set<number>();
  function visitNode(id: number, depth: number): void {
    if (
      !Number.isSafeInteger(id) ||
      id < 0 ||
      id >= (data.nodes?.length ?? 0) ||
      depth > 256 ||
      active.has(id)
    )
      fail("Invalid or cyclic node graph.");
    if (seen.has(id)) return;
    active.add(id);
    for (const child of data.nodes?.[id]?.children ?? [])
      visitNode(child, depth + 1);
    active.delete(id);
    seen.add(id);
  }
  for (let id = 0; id < (data.nodes?.length ?? 0); id++) visitNode(id, 0);
  inspectSpecialistGlbImages(bytes, data);
  return data;
}
export async function createSpecialistIo(): Promise<WebIO> {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  // Keep the encoder compatible with the pinned Three/BG3D decoder; do not emit v1 by accident.
  const encoder = {
    ...MeshoptEncoder,
    encodeGltfBuffer: (
      bytes: Uint8Array,
      count: number,
      stride: number,
      mode: string,
    ) => MeshoptEncoder.encodeGltfBuffer(bytes, count, stride, mode, 0),
  };
  return new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": encoder,
    })
    .setStrictResources(true)
    .setLogger(new Logger(Logger.Verbosity.ERROR));
}
export async function readSpecialistDocument(
  io: WebIO,
  bytes: Uint8Array,
): Promise<Document> {
  preflightSpecialistGlb(bytes);
  const document = await io.readBinary(bytes);
  for (const accessor of document.getRoot().listAccessors()) {
    const array = accessor.getArray();
    if (
      array instanceof Float32Array &&
      array.some((value) => !Number.isFinite(value))
    ) {
      throw new SpecialistError(
        "invalid-input",
        "Non-finite accessor values cannot be processed.",
      );
    }
  }
  return document;
}
export function specialistStats(document: Document): SpecialistStats {
  const root = document.getRoot();
  let triangles = 0;
  let vertices = 0;
  let tangentPrimitives = 0;
  for (const mesh of root.listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getAttribute("POSITION")?.getCount() ?? 0;
      vertices += count;
      if (primitive.getMode() === 4)
        triangles += Math.floor(
          (primitive.getIndices()?.getCount() ?? count) / 3,
        );
      if (primitive.getAttribute("TANGENT")) tangentPrimitives++;
    }
  if (
    vertices > SPECIALIST_LIMITS.vertices ||
    triangles > SPECIALIST_LIMITS.triangles
  )
    throw new SpecialistError("budget", "Geometry budget exceeded.");
  return {
    triangles,
    vertices,
    nodes: root.listNodes().length,
    animations: root.listAnimations().length,
    animationKeys: root
      .listAnimations()
      .reduce(
        (sum, animation) =>
          sum +
          animation
            .listSamplers()
            .reduce(
              (n, sampler) => n + (sampler.getInput()?.getCount() ?? 0),
              0,
            ),
        0,
      ),
    tangentPrimitives,
  };
}
export function requireStatic(document: Document): void {
  const root = document.getRoot();
  if (
    root.listSkins().length ||
    root.listAnimations().length ||
    root
      .listMeshes()
      .some((mesh) => mesh.listPrimitives().some((p) => p.listTargets().length))
  ) {
    throw new SpecialistError(
      "unsupported",
      "Static meshes only: skin, morph and animation must remain in their dedicated authoring path.",
    );
  }
}
export async function glbArtifact(
  io: WebIO,
  document: Document,
  name: string,
): Promise<SpecialistArtifact> {
  const stats = specialistStats(document);
  const bytes = new Uint8Array(await io.writeBinary(document));
  if (bytes.length > SPECIALIST_LIMITS.outputBytes)
    throw new SpecialistError("budget", "Output budget exceeded.");
  // Do not report success until a real encode/decode round trip works.
  preflightSpecialistGlb(bytes);
  specialistStats(await io.readBinary(bytes));
  return {
    name,
    mime: "model/gltf-binary",
    bytes,
    sha256: sha256(bytes),
    stats,
  };
}
