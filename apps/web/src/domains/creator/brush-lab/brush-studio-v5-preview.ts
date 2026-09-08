import type { BrushStudioV5Draft } from "./brush-studio-v5-model";

export interface BrushStudioV5PreviewOptions {
  readonly settleProgress?: number;
  readonly pixelRatio?: number;
}

interface PreviewPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tangent: number;
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function hexChannels(value: string): readonly [number, number, number] {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return [(parsed >> 16) & 0xff, (parsed >> 8) & 0xff, parsed & 0xff];
}

function rgba(value: string, alpha: number): string {
  const [red, green, blue] = hexChannels(value);
  return `rgba(${red},${green},${blue},${clamp(alpha)})`;
}

function mixColor(left: string, right: string, ratio: number): string {
  const a = hexChannels(left);
  const b = hexChannels(right);
  const t = clamp(ratio);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

function createStrokePoints(width: number, height: number): readonly PreviewPoint[] {
  const points: PreviewPoint[] = [];
  const count = 96;
  for (let index = 0; index < count; index += 1) {
    const progress = index / (count - 1);
    const x = width * (0.08 + progress * 0.84);
    const y = height * (
      0.5
      + Math.sin(progress * Math.PI * 2.15) * 0.19
      + Math.sin(progress * Math.PI * 5.2) * 0.045
    );
    const pressure = clamp(0.14 + Math.sin(Math.PI * progress) * 0.83);
    const nextProgress = Math.min(1, progress + 1 / count);
    const nextY = height * (
      0.5
      + Math.sin(nextProgress * Math.PI * 2.15) * 0.19
      + Math.sin(nextProgress * Math.PI * 5.2) * 0.045
    );
    const tangent = Math.atan2(nextY - y, width * 0.84 / count);
    points.push(Object.freeze({ x, y, pressure, tangent }));
  }
  return Object.freeze(points);
}

function traceStrokePath(
  context: CanvasRenderingContext2D,
  points: readonly PreviewPoint[],
  offset = 0,
): void {
  context.beginPath();
  points.forEach((point, index) => {
    const x = point.x - Math.sin(point.tangent) * offset;
    const y = point.y + Math.cos(point.tangent) * offset;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
}

function surfaceBackground(draft: BrushStudioV5Draft): string {
  switch (draft.surfaceId) {
    case "smooth-film": return "#f7f8fb";
    case "linen-canvas": return "#eee8db";
    case "watercolor-coldpress": return "#f3efe4";
    case "printmaking-tooth": return "#ece6d8";
    case "porous-fiber": return "#f0eadc";
    case "custom-scan": return "#ece9e2";
    default: return "#f5f2ea";
  }
}

function drawSurface(
  context: CanvasRenderingContext2D,
  draft: BrushStudioV5Draft,
  width: number,
  height: number,
  random: () => number,
): void {
  context.fillStyle = surfaceBackground(draft);
  context.fillRect(0, 0, width, height);
  if (draft.surfaceId === "smooth-film") return;

  const amount = Math.round(280 + draft.tuning.grain * 1_100);
  context.save();
  for (let index = 0; index < amount; index += 1) {
    const deep = draft.surfaceId === "printmaking-tooth"
      || draft.surfaceId === "watercolor-coldpress";
    const radius = (deep ? 0.5 + random() * 1.7 : 0.35 + random() * 0.8)
      * (0.5 + draft.tuning.grain);
    context.fillStyle = random() > 0.54
      ? "rgba(54,48,38,0.055)"
      : "rgba(255,255,255,0.24)";
    context.beginPath();
    context.ellipse(
      random() * width,
      random() * height,
      radius * (draft.surfaceId === "porous-fiber" ? 3 : 1),
      radius,
      random() * Math.PI,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  if (draft.surfaceId === "linen-canvas") {
    context.strokeStyle = "rgba(80,68,50,0.085)";
    context.lineWidth = 0.7;
    for (let x = 0; x < width; x += 12) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + 8, height);
      context.stroke();
    }
    for (let y = 0; y < height; y += 11) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y + 7);
      context.stroke();
    }
  }
  context.restore();
}

function drawContinuousStroke(
  context: CanvasRenderingContext2D,
  draft: BrushStudioV5Draft,
  points: readonly PreviewPoint[],
  offset = 0,
  alphaScale = 1,
): void {
  context.save();
  context.lineCap = draft.tipId === "chisel-sdf" ? "butt" : "round";
  context.lineJoin = "round";
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const widthScale = draft.geometryId === "angled-ribbon"
      ? 1.45
      : draft.geometryId === "pressure-outline"
        ? 1.1
        : 0.78;
    const normalX = -Math.sin(current.tangent) * offset;
    const normalY = Math.cos(current.tangent) * offset;
    const progress = index / points.length;
    context.strokeStyle = draft.patternId === "rainbow-flow"
      ? `hsl(${Math.round(progress * 330)}, 78%, 52%)`
      : mixColor(
        draft.primaryColor,
        draft.secondaryColor,
        progress * (draft.pigmentId === "rgb" ? 0.15 : 0.42),
      );
    context.globalAlpha = clamp(
      draft.tuning.flow
        * alphaScale
        * (draft.materialId === "watercolor" || draft.materialId === "living-ink" ? 0.42 : 0.96),
    );
    context.lineWidth = Math.max(
      1,
      draft.tuning.size * (0.2 + current.pressure * 0.8) * widthScale,
    );
    context.beginPath();
    context.moveTo(previous.x + normalX, previous.y + normalY);
    context.lineTo(current.x + normalX, current.y + normalY);
    context.stroke();
  }
  context.restore();
}

function drawDryMedia(
  context: CanvasRenderingContext2D,
  draft: BrushStudioV5Draft,
  points: readonly PreviewPoint[],
  random: () => number,
): void {
  drawContinuousStroke(context, draft, points, 0, 0.52);
  const particleCount = Math.round(500 + draft.tuning.grain * 1_600);
  const spread = draft.tuning.size * (0.2 + draft.tuning.scatter * 0.75);
  context.save();
  for (let index = 0; index < particleCount; index += 1) {
    const point = points[Math.floor(random() * points.length)]!;
    const angle = random() * Math.PI * 2;
    const radius = Math.pow(random(), 1.8) * spread;
    const size = draft.materialId === "charcoal"
      ? 0.6 + random() * 2.2
      : 0.3 + random() * 1.15;
    context.fillStyle = rgba(
      draft.primaryColor,
      (0.08 + random() * 0.38) * draft.tuning.flow,
    );
    context.fillRect(
      point.x + Math.cos(angle) * radius,
      point.y + Math.sin(angle) * radius * 0.72,
      size,
      size * (0.6 + random()),
    );
  }
  context.restore();
}

function drawBristles(
  context: CanvasRenderingContext2D,
  draft: BrushStudioV5Draft,
  points: readonly PreviewPoint[],
  random: () => number,
): void {
  const lanes = Math.max(7, Math.round(9 + draft.tuning.size * 0.35));
  for (let lane = 0; lane < lanes; lane += 1) {
    const normalized = lane / Math.max(1, lanes - 1) - 0.5;
    const offset = normalized * draft.tuning.size * 0.74
      + (random() - 0.5) * draft.tuning.size * 0.08;
    drawContinuousStroke(context, draft, points, offset, 0.34 + random() * 0.45);
  }
}

function drawParticles(
  context: CanvasRenderingContext2D,
  draft: BrushStudioV5Draft,
  points: readonly PreviewPoint[],
  random: () => number,
  settleProgress: number,
): void {
  const count = Math.round(170 + draft.tuning.scatter * 760);
  context.save();
  for (let index = 0; index < count; index += 1) {
    const point = points[Math.floor(random() * points.length)]!;
    const angle = random() * Math.PI * 2;
    const spread = draft.tuning.size
      * (0.25 + draft.tuning.scatter * 1.5)
      * Math.sqrt(random());
    const ballistic = draft.physicsIds.includes("particle-ballistics")
      ? settleProgress * settleProgress * (8 + random() * 34)
      : 0;
    context.fillStyle = rgba(
      random() > 0.7 ? draft.secondaryColor : draft.primaryColor,
      0.28 + random() * 0.58,
    );
    context.beginPath();
    context.arc(
      point.x + Math.cos(angle) * spread,
      point.y + Math.sin(angle) * spread + ballistic,
      0.6 + Math.pow(random(), 2.4) * draft.tuning.size * 0.18,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();
}

function drawWetEffects(
  context: CanvasRenderingContext2D,
  draft: BrushStudioV5Draft,
  points: readonly PreviewPoint[],
  random: () => number,
  settleProgress: number,
): void {
  const wetness = clamp(
    draft.tuning.wetness + (draft.physicsIds.includes("inkwash-flow") ? 0.28 : 0),
  );
  if (wetness <= 0.04) return;

  context.save();
  context.globalCompositeOperation = "multiply";
  context.filter = `blur(${Math.round(2 + wetness * 8 * settleProgress)}px)`;
  drawContinuousStroke(context, draft, points, 0, 0.24 + wetness * 0.25);
  context.filter = "none";

  if (draft.finishIds.includes("edge-bloom")) {
    context.strokeStyle = rgba(draft.primaryColor, 0.18 + wetness * 0.3);
    context.lineWidth = draft.tuning.size * (1.05 + wetness * 0.55);
    context.lineCap = "round";
    traceStrokePath(context, points);
    context.stroke();
    context.globalCompositeOperation = "destination-out";
    context.strokeStyle = "rgba(0,0,0,0.72)";
    context.lineWidth = draft.tuning.size * 0.72;
    context.stroke();
    context.globalCompositeOperation = "source-over";
  }

  if (draft.physicsIds.includes("thin-film")) {
    const drips = 5 + Math.round(wetness * 7);
    for (let index = 0; index < drips; index += 1) {
      const point = points[Math.floor((0.18 + random() * 0.68) * points.length)]!;
      const length = settleProgress
        * (18 + random() * 72)
        * (1.15 - draft.tuning.viscosity * 0.62);
      context.strokeStyle = rgba(
        index % 3 === 0 ? draft.secondaryColor : draft.primaryColor,
        0.28 + random() * 0.38,
      );
      context.lineWidth = 1.4 + random() * draft.tuning.size * 0.14;
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.bezierCurveTo(
        point.x + (random() - 0.5) * 8,
        point.y + length * 0.35,
        point.x + (random() - 0.5) * 11,
        point.y + length * 0.7,
        point.x,
        point.y + length,
      );
      context.stroke();
    }
  }
  context.restore();
}

function drawReactionDiffusion(
  context: CanvasRenderingContext2D,
  draft: BrushStudioV5Draft,
  points: readonly PreviewPoint[],
  random: () => number,
  settleProgress: number,
): void {
  if (!draft.physicsIds.includes("reaction-diffusion")) return;
  context.save();
  context.strokeStyle = rgba(draft.secondaryColor, 0.2 + settleProgress * 0.42);
  context.lineWidth = 0.7 + draft.tuning.grain * 1.4;
  for (let branch = 0; branch < 42; branch += 1) {
    const origin = points[Math.floor(random() * points.length)]!;
    let x = origin.x;
    let y = origin.y;
    let angle = origin.tangent + (random() - 0.5) * Math.PI * 1.7;
    const steps = Math.round(2 + settleProgress * (3 + random() * 8));
    context.beginPath();
    context.moveTo(x, y);
    for (let step = 0; step < steps; step += 1) {
      angle += (random() - 0.5) * 0.8;
      const length = 2 + random() * 8;
      x += Math.cos(angle) * length;
      y += Math.sin(angle) * length;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  context.restore();
}

function drawLinearPattern(
  context: CanvasRenderingContext2D,
  draft: BrushStudioV5Draft,
  width: number,
  height: number,
  scale: number,
): void {
  for (let value = -height; value < width + height; value += scale) {
    context.beginPath();
    context.moveTo(value, 0);
    context.lineTo(value - height, height);
    context.stroke();
    if (draft.patternId !== "line-tone") {
      context.beginPath();
      context.moveTo(value - height, 0);
      context.lineTo(value, height);
      context.stroke();
    }
  }
  if (draft.patternId === "fabric-weave") {
    context.globalAlpha = 0.55;
    for (let y = 0; y < height; y += scale * 0.72) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y + 5);
      context.stroke();
    }
  }
}

function drawPattern(
  context: CanvasRenderingContext2D,
  draft: BrushStudioV5Draft,
  width: number,
  height: number,
  points: readonly PreviewPoint[],
  random: () => number,
): void {
  if (draft.patternId === "none" || draft.patternId === "rainbow-flow") return;

  context.save();
  context.strokeStyle = rgba(draft.secondaryColor, 0.26 + draft.tuning.flow * 0.28);
  context.fillStyle = rgba(draft.secondaryColor, 0.3 + draft.tuning.flow * 0.32);
  context.lineWidth = 1;
  const scale = Math.max(4, 12 * draft.tuning.patternScale);

  if (draft.patternId === "dot-tone") {
    for (let y = scale; y < height; y += scale) {
      for (let x = scale; x < width; x += scale) {
        context.beginPath();
        context.arc(x, y, Math.max(0.8, scale * 0.14), 0, Math.PI * 2);
        context.fill();
      }
    }
  } else if (
    draft.patternId === "line-tone"
    || draft.patternId === "cross-hatch"
    || draft.patternId === "fabric-weave"
  ) {
    drawLinearPattern(context, draft, width, height, scale);
  } else if (draft.patternId === "brick") {
    const brickWidth = scale * 2.4;
    const brickHeight = scale * 1.2;
    for (let row = 0, y = 0; y < height; row += 1, y += brickHeight) {
      const offset = row % 2 ? brickWidth * 0.5 : 0;
      for (let x = -brickWidth + offset; x < width; x += brickWidth) {
        context.strokeRect(x, y, brickWidth, brickHeight);
      }
    }
  } else if (draft.patternId === "foliage") {
    const count = Math.round(55 + draft.tuning.scatter * 160);
    for (let index = 0; index < count; index += 1) {
      const point = points[Math.floor(random() * points.length)]!;
      const radius = scale * (0.32 + random() * 0.55);
      context.save();
      context.translate(
        point.x + (random() - 0.5) * scale * 3,
        point.y + (random() - 0.5) * scale * 2,
      );
      context.rotate(random() * Math.PI);
      context.beginPath();
      context.ellipse(0, 0, radius, radius * 0.38, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  } else if (draft.patternId === "stitch") {
    const step = Math.max(2, Math.round(5 * draft.tuning.patternScale));
    points.filter((_, index) => index % step === 0).forEach((point, index) => {
      context.save();
      context.translate(point.x, point.y);
      context.rotate(point.tangent);
      context.strokeRect(-scale * 0.42, -scale * 0.18, scale * 0.84, scale * 0.36);
      if (index > 0) {
        context.beginPath();
        context.moveTo(-scale * 0.72, 0);
        context.lineTo(-scale * 0.42, 0);
        context.stroke();
      }
      context.restore();
    });
  } else if (draft.patternId === "kaleido") {
    const centerX = width / 2;
    const centerY = height / 2;
    for (let arm = 0; arm < 8; arm += 1) {
      context.save();
      context.translate(centerX, centerY);
      context.rotate((Math.PI * 2 * arm) / 8);
      context.translate(-centerX, -centerY);
      traceStrokePath(context, points);
      context.stroke();
      context.restore();
    }
  } else if (draft.patternId === "flow-field") {
    for (let row = 0; row < 12; row += 1) {
      context.beginPath();
      for (let column = 0; column < 28; column += 1) {
        const x = (column / 27) * width;
        const y = (row / 11) * height
          + Math.sin(column * 0.52 + row * 0.7) * scale * 0.45;
        if (column === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
  }
  context.restore();
}

function drawFinishes(
  context: CanvasRenderingContext2D,
  draft: BrushStudioV5Draft,
  points: readonly PreviewPoint[],
): void {
  if (draft.finishIds.includes("neon-bloom")) {
    context.save();
    context.globalCompositeOperation = "screen";
    context.filter = "blur(16px)";
    context.strokeStyle = rgba(draft.primaryColor, 0.56);
    context.lineWidth = draft.tuning.size * 1.8;
    context.lineCap = "round";
    traceStrokePath(context, points);
    context.stroke();
    context.filter = "none";
    context.strokeStyle = "rgba(255,255,255,0.74)";
    context.lineWidth = Math.max(1, draft.tuning.size * 0.16);
    context.stroke();
    context.restore();
  }

  if (draft.finishIds.includes("relief-lighting")) {
    context.save();
    context.globalCompositeOperation = "screen";
    context.strokeStyle = "rgba(255,255,255,0.45)";
    context.lineWidth = Math.max(1, draft.tuning.relief * 5);
    traceStrokePath(context, points, -2);
    context.stroke();
    context.restore();
  }

  if (draft.finishIds.includes("wet-sheen")) {
    context.save();
    context.globalCompositeOperation = "screen";
    context.strokeStyle = "rgba(255,255,255,0.34)";
    context.lineWidth = Math.max(1, draft.tuning.size * 0.14);
    context.lineCap = "round";
    traceStrokePath(context, points, -draft.tuning.size * 0.12);
    context.stroke();
    context.restore();
  }
}

export function renderBrushStudioV5Preview(
  canvas: HTMLCanvasElement,
  draft: BrushStudioV5Draft,
  options: BrushStudioV5PreviewOptions = {},
): void {
  const cssWidth = Math.max(320, Math.round(canvas.clientWidth || 920));
  const cssHeight = Math.max(220, Math.round(canvas.clientHeight || 420));
  const pixelRatio = clamp(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 1, 2);
  const width = Math.round(cssWidth * pixelRatio);
  const height = Math.round(cssHeight * pixelRatio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  const settleProgress = clamp(options.settleProgress ?? 0.65);
  const random = seededRandom(draft.seed);
  const points = createStrokePoints(cssWidth, cssHeight);
  context.clearRect(0, 0, cssWidth, cssHeight);
  drawSurface(context, draft, cssWidth, cssHeight, random);

  if (
    draft.geometryId === "bristle-bundle"
    || draft.tipId === "bristle-fan"
    || draft.physicsIds.includes("bristle-dynamics")
  ) {
    drawBristles(context, draft, points, random);
  } else if (draft.geometryId === "particle-stream" || draft.materialId === "particle-paint") {
    drawParticles(context, draft, points, random, settleProgress);
  } else if (draft.materialId === "graphite" || draft.materialId === "charcoal" || draft.materialId === "wax") {
    drawDryMedia(context, draft, points, random);
  } else {
    drawContinuousStroke(context, draft, points);
  }

  if (draft.physicsIds.includes("particle-ballistics")) {
    drawParticles(context, draft, points, random, settleProgress);
  }
  drawWetEffects(context, draft, points, random, settleProgress);
  drawReactionDiffusion(context, draft, points, random, settleProgress);
  drawPattern(context, draft, cssWidth, cssHeight, points, random);
  drawFinishes(context, draft, points);

  context.save();
  context.fillStyle = "rgba(20,22,28,0.58)";
  context.font = "600 11px system-ui, sans-serif";
  context.fillText(
    `${draft.strokeEngineId} · ${draft.materialId} · ${draft.patternId}`,
    14,
    cssHeight - 14,
  );
  context.restore();
}
