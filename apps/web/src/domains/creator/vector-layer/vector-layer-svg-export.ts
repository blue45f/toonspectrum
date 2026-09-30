/**
 * 벡터 레이어 → SVG 내보내기 (T2).
 *
 * 가변 굵기(`stroke-width` 가변)는 SVG 네이티브로 표현할 수 없으므로
 * 두 가지 근사 중 하나를 사용한다:
 * - "outline" (기본): 경로를 따라 좌/우로 폭 절반만큼 오프셋한 외곽 폴리곤을
 *   채움(fill) 패스로 출력한다. 끝점은 둥근 캡(fan)으로 마감한다.
 * - "segments": 세그먼트마다 평균 굵기의 단일 `stroke` 패스로 출력한다.
 *   (편집기 간 호환용 단순 근사)
 */

import {
  type VectorLayer,
  type VectorPoint2D,
  type VectorStroke,
} from "./vector-layer-model";
import { sampleVectorStrokePath } from "./vector-stroke-path";

export type VectorSvgExportMode = "outline" | "segments";

export interface VectorSvgExportOptions {
  readonly width?: number;
  readonly height?: number;
  /** 생략하면 width/height 기반 `0 0 w h`. */
  readonly viewBox?: string;
  readonly mode?: VectorSvgExportMode;
  /** 외곽선 샘플링 밀도(세그먼트당). 기본 12. */
  readonly samplesPerSegment?: number;
  readonly background?: string;
  /** 좌표 소수점 자릿수. 기본 2. */
  readonly decimals?: number;
}

export interface VectorSvgExportResult {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly strokeCount: number;
  readonly mode: VectorSvgExportMode;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function formatNumber(value: number, decimals: number): string {
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isPlausibleColor(color: string): boolean {
  return (
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color)
    || /^rgba?\(/.test(color)
    || /^hsla?\(/.test(color)
    || /^[a-zA-Z]+$/.test(color)
  );
}

function sanitizeColor(color: string): string {
  return isPlausibleColor(color) ? color : "#000000";
}

/** 외곽 폴리곤용 좌/우 오프셋 점열. */
function outlinePoints(
  samples: Array<VectorPoint2D & { width: number; angle: number }>,
  capFanSteps: number
): { left: VectorPoint2D[]; right: VectorPoint2D[] } {
  const left: VectorPoint2D[] = [];
  const right: VectorPoint2D[] = [];
  samples.forEach((sample) => {
    const half = Math.max(sample.width, 0) / 2;
    const nx = -Math.sin(sample.angle);
    const ny = Math.cos(sample.angle);
    left.push({ x: sample.x + nx * half, y: sample.y + ny * half });
    right.push({ x: sample.x - nx * half, y: sample.y - ny * half });
  });
  const first = samples[0];
  const last = samples[samples.length - 1];
  // 둥근 캡: 시작점/끝점을 중심으로 법선 각도를 부채꼴로 회전시킨다.
  if (first && capFanSteps > 0) {
    const half = Math.max(first.width, 0) / 2;
    const baseAngle = Math.atan2(Math.cos(first.angle), -Math.sin(first.angle));
    for (let step = 1; step <= capFanSteps; step += 1) {
      const angle = baseAngle + (Math.PI * step) / (capFanSteps + 1);
      left.unshift({
        x: first.x + Math.cos(angle) * half,
        y: first.y + Math.sin(angle) * half,
      });
    }
  }
  if (last && capFanSteps > 0) {
    const half = Math.max(last.width, 0) / 2;
    const baseAngle = Math.atan2(-Math.cos(last.angle), Math.sin(last.angle));
    for (let step = 1; step <= capFanSteps; step += 1) {
      const angle = baseAngle + (Math.PI * step) / (capFanSteps + 1);
      right.push({
        x: last.x + Math.cos(angle) * half,
        y: last.y + Math.sin(angle) * half,
      });
    }
  }
  return { left, right };
}

/** 스트로크 1개를 외곽 채움 패스(`d`)로 변환한다. 점 스트로크는 null. */
export function vectorStrokeToOutlinePathD(
  stroke: VectorStroke,
  samplesPerSegment: number,
  decimals: number
): string | null {
  const samples = sampleVectorStrokePath(stroke, samplesPerSegment);
  if (samples.length === 0) return null;
  const isDot = samples.every(
    (sample) =>
      Math.abs(sample.x - samples[0]!.x) < 1e-9
      && Math.abs(sample.y - samples[0]!.y) < 1e-9
  );
  if (isDot) return null;
  const { left, right } = outlinePoints(samples, 4);
  const ring = [...left, ...right.reverse()];
  const fmt = (value: number): string => formatNumber(value, decimals);
  const head = ring[0]!;
  let d = `M${fmt(head.x)} ${fmt(head.y)}`;
  for (let index = 1; index < ring.length; index += 1) {
    const point = ring[index]!;
    d += `L${fmt(point.x)} ${fmt(point.y)}`;
  }
  return `${d}Z`;
}

/** 점(dot) 스트로크를 `<circle>` 로 출력한다. 점이 아니면 null. */
export function vectorStrokeToDotCircle(
  stroke: VectorStroke,
  decimals: number
): { cx: number; cy: number; r: number } | null {
  const samples = sampleVectorStrokePath(stroke, 1);
  if (samples.length === 0) return null;
  const first = samples[0]!;
  const isDot = samples.every(
    (sample) =>
      Math.abs(sample.x - first.x) < 1e-9 && Math.abs(sample.y - first.y) < 1e-9
  );
  if (!isDot) return null;
  const width = samples.reduce((max, sample) => Math.max(max, sample.width), 0);
  return {
    cx: Number(first.x.toFixed(decimals)),
    cy: Number(first.y.toFixed(decimals)),
    r: Number(Math.max(width / 2, 0.01).toFixed(decimals)),
  };
}

/** 세그먼트 근사 모드: 세그먼트마다 평균 굵기의 단일 stroke 패스. */
function strokeToSegmentPaths(
  stroke: VectorStroke,
  decimals: number
): string[] {
  const fmt = (value: number): string => formatNumber(value, decimals);
  const color = escapeAttribute(sanitizeColor(stroke.color));
  const opacity = formatNumber(
    Math.min(1, Math.max(0, finiteNumber(stroke.opacity, 1))),
    3
  );
  return stroke.segments.map((segment, index) => {
    const widthStart = stroke.widths[index] ?? 1;
    const widthEnd = stroke.widths[index + 1] ?? widthStart;
    const width = formatNumber(Math.max((widthStart + widthEnd) / 2, 0.01), decimals);
    const d =
      `M${fmt(segment.p0.x)} ${fmt(segment.p0.y)}`
      + `C${fmt(segment.p1.x)} ${fmt(segment.p1.y)}`
      + ` ${fmt(segment.p2.x)} ${fmt(segment.p2.y)}`
      + ` ${fmt(segment.p3.x)} ${fmt(segment.p3.y)}`;
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  });
}

function strokeToOutlineElement(
  stroke: VectorStroke,
  samplesPerSegment: number,
  decimals: number
): string | null {
  const color = escapeAttribute(sanitizeColor(stroke.color));
  const opacity = formatNumber(
    Math.min(1, Math.max(0, finiteNumber(stroke.opacity, 1))),
    3
  );
  const dot = vectorStrokeToDotCircle(stroke, decimals);
  if (dot) {
    return `<circle cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${color}" opacity="${opacity}"/>`;
  }
  const d = vectorStrokeToOutlinePathD(stroke, samplesPerSegment, decimals);
  if (!d) return null;
  return `<path d="${d}" fill="${color}" opacity="${opacity}"/>`;
}

export function exportVectorLayerToSvg(
  layer: VectorLayer,
  options: VectorSvgExportOptions = {}
): VectorSvgExportResult {
  const width = Math.max(1, Math.floor(finiteNumber(options.width, 800)));
  const height = Math.max(1, Math.floor(finiteNumber(options.height, 600)));
  const mode: VectorSvgExportMode =
    options.mode === "segments" ? "segments" : "outline";
  const decimals = Math.min(
    6,
    Math.max(0, Math.floor(finiteNumber(options.decimals, 2)))
  );
  const samplesPerSegment = Math.max(
    2,
    Math.floor(finiteNumber(options.samplesPerSegment, 12))
  );
  const viewBox = options.viewBox ?? `0 0 ${width} ${height}`;
  const layerOpacity = formatNumber(
    Math.min(1, Math.max(0, finiteNumber(layer.opacity, 1))),
    3
  );

  const body: string[] = [];
  if (options.background) {
    body.push(
      `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeAttribute(options.background)}"/>`
    );
  }
  let strokeCount = 0;
  for (const stroke of layer.strokes) {
    if (mode === "outline") {
      const element = strokeToOutlineElement(stroke, samplesPerSegment, decimals);
      if (element) {
        body.push(element);
        strokeCount += 1;
      }
    } else {
      const paths = strokeToSegmentPaths(stroke, decimals);
      body.push(...paths);
      strokeCount += paths.length > 0 ? 1 : 0;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${escapeAttribute(viewBox)}">`
    + `<g opacity="${layerOpacity}">`
    + body.join("")
    + `</g></svg>`;
  return { svg, width, height, strokeCount, mode };
}
