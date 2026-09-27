import { readFileSync } from "node:fs";

/**
 * 이미지의 declared 규격이 실제 파일 규격과 같은지 확인한다.
 *
 * `sips`는 macOS 전용 바이너리라 CI(ubuntu)에서 ENOENT로 터진다. 그래서 헤더를
 * 직접 읽어 크기를 얻는다. WebP(VP8/VP8L/VP8X)와 JPEG(SOFn)만 지원하며
 * 새 의존성을 늘리지 않기 위한 의도적인 제한이다.
 */
export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

function readWebpSize(bytes: Buffer): ImageSize {
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    // 손실 lossy: 3바이트 frame tag 뒤 0x9d012a sync, 그다음 14비트씩 폭/높이.
    const offset = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    if (offset < 0) throw new Error("VP8 sync code not found");
    return { width: bytes.readUInt16LE(offset + 3) & 0x3fff, height: bytes.readUInt16LE(offset + 5) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // 손실 없는: 0x2f signature 뒤 14비트씩 (값+1).
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    // 확장: 4바이트 플래그 뒤 캔버스 폭/높이가 각각 24비트 (값+1).
    const width = (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)) + 1;
    const height = (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)) + 1;
    return { width, height };
  }
  throw new Error(`unsupported WebP chunk: ${chunk}`);
}

function readJpegSize(bytes: Buffer): ImageSize {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1]!;
    // SOF0..SOF15 중 C4(C4=DHT), C8(JPG), CC(SOF55)는 프레임 헤더가 아니다.
    const isFrameHeader = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrameHeader) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  throw new Error("JPEG SOF marker not found");
}

export function imageSizeOf(absolutePath: string): ImageSize {
  const bytes = readFileSync(absolutePath);
  if (bytes.length < 30) throw new Error(`file too small to be an image: ${absolutePath}`);
  const isRiff = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (isRiff) return readWebpSize(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpegSize(bytes);
  throw new Error(`unsupported image container: ${absolutePath}`);
}
