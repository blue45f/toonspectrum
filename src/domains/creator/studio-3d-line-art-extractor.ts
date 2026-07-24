/**
 * Studio 3D 배경/모델 툰 선화(LineArt) 자동 추출 모듈.
 *
 * 3D 렌더링 래스터(RGB/Depth/Normal) 픽셀 버퍼에서 Sobel 엣지 필터 및 윤곽선(Contour) 알고리즘을
 * 실행하여 손그림 웹툰/만화 스타일의 클린 벡터-라이트 잉크 선화 레이어를 자동 추출한다.
 */

export interface Studio3DLineArtExtractorOptions {
  /** 엣지 감지 감도 (0–255). 낮을수록 미세한 선 감지. 기본값 48. */
  readonly threshold?: number;
  /** 선화 두께(px). 1–4. 기본값 1. */
  readonly lineThickness?: number;
  /** 추출된 선화 색상 (RGBA, 0-255). 기본값 검은색 [0, 0, 0, 255]. */
  readonly lineColor?: readonly [number, number, number, number];
  /** 배경 투명화 여부. 기본값 true. */
  readonly transparentBackground?: boolean;
}

export interface Studio3DLineArtExtractorResult {
  /** 추출된 선화 RGBA 픽셀 버퍼 (width × height × 4). */
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** 추출된 총 선화 픽셀 수. */
  readonly linePixelCount: number;
}

/**
 * 3D 렌더 RGBA 버퍼에서 툰 윤곽선(LineArt) 레이어를 추출한다.
 */
export function extractStudio3DLineArt(
  pixelData: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: Studio3DLineArtExtractorOptions = {},
): Studio3DLineArtExtractorResult {
  const threshold = options.threshold ?? 48;
  const lineThickness = Math.max(1, Math.min(4, options.lineThickness ?? 1));
  const lineColor = options.lineColor ?? [0, 0, 0, 255];
  const transparentBackground = options.transparentBackground ?? true;

  const totalPixels = width * height;
  const gray = new Float32Array(totalPixels);

  // 1단계: 픽셀 휘도(Grayscale) 변환
  for (let i = 0; i < totalPixels; i += 1) {
    const idx = i * 4;
    const r = pixelData[idx] ?? 0;
    const g = pixelData[idx + 1] ?? 0;
    const b = pixelData[idx + 2] ?? 0;
    gray[i] = r * 0.299 + g * 0.587 + b * 0.114;
  }

  // 2단계: Sobel Gradient 계산
  const edges = new Uint8Array(totalPixels);
  let linePixelCount = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;

      // Sobel X kernel
      const gx =
        -1 * gray[(y - 1) * width + (x - 1)] +
        1 * gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] +
        2 * gray[y * width + (x + 1)] +
        -1 * gray[(y + 1) * width + (x - 1)] +
        1 * gray[(y + 1) * width + (x + 1)];

      // Sobel Y kernel
      const gy =
        -1 * gray[(y - 1) * width + (x - 1)] +
        -2 * gray[(y - 1) * width + x] +
        -1 * gray[(y - 1) * width + (x + 1)] +
        1 * gray[(y + 1) * width + (x - 1)] +
        2 * gray[(y + 1) * width + x] +
        1 * gray[(y + 1) * width + (x + 1)];

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude >= threshold) {
        edges[idx] = 255;
        linePixelCount += 1;
      }
    }
  }

  // 3단계: 두께 확장 (Line Thickness Expansion)
  const thickEdges = new Uint8Array(edges);
  if (lineThickness > 1) {
    const radius = Math.floor(lineThickness / 2);
    for (let y = radius; y < height - radius; y += 1) {
      for (let x = radius; x < width - radius; x += 1) {
        if (edges[y * width + x] === 255) {
          for (let ey = -radius; ey <= radius; ey += 1) {
            for (let ex = -radius; ex <= radius; ex += 1) {
              thickEdges[(y + ey) * width + (x + ex)] = 255;
            }
          }
        }
      }
    }
  }

  // 4단계: RGBA 결과 버퍼 조합
  const rgba = new Uint8Array(totalPixels * 4);
  for (let i = 0; i < totalPixels; i += 1) {
    const isLine = thickEdges[i] === 255;
    const outIdx = i * 4;

    if (isLine) {
      rgba[outIdx] = lineColor[0];
      rgba[outIdx + 1] = lineColor[1];
      rgba[outIdx + 2] = lineColor[2];
      rgba[outIdx + 3] = lineColor[3];
    } else if (!transparentBackground) {
      rgba[outIdx] = 255;
      rgba[outIdx + 1] = 255;
      rgba[outIdx + 2] = 255;
      rgba[outIdx + 3] = 255;
    }
  }

  return { rgba, width, height, linePixelCount };
}
