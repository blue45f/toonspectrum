// 파일 없이 바로 체험할 수 있는 샘플 공간 웹툰.
// 모션 웹툰 샘플 컷(내장 SVG 아트)을 캔버스에서 JPEG로 바꿔 공간 웹툰 형식(PNG·JPEG·WebP만 허용)에 맞춘다.
// 네트워크 요청이나 업로드 없이 이 브라우저에서만 만든다. 제목에 "예시"를 붙여 실제 작품과 구분한다.
import { SAMPLE_CUT_IMAGE_URIS } from "../motion-webtoon/motion-webtoon-sample-art";

import { parseSpatialBook, type SpatialBook } from "./spatial-book";

const SAMPLE_WIDTH = 600;
const SAMPLE_HEIGHT = 800;
const SAMPLE_JPEG_QUALITY = 0.88;
const SAMPLE_SECONDS_PER_PANEL = 6;

export interface SpatialSampleCopy {
  readonly bookTitle: string;
  readonly panels: readonly { readonly title: string; readonly caption: string; readonly alt: string }[];
}

/** 샘플 컷 3장에 대응하는 기본 문구(고백·위기·축하). 화면 언어에 맞춰 호출자가 바꿔 넘길 수 있다. */
export const SPATIAL_SAMPLE_COPY_KO: SpatialSampleCopy = {
  bookTitle: "샘플 공간 웹툰 · 예시",
  panels: [
    { title: "고백", caption: "두근거려… 오늘은 고백하는 날이야.", alt: "노을 진 언덕 위, 하트를 사이에 두고 선 두 사람의 실루엣" },
    { title: "위기", caption: "조심해! 뒤에 뭔가 있어!", alt: "밤거리의 속도선 사이로 달리는 인물 실루엣" },
    { title: "축하", caption: "정말 행복해! 우리가 해냈어!", alt: "아침 해와 무지개 아래 두 팔을 들어 올린 두 사람" },
  ],
};

async function rasterizeSvgDataUri(uri: string, signal?: AbortSignal): Promise<string> {
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("샘플 컷을 그리지 못했어요."));
    image.src = uri;
  });
  if (signal?.aborted) throw new DOMException("취소했어요.", "AbortError");
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_WIDTH;
  canvas.height = SAMPLE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("이 브라우저는 이미지 처리를 지원하지 않아요.");
  context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  return canvas.toDataURL("image/jpeg", SAMPLE_JPEG_QUALITY);
}

/** 샘플 공간 웹툰을 만든다. 결과는 파일로 연 작품과 같은 검증(parseSpatialBook)을 통과한다. */
export async function createSampleSpatialBook(
  copy: SpatialSampleCopy = SPATIAL_SAMPLE_COPY_KO,
  signal?: AbortSignal,
): Promise<SpatialBook> {
  const panels = await Promise.all(
    copy.panels.map(async (panelCopy, index) => {
      const uri = SAMPLE_CUT_IMAGE_URIS[index % SAMPLE_CUT_IMAGE_URIS.length];
      if (!uri) throw new Error("샘플 컷을 찾지 못했어요.");
      return {
        id: `sample-${index + 1}`,
        title: panelCopy.title,
        caption: panelCopy.caption,
        alt: panelCopy.alt,
        src: await rasterizeSvgDataUri(uri, signal),
        seconds: SAMPLE_SECONDS_PER_PANEL,
        layers: [],
      };
    }),
  );
  return parseSpatialBook({
    format: "toonstudio-spatial-book",
    version: 1,
    id: "toonstudio-spatial-sample",
    title: copy.bookTitle,
    panels,
  });
}
