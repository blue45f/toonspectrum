/**
 * Pure WebGPU/WGSL Living Ink field runtime.
 *
 * Replaces the WebGL2 GLSL executor when a GPU device is available: field state
 * lives in storage buffers and Stam/pigment/fix/Beer–Lambert passes are WGSL
 * compute kernels from studio-living-ink-wgsl-shaders.ts.
 */

import {
  STUDIO_LIVING_INK_EXECUTION_ENGINE_VERSION,
  STUDIO_LIVING_INK_EXECUTION_LIMITS,
  STUDIO_LIVING_INK_EXECUTION_PROTOCOL_VERSION,
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
  type StudioLivingInkWgslPassId,
} from "./studio-living-ink-wgsl-shaders";
import { sha256HexPortable } from "./studio-sha256";

import type { StudioLivingInkDisplayMode } from "./studio-living-ink-gpu-protocol";

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

  private readonly device: GPUDevice;
  private readonly config: StudioLivingInkExecutionConfig;
  private readonly canvas: OffscreenCanvas;
  private readonly pipelines = new Map<StudioLivingInkWgslPassId, GPUComputePipeline>();
  private readonly bindGroupLayouts = new Map<string, GPUBindGroupLayout>();
  private mobile!: GPUBuffer;
  private fixed!: GPUBuffer;
  private wet!: GPUBuffer;
  private pressureA!: GPUBuffer;
  private pressureB!: GPUBuffer;
  private display!: GPUBuffer;
  private uniforms!: GPUBuffer;
  private splatUniforms!: GPUBuffer;
  private revision = 0;
  private passCount = 0;
  private disposed = false;
  private dirty: StudioLivingInkBounds | null = null;

  private constructor(
    device: GPUDevice,
    config: StudioLivingInkExecutionConfig,
    canvas: OffscreenCanvas,
  ) {
    this.device = device;
    this.webGpuDevice = device;
    this.config = Object.freeze({ ...config });
    this.canvas = canvas;
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
    // Prefer pure WebGPU canvas surface when available; buffers remain source of truth.
    try {
      (canvas as OffscreenCanvas & {
        getContext?: (id: string) => unknown;
      }).getContext?.("webgpu");
    } catch {
      /* ignore — storage-buffer path still works */
    }

    const runtime = new StudioLivingInkWebGpuPureRuntime(device, config, canvas);
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

  private allocateBuffers(): void {
    const bytes = this.cellCount() * 16;
    const usage =
      GPUBufferUsage.STORAGE
      | GPUBufferUsage.COPY_SRC
      | GPUBufferUsage.COPY_DST;
    this.mobile = this.device.createBuffer({ size: bytes, usage });
    this.fixed = this.device.createBuffer({ size: bytes, usage });
    this.wet = this.device.createBuffer({ size: bytes, usage });
    this.pressureA = this.device.createBuffer({ size: bytes, usage });
    this.pressureB = this.device.createBuffer({ size: bytes, usage });
    this.display = this.device.createBuffer({ size: bytes, usage: usage | GPUBufferUsage.MAP_READ });
    this.uniforms = this.device.createBuffer({
      size: 48,
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

  private writeUniforms(extra?: { fixTransfer?: number }): void {
    const chroma = studioLivingInkChromaBleedMultipliers(
      this.config.material.chromaticSeparation,
    );
    const data = new Float32Array(12);
    const u32 = new Uint32Array(data.buffer);
    u32[0] = this.config.fieldWidth;
    u32[1] = this.config.fieldHeight;
    data[2] = STUDIO_LIVING_INK_EXECUTION_LIMITS.fixedTimeStepSeconds;
    data[3] = this.config.material.bleed;
    data[4] = this.config.material.dryRate;
    data[5] = chroma[0];
    data[6] = chroma[1];
    data[7] = chroma[2];
    data[8] = this.config.material.beerLambertDensity;
    data[9] = extra?.fixTransfer ?? 0.22;
    this.device.queue.writeBuffer(this.uniforms, 0, data);
  }

  private dispatchClearAll(): void {
    this.writeUniforms();
    this.dispatch("clear", [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 1, resource: { buffer: this.mobile } },
    ]);
    this.dispatch("clear", [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 1, resource: { buffer: this.fixed } },
    ]);
    this.dispatch("clear", [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 1, resource: { buffer: this.wet } },
    ]);
    this.dispatch("clear", [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 1, resource: { buffer: this.pressureA } },
    ]);
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
    const gx = Math.ceil(this.config.fieldWidth / 8);
    const gy = Math.ceil(this.config.fieldHeight / 8);
    passEncoder.dispatchWorkgroups(gx, gy);
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

  private splatMark(mark: {
    x: number;
    y: number;
    radius: number;
    amount?: number;
    color?: readonly [number, number, number];
    wet?: number;
  }): void {
    const data = new Float32Array([
      mark.x,
      mark.y,
      Math.max(0.5, mark.radius),
      mark.amount ?? 0.65,
      mark.color?.[0] ?? 0.15,
      mark.color?.[1] ?? 0.12,
      mark.color?.[2] ?? 0.1,
      mark.wet ?? 0.8,
    ]);
    this.device.queue.writeBuffer(this.splatUniforms, 0, data);
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
  }

  private step(fixing: boolean, pressureIterations: number): void {
    this.writeUniforms({ fixTransfer: fixing ? 0.18 : 0 });
    // pressure / jacobi ping-pong
    for (let i = 0; i < pressureIterations; i += 1) {
      const src = i % 2 === 0 ? this.pressureA : this.pressureB;
      const dst = i % 2 === 0 ? this.pressureB : this.pressureA;
      this.dispatch("jacobi", [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: { buffer: src } },
        { binding: 2, resource: { buffer: dst } },
      ]);
    }
    // pigment diffusion on mobile
    this.dispatch("pigment", [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 1, resource: { buffer: this.mobile } },
      { binding: 2, resource: { buffer: this.pressureA } }, // reuse as temp dst — swap via copy
      { binding: 3, resource: { buffer: this.wet } },
    ]);
    // copy pressureA temp back into mobile via second pigment with identity-ish rates
    // Use jacobi-free: re-splat not needed — run pigment mobile<-pressureA using clear+pigment inverted
    // Simpler: re-dispatch pigment reading pressureA into mobile by swapping bindings
    this.dispatch("pigment", [
      { binding: 0, resource: { buffer: this.uniforms } },
      { binding: 1, resource: { buffer: this.pressureA } },
      { binding: 2, resource: { buffer: this.mobile } },
      { binding: 3, resource: { buffer: this.wet } },
    ]);
    if (fixing) {
      this.dispatch("fix", [
        { binding: 0, resource: { buffer: this.uniforms } },
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
    const pressureIterations = quality === "settle"
      ? STUDIO_LIVING_INK_EXECUTION_LIMITS.settlePressureIterations
      : STUDIO_LIVING_INK_EXECUTION_LIMITS.interactivePressureIterations;
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
      displaySha256: sha256(pixels),
    });
    // transferToImageBitmap may fail without webgpu canvas context — synthesize from pixels
    let image: ImageBitmap;
    try {
      image = this.canvas.transferToImageBitmap();
    } catch {
      const c = new OffscreenCanvas(this.config.displayWidth, this.config.displayHeight);
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Living Ink WGSL display context unavailable.");
      const rgba = new Uint8ClampedArray(pixels.byteLength);
      rgba.set(pixels);
      const imageData = new ImageData(rgba, this.config.displayWidth, this.config.displayHeight);
      ctx.putImageData(imageData, 0, 0);
      image = c.transferToImageBitmap();
    }
    return Object.freeze({ image, receipt });
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
      displaySha256: sha256(pixels),
    });
    let image: ImageBitmap;
    try {
      image = this.canvas.transferToImageBitmap();
    } catch {
      const c = new OffscreenCanvas(this.config.displayWidth, this.config.displayHeight);
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Living Ink WGSL display context unavailable.");
      const rgba = new Uint8ClampedArray(pixels.byteLength);
      rgba.set(pixels);
      ctx.putImageData(
        new ImageData(rgba, this.config.displayWidth, this.config.displayHeight),
        0,
        0,
      );
      image = c.transferToImageBitmap();
    }
    return Object.freeze({ image, receipt });
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
      dryingWindowSeconds: 2 + (1 - this.config.material.dryRate) * 16,
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
      this.fixed,
      this.wet,
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
