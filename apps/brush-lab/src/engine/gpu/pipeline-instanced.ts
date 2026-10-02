import { DAB_BYTES, DAB_FLOATS } from "../core/dab-layout";
import { InvalidStateError, LaneUnavailableError, StrokeBudgetExceededError } from "../core/errors";
import { paperFor } from "../raster/reference-renderer";

import { compileShaderOrThrow, effectiveDeviceLimits } from "./device";
import {
  alignedBytesPerRow,
  BLEND_MODE_ID,
  BUFFER_USAGE,
  DABS_BYTES,
  edgeCurveLength,
  encodeInstParams,
  ENTRY_POINTS,
  FILTER_MODE_ID,
  INSTANCED_BINDINGS,
  INSTANCED_BLIT_BINDINGS,
  isIdentityEdgeCurve,
  MAX_CANVAS_PX,
  MAX_DABS_PER_BATCH,
  PAPER_TEXTURE_SIZE,
  SHADER_STAGE,
  TEXTURE_USAGE,
  TIP_ATLAS_KINDS,
  TIP_ATLAS_LEVELS,
  TIP_ATLAS_TILE,
  tipAtlasLevelSize,
} from "./layout";
import { buildTipAtlasLevels, buildTipChainsForProgram, encodePaperTexture } from "./pipeline-compute";
import { configurePresentCanvas, createPresentPipeline, encodePresent } from "./present";
import { mapToLabImage } from "./readback";
import { GpuTimer } from "./timing";
import { INSTANCED_BLIT_WGSL, INSTANCED_DAB_WGSL } from "./wgsl/instanced-dab.wgsl";

import type { InstParamsValues } from "./layout";
import type { PresentPipeline } from "./present";
import type { DabBatch } from "../core/dab-layout";
import type { Clock, LabImage } from "../core/types";
import type { BrushProgram } from "../presets/program-schema";

/**
 * 렌더 인스턴싱 비교 레인 런타임(webgpu-instanced).
 * - dab 64 B 레이아웃을 그대로 정점 버퍼(stepMode "instance", vec4×3 + uvec4)로 넘기고 쿼드 1개/인스턴스를 draw(6, n).
 * - fragment는 compute 레인과 같은 `shade_dab` 수식, 누적은 rgba16float 획 타깃에 하드웨어 over 블렌드(one, one-minus-src-alpha).
 * - endStroke: 풀스크린 bake(doc_next = blend(doc, stroke × opacity), 핑퐁) → encode(rgba8unorm present).
 * 명시된 차이: f16 누적(compute f32와 비트 동일 아님), smudge(문서 읽기)·습식·임파스토 미지원(beginStroke가 거부).
 * 프리미티브 순서는 WebGPU가 보장하므로 같은 장치에서 결정적이다. 픽셀은 `scripts/browser-probe.mjs`의 SwiftShader(소프트웨어 WebGPU) 실행으로
 * 확인했고 실 GPU 어댑터에서는 아직 검증되지 않았다.
 */
export interface SumiInstancedConfig {
  width: number;
  height: number;
  seed: number;
  features: ReadonlySet<string>;
  clock: Clock | null;
  /** 한도 상한(생략 가능). 실제 장치 한도(device.limits)와 비교해 더 작은 쪽을 쓴다. */
  limits?: Record<string, number>;
  presentCanvas?: HTMLCanvasElement | OffscreenCanvas;
  presentFormat?: GPUTextureFormat;
}

export interface SumiInstancedBatchReceipt {
  frameIndex: number;
  dabCount: number;
  submitCount: number;
  /** draw 호출 수(획 draw + encode draw). */
  drawCount: number;
  encodeMs: number | null;
}

export interface SumiInstancedStrokeReceipt {
  dabCount: number;
  submitCount: number;
  gpuTimeMs: number | null;
  timingSource: GpuTimer["source"];
  frameTimesMs: number[];
  frames: number;
}

export const STROKE_TARGET_FORMAT: GPUTextureFormat = "rgba16float";

const VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: DAB_BYTES,
  stepMode: "instance",
  attributes: [
    { shaderLocation: 0, offset: 0, format: "float32x4" },
    { shaderLocation: 1, offset: 16, format: "float32x4" },
    { shaderLocation: 2, offset: 32, format: "float32x4" },
    { shaderLocation: 3, offset: 48, format: "uint32x4" },
  ],
};

/** IEEE half → f32(선형 readback 디코딩). */
export function halfToFloat(h: number): number {
  const s = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 0x1f) return f === 0 ? s * Infinity : NaN;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}

/** 인스턴싱 레인이 지원하지 않는 프로그램이면 사유를 돌려준다(null = 지원). */
export function instancedUnsupportedReason(program: BrushProgram): string | null {
  const model = program.deposition.model;
  if (model === "smudge") return "smudge(문서 픽업)는 렌더 인스턴싱 레인에서 지원하지 않는다";
  if (program.wet !== null && (model === "wet-flow" || model === "impasto")) return "습식·임파스토는 렌더 인스턴싱 레인에서 지원하지 않는다";
  return null;
}

export function instParamsForProgram(program: BrushProgram, width: number, height: number, strokePass: 0 | 1): InstParamsValues {
  const curve = program.edge.curve;
  return {
    width,
    height,
    blend_mode: BLEND_MODE_ID[program.deposition.blend],
    filter_mode: FILTER_MODE_ID[program.paper.filter],
    tip_atlas_tile: TIP_ATLAS_TILE,
    tip_levels: TIP_ATLAS_LEVELS,
    paper_enabled: program.paper.enabled ? 1 : 0,
    edge_curve_len: edgeCurveLength(curve),
    edge_curve_enabled: isIdentityEdgeCurve(curve) ? 0 : 1,
    stroke_pass: strokePass,
    stroke_opacity: program.deposition.opacity,
    paper_scale: program.paper.scale > 0 ? program.paper.scale : 1,
    paper_rotation: program.paper.rotationRad,
    paper_size: PAPER_TEXTURE_SIZE,
    pad_a: 0,
    pad_b: 0,
    edgeCurve: curve,
  };
}

interface Resources {
  params: GPUBuffer;
  vertices: GPUBuffer;
  tipAtlas: GPUTexture;
  paperTex: GPUTexture;
  sampler: GPUSampler;
  strokeTex: GPUTexture;
  docTex: [GPUTexture, GPUTexture];
  presentTex: GPUTexture;
  staging: GPUBuffer;
  dabBindGroup: GPUBindGroup;
  blitBindGroups: [GPUBindGroup, GPUBindGroup];
  dabPipeline: GPURenderPipeline;
  bakePipeline: GPURenderPipeline;
  encodePipeline: GPURenderPipeline;
  destroy(): void;
}

export class SumiInstancedRuntime {
  readonly width: number;
  readonly height: number;
  private readonly device: GPUDevice;
  private readonly clock: Clock | null;
  private readonly res: Resources;
  private readonly timer: GpuTimer;
  private readonly present: { pipeline: PresentPipeline; context: GPUCanvasContext; bindGroup: GPUBindGroup } | null;
  private state: "ready" | "in-stroke" | "device-lost" | "disposed" = "ready";
  private lostInfo: GPUDeviceLostInfo | null = null;
  private program: BrushProgram | null = null;
  private docIndex: 0 | 1 = 0;
  private frameIndex = 0;
  private strokeDabs = 0;
  private strokeSubmits = 0;
  private frameTimes: number[] = [];
  private tipKeyLoaded: string | null = null;
  private paperKeyLoaded: string | null = null;
  submits = 0;

  private constructor(device: GPUDevice, cfg: SumiInstancedConfig, res: Resources, present: SumiInstancedRuntime["present"]) {
    this.device = device;
    this.clock = cfg.clock;
    this.width = cfg.width;
    this.height = cfg.height;
    this.res = res;
    this.present = present;
    this.timer = new GpuTimer(device, cfg.features.has("timestamp-query"), cfg.clock);
    void device.lost.then((info) => {
      this.lostInfo = info;
      if (this.state !== "disposed") this.state = "device-lost";
    });
  }

  static async create(device: GPUDevice, cfg: SumiInstancedConfig): Promise<SumiInstancedRuntime> {
    const { width, height } = cfg;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new RangeError(`canvas size must be positive integers, got ${width}×${height}`);
    }
    if (width > MAX_CANVAS_PX || height > MAX_CANVAS_PX) {
      throw new LaneUnavailableError("limit-exceeded", `캔버스 ${width}×${height}는 상한 ${MAX_CANVAS_PX}²를 넘는다`);
    }
    // 스테이징 한도 검사는 어댑터 한도가 아니라 장치가 실제로 받은 한도(device.limits)로 한다.
    const maxBuffer = effectiveDeviceLimits(device, cfg.limits).maxBufferSize ?? 268435456;
    const stagingBytes = Math.max(alignedBytesPerRow(width) * height, alignedBytesPerRow(width, 8) * height);
    if (stagingBytes > maxBuffer) throw new StrokeBudgetExceededError(stagingBytes, maxBuffer, { buffer: "staging" });
    const S = BUFFER_USAGE;
    const T = TEXTURE_USAGE;
    const params = device.createBuffer({ label: "inst-params", size: encodeInstParams(instParamsForProgramless(width, height)).byteLength, usage: S.UNIFORM | S.COPY_DST });
    const vertices = device.createBuffer({ label: "inst-dabs", size: DABS_BYTES, usage: S.VERTEX | S.COPY_DST });
    const tipAtlas = device.createTexture({
      label: "inst-tip-atlas",
      size: { width: TIP_ATLAS_TILE * TIP_ATLAS_KINDS, height: TIP_ATLAS_TILE },
      format: "r32float",
      mipLevelCount: TIP_ATLAS_LEVELS,
      usage: T.TEXTURE_BINDING | T.COPY_DST,
    });
    const paperTex = device.createTexture({ label: "inst-paper", size: { width: PAPER_TEXTURE_SIZE, height: PAPER_TEXTURE_SIZE }, format: "rgba8unorm", usage: T.TEXTURE_BINDING | T.COPY_DST });
    const sampler = device.createSampler({ label: "inst-linear-repeat", magFilter: "linear", minFilter: "linear", addressModeU: "repeat", addressModeV: "repeat" });
    const strokeTex = device.createTexture({ label: "inst-stroke", size: { width, height }, format: STROKE_TARGET_FORMAT, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
    const docTex: [GPUTexture, GPUTexture] = [
      device.createTexture({ label: "inst-doc-a", size: { width, height }, format: STROKE_TARGET_FORMAT, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC }),
      device.createTexture({ label: "inst-doc-b", size: { width, height }, format: STROKE_TARGET_FORMAT, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC }),
    ];
    const presentTex = device.createTexture({ label: "inst-present", size: { width, height }, format: "rgba8unorm", usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING | T.COPY_SRC });
    const staging = device.createBuffer({ label: "inst-staging", size: stagingBytes, usage: S.MAP_READ | S.COPY_DST });
    const destroyAll = (): void => {
      params.destroy();
      vertices.destroy();
      staging.destroy();
      for (const t of [tipAtlas, paperTex, strokeTex, docTex[0], docTex[1], presentTex]) t.destroy();
    };
    try {
      const dabModule = await compileShaderOrThrow(device, "sumi-instanced-dab", INSTANCED_DAB_WGSL);
      const blitModule = await compileShaderOrThrow(device, "sumi-instanced-blit", INSTANCED_BLIT_WGSL);
      const B = INSTANCED_BINDINGS;
      const L = INSTANCED_BLIT_BINDINGS;
      const dabLayout = device.createBindGroupLayout({
        label: "inst-dab-bgl",
        entries: [
          { binding: B.params.binding, visibility: SHADER_STAGE.VERTEX | SHADER_STAGE.FRAGMENT, buffer: { type: "uniform" } },
          { binding: B.tipAtlas.binding, visibility: SHADER_STAGE.FRAGMENT, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } },
          { binding: B.paperTex.binding, visibility: SHADER_STAGE.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
          { binding: B.linSampler.binding, visibility: SHADER_STAGE.FRAGMENT, sampler: { type: "filtering" } },
        ],
      });
      const blitLayout = device.createBindGroupLayout({
        label: "inst-blit-bgl",
        entries: [
          { binding: L.params.binding, visibility: SHADER_STAGE.FRAGMENT, buffer: { type: "uniform" } },
          { binding: L.docTex.binding, visibility: SHADER_STAGE.FRAGMENT, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } },
          { binding: L.strokeTex.binding, visibility: SHADER_STAGE.FRAGMENT, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } },
        ],
      });
      const over: GPUBlendState = {
        color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
      };
      const dabPipeline = await device.createRenderPipelineAsync({
        label: "inst-dab",
        layout: device.createPipelineLayout({ label: "inst-dab-layout", bindGroupLayouts: [dabLayout] }),
        vertex: { module: dabModule, entryPoint: ENTRY_POINTS.instancedVs, buffers: [VERTEX_LAYOUT] },
        fragment: { module: dabModule, entryPoint: ENTRY_POINTS.instancedFs, targets: [{ format: STROKE_TARGET_FORMAT, blend: over }] },
        primitive: { topology: "triangle-list" },
      });
      const blitPipelineLayout = device.createPipelineLayout({ label: "inst-blit-layout", bindGroupLayouts: [blitLayout] });
      const bakePipeline = await device.createRenderPipelineAsync({
        label: "inst-bake",
        layout: blitPipelineLayout,
        vertex: { module: blitModule, entryPoint: ENTRY_POINTS.instancedBlitVs },
        fragment: { module: blitModule, entryPoint: ENTRY_POINTS.instancedBakeFs, targets: [{ format: STROKE_TARGET_FORMAT }] },
        primitive: { topology: "triangle-list" },
      });
      const encodePipeline = await device.createRenderPipelineAsync({
        label: "inst-encode",
        layout: blitPipelineLayout,
        vertex: { module: blitModule, entryPoint: ENTRY_POINTS.instancedBlitVs },
        fragment: { module: blitModule, entryPoint: ENTRY_POINTS.instancedEncodeFs, targets: [{ format: "rgba8unorm" }] },
        primitive: { topology: "triangle-list" },
      });
      const dabBindGroup = device.createBindGroup({
        label: "inst-dab-bg",
        layout: dabLayout,
        entries: [
          { binding: B.params.binding, resource: { buffer: params } },
          { binding: B.tipAtlas.binding, resource: tipAtlas.createView({ label: "inst-tip-view" }) },
          { binding: B.paperTex.binding, resource: paperTex.createView({ label: "inst-paper-view" }) },
          { binding: B.linSampler.binding, resource: sampler },
        ],
      });
      const strokeView = strokeTex.createView({ label: "inst-stroke-view" });
      const blitBindGroups: [GPUBindGroup, GPUBindGroup] = [0, 1].map((i) =>
        device.createBindGroup({
          label: `inst-blit-bg-${i}`,
          layout: blitLayout,
          entries: [
            { binding: L.params.binding, resource: { buffer: params } },
            { binding: L.docTex.binding, resource: docTex[i as 0 | 1].createView({ label: `inst-doc-view-${i}` }) },
            { binding: L.strokeTex.binding, resource: strokeView },
          ],
        }),
      ) as [GPUBindGroup, GPUBindGroup];
      let present: SumiInstancedRuntime["present"] = null;
      if (cfg.presentCanvas) {
        if (!cfg.presentFormat) throw new InvalidStateError("presentCanvas에는 presentFormat이 필요하다");
        const pipeline = await createPresentPipeline(device, cfg.presentFormat);
        const context = configurePresentCanvas(cfg.presentCanvas, device, cfg.presentFormat);
        present = { pipeline, context, bindGroup: pipeline.createBindGroup(presentTex.createView({ label: "inst-present-src" }), sampler) };
      }
      const res: Resources = {
        params,
        vertices,
        tipAtlas,
        paperTex,
        sampler,
        strokeTex,
        docTex,
        presentTex,
        staging,
        dabBindGroup,
        blitBindGroups,
        dabPipeline,
        bakePipeline,
        encodePipeline,
        destroy: destroyAll,
      };
      const runtime = new SumiInstancedRuntime(device, cfg, res, present);
      runtime.encodeInitial();
      return runtime;
    } catch (error) {
      destroyAll();
      throw error;
    }
  }

  get runtimeState(): "ready" | "in-stroke" | "device-lost" | "disposed" {
    return this.state;
  }

  private assertUsable(): void {
    if (this.state === "disposed") throw new InvalidStateError("SumiInstancedRuntime: dispose 뒤에 호출됐다");
    if (this.state === "device-lost" || this.lostInfo) {
      throw new LaneUnavailableError("device-lost", `WebGPU 장치 손실: ${this.lostInfo?.message ?? "unknown"}`);
    }
  }

  private colorAttachment(view: GPUTextureView, load: "clear" | "load"): GPURenderPassColorAttachment {
    return { view, loadOp: load, storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 0 } };
  }

  /** 초기: 문서·획·present를 비운다(clear 패스). */
  private encodeInitial(): void {
    this.device.queue.writeBuffer(this.res.params, 0, encodeInstParams(instParamsForProgramless(this.width, this.height)));
    const encoder = this.device.createCommandEncoder({ label: "inst-init" });
    for (const tex of [this.res.strokeTex, this.res.docTex[0], this.res.docTex[1]]) {
      encoder.beginRenderPass({ label: "inst-clear", colorAttachments: [this.colorAttachment(tex.createView(), "clear")] }).end();
    }
    this.encodeEncodePass(encoder);
    this.encodePresentPass(encoder);
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
  }

  private encodeEncodePass(encoder: GPUCommandEncoder): void {
    const pass = encoder.beginRenderPass({ label: "inst-encode-pass", colorAttachments: [this.colorAttachment(this.res.presentTex.createView(), "clear")] });
    pass.setPipeline(this.res.encodePipeline);
    pass.setBindGroup(0, this.res.blitBindGroups[this.docIndex]);
    pass.draw(3, 1);
    pass.end();
  }

  private encodePresentPass(encoder: GPUCommandEncoder): void {
    if (!this.present) return;
    encodePresent(encoder, this.present.pipeline, this.present.bindGroup, this.present.context.getCurrentTexture().createView());
  }

  /** 획 시작. 미지원 프로그램(smudge·습식·임파스토)은 LaneUnavailableError(not-implemented)로 거부한다. */
  beginStroke(program: BrushProgram, _seed: number): void {
    this.assertUsable();
    if (this.state === "in-stroke") throw new InvalidStateError("이전 획이 endStroke되지 않았다");
    const reason = instancedUnsupportedReason(program);
    if (reason) throw new LaneUnavailableError("not-implemented", reason, { laneId: "webgpu-instanced", presetId: program.id });
    this.program = program;
    this.uploadAssets(program);
    this.device.queue.writeBuffer(this.res.params, 0, encodeInstParams(instParamsForProgram(program, this.width, this.height, 1)));
    this.frameIndex = 0;
    this.strokeDabs = 0;
    this.strokeSubmits = 0;
    this.frameTimes = [];
    this.timer.reset();
    this.state = "in-stroke";
  }

  private uploadAssets(program: BrushProgram): void {
    const tipKey = `${program.tip.kind}|${program.tip.seed}|${JSON.stringify(program.tip.params)}|${program.deposition.dual ? `${program.deposition.dual.kind}|${program.deposition.dual.seed}|${JSON.stringify(program.deposition.dual.params)}` : "-"}`;
    if (this.tipKeyLoaded !== tipKey) {
      const levels = buildTipAtlasLevels(buildTipChainsForProgram(program));
      levels.forEach((data, level) => {
        const { width, height } = tipAtlasLevelSize(level);
        this.device.queue.writeTexture({ texture: this.res.tipAtlas, mipLevel: level }, data, { bytesPerRow: width * 4, rowsPerImage: height }, { width, height });
      });
      this.tipKeyLoaded = tipKey;
    }
    if (program.paper.enabled) {
      const key = `${program.paper.seed}|${program.paper.roughness}|${program.paper.absorbency}`;
      if (this.paperKeyLoaded !== key) {
        const data = encodePaperTexture(paperFor(program.paper));
        const size = PAPER_TEXTURE_SIZE;
        if (data.length !== size * size * 4) throw new RangeError(`paper texture must be ${size}²×4 bytes`);
        this.device.queue.writeTexture({ texture: this.res.paperTex }, data, { bytesPerRow: size * 4, rowsPerImage: size }, { width: size, height: size });
        this.paperKeyLoaded = key;
      }
    }
  }

  /** 프레임당 1회: 획 타깃에 draw(6, n) 1회 + encode 1회 + (present). 65,536 초과는 분할. */
  submitBatch(batch: DabBatch): SumiInstancedBatchReceipt {
    this.assertUsable();
    if (this.state !== "in-stroke") throw new InvalidStateError("beginStroke 전에 호출됐다");
    const t0 = this.clock?.now() ?? null;
    const total = batch.count;
    const chunks = Math.max(1, Math.ceil(total / MAX_DABS_PER_BATCH));
    let draws = 0;
    for (let c = 0; c < chunks; c += 1) {
      const start = c * MAX_DABS_PER_BATCH;
      const count = Math.min(MAX_DABS_PER_BATCH, total - start);
      if (count > 0) {
        const view = batch.data.subarray(start * DAB_FLOATS, (start + count) * DAB_FLOATS);
        this.device.queue.writeBuffer(this.res.vertices, 0, view.buffer, view.byteOffset, count * DAB_BYTES);
      }
      const encoder = this.device.createCommandEncoder({ label: `inst-frame-${this.frameIndex}` });
      const load: "clear" | "load" = this.frameIndex === 0 && c === 0 ? "clear" : "load";
      const pass = encoder.beginRenderPass({
        label: "inst-stroke-pass",
        colorAttachments: [this.colorAttachment(this.res.strokeTex.createView(), load)],
        timestampWrites: this.timer.passTimestamps(),
      });
      if (count > 0) {
        pass.setPipeline(this.res.dabPipeline);
        pass.setBindGroup(0, this.res.dabBindGroup);
        pass.setVertexBuffer(0, this.res.vertices, 0, count * DAB_BYTES);
        pass.draw(6, count);
        draws += 1;
      }
      pass.end();
      this.encodeEncodePass(encoder);
      draws += 1;
      this.timer.endFrame(encoder);
      this.encodePresentPass(encoder);
      this.device.queue.submit([encoder.finish()]);
      this.submits += 1;
      this.timer.afterSubmit();
    }
    const frameIndex = this.frameIndex;
    this.frameIndex += 1;
    this.strokeDabs += total;
    this.strokeSubmits += chunks;
    const encodeMs = t0 !== null && this.clock ? this.clock.now() - t0 : null;
    this.frameTimes.push(encodeMs ?? 0);
    return { frameIndex, dabCount: total, submitCount: chunks, drawCount: draws, encodeMs };
  }

  /** bake(핑퐁) → 획 clear → encode(stroke_pass 0) → present. */
  async endStroke(): Promise<SumiInstancedStrokeReceipt> {
    this.assertUsable();
    if (this.state !== "in-stroke" || !this.program) throw new InvalidStateError("beginStroke 전에 호출됐다");
    const program = this.program;
    const encoder = this.device.createCommandEncoder({ label: "inst-end-stroke" });
    const next: 0 | 1 = this.docIndex === 0 ? 1 : 0;
    const bake = encoder.beginRenderPass({ label: "inst-bake-pass", colorAttachments: [this.colorAttachment(this.res.docTex[next].createView(), "clear")] });
    bake.setPipeline(this.res.bakePipeline);
    bake.setBindGroup(0, this.res.blitBindGroups[this.docIndex]);
    bake.draw(3, 1);
    bake.end();
    this.docIndex = next;
    encoder.beginRenderPass({ label: "inst-stroke-clear", colorAttachments: [this.colorAttachment(this.res.strokeTex.createView(), "clear")] }).end();
    this.timer.flushPartial(encoder);
    this.device.queue.submit([encoder.finish()]);
    // 타임스탬프 스테이징은 이 submit 뒤에 map을 시작한다(submit 전에 map하면 command buffer가 무효가 된다). 이 호출이 없으면
    // 남은 링 구간의 측정이 유실되고 스테이징이 다음 획의 첫 제출 때 섞여 들어간다.
    this.timer.startPendingMaps();
    this.submits += 1;
    this.strokeSubmits += 1;
    // encode는 stroke_pass 0(획 레이어 제외)으로 다시 올린다 — 파라미터 갱신은 별도 제출.
    this.device.queue.writeBuffer(this.res.params, 0, encodeInstParams(instParamsForProgram(program, this.width, this.height, 0)));
    const encoder2 = this.device.createCommandEncoder({ label: "inst-end-encode" });
    this.encodeEncodePass(encoder2);
    this.encodePresentPass(encoder2);
    this.device.queue.submit([encoder2.finish()]);
    this.submits += 1;
    this.strokeSubmits += 1;
    const timing = await this.timer.resolve();
    const receipt: SumiInstancedStrokeReceipt = {
      dabCount: this.strokeDabs,
      submitCount: this.strokeSubmits,
      gpuTimeMs: timing.gpuTimeMs,
      timingSource: this.timer.source,
      frameTimesMs: this.frameTimes.slice(),
      frames: this.frameIndex,
    };
    this.program = null;
    if (this.state === "in-stroke") this.state = "ready";
    this.assertUsable();
    return receipt;
  }

  async readbackImage(): Promise<LabImage> {
    this.assertUsable();
    const encoder = this.device.createCommandEncoder({ label: "inst-readback-image" });
    encoder.copyTextureToBuffer({ texture: this.res.presentTex }, { buffer: this.res.staging, bytesPerRow: alignedBytesPerRow(this.width), rowsPerImage: this.height }, { width: this.width, height: this.height });
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
    return mapToLabImage(this.res.staging, this.width, this.height);
  }

  /** 문서(rgba16float) → f32(디코딩, 복사본). */
  async readbackLinear(): Promise<Float32Array> {
    this.assertUsable();
    const bytesPerRow = alignedBytesPerRow(this.width, 8);
    const encoder = this.device.createCommandEncoder({ label: "inst-readback-linear" });
    encoder.copyTextureToBuffer({ texture: this.res.docTex[this.docIndex] }, { buffer: this.res.staging, bytesPerRow, rowsPerImage: this.height }, { width: this.width, height: this.height });
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
    const total = bytesPerRow * this.height;
    await this.res.staging.mapAsync(0x0001, 0, total);
    const src = new DataView(this.res.staging.getMappedRange(0, total));
    const out = new Float32Array(this.width * this.height * 4);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width * 4; x += 1) {
        out[y * this.width * 4 + x] = halfToFloat(src.getUint16(y * bytesPerRow + x * 2, true));
      }
    }
    this.res.staging.unmap();
    return out;
  }

  dispose(): void {
    if (this.state === "disposed") return;
    this.state = "disposed";
    this.timer.dispose();
    this.res.destroy();
  }
}

function instParamsForProgramless(width: number, height: number): InstParamsValues {
  return {
    width,
    height,
    blend_mode: 0,
    filter_mode: 0,
    tip_atlas_tile: TIP_ATLAS_TILE,
    tip_levels: TIP_ATLAS_LEVELS,
    paper_enabled: 0,
    edge_curve_len: 2,
    edge_curve_enabled: 0,
    stroke_pass: 0,
    stroke_opacity: 1,
    paper_scale: 1,
    paper_rotation: 0,
    paper_size: PAPER_TEXTURE_SIZE,
    pad_a: 0,
    pad_b: 0,
    edgeCurve: [0, 1],
  };
}
