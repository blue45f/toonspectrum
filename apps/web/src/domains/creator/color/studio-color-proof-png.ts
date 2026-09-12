import { calculateStudioCrc32 } from "../studio-crc32";

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(data.length + 12); const view = new DataView(result.buffer);
  view.setUint32(0, data.length); result.set(new TextEncoder().encode(type), 4); result.set(data, 8);
  view.setUint32(result.length - 4, calculateStudioCrc32(result.subarray(4, result.length - 4)));
  return result;
}
async function deflate(bytes: Uint8Array<ArrayBuffer>, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  if (typeof CompressionStream !== "function") throw new Error("이 브라우저에서 ICC PNG 압축을 지원하지 않습니다.");
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  signal?.throwIfAborted(); return compressed;
}

/** Encode target-profile samples directly. Passing them through an sRGB Canvas encoder would
 * color-convert target RGB or lose unassociated low-alpha values before the ICC is attached. */
export async function encodeStudioColorProofPng(input: {
  rgba: Uint8ClampedArray; width: number; height: number; profileBytes: Uint8Array; signal?: AbortSignal;
}): Promise<Blob> {
  const { rgba, width, height, profileBytes, signal } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width * height > 16_777_216 || rgba.length !== width * height * 4) throw new Error("ICC PNG 크기가 올바르지 않습니다.");
  const ihdr = new Uint8Array(13); const view = new DataView(ihdr.buffer);
  view.setUint32(0, width); view.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6;
  const rows = new Uint8Array((width * 4 + 1) * height);
  for (let row = 0; row < height; row++) rows.set(rgba.subarray(row * width * 4, (row + 1) * width * 4), row * (width * 4 + 1) + 1);
  const compressedProfile = await deflate(Uint8Array.from(profileBytes), signal);
  // PNG iCCP: Latin-1 profile name, NUL, compression method0, zlib stream. No conflicting sRGB tag.
  const iccp = new Uint8Array(14 + compressedProfile.length);
  iccp.set(new TextEncoder().encode("Studio RGB ICC"));
  const data = new Uint8Array(16 + compressedProfile.length);
  data.set(iccp.subarray(0, 14)); data.set(compressedProfile, 16);
  const idat = await deflate(rows, signal); signal?.throwIfAborted();
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("iCCP", data), chunk("IDAT", idat), chunk("IEND", new Uint8Array())], { type: "image/png" });
}
