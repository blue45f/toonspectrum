import { WebIO } from "@gltf-transform/core";
import { createSpecialistFixture } from "./specialist-fixtures";

export function textureFixtureRgba(
  width: number,
  height: number,
  normal = false,
): Uint8Array<ArrayBuffer> {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const color = normal
        ? [Math.round(((x < width / 2 ? -0.4 : 0.4) + 1) * 127.5), Math.round(((y < height / 2 ? -0.3 : 0.3) + 1) * 127.5), Math.round((Math.sqrt(0.75) + 1) * 127.5), 255]
        : y < height / 2
          ? x < width / 2
            ? [230, 40, 30, 255]
            : [20, 210, 40, 255]
          : x < width / 2
            ? [30, 40, 230, 128]
            : [200, 180, 20, 255];
      data.set(color, (y * width + x) * 4);
    }
  return data;
}
function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
export async function textureFixturePng(
  width = 32,
  height = 32,
  normal = false,
): Promise<Uint8Array<ArrayBuffer>> {
  const pixels = textureFixtureRgba(width, height, normal);
  const rows = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    rows.set(
      pixels.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1,
    );
  const compressed = new Uint8Array(
    await new Response(
      new Blob([rows]).stream().pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer(),
  );
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const chunks = [
    ["IHDR", header],
    ["IDAT", compressed],
    ["IEND", new Uint8Array()],
  ] as const;
  const output = new Uint8Array(
    8 + chunks.reduce((sum, [, bytes]) => sum + bytes.length + 12, 0),
  );
  output.set([137, 80, 78, 71, 13, 10, 26, 10]);
  let cursor = 8;
  for (const [kind, bytes] of chunks) {
    const view = new DataView(output.buffer);
    view.setUint32(cursor, bytes.length);
    output.set(new TextEncoder().encode(kind), cursor + 4);
    output.set(bytes, cursor + 8);
    view.setUint32(
      cursor + 8 + bytes.length,
      crc32(output.subarray(cursor + 4, cursor + 8 + bytes.length)),
    );
    cursor += bytes.length + 12;
  }
  return output;
}
export async function createTexturedSpecialistFixture(
  normal = false,
): Promise<Uint8Array<ArrayBuffer>> {
  const io = new WebIO();
  const document = await io.readBinary(await createSpecialistFixture("sphere"));
  const color = document
    .createTexture("quadrants")
    .setMimeType("image/png")
    .setImage(await textureFixturePng());
  const material = document
    .createMaterial("color")
    .setBaseColorTexture(color)
    .setMetallicFactor(0)
    .setRoughnessFactor(0.7)
    .setAlphaMode("BLEND");
  if (normal)
    material.setNormalTexture(
      document
        .createTexture("normal")
        .setMimeType("image/png")
        .setImage(await textureFixturePng(32, 32, true)),
    );
  document
    .getRoot()
    .listMeshes()[0]!
    .listPrimitives()[0]!
    .setMaterial(material);
  return new Uint8Array(await io.writeBinary(document));
}
