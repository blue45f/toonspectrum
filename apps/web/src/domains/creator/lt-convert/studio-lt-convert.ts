/**
 * LT 변환(선화 + 톤 분리) 이미지 파이프라인.
 *
 * Clip Studio Paint의 LT 변환을 벤치마킹한 기능으로, 3D 뷰 렌더 캡처나 이미지
 * 레이어 픽셀(`ImageData`)을 입력받아 두 개의 레이어로 분리한다.
 *
 * - 선화 레이어: 휘도 → 가우시안 블러 → Sobel 엣지 → 임계값 → 팽창(dilation).
 *   검은색 선(RGB 0) + 투명 배경으로 출력된다.
 * - 톤 레이어: 휘도 → `toneDensity` 단계 포스터라이즈 양자화.
 *   `screentone`이 꺼져 있으면 불투명 회색조, 켜져 있으면 도트 스크린톤
 *   (검은 도트 + 투명 배경, Bayer 4x4 하프톤)으로 출력된다.
 *
 * 이 모듈은 순수 함수로만 구성된다(DOM 의존은 `ImageData` 생성뿐). 테스트는
 * `studio-lt-convert.test.ts`를 참고한다.
 *
 * three-mesh-bvh 가속 활용 검토는
 * `./studio-lt-convert-bvh-review.md`에 기록되어 있다. 결론만 요약하면,
 * 1차 경로는 이미지 기반 Sobel이며 BVH는 소스 메시가 있을 때의
 * hidden-line 제거 가속(향후 과제)으로만 의미가 있다.
 */

export const STUDIO_LT_CONVERT_MAX_PIXELS = 16_000_000 as const;

/** 톤 농도(포스터라이즈 단계 수) 허용 범위. */
export const STUDIO_LT_CONVERT_TONE_DENSITY_RANGE = Object.freeze({
  min: 2,
  max: 8,
} as const);

/** 선 굵기(px) 허용 범위. */
export const STUDIO_LT_CONVERT_LINE_THICKNESS_RANGE = Object.freeze({
  min: 1,
  max: 5,
} as const);

/** 선 임계값(0~1) 허용 범위. */
export const STUDIO_LT_CONVERT_LINE_THRESHOLD_RANGE = Object.freeze({
  min: 0,
  max: 1,
} as const);

export const STUDIO_LT_CONVERT_DEFAULT_OPTIONS = Object.freeze({
  toneDensity: 4,
  lineThickness: 2,
  lineThreshold: 0.25,
  screentone: false,
} as const);

export type StudioLtConvertErrorCode = "invalid-input" | "budget-exceeded";

export class StudioLtConvertError extends Error {
  constructor(
    readonly code: StudioLtConvertErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StudioLtConvertError";
  }
}

export interface StudioLtConvertOptions {
  /** 톤 농도: 포스터라이즈 양자화 단계 수 (2~8, 범위 밖은 clamp). */
  readonly toneDensity: number;
  /** 선 굵기(px, 1~5, 범위 밖은 clamp). */
  readonly lineThickness: number;
  /** 선 임계값 (0~1, 범위 밖은 clamp). */
  readonly lineThreshold: number;
  /** 도트 스크린톤 패턴 사용 여부 (기본값 false). */
  readonly screentone?: boolean;
}

export interface NormalizedStudioLtConvertOptions {
  readonly toneDensity: number;
  readonly lineThickness: number;
  readonly lineThreshold: number;
  readonly screentone: boolean;
}

export interface StudioLtConvertResult {
  /** 검은색 선 + 투명 배경. */
  readonly lineLayer: ImageData;
  /** 양자화된 명암 톤 (screentone 여부에 따라 회색조/도트). */
  readonly toneLayer: ImageData;
}

/**
 * 엔진이 실제로 읽는 최소 입력 형태. `ImageData`는 이 형태를 만족하므로
 * 그대로 전달하면 된다. `data`는 RGBA 클램프 버퍼이며, NaN/비유한 채널은
 * 0으로 취급한다.
 */
export interface StudioLtConvertPixelSource {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

function clampFinite(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 슬라이더/외부 입력을 엔진이 보장하는 범위로 정규화한다.
 * 정수가 필요한 값은 반올림 후 clamp한다.
 */
export function normalizeStudioLtConvertOptions(
  options: StudioLtConvertOptions,
): NormalizedStudioLtConvertOptions {
  if (!options || typeof options !== "object") {
    throw new StudioLtConvertError(
      "invalid-input",
      "LT 변환 옵션이 필요합니다.",
    );
  }
  return {
    toneDensity: Math.round(
      clampFinite(
        options.toneDensity,
        STUDIO_LT_CONVERT_TONE_DENSITY_RANGE.min,
        STUDIO_LT_CONVERT_TONE_DENSITY_RANGE.max,
        STUDIO_LT_CONVERT_DEFAULT_OPTIONS.toneDensity,
      ),
    ),
    lineThickness: Math.round(
      clampFinite(
        options.lineThickness,
        STUDIO_LT_CONVERT_LINE_THICKNESS_RANGE.min,
        STUDIO_LT_CONVERT_LINE_THICKNESS_RANGE.max,
        STUDIO_LT_CONVERT_DEFAULT_OPTIONS.lineThickness,
      ),
    ),
    lineThreshold: clampFinite(
      options.lineThreshold,
      STUDIO_LT_CONVERT_LINE_THRESHOLD_RANGE.min,
      STUDIO_LT_CONVERT_LINE_THRESHOLD_RANGE.max,
      STUDIO_LT_CONVERT_DEFAULT_OPTIONS.lineThreshold,
    ),
    screentone: options.screentone === true,
  };
}

function validateSource(image: StudioLtConvertPixelSource): {
  readonly width: number;
  readonly height: number;
  readonly pixels: number;
} {
  if (!image || typeof image !== "object") {
    throw new StudioLtConvertError(
      "invalid-input",
      "LT 변환 입력 이미지가 필요합니다.",
    );
  }
  const width = image.width;
  const height = image.height;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
  ) {
    throw new StudioLtConvertError(
      "invalid-input",
      `LT 변환 입력 크기가 올바르지 않습니다(${String(width)}x${String(height)}).`,
    );
  }
  const pixels = width * height;
  if (pixels > STUDIO_LT_CONVERT_MAX_PIXELS) {
    throw new StudioLtConvertError(
      "budget-exceeded",
      `LT 변환 이미지 예산을 초과했습니다(${pixels.toLocaleString("ko-KR")}px > ${STUDIO_LT_CONVERT_MAX_PIXELS.toLocaleString("ko-KR")}px).`,
    );
  }
  const data = image.data;
  if (
    !data
    || typeof data.length !== "number"
    || data.length < pixels * 4
  ) {
    throw new StudioLtConvertError(
      "invalid-input",
      "LT 변환 입력 픽셀 버퍼가 올바르지 않습니다.",
    );
  }
  return { width, height, pixels };
}

/** Rec.709 휘도. NaN/비유한 채널은 0으로 취급한다. */
function luminanceOf(
  data: ArrayLike<number>,
  offset: number,
): number {
  const r = data[offset] ?? 0;
  const g = data[offset + 1] ?? 0;
  const b = data[offset + 2] ?? 0;
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return 0;
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 3x3 가우시안([1,2,1]/4 분리형, 경계 복제) 블러.
 * Sobel 전에 노이즈성 엣지를 줄이기 위한 전처리다.
 */
function gaussianBlur3x3(
  source: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const horizontal = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const left = source[row + Math.max(0, x - 1)] ?? 0;
      const center = source[row + x] ?? 0;
      const right = source[row + Math.min(width - 1, x + 1)] ?? 0;
      horizontal[row + x] = (left + 2 * center + right) / 4;
    }
  }
  const output = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    const up = Math.max(0, y - 1) * width;
    const row = y * width;
    const down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      output[row + x] =
        ((horizontal[up + x] ?? 0)
          + 2 * (horizontal[row + x] ?? 0)
          + (horizontal[down + x] ?? 0)) / 4;
    }
  }
  return output;
}

/**
 * Sobel 그래디언트 크기(0~1 정규화) → 임계값 → 정사각 팽창으로 선 마스크 생성.
 * 정규화 분모는 Sobel 커널의 이론적 최대값(4·√2·255)이다.
 */
function buildLineMask(
  blurred: Float32Array,
  width: number,
  height: number,
  threshold: number,
  thickness: number,
): Uint8Array {
  const sobelMax = 4 * Math.SQRT2 * 255;
  const edge = new Uint8Array(blurred.length);
  for (let y = 0; y < height; y += 1) {
    const up = Math.max(0, y - 1) * width;
    const row = y * width;
    const down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      const gx =
        -(blurred[up + left] ?? 0)
        + (blurred[up + right] ?? 0)
        - 2 * (blurred[row + left] ?? 0)
        + 2 * (blurred[row + right] ?? 0)
        - (blurred[down + left] ?? 0)
        + (blurred[down + right] ?? 0);
      const gy =
        -(blurred[up + left] ?? 0)
        - 2 * (blurred[up + x] ?? 0)
        - (blurred[up + right] ?? 0)
        + (blurred[down + left] ?? 0)
        + 2 * (blurred[down + x] ?? 0)
        + (blurred[down + right] ?? 0);
      const magnitude = Math.hypot(gx, gy) / sobelMax;
      edge[row + x] = magnitude >= threshold ? 1 : 0;
    }
  }
  const radius = Math.floor(thickness / 2);
  if (radius <= 0) return edge;
  // 정사각 팽창: 반경 내 엣지 픽셀이 하나라도 있으면 선으로 취급.
  const dilated = new Uint8Array(edge.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let ny = y0; ny <= y1 && hit === 0; ny += 1) {
        const nrow = ny * width;
        for (let nx = x0; nx <= x1; nx += 1) {
          if (edge[nrow + nx] === 1) {
            hit = 1;
            break;
          }
        }
      }
      dilated[y * width + x] = hit;
    }
  }
  return dilated;
}

/** Bayer 4x4 순서 디더 행렬. */
const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * 3D 뷰 렌더 캡처 또는 이미지 레이어 픽셀을 선화/톤 2개 레이어로 분리한다.
 * `source`에는 `ImageData`를 그대로 전달하면 된다.
 *
 * @throws {StudioLtConvertError} 입력이 비었거나 예산을 초과하면 발생.
 */
export function convertStudioLtImage(
  source: StudioLtConvertPixelSource,
  options: StudioLtConvertOptions,
): StudioLtConvertResult {
  const { width, height, pixels } = validateSource(source);
  const normalized = normalizeStudioLtConvertOptions(options);

  const luminance = new Float32Array(pixels);
  const sourceData = source.data;
  for (let index = 0; index < pixels; index += 1) {
    luminance[index] = luminanceOf(sourceData, index * 4);
  }

  const blurred = gaussianBlur3x3(luminance, width, height);
  const lineMask = buildLineMask(
    blurred,
    width,
    height,
    normalized.lineThreshold,
    normalized.lineThickness,
  );

  const lineData = new Uint8ClampedArray(pixels * 4);
  for (let index = 0; index < pixels; index += 1) {
    if (lineMask[index] === 1) {
      lineData[index * 4 + 3] = 255;
    }
  }
  const lineLayer = new ImageData(lineData, width, height);

  const toneData = new Uint8ClampedArray(pixels * 4);
  const levels = normalized.toneDensity;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const level = Math.min(
        levels - 1,
        Math.floor(((luminance[index] ?? 0) / 255) * levels),
      );
      const offset = index * 4;
      if (normalized.screentone) {
        // 하프톤: 어두울수록 도트 밀도가 높아진다. 밝은 영역은 투명.
        const coverage = 1 - level / (levels - 1);
        const bayerRow = BAYER_4X4[y % 4];
        const threshold = (((bayerRow?.[x % 4] ?? 0) + 0.5) / 16);
        if (coverage > threshold) {
          toneData[offset + 3] = 255;
        }
      } else {
        const value = Math.round((level / (levels - 1)) * 255);
        toneData[offset] = value;
        toneData[offset + 1] = value;
        toneData[offset + 2] = value;
        toneData[offset + 3] = 255;
      }
    }
  }
  const toneLayer = new ImageData(toneData, width, height);

  return { lineLayer, toneLayer };
}
