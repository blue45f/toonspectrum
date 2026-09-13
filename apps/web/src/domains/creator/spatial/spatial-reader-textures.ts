import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import { resolveSpatialReaderImageSource, spatialReaderTextureSize } from "./spatial-reader-model";
import type { SpatialReaderCrop } from "./spatial-reader-model";

interface ImageEntry { image: HTMLImageElement; promise: Promise<HTMLImageElement>; cancel: () => void }
/** Three decoded sources maximum, including pending loads. */
export class SpatialReaderImagePool {
  private readonly entries = new Map<string, ImageEntry>();
  private disposed = false;
  load(source: string): Promise<HTMLImageElement> {
    if (this.disposed) return Promise.reject(new Error("리더가 닫혔습니다."));
    // Share the 2D reader boundary: use the validated URL for both the DOM sink and cache.
    const imageSource = resolveSpatialReaderImageSource(source, document.baseURI);
    if (!imageSource) return Promise.reject(new Error("이 이미지 주소는 공간 리더에서 사용할 수 없습니다."));
    const cached = this.entries.get(imageSource);
    if (cached) { this.entries.delete(imageSource); this.entries.set(imageSource, cached); return cached.promise; }
    while (this.entries.size >= 3) {
      const key = this.entries.keys().next().value!;
      this.entries.get(key)!.cancel(); this.entries.delete(key);
    }
    const image = new Image();
    image.crossOrigin = "anonymous"; image.referrerPolicy = "no-referrer"; image.decoding = "async";
    let cancel = () => {};
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true; clearTimeout(timer); image.onload = null; image.onerror = null;
        if (error) { image.removeAttribute("src"); reject(error); } else resolve(image);
      };
      const timer = setTimeout(() => finish(new Error("이미지 요청 시간이 초과됐습니다. 원본 읽기로 돌아가거나 다시 시도해 주세요.")), 12000);
      cancel = () => { finish(new DOMException("Image released", "AbortError")); image.removeAttribute("src"); };
      image.onload = () => {
        if (image.naturalWidth <= 0 || image.naturalHeight <= 0 || image.naturalWidth > 65536 || image.naturalHeight > 65536 || image.naturalWidth * image.naturalHeight > 64_000_000) {
          finish(new Error("이미지 해상도가 너무 크거나 올바르지 않습니다. 6,400만 픽셀 이하로 나눠 주세요."));
        } else finish();
      };
      image.onerror = () => finish(new Error("이미지를 공간 화면에 올리지 못했습니다. 네트워크·이미지 CORS 권한을 확인해 주세요. 2D 원본 보기는 계속 이용할 수 있습니다."));
      image.src = imageSource;
    });
    this.entries.set(imageSource, { image, promise, cancel });
    void promise.catch(() => { if (this.entries.get(imageSource)?.promise === promise) this.entries.delete(imageSource); });
    return promise;
  }
  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.cancel();
    this.entries.clear();
  }
}
export function makeSpatialReaderTexture(image: HTMLImageElement, crop: SpatialReaderCrop, edge: number): CanvasTexture {
  const size = spatialReaderTextureSize(crop, edge);
  const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지용 2D 캔버스를 만들지 못했습니다.");
  ctx.drawImage(image, 0, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false; texture.minFilter = LinearFilter; texture.magFilter = LinearFilter;
  return texture;
}
export function makeSpatialReaderLabel(text: string, active = false): CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("공간 조작 안내를 만들지 못했습니다.");
  ctx.fillStyle = active ? "#19695c" : "#16212d"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = active ? "#96ffe1" : "#64788b"; ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  ctx.fillStyle = "#ffffff"; ctx.font = "600 44px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text.slice(0, 80), 320, 80, 600);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace; texture.generateMipmaps = false; texture.minFilter = LinearFilter;
  return texture;
}
export function releaseSpatialReaderTexture(texture: CanvasTexture | null): void {
  if (!texture) return;
  texture.dispose(); const canvas = texture.image as HTMLCanvasElement; canvas.width = 1; canvas.height = 1;
}
