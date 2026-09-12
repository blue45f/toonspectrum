/** Decoding admission for the specialist's embedded, opaque base-color PNG profile. */
export class StudioBg3dBabylonTexturePreflightError extends Error {
  constructor(readonly code: "unsafe-glb" | "unsupported-scene-feature" | "resource-budget-exceeded") {
    super(`Studio Babylon texture admission failed: ${code}`);
    this.name = "StudioBg3dBabylonTexturePreflightError";
  }
}

export interface StudioBg3dBabylonTextureBinding {
  readonly pointer: string;
  readonly width: number;
  readonly height: number;
  readonly mipLevels: number;
  readonly maxInstances: number;
}

export interface StudioBg3dBabylonTexturePlan {
  readonly bindings: readonly StudioBg3dBabylonTextureBinding[];
  readonly textureBytes: number;
  readonly textureInstances: number;
  readonly maxDimension: number;
}

const MAX_PNG_EDGE = 2048;
const MAX_DECODED_TEXTURE_BYTES = 256 * 1024 * 1024;
const MAX_TEXTURE_INSTANCES = 256;
const MAX_ENCODED_PNG_BYTES = 64 * 1024 * 1024;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const SUPPORTED_PNG_CHUNKS = new Set(["IHDR", "IDAT", "IEND", "sRGB"]);
const MIN_FILTERS = new Set([9728, 9729, 9984, 9985, 9986, 9987]);
const WRAP_MODES = new Set([33071, 33648, 10497]);
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function fail(code: StudioBg3dBabylonTexturePreflightError["code"]): never {
  throw new StudioBg3dBabylonTexturePreflightError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fail("unsafe-glb");
  return value as Record<string, unknown>;
}

function records(value: unknown): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return fail("unsafe-glb");
  return value.map(record);
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return fail("unsafe-glb");
  return value;
}

function sum(a: number, b: number): number {
  const value = a + b;
  if (!Number.isSafeInteger(value)) return fail("unsafe-glb");
  return value;
}

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]!) & 255]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Inspect encoded bytes without asking an image decoder to allocate its output. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 45 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return fail("unsafe-glb");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let hasData = false;
  let hasSrgb = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return fail("unsafe-glb");
    const length = view.getUint32(offset);
    const end = sum(offset + 12, length);
    if (end > bytes.length) return fail("unsafe-glb");
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!SUPPORTED_PNG_CHUNKS.has(kind)) return fail("unsupported-scene-feature");
    if (crc32(bytes, offset + 4, end - 4) !== view.getUint32(end - 4)) return fail("unsafe-glb");
    if (offset === 8 && kind !== "IHDR") return fail("unsafe-glb");
    if (kind === "IHDR") {
      if (offset !== 8 || length !== 13) return fail("unsafe-glb");
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      if (width < 1 || height < 1) return fail("unsafe-glb");
      if (width > MAX_PNG_EDGE || height > MAX_PNG_EDGE) return fail("resource-budget-exceeded");
      // Palette, grayscale, interlaced, profile-converted and animated PNGs remain explicit
      // unsupported cases until their browser decode/output parity has a native fixture.
      if (bytes[offset + 16] !== 8 || ![2, 6].includes(bytes[offset + 17]!)
        || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0) {
        return fail("unsupported-scene-feature");
      }
    } else if (kind === "sRGB") {
      if (hasData || hasSrgb || length !== 1 || bytes[offset + 8]! > 3) return fail("unsafe-glb");
      hasSrgb = true;
    } else if (kind === "IDAT") {
      hasData ||= length > 0;
    } else if (kind === "IEND") {
      if (length !== 0 || !hasData || end !== bytes.length) return fail("unsafe-glb");
      return { width, height };
    }
    offset = end;
  }
  return fail("unsafe-glb");
}

function binaryChunk(bytes: Uint8Array, root: Record<string, unknown>): Uint8Array {
  const buffers = records(root.buffers);
  if (buffers.length !== 1 || buffers[0]!.uri !== undefined || bytes.byteLength < 28) return fail("unsafe-glb");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const header = sum(20, jsonLength);
  if (jsonLength % 4 !== 0 || header + 8 > bytes.length || view.getUint32(header + 4, true) !== 0x004e4942) {
    return fail("unsafe-glb");
  }
  const length = view.getUint32(header, true);
  const declaredLength = count(buffers[0]!.byteLength);
  if (length % 4 !== 0 || header + 8 + length !== bytes.length
    || declaredLength > length || length - declaredLength > 3) return fail("unsafe-glb");
  return bytes.subarray(header + 8, header + 8 + declaredLength);
}

function mipFootprint(width: number, height: number, mipmapped: boolean) {
  let texels = 0;
  let mipLevels = 0;
  while (width >= 1 && height >= 1) {
    texels += width * height;
    mipLevels += 1;
    if (!mipmapped || (width === 1 && height === 1)) break;
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
  // Match the existing post-parse RGBA32F allocation ceiling, including every mip.
  return { bytes: texels * 16, mipLevels };
}

export function preflightStudioBg3dBabylonTextures(
  bytes: Uint8Array,
  root: Record<string, unknown>,
): StudioBg3dBabylonTexturePlan {
  const images = records(root.images);
  const textures = records(root.textures);
  const empty = { bindings: [], textureBytes: 0, textureInstances: 0, maxDimension: 0 };
  if (images.length === 0 && textures.length === 0) return empty;
  if (images.length === 0 || textures.length === 0) return fail("unsafe-glb");
  const extensions = [root.extensionsUsed ?? [], root.extensionsRequired ?? []].flat();
  if (extensions.some((extension) => extension !== "KHR_materials_unlit")
    || records(root.animations).length > 0 || records(root.skins).length > 0) return fail("unsupported-scene-feature");
  const binary = binaryChunk(bytes, root);
  const views = records(root.bufferViews);
  let encodedImageBytes = 0;
  const sizes = images.map((image) => {
    if (image.uri !== undefined) return fail("unsafe-glb");
    if (image.mimeType !== "image/png" || image.extensions !== undefined) return fail("unsupported-scene-feature");
    const imageView = views[count(image.bufferView)];
    if (!imageView || imageView.buffer !== 0) return fail("unsafe-glb");
    const offset = count(imageView.byteOffset ?? 0);
    const length = count(imageView.byteLength);
    if (length === 0 || sum(offset, length) > binary.length) return fail("unsafe-glb");
    encodedImageBytes = sum(encodedImageBytes, length);
    if (encodedImageBytes > MAX_ENCODED_PNG_BYTES) return fail("resource-budget-exceeded");
    if (imageView.byteStride !== undefined || imageView.extensions !== undefined) return fail("unsupported-scene-feature");
    return pngSize(binary.subarray(offset, offset + length));
  });
  const samplers = records(root.samplers);
  const admittedTextures = textures.map((texture) => {
    if (texture.extensions !== undefined) return fail("unsupported-scene-feature");
    const size = sizes[count(texture.source)];
    if (!size) return fail("unsafe-glb");
    const sampler = texture.sampler === undefined ? {} : samplers[count(texture.sampler)];
    if (!sampler) return fail("unsafe-glb");
    if (sampler.extensions !== undefined) return fail("unsupported-scene-feature");
    const min = sampler.minFilter ?? 9987;
    if (!MIN_FILTERS.has(count(min)) || ![9728, 9729].includes(count(sampler.magFilter ?? 9729))
      || !WRAP_MODES.has(count(sampler.wrapS ?? 10497)) || !WRAP_MODES.has(count(sampler.wrapT ?? 10497))) return fail("unsafe-glb");
    return { ...size, ...mipFootprint(size.width, size.height, min !== 9728 && min !== 9729) };
  });
  const materials = records(root.materials);
  const modes = new Map<number, Set<number>>();
  const accessors = records(root.accessors);
  for (const mesh of records(root.meshes)) {
    for (const primitive of records(mesh.primitives)) {
      if (primitive.targets !== undefined) return fail("unsupported-scene-feature");
      if (primitive.material === undefined) continue;
      const index = count(primitive.material);
      if (!materials[index]) return fail("unsafe-glb");
      const materialModes = modes.get(index) ?? new Set();
      materialModes.add(count(primitive.mode ?? 4));
      modes.set(index, materialModes);
      const material = materials[index]!;
      const pbr = material.pbrMetallicRoughness === undefined ? {} : record(material.pbrMetallicRoughness);
      if (pbr.baseColorTexture !== undefined) {
        const attributes = record(primitive.attributes);
        const uv = accessors[count(attributes.TEXCOORD_0)];
        if (!uv || uv.type !== "VEC2" || uv.componentType !== 5126 || uv.normalized === true) return fail("unsupported-scene-feature");
      }
    }
  }
  const bindings: StudioBg3dBabylonTextureBinding[] = [];
  let textureBytes = 0;
  let textureInstances = 0;
  let maxDimension = 0;
  materials.forEach((material, index) => {
    if ((material.alphaMode ?? "OPAQUE") !== "OPAQUE") return fail("unsupported-scene-feature");
    if (material.normalTexture !== undefined || material.occlusionTexture !== undefined || material.emissiveTexture !== undefined) return fail("unsupported-scene-feature");
    if (material.extensions !== undefined && Object.keys(record(material.extensions)).some((key) => key !== "KHR_materials_unlit")) return fail("unsupported-scene-feature");
    const pbr = material.pbrMetallicRoughness === undefined ? {} : record(material.pbrMetallicRoughness);
    if (pbr.metallicRoughnessTexture !== undefined) return fail("unsupported-scene-feature");
    if (pbr.baseColorTexture === undefined) return;
    const info = record(pbr.baseColorTexture);
    if ((info.texCoord ?? 0) !== 0 || info.extensions !== undefined) return fail("unsupported-scene-feature");
    const texture = admittedTextures[count(info.index)];
    if (!texture) return fail("unsafe-glb");
    const maxInstances = modes.get(index)?.size ?? 0;
    if (maxInstances === 0) return;
    // The installed loader records the extension's unlit texture pointer at the material root.
    const unlit = material.extensions !== undefined && record(material.extensions).KHR_materials_unlit !== undefined;
    bindings.push({ pointer: `/materials/${index}/${unlit ? "" : "pbrMetallicRoughness/"}baseColorTexture`, width: texture.width,
      height: texture.height, mipLevels: texture.mipLevels, maxInstances });
    textureInstances += maxInstances;
    textureBytes += texture.bytes * maxInstances;
    maxDimension = Math.max(maxDimension, texture.width, texture.height);
    if (textureInstances > MAX_TEXTURE_INSTANCES || textureBytes > MAX_DECODED_TEXTURE_BYTES) return fail("resource-budget-exceeded");
  });
  return Object.freeze({ bindings: Object.freeze(bindings), textureBytes, textureInstances, maxDimension });
}
