import { DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS } from "../src/domains/creator/studio-living-ink-gpu-protocol";
import {
  createStudioLivingInkExecutionProvider,
  StudioLivingInkExecutionProvider,
  type StudioLivingInkWorkerLike,
} from "../src/domains/creator/studio-living-ink-provider";

import type {
  StudioLivingInkExecutionConfig,
  StudioLivingInkExecutionFrame,
  StudioLivingInkWorkerRequest,
} from "../src/domains/creator/studio-living-ink-execution-protocol";
import type {
  StudioLivingInkDepositOperation,
  StudioLivingInkOperation,
  StudioLivingInkSelectionMask,
} from "../src/domains/creator/studio-living-ink-field";
import type { StudioLivingInkDisplayMode } from "../src/domains/creator/studio-living-ink-gpu-protocol";

declare global {
  interface Window {
    __studioLivingInkExecutionResult?: unknown;
  }
}

const WIDTH = 256;
const HEIGHT = 160;

const config: StudioLivingInkExecutionConfig = {
  displayWidth: WIDTH,
  displayHeight: HEIGHT,
  fieldWidth: WIDTH,
  fieldHeight: HEIGHT,
  coarseBase: 128,
  seed: 0x1a2b3c4d,
  material: {
    ...DEFAULT_STUDIO_LIVING_INK_MATERIAL_CONTROLS,
    flow: 0.82,
    bleed: 0.72,
    capillaryCreep: 0.62,
    chromaticSeparation: 0.22,
    dryRate: 0.2,
  },
  displayMode: "composite",
};

class CrashableLivingInkWorker implements StudioLivingInkWorkerLike {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  private readonly worker = new Worker(
    new URL("../src/domains/creator/studio-living-ink.worker.ts", import.meta.url),
    { type: "module", name: "studio-living-ink-crash-recovery-qa" },
  );

  constructor() {
    this.worker.onmessage = (event) => this.onmessage?.(event);
    this.worker.onmessageerror = (event) => this.onmessageerror?.(event);
    this.worker.onerror = (event) => this.onerror?.(event);
  }

  postMessage(message: StudioLivingInkWorkerRequest): void {
    this.worker.postMessage(message);
  }

  terminate(): void {
    this.worker.terminate();
  }

  crash(): void {
    this.worker.terminate();
    this.onerror?.(new ErrorEvent("error", {
      message: "Intentional actual-Chromium Worker crash for provider epoch recovery QA.",
    }));
  }
}

function canvas(id: string): HTMLCanvasElement {
  const value = document.getElementById(id);
  if (!(value instanceof HTMLCanvasElement)) throw new Error(`Missing Living Ink canvas: ${id}`);
  return value;
}

function drawFrame(frame: StudioLivingInkExecutionFrame, id: string): ImageData {
  const target = canvas(id);
  const context = target.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error(`No 2D context for ${id}.`);
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(frame.image, 0, 0, target.width, target.height);
  frame.image.close();
  return context.getImageData(0, 0, target.width, target.height);
}

function darkness(image: ImageData, bounds = { x: 0, y: 0, width: WIDTH, height: HEIGHT }): number {
  let sum = 0;
  let count = 0;
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const index = (y * image.width + x) * 4;
      sum += 255 - ((image.data[index] ?? 255) + (image.data[index + 1] ?? 255) + (image.data[index + 2] ?? 255)) / 3;
      count += 1;
    }
  }
  return count ? sum / count : 0;
}

function differenceBounds(
  reference: ImageData,
  image: ImageData,
  threshold = 8,
): Readonly<{ x: number; y: number; width: number; height: number }> {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = (y * image.width + x) * 4;
      const difference = (
        Math.abs((image.data[index] ?? 0) - (reference.data[index] ?? 0))
        + Math.abs((image.data[index + 1] ?? 0) - (reference.data[index + 1] ?? 0))
        + Math.abs((image.data[index + 2] ?? 0) - (reference.data[index + 2] ?? 0))
      ) / 3;
      if (difference < threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < left
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function darkInk(
  sequence: number,
  marks: StudioLivingInkDepositOperation["marks"],
  selection: StudioLivingInkSelectionMask | null = null,
  tool: StudioLivingInkDepositOperation["tool"] = "brush",
): StudioLivingInkDepositOperation {
  return { kind: "ink", version: 1, sequence, tool, marks, selection };
}

function lineMarks(
  color: readonly [number, number, number, number] = [0.1, 0.18, 0.38, 1],
  y = HEIGHT / 2,
): StudioLivingInkDepositOperation["marks"] {
  return Array.from({ length: 45 }, (_, index) => ({
    x: 24 + index * 4.7,
    y: y + Math.sin(index * 0.31) * 5,
    radius: 3.2,
    pressure: 0.42 + 0.5 * Math.sin(index / 44 * Math.PI),
    speed: 180,
    waterMass: 0.46,
    pigmentMass: 0.42,
    color,
  }));
}

function constantLongStrokeMarks(): StudioLivingInkDepositOperation["marks"] {
  return Array.from({ length: 73 }, (_, index) => ({
    x: 18 + index * 3.05,
    y: 122 + Math.sin(index * 0.11) * 2.2,
    radius: 4.4,
    pressure: 0.72,
    speed: 210,
    waterMass: 0.12,
    pigmentMass: 0.34,
    color: [0.035, 0.05, 0.08, 1] as const,
  }));
}

function figureEightMarks(): StudioLivingInkDepositOperation["marks"] {
  return Array.from({ length: 129 }, (_, index) => {
    const angle = index / 128 * Math.PI * 2;
    return {
      x: WIDTH / 2 + Math.sin(angle) * 54,
      y: HEIGHT / 2 + Math.sin(angle * 2) * 25,
      radius: 4.4,
      pressure: 0.72,
      speed: 210,
      waterMass: 0.12,
      pigmentMass: 0.34,
      color: [0.035, 0.05, 0.08, 1] as const,
    };
  });
}

function waterMarks(y = HEIGHT / 2): Extract<StudioLivingInkOperation, { kind: "water" }>["marks"] {
  return Array.from({ length: 17 }, (_, index) => ({
    x: 88 + index * 5,
    y: y + Math.sin(index * 0.46) * 7,
    // InkWash's default brush is roughly 17-23 display pixels at this pressure; use the same
    // physical brush/pen size ratio instead of benchmarking ToonSpectrum with an undersized wash.
    radius: 18,
    pressure: 0.3 + Math.sin(index / 16 * Math.PI) * 0.58,
    speed: 95,
    waterMass: 1.1,
  }));
}

function radialBloomWaterMarks(): Extract<StudioLivingInkOperation, { kind: "water" }>["marks"] {
  return [{
    x: WIDTH / 2,
    y: HEIGHT / 2,
    radius: 15,
    pressure: 0.86,
    speed: 0,
    waterMass: 2.4,
  }];
}

function selectionMask(coverage: (x: number, y: number) => number): StudioLivingInkSelectionMask {
  return {
    kind: "studio-living-ink-selection-mask",
    version: 1,
    bounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    coverage: Array.from({ length: WIDTH * HEIGHT }, (_, index) => (
      coverage(index % WIDTH, Math.floor(index / WIDTH))
    )),
  };
}

function lightening(before: ImageData, after: ImageData, bounds: Readonly<{ x: number; y: number; width: number; height: number }>): number {
  return darkness(before, bounds) - darkness(after, bounds);
}

function regionStats(image: ImageData, bounds: Readonly<{ x: number; y: number; width: number; height: number }>): Readonly<{
  mean: number;
  maximum: number;
  standardDeviation: number;
}> {
  const values: number[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const index = (y * image.width + x) * 4;
      values.push(255 - ((image.data[index] ?? 255) + (image.data[index + 1] ?? 255) + (image.data[index + 2] ?? 255)) / 3);
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  return { mean, maximum: Math.max(...values), standardDeviation: Math.sqrt(variance) };
}

function meanAbsoluteDifference(
  left: ImageData,
  right: ImageData,
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
): number {
  let sum = 0;
  let count = 0;
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const index = (y * left.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        sum += Math.abs((left.data[index + channel] ?? 0) - (right.data[index + channel] ?? 0));
        count += 1;
      }
    }
  }
  return sum / Math.max(1, count);
}

function highFrequencyResidual(
  image: ImageData,
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
): number {
  let sum = 0;
  let count = 0;
  for (let y = bounds.y + 1; y < bounds.y + bounds.height - 1; y += 1) {
    for (let x = bounds.x + 1; x < bounds.x + bounds.width - 1; x += 1) {
      const value = darkness(image, { x, y, width: 1, height: 1 });
      const neighborhood = (
        darkness(image, { x: x - 1, y, width: 1, height: 1 })
        + darkness(image, { x: x + 1, y, width: 1, height: 1 })
        + darkness(image, { x, y: y - 1, width: 1, height: 1 })
        + darkness(image, { x, y: y + 1, width: 1, height: 1 })
      ) / 4;
      sum += Math.abs(value - neighborhood);
      count += 1;
    }
  }
  return sum / Math.max(1, count);
}

function pixelDarkness(image: ImageData, x: number, y: number): number {
  const clampedX = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const clampedY = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const index = (clampedY * image.width + clampedX) * 4;
  return 255 - (
    (image.data[index] ?? 255)
    + (image.data[index + 1] ?? 255)
    + (image.data[index + 2] ?? 255)
  ) / 3;
}

function relativePixelDarkness(reference: ImageData, image: ImageData, x: number, y: number): number {
  return Math.max(0, pixelDarkness(image, x, y) - pixelDarkness(reference, x, y));
}

function continuousCenterlineMetrics(
  reference: ImageData,
  image: ImageData,
  marks: StudioLivingInkDepositOperation["marks"],
): Readonly<{
  normalizedHighFrequencyResidual: number;
  maximumAdjacentJumpRatio: number;
  startEndToInteriorRatio: number;
  minimumToMedianRatio: number;
}> {
  const values: number[] = [];
  for (let index = 1; index < marks.length; index += 1) {
    const previous = marks[index - 1]!;
    const current = marks[index]!;
    for (let step = 0; step < 4; step += 1) {
      const ratio = step / 4;
      values.push(relativePixelDarkness(
        reference,
        image,
        previous.x + (current.x - previous.x) * ratio,
        previous.y + (current.y - previous.y) * ratio,
      ));
    }
  }
  const sorted = [...values].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 1;
  let residual = 0;
  let maximumAdjacentJump = 0;
  for (let index = 2; index < values.length - 2; index += 1) {
    const localTrend = (
      values[index - 2]!
      + values[index - 1]!
      + values[index]!
      + values[index + 1]!
      + values[index + 2]!
    ) / 5;
    residual += Math.abs(values[index]! - localTrend);
    maximumAdjacentJump = Math.max(
      maximumAdjacentJump,
      Math.abs(values[index]! - values[index - 1]!),
    );
  }
  const edgeCount = Math.max(4, Math.floor(values.length * 0.06));
  const edgeMean = (
    values.slice(0, edgeCount).reduce((sum, value) => sum + value, 0)
    + values.slice(-edgeCount).reduce((sum, value) => sum + value, 0)
  ) / (edgeCount * 2);
  const interior = values.slice(edgeCount, -edgeCount);
  const interiorMean = interior.reduce((sum, value) => sum + value, 0)
    / Math.max(1, interior.length);
  return Object.freeze({
    normalizedHighFrequencyResidual: residual
      / Math.max(1, values.length - 4)
      / Math.max(1, median),
    maximumAdjacentJumpRatio: maximumAdjacentJump / Math.max(1, median),
    startEndToInteriorRatio: edgeMean / Math.max(1, interiorMean),
    minimumToMedianRatio: Math.min(...interior) / Math.max(1, median),
  });
}

function selfIntersectionLuminanceRatio(reference: ImageData, image: ImageData): number {
  const center = relativePixelDarkness(reference, image, WIDTH / 2, HEIGHT / 2);
  const armAngles = [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4];
  const arms = armAngles.map((angle) => relativePixelDarkness(
    reference,
    image,
    WIDTH / 2 + Math.sin(angle) * 54,
    HEIGHT / 2 + Math.sin(angle * 2) * 25,
  ));
  return center / Math.max(1, arms.reduce((sum, value) => sum + value, 0) / arms.length);
}

function radialBloomShape(
  before: ImageData,
  after: ImageData,
  centerX: number,
  centerY: number,
): Readonly<{
  meanRadius: number;
  coefficientOfVariation: number;
  maximumAdjacentJumpRatio: number;
  normalizedHighFrequencyEdgeCurvature: number;
  angularCoverage: number;
  dominantLobeCount: number;
}> {
  const angularSamples = 72;
  const maximumRadius = 42;
  const radii = new Array<number>(angularSamples).fill(0);
  for (let angleIndex = 0; angleIndex < angularSamples; angleIndex += 1) {
    const angle = angleIndex / angularSamples * Math.PI * 2;
    for (let radius = 2; radius <= maximumRadius; radius += 1) {
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      if (Math.abs(pixelDarkness(after, x, y) - pixelDarkness(before, x, y)) >= 2.25) {
        radii[angleIndex] = radius;
      }
    }
  }
  const active = radii.filter((radius) => radius >= 3);
  const meanRadius = active.reduce((sum, radius) => sum + radius, 0) / Math.max(1, active.length);
  const variance = active.reduce(
    (sum, radius) => sum + (radius - meanRadius) ** 2,
    0,
  ) / Math.max(1, active.length);
  let maximumAdjacentJump = 0;
  let curvature = 0;
  for (let index = 0; index < radii.length; index += 1) {
    maximumAdjacentJump = Math.max(
      maximumAdjacentJump,
      Math.abs((radii[index] ?? 0) - (radii[(index + 1) % radii.length] ?? 0)),
    );
    curvature += Math.abs(
      (radii[(index + radii.length - 1) % radii.length] ?? 0)
      - 2 * (radii[index] ?? 0)
      + (radii[(index + 1) % radii.length] ?? 0),
    );
  }
  const smoothed = radii.map((_, index) => {
    let sum = 0;
    for (let offset = -3; offset <= 3; offset += 1) {
      sum += radii[(index + offset + radii.length) % radii.length] ?? 0;
    }
    return sum / 7;
  });
  const smoothedMean = smoothed.reduce((sum, radius) => sum + radius, 0) / smoothed.length;
  const dominantLobeCount = smoothed.filter((radius, index) => (
    radius >= smoothedMean + 0.55
    && radius > (smoothed[(index + smoothed.length - 1) % smoothed.length] ?? 0)
    && radius >= (smoothed[(index + 1) % smoothed.length] ?? 0)
  )).length;
  return Object.freeze({
    meanRadius,
    coefficientOfVariation: Math.sqrt(variance) / Math.max(1, meanRadius),
    maximumAdjacentJumpRatio: maximumAdjacentJump / Math.max(1, meanRadius),
    normalizedHighFrequencyEdgeCurvature: curvature
      / radii.length
      / Math.max(1, meanRadius),
    angularCoverage: active.length / angularSamples,
    dominantLobeCount,
  });
}

function bloomAsymmetry(
  before: ImageData,
  after: ImageData,
  centerX: number,
  centerY: number,
  maximumRadius: number,
): Readonly<{
  leftRightMirrorResidual: number;
  topBottomMirrorResidual: number;
  centroidOffsetX: number;
  centroidOffsetY: number;
}> {
  const effect = (x: number, y: number): number => Math.abs(
    pixelDarkness(after, x, y) - pixelDarkness(before, x, y)
  );
  let leftRightDifference = 0;
  let leftRightEnergy = 0;
  let topBottomDifference = 0;
  let topBottomEnergy = 0;
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;
  for (let offsetY = -maximumRadius; offsetY <= maximumRadius; offsetY += 1) {
    for (let offsetX = -maximumRadius; offsetX <= maximumRadius; offsetX += 1) {
      if (Math.hypot(offsetX, offsetY) > maximumRadius) continue;
      const value = effect(centerX + offsetX, centerY + offsetY);
      const horizontalMirror = effect(centerX - offsetX, centerY + offsetY);
      const verticalMirror = effect(centerX + offsetX, centerY - offsetY);
      leftRightDifference += Math.abs(value - horizontalMirror);
      leftRightEnergy += Math.max(value, horizontalMirror);
      topBottomDifference += Math.abs(value - verticalMirror);
      topBottomEnergy += Math.max(value, verticalMirror);
      const weight = Math.max(0, value - 1.5);
      weightedX += (centerX + offsetX) * weight;
      weightedY += (centerY + offsetY) * weight;
      totalWeight += weight;
    }
  }
  return Object.freeze({
    leftRightMirrorResidual: leftRightDifference / Math.max(1, leftRightEnergy),
    topBottomMirrorResidual: topBottomDifference / Math.max(1, topBottomEnergy),
    centroidOffsetX: weightedX / Math.max(1, totalWeight) - centerX,
    centroidOffsetY: weightedY / Math.max(1, totalWeight) - centerY,
  });
}

function maximumRgbDifference(
  left: ImageData,
  right: ImageData,
): number {
  let maximum = 0;
  for (let index = 0; index < left.data.length; index += 4) {
    maximum = Math.max(
      maximum,
      Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0)),
      Math.abs((left.data[index + 1] ?? 0) - (right.data[index + 1] ?? 0)),
      Math.abs((left.data[index + 2] ?? 0) - (right.data[index + 2] ?? 0)),
    );
  }
  return maximum;
}

function circularDarkness(
  image: ImageData,
  centerX: number,
  centerY: number,
  minimumRadius: number,
  maximumRadius: number,
): number {
  let sum = 0;
  let count = 0;
  const left = Math.max(0, Math.floor(centerX - maximumRadius));
  const right = Math.min(image.width - 1, Math.ceil(centerX + maximumRadius));
  const top = Math.max(0, Math.floor(centerY - maximumRadius));
  const bottom = Math.min(image.height - 1, Math.ceil(centerY + maximumRadius));
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const radius = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      if (radius < minimumRadius || radius >= maximumRadius) continue;
      sum += pixelDarkness(image, x, y);
      count += 1;
    }
  }
  return sum / Math.max(1, count);
}

function redBlueCentroidSeparation(
  image: ImageData,
  bounds: Readonly<{ x: number; y: number; width: number; height: number }>,
): number {
  const centroid = (channel: 0 | 2): readonly [number, number] => {
    let minimumDarkness = Number.POSITIVE_INFINITY;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const value = 255 - (image.data[(y * image.width + x) * 4 + channel] ?? 255);
        minimumDarkness = Math.min(minimumDarkness, value);
      }
    }
    let weightedX = 0;
    let weightedY = 0;
    let totalWeight = 0;
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
        const value = 255 - (image.data[(y * image.width + x) * 4 + channel] ?? 255);
        const weight = Math.max(0, value - minimumDarkness - 1);
        weightedX += x * weight;
        weightedY += y * weight;
        totalWeight += weight;
      }
    }
    return totalWeight > 0
      ? [weightedX / totalWeight, weightedY / totalWeight]
      : [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
  };
  const red = centroid(0);
  const blue = centroid(2);
  return Math.hypot(red[0] - blue[0], red[1] - blue[1]);
}

async function render(
  provider: StudioLivingInkExecutionProvider,
  mode: StudioLivingInkDisplayMode,
  id: string,
): Promise<Readonly<{ image: ImageData; hash: string }>> {
  const frame = await provider.render(mode);
  const hash = frame.receipt.displaySha256;
  return { image: drawFrame(frame, id), hash };
}

function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}

async function bottomUpHash(image: ImageData): Promise<`sha256:${string}`> {
  const normalized = new Uint8Array(image.data.length);
  const stride = image.width * 4;
  for (let row = 0; row < image.height; row += 1) {
    normalized.set(
      image.data.subarray(row * stride, row * stride + stride),
      (image.height - 1 - row) * stride,
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", normalized);
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

async function deterministicHash(
  color: readonly [number, number, number, number] = [0.1, 0.18, 0.38, 1],
): Promise<string> {
  const provider = await createStudioLivingInkExecutionProvider(config);
  try {
    const frame = await provider.apply(darkInk(1, lineMarks(color)));
    const hash = frame.receipt.displaySha256;
    frame.image.close();
    return hash;
  } finally {
    await provider.dispose();
  }
}

async function main(): Promise<void> {
  let maximumMainThreadDelayMilliseconds = 0;
  let expected = performance.now() + 4;
  const timer = window.setInterval(() => {
    const now = performance.now();
    maximumMainThreadDelayMilliseconds = Math.max(maximumMainThreadDelayMilliseconds, now - expected);
    expected = now + 4;
  }, 4);
  const providers: StudioLivingInkExecutionProvider[] = [];
  try {
    // Constructed by hand rather than through the factory so the harness keeps the capability
    // record the Worker answers with: it names the runtime that actually executed (WebGL2 GLSL or
    // the WGSL field runtime), which is what makes this probe a per-backend gate instead of a
    // gate on whichever backend the launch flags happened to select.
    const bloomProvider = new StudioLivingInkExecutionProvider(config);
    providers.push(bloomProvider);
    const capabilities = await bloomProvider.initialize();
    const lineFrame = await bloomProvider.apply(darkInk(1, lineMarks()));
    const lineReceiptHash = lineFrame.receipt.displaySha256;
    const lineReceiptBackend = lineFrame.receipt.backend;
    const lineImage = drawFrame(lineFrame, "line");
    const normalizedDisplayHash = await bottomUpHash(lineImage);
    const waterFrame = await bloomProvider.apply({
      kind: "water",
      version: 1,
      sequence: 2,
      tool: "water-brush",
      marks: waterMarks(),
      selection: null,
    });
    waterFrame.image.close();
    const bloomFrame = await bloomProvider.apply({ kind: "advance", version: 1, sequence: 3, fixedTicks: 36 });
    const bloomReceipt = bloomFrame.receipt;
    const bloomImage = drawFrame(bloomFrame, "bloom");
    await render(bloomProvider, "water", "water-field");
    await render(bloomProvider, "flow", "flow-field");

    const continuousProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(continuousProvider);
    const continuousMarks = constantLongStrokeMarks();
    const continuousFrame = await continuousProvider.apply(
      darkInk(1, continuousMarks, null, "pen"),
    );
    const continuousImage = drawFrame(continuousFrame, "long-stroke");

    const intersectionProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(intersectionProvider);
    const intersectionFrame = await intersectionProvider.apply(
      darkInk(1, figureEightMarks(), null, "pen"),
    );
    const intersectionImage = drawFrame(intersectionFrame, "self-intersection");

    const radialProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(radialProvider);
    const radialBaseFrame = await radialProvider.apply(darkInk(1, [{
      x: WIDTH / 2,
      y: HEIGHT / 2,
      radius: 7,
      pressure: 0.82,
      speed: 0,
      waterMass: 0.9,
      pigmentMass: 0.42,
      color: [0.18, 0.34, 0.58, 1],
    }], null, "pigment-water-brush"));
    const radialBaseImage = drawFrame(radialBaseFrame, "radial-wash");
    const radialWaterFrame = await radialProvider.apply({
      kind: "water",
      version: 1,
      sequence: 2,
      tool: "water-brush",
      marks: radialBloomWaterMarks(),
      selection: null,
    });
    radialWaterFrame.image.close();
    const radialWashFrame = await radialProvider.apply({
      kind: "advance",
      version: 1,
      sequence: 3,
      fixedTicks: 42,
    });
    const radialWashImage = drawFrame(radialWashFrame, "radial-wash");

    const fixProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(fixProvider);
    (await fixProvider.apply(darkInk(1, lineMarks([0.16, 0.12, 0.08, 1], 73)))).image.close();
    (await fixProvider.apply({ kind: "fix", version: 1, sequence: 2, scope: "all", selection: null }, { quality: "settle" })).image.close();
    const fixedBefore = await render(fixProvider, "fixed-pigment", "fixed-before");
    (await fixProvider.apply({
      kind: "water",
      version: 1,
      sequence: 3,
      tool: "water-brush",
      marks: waterMarks(73),
      selection: null,
    })).image.close();
    (await fixProvider.apply({ kind: "advance", version: 1, sequence: 4, fixedTicks: 36 })).image.close();
    const fixedAfter = await render(fixProvider, "fixed-pigment", "fixed-after");

    const selectionProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(selectionProvider);
    const selectionBeforeFrame = await selectionProvider.apply(darkInk(1, lineMarks([0.08, 0.08, 0.08, 1], 48)));
    const selectionBeforeImage = drawFrame(selectionBeforeFrame, "selection");
    const asymmetric = selectionMask((x, y) => {
      if (y >= 80 || x >= 128) return 0;
      return x < 64 ? 0.5 : 1;
    });
    const selectedClear = await selectionProvider.apply({
      kind: "clear",
      version: 1,
      sequence: 2,
      scope: "selection",
      selection: asymmetric,
    });
    const selectionImage = drawFrame(selectedClear, "selection");
    const cleared = await selectionProvider.apply({ kind: "clear", version: 1, sequence: 3, scope: "all", selection: null });
    const clearImage = drawFrame(cleared, "clear");

    const whiteProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(whiteProvider);
    const center = [{
      x: 128, y: 80, radius: 22, pressure: 0.9, speed: 0,
      waterMass: 0.6, pigmentMass: 1.3, color: [0.04, 0.04, 0.04, 1] as const,
    }];
    const layeringJournal: readonly StudioLivingInkOperation[] = Object.freeze([
      darkInk(1, center),
      { kind: "fix", version: 1, sequence: 2, scope: "all", selection: null },
      darkInk(
        3,
        [{ ...center[0]!, pigmentMass: 1.1, color: [1, 1, 1, 1] }],
        null,
        "white-gouache",
      ),
      { kind: "fix", version: 1, sequence: 4, scope: "all", selection: null },
      darkInk(5, [{ ...center[0]!, radius: 12, pigmentMass: 0.9 }]),
      { kind: "fix", version: 1, sequence: 6, scope: "all", selection: null },
    ]);
    (await whiteProvider.apply(layeringJournal[0]!)).image.close();
    (await whiteProvider.apply(layeringJournal[1]!, { quality: "settle" })).image.close();
    const darkBase = await render(whiteProvider, "fixed-pigment", "white-layer");
    (await whiteProvider.apply(layeringJournal[2]!)).image.close();
    (await whiteProvider.apply(layeringJournal[3]!, { quality: "settle" })).image.close();
    const whiteLayer = await render(whiteProvider, "fixed-pigment", "white-layer");
    (await whiteProvider.apply(layeringJournal[4]!)).image.close();
    (await whiteProvider.apply(layeringJournal[5]!, { quality: "settle" })).image.close();
    const darkOverWhite = await render(whiteProvider, "fixed-pigment", "dark-over-white");

    // This is the product restore boundary: JSON-safe operation journal -> fresh Worker -> fresh
    // WebGL2 runtime. Half-float textures are deliberately not persisted as cross-device truth.
    const persistedLayeringJournal = JSON.parse(
      JSON.stringify(layeringJournal),
    ) as StudioLivingInkOperation[];
    const reloadedLayeringProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(reloadedLayeringProvider);
    let reloadedWhiteHash = "";
    let reloadedDarkOverWhiteHash = "";
    for (let index = 0; index < persistedLayeringJournal.length; index += 1) {
      const operation = persistedLayeringJournal[index]!;
      const frame = await reloadedLayeringProvider.apply(
        operation,
        operation.kind === "fix" ? { quality: "settle" } : {},
      );
      frame.image.close();
      if (index === 3 || index === 5) {
        const rendered = await reloadedLayeringProvider.render("fixed-pigment");
        if (index === 3) reloadedWhiteHash = rendered.receipt.displaySha256;
        else reloadedDarkOverWhiteHash = rendered.receipt.displaySha256;
        rendered.image.close();
      }
    }

    const cancelProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(cancelProvider);
    const cancelInk = await cancelProvider.apply(darkInk(1, lineMarks([0.08, 0.13, 0.2, 1], 104)));
    const cancelBeforeHash = cancelInk.receipt.displaySha256;
    cancelInk.image.close();
    const controller = new AbortController();
    const fixing = cancelProvider.apply(
      { kind: "fix", version: 1, sequence: 2, scope: "all", selection: null },
      { quality: "settle" },
      controller.signal,
    );
    window.setTimeout(() => controller.abort(), 6);
    let cancelRejected = false;
    try {
      const unexpectedlyFinished = await fixing;
      unexpectedlyFinished.image.close();
    } catch (error) {
      cancelRejected = error instanceof Error && error.name === "AbortError";
    }
    const afterCancel = await render(cancelProvider, "composite", "cancel-recovery");

    const deterministicA = await deterministicHash();
    const deterministicB = await deterministicHash();
    const nearBlackBelowFloor = await deterministicHash([0.001, 0.008, 0.014, 1]);
    const nearBlackAtFloor = await deterministicHash([0.015, 0.015, 0.015, 1]);

    const crashWorkers: CrashableLivingInkWorker[] = [];
    const crashProvider = new StudioLivingInkExecutionProvider(config, {
      requestTimeoutMilliseconds: 10_000,
      workerFactory: () => {
        const worker = new CrashableLivingInkWorker();
        crashWorkers.push(worker);
        return worker;
      },
    });
    providers.push(crashProvider);
    await crashProvider.initialize();
    (await crashProvider.apply(darkInk(1, lineMarks()))).image.close();
    const crashRequest = crashProvider.apply(
      { kind: "fix", version: 1, sequence: 2, scope: "all", selection: null },
      { quality: "settle" },
    );
    window.setTimeout(() => crashWorkers.at(-1)?.crash(), 4);
    let workerCrashRejected = false;
    try {
      const unexpectedFrame = await crashRequest;
      unexpectedFrame.image.close();
    } catch (error) {
      workerCrashRejected = error instanceof Error
        && error.message.includes("Intentional actual-Chromium Worker crash");
    }
    const recoveredCapabilities = await crashProvider.initialize();
    const recoveredFrame = await crashProvider.apply(darkInk(1, lineMarks()));
    const recoveredFrameHash = recoveredFrame.receipt.displaySha256;
    recoveredFrame.image.close();

    const interactiveElapsed: number[] = [];
    const performanceProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(performanceProvider);
    const performanceWarmup = await performanceProvider.apply(darkInk(1, [{
      x: 16, y: 132, radius: 2.4, pressure: 0.55, speed: 240,
      waterMass: 0.2, pigmentMass: 0.13, color: [0.12, 0.12, 0.16, 1],
    }], null, "pen"));
    performanceWarmup.image.close();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
    maximumMainThreadDelayMilliseconds = 0;
    for (let sequence = 2; sequence <= 9; sequence += 1) {
      const frame = await performanceProvider.apply(darkInk(sequence, [{
        x: 24 + sequence * 22,
        y: 132,
        radius: 2.4,
        pressure: 0.55,
        speed: 240,
        waterMass: 0.2,
        pigmentMass: 0.13,
        color: [0.12, 0.12, 0.16, 1],
      }], null, "pen"));
      interactiveElapsed.push(frame.receipt.elapsedMilliseconds);
      frame.image.close();
    }

    // 81 coalesced samples exercise the product execution contract: every operation is applied in
    // order, while simulation ACKs allocate no RGBA8 readback or ImageBitmap. One explicit render
    // must be pixel-identical to the legacy present-every-operation endpoint.
    const presentationOperations = Array.from({ length: 81 }, (_, index) => darkInk(index + 1, [{
      x: 18 + index * 2.68,
      y: 26 + Math.sin(index * 0.17) * 6,
      radius: 2.8 + Math.sin(index * 0.11) * 0.35,
      pressure: 0.44 + Math.sin(index / 80 * Math.PI) * 0.42,
      speed: 220,
      waterMass: 0.13,
      pigmentMass: 0.18,
      color: [0.08, 0.12, 0.2, 1] as const,
    }], null, "pen"));
    const presentEveryOperationProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(presentEveryOperationProvider);
    let presentEveryOperationHash = "";
    let presentEveryOperationFrames = 0;
    for (const operation of presentationOperations) {
      const frame = await presentEveryOperationProvider.apply(operation);
      presentEveryOperationHash = frame.receipt.displaySha256;
      presentEveryOperationFrames += 1;
      frame.image.close();
    }
    const deferredPresentationProvider = await createStudioLivingInkExecutionProvider(config);
    providers.push(deferredPresentationProvider);
    let deferredAckCount = 0;
    let deferredAckReadbacks = 0;
    let deferredAckBitmaps = 0;
    for (const operation of presentationOperations) {
      const applied = await deferredPresentationProvider.apply(operation, { present: false });
      if (applied.kind === "living-ink/applied") deferredAckCount += 1;
      deferredAckReadbacks += applied.displayReadbackCount;
      deferredAckBitmaps += applied.imageBitmapCount;
    }
    const deferredFrame = await deferredPresentationProvider.render("composite");
    const deferredPresentationHash = deferredFrame.receipt.displaySha256;
    const deferredFinalRevision = deferredFrame.receipt.revision;
    deferredFrame.image.close();

    const quarter = { width: 64, height: 40 };
    const lineRegion = { x: 18, y: 58, width: 220, height: 46 };
    const bloomRegion = { x: 82, y: 56, width: 92, height: 52 };
    const lineStats = regionStats(lineImage, lineRegion);
    const paperStats = regionStats(clearImage, lineRegion);
    const bloomStats = regionStats(bloomImage, bloomRegion);
    const centerRegion = { x: 112, y: 64, width: 32, height: 32 };
    const isolatedBloomShape = radialBloomShape(
      radialBaseImage,
      radialWashImage,
      WIDTH / 2,
      HEIGHT / 2,
    );
    const isolatedBloomAsymmetry = bloomAsymmetry(
      radialBaseImage,
      radialWashImage,
      WIDTH / 2,
      HEIGHT / 2,
      38,
    );
    const radialWashRegion = { x: 92, y: 44, width: 72, height: 72 };
    const radialCenterDarkness = circularDarkness(
      radialWashImage,
      WIDTH / 2,
      HEIGHT / 2,
      0,
      7,
    );
    const radialRimDarkness = circularDarkness(
      radialWashImage,
      WIDTH / 2,
      HEIGHT / 2,
      10,
      20,
    );
    const fixedMaximumRgbDifference = maximumRgbDifference(fixedBefore.image, fixedAfter.image);
    const paperCenterLuminance = 255 - darkness(clearImage, centerRegion);
    const lineDifferenceBounds = differenceBounds(clearImage, lineImage);
    const bloomDifferenceBounds = differenceBounds(clearImage, bloomImage);
    const radialDifferenceBounds = differenceBounds(clearImage, radialWashImage, 5);
    const centerlineQuality = continuousCenterlineMetrics(
      clearImage,
      continuousImage,
      continuousMarks,
    );
    const washBandDarkness = Array.from({ length: 5 }, (_, index) => {
      const bounds = { x: 83 + index * 18, y: 50, width: 18, height: 60 };
      return Math.max(0, darkness(bloomImage, bounds) - darkness(clearImage, bounds));
    });
    const washBandMaximum = Math.max(...washBandDarkness);
    const isolatedAspectRatio = Math.max(
      radialDifferenceBounds.width / Math.max(1, radialDifferenceBounds.height),
      radialDifferenceBounds.height / Math.max(1, radialDifferenceBounds.width),
    );
    const result = {
      status: "ok",
      /*
       * Backend identity comes from the *receipt* — the runtime that actually executed the
       * operation — not from the capability record.
       *
       * `capabilities.backend` is not a reliable witness here. When the WGSL runtime is refused,
       * the WebGPU factory falls back to a WebGL2 runtime and stamps
       * `backend: "webgpu-offscreen-half-float"` onto its capabilities so callers can still see
       * that a GPU device exists. Reading identity from that stamp let a whole lane run GLSL while
       * reporting itself as the WGSL lane: two WGSL kernels failed to compile (an invalid pipeline
       * silently drops its dispatches), the runtime was rejected, WebGL2 answered every operation,
       * and the visual numbers looked like near-parity because they *were* GLSL's numbers.
       * `receipt.backend` is written by the runtime that ran, so it cannot be stamped over.
       */
      backend: lineReceiptBackend === "webgpu-offscreen-half-float"
        ? "real-chromium-dedicated-worker-offscreen-webgpu-half-float-v1"
        : "real-chromium-dedicated-worker-offscreen-webgl2-half-float-v1",
      executedBackend: lineReceiptBackend,
      capabilities,
      viewport: { width: WIDTH, height: HEIGHT },
      executionContract: {
        worker: capabilities.worker,
        offscreenCanvas: capabilities.offscreenCanvas,
        // Either GPU API is acceptable; the runner asserts which one this lane was meant to get.
        gpuApi: capabilities.webgl2 || capabilities.webgpu,
        webgl2: capabilities.webgl2,
        webgpu: capabilities.webgpu,
        halfFloatFields: capabilities.halfFloatRenderable,
        rgba8Readback: true,
      },
      line: {
        receiptHash: lineReceiptHash,
        normalizedDisplayHash,
        normalizedDisplayHashMatchesReceipt: normalizedDisplayHash === lineReceiptHash,
        darkness: darkness(lineImage),
        bounds: lineDifferenceBounds,
      },
      bloom: {
        receipt: bloomReceipt,
        darkness: darkness(bloomImage),
        bounds: bloomDifferenceBounds,
      },
      visualQuality: {
        sumiLocalContrast: lineStats.mean - paperStats.mean,
        sumiPeakDensityOverPaper: lineStats.maximum - paperStats.mean,
        pigmentRegionStandardDeviation: lineStats.standardDeviation,
        fiberGranulationResidual: highFrequencyResidual(bloomImage, bloomRegion),
        bloomEdgeConcentration: bloomStats.maximum - bloomStats.mean,
        lineWashHeightExpansion: bloomDifferenceBounds.height - lineDifferenceBounds.height,
        isolatedBloomRadialShape: isolatedBloomShape,
        isolatedBloomAsymmetry,
        isolatedBloomBounds: radialDifferenceBounds,
        isolatedBloomGranulationResidual: highFrequencyResidual(
          radialWashImage,
          radialWashRegion,
        ),
        isolatedBloomRimMinusCenterDarkness: radialRimDarkness - radialCenterDarkness,
        isolatedBloomAspectRatio: isolatedAspectRatio,
        centralWashBandToMaximumRatio: washBandDarkness[2]! / Math.max(1, washBandMaximum),
        minimumWashBandToMaximumRatio: Math.min(...washBandDarkness) / Math.max(1, washBandMaximum),
        washBandDarkness,
        continuousCapsule: centerlineQuality,
        selfIntersectionLuminanceRatio: selfIntersectionLuminanceRatio(
          clearImage,
          intersectionImage,
        ),
        redBlueCentroidSeparationPixels: redBlueCentroidSeparation(
          bloomImage,
          bloomRegion,
        ),
        paperLuminanceStandardDeviation: paperStats.standardDeviation,
        wetSheenAndBloomDifference: meanAbsoluteDifference(lineImage, bloomImage, bloomRegion),
        whiteCoverageLightening: lightening(darkBase.image, whiteLayer.image, centerRegion),
        whiteCenterLuminance: 255 - darkness(whiteLayer.image, centerRegion),
        whiteCenterLuminanceDeltaFromPaper: Math.abs(
          paperCenterLuminance - (255 - darkness(whiteLayer.image, centerRegion)),
        ),
        darkOverWhiteDensityGain: darkness(darkOverWhite.image, centerRegion) - darkness(whiteLayer.image, centerRegion),
      },
      fixedInvariant: {
        beforeHash: fixedBefore.hash,
        afterWaterAndAdvanceHash: fixedAfter.hash,
        exact: fixedBefore.hash === fixedAfter.hash,
        maximumRgbDifference: fixedMaximumRgbDifference,
      },
      selection: {
        partialTopLeftLightening: lightening(selectionBeforeImage, selectionImage, { x: 0, y: 28, ...quarter }),
        fullTopMiddleLightening: lightening(selectionBeforeImage, selectionImage, { x: 64, y: 28, ...quarter }),
        untouchedTopRightLightening: lightening(selectionBeforeImage, selectionImage, { x: 128, y: 28, width: 128, height: 40 }),
        untouchedBottomLightening: lightening(selectionBeforeImage, selectionImage, { x: 0, y: 100, width: 256, height: 40 }),
        partialTopLeftDarkness: darkness(selectionImage, { x: 0, y: 28, ...quarter }),
        fullTopMiddleDarkness: darkness(selectionImage, { x: 64, y: 28, ...quarter }),
        untouchedTopRightDarkness: darkness(selectionImage, { x: 128, y: 28, width: 128, height: 40 }),
        untouchedBottomDarkness: darkness(selectionImage, { x: 0, y: 100, width: 256, height: 40 }),
      },
      clearDarkness: darkness(clearImage),
      layering: {
        whiteCenterDarkness: darkness(whiteLayer.image, { x: 112, y: 64, width: 32, height: 32 }),
        darkOverWhiteCenterDarkness: darkness(darkOverWhite.image, { x: 112, y: 64, width: 32, height: 32 }),
      },
      persistedJournalReload: {
        serialization: "json-operation-journal-fresh-worker-runtime",
        operationCount: persistedLayeringJournal.length,
        whiteHashBeforeReload: whiteLayer.hash,
        whiteHashAfterReload: reloadedWhiteHash,
        whiteExact: whiteLayer.hash === reloadedWhiteHash,
        darkOverWhiteHashBeforeReload: darkOverWhite.hash,
        darkOverWhiteHashAfterReload: reloadedDarkOverWhiteHash,
        darkOverWhiteExact: darkOverWhite.hash === reloadedDarkOverWhiteHash,
      },
      cancelRecovery: {
        rejected: cancelRejected,
        beforeHash: cancelBeforeHash,
        afterHash: afterCancel.hash,
        exact: cancelBeforeHash === afterCancel.hash,
      },
      deterministicReplay: {
        firstHash: deterministicA,
        secondHash: deterministicB,
        sameRuntimeClassExact: deterministicA === deterministicB,
        crossDeviceBitExactClaimed: false,
      },
      deferredPresentation: {
        operationCount: presentationOperations.length,
        appliedAckCount: deferredAckCount,
        ackReadbackCount: deferredAckReadbacks,
        ackImageBitmapCount: deferredAckBitmaps,
        explicitPresentationFrames: 1,
        presentEveryOperationFrames,
        baselineHash: presentEveryOperationHash,
        deferredHash: deferredPresentationHash,
        endpointExact: deferredPresentationHash === presentEveryOperationHash,
        finalRevision: deferredFinalRevision,
      },
      nearBlackReflectanceParity: {
        belowFloorHash: nearBlackBelowFloor,
        atFloorHash: nearBlackAtFloor,
        exact: nearBlackBelowFloor === nearBlackAtFloor,
      },
      workerCrashRecovery: {
        rejectedImmediately: workerCrashRejected,
        workerInstances: crashWorkers.length,
        /*
         * Recovery is proved by coming back on the *same* backend the epoch started on, not by
         * naming one. Hard-coding "webgl2-offscreen-half-float" here made this gate structurally
         * unreachable for the WGSL lane: recovery demonstrably worked there — the epoch was
         * rejected immediately, a second Worker was created, and it rendered a real post-crash
         * frame — yet the assertion could only ever be false because the lane's runtime reports
         * "webgpu-offscreen-half-float". Comparing against the observed backend keeps the
         * assertion strictly stronger (a silent downgrade to the other runtime still fails) while
         * being answerable by either shipped backend.
         */
        recoveredBackend: recoveredCapabilities.backend,
        reinitialized: recoveredCapabilities.backend === capabilities.backend,
        postCrashFrameHash: recoveredFrameHash,
      },
      performance: {
        interactiveElapsed,
        maximumInteractiveWorkerMilliseconds: Math.max(...interactiveElapsed),
        averageInteractiveWorkerMilliseconds:
          interactiveElapsed.reduce((sum, value) => sum + value, 0) / interactiveElapsed.length,
        maximumMainThreadDelayMilliseconds,
        coarseBase: config.coarseBase,
      },
    };
    window.__studioLivingInkExecutionResult = result;
  } catch (error) {
    window.__studioLivingInkExecutionResult = {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    };
  } finally {
    window.clearInterval(timer);
    await Promise.all(providers.map((provider) => provider.dispose().catch(() => undefined)));
  }
}

void main();
