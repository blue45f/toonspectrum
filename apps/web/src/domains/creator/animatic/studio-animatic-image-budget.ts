/** Inspect PNG dimensions before the browser allocates a decoded bitmap for imported media. */
export function studioAnimaticPngDecodedBytes(bytes: Uint8Array, remainingBytes: number): number {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 33 || signature.some((value, index) => bytes[index] !== value)
    || bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) {
    throw new Error("스토리보드 이미지의 PNG 헤더가 올바르지 않습니다.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13) throw new Error("스토리보드 이미지의 PNG 헤더 길이가 올바르지 않습니다.");
  const width = view.getUint32(16), height = view.getUint32(20);
  const decodedBytes = width * height * 4;
  if (width < 1 || height < 1 || width > 16384 || height > 100000
    || !Number.isSafeInteger(decodedBytes) || decodedBytes > remainingBytes) {
    throw new Error("미리보기에 필요한 이미지가 메모리 한도를 넘습니다. 이미지 크기나 보관한 버전 수를 줄여주세요.");
  }
  return decodedBytes;
}
