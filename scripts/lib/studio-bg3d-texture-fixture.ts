import { crc32, deflateSync } from "node:zlib";

/** A real, independently encoded PNG + indexed glTF quad for CPU admission and native GPU QA. */
export function createStudioBg3dTextureFixture(options: {
  readonly width?: number;
  readonly height?: number;
  readonly minFilter?: number;
  readonly magFilter?: number;
  readonly wrapS?: number;
  readonly wrapT?: number;
  readonly uvScale?: number;
  readonly unlit?: boolean;
  readonly mutate?: (root: Record<string, unknown>, png: Uint8Array) => void;
} = {}) {
  const width = options.width ?? 4;
  const height = options.height ?? 4;
  const colors = [[240, 32, 80, 255], [32, 192, 240, 128], [48, 216, 80, 0], [160, 96, 224, 255]] as const;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      raw.set(colors[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)]!, y * (width * 4 + 1) + 1 + x * 4);
    }
  }
  function chunk(name: string, payload: Buffer): Buffer {
    const output = Buffer.alloc(payload.length + 12);
    output.writeUInt32BE(payload.length, 0);
    output.write(name, 4, "ascii");
    output.set(payload, 8);
    output.writeUInt32BE(crc32(output.subarray(4, output.length - 4)), output.length - 4);
    return output;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uv = options.uvScale ?? 1;
  const uvs = new Float32Array([0, uv, uv, uv, uv, 0, 0, 0]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const arrays = [positions, normals, uvs, indices];
  let offset = 0;
  const bufferViews = arrays.map((array, index) => {
    const result = { buffer: 0, byteOffset: offset, byteLength: array.byteLength, target: index === 3 ? 34963 : 34962 };
    offset += array.byteLength;
    return result;
  });
  const pngOffset = offset;
  const binaryLength = pngOffset + png.byteLength;
  const unlit = options.unlit !== false;
  const root: Record<string, unknown> = {
    asset: { version: "2.0" },
    ...(unlit ? { extensionsUsed: ["KHR_materials_unlit"] } : {}),
    buffers: [{ byteLength: binaryLength }],
    bufferViews: [...bufferViews, { buffer: 0, byteOffset: pngOffset, byteLength: png.byteLength }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 4, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" },
    ],
    images: [{ bufferView: 4, mimeType: "image/png" }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ minFilter: options.minFilter ?? 9728, magFilter: options.magFilter ?? 9728,
      wrapS: options.wrapS ?? 33071, wrapT: options.wrapT ?? 33071 }],
    materials: [{ alphaMode: "OPAQUE", doubleSided: false,
      ...(unlit ? { extensions: { KHR_materials_unlit: {} } } : {}),
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    nodes: [{ mesh: 0 }], scene: 0, scenes: [{ nodes: [0] }],
  };
  options.mutate?.(root, png);
  const json = Buffer.from(JSON.stringify(root));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const paddedBinaryLength = Math.ceil(binaryLength / 4) * 4;
  const bytes = new Uint8Array(28 + jsonLength + paddedBinaryLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength); bytes.set(json, 20);
  const binaryHeader = 20 + jsonLength;
  view.setUint32(binaryHeader, paddedBinaryLength, true); view.setUint32(binaryHeader + 4, 0x004e4942, true);
  for (const [index, array] of arrays.entries()) bytes.set(new Uint8Array(array.buffer), binaryHeader + 8 + bufferViews[index]!.byteOffset);
  bytes.set(png, binaryHeader + 8 + pngOffset);
  return { bytes, root, colors };
}
