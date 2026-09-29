/**
 * 서브툴 미리보기 스트로크 렌더러 (순수 렌더 함수).
 *
 * 파라미터를 반영한 곡선 획을 canvas 2D 컨텍스트에 그린다:
 * - 팁 모양/각도/둥글기/크기 → 도장(ellipse) 렌더
 * - 간격 %/지터 → 도장 배치 간격
 * - 색상 지터 → 도장마다 HSL 무작위 변화 (결정론적 시드)
 * - 질감 오버레이 → 노이즈 점 패스
 * - 듀얼 브러시 → 두 번째 팁 패스 (혼합 모드 적용)
 * - 혼합 모드/불투명도 → 전체 획의 composite/alpha
 *
 * 렌더는 결정론적이다: 같은 파라미터는 항상 같은 미리보기를 만든다.
 */
import {
  type SubToolBlendMode,
  type SubToolParams,
  type SubToolTipShape,
} from "./subtool-params";

const PREVIEW_MARGIN = 28;
const PREVIEW_AMPLITUDE = 20;
const PREVIEW_WAVES = 1.5;
const MAX_DABS = 800;

function hashString(text: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

function mapBlendMode(mode: SubToolBlendMode): GlobalCompositeOperation {
  if (mode === "normal") return "source-over";
  return mode;
}

interface DabStyle {
  readonly x: number;
  readonly y: number;
  readonly diameter: number;
  readonly color: string;
  readonly alpha: number;
}

const PREVIEW_INK: [number, number, number] = [37, 99, 235];

function jitteredColor(
  rng: () => number,
  params: SubToolParams,
): { color: string; alpha: number } {
  const [h, s, l] = rgbToHsl(PREVIEW_INK[0], PREVIEW_INK[1], PREVIEW_INK[2]);
  const jitter = params.colorJitter;
  const hueShift = (rng() * 2 - 1) * jitter.hue;
  const satScale = 1 + (rng() * 2 - 1) * jitter.saturation;
  const valShift = (rng() * 2 - 1) * jitter.value;
  const [r, g, b] = hslToRgb(
    h + hueShift,
    Math.min(1, Math.max(0, s * satScale)),
    Math.min(1, Math.max(0, l + valShift)),
  );
  const alpha = Math.min(1, Math.max(0.05, 1 - rng() * jitter.opacity));
  return { color: `rgb(${r},${g},${b})`, alpha };
}

function drawDab(
  ctx: CanvasRenderingContext2D,
  dab: DabStyle,
  shape: SubToolTipShape,
  angleRad: number,
  roundness: number,
  rng: () => number,
): void {
  const rx = dab.diameter / 2;
  const ry = Math.max(0.5, rx * roundness);
  ctx.save();
  ctx.globalAlpha = dab.alpha;
  ctx.fillStyle = dab.color;

  if (shape === "neon") {
    ctx.shadowColor = dab.color;
    ctx.shadowBlur = dab.diameter * 0.7;
    ctx.beginPath();
    ctx.ellipse(dab.x, dab.y, rx, ry, angleRad, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = Math.min(1, dab.alpha + 0.35);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(dab.x, dab.y, rx * 0.35, Math.max(0.5, ry * 0.35), angleRad, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === "particle") {
    for (let index = 0; index < 6; index++) {
      const offsetAngle = rng() * Math.PI * 2;
      const offsetRadius = rng() * rx * 0.8;
      const dotRadius = Math.max(0.6, rx * (0.12 + rng() * 0.2));
      ctx.beginPath();
      ctx.arc(
        dab.x + Math.cos(offsetAngle) * offsetRadius,
        dab.y + Math.sin(offsetAngle) * offsetRadius,
        dotRadius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.ellipse(dab.x, dab.y, rx, ry, angleRad, 0, Math.PI * 2);
    ctx.fill();
    if (shape === "textured") {
      ctx.globalAlpha = dab.alpha * 0.35;
      ctx.fillStyle = "#ffffff";
      for (let index = 0; index < 7; index++) {
        const dotX = dab.x + (rng() * 2 - 1) * rx * 0.7;
        const dotY = dab.y + (rng() * 2 - 1) * ry * 0.7;
        ctx.beginPath();
        ctx.arc(dotX, dotY, Math.max(0.5, rx * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function strokePoint(
  progress: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const x = PREVIEW_MARGIN + progress * (width - PREVIEW_MARGIN * 2);
  const y =
    height / 2 +
    Math.sin(progress * Math.PI * 2 * PREVIEW_WAVES) * PREVIEW_AMPLITUDE;
  return { x, y };
}

/**
 * 미리보기 렌더의 순수 진입점. canvas가 없는 환경에서는 조용히 종료한다.
 * 테스트에서 렌더 결정성을 검증할 수 있도록 export한다.
 */
export function renderSubToolStrokePreview(
  ctx: CanvasRenderingContext2D | null,
  width: number,
  height: number,
  params: SubToolParams,
): void {
  if (!ctx) return;
  const rng = mulberry32(hashString(JSON.stringify(params)));

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  // 투명도 확인용 체커보드 배경
  const checker = 10;
  for (let cy = 0; cy < height / checker; cy++) {
    for (let cx = 0; cx < width / checker; cx++) {
      ctx.fillStyle = (cx + cy) % 2 === 0 ? "#f4f4f5" : "#e4e4e7";
      ctx.fillRect(cx * checker, cy * checker, checker, checker);
    }
  }

  const size = Math.min(params.tip.size, height * 0.5);
  const angleRad = (params.tip.angle * Math.PI) / 180;

  // 획 경로를 따라 도장 배치
  const stepBase = Math.max(1, size * (params.spacing.percent / 100));
  const dabPositions: Array<{ x: number; y: number }> = [];
  let progress = 0;
  let nextAt = 0;
  let traveled = 0;
  let previous = strokePoint(0, width, height);
  // progress가 1에 도달하면 종료한다. Math.min(1, ...)로 클램프하므로
  // 조건을 progress < 1 로 둬야 무한 루프에 빠지지 않는다.
  while (progress < 1 && dabPositions.length < MAX_DABS) {
    progress = Math.min(1, progress + 0.002);
    const current = strokePoint(progress, width, height);
    traveled += Math.hypot(current.x - previous.x, current.y - previous.y);
    previous = current;
    if (traveled >= nextAt) {
      const jitteredStep =
        stepBase * (1 + (rng() * 2 - 1) * params.spacing.jitter);
      dabPositions.push({ x: current.x, y: current.y });
      nextAt = traveled + Math.max(1, jitteredStep);
    }
  }

  // 메인 획
  ctx.globalCompositeOperation = mapBlendMode(params.blending.mode);
  ctx.globalAlpha = params.blending.opacity;
  for (const position of dabPositions) {
    const { color, alpha } = jitteredColor(rng, params);
    drawDab(
      ctx,
      { x: position.x, y: position.y, diameter: size, color, alpha },
      params.tip.shape,
      angleRad,
      params.tip.roundness,
      rng,
    );
  }
  ctx.globalAlpha = 1;

  // 질감 오버레이 패스
  if (params.texture.strength > 0) {
    const grainCount = Math.min(900, Math.floor(500 * params.texture.strength));
    ctx.globalCompositeOperation =
      params.texture.mode === "overlay" ? "overlay" : "multiply";
    for (let index = 0; index < grainCount; index++) {
      const gx = PREVIEW_MARGIN + rng() * (width - PREVIEW_MARGIN * 2);
      const gy =
        height / 2 +
        (rng() * 2 - 1) * (PREVIEW_AMPLITUDE + size / 2) * params.texture.scale;
      ctx.globalAlpha = params.texture.strength * rng() * 0.5;
      ctx.fillStyle = "#808080";
      const grainSize = 1 + rng() * 2.5 * params.texture.scale;
      ctx.fillRect(gx, gy, grainSize, grainSize);
    }
    ctx.globalAlpha = 1;
  }

  // 듀얼 브러시 패스
  if (params.dualBrush.enabled) {
    const dualSize = size * params.dualBrush.sizeRatio;
    const dualStepBase = Math.max(1, size * (params.dualBrush.spacingPercent / 100));
    ctx.globalCompositeOperation = mapBlendMode(params.dualBrush.blendMode);
    let dualTraveled = 0;
    let dualNextAt = 0;
    let dualPrevious = strokePoint(0, width, height);
    let dualProgress = 0;
    let dualDabs = 0;
    while (dualProgress < 1 && dualDabs < MAX_DABS) {
      dualProgress = Math.min(1, dualProgress + 0.002);
      const current = strokePoint(dualProgress, width, height);
      dualTraveled += Math.hypot(current.x - dualPrevious.x, current.y - dualPrevious.y);
      dualPrevious = current;
      if (dualTraveled >= dualNextAt) {
        const { color, alpha } = jitteredColor(rng, params);
        drawDab(
          ctx,
          {
            x: current.x,
            y: current.y - size * 0.35,
            diameter: dualSize,
            color,
            alpha: alpha * 0.85,
          },
          params.tip.shape,
          angleRad,
          params.tip.roundness,
          rng,
        );
        dualDabs += 1;
        dualNextAt = dualTraveled + dualStepBase;
      }
    }
  }

  ctx.restore();
}
