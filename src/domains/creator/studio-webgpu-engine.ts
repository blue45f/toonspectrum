export type StudioGpuComposite = "normal" | "erase";

export interface StudioGpuStroke {
  readonly id: string;
  readonly points: readonly number[];
  readonly pressures?: readonly number[];
  readonly color: string;
  readonly size: number;
  readonly opacity?: number;
  readonly composite?: StudioGpuComposite;
  readonly orderKey?: string;
}

export interface StudioGpuViewTransform {
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly flipX?: boolean;
}

export interface StudioGpuViewport extends StudioGpuViewTransform {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly cssWidth?: number;
  readonly cssHeight?: number;
  readonly dpr?: number;
}

export type StudioGpuBackend = "webgpu" | "canvas2d";

export interface StudioWebGpuEngineOptions {
  /** WebGPU presentation surface. It remains hidden while the Canvas2D fallback is active. */
  readonly canvas: HTMLCanvasElement;
  /** Separate fallback surface avoids trying to request two incompatible contexts on one canvas. */
  readonly fallbackCanvas: HTMLCanvasElement;
  /** Test/embedding override. `null` explicitly disables WebGPU. */
  readonly gpu?: GPU | null;
  readonly autoRecover?: boolean;
  readonly onBackendChange?: (backend: StudioGpuBackend) => void;
  readonly onDeviceLost?: (info: GPUDeviceLostInfo) => void;
}

interface NormalizedStudioGpuViewport {
  logicalWidth: number;
  logicalHeight: number;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  flipX: boolean;
}

export interface StudioGpuDab {
  x: number;
  y: number;
  radius: number;
  red: number;
  green: number;
  blue: number;
  alpha: number;
  composite: StudioGpuComposite;
}

export interface StudioGpuBatch {
  composite: StudioGpuComposite;
  firstInstance: number;
  instanceCount: number;
}

export interface PlannedStudioGpuDabs {
  dabs: StudioGpuDab[];
  batches: StudioGpuBatch[];
}

export interface StudioGpuDabRenderUpdate extends PlannedStudioGpuDabs {
  /** `append` is safe to draw over the retained frame; `rebuild` must clear it first. */
  mode: "append" | "rebuild";
}

const INSTANCE_FLOATS = 8;
const INSTANCE_BYTES = INSTANCE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const MAX_DABS = 100_000;
const DEFAULT_MAX_TEXTURE_DIMENSION = 8_192;

const STUDIO_GPU_BRUSH_SHADER = /* wgsl */ `
  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) color: vec4<f32>,
  }

  @vertex
  fn vs_main(
    @builtin(vertex_index) vertex_index: u32,
    @location(0) center: vec2<f32>,
    @location(1) radius: vec2<f32>,
    @location(2) color: vec4<f32>,
  ) -> VertexOutput {
    let corners = array<vec2<f32>, 6>(
      vec2<f32>(-1.0, -1.0),
      vec2<f32>( 1.0, -1.0),
      vec2<f32>(-1.0,  1.0),
      vec2<f32>(-1.0,  1.0),
      vec2<f32>( 1.0, -1.0),
      vec2<f32>( 1.0,  1.0),
    );
    let corner = corners[vertex_index];
    var output: VertexOutput;
    output.position = vec4<f32>(center + corner * radius, 0.0, 1.0);
    output.local = corner;
    output.color = color;
    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let distance_from_center = length(input.local);
    if (distance_from_center >= 1.0) {
      discard;
    }
    // Keep the edge close to one physical pixel instead of feathering 10% of large brush tips.
    let edge_width = max(fwidth(distance_from_center), 0.0005);
    let coverage = 1.0 - smoothstep(1.0 - edge_width, 1.0, distance_from_center);
    return input.color * coverage;
  }
`;

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveOr(value: unknown, fallback: number): number {
  const finite = finiteOr(value, fallback);
  return finite > 0 ? finite : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeViewport(input: StudioGpuViewport): NormalizedStudioGpuViewport {
  const logicalWidth = positiveOr(input.logicalWidth, 1);
  const logicalHeight = positiveOr(input.logicalHeight, 1);
  return {
    logicalWidth,
    logicalHeight,
    cssWidth: positiveOr(input.cssWidth, logicalWidth),
    cssHeight: positiveOr(input.cssHeight, logicalHeight),
    dpr: clamp(positiveOr(input.dpr, 1), 0.25, 4),
    scaleX: positiveOr(input.scaleX, 1),
    scaleY: positiveOr(input.scaleY, 1),
    offsetX: finiteOr(input.offsetX, 0),
    offsetY: finiteOr(input.offsetY, 0),
    flipX: input.flipX === true,
  };
}

function parseHexPair(value: string): number {
  return Number.parseInt(value, 16) / 255;
}

function parseStudioGpuColor(value: string): readonly [number, number, number, number] {
  const color = value.trim().toLowerCase();
  if (color === "transparent") return [0, 0, 0, 0];
  if (/^#[0-9a-f]{3,4}$/u.test(color)) {
    const red = parseHexPair(`${color[1]}${color[1]}`);
    const green = parseHexPair(`${color[2]}${color[2]}`);
    const blue = parseHexPair(`${color[3]}${color[3]}`);
    const alpha = color.length === 5 ? parseHexPair(`${color[4]}${color[4]}`) : 1;
    return [red, green, blue, alpha];
  }
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/u.test(color)) {
    return [
      parseHexPair(color.slice(1, 3)),
      parseHexPair(color.slice(3, 5)),
      parseHexPair(color.slice(5, 7)),
      color.length === 9 ? parseHexPair(color.slice(7, 9)) : 1,
    ];
  }
  const rgb = color.match(
    /^rgba?\(\s*([+-]?[\d.]+)\s*[, ]\s*([+-]?[\d.]+)\s*[, ]\s*([+-]?[\d.]+)(?:\s*[,/]\s*([+-]?[\d.]+%?))?\s*\)$/u
  );
  if (rgb) {
    const alphaToken = rgb[4];
    const alpha = alphaToken?.endsWith("%")
      ? Number.parseFloat(alphaToken) / 100
      : Number.parseFloat(alphaToken ?? "1");
    return [
      clamp(Number.parseFloat(rgb[1] ?? "0") / 255, 0, 1),
      clamp(Number.parseFloat(rgb[2] ?? "0") / 255, 0, 1),
      clamp(Number.parseFloat(rgb[3] ?? "0") / 255, 0, 1),
      clamp(alpha, 0, 1),
    ];
  }
  return [0, 0, 0, 1];
}

function pointPressure(stroke: StudioGpuStroke, index: number): number {
  return clamp(finiteOr(stroke.pressures?.[index], 1), 0, 1);
}

function pressureRadius(size: number, pressure: number): number {
  // Exact default-pen width contract used by StudioDrawNode after pressure resampling.
  return Math.max(0.25, (size * (0.3 + pressure * 1.4)) / 2);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedStrokes(strokes: readonly StudioGpuStroke[]): readonly StudioGpuStroke[] {
  if (!strokes.some((stroke) => stroke.orderKey !== undefined)) return strokes;
  return strokes
    .map((stroke, index) => ({ stroke, index }))
    .sort((left, right) => {
      const leftKey = left.stroke.orderKey;
      const rightKey = right.stroke.orderKey;
      if (leftKey !== undefined && rightKey !== undefined) {
        // CRDT operation order must be identical in every browser/locale. Relational string
        // comparison follows the ECMAScript UTF-16 code-unit order and does not consult locale.
        const order = compareCodeUnits(leftKey, rightKey);
        if (order !== 0) return order;
      } else if (leftKey !== undefined) {
        return -1;
      } else if (rightKey !== undefined) {
        return 1;
      }
      return left.index - right.index;
    })
    .map(({ stroke }) => stroke);
}

/** CPU planning is shared by WebGPU and Canvas2D so fallback has identical geometry and ordering. */
export function planStudioGpuDabs(strokes: readonly StudioGpuStroke[]): PlannedStudioGpuDabs {
  const dabs: StudioGpuDab[] = [];
  const batches: StudioGpuBatch[] = [];

  for (const stroke of orderedStrokes(strokes)) {
    if (dabs.length >= MAX_DABS) break;
    const pointCount = Math.floor(stroke.points.length / 2);
    if (pointCount < 1) continue;
    const size = positiveOr(stroke.size, 1);
    const opacity = clamp(finiteOr(stroke.opacity, 1), 0, 1);
    const composite: StudioGpuComposite = stroke.composite === "erase" ? "erase" : "normal";
    const [red, green, blue, colorAlpha] = parseStudioGpuColor(stroke.color);
    // Erasing is coverage, not paint color. A transparent/alpha-zero color must therefore erase
    // with the requested opacity instead of silently becoming a no-op.
    const alpha = opacity * (composite === "erase" ? 1 : colorAlpha);
    if (alpha <= 0) continue;
    const batchStart = dabs.length;
    const pushDab = (x: number, y: number, pressure: number) => {
      if (dabs.length >= MAX_DABS || !Number.isFinite(x) || !Number.isFinite(y)) return;
      dabs.push({
        x,
        y,
        radius: pressureRadius(size, pressure),
        red,
        green,
        blue,
        alpha,
        composite,
      });
    };

    const firstX = stroke.points[0];
    const firstY = stroke.points[1];
    if (!Number.isFinite(firstX) || !Number.isFinite(firstY)) continue;
    pushDab(firstX!, firstY!, pointPressure(stroke, 0));

    for (let pointIndex = 1; pointIndex < pointCount && dabs.length < MAX_DABS; pointIndex += 1) {
      const x0 = stroke.points[(pointIndex - 1) * 2];
      const y0 = stroke.points[(pointIndex - 1) * 2 + 1];
      const x1 = stroke.points[pointIndex * 2];
      const y1 = stroke.points[pointIndex * 2 + 1];
      if (![x0, y0, x1, y1].every((coordinate) => Number.isFinite(coordinate))) continue;
      const dx = x1! - x0!;
      const dy = y1! - y0!;
      const distance = Math.hypot(dx, dy);
      if (distance <= 1e-6) continue;
      const p0 = pointPressure(stroke, pointIndex - 1);
      const p1 = pointPressure(stroke, pointIndex);
      // Overlapping circular dabs form an anti-aliased round-cap stroke without geometry cracks.
      const spacing = Math.max(0.5, Math.min(pressureRadius(size, p0), pressureRadius(size, p1)) * 0.45);
      const steps = Math.max(1, Math.ceil(distance / spacing));
      for (let step = 1; step <= steps && dabs.length < MAX_DABS; step += 1) {
        const amount = step / steps;
        pushDab(
          x0! + dx * amount,
          y0! + dy * amount,
          p0 + (p1 - p0) * amount
        );
      }
    }

    const batchCount = dabs.length - batchStart;
    if (batchCount <= 0) continue;
    const previous = batches.at(-1);
    if (previous?.composite === composite && previous.firstInstance + previous.instanceCount === batchStart) {
      previous.instanceCount += batchCount;
    } else {
      batches.push({ composite, firstInstance: batchStart, instanceCount: batchCount });
    }
  }

  return { dabs, batches };
}

function sameStrokeStyle(previous: StudioGpuStroke, next: StudioGpuStroke): boolean {
  return previous.id === next.id
    && previous.color === next.color
    && Object.is(previous.size, next.size)
    && Object.is(previous.opacity ?? 1, next.opacity ?? 1)
    && (previous.composite ?? "normal") === (next.composite ?? "normal")
    && previous.orderKey === next.orderKey;
}

function isStrictPointPrefix(previous: StudioGpuStroke, next: StudioGpuStroke): boolean {
  if (previous.points.length < 2 || previous.points.length % 2 !== 0) return false;
  if (next.points.length <= previous.points.length || next.points.length % 2 !== 0) return false;
  for (let index = 0; index < previous.points.length; index += 1) {
    if (!Number.isFinite(previous.points[index])) return false;
    if (!Object.is(previous.points[index], next.points[index])) return false;
  }
  const previousPointCount = previous.points.length / 2;
  for (let index = 0; index < previousPointCount; index += 1) {
    if (!Object.is(pointPressure(previous, index), pointPressure(next, index))) return false;
  }
  return true;
}

function isExactStrokeMatch(previous: StudioGpuStroke, next: StudioGpuStroke): boolean {
  if (!sameStrokeStyle(previous, next) || previous.points.length !== next.points.length) {
    return false;
  }
  if (previous.points.length % 2 !== 0) return false;
  for (let index = 0; index < previous.points.length; index += 1) {
    if (!Number.isFinite(previous.points[index])) return false;
    if (!Object.is(previous.points[index], next.points[index])) return false;
  }
  const pointCount = previous.points.length / 2;
  for (let index = 0; index < pointCount; index += 1) {
    if (!Object.is(pointPressure(previous, index), pointPressure(next, index))) return false;
  }
  return true;
}

function concatenateStudioGpuDabPlans(
  plans: readonly PlannedStudioGpuDabs[]
): PlannedStudioGpuDabs {
  const dabs: StudioGpuDab[] = [];
  const batches: StudioGpuBatch[] = [];
  for (const plan of plans) {
    const instanceOffset = dabs.length;
    dabs.push(...plan.dabs);
    for (const batch of plan.batches) {
      const firstInstance = instanceOffset + batch.firstInstance;
      const previous = batches.at(-1);
      if (
        previous?.composite === batch.composite
        && previous.firstInstance + previous.instanceCount === firstInstance
      ) {
        previous.instanceCount += batch.instanceCount;
      } else {
        batches.push({ ...batch, firstInstance });
      }
    }
  }
  return { dabs, batches };
}

function withoutInitialDab(plan: PlannedStudioGpuDabs): PlannedStudioGpuDabs {
  if (plan.dabs.length <= 1) return { dabs: [], batches: [] };
  const dabs = plan.dabs.slice(1);
  const batches = plan.batches.flatMap((batch) => {
    const batchEnd = batch.firstInstance + batch.instanceCount;
    const retainedStart = Math.max(1, batch.firstInstance);
    if (batchEnd <= retainedStart) return [];
    return [{
      composite: batch.composite,
      firstInstance: retainedStart - 1,
      instanceCount: batchEnd - retainedStart,
    }];
  });
  return { dabs, batches };
}

/**
 * Plans only the newly appended segments of one immutable live stroke. Any changed historical
 * sample (for example a replaced pointer-prediction tail) deliberately requests a full rebuild.
 */
export function planStudioGpuDabUpdate(
  previousStrokes: readonly StudioGpuStroke[],
  nextStrokes: readonly StudioGpuStroke[]
): StudioGpuDabRenderUpdate {
  const previousOrdered = orderedStrokes(previousStrokes);
  const nextOrdered = orderedStrokes(nextStrokes);
  const sharedCount = Math.min(previousOrdered.length, nextOrdered.length);
  let exactPrefixCount = 0;
  while (
    exactPrefixCount < sharedCount
    && isExactStrokeMatch(previousOrdered[exactPrefixCount]!, nextOrdered[exactPrefixCount]!)
  ) {
    exactPrefixCount += 1;
  }

  // An immutable operation-log suffix is safe to composite over the retained texture. This is the
  // important layer-level case: a new destination-out stroke can erase earlier normal strokes
  // without replaying them, while a new normal stroke can paint over an earlier eraser.
  if (exactPrefixCount === previousOrdered.length && nextOrdered.length >= previousOrdered.length) {
    return {
      mode: "append",
      ...planStudioGpuDabs(nextOrdered.slice(previousOrdered.length)),
    };
  }

  // The common live-input case keeps immutable completed strokes and extends only the final one.
  // New strokes that already follow it in deterministic order can be appended in the same pass.
  const terminalIndex = previousOrdered.length - 1;
  const previousTerminal = previousOrdered[terminalIndex];
  const nextTerminal = nextOrdered[terminalIndex];
  if (
    terminalIndex >= 0
    && exactPrefixCount === terminalIndex
    && nextOrdered.length >= previousOrdered.length
    && previousTerminal
    && nextTerminal
    && sameStrokeStyle(previousTerminal, nextTerminal)
    && isStrictPointPrefix(previousTerminal, nextTerminal)
  ) {
    const previousPointCount = previousTerminal.points.length / 2;
    const suffixStart = previousPointCount - 1;
    const suffixPointCount = nextTerminal.points.length / 2 - suffixStart;
    const suffix: StudioGpuStroke = {
      ...nextTerminal,
      points: nextTerminal.points.slice(suffixStart * 2),
      pressures: Array.from(
        { length: suffixPointCount },
        (_, index) => pointPressure(nextTerminal, suffixStart + index)
      ),
    };
    return {
      mode: "append",
      ...concatenateStudioGpuDabPlans([
        withoutInitialDab(planStudioGpuDabs([suffix])),
        planStudioGpuDabs(nextOrdered.slice(previousOrdered.length)),
      ]),
    };
  }

  // Deletion, insertion before retained content, prediction-tail replacement and any historical
  // style/sample change can alter pixels already in the texture and therefore requires replay.
  return { mode: "rebuild", ...planStudioGpuDabs(nextOrdered) };
}

function limitStudioGpuDabPlan(
  update: StudioGpuDabRenderUpdate,
  maximumDabs: number
): StudioGpuDabRenderUpdate {
  if (update.dabs.length <= maximumDabs) return update;
  const dabs = update.dabs.slice(0, Math.max(0, maximumDabs));
  const batches = update.batches.flatMap((batch) => {
    if (batch.firstInstance >= dabs.length) return [];
    return [{
      ...batch,
      instanceCount: Math.min(batch.instanceCount, dabs.length - batch.firstInstance),
    }];
  });
  return { mode: update.mode, dabs, batches };
}

function bufferUsage(): number {
  // Stable WebGPU flags: VERTEX (0x20) | COPY_DST (0x08). Numeric flags also keep node-side
  // fake-device tests independent of whether TypeScript's DOM lib exposes GPUBufferUsage itself.
  return 0x20 | 0x08;
}

function accumulationTextureUsage(): number {
  // RENDER_ATTACHMENT (0x10) | COPY_SRC (0x01).
  return 0x10 | 0x01;
}

function presentationTextureUsage(): number {
  // RENDER_ATTACHMENT (0x10) | COPY_DST (0x02).
  return 0x10 | 0x02;
}

function packGpuDabs(
  dabs: readonly StudioGpuDab[],
  viewport: NormalizedStudioGpuViewport
): Float32Array {
  const packed = new Float32Array(dabs.length * INSTANCE_FLOATS);
  const { logicalWidth, logicalHeight, scaleX, scaleY, offsetX, offsetY, flipX } = viewport;
  for (let index = 0; index < dabs.length; index += 1) {
    const dab = dabs[index]!;
    const transformedX = (flipX ? logicalWidth - dab.x : dab.x) * scaleX + offsetX;
    const transformedY = dab.y * scaleY + offsetY;
    const alpha = clamp(dab.alpha, 0, 1);
    const offset = index * INSTANCE_FLOATS;
    packed[offset] = (transformedX / logicalWidth) * 2 - 1;
    packed[offset + 1] = 1 - (transformedY / logicalHeight) * 2;
    packed[offset + 2] = (dab.radius * Math.abs(scaleX) / logicalWidth) * 2;
    packed[offset + 3] = (dab.radius * Math.abs(scaleY) / logicalHeight) * 2;
    packed[offset + 4] = dab.red * alpha;
    packed[offset + 5] = dab.green * alpha;
    packed[offset + 6] = dab.blue * alpha;
    packed[offset + 7] = alpha;
  }
  return packed;
}

function safeDestroyDevice(device: GPUDevice | null): void {
  if (!device) return;
  try {
    device.destroy();
  } catch {
    // A lost/already-destroyed device is already released.
  }
}

function safeUnconfigure(context: GPUCanvasContext | null): void {
  if (!context) return;
  try {
    context.unconfigure();
  } catch {
    // Some implementations throw after device loss; fallback does not depend on unconfigure.
  }
}

function safeDestroyTexture(texture: GPUTexture | null): void {
  if (!texture) return;
  try {
    texture.destroy();
  } catch {
    // A texture owned by a lost device is already unusable.
  }
}

export class StudioWebGpuEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly fallbackCanvas: HTMLCanvasElement;
  private readonly options: StudioWebGpuEngineOptions;
  private readonly hasGpuOverride: boolean;

  private backend: StudioGpuBackend = "canvas2d";
  private fallbackContext: CanvasRenderingContext2D | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat | null = null;
  private normalPipeline: GPURenderPipeline | null = null;
  private erasePipeline: GPURenderPipeline | null = null;
  private instanceBuffer: GPUBuffer | null = null;
  private instanceCapacity = 0;
  private accumulationTexture: GPUTexture | null = null;
  private accumulationWidth = 0;
  private accumulationHeight = 0;
  private lifecycleGeneration = 0;
  private disposed = false;
  private viewport = normalizeViewport({ logicalWidth: 1, logicalHeight: 1 });
  private lastStrokes: readonly StudioGpuStroke[] = [];
  private renderedStrokes: readonly StudioGpuStroke[] | null = null;
  private renderedBackend: StudioGpuBackend | null = null;
  private renderedDabCount = 0;
  private renderedFrameInvalid = true;

  constructor(options: StudioWebGpuEngineOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.fallbackCanvas = options.fallbackCanvas;
    this.hasGpuOverride = Object.prototype.hasOwnProperty.call(options, "gpu");
    this.setSurfaceVisibility("canvas2d");
  }

  public getBackend(): StudioGpuBackend {
    return this.backend;
  }

  public async initialize(): Promise<StudioGpuBackend> {
    if (this.disposed) return this.backend;
    const generation = ++this.lifecycleGeneration;
    this.activateCanvas2d();
    const ready = await this.initializeWebGpu(generation);
    if (ready && !this.disposed && generation === this.lifecycleGeneration) {
      this.render(this.lastStrokes);
    }
    return this.backend;
  }

  public resize(input: StudioGpuViewport): void {
    if (this.disposed) return;
    const nextViewport = normalizeViewport(input);
    const textureLimit = Math.max(
      1,
      Number(this.device?.limits.maxTextureDimension2D ?? DEFAULT_MAX_TEXTURE_DIMENSION)
    );
    const requestedWidth = Math.max(1, Math.round(nextViewport.cssWidth * nextViewport.dpr));
    const requestedHeight = Math.max(1, Math.round(nextViewport.cssHeight * nextViewport.dpr));
    const fit = Math.min(1, textureLimit / requestedWidth, textureLimit / requestedHeight);
    const physicalWidth = Math.max(1, Math.floor(requestedWidth * fit));
    const physicalHeight = Math.max(1, Math.floor(requestedHeight * fit));
    const viewportChanged = Object.keys(nextViewport).some((key) => {
      const viewportKey = key as keyof NormalizedStudioGpuViewport;
      return !Object.is(nextViewport[viewportKey], this.viewport[viewportKey]);
    });
    const physicalSizeChanged = this.canvas.width !== physicalWidth ||
      this.canvas.height !== physicalHeight ||
      this.fallbackCanvas.width !== physicalWidth ||
      this.fallbackCanvas.height !== physicalHeight;
    this.viewport = nextViewport;
    if (!viewportChanged && !physicalSizeChanged) return;

    for (const surface of new Set([this.canvas, this.fallbackCanvas])) {
      if (surface.width !== physicalWidth) surface.width = physicalWidth;
      if (surface.height !== physicalHeight) surface.height = physicalHeight;
    }
    // Resizing a canvas discards its backing store. View-transform changes also invalidate every
    // packed dab, even when the physical dimensions happen to remain unchanged.
    this.destroyAccumulationTexture();
    this.invalidateRenderedFrame();
    this.configureContext();
    this.render(this.lastStrokes);
  }

  public render(strokes: readonly StudioGpuStroke[]): void {
    if (this.disposed) return;
    this.lastStrokes = strokes;
    if (
      this.backend === "webgpu" &&
      this.device &&
      this.context &&
      this.normalPipeline &&
      this.erasePipeline
    ) {
      this.renderWebGpu(strokes);
      return;
    }
    this.renderCanvas2d(strokes);
  }

  public clear(): void {
    this.render([]);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifecycleGeneration += 1;
    const device = this.device;
    this.device = null;
    this.normalPipeline = null;
    this.erasePipeline = null;
    this.format = null;
    this.instanceBuffer?.destroy();
    this.instanceBuffer = null;
    this.instanceCapacity = 0;
    this.destroyAccumulationTexture();
    this.invalidateRenderedFrame();
    safeUnconfigure(this.context);
    this.context = null;
    safeDestroyDevice(device);
    this.clearCanvas2d();
  }

  private gpu(): GPU | null {
    if (this.hasGpuOverride) return this.options.gpu ?? null;
    if (typeof navigator === "undefined") return null;
    return navigator.gpu ?? null;
  }

  private async initializeWebGpu(generation: number): Promise<boolean> {
    const gpu = this.gpu();
    if (!gpu || this.disposed || generation !== this.lifecycleGeneration) return false;

    let device: GPUDevice | null = null;
    let context: GPUCanvasContext | null = null;
    try {
      const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter || this.disposed || generation !== this.lifecycleGeneration) return false;
      device = await adapter.requestDevice();
      if (this.disposed || generation !== this.lifecycleGeneration) {
        safeDestroyDevice(device);
        return false;
      }

      const candidate = this.context ?? this.canvas.getContext("webgpu");
      context = candidate && "configure" in candidate
        ? candidate as GPUCanvasContext
        : null;
      if (!context) {
        safeDestroyDevice(device);
        return false;
      }
      const format = gpu.getPreferredCanvasFormat();
      const shaderModule = device.createShaderModule({
        label: "Studio round-dab brush shader",
        code: STUDIO_GPU_BRUSH_SHADER,
      });
      const vertex: GPUVertexState = {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: INSTANCE_BYTES,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x2" },
              { shaderLocation: 2, offset: 16, format: "float32x4" },
            ],
          },
        ],
      };
      const basePipeline: Omit<GPURenderPipelineDescriptor, "fragment"> = {
        label: "Studio round-dab brush pipeline",
        layout: "auto",
        vertex,
        primitive: { topology: "triangle-list" },
      };
      const normalPipeline = device.createRenderPipeline({
        ...basePipeline,
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [
            {
              format,
              blend: {
                color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
                alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
              },
            },
          ],
        },
      });
      const erasePipeline = device.createRenderPipeline({
        ...basePipeline,
        label: "Studio destination-out round-dab pipeline",
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [
            {
              format,
              blend: {
                color: { srcFactor: "zero", dstFactor: "one-minus-src-alpha", operation: "add" },
                alpha: { srcFactor: "zero", dstFactor: "one-minus-src-alpha", operation: "add" },
              },
            },
          ],
        },
      });
      context.configure({
        device,
        format,
        alphaMode: "premultiplied",
        usage: presentationTextureUsage(),
      });
      if (this.disposed || generation !== this.lifecycleGeneration) {
        safeUnconfigure(context);
        safeDestroyDevice(device);
        return false;
      }

      this.device = device;
      this.context = context;
      this.format = format;
      this.normalPipeline = normalPipeline;
      this.erasePipeline = erasePipeline;
      this.instanceBuffer?.destroy();
      this.instanceBuffer = null;
      this.instanceCapacity = 0;
      this.destroyAccumulationTexture();
      this.setBackend("webgpu");
      this.configureContext();
      void device.lost.then((info) => this.handleDeviceLost(device!, info));
      return true;
    } catch {
      safeUnconfigure(context);
      safeDestroyDevice(device);
      this.activateCanvas2d();
      return false;
    }
  }

  private handleDeviceLost(lostDevice: GPUDevice, info: GPUDeviceLostInfo): void {
    if (this.disposed || this.device !== lostDevice) return;
    const recoveryGeneration = ++this.lifecycleGeneration;
    this.device = null;
    this.normalPipeline = null;
    this.erasePipeline = null;
    this.format = null;
    this.instanceBuffer?.destroy();
    this.instanceBuffer = null;
    this.instanceCapacity = 0;
    this.destroyAccumulationTexture();
    safeUnconfigure(this.context);
    this.activateCanvas2d();
    this.renderCanvas2d(this.lastStrokes);
    this.options.onDeviceLost?.(info);

    if (this.options.autoRecover === false) return;
    void this.initializeWebGpu(recoveryGeneration).then((ready) => {
      if (ready && !this.disposed && recoveryGeneration === this.lifecycleGeneration) {
        this.render(this.lastStrokes);
      }
    });
  }

  private activateCanvas2d(): void {
    if (!this.fallbackContext) {
      this.fallbackContext = this.fallbackCanvas.getContext("2d");
    }
    this.setBackend("canvas2d");
  }

  private setBackend(backend: StudioGpuBackend): void {
    const changed = this.backend !== backend;
    if (changed) {
      this.destroyAccumulationTexture();
      this.invalidateRenderedFrame();
    }
    this.backend = backend;
    this.setSurfaceVisibility(backend);
    if (changed) this.options.onBackendChange?.(backend);
  }

  private setSurfaceVisibility(backend: StudioGpuBackend): void {
    if (this.canvas === this.fallbackCanvas) {
      this.canvas.style.visibility = "visible";
      return;
    }
    this.canvas.style.visibility = backend === "webgpu" ? "visible" : "hidden";
    this.fallbackCanvas.style.visibility = backend === "canvas2d" ? "visible" : "hidden";
  }

  private configureContext(): void {
    if (!this.context || !this.device || !this.format) return;
    try {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "premultiplied",
        usage: presentationTextureUsage(),
      });
    } catch {
      // Device loss handler will switch to the already-renderable Canvas2D surface.
    }
  }

  private ensureInstanceBuffer(instanceCount: number): GPUBuffer | null {
    if (!this.device || instanceCount <= 0) return null;
    if (this.instanceBuffer && this.instanceCapacity >= instanceCount) return this.instanceBuffer;
    let capacity = 256;
    while (capacity < instanceCount) capacity *= 2;
    const replacement = this.device.createBuffer({
      label: "Studio brush dab instances",
      size: capacity * INSTANCE_BYTES,
      usage: bufferUsage(),
    });
    this.instanceBuffer?.destroy();
    this.instanceBuffer = replacement;
    this.instanceCapacity = capacity;
    return replacement;
  }

  private destroyAccumulationTexture(): void {
    safeDestroyTexture(this.accumulationTexture);
    this.accumulationTexture = null;
    this.accumulationWidth = 0;
    this.accumulationHeight = 0;
  }

  private ensureAccumulationTexture(): GPUTexture | null {
    if (!this.device || !this.format) return null;
    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);
    if (
      this.accumulationTexture &&
      this.accumulationWidth === width &&
      this.accumulationHeight === height
    ) {
      return this.accumulationTexture;
    }
    this.destroyAccumulationTexture();
    this.accumulationTexture = this.device.createTexture({
      label: "Studio retained brush compositor",
      size: { width, height, depthOrArrayLayers: 1 },
      format: this.format,
      usage: accumulationTextureUsage(),
    });
    this.accumulationWidth = width;
    this.accumulationHeight = height;
    return this.accumulationTexture;
  }

  private invalidateRenderedFrame(): void {
    this.renderedStrokes = null;
    this.renderedBackend = null;
    this.renderedDabCount = 0;
    this.renderedFrameInvalid = true;
  }

  private planRenderUpdate(strokes: readonly StudioGpuStroke[]): StudioGpuDabRenderUpdate {
    if (
      this.renderedFrameInvalid ||
      this.renderedBackend !== this.backend ||
      !this.renderedStrokes
    ) {
      return { mode: "rebuild", ...planStudioGpuDabs(strokes) };
    }
    const update = planStudioGpuDabUpdate(this.renderedStrokes, strokes);
    if (update.mode === "rebuild") return update;
    return limitStudioGpuDabPlan(update, Math.max(0, MAX_DABS - this.renderedDabCount));
  }

  private recordRenderedFrame(
    strokes: readonly StudioGpuStroke[],
    update: StudioGpuDabRenderUpdate
  ): void {
    this.renderedStrokes = strokes;
    this.renderedBackend = this.backend;
    this.renderedDabCount = update.mode === "append"
      ? this.renderedDabCount + update.dabs.length
      : update.dabs.length;
    this.renderedFrameInvalid = false;
  }

  private renderWebGpu(strokes: readonly StudioGpuStroke[]): void {
    const { device, context, normalPipeline, erasePipeline } = this;
    if (!device || !context || !normalPipeline || !erasePipeline) return;
    try {
      const update = this.planRenderUpdate(strokes);
      const accumulationTexture = this.ensureAccumulationTexture();
      if (!accumulationTexture) return;
      const packed = packGpuDabs(update.dabs, this.viewport);
      const instanceBuffer = this.ensureInstanceBuffer(update.dabs.length);
      if (instanceBuffer && packed.byteLength > 0) {
        device.queue.writeBuffer(
          instanceBuffer,
          0,
          packed.buffer,
          packed.byteOffset,
          packed.byteLength
        );
      }

      const encoder = device.createCommandEncoder({ label: "Studio brush compositor frame" });
      const presentationTexture = context.getCurrentTexture();
      const pass = encoder.beginRenderPass({
        label: "Studio transparent brush compositor",
        colorAttachments: [
          {
            view: accumulationTexture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: update.mode === "append" ? "load" : "clear",
            storeOp: "store",
          },
        ],
      });
      if (instanceBuffer) {
        pass.setVertexBuffer(0, instanceBuffer);
        for (const batch of update.batches) {
          pass.setPipeline(batch.composite === "erase" ? erasePipeline : normalPipeline);
          pass.draw(6, batch.instanceCount, 0, batch.firstInstance);
        }
      }
      pass.end();
      encoder.copyTextureToTexture(
        { texture: accumulationTexture },
        { texture: presentationTexture },
        {
          width: this.canvas.width,
          height: this.canvas.height,
          depthOrArrayLayers: 1,
        }
      );
      device.queue.submit([encoder.finish()]);
      this.recordRenderedFrame(strokes, update);
    } catch {
      // Validation/context errors do not always resolve `device.lost`. Fail visibly-safe for this
      // session instead of leaving a selected but blank GPU surface above the authoritative scene.
      this.activateCanvas2d();
      this.renderCanvas2d(strokes);
    }
  }

  private clearCanvas2d(): void {
    const context = this.fallbackContext;
    if (!context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.fallbackCanvas.width, this.fallbackCanvas.height);
    context.restore();
  }

  private renderCanvas2d(strokes: readonly StudioGpuStroke[]): void {
    this.activateCanvas2d();
    const context = this.fallbackContext;
    if (!context) return;
    const update = this.planRenderUpdate(strokes);
    if (update.mode === "rebuild") this.clearCanvas2d();
    const viewport = this.viewport;
    const pixelScaleX = this.fallbackCanvas.width / viewport.logicalWidth;
    const pixelScaleY = this.fallbackCanvas.height / viewport.logicalHeight;
    const transformA = pixelScaleX * viewport.scaleX * (viewport.flipX ? -1 : 1);
    const transformD = pixelScaleY * viewport.scaleY;
    const transformE = pixelScaleX * (
      viewport.offsetX + (viewport.flipX ? viewport.logicalWidth * viewport.scaleX : 0)
    );
    const transformF = pixelScaleY * viewport.offsetY;

    context.save();
    context.setTransform(transformA, 0, 0, transformD, transformE, transformF);
    for (const dab of update.dabs) {
      context.globalCompositeOperation = dab.composite === "erase" ? "destination-out" : "source-over";
      context.fillStyle = `rgba(${Math.round(dab.red * 255)}, ${Math.round(dab.green * 255)}, ${Math.round(dab.blue * 255)}, ${dab.alpha})`;
      context.beginPath();
      context.arc(dab.x, dab.y, dab.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    this.recordRenderedFrame(strokes, update);
  }
}
