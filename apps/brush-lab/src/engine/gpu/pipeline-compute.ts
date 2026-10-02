import { DAB_FIELD, DAB_FLOATS, DAB_FLAG, unpackDab } from "../core/dab-layout";
import { InvalidStateError, LaneUnavailableError, StrokeBudgetExceededError } from "../core/errors";
import { smudgePickupPerDab } from "../raster/fine-raster";
import {
  IMPASTO_LIGHT,
  IMPASTO_RELIEF_GAIN,
  PAPER_FIELD_SIZE,
  paperFor,
  TIP_MASK_SIZE,
  tipChainFor,
  WET_DRY_STEPS_MAX,
  WET_OIL_SETTLE_FRAMES,
} from "../raster/reference-renderer";
import { dabExtentPx, dabTileBounds, MAX_TILES_PER_DAB_DEFAULT } from "../raster/tile-binning";
import { TIP_KINDS_ORDERED } from "../texture/mip-chain";

import { assertLazyBufferFits, createSumiBuffers, slotResetBytes } from "./buffers";
import { compileShaderOrThrow, effectiveDeviceLimits } from "./device";
import {
  BINS_OFFSETS,
  BLEND_MODE_ID,
  BUFFER_USAGE,
  COMPUTE_ENTRY_ORDER,
  DABS_BYTES,
  edgeCurveLength,
  encodeParams,
  encodeWetKernel,
  ENTRY_POINTS,
  FILTER_MODE_ID,
  GROUP2_ENTRIES,
  isIdentityEdgeCurve,
  MAX_DABS_PER_BATCH,
  MAX_OIL_DABS_PER_FRAME,
  MAX_REFS,
  MAX_TILES,
  OIL_DAB_MEMBERS,
  OIL_RECORD_BYTES,
  OIL_RECORDS_PER_DAB,
  OIL_SCRATCH_HEADER_FLOATS,
  OIL_WORKGROUP,
  PAPER_TEXTURE_SIZE,
  SCAN_BLOCK,
  SMUDGE_STATE_BYTES,
  TABLE_OFFSETS,
  TIP_ATLAS_KINDS,
  TIP_ATLAS_LEVELS,
  TIP_ATLAS_TILE,
  tipAtlasLevelSize,
  WET_BINDINGS,
  WET_ENTRY_FAMILY,
  WET_EXT_FLOATS_PER_TILE,
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
import { heightMapFromWetPool } from "./relief-readback";
import { GpuTimer } from "./timing";
import { PassBinder, WetBindingSet } from "./wet-bindings";
import { encodePaperWet, oilPassesOf, oilPushOf, wetKernelValues, wetSubsteps } from "./wet-kernel";
import { BAKE_STROKE_WGSL } from "./wgsl/bake-stroke.wgsl";
import { BIN_COUNT_WGSL } from "./wgsl/bin-count.wgsl";
import { BIN_SCAN_WGSL } from "./wgsl/bin-scan.wgsl";
import { BIN_SCATTER_WGSL } from "./wgsl/bin-scatter.wgsl";
import { FINE_RASTER_WGSL } from "./wgsl/fine-raster.wgsl";
import { WET_COMPOSITE_WGSL } from "./wgsl/wet-composite.wgsl";
import { WET_OIL_WGSL } from "./wgsl/wet-oil.wgsl";
import { WET_WATER_WGSL } from "./wgsl/wet-water.wgsl";

import type { SumiBuffers } from "./buffers";
import type { EntryPointName, ParamScalarName, ParamsValues, WetEntryName, WetFamilyName } from "./layout";
import type { PresentPipeline } from "./present";
import type { TableHeaderReadback } from "./readback";
import type { WetResources } from "./wet-bindings";
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
 *   scatter_stable(간접) → raster_tile(간접) → [유화: dab마다 oil_shade → oil_reduce → oil_push×passes → oil_carry → oil_deposit → oil_store] →
 *   [습식: wet_commit → substeps × (수채: wet_snapshot → wet_edge_delta → wet_step_water → wet_expand → wet_commit,
 *                                   유화: oil_snapshot → oil_level → oil_dry → wet_commit)] →
 *   composite_dirty(간접) [+ composite_wet(간접)] → (present 렌더 패스) → submit.
 * 배치가 MAX_DABS_PER_BATCH를 넘으면 같은 프레임 안에서 분할 제출한다(submitCount 증가, 습식 스텝은 마지막 조각만).
 *
 * **지속 레이어 계약**: `endStroke`는 습식 층을 문서에 굽지 않는다. 습식 층(수채 안료·유화 물감)은 풀이 들고 있고 표시 시점
 * (`composite_*`)에 문서 → 수채 층 → 유화 층 → 릴리프 조명 순으로 비파괴 합성한다. 다른 매체 획(건식·수채↔유화)이 시작될 때만
 * `flattenWet`(수채: 정착 → bake_wet, 유화: flatten_oil)이 문서에 굽는다(CPU `Surface.beginStroke`/`flattenWet` 미러).
 *
 * endStroke: bake_stroke(간접) → (습식이면) 정착 루프(청크마다 `wet_settle_done` readback, CPU 참조 WET_DRY_STEPS_MAX /
 *   WET_OIL_SETTLE_FRAMES 상한) → composite_all → 헤더 readback → 영수증. 건식은 bake_stroke·composite_all을 한 제출에 담는다.
 *   풀·refs 초과는 StrokeBudgetExceededError.
 *
 * 결정성: 타일 안 refs는 dab 인덱스 오름차순(안정 scatter), 타일은 워크그룹 배타 소유, 습식은 gather 전용(스냅샷 읽기·자기 셀 쓰기)에
 * 고정 순서 리덕션 → 같은 장치·같은 입력이면 같은 픽셀.
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
  /** 예산 검증에 쓸 한도 상한(생략 가능). 실제 장치 한도(device.limits)와 비교해 더 작은 쪽을 쓴다 — 어댑터 한도로 장치 한도를 가릴 수 없다. */
  limits?: Record<string, number>;
  presentCanvas?: HTMLCanvasElement | OffscreenCanvas;
  /** `gpu.getPreferredCanvasFormat()` — presentCanvas가 있으면 필수. */
  presentFormat?: GPUTextureFormat;
}

/** beginStroke에 넘길 수 있는 사전 생성 자산(생략 시 프로그램에서 CPU 참조와 같은 규칙으로 만든다). */
export interface SumiStrokeAssets {
  /** 레벨별 r32 아틀라스(width_L × tile_L, 8종 가로 배치). 길이 = TIP_ATLAS_LEVELS. */
  tipLevels?: readonly Float32Array[];
  /** 주입용 rgba8 종이(PAPER_TEXTURE_SIZE²; 올릴 때 f32로 변환). null = 종이 비활성. */
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
  /** 정착 루프에서 돈 프레임 수(습식 아니면 0). */
  dryFrames: number;
  frames: number;
}

export type SumiRuntimeState = "ready" | "in-stroke" | "device-lost" | "disposed";

/** 정착 루프 청크(프레임 수). 청크마다 `wet_settle_done`을 읽어 서 있으면 멈춘다. */
export const WET_DRY_CHUNK_FRAMES = 16;

/** 습식 층 종류: 수채 계열 "water", 유화 "oil". 건식은 null. */
export type WetLayerKind = "water" | "oil";

const SHADER_MODULES: readonly { label: string; code: string; entries: readonly EntryPointName[] }[] = [
  { label: "sumi-bin-count", code: BIN_COUNT_WGSL, entries: ["binCount"] },
  { label: "sumi-bin-scan", code: BIN_SCAN_WGSL, entries: ["scanBlocks", "scanBlockSums", "scanAdd", "writeIndirect"] },
  { label: "sumi-bin-scatter", code: BIN_SCATTER_WGSL, entries: ["scatter"] },
  { label: "sumi-fine-raster", code: FINE_RASTER_WGSL, entries: ["fineRaster", "smudgeCarry"] },
  { label: "sumi-bake-stroke", code: BAKE_STROKE_WGSL, entries: ["bakeStroke"] },
  {
    label: "sumi-wet-water",
    code: WET_WATER_WGSL,
    entries: ["wetSnapshot", "wetEdgeDelta", "wetStepWater", "wetExpand", "wetCommit", "wetSettleCheck"],
  },
  {
    label: "sumi-wet-oil",
    code: WET_OIL_WGSL,
    entries: ["oilSnapshot", "oilLevel", "oilDry", "oilShade", "oilReduce", "oilPush", "oilCarry", "oilDeposit", "oilStore"],
  },
  {
    label: "sumi-wet-composite",
    code: WET_COMPOSITE_WGSL,
    entries: ["compositeDirty", "compositeAll", "compositeWet", "compositeLinear", "bakeWet", "flattenOil"],
  },
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

/**
 * 종이 필드 → compute 레인의 f32 종이 텍스처 데이터(rgba32float: R 섬유 방향 rad·G 요철·B 흡수율·A 1). 길이 = size² × 4.
 * 8비트 `encodePaperTexture`와 달리 양자화가 없다 — 래스터·유화 그레인이 CPU `samplePaper`와 같은 값을 읽는다.
 */
export function encodePaperTextureF32(field: PaperField): Float32Array {
  const n = field.size * field.size;
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    out[i * 4] = field.direction[i] ?? 0;
    out[i * 4 + 1] = field.bump[i] ?? 0;
    out[i * 4 + 2] = field.absorb[i] ?? 0;
    out[i * 4 + 3] = 1;
  }
  return out;
}

/** 8비트 rgba 종이(주입용)를 f32 종이 텍스처 데이터로 변환한다(R = 방향/255·2π, G·B = /255). */
function paperBytesToF32(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 4) {
    out[i] = ((bytes[i] ?? 0) / 255) * Math.PI * 2;
    out[i + 1] = (bytes[i + 1] ?? 0) / 255;
    out[i + 2] = (bytes[i + 2] ?? 0) / 255;
    out[i + 3] = (bytes[i + 3] ?? 255) / 255;
  }
  return out;
}

/** 프로그램의 습식 층 종류(CPU `Surface.beginStroke`와 같은 규칙). 습식이 아니면 null. */
export function wetLayerKindOf(program: BrushProgram): WetLayerKind | null {
  const model = program.deposition.model;
  if (program.wet === null) return null;
  if (model === "impasto") return "oil";
  if (model === "wet-flow") return "water";
  return null;
}

/** 프로그램·캔버스 설정 → Params 값(프레임 가변 필드는 0). CPU 참조와 같은 활성 규칙. */
export function paramsForProgram(
  program: BrushProgram,
  cfg: { tilesX: number; tilesY: number; width: number; height: number; strokeCapacity: number; wetCapacity: number; seed: number },
): ParamsValues {
  const model = program.deposition.model;
  const wetEnabled = program.wet !== null && (model === "wet-flow" || model === "impasto");
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
    wet_water_layer: 0,
    wet_oil_layer: 0,
    wet_render_km: 0,
    wet_settle: 0,
    stroke_opacity: program.deposition.opacity,
    paper_scale: program.paper.scale > 0 ? program.paper.scale : 1,
    paper_rotation: program.paper.rotationRad,
    paper_size: PAPER_TEXTURE_SIZE,
    smudge_pickup: model === "smudge" ? smudgePickupPerDab(program.deposition.spacing) : 0,
    light_x: IMPASTO_LIGHT[0],
    light_y: IMPASTO_LIGHT[1],
    light_z: IMPASTO_LIGHT[2],
    impasto_gain: IMPASTO_RELIEF_GAIN,
    edgeCurve: curve,
  };
}

/** compute pass 1개의 디스패치 기록기: 가족별 바인드 그룹을 필요할 때만 다시 설정하고 디스패치 수를 센다. */
class DispatchStream {
  count = 0;
  private readonly binder: PassBinder;

  constructor(
    private readonly pass: GPUComputePassEncoder,
    private readonly buffers: SumiBuffers,
    private readonly wetBindings: WetBindingSet,
    private readonly pipelineOf: (entry: EntryPointName) => GPUComputePipeline,
  ) {
    this.binder = new PassBinder(pass);
  }

  private bindBase(entry: EntryPointName): void {
    const g = this.buffers.bindGroups;
    this.binder.set(0, g.group0);
    this.binder.set(1, g.group1);
    // group 2(간접 인자)는 GROUP2_ENTRIES 파이프라인의 레이아웃에만 있다.
    if ((GROUP2_ENTRIES as readonly EntryPointName[]).includes(entry)) this.binder.set(2, g.group2);
  }

  private bindWetFamily(entry: WetEntryName, oilOffset?: number): void {
    const family: WetFamilyName = WET_ENTRY_FAMILY[entry];
    this.binder.bindWet(this.wetBindings.groups(family), oilOffset);
  }

  /** 기본 가족 직접 디스패치. */
  base(entry: EntryPointName, x: number, y = 1): void {
    this.bindBase(entry);
    this.pass.setPipeline(this.pipelineOf(entry));
    this.pass.dispatchWorkgroups(x, y, 1);
    this.count += 1;
  }

  /** 기본 가족 간접 디스패치(`indirect` 버퍼의 오프셋). */
  baseIndirect(entry: EntryPointName, offset: number): void {
    this.bindBase(entry);
    this.pass.setPipeline(this.pipelineOf(entry));
    this.pass.dispatchWorkgroupsIndirect(this.buffers.indirect, offset);
    this.count += 1;
  }

  /** 습식 가족 직접 디스패치. */
  wet(entry: WetEntryName, x = 1, y = 1): void {
    this.bindWetFamily(entry);
    this.pass.setPipeline(this.pipelineOf(entry));
    this.pass.dispatchWorkgroups(x, y, 1);
    this.count += 1;
  }

  /** 습식 가족 간접 디스패치. */
  wetIndirect(entry: WetEntryName, offset: number): void {
    this.bindWetFamily(entry);
    this.pass.setPipeline(this.pipelineOf(entry));
    this.pass.dispatchWorkgroupsIndirect(this.buffers.indirect, offset);
    this.count += 1;
  }

  /** 유화 dab 패스(동적 오프셋 레코드). */
  oil(entry: WetEntryName, x: number, recordOffset: number): void {
    this.bindWetFamily(entry, recordOffset);
    this.pass.setPipeline(this.pipelineOf(entry));
    this.pass.dispatchWorkgroups(x, 1, 1);
    this.count += 1;
  }
}

/** 한 프레임의 유화 dab 순서 처리 계획. */
interface OilPlan {
  dabs: { recordOffset: number; groups: number }[];
  passes: number;
  push: boolean;
}

export class SumiComputeRuntime {
  readonly width: number;
  readonly height: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly features: ReadonlySet<string>;
  private readonly device: GPUDevice;
  private readonly clock: Clock | null;
  private readonly limits: Record<string, number>;
  private readonly buffers: SumiBuffers;
  private readonly wetBindings: WetBindingSet;
  private readonly pipelines: Record<EntryPointName, GPUComputePipeline | null>;
  private readonly timer: GpuTimer;
  private readonly present: { pipeline: PresentPipeline; context: GPUCanvasContext; bindGroup: GPUBindGroup } | null;
  private readonly slotReset = slotResetBytes();
  private state: SumiRuntimeState = "ready";
  private lostInfo: GPUDeviceLostInfo | null = null;
  private program: BrushProgram | null = null;
  private params: ParamsValues | null = null;
  /** 마지막으로 쓴 프로그램의 Params(표시 합성·readback이 쓴다. 획이 끝나도 유지된다). */
  private baseParams: ParamsValues | null = null;
  private wetEnabled = false;
  /** 이번 획의 습식 층 종류(건식이면 null). */
  private wetKind: WetLayerKind | null = null;
  /** 이번 획이 smudge 침착 모델이면 프레임마다 smudge_carry를 낸다. */
  private smudgeEnabled = false;
  /** 임파스토 높이가 한 번이라도 쌓였는가(CPU `Surface.hasHeight` 미러). 표면(런타임) 수명 동안 유지된다. */
  private hasHeight = false;
  /** 문서에 아직 굽지 않은 습식 층(CPU `Surface.waterLayer`·`oilLayer` 미러). */
  private waterLayer = false;
  private oilLayer = false;
  /** 마지막 습식 획의 KM 혼색 여부(`wet.render.km` 미러). */
  private renderKm = false;
  /** 습식 층을 정착·평탄화할 때 쓰는 마지막 습식 획의 프로그램·Params(CPU `layerParams` 미러). */
  private layerProgram: BrushProgram | null = null;
  private layerParams: ParamsValues | null = null;
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
  private paperWetKeyLoaded: string | null = null;
  /** 지연 생성 버퍼(처음 필요할 때 만든다). */
  private oilScratch: GPUBuffer | null = null;
  private displayLinear: GPUBuffer | null = null;
  /** 전체 submit 수(통계). */
  submits = 0;

  private constructor(
    device: GPUDevice,
    cfg: SumiComputeConfig,
    limits: Record<string, number>,
    buffers: SumiBuffers,
    wetBindings: WetBindingSet,
    pipelines: Record<EntryPointName, GPUComputePipeline | null>,
    present: { pipeline: PresentPipeline; context: GPUCanvasContext; bindGroup: GPUBindGroup } | null,
  ) {
    this.device = device;
    this.clock = cfg.clock;
    this.limits = limits;
    this.width = cfg.width;
    this.height = cfg.height;
    this.tilesX = buffers.budget.tilesX;
    this.tilesY = buffers.budget.tilesY;
    this.features = cfg.features;
    this.buffers = buffers;
    this.wetBindings = wetBindings;
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
    // 예산은 어댑터 한도가 아니라 장치가 실제로 받은 한도(device.limits)로 검증한다. 호출자가 한도를 주면 더 작은 쪽을 쓴다.
    const limits = effectiveDeviceLimits(device, cfg.limits);
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
      const wetBindings = new WetBindingSet(device, wetResourcesOf(buffers, null, null));
      const pipelines = {} as Record<EntryPointName, GPUComputePipeline | null>;
      for (const key of Object.keys(ENTRY_POINTS) as EntryPointName[]) pipelines[key] = null;
      const layoutOf = (entry: EntryPointName): GPUPipelineLayout => {
        const family = (WET_ENTRY_FAMILY as Partial<Record<EntryPointName, WetFamilyName>>)[entry];
        if (family) return wetBindings.pipelineLayout(family);
        // group 2(간접 인자)를 쓰는 기본 파이프라인만 레이아웃에 넣는다(INDIRECT/쓰기 storage usage scope 충돌 회피).
        return (GROUP2_ENTRIES as readonly EntryPointName[]).includes(entry) ? buffers.layouts.pipelineWithGroup2 : buffers.layouts.pipeline;
      };
      const created = await Promise.all(
        COMPUTE_ENTRY_ORDER.map((entry) => {
          const module = modules.get(entry);
          if (!module) throw new InvalidStateError(`no shader module for ${entry}`);
          return device.createComputePipelineAsync({
            label: `sumi-${ENTRY_POINTS[entry]}`,
            layout: layoutOf(entry),
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
      const runtime = new SumiComputeRuntime(device, cfg, limits, buffers, wetBindings, pipelines, present);
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

  private newStream(pass: GPUComputePassEncoder): DispatchStream {
    return new DispatchStream(pass, this.buffers, this.wetBindings, (e) => this.pipeline(e));
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

  /** 프로그램 없는 초기 상태에서 쓰는 Params(표시 합성 전용). */
  private displayParamsValues(): ParamsValues {
    return this.frameParams(this.baseParams ?? paramsForProgramless(this), {});
  }

  /** 런타임이 지속하는 플래그(높이·습식 층·KM)를 덮어쓴 Params. */
  private frameParams(base: ParamsValues, extra: Partial<Record<ParamScalarName, number>>): ParamsValues {
    return {
      ...base,
      has_height: this.hasHeight ? 1 : 0,
      wet_water_layer: this.waterLayer ? 1 : 0,
      wet_oil_layer: this.oilLayer ? 1 : 0,
      wet_render_km: this.renderKm ? 1 : 0,
      ...extra,
    };
  }

  /** 초기 present(빈 문서) — composite_all 1회. */
  private encodeInitialPresent(): void {
    this.writeParams(this.displayParamsValues());
    const encoder = this.device.createCommandEncoder({ label: "sumi-init" });
    const pass = encoder.beginComputePass({ label: "sumi-init-pass" });
    const s = this.newStream(pass);
    s.wet("compositeAll", this.tilesX, this.tilesY);
    pass.end();
    this.encodePresentPass(encoder);
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
  }

  private writeParams(values: ParamsValues): void {
    this.device.queue.writeBuffer(this.buffers.params, 0, encodeParams(values));
  }

  private encodePresentPass(encoder: GPUCommandEncoder): void {
    if (!this.present) return;
    encodePresent(encoder, this.present.pipeline, this.present.bindGroup, this.present.context.getCurrentTexture().createView());
  }

  /** 습식 가족 바인드 그룹을 현재 자원(지연 생성 버퍼 포함)으로 다시 만든다. */
  private rebuildWetBindGroups(): void {
    this.wetBindings.rebuildBindGroups(wetResourcesOf(this.buffers, this.oilScratch, this.displayLinear));
  }

  /** 유화 dab 창 스크래치를 처음 필요할 때 만든다(한도 초과는 StrokeBudgetExceededError). */
  private ensureOilScratch(): GPUBuffer {
    if (this.oilScratch) return this.oilScratch;
    assertLazyBufferFits(this.buffers.budget, "oilScratch", this.limits);
    this.oilScratch = this.device.createBuffer({
      label: "sumi-oil-scratch",
      size: this.buffers.budget.lazyBytes.oilScratch,
      usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC,
    });
    this.rebuildWetBindGroups();
    return this.oilScratch;
  }

  /** readbackLinear용 선형 표시 버퍼를 처음 필요할 때 만든다. */
  private ensureDisplayLinear(): GPUBuffer {
    if (this.displayLinear) return this.displayLinear;
    assertLazyBufferFits(this.buffers.budget, "displayLinear", this.limits);
    this.displayLinear = this.device.createBuffer({
      label: "sumi-display-linear",
      size: this.buffers.budget.lazyBytes.displayLinear,
      usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC,
    });
    this.rebuildWetBindGroups();
    return this.displayLinear;
  }

  /**
   * 획 시작: 다른 종류의 습식 층이 남아 있으면 먼저 문서에 굽고(`flattenWet`), 프로그램 자산(팁 아틀라스·종이·습식 상수)을 올리고,
   * Params 고정 필드·획 카운터를 초기화한다. 자산은 키가 같으면 다시 올리지 않는다.
   */
  beginStroke(program: BrushProgram, seed: number, assets: SumiStrokeAssets = {}): void {
    this.assertUsable();
    if (this.state === "in-stroke") throw new InvalidStateError("이전 획이 endStroke되지 않았다");
    const budget = this.buffers.budget;
    const params = paramsForProgram(program, {
      tilesX: this.tilesX,
      tilesY: this.tilesY,
      width: this.width,
      height: this.height,
      strokeCapacity: budget.strokeCapacityTiles,
      wetCapacity: budget.wetCapacityTiles,
      seed,
    });
    const wetEnabled = params.wet_enabled === 1;
    const kind = wetEnabled ? wetLayerKindOf(program) : null;
    // 쌓는 순서 보존: 습식 층이 있는데 이번 획이 같은 종류의 습식 획이 아니면 먼저 굽는다(CPU Surface.beginStroke).
    if ((this.waterLayer && kind !== "water") || (this.oilLayer && kind !== "oil")) this.flattenWet();
    this.program = program;
    this.params = params;
    this.baseParams = params;
    this.wetEnabled = wetEnabled;
    this.wetKind = kind;
    this.smudgeEnabled = program.deposition.model === "smudge";
    // 새 획: smudge 운반 색 상태(carry·loaded)를 비운다. 큐 순서상 이 획의 첫 제출 앞에서 실행된다.
    if (this.smudgeEnabled) this.device.queue.writeBuffer(this.buffers.bins, BINS_OFFSETS.smudgeState, new Float32Array(SMUDGE_STATE_BYTES / 4));
    this.substeps = program.wet ? wetSubsteps(program.wet) : 1;
    this.uploadTipAtlas(program, assets.tipLevels);
    this.uploadPaper(program, assets.paper);
    if (wetEnabled && program.wet) {
      this.uploadWetKernel(program);
      this.uploadPaperWet(program);
      // 표시용(비파괴) 합성 파라미터는 마지막 습식 획에서 래치한다.
      this.renderKm = program.colorDynamics.kmMixing;
      this.layerProgram = program;
      this.layerParams = params;
      if (kind === "oil") {
        const scratch = this.ensureOilScratch();
        // 새 획: 붓이 들고 있는 색(carry·loaded)을 비운다(CPU `newOilCarry`).
        this.device.queue.writeBuffer(scratch, 0, new Float32Array(OIL_SCRATCH_HEADER_FLOATS));
        this.oilLayer = true;
      } else {
        this.waterLayer = true;
      }
    }
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
    const size = PAPER_TEXTURE_SIZE;
    if (override && override.length !== size * size * 4) throw new RangeError(`paper texture must be ${size}²×4 bytes`);
    // 텍스처는 f32(rgba32float)다. 주입된 8비트 종이는 변환해 올린다.
    const data = override ? paperBytesToF32(override) : encodePaperTextureF32(paperFor(program.paper));
    this.device.queue.writeTexture(
      { texture: this.buffers.paperTex },
      data,
      { bytesPerRow: size * 16, rowsPerImage: size },
      { width: size, height: size },
    );
    this.paperKeyLoaded = key;
  }

  /** 습식 서브스텝 상수 uniform(`wet_kernel`)을 올린다. */
  private uploadWetKernel(program: BrushProgram): void {
    const values = wetKernelValues(program);
    if (!values) return;
    this.device.queue.writeBuffer(this.buffers.wetKernel, 0, encodeWetKernel(values));
  }

  /**
   * f32 종이 원본(`paper_wet`)을 올린다. 8비트 `paperTex`로는 섬유 방향(2π/255)·요철 양자화가 κ 오차로 번지므로 습식은
   * CPU 필드(`paperFor`)의 f32 원본을 그대로 쓴다. 종이가 없으면 올리지 않는다(셰이더가 균일 종이를 쓴다).
   */
  private uploadPaperWet(program: BrushProgram): void {
    if (!program.paper.enabled) return;
    const key = `${program.paper.seed}|${program.paper.roughness}|${program.paper.absorbency}`;
    if (this.paperWetKeyLoaded === key) return;
    this.device.queue.writeBuffer(this.buffers.paperWet, 0, encodePaperWet(paperFor(program.paper)));
    this.paperWetKeyLoaded = key;
  }

  /**
   * 테스트·프로브 전용: 임의의 f32 종이 필드를 `paper_wet`에 올린다(습식 장면 패리티가 CPU 장면의 종이를 그대로 쓰게 한다).
   * 프로그램의 종이 키 캐시를 무효화하므로 다음 `beginStroke`가 프로그램 종이를 다시 올린다. 필드는 256² 이어야 한다.
   */
  loadWetPaper(field: PaperField): void {
    this.assertUsable();
    this.device.queue.writeBuffer(this.buffers.paperWet, 0, encodePaperWet(field));
    this.paperWetKeyLoaded = null;
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
    this.writeParams(this.frameParams(params, { dab_count: dabCount, frame_index: this.frameIndex }));
    if (dabCount > 0) {
      const bytes = dabCount * DAB_FLOATS * 4;
      if (bytes > DABS_BYTES) throw new StrokeBudgetExceededError(dabCount, MAX_DABS_PER_BATCH, { stage: "dab-upload" });
      q.writeBuffer(this.buffers.dabs, 0, dabsView.buffer, dabsView.byteOffset, bytes);
    }
    const tileCount = this.tilesX * this.tilesY;
    if (binner) this.uploadExternalBins(binner(dabsView, dabCount), tileCount);
    const oil = params.impasto_enabled === 1 ? this.oilPlan(dabsView, dabCount) : null;
    const encoder = this.device.createCommandEncoder({ label: `sumi-frame-${this.frameIndex}` });
    // 외부 비닝은 counts를 통째로 덮어쓰므로 clear가 필요 없다(GPU 비닝은 count_main이 원자 증가하므로 매 프레임 0으로 비운다).
    if (!binner) encoder.clearBuffer(this.buffers.bins, BINS_OFFSETS.counts, MAX_TILES * 4);
    encoder.clearBuffer(this.buffers.table, 0, TABLE_OFFSETS.frameClearBytes);
    const pass = encoder.beginComputePass({ label: "sumi-frame-pass", timestampWrites: this.timer.passTimestamps("both") });
    const s = this.newStream(pass);
    if (!binner) {
      s.base("binCount", workgroupsFor(dabCount, WORKGROUP_1D));
      s.base("scanBlocks", workgroupsFor(tileCount, SCAN_BLOCK));
      s.base("scanBlockSums", 1);
    }
    s.base("scanAdd", workgroupsFor(tileCount, WORKGROUP_1D));
    s.base("writeIndirect", 1);
    if (!binner) s.baseIndirect("scatter", this.buffers.indirectOffset);
    if (this.smudgeEnabled && dabCount > 0) s.base("smudgeCarry", 1);
    s.baseIndirect("fineRaster", this.buffers.indirectOffset);
    // 유화: dab 인덱스 순서로 창 처리(CPU applyImpastoDabs). 디스패치 사이 storage 동기화가 dab 순서 의미를 보장한다.
    if (oil) this.encodeOilDabs(s, oil);
    if (this.wetEnabled && last) this.encodeWetFrame(s);
    // 표시 합성: 이번 프레임에 dab가 닿은 타일 + (습식이면) 지금까지 할당된 습식 타일(물이 번지는 비 dirty 타일의 라이브 표시).
    s.wetIndirect("compositeDirty", this.buffers.indirectOffset);
    if (this.wetEnabled) s.wetIndirect("compositeWet", this.buffers.wetIndirectOffset);
    pass.end();
    this.timer.endFrame(encoder);
    this.encodePresentPass(encoder);
    q.submit([encoder.finish()]);
    this.submits += 1;
    this.timer.afterSubmit();
    return s.count;
  }

  /** 유화 dab 패스 계획 + 레코드 업로드(아래 `oilPlan`이 만든 레코드를 기록한다). */
  private encodeOilDabs(s: DispatchStream, plan: OilPlan): void {
    for (const d of plan.dabs) {
      s.oil("oilShade", d.groups, d.recordOffset);
      s.oil("oilReduce", 1, d.recordOffset);
      if (plan.push) {
        for (let j = 0; j < plan.passes; j += 1) {
          s.oil("oilPush", d.groups, d.recordOffset + (j % OIL_RECORDS_PER_DAB) * OIL_RECORD_BYTES);
        }
      }
      s.oil("oilCarry", 1, d.recordOffset);
      s.oil("oilDeposit", d.groups, d.recordOffset);
      s.oil("oilStore", d.groups, d.recordOffset);
    }
  }

  /**
   * 이번 청크의 유화 dab마다 창·방향 레코드를 만들어 동적 uniform 버퍼에 올린다(CPU `applyImpastoDabs`와 같은 f64 산술).
   * 건너뛰는 dab: 타일 범위가 없거나 MAX_TILES_PER_DAB 초과(래스터와 같은 규칙), 창이 비는 경우. 창이 스크래치 용량을 넘으면
   * fail-visible. dab당 레코드 2개(밀기 핑퐁 읽기 벌 0/1)를 올린다.
   */
  private oilPlan(dabsView: Float32Array, dabCount: number): OilPlan | null {
    if (dabCount === 0) return null;
    const wp = this.program?.wet ?? null;
    if (!wp) return null;
    const u32 = new Uint32Array(dabsView.buffer, dabsView.byteOffset, dabsView.length);
    const passes = oilPassesOf(wp);
    const push = oilPushOf(wp) > 0;
    const curBuf = push ? passes % OIL_RECORDS_PER_DAB : 0;
    const capacity = this.buffers.budget.oilWindowCells;
    const records: ArrayBuffer[] = [];
    const dabs: OilPlan["dabs"] = [];
    for (let i = 0; i < dabCount; i += 1) {
      const flags = u32[i * DAB_FLOATS + DAB_FIELD.flags] ?? 0;
      if ((flags & DAB_FLAG.impasto) === 0) continue;
      const dab = unpackDab(dabsView, i);
      const bounds = dabTileBounds(dab, this.tilesX, this.tilesY);
      if (!bounds) continue;
      if ((bounds.x1 - bounds.x0 + 1) * (bounds.y1 - bounds.y0 + 1) > MAX_TILES_PER_DAB_DEFAULT) continue;
      const extent = dabExtentPx(dab);
      const x0 = Math.max(0, Math.floor(dab.x - extent));
      const x1 = Math.min(this.width - 1, Math.ceil(dab.x + extent));
      const y0 = Math.max(0, Math.floor(dab.y - extent));
      const y1 = Math.min(this.height - 1, Math.ceil(dab.y + extent));
      if (x1 < x0 || y1 < y0) continue;
      // 전단 여유: 밀린 물감이 도착하는 칸을 위해 창을 passes칸 넓힌다.
      const wx0 = Math.max(0, x0 - passes);
      const wy0 = Math.max(0, y0 - passes);
      const wx1 = Math.min(this.width - 1, x1 + passes);
      const wy1 = Math.min(this.height - 1, y1 + passes);
      const cells = (wx1 - wx0 + 1) * (wy1 - wy0 + 1);
      if (cells > capacity) {
        throw new StrokeBudgetExceededError(cells, capacity, { stage: "oil-window", note: "유화 dab 창이 스크래치 용량을 넘는다" });
      }
      for (let src = 0; src < OIL_RECORDS_PER_DAB; src += 1) {
        const bytes = new ArrayBuffer(OIL_RECORD_BYTES);
        const view = new DataView(bytes);
        const values: Record<(typeof OIL_DAB_MEMBERS)[number][0], number> = {
          dab_index: i,
          win_x0: wx0,
          win_y0: wy0,
          win_x1: wx1,
          win_y1: wy1,
          in_x0: x0,
          in_y0: y0,
          in_x1: x1,
          in_y1: y1,
          cell_count: cells,
          src_buf: src,
          cur_buf: curBuf,
          cos_a: Math.cos(dab.angle),
          sin_a: Math.sin(dab.angle),
        };
        OIL_DAB_MEMBERS.forEach(([name, type], k) => {
          const v = values[name];
          if (type === "f32") view.setFloat32(k * 4, v, true);
          else if (type === "i32") view.setInt32(k * 4, v, true);
          else view.setUint32(k * 4, v >>> 0, true);
        });
        records.push(bytes);
      }
      dabs.push({ recordOffset: (records.length - OIL_RECORDS_PER_DAB) * OIL_RECORD_BYTES, groups: workgroupsFor(cells, OIL_WORKGROUP) });
    }
    if (dabs.length === 0) return null;
    if (dabs.length > MAX_OIL_DABS_PER_FRAME) {
      throw new StrokeBudgetExceededError(dabs.length, MAX_OIL_DABS_PER_FRAME, { stage: "oil-dabs" });
    }
    const all = new Uint8Array(records.length * OIL_RECORD_BYTES);
    records.forEach((r, k) => all.set(new Uint8Array(r), k * OIL_RECORD_BYTES));
    this.device.queue.writeBuffer(this.buffers.oilRecords, 0, all);
    return { dabs, passes, push };
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

  /**
   * 한 프레임의 습식 시뮬레이션: wet_commit(scan_add·유화 침착이 세운 활성 표식으로 활성 목록 확정) →
   * substeps × 서브스텝. 수채 계열 서브스텝 = wet_snapshot → wet_edge_delta → wet_step_water → wet_expand → wet_commit,
   * 유화 서브스텝 = oil_snapshot → oil_level → oil_dry → wet_commit(CPU `stepWet`).
   */
  private encodeWetFrame(s: DispatchStream, kind: WetLayerKind | null = this.wetKind, substeps = this.substeps): void {
    s.wet("wetCommit", 1);
    for (let sub = 0; sub < substeps; sub += 1) this.encodeSubstep(s, kind);
  }

  private encodeSubstep(s: DispatchStream, kind: WetLayerKind | null): void {
    const live = this.buffers.wetLiveIndirectOffset;
    if (kind === "oil") {
      s.wetIndirect("oilSnapshot", live);
      s.wetIndirect("oilLevel", live);
      s.wetIndirect("oilDry", this.buffers.wetIndirectOffset);
    } else {
      s.wetIndirect("wetSnapshot", live);
      s.wetIndirect("wetEdgeDelta", live);
      s.wetIndirect("wetStepWater", live);
      s.wetIndirect("wetExpand", live);
    }
    s.wet("wetCommit", 1);
  }

  /** 정착 프레임 `frames`개(프레임 = substeps × 서브스텝 + 프레임 끝 검사). */
  private encodeSettleFrames(s: DispatchStream, frames: number, kind: WetLayerKind | null, substeps: number): void {
    for (let f = 0; f < frames; f += 1) {
      for (let sub = 0; sub < substeps; sub += 1) this.encodeSubstep(s, kind);
      s.wet("wetSettleCheck", 1);
    }
  }

  /** 정착 루프: 청크마다 `wet_settle_done`을 읽어 서 있으면 멈춘다(CPU 참조 WET_DRY_STEPS_MAX / WET_OIL_SETTLE_FRAMES 상한). */
  private async settleLoop(): Promise<number> {
    const kind = this.wetKind;
    const limit = kind === "oil" ? WET_OIL_SETTLE_FRAMES : WET_DRY_STEPS_MAX;
    const { params } = this.assertStroke();
    // 정착 모드: 유화 건조 등이 `wet_settle_done`을 따른다. 새 정착 루프이므로 0으로 되돌린다(큐 순서상 첫 청크 앞).
    this.writeParams(this.frameParams(params, { wet_settle: 1, dab_count: 0 }));
    this.device.queue.writeBuffer(this.buffers.table, TABLE_OFFSETS.wetSettleDone, new Uint32Array([0]));
    let frames = 0;
    while (frames < limit) {
      const chunk = Math.min(WET_DRY_CHUNK_FRAMES, limit - frames);
      const encoder = this.device.createCommandEncoder({ label: "sumi-settle" });
      const pass = encoder.beginComputePass({ label: "sumi-settle-pass" });
      const s = this.newStream(pass);
      if (frames === 0) s.wet("wetCommit", 1);
      this.encodeSettleFrames(s, chunk, kind, this.substeps);
      pass.end();
      encodeTableHeaderReadback(encoder, this.buffers.table, this.buffers.tableStaging);
      this.device.queue.submit([encoder.finish()]);
      this.submits += 1;
      this.strokeSubmits += 1;
      frames += chunk;
      const header = await mapTableHeader(this.buffers.tableStaging);
      this.assertUsable();
      if (header.wetSettleDone !== 0) break;
    }
    return frames;
  }

  /**
   * 습식 층을 문서에 굽는다(CPU `Surface.flattenWet`): 수채는 정착(최대 WET_DRY_STEPS_MAX 프레임, 마지막 습식 획의 상수로) 뒤 안료를 굽고,
   * 유화는 색을 굽고 부피를 마른 릴리프로 굳힌다. 다른 종류 획이 시작될 때 `beginStroke`가 자동으로 부르며 앱이 직접 불러도 된다.
   * 큐에 쌓기만 하고 기다리지 않는다(활성 타일이 0이 된 뒤 프레임은 커널이 건너뛴다).
   */
  flattenWet(): void {
    this.assertUsable();
    if (this.state === "in-stroke") throw new InvalidStateError("획 도중에는 flattenWet을 부를 수 없다");
    if (!this.waterLayer && !this.oilLayer) return;
    const layerProgram = this.layerProgram;
    const layerParams = this.layerParams;
    if (!layerProgram || !layerParams) {
      throw new InvalidStateError("습식 층이 있는데 마지막 습식 획 정보가 없다");
    }
    // 이 제출은 마지막 습식 획의 상수·종이로 돈다: `wet_kernel`·`paper_wet`은 습식 획의 beginStroke에서만 바뀌고 그때 layerProgram도
    // 함께 바뀌므로 지금 올라가 있는 값이 곧 layerProgram의 값이다(다음 획이 올리는 것은 이 제출 뒤 큐 순서로 실행된다).
    this.writeParams(this.frameParams(layerParams, { wet_settle: 1, dab_count: 0 }));
    this.device.queue.writeBuffer(this.buffers.table, TABLE_OFFSETS.wetSettleDone, new Uint32Array([0]));
    const encoder = this.device.createCommandEncoder({ label: "sumi-flatten-wet" });
    const pass = encoder.beginComputePass({ label: "sumi-flatten-wet-pass" });
    const s = this.newStream(pass);
    if (this.waterLayer) {
      if (layerProgram.wet && layerProgram.wet.medium !== "oil") {
        s.wet("wetCommit", 1);
        this.encodeSettleFrames(s, WET_DRY_STEPS_MAX, "water", wetSubsteps(layerProgram.wet));
      }
      s.wetIndirect("bakeWet", this.buffers.wetIndirectOffset);
    }
    if (this.oilLayer) s.wetIndirect("flattenOil", this.buffers.wetIndirectOffset);
    s.wet("compositeAll", this.tilesX, this.tilesY);
    pass.end();
    this.encodePresentPass(encoder);
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
    this.waterLayer = false;
    this.oilLayer = false;
  }

  /**
   * 획 종료: bake_stroke → (습식이면) 정착 루프 → composite_all(표시 합성) → 헤더 readback → 영수증.
   * 습식 층은 문서에 굽지 않는다(지속 레이어). 예산 초과는 상태를 리셋한 뒤 던진다.
   */
  async endStroke(): Promise<SumiStrokeReceipt> {
    const { params } = this.assertStroke();
    const wet = this.wetEnabled;
    if (wet) {
      // 습식: 정착 루프가 뒤따르므로 획 레이어 굽기를 먼저 별도 제출한다(wet-flow는 wetOnly라 획 레이어가 비어 있다).
      const encoder = this.device.createCommandEncoder({ label: "sumi-bake-stroke" });
      const pass = encoder.beginComputePass({ label: "sumi-bake-stroke-pass" });
      const s = this.newStream(pass);
      s.baseIndirect("bakeStroke", this.buffers.strokeIndirectOffset);
      pass.end();
      encoder.clearBuffer(this.buffers.strokePool);
      this.device.queue.submit([encoder.finish()]);
      this.submits += 1;
      this.strokeSubmits += 1;
    }
    let dryFrames = 0;
    if (wet) dryFrames = await this.settleLoop();
    this.writeParams(this.frameParams(params, { wet_settle: 0, dab_count: 0 }));
    const encoder = this.device.createCommandEncoder({ label: "sumi-end-stroke" });
    const pass = encoder.beginComputePass({ label: "sumi-end-stroke-pass" });
    const s = this.newStream(pass);
    if (!wet) s.baseIndirect("bakeStroke", this.buffers.strokeIndirectOffset);
    s.wet("compositeAll", this.tilesX, this.tilesY);
    pass.end();
    if (!wet) encoder.clearBuffer(this.buffers.strokePool);
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
    // wet_overflow는 습식 영역에 있지만 풀 상태가 아니라 획 단위 오류 계수다: 리셋하지 않으면 한 번의 초과 뒤 모든 획이
    // (건식 획까지) StrokeBudgetExceededError(wet-pool)로 영구히 실패한다. 영수증 readback 뒤(큐 순서)에 0으로 되돌린다.
    this.device.queue.writeBuffer(this.buffers.table, TABLE_OFFSETS.wetOverflow, new Uint32Array([0]));
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
   * 표시 합성 결과(선형 premultiplied f32): 문서 → 수채 층 → 유화 층 → 릴리프 조명을 GPU 합성 패스(`composite_linear`)로 계산해 읽는다
   * (CPU `Surface.toLinear()`와 같은 값). 습식 층이 없고 높이도 없으면 문서와 같다.
   */
  async readbackLinear(): Promise<Float32Array> {
    this.assertUsable();
    const display = this.ensureDisplayLinear();
    this.writeParams(this.displayParamsValues());
    const encoder = this.device.createCommandEncoder({ label: "sumi-readback-linear" });
    const pass = encoder.beginComputePass({ label: "sumi-readback-linear-pass" });
    const s = this.newStream(pass);
    s.wet("compositeLinear", this.tilesX, this.tilesY);
    pass.end();
    encodeDocumentReadback(encoder, display, this.buffers.staging, this.buffers.budget.bytes.document);
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
    return mapToFloat32(this.buffers.staging, this.width * this.height * 4);
  }

  /** 문서 버퍼 그대로(조명·습식 층 없음). 테스트·프로브용. */
  async readbackDocumentRaw(): Promise<Float32Array> {
    this.assertUsable();
    const encoder = this.device.createCommandEncoder({ label: "sumi-readback-document" });
    encodeDocumentReadback(encoder, this.buffers.document, this.buffers.staging, this.buffers.budget.bytes.document);
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
    return mapToFloat32(this.buffers.staging, this.width * this.height * 4);
  }

  /**
   * 습식 풀 height 채널을 문서 크기 배열로 읽는다(CPU `Surface.heightMap` 미러). 헤더(커서) → 슬롯 표 → 코어 풀의 사용 슬롯 구간 순으로
   * 세 번 복사·map한다(스테이징 버퍼 하나를 순차 재사용). 테스트·프로브 전용 경로다.
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
    const poolEncoder = this.device.createCommandEncoder({ label: "sumi-readback-wet-pool" });
    encodeBufferReadback(poolEncoder, this.buffers.wetPool, 0, this.buffers.staging, poolFloats * 4);
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

  // ---- 프로브·테스트 전용: 습식 상태 단일 서브스텝 패리티(명세 §9.2) ----

  /**
   * 습식 상태를 올린다(`beginStroke` 뒤, dab 없이). 타일마다 슬롯을 순서대로 배정하고 활성 표식을 세운다.
   * `core`는 12채널, `ext`는 23채널(각 256셀)이고 길이가 맞아야 한다. 같은 슬롯 번호로 코어·확장 풀에 기록한다.
   */
  loadWetState(tiles: readonly { tile: number; core: Float32Array; ext: Float32Array; live: boolean }[]): void {
    this.assertStroke();
    const budget = this.buffers.budget;
    if (tiles.length > budget.wetCapacityTiles) {
      throw new StrokeBudgetExceededError(tiles.length, budget.wetCapacityTiles, { stage: "wet-pool" });
    }
    const q = this.device.queue;
    const slots = new Uint32Array(budget.tileCount).fill(0xffff_ffff);
    const live = new Uint32Array(budget.tileCount);
    const list = new Uint32Array(Math.max(1, tiles.length));
    tiles.forEach((t, i) => {
      if (t.core.length !== WET_FLOATS_PER_TILE || t.ext.length !== WET_EXT_FLOATS_PER_TILE) {
        throw new RangeError(`wet state tile ${t.tile}: core ${t.core.length}/ext ${t.ext.length} floats`);
      }
      slots[t.tile] = i;
      live[t.tile] = t.live ? 1 : 0;
      list[i] = t.tile;
      q.writeBuffer(this.buffers.wetPool, i * WET_FLOATS_PER_TILE * 4, t.core);
      q.writeBuffer(this.buffers.wetExt, i * WET_EXT_FLOATS_PER_TILE * 4, t.ext);
    });
    q.writeBuffer(this.buffers.table, TABLE_OFFSETS.wetSlots, slots);
    q.writeBuffer(this.buffers.table, TABLE_OFFSETS.wetLive, live);
    q.writeBuffer(this.buffers.table, TABLE_OFFSETS.wetLiveNext, live);
    q.writeBuffer(this.buffers.table, TABLE_OFFSETS.wetActiveTiles, list);
    q.writeBuffer(this.buffers.table, TABLE_OFFSETS.wetCursor, new Uint32Array([tiles.length, tiles.length]));
  }

  /** 습식 프레임 `frames`개(프레임 = wet_commit + substeps × 서브스텝)를 dab 없이 전진한다. 테스트·프로브 전용. */
  stepWetFrames(frames: number): void {
    const { params } = this.assertStroke();
    this.writeParams(this.frameParams(params, { dab_count: 0 }));
    const encoder = this.device.createCommandEncoder({ label: "sumi-step-wet" });
    const pass = encoder.beginComputePass({ label: "sumi-step-wet-pass" });
    const s = this.newStream(pass);
    for (let f = 0; f < frames; f += 1) this.encodeWetFrame(s);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.submits += 1;
  }

  /** 습식 상태를 읽는다(슬롯 순서 = 올린 순서). 테스트·프로브 전용. */
  async readbackWetState(): Promise<{ tiles: { tile: number; core: Float32Array; ext: Float32Array; live: boolean }[]; header: TableHeaderReadback }> {
    this.assertUsable();
    const header = await this.readbackTableHeader();
    const used = Math.min(header.wetCursor, this.buffers.budget.wetCapacityTiles);
    const tiles = this.tilesX * this.tilesY;
    const read = async (source: GPUBuffer, offset: number, floats: number): Promise<Float32Array> => {
      const e = this.device.createCommandEncoder({ label: "sumi-readback-wet-state" });
      encodeBufferReadback(e, source, offset, this.buffers.staging, floats * 4);
      this.device.queue.submit([e.finish()]);
      this.submits += 1;
      return mapToFloat32(this.buffers.staging, floats);
    };
    const readU32 = async (offset: number, count: number): Promise<Uint32Array> => {
      const e = this.device.createCommandEncoder({ label: "sumi-readback-wet-table" });
      encodeBufferReadback(e, this.buffers.table, offset, this.buffers.staging, count * 4);
      this.device.queue.submit([e.finish()]);
      this.submits += 1;
      return mapToUint32(this.buffers.staging, count);
    };
    const slots = await readU32(TABLE_OFFSETS.wetSlots, tiles);
    const live = await readU32(TABLE_OFFSETS.wetLive, tiles);
    const core = used > 0 ? await read(this.buffers.wetPool, 0, used * WET_FLOATS_PER_TILE) : new Float32Array(0);
    const ext = used > 0 ? await read(this.buffers.wetExt, 0, used * WET_EXT_FLOATS_PER_TILE) : new Float32Array(0);
    const out: { tile: number; core: Float32Array; ext: Float32Array; live: boolean }[] = [];
    for (let t = 0; t < tiles; t += 1) {
      const slot = slots[t] ?? 0xffff_ffff;
      if (slot >= used) continue;
      out.push({
        tile: t,
        core: core.slice(slot * WET_FLOATS_PER_TILE, (slot + 1) * WET_FLOATS_PER_TILE),
        ext: ext.slice(slot * WET_EXT_FLOATS_PER_TILE, (slot + 1) * WET_EXT_FLOATS_PER_TILE),
        live: (live[t] ?? 0) !== 0,
      });
    }
    return { tiles: out, header };
  }

  dispose(): void {
    if (this.state === "disposed") return;
    this.state = "disposed";
    this.timer.dispose();
    this.oilScratch?.destroy();
    this.displayLinear?.destroy();
    this.buffers.destroy();
  }
}

/** 습식 가족 바인딩 리소스(지연 생성 버퍼가 아직 없으면 자리 채움 버퍼). */
function wetResourcesOf(buffers: SumiBuffers, oilScratch: GPUBuffer | null, displayLinear: GPUBuffer | null): WetResources {
  const buf = (b: GPUBuffer): GPUBindingResource => ({ buffer: b });
  const resources: WetResources = {
    params: buf(buffers.params),
    dabs: buf(buffers.dabs),
    table: buf(buffers.table),
    strokePool: buf(buffers.strokePool),
    wetPool: buf(buffers.wetPool),
    document: buf(buffers.document),
    tipAtlas: buffers.tipAtlas.createView({ label: "sumi-tip-atlas-view-wet" }),
    paperTex: buffers.paperTex.createView({ label: "sumi-paper-view-wet" }),
    linSampler: buffers.sampler,
    presentTex: buffers.presentTex.createView({ label: "sumi-present-view-wet" }),
    indirect: buf(buffers.indirect),
    oilDab: { buffer: buffers.oilRecords, offset: 0, size: OIL_RECORD_BYTES },
    wetExt: buf(buffers.wetExt),
    wetSnap: buf(buffers.wetSnap),
    paperWet: buf(buffers.paperWet),
    wetKernel: buf(buffers.wetKernel),
    oilScratch: buf(oilScratch ?? buffers.wetPlaceholder),
    displayLinear: buf(displayLinear ?? buffers.wetPlaceholder),
  };
  // 바인딩 표에 있는 모든 이름이 채워졌는지 확인(표가 늘어나면 여기서 드러난다).
  for (const name of Object.keys(WET_BINDINGS)) {
    if (!(name in resources)) throw new InvalidStateError(`습식 바인딩 리소스가 없다: ${name}`);
  }
  return resources;
}

/** 프로그램 없는 초기 상태의 Params(composite_all 초기화·표시 합성 전용). */
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
    wet_water_layer: 0,
    wet_oil_layer: 0,
    wet_render_km: 0,
    wet_settle: 0,
    stroke_opacity: 1,
    paper_scale: 1,
    paper_rotation: 0,
    paper_size: PAPER_TEXTURE_SIZE,
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
