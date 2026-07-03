// AI 배경 제거 — 100% 브라우저(클라이언트) 실행, 서버·토큰 비용 0원.
// 구글 MediaPipe ImageSegmenter(셀피 세그멘터)로 전경(인물/캐릭터)을 분리해 배경을 투명하게 만든다.
// 모델·WASM 은 CDN 에서 지연 로드(최초 1회)하고 이후 브라우저 캐시를 탄다. 결과는 PNG data URL.
//
// 한계(정직): 셀피 세그멘터는 "사람/인물 사진" 분리에 최적화돼 있다. 실사 인물·캐릭터 사진에 잘 되고,
// 순수 일러스트/오브젝트는 정확도가 떨어질 수 있다(향후 @imgly/background-removal 등 범용 모델로 확장 가능).
import type { ImageSegmenter as ImageSegmenterType } from "@mediapipe/tasks-vision";

const MEDIAPIPE_VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const SELFIE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

let segmenterPromise: Promise<ImageSegmenterType> | null = null;

// 세그멘터를 한 번만 초기화(모델·WASM 다운로드 흡수). GPU 델리게이트 실패 시 호출부에서 처리.
async function getSegmenter(): Promise<ImageSegmenterType> {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_VISION_CDN);
    return ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: SELFIE_MODEL_URL, delegate: "GPU" },
      runningMode: "IMAGE",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  })().catch((err) => {
    segmenterPromise = null; // 실패 시 다음 호출에서 재시도 가능하게.
    throw err;
  });
  return segmenterPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    img.src = src;
  });
}

/**
 * 배경 제거 — src(데이터 URL 등)의 전경만 남기고 배경을 투명하게 한 PNG data URL 을 반환한다.
 * @param src 원본 이미지 URL(업로드 자산은 data URL 이라 CORS 문제 없음)
 * @param opts.feather 알파 경계 부드럽게(0~1, 기본 0 = 원본 신뢰도 그대로)
 */
export async function removeBackground(src: string, opts: { threshold?: number } = {}): Promise<string> {
  const threshold = opts.threshold ?? 0.5;
  const [segmenter, img] = await Promise.all([getSegmenter(), loadImage(src)]);

  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("이미지 크기를 확인할 수 없습니다.");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 만들 수 없습니다.");
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  const result = segmenter.segment(img);
  const masks = result.confidenceMasks;
  if (!masks || masks.length === 0) {
    result.close?.();
    throw new Error("배경을 분리하지 못했습니다.");
  }
  // 마지막 마스크 = 전경(인물) 신뢰도(1개면 그 자체, 2개면 index 1). 마스크 해상도가 이미지와
  // 다를 수 있어 좌표를 정규화해 최근접 샘플링한다.
  const fg = masks[masks.length - 1];
  const mask = fg.getAsFloat32Array();
  const mw = fg.width;
  const mh = fg.height;

  const data = imageData.data;
  for (let y = 0; y < h; y++) {
    const my = Math.min(mh - 1, (y * mh / h) | 0);
    for (let x = 0; x < w; x++) {
      const mx = Math.min(mw - 1, (x * mw / w) | 0);
      const conf = mask[my * mw + mx];
      // 신뢰도를 알파로: threshold 미만은 완전 투명, 이상은 신뢰도 비례(경계 앤티앨리어싱).
      const alpha = conf < threshold ? 0 : conf;
      data[(y * w + x) * 4 + 3] = Math.round(alpha * 255);
    }
  }
  result.close?.();
  masks.forEach((m) => m.close?.());

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}
