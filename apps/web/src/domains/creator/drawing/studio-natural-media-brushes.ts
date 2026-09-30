/**
 * studio-natural-media-brushes.ts
 *
 * p5.brush (MIT) 내추럴 미디어 브러시 통합 모듈.
 *
 * p5.brush 고유의 강점 — 실제 내추럴 미디어 질감(연필 입자·목탄 번짐·마커
 * 겹침·수채화 번짐·해칭)에만 집중한다. 기존 자체 스탬프 엔진의 클린룸 커널과
 * 중복되는 영역은 건드리지 않는다.
 *
 * 설계:
 * - `p5.brush/standalone` 을 dynamic import 로 lazy-load (p5.js 불필요).
 * - WebGL2 캔버스가 필요하므로 세션은 명시적 생성/해제.
 * - 프리셋 정의·설정 검증은 순수 함수 (테스트 가능).
 * - 실제 WebGL 렌더링은 브라우저에서만 동작하므로 테스트에서 제외.
 */

export type StudioNaturalMediaBrushId =
  | "pencil-2b"
  | "pencil-hb"
  | "color-pencil"
  | "pen"
  | "rotring"
  | "charcoal"
  | "marker"
  | "marker2"
  | "spray"
  | "hatch";

export interface StudioNaturalMediaPreset {
  readonly id: StudioNaturalMediaBrushId;
  /** p5.brush 내장 브러시 이름. */
  readonly brushName: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  /** 권장 굵기(px). */
  readonly defaultWeight: number;
  /** 웹툰 공정 태그. */
  readonly crafts: ReadonlyArray<"sketch" | "lineart" | "coloring" | "tone" | "effect">;
}

/** p5.brush 내장 11종 중 내추럴 미디어 10종 매핑. */
export const STUDIO_NATURAL_MEDIA_PRESETS: ReadonlyArray<StudioNaturalMediaPreset> =
  Object.freeze([
    {
      id: "pencil-2b",
      brushName: "2B",
      labelKo: "연필 2B",
      labelEn: "Pencil 2B",
      descriptionKo: "부드러운 스케치용. 입자감이 살아있는 연필 질감.",
      defaultWeight: 2,
      crafts: ["sketch"],
    },
    {
      id: "pencil-hb",
      brushName: "HB",
      labelKo: "연필 HB",
      labelEn: "Pencil HB",
      descriptionKo: "밑그림용 표준 연필. 2B보다 단단하고 정밀.",
      defaultWeight: 1.5,
      crafts: ["sketch"],
    },
    {
      id: "color-pencil",
      brushName: "cpencil",
      labelKo: "색연필",
      labelEn: "Color Pencil",
      descriptionKo: "색연필 질감. 가벼운 채색·톤 작업에.",
      defaultWeight: 3,
      crafts: ["sketch", "coloring"],
    },
    {
      id: "pen",
      brushName: "pen",
      labelKo: "펜",
      labelEn: "Pen",
      descriptionKo: "깔끔한 선화용 펜.",
      defaultWeight: 2,
      crafts: ["lineart"],
    },
    {
      id: "rotring",
      brushName: "rotring",
      labelKo: "로트링",
      labelEn: "Rotring",
      descriptionKo: "일정한 굵기의 제도 펜. 정밀한 선화에.",
      defaultWeight: 1.5,
      crafts: ["lineart"],
    },
    {
      id: "charcoal",
      brushName: "charcoal",
      labelKo: "목탄",
      labelEn: "Charcoal",
      descriptionKo: "번짐이 풍부한 목탄. 명암·배경 질감에.",
      defaultWeight: 8,
      crafts: ["sketch", "tone"],
    },
    {
      id: "marker",
      brushName: "marker",
      labelKo: "마커",
      labelEn: "Marker",
      descriptionKo: "겹칠수록 진해지는 마커. 채색용.",
      defaultWeight: 12,
      crafts: ["coloring"],
    },
    {
      id: "marker2",
      brushName: "marker2",
      labelKo: "브러시 마커",
      labelEn: "Brush Marker",
      descriptionKo: "붓 느낌의 마커. 굵기 변화가 큰 채색에.",
      defaultWeight: 14,
      crafts: ["coloring"],
    },
    {
      id: "spray",
      brushName: "spray",
      labelKo: "스프레이",
      labelEn: "Spray",
      descriptionKo: "에어브러시 스프레이. 톤·그라데이션·효과에.",
      defaultWeight: 20,
      crafts: ["tone", "effect"],
    },
    {
      id: "hatch",
      brushName: "hatch_brush",
      labelKo: "해칭",
      labelEn: "Hatch",
      descriptionKo: "깨끗한 빗금선. 명암 해칭 전용.",
      defaultWeight: 1.5,
      crafts: ["tone", "lineart"],
    },
  ]);

export function getNaturalMediaPreset(
  id: StudioNaturalMediaBrushId,
): StudioNaturalMediaPreset | undefined {
  return STUDIO_NATURAL_MEDIA_PRESETS.find((p) => p.id === id);
}

export function getNaturalMediaPresetsByCraft(
  craft: StudioNaturalMediaPreset["crafts"][number],
): StudioNaturalMediaPreset[] {
  return STUDIO_NATURAL_MEDIA_PRESETS.filter((p) => p.crafts.includes(craft));
}

export interface StudioNaturalMediaStrokeStyle {
  /** 0..1, 0..1, 0..1 RGB. */
  readonly color: readonly [number, number, number];
  /** 굵기(px). 0.5..100. */
  readonly weight: number;
}

export interface StudioNaturalMediaSessionConfig {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** WebGL2 미지원 시 에러. 기본 true. */
  readonly requireWebGL2?: boolean;
}

export type StudioNaturalMediaLoadError =
  | "load-failed"
  | "invalid-config"
  | "webgl2-unavailable";

export interface StudioNaturalMediaSession {
  readonly config: StudioNaturalMediaSessionConfig;
  /** p5.brush standalone 모듈 네임스페이스 (불투명). */
  readonly runtime: unknown;
  dispose(): void;
}

type P5BrushStandalone = typeof import("p5.brush/standalone");

let cachedRuntime: P5BrushStandalone | null = null;
let runtimePromise: Promise<P5BrushStandalone | null> | null = null;

/** p5.brush standalone 런타임을 lazy-load. 실패 시 null. */
export async function loadNaturalMediaRuntime(): Promise<P5BrushStandalone | null> {
  if (cachedRuntime) return cachedRuntime;
  if (runtimePromise) return runtimePromise;
  runtimePromise = import("p5.brush/standalone")
    .then((mod) => {
      cachedRuntime = mod;
      return mod;
    })
    .catch(() => {
      runtimePromise = null;
      return null;
    });
  return runtimePromise;
}

/** 테스트용 런타임 주입. */
export function injectNaturalMediaRuntimeForTest(
  runtime: P5BrushStandalone | null,
): void {
  cachedRuntime = runtime;
  runtimePromise = runtime ? Promise.resolve(runtime) : null;
}

export function validateNaturalMediaSessionConfig(
  config: StudioNaturalMediaSessionConfig,
): StudioNaturalMediaLoadError | null {
  if (
    !Number.isFinite(config.canvasWidth) ||
    config.canvasWidth <= 0 ||
    config.canvasWidth > 8192
  ) {
    return "invalid-config";
  }
  if (
    !Number.isFinite(config.canvasHeight) ||
    config.canvasHeight <= 0 ||
    config.canvasHeight > 8192
  ) {
    return "invalid-config";
  }
  return null;
}

export function validateNaturalMediaStrokeStyle(
  style: StudioNaturalMediaStrokeStyle,
): boolean {
  const [r, g, b] = style.color;
  if (
    ![r, g, b].every((c) => Number.isFinite(c) && c >= 0 && c <= 1) ||
    !Number.isFinite(style.weight) ||
    style.weight < 0.5 ||
    style.weight > 100
  ) {
    return false;
  }
  return true;
}

/**
 * 해칭 패턴 설정값 검증 (p5.brush hatch API용).
 * @param spacing 빗금 간격(px), 2..100
 * @param angle 빗금 각도(도), 0..180
 */
export function validateHatchSettings(
  spacing: number,
  angle: number,
): boolean {
  return (
    Number.isFinite(spacing) &&
    spacing >= 2 &&
    spacing <= 100 &&
    Number.isFinite(angle) &&
    angle >= 0 &&
    angle <= 180
  );
}
