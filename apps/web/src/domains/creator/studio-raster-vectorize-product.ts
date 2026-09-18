import type { DrawEl, El } from "./studio-element-model";

type StudioVectorizableImage = Extract<El, { type: "image" }>;

const MAX_VECTORIZE_DIMENSION = 1024;
const DEFAULT_INK_LUMA_THRESHOLD = 232;

export interface StudioRasterVectorizeResult {
  readonly elements: readonly DrawEl[];
  readonly contourCount: number;
  readonly holeCount: number;
  readonly sampledWidth: number;
  readonly sampledHeight: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("선택한 이미지를 벡터화용 픽셀로 읽지 못했습니다."));
    image.src = src;
  });
}

function splitPathIntoPolylines(verbs: readonly import("@toonspectrum/studio-project-model").PathVerbIR[]): number[][] {
  const paths: number[][] = [];
  let points: number[] | null = null;
  for (const verb of verbs) {
    if (verb.v === "M") {
      if (points && points.length >= 6) paths.push(points);
      points = [verb.x, verb.y];
      continue;
    }
    if (verb.v === "L" || verb.v === "Q" || verb.v === "C") {
      points?.push(verb.x, verb.y);
      continue;
    }
    if (verb.v === "Z") {
      if (points && points.length >= 6) paths.push(points);
      points = null;
    }
  }
  if (points && points.length >= 6) paths.push(points);
  return paths;
}

function transformPoint(
  px: number,
  py: number,
  sampleWidth: number,
  sampleHeight: number,
  image: StudioVectorizableImage,
): readonly [number, number] {
  let localX = (px / sampleWidth) * image.width;
  let localY = (py / sampleHeight) * image.height;
  if (image.flipped) localX = image.width - localX;
  if (image.flippedY) localY = image.height - localY;
  const centerX = image.width / 2;
  const centerY = image.height / 2;
  const dx = localX - centerX;
  const dy = localY - centerY;
  const angle = (image.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    image.x + centerX + dx * cos - dy * sin,
    image.y + centerY + dx * sin + dy * cos,
  ];
}

export async function vectorizeStudioRasterImage(
  src: string,
  image: StudioVectorizableImage,
): Promise<StudioRasterVectorizeResult> {
  const decoded = await loadImage(src);
  const sourceWidth = Math.max(1, decoded.naturalWidth || Math.round(image.width));
  const sourceHeight = Math.max(1, decoded.naturalHeight || Math.round(image.height));
  const scale = Math.min(1, MAX_VECTORIZE_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("벡터화용 캔버스를 준비하지 못했습니다.");
  context.clearRect(0, 0, width, height);
  context.drawImage(decoded, 0, 0, width, height);
  let pixels: ImageData;
  try {
    pixels = context.getImageData(0, 0, width, height);
  } catch {
    throw new Error("이미지 픽셀에 접근할 수 없습니다. 외부 이미지라면 먼저 편집 가능한 로컬 사본을 만들어 주세요.");
  }
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < pixels.data.length; i += 4, p += 1) {
    const r = pixels.data[i] ?? 255;
    const g = pixels.data[i + 1] ?? 255;
    const b = pixels.data[i + 2] ?? 255;
    const a = pixels.data[i + 3] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    mask[p] = a >= 32 && (luma <= DEFAULT_INK_LUMA_THRESHOLD || a < 245) ? 255 : 0;
  }
  const { maskToPathIR } = await import("./studio-opencv-selection");
  const artifact = await maskToPathIR(mask, width, height, Math.max(1, 1.5 * scale));
  const polylines = splitPathIntoPolylines(artifact.path.verbs);
  const elements = polylines.map((polyline, index): DrawEl => {
    const points: number[] = [];
    for (let cursor = 0; cursor < polyline.length; cursor += 2) {
      const [x, y] = transformPoint(polyline[cursor]!, polyline[cursor + 1]!, width, height, image);
      points.push(x, y);
    }
    return {
      id: `vectorized-${image.id}-${Date.now().toString(36)}-${index}`,
      type: "draw",
      kind: "freehand",
      mode: "pen",
      points,
      stroke: "#111111",
      strokeWidth: Math.max(1, Math.min(image.width / width, image.height / height) * 1.25),
      fill: "transparent",
      opacity: image.opacity ?? 1,
      groupId: image.groupId,
      name: `${image.name?.trim() || "이미지"} · 벡터 외곽선 ${index + 1}`,
    };
  });
  if (elements.length === 0) {
    throw new Error("벡터로 변환할 뚜렷한 외곽선을 찾지 못했습니다. 대비가 더 높은 원본으로 다시 시도해 주세요.");
  }
  return Object.freeze({
    elements: Object.freeze(elements),
    contourCount: artifact.contourCount,
    holeCount: artifact.holeCount,
    sampledWidth: width,
    sampledHeight: height,
  });
}
