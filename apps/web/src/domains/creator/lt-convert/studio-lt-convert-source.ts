/**
 * LT 변환 소스 수집 헬퍼 (DOM 의존).
 *
 * 3D 뷰 캡처가 아직 연결되지 않은 호스트를 위해 이미지 파일을
 * 엔진 입력 형태(`ImageData`)로 디코딩하는 대체 경로를 제공한다.
 * 순수 변환 로직은 `studio-lt-convert.ts`에 있다.
 */
import {
  STUDIO_LT_CONVERT_MAX_PIXELS,
  StudioLtConvertError,
} from "./studio-lt-convert";

/** 파일 소스의 긴 변 상한(px). 예산 초과 전에 미리 축소한다. */
export const STUDIO_LT_CONVERT_SOURCE_MAX_EDGE = 2048 as const;

/**
 * 이미지 파일을 LT 변환 입력 크기로 디코딩한다.
 *
 * @throws {StudioLtConvertError} 디코딩 실패·예산 초과 시 발생.
 */
export async function decodeStudioLtSourceFile(
  file: File,
): Promise<ImageData> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    throw new StudioLtConvertError(
      "invalid-input",
      "이 환경에서는 이미지 파일을 읽을 수 없습니다.",
    );
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new StudioLtConvertError(
      "invalid-input",
      "이미지 파일을 읽지 못했습니다.",
      { cause: error },
    );
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!Number.isFinite(longest) || longest < 1) {
      throw new StudioLtConvertError(
        "invalid-input",
        "이미지 크기를 확인할 수 없습니다.",
      );
    }
    const scale = longest > STUDIO_LT_CONVERT_SOURCE_MAX_EDGE
      ? STUDIO_LT_CONVERT_SOURCE_MAX_EDGE / longest
      : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (width * height > STUDIO_LT_CONVERT_MAX_PIXELS) {
      throw new StudioLtConvertError(
        "budget-exceeded",
        "이미지가 LT 변환 예산을 초과합니다.",
      );
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new StudioLtConvertError(
        "invalid-input",
        "이미지를 그릴 캔버스를 만들지 못했습니다.",
      );
    }
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    bitmap.close();
  }
}
