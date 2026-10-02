import { DAB_FLOATS } from "../core/dab-layout";

import { SK_BIN_STATUS, SK_PARAM, SK_PARAM_COUNT, SK_STROKE_TILE_FLOATS, SK_WET_TILE_FLOATS } from "./kernel-abi";

import type { SumiKernel } from "./loader";
import type { BinResult } from "../raster/tile-binning";

/**
 * wasm 커널 호출 세션. 호스트 쪽 TS 배열을 커널 선형 메모리 블록에 올리고 포인터를 관리한다.
 * - dab 배치·smudge 운반 색·텍스처(팁 아틀라스·종이·곡선)·파라미터는 블록을 재사용하고 커지면 다시 할당한다.
 * - 타일 호출마다 오가는 것은 획 타일(4 KiB)과 습식 타일(12 KiB)뿐이다.
 * - 모든 결과 배열은 복사본이다(선형 메모리가 늘어나면 뷰가 분리되므로 호출마다 뷰를 새로 만든다).
 */

export interface KernelTextureConfig {
  filterMode: number;
  /** 팁 아틀라스 레벨 0 한 변(px). */
  tipTile: number;
  tipLevels: number;
  /** 레벨을 이어 붙인 f32(8종 가로 배치). null이면 round 외 팁은 마스크 1. */
  tipAtlas: Float32Array | null;
  /** bump 필드(size² f32). null이면 그레인 생략. */
  paper: Float32Array | null;
  paperSize: number;
  paperScale: number;
  paperRotation: number;
  /** edge.curve(비항등일 때만). null이면 곡선 생략. */
  curve: readonly number[] | null;
}

interface Block {
  ptr: number;
  bytes: number;
}

export class SumiKernelSession {
  private readonly kernel: SumiKernel;
  private dabs: Block = { ptr: 0, bytes: 0 };
  private dabCount = 0;
  private pick: Block = { ptr: 0, bytes: 0 };
  private hasPick = false;
  private refs: Block = { ptr: 0, bytes: 0 };
  private refCount = 0;
  private tipAtlas: Block = { ptr: 0, bytes: 0 };
  private tipAtlasFloats = 0;
  private paper: Block = { ptr: 0, bytes: 0 };
  private curve: Block = { ptr: 0, bytes: 0 };
  private readonly params: Block;
  private readonly strokeTile: Block;
  private readonly wetTile: Block;
  private disposed = false;

  constructor(kernel: SumiKernel) {
    this.kernel = kernel;
    this.params = { ptr: kernel.alloc(SK_PARAM_COUNT * 8), bytes: SK_PARAM_COUNT * 8 };
    this.strokeTile = { ptr: kernel.alloc(SK_STROKE_TILE_FLOATS * 4), bytes: SK_STROKE_TILE_FLOATS * 4 };
    this.wetTile = { ptr: kernel.alloc(SK_WET_TILE_FLOATS * 4), bytes: SK_WET_TILE_FLOATS * 4 };
  }

  private ensure(block: Block, bytes: number): Block {
    if (block.bytes >= bytes) return block;
    if (block.ptr !== 0) this.kernel.free(block.ptr, block.bytes);
    const grown = Math.max(bytes, Math.ceil(block.bytes * 1.5));
    return { ptr: this.kernel.alloc(grown), bytes: grown };
  }

  /** 이번 배치의 dab(n × 16 f32)를 올린다. */
  uploadDabs(data: Float32Array, count: number): void {
    this.assertLive();
    const floats = count * DAB_FLOATS;
    this.dabs = this.ensure(this.dabs, Math.max(16, floats * 4));
    this.dabCount = count;
    if (floats > 0) this.kernel.f32(this.dabs.ptr, floats).set(data.subarray(0, floats));
  }

  /** smudge 운반 색(dab 수 × 4 f32). null이면 smudge 플래그가 있어도 일반 dab로 그린다(CPU 참조와 같다). */
  setPick(pick: Float32Array | null): void {
    this.assertLive();
    if (!pick) {
      this.hasPick = false;
      return;
    }
    this.pick = this.ensure(this.pick, Math.max(16, pick.length * 4));
    this.kernel.f32(this.pick.ptr, pick.length).set(pick);
    this.hasPick = true;
  }

  /** 획 시작·프로그램 변경 시 텍스처·파라미터를 올린다. */
  setTexture(cfg: KernelTextureConfig): void {
    this.assertLive();
    if (cfg.tipAtlas) {
      this.tipAtlas = this.ensure(this.tipAtlas, cfg.tipAtlas.length * 4);
      this.kernel.f32(this.tipAtlas.ptr, cfg.tipAtlas.length).set(cfg.tipAtlas);
      this.tipAtlasFloats = cfg.tipAtlas.length;
    } else {
      this.tipAtlasFloats = 0;
    }
    const usePaper = cfg.paper !== null;
    if (cfg.paper) {
      this.paper = this.ensure(this.paper, cfg.paper.length * 4);
      this.kernel.f32(this.paper.ptr, cfg.paper.length).set(cfg.paper);
    }
    const curve = cfg.curve;
    if (curve && curve.length > 0) {
      this.curve = this.ensure(this.curve, curve.length * 8);
      this.kernel.f64(this.curve.ptr, curve.length).set(curve);
    }
    const p = this.kernel.f64(this.params.ptr, SK_PARAM_COUNT);
    p.fill(0);
    p[SK_PARAM.filterMode] = cfg.filterMode;
    p[SK_PARAM.tipTile] = cfg.tipTile;
    p[SK_PARAM.tipLevels] = cfg.tipLevels;
    p[SK_PARAM.paperEnabled] = usePaper ? 1 : 0;
    p[SK_PARAM.paperScale] = cfg.paperScale;
    p[SK_PARAM.paperRotation] = cfg.paperRotation;
    p[SK_PARAM.paperSize] = cfg.paperSize;
    p[SK_PARAM.edgeEnabled] = curve && curve.length > 0 ? 1 : 0;
    p[SK_PARAM.edgeLen] = curve ? curve.length : 0;
  }

  /**
   * 업로드된 dab를 CSR로 비닝한다(`binDabs` 미러). refs 용량 부족이면 총수만큼 늘려 한 번 더 부른다.
   * 반환 배열은 모두 복사본이며 이후 `rasterTile`이 같은 refs를 쓴다.
   */
  bin(tilesX: number, tilesY: number, maxTilesPerDab: number): BinResult {
    this.assertLive();
    const tileCount = tilesX * tilesY;
    const counts = this.kernel.alloc(tileCount * 4);
    const offsets = this.kernel.alloc((tileCount + 1) * 4);
    const dirty = this.kernel.alloc(Math.max(4, tileCount * 4));
    const out = this.kernel.alloc(16);
    try {
      let cap = Math.max(1, this.refs.bytes / 4);
      this.refs = this.ensure(this.refs, Math.max(16, cap * 4));
      cap = this.refs.bytes / 4;
      const call = (): number =>
        this.kernel.exports.sk_bin_dabs(
          this.dabs.ptr,
          this.dabCount,
          tilesX,
          tilesY,
          maxTilesPerDab,
          counts,
          offsets,
          this.refs.ptr,
          cap,
          dirty,
          out,
        );
      let status = call();
      if (status === SK_BIN_STATUS.refsCapacity) {
        const total = this.kernel.u32(out, 3)[1] ?? 0;
        this.refs = this.ensure(this.refs, Math.max(16, total * 4));
        cap = this.refs.bytes / 4;
        status = call();
      }
      if (status !== SK_BIN_STATUS.ok) {
        throw new RangeError(`sk_bin_dabs 실패(status ${status}): 포인터·타일 격자 계약 위반`);
      }
      const o = this.kernel.u32(out, 3);
      const dirtyCount = o[0] ?? 0;
      const total = o[1] ?? 0;
      const overflowDabs = o[2] ?? 0;
      this.refCount = total;
      return {
        counts: this.kernel.u32(counts, tileCount).slice(),
        offsets: this.kernel.u32(offsets, tileCount + 1).slice(),
        refs: this.kernel.u32(this.refs.ptr, total).slice(),
        dirtyTiles: this.kernel.u32(dirty, dirtyCount).slice(),
        dirtyCount,
        overflowDabs,
      };
    } finally {
      this.kernel.free(counts, tileCount * 4);
      this.kernel.free(offsets, (tileCount + 1) * 4);
      this.kernel.free(dirty, Math.max(4, tileCount * 4));
      this.kernel.free(out, 16);
    }
  }

  /**
   * 타일 1개를 래스터한다. `refs`는 `bin()` 결과의 해당 타일 구간(오름차순)이다.
   * strokeTile(1024 f32)·wetTile(3072 f32 또는 null)은 읽고-수정-쓰기 한다. 반환 = 기여한 dab 수.
   */
  rasterTile(tile: number, tilesX: number, tileRefs: Uint32Array, strokeTile: Float32Array, wetTile: Float32Array | null): number {
    this.assertLive();
    this.refs = this.ensure(this.refs, Math.max(16, tileRefs.length * 4));
    // 타일 refs를 refs 블록 앞쪽에 복사한다(bin()의 CSR 전체는 호스트 쪽 BinResult가 들고 있다).
    this.kernel.u32(this.refs.ptr, tileRefs.length).set(tileRefs);
    this.kernel.f32(this.strokeTile.ptr, SK_STROKE_TILE_FLOATS).set(strokeTile.subarray(0, SK_STROKE_TILE_FLOATS));
    if (wetTile) this.kernel.f32(this.wetTile.ptr, SK_WET_TILE_FLOATS).set(wetTile.subarray(0, SK_WET_TILE_FLOATS));
    const hits = this.kernel.exports.sk_raster_tile(
      tile,
      tilesX,
      this.dabs.ptr,
      this.dabCount,
      this.refs.ptr,
      tileRefs.length,
      this.params.ptr,
      this.tipAtlasFloats > 0 ? this.tipAtlas.ptr : 0,
      this.tipAtlasFloats,
      this.paperEnabled() ? this.paper.ptr : 0,
      this.curveEnabled() ? this.curve.ptr : 0,
      this.hasPick ? this.pick.ptr : 0,
      wetTile ? this.wetTile.ptr : 0,
      this.strokeTile.ptr,
    );
    strokeTile.set(this.kernel.f32(this.strokeTile.ptr, SK_STROKE_TILE_FLOATS));
    if (wetTile) wetTile.set(this.kernel.f32(this.wetTile.ptr, SK_WET_TILE_FLOATS));
    return hits;
  }

  private paperEnabled(): boolean {
    return (this.kernel.f64(this.params.ptr, SK_PARAM_COUNT)[SK_PARAM.paperEnabled] ?? 0) !== 0;
  }

  private curveEnabled(): boolean {
    return (this.kernel.f64(this.params.ptr, SK_PARAM_COUNT)[SK_PARAM.edgeEnabled] ?? 0) !== 0;
  }

  /** 커널 선형 메모리에 잡힌 바이트(디버깅·리포트). */
  allocatedBytes(): number {
    return [this.dabs, this.pick, this.refs, this.tipAtlas, this.paper, this.curve, this.params, this.strokeTile, this.wetTile].reduce((a, b) => a + b.bytes, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const b of [this.dabs, this.pick, this.refs, this.tipAtlas, this.paper, this.curve, this.params, this.strokeTile, this.wetTile]) {
      if (b.ptr !== 0) this.kernel.free(b.ptr, b.bytes);
    }
  }

  private assertLive(): void {
    if (this.disposed) throw new RangeError("SumiKernelSession: dispose 뒤에 호출됐다");
  }
}
