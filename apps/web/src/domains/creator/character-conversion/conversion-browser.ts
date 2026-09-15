import { decodeStudioLift3dFile } from "../lift3d/studio-lift3d-image-decode";
import { sha256HexPortable } from "../studio-sha256";
import { fitSubject, subjectBounds } from "./conversion-raster";
import type { CharacterView, PreparedCharacterImage } from "./conversion-contract";

export function checkConversionAbort(signal: AbortSignal): void { signal.throwIfAborted(); }
export function pngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob) { reject(new Error("PNG를 만들지 못했습니다.")); return; }
    void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
  }, "image/png"));
}
export function rasterCanvas(width: number, height: number, pixels?: Uint8ClampedArray | Uint8Array) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D 캔버스를 사용할 수 없습니다.");
  if (pixels) context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  return { canvas, context };
}
export async function prepareCharacterImage(file: File, view: CharacterView, size: number, signal: AbortSignal, crop = true): Promise<PreparedCharacterImage> {
  if (file.size < 1 || file.size > 16 * 1024 * 1024) throw new Error("원화는 16MiB 이하 PNG·JPEG·WebP를 사용해 주세요.");
  checkConversionAbort(signal);
  const decoded = await decodeStudioLift3dFile(file); checkConversionAbort(signal);
  const bounds = subjectBounds(decoded.source);
  const cropBounds = crop ? bounds : { ...bounds, x: 0, y: 0, width: decoded.source.width, height: decoded.source.height };
  const fit = fitSubject(cropBounds, size);
  const source = rasterCanvas(decoded.source.width, decoded.source.height, decoded.source.pixels);
  const target = rasterCanvas(size, size);
  try {
    target.context.imageSmoothingEnabled = true; target.context.imageSmoothingQuality = "high";
    target.context.drawImage(source.canvas, cropBounds.x, cropBounds.y, cropBounds.width, cropBounds.height, fit.x, fit.y, fit.width, fit.height);
    const png = await pngBytes(target.canvas); checkConversionAbort(signal);
    return { view, png, width: size, height: size, sha256: sha256HexPortable(png), notices: [
      ...(bounds.opaque ? ["불투명 배경은 자동 제거하지 않습니다. 투명 PNG를 사용하면 형태 추정에 유리합니다."] : []),
      ...(Math.min(decoded.naturalWidth, decoded.naturalHeight) < 256 ? ["원화 해상도가 낮습니다. 확대해도 새 디테일이 생기지는 않습니다."] : []),
    ] };
  } finally { source.canvas.width = 0; target.canvas.width = 0; }
}
export async function flattenCharacterPng(bytes: Uint8Array): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  const { canvas, context } = rasterCanvas(bitmap.width, bitmap.height);
  try { context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0); return await pngBytes(canvas); }
  finally { bitmap.close(); canvas.width = 0; }
}
export function downloadConversion(bytes: Uint8Array, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
