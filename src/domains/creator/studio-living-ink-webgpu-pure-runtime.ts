/**
 * Pure WebGPU/WGSL wet-media field runtime.
 *
 * Replaces the WebGL2 GLSL executor when a GPU device is available: field state
 * lives in storage buffers and the Stam stable-fluid, vorticity-confinement,
 * pressure-projection, pigment/fix/Beer–Lambert passes are WGSL compute kernels
 * from studio-living-ink-wgsl-shaders.ts.
 *
 * Grid split (v2): pigment, water and paper are full resolution; velocity,
 * pressure and curl live on a 1/2…1/8 coarse grid, which is what makes a real
 * 22-sweep incompressibility solve fit in the interactive frame budget.
 */

import {
  STUDIO_LIVING_INK_EXECUTION_ENGINE_VERSION,
  STUDIO_LIVING_INK_EXECUTION_LIMITS,
  STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION,
  studioLivingInkCoarseVelocityGrid,
  studioLivingInkDryWindowSeconds,
  studioLivingInkFluidPlan,
  type StudioLivingInkCoarseVelocityScale,
  type StudioLivingInkExecutionApplied,
  type StudioLivingInkExecutionApplyOptions,
  type StudioLivingInkExecutionApplyResult,
  type StudioLivingInkExecutionCapabilities,
  type StudioLivingInkExecutionConfig,
  type StudioLivingInkExecutionFrame,
  type StudioLivingInkExecutionReceipt,
} from "./studio-living-ink-execution-protocol";
import {
  studioLivingInkChromaBleedMultipliers,
  type StudioLivingInkBounds,
  type StudioLivingInkOperation,
} from "./studio-living-ink-field";
import { validateStudioLivingInkExecutionConfig } from "./studio-living-ink-webgl2-runtime";
import {
  listStudioLivingInkWgslPassSources,
  STUDIO_LIVING_INK_WGSL_SHADER_REVISION,
  STUDIO_LIVING_INK_WGSL_UNIFORM_WORDS,
  studioLivingInkWgslPassIsCoarse,
  writeStudioLivingInkFieldUniforms,
  type StudioLivingInkWgslPassId,
} from "./studio-living-ink-wgsl-shaders";
import { sha256HexPortable } from "./studio-sha256";

import type { StudioLivingInkDisplayMode } from "./studio-living-ink-gpu-protocol";

/**
 * Converts pointer travel into wash momentum. Tuned so a fast flick reaches roughly half the
 * velocity clamp (3 uv/s) at flow = 1 without letting a jitter-sized step kick the solver.
 */
const STROKE_MOMENTUM_GAIN = 0.06;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(record[key])}`
  ).join(",")}}`;
}

function sha256(value: Uint8Array | string): `sha256:${string}` {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return `sha256:${sha256HexPortable(bytes)}`;
}

/**
 * Re-orders display rows bottom-first, which is the orientation every Living Ink receipt declares
 * (`displayReadbackOrientation: "webgl-bottom-left-row-major"`). The WGSL field is top-down — a
 * splat lands at the same row index the pointer reports — so the presented surface is the natural
 * order and the *hash* is the flipped one, exactly inverting the WebGL2 runtime where `readPixels`
 * hands back bottom-up rows and presentation flips them. Both runtimes therefore hash the same
 * canonical byte order for the same picture.
 */
function bottomUpRowMajor(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const normalized = new Uint8Array(pixels.length);
  for (let row = 0; row < height; row += 1) {
    normalized.set(
      pixels.subarray(row * stride, row * stride + stride),
      (height - 1 - row) * stride,
    );
  }
  return normalized;
}

/**
 * True when a readback carries no presentable surface at all: every pixel fully transparent, or
 * every colour byte zero.
 *
 * This is the contract that was missing. A Living Ink display resolve is `exp(-opticalDensity)`,
 * so an *empty* field resolves to white paper and a saturated one only approaches black
 * asymptotically — a whole canvas of exact `rgb(0,0,0)` is not a picture this engine can compute,
 * it is the signature of a display buffer that was never written. Treating it as a real frame is
 * what let a blank WebGPU canvas ship: the receipt hashed the same zeros the screen showed, so
 * every hash-based check agreed with itself and nothing looked wrong.
 */
export function studioLivingInkPresentedPixelsAreBlank(
  pixels: Uint8Array | Uint8ClampedArray,
): boolean {
  let maximumAlpha = 0;
  let maximumColour = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] ?? 0;
    if (alpha > maximumAlpha) maximumAlpha = alpha;
    const colour = Math.max(pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0);
    if (colour > maximumColour) maximumColour = colour;
    if (maximumAlpha > 0 && maximumColour > 0) return false;
  }
  return true;
}

function unionBounds(
  a: StudioLivingInkBounds | null,
  b: StudioLivingInkBounds,
  width: number,
  height: number,
): StudioLivingInkBounds {
  if (!a) {
    return Object.freeze({
      x: Math.max(0, Math.min(width - 1, Math.floor(b.x))),
      y: Math.max(0, Math.min(height - 1, Math.floor(b.y))),
      width: Math.max(1, Math.min(width, Math.ceil(b.width))),
      height: Math.max(1, Math.min(height, Math.ceil(b.height))),
    });
  }
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.width, b.x + b.width);
  const y1 = Math.max(a.y + a.height, b.y + b.height);
  return Object.freeze({
    x: Math.max(0, Math.floor(x0)),
    y: Math.max(0, Math.floor(y0)),
    width: Math.max(1, Math.ceil(x1 - x0)),
    height: Math.max(1, Math.ceil(y1 - y0)),
  });
}

export class StudioLivingInkWebGpuPureRuntime {
  readonly capabilities: StudioLivingInkExecutionCapabilities;
  readonly preferredBackend = "webgpu" as const;
  readonly webGpuDevice: GPUDevice;
  readonly wgslRevision = STUDIO_LIVING_INK_WGSL_SHADER_REVISION;
  readonly coarseVelocityScale: StudioLivingInkCoarseVelocityScale;

  private readonly device: GPUDevice;
  private readonly config: StudioLivingInkExecutionConfig;
  private readonly canvas: OffscreenCanvas;
  private readonly presentation: OffscreenCanvasRenderingContext2D;
  private readonly pipelines = new Map<StudioLivingInkWgslPassId, GPUComputePipeline>();
  private readonly coarseWidth: number;
  private readonly coarseHeight: number;
  private mobile!: GPUBuffer;
  private mobileScratch!: GPUBuffer;
  private fixed!: GPUBuffer;
  private wet!: GPUBuffer;
  private wetScratch!: GPUBuffer;
  private velocity!: GPUBuffer;
  private velocityScratch!: GPUBuffer;
  private curl!: GPUBuffer;
  private pressureA!: GPUBuffer;
  private pressureB!: GPUBuffer;
  private display!: GPUBuffer;
  private uniforms!: GPUBuffer;
  private splatUniforms!: GPUBuffer;
  private revision = 0;
  private passCount = 0;
  private disposed = false;
  private dirty: StudioLivingInkBounds | null = null;
  /** Previous stroke sample, used to derive the momentum impulse handed to the velocity field. */
  private previousMark: Readonly<{ x: number; y: number }> | null = null;

  private constructor(
    device: GPUDevice,
    config: StudioLivingInkExecutionConfig,
    canvas: OffscreenCanvas,
    presentation: OffscreenCanvasRenderingContext2D,
  ) {
    this.device = device;
    this.webGpuDevice = device;
    this.config = Object.freeze({ ...config });
    this.canvas = canvas;
    this.presentation = presentation;
    const coarse = studioLivingInkCoarseVelocityGrid(
      config.fieldWidth,
      config.fieldHeight,
      config.coarseBase,
    );
    this.coarseWidth = coarse.width;
    this.coarseHeight = coarse.height;
    this.coarseVelocityScale = coarse.scale;
    this.capabilities = Object.freeze({
      backend: "webgpu-offscreen-half-float",
      worker: true,
      offscreenCanvas: true,
      webgl2: false,
      webgpu: true,
      halfFloatRenderable: true,
      rgba16Float: true,
      rg16Float: true,
      r16Float: true,
      maximumTextureSize: Math.max(config.fieldWidth, config.fieldHeight, 8192),
      pressureIterations: Object.freeze({
        interactive: STUDIO_LIVING_INK_EXECUTION_LIMITS.interactivePressureIterations,
        settle: STUDIO_LIVING_INK_EXECUTION_LIMITS.settlePressureIterations,
      }),
    });
  }

  static async tryCreate(
    config: StudioLivingInkExecutionConfig,
  ): Promise<StudioLivingInkWebGpuPureRuntime | null> {
    try {
      validateStudioLivingInkExecutionConfig(config);
    } catch {
      return null;
    }
    const gpu = (globalThis.navigator as Navigator | undefined)?.gpu;
    if (!gpu || typeof OffscreenCanvas !== "function") return null;
    let device: GPUDevice;
    try {
      const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) return null;
      device = await adapter.requestDevice();
    } catch {
      return null;
    }

    const canvas = new OffscreenCanvas(config.displayWidth, config.displayHeight);
    /*
     * The WGSL passes resolve into a storage buffer, so the presentation surface has to be one
     * that can *receive* those pixels — a 2D context. This runtime used to acquire a `webgpu`
     * context here and never configure or render into it, which only looked like a GPU present
     * path: `transferToImageBitmap()` then handed back a surface nothing had drawn to.
     */
    const presentation = canvas.getContext("2d", { alpha: false });
    if (!presentation) return null;

    const runtime = new StudioLivingInkWebGpuPureRuntime(device, config, canvas, presentation);
    try {
      runtime.allocateBuffers();
      runtime.compilePipelines();
      runtime.dispatchClearAll();
      return runtime;
    } catch {
      runtime.dispose();
      return null;
    }
  }

  private cellCount(): number {
    return this.config.fieldWidth * this.config.fieldHeight;
  }

  private coarseCellCount(): number {
    return this.coarseWidth * this.coarseHeight;
  }

  private allocateBuffers(): void {
    const bytes = this.cellCount() * 16;
    const coarseBytes = this.coarseCellCount() * 16;
    const usage =
      GPUBufferUsage.STORAGE
      | GPUBufferUsage.COPY_SRC
      | GPUBufferUsage.COPY_DST;
    this.mobile = this.device.createBuffer({ size: bytes, usage });
    this.mobileScratch = this.device.createBuffer({ size: bytes, usage });
    this.fixed = this.device.createBuffer({ size: bytes, usage });
    this.wet = this.device.createBuffer({ size: bytes, usage });
    this.wetScratch = this.device.createBuffer({ size: bytes, usage });
    this.velocity = this.device.createBuffer({ size: coarseBytes, usage });
    this.velocityScratch = this.device.createBuffer({ size: coarseBytes, usage });
    this.curl = this.device.createBuffer({ size: coarseBytes, usage });
    this.pressureA = this.device.createBuffer({ size: coarseBytes, usage });
    this.pressureB = this.device.createBuffer({ size: coarseBytes, usage });
    /*
     * `MAP_READ` may only be paired with `COPY_DST` — combining it with `STORAGE` made every
     * display buffer invalid at allocation, so the `display` pass's bind group was rejected and
     * the resolve silently never ran. The readback below already copies into its own mappable
     * staging buffer, so this buffer only ever needed to be a storage/copy target.
     */
    this.display = this.device.createBuffer({ size: bytes, usage });
    this.uniforms = this.device.createBuffer({
      size: STUDIO_LIVING_INK_WGSL_UNIFORM_WORDS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.splatUniforms = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private compilePipelines(): void {
    for (const pass of listStudioLivingInkWgslPassSources()) {
      const module = this.device.createShaderModule({ code: pass.source });
      const pipeline = this.device.createComputePipeline({
        layout: "auto",
        compute: { module, entryPoint: pass.entryPoint },
      });
      this.pipelines.set(pass.id, pipeline);
    }
  }

  private writeUniforms(extra?: { fixTransfer?: number; fixing?: boolean }): void {
    const chroma = studioLivingInkChromaBleedMultipliers(
      this.config.material.chromaticSeparation,
    );
    this.device.queue.writeBuffer(this.uniforms, 0, writeStudioLivingInkFieldUniforms({
      width: this.config.fieldWidth,
      height: this.config.fieldHeight,
      coarseWidth: this.coarseWidth,
      coarseHeight: this.coarseHeight,
      dt: STUDIO_LIVING_INK_EXECUTION_LIMITS.fixedTimeStepSeconds,
      bleed: this.config.material.bleed,
      dryRate: this.config.material.dryRate,
      chroma,
      chromaticSeparation: this.config.material.chromaticSeparation,
      beerDensity: this.config.material.beerLambertDensity,
      fixTransfer: extra?.fixTransfer ?? 0.22,
      flow: this.config.material.flow,
      vorticity: this.config.material.vorticity,
      capillaryCreep: this.config.material.capillaryCreep,
      fixing: extra?.fixing ?? false,
    }));
  }

  private dispatchClearAll(): void {
    this.writeUniforms();
    for (const buffer of [this.mobile, this.mobileScratch, this.fixed, this.wet, this.wetScratch]) {
      this.dispatch("clear", [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: { buffer } },
      ]);
    }
    for (const buffer of [
      this.velocity,
      this.velocityScratch,
      this.curl,
      this.pressureA,
      this.pressureB,
    ]) {
      this.dispatch("clear-coarse", [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: { buffer } },
      ]);
    }
    this.previousMark = null;
  }

  private dispatch(
    pass: StudioLivingInkWgslPassId,
    entries: GPUBindGroupEntry[],
  ): void {
    const pipeline = this.pipelines.get(pass);
    if (!pipeline) throw new Error(`WGSL pass missing: ${pass}`);
    const encoder = this.device.createCommandEncoder();
    const passEncoder = encoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries,
    });
    passEncoder.setBindGroup(0, bindGroup);
    const coarse = studioLivingInkWgslPassIsCoarse(pass);
    const width = coarse ? this.coarseWidth : this.config.fieldWidth;
    const height = coarse ? this.coarseHeight : this.config.fieldHeight;
    passEncoder.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
    passEncoder.end();
    this.device.queue.submit([encoder.finish()]);
    this.passCount += 1;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("Living Ink pure WGSL runtime disposed.");
  }

  private simulationBounds(): StudioLivingInkBounds {
    return this.dirty ?? Object.freeze({
      x: 0,
      y: 0,
      width: this.config.fieldWidth,
      height: this.config.fieldHeight,
    });
  }

  private markDirty(bounds: StudioLivingInkBounds): void {
    this.dirty = unionBounds(
      this.dirty,
      bounds,
      this.config.fieldWidth,
      this.config.fieldHeight,
    );
  }

  private operationBounds(operation: StudioLivingInkOperation): StudioLivingInkBounds {
    if (operation.kind === "clear" || operation.kind === "fix" || operation.kind === "advance") {
      return Object.freeze({
        x: 0,
        y: 0,
        width: this.config.fieldWidth,
        height: this.config.fieldHeight,
      });
    }
    let result: StudioLivingInkBounds | null = operation.selection?.bounds ?? null;
    for (const mark of operation.marks) {
      const r = Math.max(1, mark.radius);
      result = unionBounds(
        result,
        { x: mark.x - r, y: mark.y - r, width: r * 2, height: r * 2 },
        this.config.fieldWidth,
        this.config.fieldHeight,
      );
    }
    return result ?? Object.freeze({ x: 0, y: 0, width: 1, height: 1 });
  }

  private writeSplatUniforms(values: readonly number[]): void {
    this.device.queue.writeBuffer(this.splatUniforms, 0, new Float32Array(values));
  }

  private splatMark(mark: {
    x: number;
    y: number;
    radius: number;
    amount?: number;
    color?: readonly [number, number, number];
    wet?: number;
  }): void {
    this.writeSplatUniforms([
      mark.x,
      mark.y,
      Math.max(0.5, mark.radius),
      mark.amount ?? 0.65,
      mark.color?.[0] ?? 0.15,
      mark.color?.[1] ?? 0.12,
      mark.color?.[2] ?? 0.1,
      mark.wet ?? 0.8,
    ]);
    this.writeUniforms();
    this.dispatch("splat", [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 1, resource: { buffer: this.mobile } },
      { binding: 2, resource: { buffer: this.splatUniforms } },
    ]);
    // Wetness field gets water mass
    this.dispatch("splat", [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 1, resource: { buffer: this.wet } },
      { binding: 2, resource: { buffer: this.splatUniforms } },
    ]);
    this.splatMomentum(mark.x, mark.y, mark.radius);
  }

  /**
   * Hands the stroke's own motion to the fluid. Without an impulse the velocity field stays at
   * rest and every projection/confinement pass below is a no-op — the wash would only ever
   * diffuse. The impulse is expressed in uv units per second, matching the velocity field.
   */
  private splatMomentum(x: number, y: number, radius: number): void {
    const previous = this.previousMark;
    this.previousMark = Object.freeze({ x, y });
    if (!previous) return;
    const dx = (x - previous.x) / this.config.fieldWidth;
    const dy = (y - previous.y) / this.config.fieldHeight;
    if (dx === 0 && dy === 0) return;
    const perSecond = 1 / Math.max(1e-4, STUDIO_LIVING_INK_EXECUTION_LIMITS.fixedTimeStepSeconds);
    const flow = Math.min(1, Math.max(0, this.config.material.flow));
    const gain = STROKE_MOMENTUM_GAIN * (0.35 + flow * 0.65);
    this.writeSplatUniforms([
      x,
      y,
      Math.max(0.5, radius),
      1,
      dx * perSecond * gain,
      dy * perSecond * gain,
      0,
      0,
    ]);
    this.dispatch("splat-velocity", [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 1, resource: { buffer: this.velocity } },
      { binding: 2, resource: { buffer: this.splatUniforms } },
    ]);
  }

  private swapVelocity(): void {
    const spare = this.velocity;
    this.velocity = this.velocityScratch;
    this.velocityScratch = spare;
  }

  /**
   * One fixed tick of the Stable Fluids loop, in the order the fluid requires:
   * advect → confine vorticity → project (divergence, Jacobi, gradient) → water → pigment.
   */
  private step(fixing: boolean, pressureIterations: number): void {
    this.writeUniforms({ fixTransfer: fixing ? 0.18 : 0, fixing });
    const uniforms = { binding: 0, resource: { buffer: this.uniforms } } as const;

    this.dispatch("advect-velocity", [
      uniforms,
      { binding: 1, resource: { buffer: this.velocity } },
      { binding: 2, resource: { buffer: this.velocityScratch } },
      { binding: 3, resource: { buffer: this.wet } },
    ]);
    this.swapVelocity();

    this.dispatch("curl", [
      uniforms,
      { binding: 1, resource: { buffer: this.velocity } },
      { binding: 2, resource: { buffer: this.curl } },
    ]);
    this.dispatch("vorticity", [
      uniforms,
      { binding: 1, resource: { buffer: this.velocity } },
      { binding: 2, resource: { buffer: this.curl } },
      { binding: 3, resource: { buffer: this.velocityScratch } },
    ]);
    this.swapVelocity();

    this.dispatch("divergence", [
      uniforms,
      { binding: 1, resource: { buffer: this.velocity } },
      { binding: 2, resource: { buffer: this.pressureA } },
    ]);
    let solved = this.pressureA;
    for (let iteration = 0; iteration < pressureIterations; iteration += 1) {
      const src = iteration % 2 === 0 ? this.pressureA : this.pressureB;
      const dst = iteration % 2 === 0 ? this.pressureB : this.pressureA;
      this.dispatch("jacobi", [
        uniforms,
        { binding: 1, resource: { buffer: src } },
        { binding: 2, resource: { buffer: dst } },
      ]);
      solved = dst;
    }
    this.dispatch("gradient", [
      uniforms,
      { binding: 1, resource: { buffer: this.velocity } },
      { binding: 2, resource: { buffer: solved } },
      { binding: 3, resource: { buffer: this.velocityScratch } },
    ]);
    this.swapVelocity();

    this.dispatch("wet", [
      uniforms,
      { binding: 1, resource: { buffer: this.wet } },
      { binding: 2, resource: { buffer: this.wetScratch } },
      { binding: 3, resource: { buffer: this.velocity } },
    ]);
    const spareWet = this.wet;
    this.wet = this.wetScratch;
    this.wetScratch = spareWet;

    this.dispatch("advect-pigment", [
      uniforms,
      { binding: 1, resource: { buffer: this.mobile } },
      { binding: 2, resource: { buffer: this.mobileScratch } },
      { binding: 3, resource: { buffer: this.wet } },
      { binding: 4, resource: { buffer: this.velocity } },
    ]);
    this.dispatch("pigment", [
      uniforms,
      { binding: 1, resource: { buffer: this.mobileScratch } },
      { binding: 2, resource: { buffer: this.mobile } },
      { binding: 3, resource: { buffer: this.wet } },
    ]);

    if (fixing) {
      this.dispatch("fix", [
        uniforms,
        { binding: 1, resource: { buffer: this.mobile } },
        { binding: 2, resource: { buffer: this.fixed } },
        { binding: 3, resource: { buffer: this.wet } },
      ]);
    }
  }

  async apply(
    requestId: number,
    operation: StudioLivingInkOperation,
    options: StudioLivingInkExecutionApplyOptions,
    isCancelled: () => boolean,
    yieldControl: () => Promise<void>,
  ): Promise<StudioLivingInkExecutionApplyResult> {
    this.assertActive();
    const started = performance.now();
    this.passCount = 0;
    this.markDirty(this.operationBounds(operation));

    if (operation.kind === "clear") {
      this.dispatchClearAll();
    } else if (operation.kind === "ink" || operation.kind === "water") {
      // Each operation is one pointer segment; a stale previous sample would fabricate a jump
      // impulse across the pen-up gap between two strokes.
      this.previousMark = null;
      for (const mark of operation.marks) {
        if (isCancelled()) throw new DOMException("Living Ink request cancelled.", "AbortError");
        if (operation.kind === "water") {
          this.splatMark({
            x: mark.x,
            y: mark.y,
            radius: mark.radius,
            amount: 0.55,
            color: [0, 0, 0],
            wet: 1,
          });
        } else {
          const inkMark = mark as {
            x: number;
            y: number;
            radius: number;
            color?: readonly [number, number, number] | number[];
          };
          const raw = inkMark.color;
          const color: [number, number, number] = raw && raw.length >= 3
            ? [Number(raw[0]), Number(raw[1]), Number(raw[2])]
            : [0.12, 0.1, 0.09];
          this.splatMark({
            x: inkMark.x,
            y: inkMark.y,
            radius: inkMark.radius,
            amount: 0.7,
            color,
            wet: 0.75,
          });
        }
      }
    }

    const quality = options.quality ?? (operation.kind === "fix" ? "settle" : "interactive");
    const { pressureIterations } = studioLivingInkFluidPlan(this.config, quality);
    let ticks = options.simulationTicks
      ?? (operation.kind === "advance" ? operation.fixedTicks : 1);
    if (operation.kind === "fix") {
      ticks = Math.round(
        STUDIO_LIVING_INK_EXECUTION_LIMITS.fixDurationSeconds
          / STUDIO_LIVING_INK_EXECUTION_LIMITS.fixedTimeStepSeconds,
      );
    }
    for (let tick = 0; tick < ticks; tick += 1) {
      if (isCancelled()) throw new DOMException("Living Ink request cancelled.", "AbortError");
      this.step(operation.kind === "fix", pressureIterations);
      if ((tick + 1) % 6 === 0) await yieldControl();
    }

    this.revision += 1;
    const dirtyBounds = this.simulationBounds();
    const tile = STUDIO_LIVING_INK_EXECUTION_LIMITS.dirtyTileSize;
    const dirtyTileCount =
      Math.ceil(dirtyBounds.width / tile) * Math.ceil(dirtyBounds.height / tile);
    const operationSha256 = sha256(stableJson(operation));

    if (options.present === false) {
      const applied: StudioLivingInkExecutionApplied = Object.freeze({
        kind: "living-ink/applied",
        version: STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION,
        engineVersion: STUDIO_LIVING_INK_EXECUTION_ENGINE_VERSION,
        requestId,
        revision: this.revision,
        operationKind: operation.kind,
        operationSha256,
        backend: "webgpu-offscreen-half-float",
        dirtyBounds,
        dirtyTileCount,
        passCount: this.passCount,
        pressureIterations,
        simulationTicks: ticks,
        elapsedMilliseconds: performance.now() - started,
        presented: false,
        displayReadbackCount: 0,
        imageBitmapCount: 0,
      });
      return applied;
    }

    const displayMode = options.displayMode ?? this.config.displayMode;
    await this.renderDisplay(displayMode);
    const pixels = await this.readDisplayRgba8();
    const receipt = this.makeReceipt({
      requestId,
      operationKind: operation.kind,
      operationSha256,
      dirtyBounds,
      dirtyTileCount,
      pressureIterations,
      simulationTicks: ticks,
      started,
      displaySha256: this.displayHash(pixels),
    });
    return Object.freeze({ image: this.present(pixels), receipt });
  }

  async renderFrame(
    requestId: number,
    displayMode: StudioLivingInkDisplayMode,
  ): Promise<StudioLivingInkExecutionFrame> {
    this.assertActive();
    const started = performance.now();
    this.passCount = 0;
    await this.renderDisplay(displayMode);
    const pixels = await this.readDisplayRgba8();
    const receipt = this.makeReceipt({
      requestId,
      operationKind: "restore",
      operationSha256: sha256(`render:${displayMode}:${this.revision}`),
      dirtyBounds: this.simulationBounds(),
      dirtyTileCount: 0,
      pressureIterations: 0,
      simulationTicks: 0,
      started,
      displaySha256: this.displayHash(pixels),
    });
    return Object.freeze({ image: this.present(pixels), receipt });
  }

  /** Canonical receipt hash: the presented pixels, in the orientation the receipt declares. */
  private displayHash(pixels: Uint8Array): `sha256:${string}` {
    return sha256(bottomUpRowMajor(pixels, this.config.displayWidth, this.config.displayHeight));
  }

  /**
   * Turns the resolved pixels into the frame the caller shows. The bitmap is built from the very
   * array the receipt hashes, so "what was verified" and "what reaches the screen" cannot drift
   * apart — the drift is precisely what shipped a blank WebGPU canvas past a matching receipt.
   *
   * Fails closed on a blank readback rather than presenting it. The runtime has no second pixel
   * source to fall back to; the recoverable fallback lives one level up, in
   * `tryCreateStudioLivingInkWebGpuRuntime`, which admits this runtime only after it proves it can
   * present a real frame and otherwise hands the user the WebGL2 backend.
   */
  private present(pixels: Uint8Array): ImageBitmap {
    if (studioLivingInkPresentedPixelsAreBlank(pixels)) {
      throw new Error(
        "Living Ink WGSL runtime resolved an empty display frame; refusing to present a blank canvas.",
      );
    }
    const rgba = new Uint8ClampedArray(pixels.byteLength);
    rgba.set(pixels);
    this.presentation.putImageData(
      new ImageData(rgba, this.config.displayWidth, this.config.displayHeight),
      0,
      0,
    );
    return this.canvas.transferToImageBitmap();
  }

  private async renderDisplay(_mode: StudioLivingInkDisplayMode): Promise<void> {
    this.writeUniforms();
    this.dispatch("display", [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 1, resource: { buffer: this.mobile } },
      { binding: 2, resource: { buffer: this.fixed } },
      { binding: 3, resource: { buffer: this.display } },
    ]);
  }

  /** Resolved display pixels in natural top-down ImageData order (see `bottomUpRowMajor`). */
  private async readDisplayRgba8(): Promise<Uint8Array> {
    // Map requires MAP_READ-only buffer; copy display → staging
    const bytes = this.cellCount() * 16;
    const staging = this.device.createBuffer({
      size: bytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.display, 0, staging, 0, bytes);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const f32 = new Float32Array(staging.getMappedRange().slice(0));
    staging.unmap();
    staging.destroy();
    const out = new Uint8Array(this.config.displayWidth * this.config.displayHeight * 4);
    // Field may differ from display size — nearest sample
    for (let y = 0; y < this.config.displayHeight; y += 1) {
      for (let x = 0; x < this.config.displayWidth; x += 1) {
        const fx = Math.min(
          this.config.fieldWidth - 1,
          Math.floor((x / this.config.displayWidth) * this.config.fieldWidth),
        );
        const fy = Math.min(
          this.config.fieldHeight - 1,
          Math.floor((y / this.config.displayHeight) * this.config.fieldHeight),
        );
        const si = (fy * this.config.fieldWidth + fx) * 4;
        const di = (y * this.config.displayWidth + x) * 4;
        out[di] = Math.round(Math.min(1, Math.max(0, f32[si] ?? 0)) * 255);
        out[di + 1] = Math.round(Math.min(1, Math.max(0, f32[si + 1] ?? 0)) * 255);
        out[di + 2] = Math.round(Math.min(1, Math.max(0, f32[si + 2] ?? 0)) * 255);
        out[di + 3] = 255;
      }
    }
    return out;
  }

  private makeReceipt(input: {
    requestId: number;
    operationKind: StudioLivingInkExecutionReceipt["operationKind"];
    operationSha256: `sha256:${string}`;
    dirtyBounds: StudioLivingInkBounds;
    dirtyTileCount: number;
    pressureIterations: number;
    simulationTicks: number;
    started: number;
    displaySha256: `sha256:${string}`;
  }): StudioLivingInkExecutionReceipt {
    return Object.freeze({
      kind: "studio-living-ink-execution-receipt",
      version: STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION,
      engineVersion: STUDIO_LIVING_INK_EXECUTION_ENGINE_VERSION,
      requestId: input.requestId,
      revision: this.revision,
      operationKind: input.operationKind,
      backend: "webgpu-offscreen-half-float",
      displaySha256: input.displaySha256,
      operationSha256: input.operationSha256,
      dirtyBounds: input.dirtyBounds,
      dirtyTileCount: input.dirtyTileCount,
      passCount: this.passCount,
      pressureIterations: input.pressureIterations,
      simulationTicks: input.simulationTicks,
      elapsedMilliseconds: performance.now() - input.started,
      fixedPigmentPolicy: "immutable",
      dryingWindowSeconds: studioLivingInkDryWindowSeconds(this.config.material.dryRate),
      fixDurationSeconds: 1.2,
      determinism: "same-runtime-replay",
      crossDeviceBitExact: false,
      cpuOperationHashCrossDeviceDeterministic: true,
      canonicalFrameAuthority: "first-rendered-rgba8-frame",
      replayValidation: "bounded-visual-parity",
      displayReadbackOrientation: "webgl-bottom-left-row-major",
      gpuError: 0,
      readbackFormat: "rgba8-staging-fbo",
      imageOwnership: "caller-must-close",
      contextRecovery: "worker-rebuild-journal-replay",
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const buffer of [
      this.mobile,
      this.mobileScratch,
      this.fixed,
      this.wet,
      this.wetScratch,
      this.velocity,
      this.velocityScratch,
      this.curl,
      this.pressureA,
      this.pressureB,
      this.display,
      this.uniforms,
      this.splatUniforms,
    ]) {
      try {
        buffer?.destroy();
      } catch {
        /* ignore */
      }
    }
    try {
      this.device.destroy();
    } catch {
      /* ignore */
    }
  }
}
