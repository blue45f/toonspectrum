import { encodeLabImage } from "../core/color";
import { InvalidStateError } from "../core/errors";
import { StrokePipeline } from "../dynamics/stroke-pipeline";
import { buildMipChain, TIP_KINDS_ORDERED } from "../texture/mip-chain";
import { generatePaper } from "../texture/paper-grain";
import { generateTip } from "../texture/tip-generators";
import { impastoLighting, impastoSpecular, impastoSpecularFlat } from "../wet/impasto";
import { createWetState, WET_CH } from "../wet/state";
import { bakeWet, stepWet } from "../wet/wet-reference";

import { compositeTile } from "./composite";
import { StrokeLayer } from "./stroke-layer";
import { TILE_PIXELS, TILE_SIZE } from "./tile-binning";

import type { RasterContext } from "./fine-raster";
import type { RasterReceipt } from "./stroke-layer";
import type { DabBatch } from "../core/dab-layout";
import type { LabImage, RawSample, Rgba, TipKind } from "../core/types";
import type { BrushProgram, BrushTipSpec } from "../presets/program-schema";
import type { PaperField, PaperSpec } from "../texture/paper-grain";
import type { TipMask, TipParams } from "../texture/tip-generators";
import type { WetState } from "../wet/state";
import type { WetStepReceipt } from "../wet/wet-reference";

/**
 * CPU 참조 표면. 문서(선형 premultiplied f32) + 획 레이어 + 습식 상태.
 * 같은 (program, seed, 배치)면 같은 픽셀이다.
 */
export const TIP_MASK_SIZE = 64;
export const PAPER_FIELD_SIZE = 256;
/** CPU 참조가 프레임당 습식 시뮬레이션에 쓰는 가상 프레임 시간(ms). */
export const WET_FRAME_MS = 1000 / 60;
/** endStroke에서 건조까지 돌리는 최대 스텝 수(결정적 상한). */
export const WET_DRY_STEPS_MAX = 240;
/** 임파스토 릴리프 조명의 고정 광원(문서 좌표, 좌상단에서 비춤). */
export const IMPASTO_LIGHT: readonly [number, number, number] = [-0.5, -0.5, 1];
/** 높이 → 기울기 배율. */
export const IMPASTO_RELIEF_GAIN = 2.5;
/** 릴리프 하이라이트 강도(가산, 평탄면 기준 초과분 × 알파). */
export const IMPASTO_SPECULAR = 0.4;

export interface StrokeReceiptCpu extends RasterReceipt {
  wet: WetStepReceipt | null;
}

export interface SurfaceOptions {
  strokeCapacityTiles?: number;
  wetCapacityTiles?: number;
}

const tipCache = new Map<string, TipMask[]>();
const paperCache = new Map<string, PaperField>();

function tipKey(kind: TipKind, seed: number, params: TipParams): string {
  return `${kind}|${seed}|${params.hardness}|${params.aspect}|${params.strands ?? ""}|${params.density ?? ""}|${params.angle ?? ""}|${params.frequency ?? ""}|${params.octaves ?? ""}`;
}

/** 팁 mip 체인(프로세스 캐시, 결정적). */
export function tipChainFor(kind: TipKind, seed: number, params: TipParams): TipMask[] {
  const key = tipKey(kind, seed, params);
  const hit = tipCache.get(key);
  if (hit) return hit;
  const chain = buildMipChain(generateTip(kind, TIP_MASK_SIZE, seed, params));
  tipCache.set(key, chain);
  return chain;
}

/** 종이 필드(프로세스 캐시, 결정적). */
export function paperFor(spec: PaperSpec): PaperField {
  const key = `${spec.seed}|${spec.roughness}|${spec.absorbency}`;
  const hit = paperCache.get(key);
  if (hit) return hit;
  const field = generatePaper(spec, PAPER_FIELD_SIZE);
  paperCache.set(key, field);
  return field;
}

function buildTipChains(tip: BrushTipSpec, dual: BrushTipSpec | null): Record<TipKind, TipMask[]> {
  const chains = {} as Record<TipKind, TipMask[]>;
  for (const kind of TIP_KINDS_ORDERED) {
    const src = kind === tip.kind ? tip : dual && kind === dual.kind ? dual : null;
    chains[kind] = src ? tipChainFor(kind, src.seed, src.params) : tipChainFor(kind, 1, { hardness: 0.8, aspect: 1 });
  }
  return chains;
}

export class Surface {
  readonly width: number;
  readonly height: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly document: Float32Array;
  readonly stroke: StrokeLayer;
  wet: WetState | null = null;
  private readonly wetCapacity: number;
  private ctx: RasterContext | null = null;
  private program: BrushProgram | null = null;
  private strokeDabs = 0;
  private overflow = 0;
  private dirtyMax = 0;
  private lastWetReceipt: WetStepReceipt | null = null;
  /** 임파스토 획이 한 번이라도 있었는가(표시 시점 릴리프 조명 적용 여부). */
  private hasHeight = false;

  constructor(width: number, height: number, opts: SurfaceOptions = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new RangeError(`Surface size must be positive integers, got ${width}×${height}`);
    }
    this.width = width;
    this.height = height;
    this.tilesX = Math.ceil(width / TILE_SIZE);
    this.tilesY = Math.ceil(height / TILE_SIZE);
    this.document = new Float32Array(width * height * 4);
    const tiles = this.tilesX * this.tilesY;
    this.stroke = new StrokeLayer(width, height, opts.strokeCapacityTiles ?? tiles);
    this.wetCapacity = opts.wetCapacityTiles ?? tiles;
  }

  /** 문서를 단색(선형 premultiplied)으로 채운다. */
  fill(rgba: Rgba): void {
    for (let i = 0; i < this.document.length; i += 4) {
      this.document[i] = rgba[0];
      this.document[i + 1] = rgba[1];
      this.document[i + 2] = rgba[2];
      this.document[i + 3] = rgba[3];
    }
  }

  beginStroke(program: BrushProgram, seed: number): void {
    const model = program.deposition.model;
    const needsWet = program.wet !== null && (model === "wet-flow" || model === "impasto");
    if (needsWet && !this.wet) {
      this.wet = createWetState(this.width, this.height, this.wetCapacity);
    }
    this.program = program;
    this.strokeDabs = 0;
    this.overflow = 0;
    this.dirtyMax = 0;
    this.lastWetReceipt = null;
    this.ctx = {
      program,
      tipChain: buildTipChains(program.tip, program.deposition.dual),
      paper: program.paper.enabled ? paperFor(program.paper) : null,
      document: this.document,
      width: this.width,
      height: this.height,
      tilesX: this.tilesX,
      tilesY: this.tilesY,
      seed,
      wet: needsWet ? this.wet : null,
    };
  }

  /** 현재 획의 종이 필드(StrokePipeline 마찰·그레인용). */
  paperField(): PaperField | null {
    return this.ctx?.paper ?? null;
  }

  addDabs(batch: DabBatch): RasterReceipt {
    const ctx = this.ctx;
    const program = this.program;
    if (!ctx || !program) throw new InvalidStateError("Surface.addDabs called before beginStroke");
    const receipt = this.stroke.accumulate(batch, ctx);
    this.strokeDabs += receipt.dabCount;
    this.overflow += receipt.overflowDabs;
    this.dirtyMax = Math.max(this.dirtyMax, receipt.dirtyTiles);
    if (ctx.wet && program.wet) {
      if (program.deposition.model === "impasto" && batch.count > 0) this.hasHeight = true;
      this.lastWetReceipt = stepWet(ctx.wet, program.wet, WET_FRAME_MS, ctx.paper);
    }
    return receipt;
  }

  /**
   * bake: document = blend(document, stroke × opacity); 습식은 건조까지 돌린 뒤 문서에 굽는다.
   * 임파스토 높이는 문서에 굽지 않고 표시 시점(`toLabImage`/`toLinear`)에 조명으로만 반영한다
   * (여러 획이 겹쳐도 조명이 중복 적용되지 않는다).
   */
  endStroke(): StrokeReceiptCpu {
    const ctx = this.ctx;
    const program = this.program;
    if (!ctx || !program) throw new InvalidStateError("Surface.endStroke called before beginStroke");
    const poolTilesUsed = this.stroke.pool.used();
    for (const [tile, data] of this.stroke.tiles()) {
      const tx = tile % this.tilesX;
      const ty = Math.floor(tile / this.tilesX);
      compositeTile(this.document, 0, data, program.deposition.opacity, program.deposition.blend, this.width, tx, ty);
    }
    this.stroke.clear();
    let wetReceipt: WetStepReceipt | null = this.lastWetReceipt;
    if (ctx.wet && program.wet) {
      for (let i = 0; i < WET_DRY_STEPS_MAX; i += 1) {
        wetReceipt = stepWet(ctx.wet, program.wet, WET_FRAME_MS, ctx.paper);
        if (wetReceipt.activeTiles === 0) break;
      }
      bakeWet(ctx.wet, this.document, this.width, { km: program.colorDynamics.kmMixing });
    }
    const receipt: StrokeReceiptCpu = {
      dabCount: this.strokeDabs,
      dirtyTiles: this.dirtyMax,
      overflowDabs: this.overflow,
      poolTilesUsed,
      wet: wetReceipt,
    };
    this.ctx = null;
    this.program = null;
    return receipt;
  }

  /**
   * 표시용 문서: 임파스토 높이가 있으면 릴리프 조명(베타)을 적용한 복사본, 없으면 원본 참조.
   * - 램버트 배율: 평탄한 곳 1, 능선은 밝고 골은 어둡다(최대 1.5배)
   * - Blinn-Phong 하이라이트(가산): IMPASTO_SPECULAR·max(0, spec − spec_flat)·alpha — 검은 물감의 능선에도 광택
   * 결과는 premultiplied 불변식(rgb ≤ alpha)을 지키도록 채널별로 [0, alpha]에 클램프한다.
   * GPU `impasto_factor`/`impasto_specular`(common.wgsl)가 같은 식을 미러한다.
   */
  private displayDocument(): Float32Array {
    const wet = this.wet;
    if (!wet || !this.hasHeight) return this.document;
    const height = this.heightMap(wet);
    const lit = impastoLighting(height, this.width, IMPASTO_LIGHT, IMPASTO_RELIEF_GAIN);
    const spec = impastoSpecular(height, this.width, IMPASTO_LIGHT, IMPASTO_RELIEF_GAIN);
    const specFlat = impastoSpecularFlat(IMPASTO_LIGHT);
    const ll = Math.hypot(IMPASTO_LIGHT[0], IMPASTO_LIGHT[1], IMPASTO_LIGHT[2]);
    const flat = IMPASTO_LIGHT[2] / ll;
    const doc = new Float32Array(this.document);
    for (let i = 0; i < height.length; i += 1) {
      if ((height[i] ?? 0) <= 0) continue;
      const factor = Math.fround(Math.min(1.5, (lit[i] ?? flat) / flat));
      const o = i * 4;
      const alpha = doc[o + 3] ?? 0;
      const highlight = Math.fround(IMPASTO_SPECULAR * Math.max(0, (spec[i] ?? specFlat) - specFlat) * alpha);
      for (let c = 0; c < 3; c += 1) {
        const v = Math.fround((doc[o + c] ?? 0) * factor + highlight);
        doc[o + c] = v < 0 ? 0 : v > alpha ? alpha : v;
      }
    }
    return doc;
  }

  /** 습식 풀의 height 채널을 문서 크기 배열로 모은다(미할당 타일은 0). */
  heightMap(wet: WetState): Float32Array {
    const out = new Float32Array(this.width * this.height);
    for (const [tile, slot] of wet.pool.entries()) {
      const data = wet.pool.view(slot);
      const tx = tile % this.tilesX;
      const ty = Math.floor(tile / this.tilesX);
      for (let ly = 0; ly < TILE_SIZE; ly += 1) {
        const py = ty * TILE_SIZE + ly;
        if (py >= this.height) continue;
        for (let lx = 0; lx < TILE_SIZE; lx += 1) {
          const px = tx * TILE_SIZE + lx;
          if (px >= this.width) continue;
          out[py * this.width + px] = data[WET_CH.height * TILE_PIXELS + ly * TILE_SIZE + lx] ?? 0;
        }
      }
    }
    return out;
  }

  /** sRGB straight RGBA8(임파스토 조명 포함). */
  toLabImage(): LabImage {
    return encodeLabImage(this.displayDocument(), this.width, this.height);
  }

  /** 선형 premultiplied 복사본(임파스토 조명 포함). */
  toLinear(): Float32Array {
    const doc = this.displayDocument();
    return doc === this.document ? new Float32Array(doc) : doc;
  }
}

export interface RenderStrokeOptions {
  width: number;
  height: number;
  seed: number;
  /** 프레임 분할 간격(ms). 기본 16.67. */
  frameMs?: number;
  color?: Rgba;
  /** 문서 초기 채움(선형 premultiplied). */
  background?: Rgba;
  surface?: Surface;
}

export interface RenderStrokeResult {
  image: LabImage;
  linear: Float32Array;
  receipt: StrokeReceiptCpu;
  frames: number;
  dabs: number;
}

/** tMs 경계로 프레임 배치를 나눈다(bench replay와 같은 규칙: 프레임 창 [k·frameMs, (k+1)·frameMs)). */
export function splitFrames(samples: readonly RawSample[], frameMs = WET_FRAME_MS): RawSample[][] {
  if (samples.length === 0) return [];
  const t0 = samples[0]?.tMs ?? 0;
  const frames: RawSample[][] = [];
  let current: RawSample[] = [];
  let frameIndex = 0;
  for (const s of samples) {
    const k = Math.floor((s.tMs - t0) / frameMs);
    while (k > frameIndex && current.length > 0) {
      frames.push(current);
      current = [];
      frameIndex += 1;
    }
    frameIndex = Math.max(frameIndex, k);
    current.push(s);
  }
  if (current.length > 0) frames.push(current);
  return frames;
}

/** 획 1개를 CPU 참조로 렌더한다(테스트·레인·갤러리 공용). */
export function renderStroke(program: BrushProgram, samples: readonly RawSample[], opts: RenderStrokeOptions): RenderStrokeResult {
  const surface = opts.surface ?? new Surface(opts.width, opts.height);
  if (opts.background && !opts.surface) surface.fill(opts.background);
  surface.beginStroke(program, opts.seed);
  const pipeline = new StrokePipeline(program, opts.seed, undefined, surface.paperField(), { color: opts.color });
  const frames = splitFrames(samples, opts.frameMs ?? WET_FRAME_MS);
  let dabs = 0;
  for (const frame of frames) {
    const batch = pipeline.push(frame);
    dabs += batch.count;
    surface.addDabs(batch);
  }
  const tail = pipeline.finish();
  dabs += tail.count;
  surface.addDabs(tail);
  const receipt = surface.endStroke();
  return { image: surface.toLabImage(), linear: surface.toLinear(), receipt, frames: frames.length, dabs };
}

/** 썸네일 배경: 지우개·smudge 가족은 빈 문서에서 아무것도 보이지 않으므로 그라데이션 위에 그린다. */
export function thumbnailBackground(program: BrushProgram, width: number, height: number): Surface {
  const surface = new Surface(width, height);
  if (program.family === "eraser" || program.family === "smudge") {
    const doc = surface.document;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const o = (y * width + x) * 4;
        const t = x / Math.max(1, width - 1);
        const band = Math.floor((y / Math.max(1, height)) * 4) % 2 === 0 ? 0.8 : 0.35;
        doc[o] = t * band;
        doc[o + 1] = 0.5 * band;
        doc[o + 2] = (1 - t) * band;
        doc[o + 3] = 1;
      }
    }
  }
  return surface;
}

/** 프리셋 썸네일(갤러리·카탈로그 다양성 테스트 공용). */
export function renderPresetThumbnail(program: BrushProgram, samples: readonly RawSample[], size: number, seed = 1): RenderStrokeResult {
  const surface = thumbnailBackground(program, size, size);
  return renderStroke(program, samples, { width: size, height: size, seed, surface });
}
