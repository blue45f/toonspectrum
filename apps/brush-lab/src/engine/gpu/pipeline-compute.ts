import { DAB_FIELD, DAB_FLOATS, DAB_FLAG, unpackDab } from "../core/dab-layout";
import { InvalidStateError, LaneUnavailableError, StrokeBudgetExceededError } from "../core/errors";
import { smudgePickupPerDab } from "../raster/fine-raster";
import { IMPASTO_LIGHT, IMPASTO_RELIEF_GAIN, PAPER_FIELD_SIZE, paperFor, TIP_MASK_SIZE, tipChainFor, WET_DRY_STEPS_MAX, WET_FRAME_MS } from "../raster/reference-renderer";
import { dabExtentPx, dabTileBounds, MAX_TILES_PER_DAB_DEFAULT } from "../raster/tile-binning";
import { TIP_KINDS_ORDERED } from "../texture/mip-chain";

import { createSumiBuffers, slotResetBytes } from "./buffers";
import { compileShaderOrThrow } from "./device";
import {
  BINS_OFFSETS,
  BLEND_MODE_ID,
  COMPUTE_ENTRY_ORDER,
  DABS_BYTES,
  edgeCurveLength,
  encodeParams,
  ENTRY_POINTS,
  FILTER_MODE_ID,
  GROUP2_ENTRIES,
  IMPASTO_DAB_MEMBERS,
  IMPASTO_RECORD_BYTES,
  isIdentityEdgeCurve,
  MAX_IMPASTO_DABS_PER_FRAME,
  MAX_DABS_PER_BATCH,
  MAX_REFS,
  MAX_TILES,
  PAPER_TEXTURE_SIZE,
  SCAN_BLOCK,
  SMUDGE_STATE_BYTES,
  TABLE_OFFSETS,
  TIP_ATLAS_KINDS,
  TIP_ATLAS_LEVELS,
  TIP_ATLAS_TILE,
  tipAtlasLevelSize,
  IMPASTO_WORKGROUP,
  WET_COMMIT_WORKGROUPS,
  WET_FLOATS_PER_TILE,
  WORKGROUP_1D,
  workgroupsFor,
} from "./layout";
import { configurePresentCanvas, createPresentPipeline, encodePresent } from "./present";
import {
  encodeBufferReadback,
  encodeDocumentReadback,
  encodePresentReadback,
  encodeTableHeaderReadback,
  mapTableHeader,
  mapToFloat32,
  mapToLabImage,
  mapToUint32,
} from "./readback";
import { applyReliefLighting, heightMapFromWetPool } from "./relief-readback";
import { GpuTimer } from "./timing";
import { BIN_COUNT_WGSL } from "./wgsl/bin-count.wgsl";
import { BIN_SCAN_WGSL } from "./wgsl/bin-scan.wgsl";
import { BIN_SCATTER_WGSL } from "./wgsl/bin-scatter.wgsl";
import { COMPOSITE_WGSL } from "./wgsl/composite.wgsl";
import { FINE_RASTER_WGSL } from "./wgsl/fine-raster.wgsl";
import { IMPASTO_WGSL } from "./wgsl/impasto.wgsl";
import { WET_STEP_WGSL } from "./wgsl/wet-step.wgsl";

import type { SumiBuffers } from "./buffers";
import type { EntryPointName, ParamsValues } from "./layout";
import type { PresentPipeline } from "./present";
import type { TableHeaderReadback } from "./readback";
import type { DabBatch } from "../core/dab-layout";
import type { Clock, LabImage, TipKind } from "../core/types";
import type { BrushProgram, BrushTipSpec } from "../presets/program-schema";
import type { PaperField } from "../texture/paper-grain";
import type { TipMask } from "../texture/tip-generators";

/**
 * Sumi WebGPU compute 타일 파이프라인 런타임(주력 레인).
 *
 * 프레임(submitBatch 1회)마다 encoder 1개·compute pass 1개·`queue.submit` 1회:
 *   writeBuffer(params, dabs) → clearBuffer(bins.counts, table[0,8)) →
 *   count_main → scan_blocks → scan_block_sums → scan_add → write_indirect →
 *   scatter_stable(간접) → raster_tile(간접) → [wet_step → wet_expand → wet_commit] × substeps → composite_dirty(간접)
 *   → (present 렌더 패스) → submit.
 * 배치가 MAX_DABS_PER_BATCH를 넘으면 같은 프레임 안에서 분할 제출한다(submitCount 증가, 습식 스텝은 마지막 조각만).
 *
 * endStroke: 습식이면 건조 루프(청크마다 wet_live_count readback, CPU 참조 WET_DRY_STEPS_MAX 상한) →
 *   bake_stroke(간접) → bake_wet(간접) → composite_all → 헤더 readback → 영수증. 풀·refs 초과는 StrokeBudgetExceededError.
 *
 * 결정성: 타일 안 refs는 dab 인덱스 오름차순(안정 scatter), 타일은 워크그룹 배타 소유 → 같은 장치·같은 입력이면 같은 픽셀.
 * 검증 범위: Node에서는 fake 장치로 바인딩·디스패치 계약만 본다. 실 WGSL 컴파일과 픽셀은 `scripts/browser-probe.mjs`가 Chromium
 * (SwiftShader 소프트웨어 WebGPU)에서 cpu-reference와 대조한다 — 실 GPU 어댑터에서는 아직 검증되지 않았다(status: browser-verification-required).
 */
export interface SumiComputeConfig {
  width: number;
  height: number;
  seed: number;
  strokeCapacityTiles?: number;
  wetCapacityTiles?: number;
  features: ReadonlySet<string>;
  clock: Clock | null;
  /** 장치 한도(probe 결과). 생략 시 device.limits에서 읽는다. */
  limits?: Record<string, number>;
  presentCanvas?: HTMLCanvasElement | OffscreenCanvas;
  /** `gpu.getPreferredCanvasFormat()` — presentCanvas가 있으면 필수. */
  presentFormat?: GPUTextureFormat;
}

/** beginStroke에 넘길 수 있는 사전 생성 자산(생략 시 프로그램에서 CPU 참조와 같은 규칙으로 만든다). */
export interface SumiStrokeAssets {
  /** 레벨별 r32 아틀라스(width_L × tile_L, 8종 가로 배치). 길이 = TIP_ATLAS_LEVELS. */
  tipLevels?: readonly Float32Array[];
  /** rgba8 종이(PAPER_TEXTURE_SIZE²). null = 종이 비활성. */
  paper?: Uint8Array | null;
}

/**
 * 외부(예: wasm 커널)가 만든 CSR 비닝 결과. GPU의 count/scan_blocks/scan_block_sums/scatter 패스를 대체한다.
 * `counts`·`offsets`는 타일 수만큼(offsets는 exclusive prefix, 끝에 총합 항목이 하나 더 있어도 된다), `refs`는 타일 순·dab 인덱스
 * 오름차순 CSR(안정 scatter와 같은 순서)이다. GPU는 여전히 `scan_add`(dirty 목록·획 슬롯·습식 활성화)와 `write_indirect`를 돌린다.
 */
export interface ExternalBins {
  counts: Uint32Array;
  offsets: Uint32Array;
  refs: Uint32Array;
  /** 이번 청크에서 MAX_TILES_PER_DAB 초과로 건너뛴 dab 수. */
  overflowDabs: number;
}

/** (이번 청크의 dab 배열, 개수) → CSR. 호출자가 소유한 배열을 돌려줘도 된다(런타임이 즉시 업로드한다). */
export type ExternalBinner = (dabs: Float32Array, count: number) => ExternalBins;

export interface SumiBatchReceipt {
  frameIndex: number;
  dabCount: number;
  submitCount: number;
  dispatchCount: number;
  /** encode → submit CPU 시간(ms, 시계 없으면 null). */
  encodeMs: number | null;
}

export interface SumiStrokeReceipt {
  dabCount: number;
  submitCount: number;
  gpuTimeMs: number | null;
  timingSource: GpuTimer["source"];
  frameTimesMs: number[];
  overflowDabs: number;
  poolTilesUsed: number;
  refsOverflow: number;
  poolOverflow: number;
  wetOverflow: number;
  wetTilesAllocated: number;
  /** 건조 루프에서 돈 프레임 수(습식 아니면 0). */
  dryFrames: number;
  frames: number;
}

export type SumiRuntimeState = "ready" | "in-stroke" | "device-lost" | "disposed";

/** 건조 루프 청크(프레임 수). 청크마다 wet_live_count를 읽어 0이면 멈춘다. */
export const WET_DRY_CHUNK_FRAMES = 16;

const SHADER_MODULES: readonly { label: string; code: string; entries: readonly EntryPointName[] }[] = [
  { label: "sumi-bin-count", code: BIN_COUNT_WGSL, entries: ["binCount"] },
  { label: "sumi-bin-scan", code: BIN_SCAN_WGSL, entries: ["scanBlocks", "scanBlockSums", "scanAdd", "writeIndirect"] },
  { label: "sumi-bin-scatter", code: BIN_SCATTER_WGSL, entries: ["scatter"] },
  { label: "sumi-fine-raster", code: FINE_RASTER_WGSL, entries: ["fineRaster", "smudgeCarry"] },
  { label: "sumi-wet-step", code: WET_STEP_WGSL, entries: ["wetStep", "wetExpand", "wetCommit", "bakeWet"] },
  { label: "sumi-composite", code: COMPOSITE_WGSL, entries: ["compositeDirty", "compositeAll", "bakeStroke"] },
  { label: "sumi-impasto", code: IMPASTO_WGSL, entries: ["impastoMove", "impastoApply"] },
];

function tipKey(spec: BrushTipSpec): string {
  const p = spec.params;
  return `${spec.kind}|${spec.seed}|${p.hardness}|${p.aspect}|${p.strands ?? ""}|${p.density ?? ""}|${p.angle ?? ""}|${p.frequency ?? ""}|${p.octaves ?? ""}`;
}

/** CPU 참조(reference-renderer buildTipChains)와 같은 규칙으로 8종 mip 체인을 만든다. */
export function buildTipChainsForProgram(program: BrushProgram): Record<TipKind, TipMask[]> {
  const tip = program.tip;
  const dual = program.deposition.dual;
  const chains = {} as Record<TipKind, TipMask[]>;
  for (const kind of TIP_KINDS_ORDERED) {
    const src = kind === tip.kind ? tip : dual && kind === dual.kind ? dual : null;
    chains[kind] = src ? tipChainFor(kind, src.seed, src.params) : tipChainFor(kind, 1, { hardness: 0.8, aspect: 1 });
  }
  return chains;
}

/** mip 체인 8종 → 레벨별 r32 아틀라스 데이터. */
export function buildTipAtlasLevels(chains: Record<TipKind, TipMask[]>): Float32Array[] {
  const levels: Float32Array[] = [];
  for (let level = 0; level < TIP_ATLAS_LEVELS; level += 1) {
    const { width, height, tile } = tipAtlasLevelSize(level);
    const data = new Float32Array(width * height);
    TIP_KINDS_ORDERED.forEach((kind, k) => {
      const mask = chains[kind][level];
      if (!mask || mask.size !== tile) {
        throw new RangeError(`tip chain for ${kind} has no level ${level} of size ${tile}`);
      }
      for (let y = 0; y < tile; y += 1) {
        for (let x = 0; x < tile; x += 1) {
          data[y * width + k * tile + x] = mask.data[y * tile + x] ?? 0;
        }
      }
    });
    levels.push(data);
  }
  return levels;
}

/** 종이 필드 → rgba8(R = dir/2π, G = bump, B = absorb, A = 1). */
export function encodePaperTexture(field: PaperField): Uint8Array {
  const n = field.size * field.size;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    out[i * 4] = Math.round(((field.direction[i] ?? 0) / (Math.PI * 2)) * 255);
    out[i * 4 + 1] = Math.round((field.bump[i] ?? 0) * 255);
    out[i * 4 + 2] = Math.round((field.absorb[i] ?? 0) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** 프로그램·캔버스 설정 → Params 값(프레임 가변 필드는 0). CPU 참조와 같은 활성 규칙. */
export function paramsForProgram(
  program: BrushProgram,
  cfg: { tilesX: number; tilesY: number; width: number; height: number; strokeCapacity: number; wetCapacity: number; seed: number },
): ParamsValues {
  const model = program.deposition.model;
  const wetEnabled = program.wet !== null && (model === "wet-flow" || model === "impasto");
  const wet = program.wet;
  const substeps = wet ? Math.max(1, Math.floor(wet.substeps)) : 1;
  const curve = program.edge.curve;
  return {
    dab_count: 0,
    tiles_x: cfg.tilesX,
    tiles_y: cfg.tilesY,
    tile_count: cfg.tilesX * cfg.tilesY,
    width: cfg.width,
    height: cfg.height,
    stroke_capacity: cfg.strokeCapacity,
    wet_capacity: cfg.wetCapacity,
    blend_mode: BLEND_MODE_ID[program.deposition.blend],
    seed: cfg.seed >>> 0,
    frame_index: 0,
    paper_enabled: program.paper.enabled ? 1 : 0,
    tip_atlas_tile: TIP_ATLAS_TILE,
    tip_levels: TIP_ATLAS_LEVELS,
    wet_enabled: wetEnabled ? 1 : 0,
    km_mixing: program.colorDynamics.kmMixing ? 1 : 0,
    filter_mode: FILTER_MODE_ID[program.paper.filter],
    impasto_enabled: wetEnabled && model === "impasto" ? 1 : 0,
    edge_curve_len: edgeCurveLength(curve),
    edge_curve_enabled: isIdentityEdgeCurve(curve) ? 0 : 1,
    // 표면 수명 동안 지속되는 플래그라 런타임이 프레임마다 덮어쓴다(여기서는 0).
    has_height: 0,
    stroke_opacity: program.deposition.opacity,
    paper_scale: program.paper.scale > 0 ? program.paper.scale : 1,
    paper_rotation: program.paper.rotationRad,
    paper_size: PAPER_TEXTURE_SIZE,
    substep_dt_ms: WET_FRAME_MS / substeps,
    wet_diffusion: wet?.diffusion ?? 0,
    wet_evaporation: wet?.evaporation ?? 0,
    wet_capillary: wet?.capillary ?? 0,
    wet_edge_darkening: wet?.edgeDarkening ?? 0,
    wet_granulation: wet?.granulation ?? 0,
    wet_absorptivity: wet?.absorptivity ?? 0,
    wet_drying_ms: wet?.dryingMs ?? 0,
    wet_viscosity: wet?.viscosity ?? 0,
    smudge_pickup: model === "smudge" ? smudgePickupPerDab(program.deposition.spacing) : 0,
    light_x: IMPASTO_LIGHT[0],
    light_y: IMPASTO_LIGHT[1],
    light_z: IMPASTO_LIGHT[2],
    impasto_gain: IMPASTO_RELIEF_GAIN,
    edgeCurve: curve,
  };
}

export class SumiComputeRuntime {
  readonly width: number;
  readonly height: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly features: ReadonlySet<string>;
  private readonly device: GPUDevice;
  private readonly clock: Clock | null;
  private readonly buffers: SumiBuffers;
  private readonly pipelines: Record<EntryPointName, GPUComputePipeline | null>;
  private readonly timer: GpuTimer;
  private readonly present: { pipeline: PresentPipeline; context: GPUCanvasContext; bindGroup: GPUBindGroup } | null;
  private readonly slotReset = slotResetBytes();
  private state: SumiRuntimeState = "ready";
  private lostInfo: GPUDeviceLostInfo | null = null;
  private program: BrushProgram | null = null;
  private params: ParamsValues | null = null;
  private wetEnabled = false;
  /** 이번 획이 smudge 침착 모델이면 프레임마다 smudge_carry를 낸다. */
  private smudgeEnabled = false;
  /** 임파스토 높이가 한 번이라도 쌓였는가(CPU `Surface.hasHeight` 미러). 표면(런타임) 수명 동안 유지된다. */
  private hasHeight = false;
  private substeps = 1;
  private frameIndex = 0;
  /** 외부 비닝을 쓴 획의 누적 overflow(GPU count_main 대신 호스트가 절대값을 table에 쓴다). */
  private externalDabOverflow = 0;
  private externalRefsOverflow = 0;
  private strokeDabs = 0;
  private strokeSubmits = 0;
  private frameTimes: number[] = [];
  private tipKeyLoaded: string | null = null;
  private paperKeyLoaded: string | null = null;
  /** 전체 submit 수(통계). */
  submits = 0;

  private constructor(
    device: GPUDevice,
    cfg: SumiComputeConfig,
    buffers: SumiBuffers,
    pipelines: Record<EntryPointName, GPUComputePipeline | null>,
    present: { pipeline: PresentPipeline; context: GPUCanvasContext; bindGroup: GPUBindGroup } | null,
  ) {
    this.device = device;
    this.clock = cfg.clock;
    this.width = cfg.width;
    this.height = cfg.height;
    this.tilesX = buffers.budget.tilesX;
    this.tilesY = buffers.budget.tilesY;
    this.features = cfg.features;
    this.buffers = buffers;
    this.pipelines = pipelines;
    this.present = present;
    this.timer = new GpuTimer(device, cfg.features.has("timestamp-query"), cfg.clock);
    void device.lost.then((info) => {
      this.lostInfo = info;
      if (this.state !== "disposed") this.state = "device-lost";
    });
  }

  /** 파이프라인 전부(COMPUTE_ENTRY_ORDER 순서)와 자원을 만든다. WGSL 오류는 WgslCompileError로 던진다. */
  static async create(device: GPUDevice, cfg: SumiComputeConfig): Promise<SumiComputeRuntime> {
    const limits = cfg.limits ?? readDeviceLimits(device);
    const buffers = createSumiBuffers(device, {
      width: cfg.width,
      height: cfg.height,
      strokeCapacityTiles: cfg.strokeCapacityTiles,
      wetCapacityTiles: cfg.wetCapacityTiles,
      limits,
    });
    try {
      const modules = new Map<EntryPointName, GPUShaderModule>();
      for (const m of SHADER_MODULES) {
        const module = await compileShaderOrThrow(device, m.label, m.code);
        for (const e of m.entries) modules.set(e, module);
      }
      const pipelines = {} as Record<EntryPointName, GPUComputePipeline | null>;
      for (const key of Object.keys(ENTRY_POINTS) as EntryPointName[]) pipelines[key] = null;
      const created = await Promise.all(
        COMPUTE_ENTRY_ORDER.map((entry) => {
          const module = modules.get(entry);
          if (!module) throw new InvalidStateError(`no shader module for ${entry}`);
          // group 2(간접 인자·임파스토 레코드)를 쓰는 파이프라인만 레이아웃에 넣는다(INDIRECT/쓰기 storage usage scope 충돌 회피).
          const usesGroup2 = (GROUP2_ENTRIES as readonly EntryPointName[]).includes(entry);
          return device.createComputePipelineAsync({
            label: `sumi-${ENTRY_POINTS[entry]}`,
            layout: usesGroup2 ? buffers.layouts.pipelineWithGroup2 : buffers.layouts.pipeline,
            compute: { module, entryPoint: ENTRY_POINTS[entry] },
          });
        }),
      );
      COMPUTE_ENTRY_ORDER.forEach((entry, i) => {
        pipelines[entry] = created[i] ?? null;
      });
      let present: { pipeline: PresentPipeline; context: GPUCanvasContext; bindGroup: GPUBindGroup } | null = null;
      if (cfg.presentCanvas) {
        if (!cfg.presentFormat) {
          throw new InvalidStateError("presentCanvas에는 presentFormat(gpu.getPreferredCanvasFormat())이 필요하다");
        }
        const pipeline = await createPresentPipeline(device, cfg.presentFormat);
        const context = configurePresentCanvas(cfg.presentCanvas, device, cfg.presentFormat);
        const bindGroup = pipeline.createBindGroup(buffers.presentTex.createView({ label: "sumi-present-src" }), buffers.sampler);
        present = { pipeline, context, bindGroup };
      }
      const runtime = new SumiComputeRuntime(device, cfg, buffers, pipelines, present);
      runtime.encodeInitialPresent();
      return runtime;
    } catch (error) {
      buffers.destroy();
      throw error;
    }
  }

  get runtimeState(): SumiRuntimeState {
    return this.state;
  }

  get budget(): SumiBuffers["budget"] {
    return this.buffers.budget;
  }

  /** 테스트·프로브용 자원 접근(읽기 전용 의도). */
  get resources(): SumiBuffers {
    return this.buffers;
  }

  private pipeline(entry: EntryPointName): GPUComputePipeline {
    const p = this.pipelines[entry];
    if (!p) throw new InvalidStateError(`pipeline ${entry} not created`);
    return p;
  }

  private assertUsable(): void {
    if (this.state === "disposed") throw new InvalidStateError("SumiComputeRuntime: dispose 뒤에 호출됐다");
    if (this.state === "device-lost" || this.lostInfo) {
      throw new LaneUnavailableError("device-lost", `WebGPU 장치 손실: ${this.lostInfo?.message ?? "unknown"}`, {
        reason: this.lostInfo?.reason ?? "unknown",
      });
    }
  }

  private assertStroke(): { program: BrushProgram; params: ParamsValues } {
    this.assertUsable();
    if (this.state !== "in-stroke" || !this.program || !this.params) {
      throw new InvalidStateError("beginStroke 전에 호출됐다");
    }
    return { program: this.program, params: this.params };
  }

  /** 초기 present(빈 문서) — composite_all 1회. */
  private encodeInitialPresent(): void {
    const params = paramsForProgramless(this);
    this.writeParams(params);
    const encoder = this.device.createCommandEncoder({ label: "sumi-init" });
    const pass = encoder.beginComputePass({ label: "sumi-init-pass" });
    this.bind(pass);
    pass.setPipeline(this.pipeline("compositeAll"));
    pass.dispatchWorkgroups(this.tilesX, this.tilesY, 1);
    pass.end();
    this.encodePresentPass(encoder);
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
  }

  private bind(pass: GPUComputePassEncoder): void {
    pass.setBindGroup(0, this.buffers.bindGroups.group0);
    pass.setBindGroup(1, this.buffers.bindGroups.group1);
    // group 2(간접 인자·임파스토 레코드)는 GROUP2_ENTRIES 파이프라인의 레이아웃에만 있다. 다른 파이프라인은 이 슬롯을 레이아웃에 갖지 않는다.
    // 동적 오프셋 uniform이 있어 오프셋 1개가 필요하다(임파스토 패스는 dab마다 다시 설정한다).
    pass.setBindGroup(2, this.buffers.bindGroups.group2, [0]);
  }

  private writeParams(values: ParamsValues): void {
    this.device.queue.writeBuffer(this.buffers.params, 0, encodeParams(values));
  }

  private encodePresentPass(encoder: GPUCommandEncoder): void {
    if (!this.present) return;
    encodePresent(encoder, this.present.pipeline, this.present.bindGroup, this.present.context.getCurrentTexture().createView());
  }

  /**
   * 획 시작: 프로그램 자산(팁 아틀라스·종이) 업로드, Params 고정 필드 설정, 획 카운터 초기화.
   * 자산은 키가 같으면 다시 올리지 않는다.
   */
  beginStroke(program: BrushProgram, seed: number, assets: SumiStrokeAssets = {}): void {
    this.assertUsable();
    if (this.state === "in-stroke") throw new InvalidStateError("이전 획이 endStroke되지 않았다");
    const budget = this.buffers.budget;
    this.program = program;
    this.params = paramsForProgram(program, {
      tilesX: this.tilesX,
      tilesY: this.tilesY,
      width: this.width,
      height: this.height,
      strokeCapacity: budget.strokeCapacityTiles,
      wetCapacity: budget.wetCapacityTiles,
      seed,
    });
    this.wetEnabled = this.params.wet_enabled === 1;
    this.smudgeEnabled = program.deposition.model === "smudge";
    // 새 획: smudge 운반 색 상태(carry·loaded)를 비운다. 큐 순서상 이 획의 첫 제출 앞에서 실행된다.
    if (this.smudgeEnabled) this.device.queue.writeBuffer(this.buffers.bins, BINS_OFFSETS.smudgeState, new Float32Array(SMUDGE_STATE_BYTES / 4));
    this.substeps = program.wet ? Math.max(1, Math.floor(program.wet.substeps)) : 1;
    this.uploadTipAtlas(program, assets.tipLevels);
    this.uploadPaper(program, assets.paper);
    this.frameIndex = 0;
    this.externalDabOverflow = 0;
    this.externalRefsOverflow = 0;
    this.strokeDabs = 0;
    this.strokeSubmits = 0;
    this.frameTimes = [];
    this.timer.reset();
    this.state = "in-stroke";
  }

  private uploadTipAtlas(program: BrushProgram, override: readonly Float32Array[] | undefined): void {
    const key = override ? `override:${this.frameIndex}:${this.strokeDabs}` : `${tipKey(program.tip)}|${program.deposition.dual ? tipKey(program.deposition.dual) : "-"}`;
    if (!override && this.tipKeyLoaded === key) return;
    const levels = override ?? buildTipAtlasLevels(buildTipChainsForProgram(program));
    if (levels.length !== TIP_ATLAS_LEVELS) throw new RangeError(`tip atlas needs ${TIP_ATLAS_LEVELS} levels, got ${levels.length}`);
    for (let level = 0; level < TIP_ATLAS_LEVELS; level += 1) {
      const { width, height } = tipAtlasLevelSize(level);
      const data = levels[level];
      if (!data || data.length !== width * height) throw new RangeError(`tip atlas level ${level} must have ${width * height} floats`);
      this.device.queue.writeTexture(
        { texture: this.buffers.tipAtlas, mipLevel: level },
        data,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width, height },
      );
    }
    this.tipKeyLoaded = override ? null : key;
  }

  private uploadPaper(program: BrushProgram, override: Uint8Array | null | undefined): void {
    if (override === null) return;
    if (!override && !program.paper.enabled) return;
    const key = override ? null : `${program.paper.seed}|${program.paper.roughness}|${program.paper.absorbency}`;
    if (key && this.paperKeyLoaded === key) return;
    const data = override ?? encodePaperTexture(paperFor(program.paper));
    const size = PAPER_TEXTURE_SIZE;
    if (data.length !== size * size * 4) throw new RangeError(`paper texture must be ${size}²×4 bytes`);
    this.device.queue.writeTexture(
      { texture: this.buffers.paperTex },
      data,
      { bytesPerRow: size * 4, rowsPerImage: size },
      { width: size, height: size },
    );
    this.paperKeyLoaded = key;
  }

  /**
   * 프레임당 1회. 배치가 MAX_DABS_PER_BATCH를 넘으면 분할 제출한다.
   * `binner`가 있으면 CSR 비닝을 호스트가 대신한다(하이브리드 레인): GPU는 binCount·scanBlocks·scanBlockSums·scatter를 건너뛴다.
   */
  submitBatch(batch: DabBatch, binner?: ExternalBinner): SumiBatchReceipt {
    const { params } = this.assertStroke();
    const t0 = this.clock?.now() ?? null;
    const total = batch.count;
    // CPU 참조(Surface.addDabs)와 같은 조건: 임파스토 프로그램이 dab를 올린 순간부터 표시 시점 릴리프 조명을 켠다.
    if (params.impasto_enabled === 1 && total > 0) this.hasHeight = true;
    const chunks = Math.max(1, Math.ceil(total / MAX_DABS_PER_BATCH));
    let dispatchCount = 0;
    for (let c = 0; c < chunks; c += 1) {
      const start = c * MAX_DABS_PER_BATCH;
      const count = Math.min(MAX_DABS_PER_BATCH, total - start);
      const view = batch.data.subarray(start * DAB_FLOATS, (start + count) * DAB_FLOATS);
      dispatchCount += this.encodeFrame(params, view, count, c === chunks - 1, binner);
    }
    const frameIndex = this.frameIndex;
    this.frameIndex += 1;
    this.strokeDabs += total;
    this.strokeSubmits += chunks;
    const encodeMs = t0 !== null && this.clock ? this.clock.now() - t0 : null;
    this.frameTimes.push(encodeMs ?? 0);
    return { frameIndex, dabCount: total, submitCount: chunks, dispatchCount, encodeMs };
  }

  private encodeFrame(params: ParamsValues, dabsView: Float32Array, dabCount: number, last: boolean, binner?: ExternalBinner): number {
    const q = this.device.queue;
    this.writeParams({ ...params, dab_count: dabCount, frame_index: this.frameIndex, has_height: this.hasHeight ? 1 : 0 });
    if (dabCount > 0) {
      const bytes = dabCount * DAB_FLOATS * 4;
      if (bytes > DABS_BYTES) throw new StrokeBudgetExceededError(dabCount, MAX_DABS_PER_BATCH, { stage: "dab-upload" });
      q.writeBuffer(this.buffers.dabs, 0, dabsView.buffer, dabsView.byteOffset, bytes);
    }
    const tileCount = this.tilesX * this.tilesY;
    if (binner) this.uploadExternalBins(binner(dabsView, dabCount), tileCount);
    const impasto = params.impasto_enabled === 1 ? this.impastoRecords(dabsView, dabCount) : null;
    const encoder = this.device.createCommandEncoder({ label: `sumi-frame-${this.frameIndex}` });
    // 외부 비닝은 counts를 통째로 덮어쓰므로 clear가 필요 없다(GPU 비닝은 count_main이 원자 증가하므로 매 프레임 0으로 비운다).
    if (!binner) encoder.clearBuffer(this.buffers.bins, BINS_OFFSETS.counts, MAX_TILES * 4);
    encoder.clearBuffer(this.buffers.table, 0, TABLE_OFFSETS.frameClearBytes);
    // 임파스토 dab가 있으면 프레임이 3 pass(래스터까지 | 임파스토 dab 순서 패스 | 습식·합성)로 나뉜다. 타임스탬프는 첫 pass 시작·마지막 pass 끝.
    const split = impasto !== null && impasto.count > 0;
    let pass = encoder.beginComputePass({ label: "sumi-frame-pass", timestampWrites: this.timer.passTimestamps(split ? "begin" : "both") });
    this.bind(pass);
    let dispatches = 0;
    const direct = (entry: EntryPointName, x: number, y = 1): void => {
      pass.setPipeline(this.pipeline(entry));
      pass.dispatchWorkgroups(x, y, 1);
      dispatches += 1;
    };
    const indirect = (entry: EntryPointName, offset: number): void => {
      pass.setPipeline(this.pipeline(entry));
      pass.dispatchWorkgroupsIndirect(this.buffers.indirect, offset);
      dispatches += 1;
    };
    if (!binner) {
      direct("binCount", workgroupsFor(dabCount, WORKGROUP_1D));
      direct("scanBlocks", workgroupsFor(tileCount, SCAN_BLOCK));
      direct("scanBlockSums", 1);
    }
    direct("scanAdd", workgroupsFor(tileCount, WORKGROUP_1D));
    direct("writeIndirect", 1);
    if (!binner) indirect("scatter", this.buffers.indirectOffset);
    if (this.smudgeEnabled && dabCount > 0) direct("smudgeCarry", 1);
    indirect("fineRaster", this.buffers.indirectOffset);
    if (split && impasto) {
      pass.end();
      pass = encoder.beginComputePass({ label: "sumi-impasto-pass" });
      pass.setBindGroup(0, this.buffers.bindGroups.group0);
      pass.setBindGroup(1, this.buffers.bindGroups.group1);
      // dab 인덱스 순서로 (move → apply). 두 dispatch 사이·dab 사이의 storage 동기화가 CPU의 dab 순서 의미를 보장한다.
      for (let k = 0; k < impasto.count; k += 1) {
        const groups = impasto.groups[k] ?? 1;
        pass.setBindGroup(2, this.buffers.bindGroups.group2, [k * IMPASTO_RECORD_BYTES]);
        pass.setPipeline(this.pipeline("impastoMove"));
        pass.dispatchWorkgroups(groups, 1, 1);
        pass.setPipeline(this.pipeline("impastoApply"));
        pass.dispatchWorkgroups(groups, 1, 1);
        dispatches += 2;
      }
      pass.end();
      pass = encoder.beginComputePass({ label: "sumi-frame-tail-pass", timestampWrites: this.timer.passTimestamps("end") });
      this.bind(pass);
    }
    if (this.wetEnabled && last) this.encodeWetSteps(indirect, direct, 1);
    indirect("compositeDirty", this.buffers.indirectOffset);
    pass.end();
    this.timer.endFrame(encoder);
    this.encodePresentPass(encoder);
    q.submit([encoder.finish()]);
    this.submits += 1;
    this.timer.afterSubmit();
    return dispatches;
  }

  /**
   * 이번 청크의 임파스토 dab마다 창·방향 레코드를 만들어 동적 uniform 버퍼에 올린다(CPU `applyImpastoDabs`와 같은 f64 산술).
   * 건너뛰는 dab: 타일 범위가 없거나 MAX_TILES_PER_DAB 초과(래스터와 같은 규칙), 창이 비는 경우. 밀기 영역이 스크래치(MAX_REFS)보다 크면
   * fail-visible. 반환 `groups[k]` = k번째 레코드의 dispatch 워크그룹 수.
   */
  private impastoRecords(dabsView: Float32Array, dabCount: number): { count: number; groups: number[] } | null {
    if (dabCount === 0) return null;
    const u32 = new Uint32Array(dabsView.buffer, dabsView.byteOffset, dabsView.length);
    // CPU `applyImpastoDabs`의 밀기 세기: oilDepth·(1 − viscosity). 높이장 이동만 미러한다(유화 물감 층 색·혼색·가장자리 둑은 CPU 전용 — 미러 대기).
    const wp = this.program?.wet ?? null;
    const push = wp ? wp.oilDepth * (1 - Math.min(1, Math.max(0, wp.viscosity))) : 0;
    const widthPx = this.width;
    const heightPx = this.height;
    const records: { bytes: ArrayBuffer; groups: number }[] = [];
    for (let i = 0; i < dabCount; i += 1) {
      const flags = u32[i * DAB_FLOATS + DAB_FIELD.flags] ?? 0;
      if ((flags & DAB_FLAG.impasto) === 0) continue;
      const dab = unpackDab(dabsView, i);
      const bounds = dabTileBounds(dab, this.tilesX, this.tilesY);
      if (!bounds) continue;
      if ((bounds.x1 - bounds.x0 + 1) * (bounds.y1 - bounds.y0 + 1) > MAX_TILES_PER_DAB_DEFAULT) continue;
      const extent = dabExtentPx(dab);
      const x0 = Math.max(0, Math.floor(dab.x - extent));
      const x1 = Math.min(widthPx - 1, Math.ceil(dab.x + extent));
      const y0 = Math.max(0, Math.floor(dab.y - extent));
      const y1 = Math.min(heightPx - 1, Math.ceil(dab.y + extent));
      if (x1 < x0 || y1 < y0) continue;
      const c = Math.cos(dab.angle);
      const sn = Math.sin(dab.angle);
      const horizontal = Math.abs(c) >= Math.abs(sn);
      const stepX = horizontal ? (c >= 0 ? 1 : -1) : 0;
      const stepY = horizontal ? 0 : sn >= 0 ? 1 : -1;
      const rx0 = Math.max(0, x0 - (horizontal ? 1 : 0));
      const rx1 = Math.min(widthPx - 1, x1 + (horizontal ? 1 : 0));
      const ry0 = Math.max(0, y0 - (horizontal ? 0 : 1));
      const ry1 = Math.min(heightPx - 1, y1 + (horizontal ? 0 : 1));
      const area = (rx1 - rx0 + 1) * (ry1 - ry0 + 1);
      if (area > MAX_REFS) {
        throw new StrokeBudgetExceededError(area, MAX_REFS, { stage: "impasto-window", note: "밀기 영역이 스크래치(refs) 용량을 넘는다" });
      }
      const bytes = new ArrayBuffer(IMPASTO_RECORD_BYTES);
      const view = new DataView(bytes);
      const values: Record<(typeof IMPASTO_DAB_MEMBERS)[number][0], number> = {
        dab_index: i,
        win_x0: x0,
        win_y0: y0,
        win_x1: x1,
        win_y1: y1,
        reg_x0: rx0,
        reg_y0: ry0,
        reg_x1: rx1,
        reg_y1: ry1,
        step_x: stepX,
        step_y: stepY,
        push,
        do_push: push > 0 ? 1 : 0,
      };
      IMPASTO_DAB_MEMBERS.forEach(([name, type], k) => {
        const v = values[name];
        if (type === "f32") view.setFloat32(k * 4, v, true);
        else if (type === "i32") view.setInt32(k * 4, v, true);
        else view.setUint32(k * 4, v >>> 0, true);
      });
      records.push({ bytes, groups: Math.ceil(area / IMPASTO_WORKGROUP) });
    }
    if (records.length === 0) return null;
    if (records.length > MAX_IMPASTO_DABS_PER_FRAME) {
      throw new StrokeBudgetExceededError(records.length, MAX_IMPASTO_DABS_PER_FRAME, { stage: "impasto-dabs" });
    }
    const all = new Uint8Array(records.length * IMPASTO_RECORD_BYTES);
    records.forEach((r, k) => all.set(new Uint8Array(r.bytes), k * IMPASTO_RECORD_BYTES));
    this.device.queue.writeBuffer(this.buffers.impastoRecords, 0, all);
    return { count: records.length, groups: records.map((r) => r.groups) };
  }

  /**
   * 외부 CSR을 GPU 버퍼에 올린다(`queue.writeBuffer`는 제출 앞에서 실행된다). scan_add는 offsets에 block_sums prefix를 더하므로
   * block_sums는 0이어야 한다 — scan_block_sums를 건너뛰는 이 경로에서는 버퍼 생성 시 0 그대로다.
   * dab_overflow·refs_overflow는 count_main/scan_block_sums가 쓰던 획 누적 카운터이므로 호스트가 누적한 절대값을 쓴다.
   */
  private uploadExternalBins(bins: ExternalBins, tileCount: number): void {
    if (bins.counts.length < tileCount || bins.offsets.length < tileCount) {
      throw new RangeError(`external bins need ${tileCount} counts/offsets, got ${bins.counts.length}/${bins.offsets.length}`);
    }
    const q = this.device.queue;
    this.externalDabOverflow += bins.overflowDabs;
    if (bins.refs.length > MAX_REFS) this.externalRefsOverflow += bins.refs.length - MAX_REFS;
    q.writeBuffer(this.buffers.bins, BINS_OFFSETS.counts, bins.counts.subarray(0, tileCount));
    q.writeBuffer(this.buffers.bins, BINS_OFFSETS.offsets, bins.offsets.subarray(0, tileCount));
    const stored = Math.min(bins.refs.length, MAX_REFS);
    if (stored > 0) q.writeBuffer(this.buffers.refs, 0, bins.refs.subarray(0, stored));
    q.writeBuffer(
      this.buffers.table,
      TABLE_OFFSETS.dabOverflow,
      new Uint32Array([this.externalDabOverflow >>> 0, this.externalRefsOverflow >>> 0]),
    );
  }

  /** 습식 서브스텝 frames × substeps회(wet_step → wet_expand → wet_commit). 디스패치 계수는 호출자 클로저가 센다. */
  private encodeWetSteps(
    indirect: (entry: EntryPointName, offset: number) => void,
    direct: (entry: EntryPointName, x: number) => void,
    frames: number,
  ): void {
    for (let f = 0; f < frames; f += 1) {
      for (let s = 0; s < this.substeps; s += 1) {
        indirect("wetStep", this.buffers.wetIndirectOffset);
        indirect("wetExpand", this.buffers.wetIndirectOffset);
        direct("wetCommit", WET_COMMIT_WORKGROUPS);
      }
    }
  }

  /** 건조 루프: 청크마다 wet_live_count를 읽어 0이면 멈춘다(CPU 참조 WET_DRY_STEPS_MAX 상한). */
  private async dryLoop(): Promise<number> {
    let frames = 0;
    while (frames < WET_DRY_STEPS_MAX) {
      const chunk = Math.min(WET_DRY_CHUNK_FRAMES, WET_DRY_STEPS_MAX - frames);
      const encoder = this.device.createCommandEncoder({ label: "sumi-dry" });
      const pass = encoder.beginComputePass({ label: "sumi-dry-pass" });
      this.bind(pass);
      const direct = (entry: EntryPointName, x: number): void => {
        pass.setPipeline(this.pipeline(entry));
        pass.dispatchWorkgroups(x, 1, 1);
      };
      const indirect = (entry: EntryPointName, offset: number): void => {
        pass.setPipeline(this.pipeline(entry));
        pass.dispatchWorkgroupsIndirect(this.buffers.indirect, offset);
      };
      this.encodeWetSteps(indirect, direct, chunk);
      pass.end();
      encodeTableHeaderReadback(encoder, this.buffers.table, this.buffers.tableStaging);
      this.device.queue.submit([encoder.finish()]);
      this.submits += 1;
      this.strokeSubmits += 1;
      frames += chunk;
      const header = await mapTableHeader(this.buffers.tableStaging);
      this.assertUsable();
      if (header.wetLiveCount === 0) break;
    }
    return frames;
  }

  /** 획 종료: 건조 → bake → composite_all → 헤더 readback → 영수증. 예산 초과는 상태를 리셋한 뒤 던진다. */
  async endStroke(): Promise<SumiStrokeReceipt> {
    this.assertStroke();
    let dryFrames = 0;
    if (this.wetEnabled) dryFrames = await this.dryLoop();
    const encoder = this.device.createCommandEncoder({ label: "sumi-end-stroke" });
    const pass = encoder.beginComputePass({ label: "sumi-end-stroke-pass" });
    this.bind(pass);
    pass.setPipeline(this.pipeline("bakeStroke"));
    pass.dispatchWorkgroupsIndirect(this.buffers.indirect, this.buffers.strokeIndirectOffset);
    if (this.wetEnabled) {
      pass.setPipeline(this.pipeline("bakeWet"));
      pass.dispatchWorkgroupsIndirect(this.buffers.indirect, this.buffers.wetIndirectOffset);
    }
    pass.setPipeline(this.pipeline("compositeAll"));
    pass.dispatchWorkgroups(this.tilesX, this.tilesY, 1);
    pass.end();
    encoder.clearBuffer(this.buffers.strokePool);
    this.timer.flushPartial(encoder);
    this.encodePresentPass(encoder);
    encodeTableHeaderReadback(encoder, this.buffers.table, this.buffers.tableStaging);
    this.device.queue.submit([encoder.finish()]);
    // 타임스탬프 스테이징은 이 submit 뒤에 map한다(submit 전에 map하면 command buffer가 무효가 된다).
    this.timer.startPendingMaps();
    this.submits += 1;
    this.strokeSubmits += 1;
    // 다음 획을 위한 리셋(큐 순서상 위 제출 뒤에 실행된다).
    this.device.queue.writeBuffer(this.buffers.table, 0, new ArrayBuffer(TABLE_OFFSETS.strokeResetBytes));
    this.device.queue.writeBuffer(this.buffers.table, TABLE_OFFSETS.slots, this.slotReset);
    const [timing, header] = await Promise.all([this.timer.resolve(), mapTableHeader(this.buffers.tableStaging)]);
    const receipt = this.buildReceipt(header, timing.gpuTimeMs, dryFrames);
    this.program = null;
    this.params = null;
    if (this.state === "in-stroke") this.state = "ready";
    this.assertUsable();
    this.throwIfOverBudget(header);
    return receipt;
  }

  private buildReceipt(header: TableHeaderReadback, gpuTimeMs: number | null, dryFrames: number): SumiStrokeReceipt {
    const budget = this.buffers.budget;
    return {
      dabCount: this.strokeDabs,
      submitCount: this.strokeSubmits,
      gpuTimeMs,
      timingSource: this.timer.source,
      frameTimesMs: this.frameTimes.slice(),
      overflowDabs: header.dabOverflow,
      poolTilesUsed: Math.min(header.poolCursor, budget.strokeCapacityTiles),
      refsOverflow: header.refsOverflow,
      poolOverflow: header.poolOverflow,
      wetOverflow: header.wetOverflow,
      wetTilesAllocated: Math.min(header.wetActiveCount, budget.wetCapacityTiles),
      dryFrames,
      frames: this.frameIndex,
    };
  }

  /** CPU 참조(TilePool.alloc)가 던지는 것과 같은 조건을 fail-visible로 드러낸다. */
  private throwIfOverBudget(header: TableHeaderReadback): void {
    const budget = this.buffers.budget;
    if (header.poolOverflow > 0) {
      throw new StrokeBudgetExceededError(budget.strokeCapacityTiles + header.poolOverflow, budget.strokeCapacityTiles, { stage: "stroke-pool" });
    }
    if (header.wetOverflow > 0) {
      throw new StrokeBudgetExceededError(budget.wetCapacityTiles + header.wetOverflow, budget.wetCapacityTiles, { stage: "wet-pool" });
    }
    if (header.refsOverflow > 0) {
      throw new StrokeBudgetExceededError(header.refsOverflow, 0, { stage: "refs", note: "MAX_REFS 초과분(획 누적)" });
    }
  }

  /** present 텍스처 → sRGB straight RGBA8. */
  async readbackImage(): Promise<LabImage> {
    this.assertUsable();
    const encoder = this.device.createCommandEncoder({ label: "sumi-readback-image" });
    encodePresentReadback(encoder, this.buffers.presentTex, this.buffers.staging, this.width, this.height);
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
    return mapToLabImage(this.buffers.staging, this.width, this.height);
  }

  /**
   * 문서 버퍼 → 선형 premultiplied f32. 임파스토 높이가 있었다면 CPU `Surface.toLinear()`와 같게 표시 시점 릴리프 조명을
   * 호스트에서 적용한다(GPU 문서 버퍼는 높이를 굽지 않고 composite가 present 텍스처에만 조명한다). 높이가 없으면 문서 그대로다.
   */
  async readbackLinear(): Promise<Float32Array> {
    this.assertUsable();
    const raw = await this.readbackDocumentRaw();
    if (!this.hasHeight) return raw;
    const heightMap = await this.readbackHeightMap();
    return applyReliefLighting(raw, heightMap, this.width);
  }

  /** 문서 버퍼 그대로(조명 없음). */
  private async readbackDocumentRaw(): Promise<Float32Array> {
    const encoder = this.device.createCommandEncoder({ label: "sumi-readback-linear" });
    encodeDocumentReadback(encoder, this.buffers.document, this.buffers.staging, this.buffers.budget.bytes.document);
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
    return mapToFloat32(this.buffers.staging, this.width * this.height * 4);
  }

  /**
   * 습식 풀 height 채널을 문서 크기 배열로 읽는다(CPU `Surface.heightMap` 미러). 헤더(커서·parity) → 슬롯 표 → 현재 parity 풀의
   * 사용 슬롯 구간 순으로 세 번 복사·map한다(스테이징 버퍼 하나를 순차 재사용). 테스트·프로브·readbackLinear 전용 경로다.
   */
  async readbackHeightMap(): Promise<Float32Array> {
    this.assertUsable();
    const header = await this.readbackTableHeader();
    const budget = this.buffers.budget;
    const used = Math.min(header.wetCursor, budget.wetCapacityTiles);
    if (used === 0) return new Float32Array(this.width * this.height);
    const tiles = this.tilesX * this.tilesY;

    const slotEncoder = this.device.createCommandEncoder({ label: "sumi-readback-wet-slots" });
    encodeBufferReadback(slotEncoder, this.buffers.table, TABLE_OFFSETS.wetSlots, this.buffers.staging, tiles * 4);
    this.device.queue.submit([slotEncoder.finish()]);
    this.submits += 1;
    const slots = await mapToUint32(this.buffers.staging, tiles);

    const poolFloats = used * WET_FLOATS_PER_TILE;
    const parityOffset = (header.wetParity & 1) * budget.wetCapacityTiles * WET_FLOATS_PER_TILE * 4;
    const poolEncoder = this.device.createCommandEncoder({ label: "sumi-readback-wet-pool" });
    encodeBufferReadback(poolEncoder, this.buffers.wetPool, parityOffset, this.buffers.staging, poolFloats * 4);
    this.device.queue.submit([poolEncoder.finish()]);
    this.submits += 1;
    const pool = await mapToFloat32(this.buffers.staging, poolFloats);
    return heightMapFromWetPool(slots, pool, used, this.width, this.height, this.tilesX);
  }

  /** 테스트·프로브용: TileTable 헤더 readback. */
  async readbackTableHeader(): Promise<TableHeaderReadback> {
    this.assertUsable();
    const encoder = this.device.createCommandEncoder({ label: "sumi-readback-table" });
    encodeTableHeaderReadback(encoder, this.buffers.table, this.buffers.tableStaging);
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
    return mapTableHeader(this.buffers.tableStaging);
  }

  dispose(): void {
    if (this.state === "disposed") return;
    this.state = "disposed";
    this.timer.dispose();
    this.buffers.destroy();
  }
}

function readDeviceLimits(device: GPUDevice): Record<string, number> {
  const out: Record<string, number> = {};
  const bag = device.limits as unknown as Record<string, unknown>;
  for (const key of ["maxStorageBufferBindingSize", "maxBufferSize", "maxTextureDimension2D"]) {
    const v = bag[key];
    if (typeof v === "number") out[key] = v;
  }
  return out;
}

/** 프로그램 없는 초기 상태의 Params(composite_all 초기화 전용). */
function paramsForProgramless(rt: SumiComputeRuntime): ParamsValues {
  const budget = rt.budget;
  return {
    dab_count: 0,
    tiles_x: rt.tilesX,
    tiles_y: rt.tilesY,
    tile_count: rt.tilesX * rt.tilesY,
    width: rt.width,
    height: rt.height,
    stroke_capacity: budget.strokeCapacityTiles,
    wet_capacity: budget.wetCapacityTiles,
    blend_mode: 0,
    seed: 0,
    frame_index: 0,
    paper_enabled: 0,
    tip_atlas_tile: TIP_ATLAS_TILE,
    tip_levels: TIP_ATLAS_LEVELS,
    wet_enabled: 0,
    km_mixing: 0,
    filter_mode: 0,
    impasto_enabled: 0,
    edge_curve_len: 2,
    edge_curve_enabled: 0,
    has_height: 0,
    stroke_opacity: 1,
    paper_scale: 1,
    paper_rotation: 0,
    paper_size: PAPER_TEXTURE_SIZE,
    substep_dt_ms: WET_FRAME_MS,
    wet_diffusion: 0,
    wet_evaporation: 0,
    wet_capillary: 0,
    wet_edge_darkening: 0,
    wet_granulation: 0,
    wet_absorptivity: 0,
    wet_drying_ms: 0,
    wet_viscosity: 0,
    smudge_pickup: 0,
    light_x: IMPASTO_LIGHT[0],
    light_y: IMPASTO_LIGHT[1],
    light_z: IMPASTO_LIGHT[2],
    impasto_gain: IMPASTO_RELIEF_GAIN,
    edgeCurve: [0, 1],
  };
}

/** 팁 아틀라스 상수 재수출(레인·프로브가 크기 계산에 쓴다). */
export const SUMI_TIP_MASK_SIZE = TIP_MASK_SIZE;
export const SUMI_PAPER_FIELD_SIZE = PAPER_FIELD_SIZE;
export const SUMI_TIP_ATLAS_KINDS = TIP_ATLAS_KINDS;
