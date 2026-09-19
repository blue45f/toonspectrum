import {
  NATIVE_BRUSH_PROBE_MAX_SAMPLES, nativeBrushProbeEngine,
  validateNativeBrushProbeConfig, validateNativeBrushSurface,
} from "./studio-native-brush-probe-contract";

import type { DrawEl, El } from "../studio-element-model";
import type { NativeBrushDocumentClipEdges, NativeBrushProbeConfig, NativeBrushProbeEngine, NativeBrushProbeSample, NativeBrushProbeStyle, NativeBrushSurface } from "./studio-native-brush-probe-contract";

export interface StudioNativeBrushDocumentPlan {
  readonly sourceElementId: string;
  /** Operation-local exact source snapshot, not persisted into every pixel/image. */
  readonly sourceRevision: string;
  readonly engine: NativeBrushProbeEngine;
  readonly config: NativeBrushProbeConfig;
  readonly surface: NativeBrushSurface;
  readonly bounds: Readonly<{ x: number; y: number; width: number; height: number }>;
  readonly clipEdges: NativeBrushDocumentClipEdges;
  readonly samples: readonly NativeBrushProbeSample[];
  readonly warnings: readonly string[];
}
export interface StudioNativeBrushDocumentResult {
  readonly sourceElementId: string;
  readonly sourceRevision: string;
  readonly engine: NativeBrushProbeEngine;
  readonly style: NativeBrushProbeStyle;
  readonly seed: number;
  readonly bounds: StudioNativeBrushDocumentPlan["bounds"];
  readonly src: `data:image/png;base64,${string}`;
  readonly pngHash: string;
}
export function studioNativeBrushSourceRevision(source: DrawEl): string {
  const serialized = JSON.stringify(source);
  if (serialized.length > 2_000_000) throw new RangeError("선택 획의 설정이 변환 입력 한도를 초과합니다.");
  return serialized;
}
function channel(values: number[] | undefined, count: number, label: string, low: number, high: number): void {
  if (values === undefined) return;
  if (!Array.isArray(values) || values.length !== count
    || values.some((value) => !Number.isFinite(value) || value < low || value > high)) {
    throw new TypeError(`${label} 입력이 좌표와 일치하지 않거나 범위를 벗어났습니다.`);
  }
}
/** Explicit re-interpretation of a finished centerline, never a silent replacement of its brush. */
export function planStudioNativeBrushDocument(
  source: El | null,
  options: { engine: NativeBrushProbeEngine; style: NativeBrushProbeStyle; seed?: number; documentWidth: number; documentHeight: number },
): StudioNativeBrushDocumentPlan {
  if (!source || source.type !== "draw" || (source.kind ?? "freehand") !== "freehand"
    || source.mode === "eraser" || source.hidden || source.locked) {
    throw new Error("잠기지 않은 완성된 자유곡선 획을 선택하세요.");
  }
  if (source.maskSrc || source.maskEnabled || source.clipBelow || source.alphaLocked
    || (source.blendMode && source.blendMode !== "source-over")
    || (source.symmetry && source.symmetry.type !== "none")
    || source.gradient || source.pattern || source.sketch?.enabled || source.fill) {
    throw new Error("마스크·클리핑·혼합·대칭·채움 효과가 있는 획은 아직 네이티브 변환을 지원하지 않습니다.");
  }
  const { documentWidth, documentHeight } = options;
  if (![documentWidth, documentHeight].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 1_000_000)) {
    throw new RangeError("문서 크기가 올바르지 않습니다.");
  }
  if (!nativeBrushProbeEngine(options.engine)) throw new TypeError("지원하지 않는 브러시 엔진입니다.");
  if (typeof source.stroke !== "string" || !/^#[0-9a-f]{6}$/iu.test(source.stroke)
    || !Number.isFinite(source.strokeWidth) || source.strokeWidth < 1 || source.strokeWidth > 128) {
    throw new Error("변환할 획은 #RRGGBB 단색과 1–128px 굵기여야 합니다.");
  }
  const config: NativeBrushProbeConfig = {
    size: source.strokeWidth, color: source.stroke.toLowerCase(),
    style: options.engine === "libmypaint" ? options.style : "ink", seed: options.seed ?? 7,
  };
  validateNativeBrushProbeConfig(config);
  if (source.opacity !== undefined && (!Number.isFinite(source.opacity) || source.opacity <= 0 || source.opacity > 1)) {
    throw new RangeError("선택 획의 불투명도가 올바르지 않습니다.");
  }
  if (!Array.isArray(source.points) || source.points.length < 2 || source.points.length % 2
    || source.points.length / 2 > NATIVE_BRUSH_PROBE_MAX_SAMPLES) {
    throw new RangeError("한 번에 최대 8,192개 입력점의 획을 변환할 수 있습니다.");
  }
  const count = source.points.length / 2;
  channel(source.pressures, count, "필압", 0, 1);
  channel(source.tiltXs, count, "기울기 X", -90, 90);
  channel(source.tiltYs, count, "기울기 Y", -90, 90);
  channel(source.sampleTimeOffsets, count, "시간", 0, 3_600_000);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < source.points.length; i += 2) {
    const x = source.points[i]!, y = source.points[i + 1]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > documentWidth || y > documentHeight) {
      throw new RangeError("문서 바깥 좌표가 있는 획은 자르지 않고 변환을 중단합니다.");
    }
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  // Conservative native dab/scatter padding. The Worker also rejects any unintended edge contact.
  const halo = Math.ceil(config.size * 4 + 4);
  const x = Math.max(0, Math.floor(minX - halo)), y = Math.max(0, Math.floor(minY - halo));
  const right = Math.min(documentWidth, Math.ceil(maxX + halo));
  const bottom = Math.min(documentHeight, Math.ceil(maxY + halo));
  const surface = { width: right - x, height: bottom - y };
  validateNativeBrushSurface(surface); // Never silently downscale a large source to fit.
  const samples: NativeBrushProbeSample[] = [];
  let lastTime = 0;
  for (let i = 0; i < count; i += 1) {
    const tMs = source.sampleTimeOffsets?.[i] ?? i * 8;
    if (tMs < lastTime) throw new RangeError("저장된 획 시간이 역전되어 변환하지 않았습니다.");
    lastTime = tMs;
    samples.push({ x: source.points[i * 2]! - x, y: source.points[i * 2 + 1]! - y,
      pressure: source.pressures?.[i] ?? 0.5,
      tiltX: (source.tiltXs?.[i] ?? 0) / 90, tiltY: (source.tiltYs?.[i] ?? 0) / 90, tMs });
  }
  const warnings: string[] = [];
  if (!source.pressures) warnings.push("저장된 필압이 없어 일정한 필압 0.5로 변환합니다.");
  if (!source.sampleTimeOffsets) warnings.push("저장된 시간이 없어 입력점마다 8ms 간격으로 재생합니다.");
  return { sourceElementId: source.id, sourceRevision: studioNativeBrushSourceRevision(source),
    engine: options.engine, config, surface, bounds: { x, y, ...surface }, samples,
    clipEdges: [x === 0, y === 0, right === documentWidth, bottom === documentHeight], warnings };
}
