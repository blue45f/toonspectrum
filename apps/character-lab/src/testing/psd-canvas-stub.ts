/**
 * ag-psd Node 테스트용 캔버스 스텁.
 * ag-psd는 썸네일·이미지 디코딩에 Canvas가 필요하지만, 우리는 `imageData`만 쓰므로
 * createCanvas는 throw(무음 대체 금지)하고 createImageData만 순수 객체로 제공한다.
 * export/psd-assemble.test.ts 등에서 `installPsdCanvasStub()`를 한 번 호출한다.
 */
import { initializeCanvas } from "ag-psd";

/** 브라우저 ImageData와 구조가 같은 순수 객체 */
export function createImageDataStub(width: number, height: number): ImageData {
  const stub = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
    colorSpace: "srgb" as const,
  };
  return stub as unknown as ImageData;
}

let installed = false;

/** 멱등. ag-psd에 캔버스 금지 + ImageData 스텁을 등록한다. */
export function installPsdCanvasStub(): void {
  if (installed) return;
  initializeCanvas(
    () => {
      throw new Error("Node 테스트에서는 Canvas를 쓰지 않습니다(imageData 경로만 허용).");
    },
    (width, height) => createImageDataStub(width, height),
  );
  installed = true;
}

/** RGBA 바이트를 ImageData 스텁으로 감싼다(복사). */
export function imageDataFromRgba(width: number, height: number, rgba: Uint8ClampedArray): ImageData {
  const image = createImageDataStub(width, height);
  image.data.set(rgba);
  return image;
}
