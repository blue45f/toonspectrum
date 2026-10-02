import { BUFFER_USAGE } from "./layout";

import type { Clock, TimingSource } from "../core/types";

export type { TimingSource } from "../core/types";

/**
 * GPU 시간 계측.
 * - `timestamp-query`가 있으면 프레임의 compute pass 1개에 begin/end 타임스탬프를 쓰고 링 버퍼에 resolve한다.
 *   링이 가득 차면(또는 획이 끝나면) 스테이징으로 복사해 비동기로 합산한다(핫 패스에서 map 대기 없음).
 * - 없으면 `queue.onSubmittedWorkDone` 전후의 주입 시계 차이(submitted-work-done)를 쓴다.
 * - 시계도 없으면 `unavailable`.
 * 측정 불가 값은 null + source로 드러낸다(측정했다고 꾸미지 않는다).
 */
export const TIMER_RING_FRAMES = 256;
/** `resolveQuerySet`의 목적지 오프셋은 256의 배수여야 한다(WebGPU 사양). 프레임 1개 = 슬롯 1개 = 256 B(앞 16 B만 쓴다). */
export const TIMER_RESOLVE_STRIDE = 256;

export interface GpuTimerResult {
  gpuTimeMs: number | null;
  source: TimingSource;
  /** 합산에 포함된 프레임 수. */
  framesMeasured: number;
}

export class GpuTimer {
  readonly source: TimingSource;
  private readonly device: GPUDevice;
  private readonly clock: Clock | null;
  private readonly querySet: GPUQuerySet | null;
  private readonly resolveBuffer: GPUBuffer | null;
  private frame = 0;
  private totalNs = 0n;
  private framesMeasured = 0;
  private pending: Promise<void>[] = [];
  /** 복사가 기록됐지만 아직 submit되지 않은 스테이징. submit 뒤에 map한다(submit 전에 map하면 "used in submit while mapped"). */
  private unmapped: { staging: GPUBuffer; bytes: number; frames: number }[] = [];
  private workDoneMs = 0;
  private workDoneFrames = 0;
  private disposed = false;

  constructor(device: GPUDevice, hasTimestampQuery: boolean, clock: Clock | null) {
    this.device = device;
    this.clock = clock;
    if (hasTimestampQuery) {
      this.source = "timestamp-query";
      this.querySet = device.createQuerySet({ label: "sumi-timestamps", type: "timestamp", count: TIMER_RING_FRAMES * 2 });
      this.resolveBuffer = device.createBuffer({
        label: "sumi-timestamp-resolve",
        size: TIMER_RING_FRAMES * TIMER_RESOLVE_STRIDE,
        usage: BUFFER_USAGE.QUERY_RESOLVE | BUFFER_USAGE.COPY_SRC,
      });
    } else {
      this.source = clock ? "submitted-work-done" : "unavailable";
      this.querySet = null;
      this.resolveBuffer = null;
    }
  }

  /**
   * 이번 프레임 compute pass에 넣을 timestampWrites. 타임스탬프가 없으면 undefined.
   * 프레임이 여러 pass(임파스토 dab 패스가 끼면 3개)로 나뉘면 첫 pass에 "begin", 마지막 pass에 "end"를 줘 한 슬롯(시작·끝)이
   * 프레임 전체를 덮게 한다. 중간 pass에는 줄 필요가 없다.
   */
  passTimestamps(part: "begin" | "end" | "both" = "both"): GPUComputePassTimestampWrites | undefined {
    if (!this.querySet) return undefined;
    const slot = this.frame % TIMER_RING_FRAMES;
    const writes: GPUComputePassTimestampWrites = { querySet: this.querySet };
    if (part !== "end") writes.beginningOfPassWriteIndex = slot * 2;
    if (part !== "begin") writes.endOfPassWriteIndex = slot * 2 + 1;
    return writes;
  }

  /**
   * 프레임 끝: resolve를 encoder에 기록한다. 링이 가득 차면 스테이징 복사도 기록하고 map을 예약한다.
   * `queue.submit` 직전에 호출해야 한다.
   */
  endFrame(encoder: GPUCommandEncoder): void {
    if (this.querySet && this.resolveBuffer) {
      const slot = this.frame % TIMER_RING_FRAMES;
      encoder.resolveQuerySet(this.querySet, slot * 2, 2, this.resolveBuffer, slot * TIMER_RESOLVE_STRIDE);
      if (slot === TIMER_RING_FRAMES - 1) this.flushRing(encoder, TIMER_RING_FRAMES);
    }
    this.frame += 1;
  }

  /**
   * 복사를 기록한 스테이징의 map을 시작한다. **복사를 담은 encoder를 submit한 직후에만** 불러야 한다
   * (submit 전에 map하면 버퍼가 mapped 상태로 submit에 쓰여 command buffer가 무효가 된다).
   * `afterSubmit`이 호출하고, 프레임이 아닌 제출(endStroke)은 직접 부른다.
   */
  startPendingMaps(): void {
    const list = this.unmapped;
    this.unmapped = [];
    for (const { staging, bytes, frames } of list) {
      this.pending.push(this.readStaging(staging, bytes, frames));
    }
  }

  /** submit 직후 호출(보류 중인 타임스탬프 map 시작 + submitted-work-done 측정). */
  afterSubmit(): void {
    this.startPendingMaps();
    if (this.source !== "submitted-work-done" || !this.clock) return;
    const t0 = this.clock.now();
    const p = this.device.queue.onSubmittedWorkDone().then(() => {
      if (!this.clock) return;
      this.workDoneMs += this.clock.now() - t0;
      this.workDoneFrames += 1;
    });
    this.pending.push(p);
  }

  /** 링에 남은 프레임을 스테이징으로 복사한다(endStroke 전 마지막 encoder에서). */
  flushPartial(encoder: GPUCommandEncoder): void {
    if (!this.querySet || !this.resolveBuffer) return;
    const slot = this.frame % TIMER_RING_FRAMES;
    if (slot === 0) return;
    this.flushRing(encoder, slot);
    // 다음 플러시가 같은 슬롯을 다시 세지 않도록 프레임 번호를 링 경계로 올린다.
    this.frame += TIMER_RING_FRAMES - slot;
  }

  private flushRing(encoder: GPUCommandEncoder, frames: number): void {
    if (!this.resolveBuffer) return;
    const bytes = frames * TIMER_RESOLVE_STRIDE;
    const staging = this.device.createBuffer({
      label: "sumi-timestamp-staging",
      size: bytes,
      usage: BUFFER_USAGE.MAP_READ | BUFFER_USAGE.COPY_DST,
    });
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, staging, 0, bytes);
    this.unmapped.push({ staging, bytes, frames });
  }

  private async readStaging(staging: GPUBuffer, bytes: number, frames: number): Promise<void> {
    await staging.mapAsync(0x0001);
    const view = new DataView(staging.getMappedRange(0, bytes));
    for (let i = 0; i < frames; i += 1) {
      const begin = view.getBigUint64(i * TIMER_RESOLVE_STRIDE, true);
      const end = view.getBigUint64(i * TIMER_RESOLVE_STRIDE + 8, true);
      if (end >= begin) {
        this.totalNs += end - begin;
        this.framesMeasured += 1;
      }
    }
    staging.unmap();
    staging.destroy();
  }

  /** 지금까지 예약된 측정을 모두 기다려 합산 결과를 돌려준다. */
  async resolve(): Promise<GpuTimerResult> {
    const pending = this.pending;
    this.pending = [];
    await Promise.all(pending);
    if (this.source === "timestamp-query") {
      if (this.framesMeasured === 0) return { gpuTimeMs: null, source: this.source, framesMeasured: 0 };
      return { gpuTimeMs: Number(this.totalNs) / 1e6, source: this.source, framesMeasured: this.framesMeasured };
    }
    if (this.source === "submitted-work-done") {
      if (this.workDoneFrames === 0) return { gpuTimeMs: null, source: this.source, framesMeasured: 0 };
      return { gpuTimeMs: this.workDoneMs, source: this.source, framesMeasured: this.workDoneFrames };
    }
    return { gpuTimeMs: null, source: this.source, framesMeasured: 0 };
  }

  /** 획 시작: 누적을 비운다(링 슬롯은 이어서 쓴다). */
  reset(): void {
    this.totalNs = 0n;
    this.framesMeasured = 0;
    this.workDoneMs = 0;
    this.workDoneFrames = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.querySet?.destroy();
    this.resolveBuffer?.destroy();
  }
}

/** 기능 집합·시계로 TimingSource를 고른다(GpuTimer와 같은 규칙, 레인 리포트용). */
export function timingSourceFor(features: ReadonlySet<string>, clock: Clock | null): TimingSource {
  if (features.has("timestamp-query")) return "timestamp-query";
  return clock ? "submitted-work-done" : "unavailable";
}
