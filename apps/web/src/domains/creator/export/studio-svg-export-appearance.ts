import { encodeStudioLosslessCanvasSource } from "../studio-lossless-canvas-source";

export interface StudioSvgAppearanceExportResult {
  readonly svg: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

/**
 * 기존 문서 캡처를 무손실 PNG 그대로 담는다. 벡터 변환이 아니라 사용자가 고른 별도
 * 출력이며, 캡처의 해상도·알파·브러시 질감을 다시 샘플링하거나 단순화하지 않는다.
 */
export async function exportStudioAppearanceSvg(
  canvas: Pick<HTMLCanvasElement, "width" | "height" | "toDataURL">
    & Partial<Pick<HTMLCanvasElement, "toBlob">>,
  signal?: AbortSignal,
): Promise<StudioSvgAppearanceExportResult> {
  const { width, height } = canvas;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("외관 보존 SVG를 만들 원고의 픽셀 크기가 올바르지 않아요.");
  }
  const png = await encodeStudioLosslessCanvasSource(canvas, signal);
  const prefix = "data:image/png;base64,";
  if (!png.startsWith(prefix) || !/^[A-Za-z0-9+/]+={0,2}$/u.test(png.slice(prefix.length))) {
    throw new Error("외관 보존 SVG에 담을 무손실 PNG를 확인하지 못했어요.");
  }
  // PNG 헤더만 읽으므로 큰 원고의 픽셀 바이트를 JS 메모리에 한 번 더 복제하지 않는다.
  const header = Uint8Array.from(atob(png.slice(prefix.length, prefix.length + 44)), (char) => char.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    header.length < 33
    || signature.some((value, index) => header[index] !== value)
    || String.fromCharCode(...header.subarray(12, 16)) !== "IHDR"
  ) {
    throw new Error("외관 보존 SVG의 PNG 헤더가 올바르지 않아요.");
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (view.getUint32(8, false) !== 13 || view.getUint32(16, false) !== width || view.getUint32(20, false) !== height) {
    throw new Error("캡처와 PNG의 크기가 달라 외관 보존 SVG 저장을 중단했어요.");
  }
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
      + `<title>원고 외관 보존 · 무손실 PNG</title>`
      + `<desc>현재 내보내기 해상도의 원고 픽셀을 보존합니다. 획과 글자는 벡터로 편집할 수 없습니다.</desc>`
      + `<image width="${width}" height="${height}" href="${png}"/>`
      + `</svg>`,
    pixelWidth: width,
    pixelHeight: height,
  };
}
