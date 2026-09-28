import { STUDIO_VIRTUAL_CUSTOM_FURNITURE_EDGE } from "@toonstudio/contracts/studio-virtual-custom-furniture-contract";

/**
 * 업로드 원본을 렌더에 쓸 정사각 PNG로 다시 인코딩한다.
 *
 * 왜 다시 인코딩하는가: 원본은 EXIF와 색상 프로파일을 품고 있다. 그대로 저장하면
 * 브라우저마다 다른 색이 나오고, 위치 정보가 남는다. 디코드한 뒤 다시 인코딩하면
 * 메타데이터가 함께 떨어지고, 최대 변 길이도 여기서 256으로 고정된다.
 *
 * JPEG에는 알파가 없으므로 아예 받지 않는다(계약 단계에서 거름). WebP 알파는
 * 유지되도록 PNG로 출력한다.
 */
export interface StudioVirtualFurnitureReencode {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export type StudioVirtualFurnitureReencodeResult =
  | { readonly ok: true; readonly value: StudioVirtualFurnitureReencode }
  | { readonly ok: false; readonly error: string };

export async function reencodeStudioVirtualFurniture(
  bytes: Uint8Array,
  edge = STUDIO_VIRTUAL_CUSTOM_FURNITURE_EDGE,
): Promise<StudioVirtualFurnitureReencodeResult> {
  if (!Number.isInteger(edge) || edge < 16 || edge > 1024) {
    return { ok: false, error: "가구 크기 설정이 올바르지 않아요." };
  }

  const imageJs = await import("image-js");
  const source = Buffer.from(bytes);

  let image: { width: number; height: number };
  try {
    image = imageJs.decode(source);
  } catch {
    return { ok: false, error: "이미지를 읽지 못했어요." };
  }

  // 정사각이 아니면 긴 변을 256에 맞추고 짧은 변은 그 비율로 줄인다. 늘리지는 않는다.
  const longest = Math.max(image.width, image.height);
  const scale = longest > edge ? edge / longest : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  try {
    const scaled = scale === 1
      ? image
      : imageJs.resize(image as never, { width, height });
    const encoded = imageJs.encode(scaled as never, { format: "png" });
    return { ok: true, value: { bytes: new Uint8Array(encoded), width, height } };
  } catch {
    return { ok: false, error: "가구를 변환하지 못했어요." };
  }
}
