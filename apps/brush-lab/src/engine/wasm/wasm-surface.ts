import { InvalidStateError } from "../core/errors";
import { applyImpastoDabs, computeSmudgeColors, unpackAll } from "../raster/fine-raster";
import { Surface } from "../raster/reference-renderer";
import { StrokeLayer } from "../raster/stroke-layer";
import { MAX_TILES_PER_DAB_DEFAULT, TILE_SIZE, tileRefs } from "../raster/tile-binning";
import { TIP_KINDS_ORDERED } from "../texture/mip-chain";
import { activeTilesAfterDeposit } from "../wet/active-tiles";

import { tipAtlasFloats } from "./kernel-abi";
import { SumiKernelSession } from "./kernel-session";

import type { SumiKernel } from "./loader";
import type { DabBatch } from "../core/dab-layout";
import type { TipKind } from "../core/types";
import type { RasterContext } from "../raster/fine-raster";
import type { SurfaceOptions } from "../raster/reference-renderer";
import type { RasterReceipt } from "../raster/stroke-layer";
import type { TipMask } from "../texture/tip-generators";

/**
 * wasm 커널로 타일 래스터를 하는 CPU 표면. `raster/reference-renderer.ts`의 `Surface`를 **상속**해 문서·습식 층(수채 안료·유화 물감)·
 * 플래튼·표시 시점 합성·릴리프 조명·영수증 의미를 그대로 물려받고, 획 레이어(`StrokeLayer.accumulate`)의 CSR 비닝과 타일 래스터만
 * wasm으로 바꾼다. `Surface`를 따로 복제하지 않으므로 CPU 참조가 바뀌어도(습식 층 구조 변경 등) 같은 의미로 따라간다.
 *
 * 임파스토(`impasto`): 높이·색 밀기는 타일을 가로지르는 dab 순서 패스(`applyImpastoDabs`, 유화 물감 층)라 wasm 타일 커널 밖이다.
 * 이 표면은 그 패스를 TS 참조 그대로 호출하고, 임파스토 dab는 CPU `rasterizeTile`처럼 타일 래스터에서 제외한다(색은 유화 층이 합성한다).
 * 습식 시뮬레이션(`stepWet`)·bake·합성도 TS 참조를 그대로 쓴다(CPU 작업이라 wasm 이득이 작고 참조와 한 곳에서 일치시킨다).
 */

export type WasmSurfaceOptions = SurfaceOptions;

/** 8종 mip 체인 → 레벨을 이어 붙인 f32(커널 `Atlas` 규약: 레벨 L은 n×(8n), 종류 k는 열 오프셋 k·n). */
export function flattenTipAtlas(chains: Record<TipKind, TipMask[]>, tile: number, levels: number): Float32Array {
  const out = new Float32Array(tipAtlasFloats(tile, levels));
  let offset = 0;
  for (let level = 0; level < levels; level += 1) {
    const n = Math.max(1, tile >> level);
    const width = n * TIP_KINDS_ORDERED.length;
    TIP_KINDS_ORDERED.forEach((kind, k) => {
      const mask = chains[kind][level];
      if (!mask || mask.size !== n) throw new RangeError(`tip chain ${kind} level ${level} must be ${n}×${n}`);
      for (let y = 0; y < n; y += 1) {
        for (let x = 0; x < n; x += 1) out[offset + y * width + k * n + x] = mask.data[y * n + x] ?? 0;
      }
    });
    offset += width * n;
  }
  return out;
}

/** 곡선이 항등이면 커널도 곡선을 건너뛴다(`raster/fine-raster.ts` isIdentityCurve 미러). */
function isIdentityCurve(curve: readonly number[]): boolean {
  if (curve.length === 2) return curve[0] === 0 && curve[1] === 1;
  for (let i = 0; i < curve.length; i += 1) {
    if (Math.abs((curve[i] ?? 0) - i / (curve.length - 1)) > 1e-9) return false;
  }
  return true;
}

/**
 * 획 레이어의 wasm 구현. `StrokeLayer.accumulate`와 같은 순서(CSR 비닝 → smudge 운반 색 → 더럽혀진 타일마다 래스터 →
 * 임파스토 패스 → 습식 활성화)이고 타일 안쪽 픽셀 루프와 비닝만 커널이 한다. 획 풀(`pool`)은 상속한 것을 그대로 쓴다.
 */
class WasmStrokeLayer extends StrokeLayer {
  private readonly session: SumiKernelSession;
  /** 커널 텍스처 상태(팁 아틀라스·종이·곡선)를 마지막으로 올린 획의 래스터 문맥(획마다 새 객체라 동일성으로 구분한다). */
  private textureCtx: RasterContext | null = null;

  constructor(session: SumiKernelSession, width: number, height: number, capacityTiles: number) {
    super(width, height, capacityTiles);
    this.session = session;
  }

  private ensureTexture(ctx: RasterContext): void {
    if (this.textureCtx === ctx) return;
    const program = ctx.program;
    const tile = ctx.tipChain.round[0]?.size ?? 64;
    const levels = ctx.tipChain.round.length;
    const curve = program.edge.curve;
    this.session.setTexture({
      filterMode: ["nearest", "bilinear", "trilinear", "anisotropic"].indexOf(program.paper.filter),
      tipTile: tile,
      tipLevels: levels,
      tipAtlas: flattenTipAtlas(ctx.tipChain, tile, levels),
      paper: ctx.paper ? ctx.paper.bump : null,
      paperSize: ctx.paper ? ctx.paper.size : 0,
      paperScale: program.paper.scale,
      paperRotation: program.paper.rotationRad,
      curve: isIdentityCurve(curve) ? null : curve,
    });
    this.textureCtx = ctx;
  }

  override accumulate(batch: DabBatch, ctx: RasterContext): RasterReceipt {
    this.ensureTexture(ctx);
    this.session.uploadDabs(batch.data, batch.count);
    const bin = this.session.bin(this.tilesX, this.tilesY, MAX_TILES_PER_DAB_DEFAULT);
    ctx.dabs = unpackAll(batch);
    const model = ctx.program.deposition.model;
    // smudge 운반 색은 타일 순회와 무관하게 dab 순서로 한 번만 계산한다(CPU StrokeLayer.accumulate와 같다).
    ctx.smudgeColors = model === "smudge" ? computeSmudgeColors(ctx.dabs, ctx) : undefined;
    this.session.setPick(ctx.smudgeColors ?? null);
    const wet = ctx.wet && (model === "wet-flow" || model === "impasto") ? ctx.wet : null;
    const impasto = model === "impasto";
    for (let i = 0; i < bin.dirtyCount; i += 1) {
      const tile = bin.dirtyTiles[i] ?? 0;
      const strokeTile = this.pool.view(this.pool.alloc(tile));
      const wetTile = wet ? wet.pool.view(wet.pool.alloc(tile)) : null;
      let refs = tileRefs(bin, tile);
      // 임파스토 dab는 CPU rasterizeTile처럼 타일 래스터에서 건너뛴다(색은 유화 물감 층이 합성한다).
      if (impasto) {
        const dabs = ctx.dabs;
        refs = refs.filter((index) => !dabs[index]?.impasto);
      }
      this.session.rasterTile(tile, this.tilesX, refs, strokeTile, wetTile);
    }
    if (wet && impasto) applyImpastoDabs(wet, ctx.dabs, ctx);
    if (wet) activeTilesAfterDeposit(wet, bin);
    return {
      dabCount: batch.count,
      dirtyTiles: bin.dirtyCount,
      overflowDabs: bin.overflowDabs,
      poolTilesUsed: this.pool.used(),
    };
  }
}

export class WasmSurface extends Surface {
  /** 획 레이어(wasm 래스터). 상속한 `Surface` 로직이 이 객체를 통해 누적·합성·초기화한다. */
  declare readonly stroke: WasmStrokeLayer;
  private readonly session: SumiKernelSession;
  private disposed = false;

  constructor(kernel: SumiKernel, width: number, height: number, opts: WasmSurfaceOptions = {}) {
    // 부모가 만드는 기본 획 레이어는 곧 교체되므로 풀을 1타일로 줄여 대형 캔버스에서 메모리를 이중으로 쓰지 않는다.
    super(width, height, { ...opts, strokeCapacityTiles: 1 });
    this.session = new SumiKernelSession(kernel);
    const tiles = Math.ceil(width / TILE_SIZE) * Math.ceil(height / TILE_SIZE);
    this.stroke = new WasmStrokeLayer(this.session, width, height, opts.strokeCapacityTiles ?? tiles);
  }

  override beginStroke(...args: Parameters<Surface["beginStroke"]>): void {
    this.assertLive();
    super.beginStroke(...args);
  }

  override addDabs(batch: DabBatch): RasterReceipt {
    this.assertLive();
    return super.addDabs(batch);
  }

  /** 커널 선형 메모리에 잡힌 바이트(리포트용). */
  kernelBytes(): number {
    return this.session.allocatedBytes();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session.dispose();
  }

  private assertLive(): void {
    if (this.disposed) throw new InvalidStateError("WasmSurface: dispose 뒤에 호출됐다");
  }
}
