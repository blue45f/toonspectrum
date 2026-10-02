import { attachPointerCapture, splitPredicted } from "../../platform/pointer-capture";
import { FrameScheduler } from "../../platform/raf-scheduler";

import type { LabImage, RawSample } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type { BrushEngineLane, DabBatchReceipt, LaneEnvironment, StrokeReceipt } from "../../lanes/lane";
import type { PreviewPoint } from "../../platform/canvas-present";
import type { PointerCaptureOptions } from "../../platform/pointer-capture";

/**
 * 실시간 입력 세션: 포인터 캡처 → 프레임 스케줄러 → 레인 `addSamples`(프레임당 1회) → 획 종료 시 readback.
 * - 예측 표본은 `onPreview`로만 전달한다(정본 스트림에 넣지 않는다).
 * - 배치는 `up` 표본 경계에서만 나눈다(같은 프레임에 획이 끝나고 새 획이 시작되는 경우).
 * - 레인 오류는 `onError`로 드러내고 세션은 다음 획을 받을 수 있는 상태로 돌아간다.
 */

export interface LiveStrokeResult {
  image: LabImage;
  linear: Float32Array | null;
  receipt: StrokeReceipt;
  frames: DabBatchReceipt[];
  /** 정본 표본(raw·coalesced)만. */
  samples: RawSample[];
  /** 이 획에 쓴 시드(세션 시드 + 획 순번). */
  seed: number;
}

export interface LiveSessionOptions {
  createLane: () => BrushEngineLane;
  env: LaneEnvironment;
  program: BrushProgram;
  seed: number;
  width: number;
  height: number;
  presentCanvas?: HTMLCanvasElement;
  /** 생략 시 `globalThis.requestAnimationFrame` 기반 스케줄러. */
  scheduler?: FrameScheduler;
  onPreview?: (points: PreviewPoint[]) => void;
  /** 정본 표본(raw·coalesced)이 들어올 때마다(스케줄러 큐 전). 입력 궤적 미리보기용. */
  onCanonical?: (samples: readonly RawSample[]) => void;
  onFrame?: (receipt: DabBatchReceipt) => void;
  onStrokeEnd?: (result: LiveStrokeResult) => void;
  onError?: (error: unknown) => void;
}

export class LiveStrokeSession {
  private readonly opts: LiveSessionOptions;
  private readonly scheduler: FrameScheduler;
  private lane: BrushEngineLane;
  private inStroke = false;
  private strokeCount = 0;
  private strokeSeed = 0;
  private strokeSamples: RawSample[] = [];
  private frames: DabBatchReceipt[] = [];
  private chain: Promise<void> = Promise.resolve();
  private detach: (() => void) | null = null;
  private disposed = false;
  /** 현재 `lane`이 이미 dispose됐는가(clear가 이전 레인을 버린 뒤 새 레인을 대입하기 전). 같은 레인을 두 번 해제하지 않는다. */
  private laneReleased = false;

  private constructor(opts: LiveSessionOptions, lane: BrushEngineLane) {
    this.opts = opts;
    this.lane = lane;
    this.scheduler = opts.scheduler ?? new FrameScheduler(undefined, opts.env.clock);
    this.scheduler.onFrame((batch) => this.enqueueBatch(batch));
  }

  /** 레인을 만들고 init까지 마친 세션. init 실패(LaneUnavailableError 등)는 그대로 던진다. */
  static async create(opts: LiveSessionOptions): Promise<LiveStrokeSession> {
    const lane = opts.createLane();
    await LiveStrokeSession.initLane(lane, opts);
    return new LiveStrokeSession(opts, lane);
  }

  private static initLane(lane: BrushEngineLane, opts: LiveSessionOptions): Promise<void> {
    const init: Parameters<BrushEngineLane["init"]>[1] = {
      width: opts.width,
      height: opts.height,
      dpr: 1,
      tileSize: 16,
      seed: opts.seed,
    };
    if (opts.presentCanvas) init.presentCanvas = opts.presentCanvas;
    return lane.init(opts.env, init);
  }

  get strokes(): number {
    return this.strokeCount;
  }

  get currentLane(): BrushEngineLane {
    return this.lane;
  }

  /** 요소에 포인터 캡처를 붙인다. 반환 함수로 뗀다. */
  attach(el: HTMLElement, captureOpts: PointerCaptureOptions = {}): () => void {
    if (this.detach) this.detach();
    const off = attachPointerCapture(el, (raw) => this.onSamples(raw), {
      logicalSize: { width: this.opts.width, height: this.opts.height },
      ...captureOpts,
    });
    this.detach = off;
    return () => {
      if (this.detach === off) this.detach = null;
      off();
    };
  }

  /**
   * 문서를 비운다: 진행 중 작업 뒤에 직렬화해 레인을 버리고 새로 init한다.
   * clear는 배치 체인에 끼므로, 새 레인 init을 기다리는 동안 들어온 표본은 체인에서 clear 뒤에 이어 붙어
   * (해제된 이전 레인이 아니라) 새 레인이 준비된 뒤 새 레인에 적용된다.
   */
  clear(): Promise<void> {
    const run = this.chain.then(() => this.replaceLane());
    // clear가 실패해도(새 레인 init 실패 등) 뒤따르는 배치가 거부된 체인에 막혀 조용히 버려지지 않게 한다.
    // 실패 자체는 `run`을 돌려받는 호출자에게 그대로 전달된다.
    this.chain = run.catch(() => undefined);
    return run;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.detach) this.detach();
    this.detach = null;
    this.scheduler.stop();
    this.releaseLane();
  }

  /** 이전 레인을 해제하고 새 레인을 init한 뒤 세션 상태를 초기화한다. */
  private async replaceLane(): Promise<void> {
    if (this.disposed) return;
    this.releaseLane();
    const lane = this.opts.createLane();
    await LiveStrokeSession.initLane(lane, this.opts);
    if (this.disposed) {
      // init을 기다리는 사이 dispose()가 불렸다. dispose()는 이미 해제된 이전 레인만 정리했으므로
      // 새로 만든 레인(GPU 버퍼·텍스처 등)은 여기서 해제하지 않으면 아무도 해제하지 않는다.
      lane.dispose();
      return;
    }
    this.lane = lane;
    this.laneReleased = false;
    this.inStroke = false;
    this.strokeSamples = [];
    this.frames = [];
  }

  /** 현재 레인을 한 번만 해제한다. */
  private releaseLane(): void {
    if (this.laneReleased) return;
    this.laneReleased = true;
    this.lane.dispose();
  }

  private onSamples(raw: RawSample[]): void {
    if (this.disposed) return;
    const { canonical, predicted } = splitPredicted(raw);
    if (this.opts.onPreview) {
      this.opts.onPreview(predicted.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure })));
    }
    if (canonical.length > 0) {
      if (this.opts.onCanonical) this.opts.onCanonical(canonical);
      this.scheduler.enqueue(canonical);
    }
  }

  private enqueueBatch(batch: RawSample[]): void {
    this.chain = this.chain.then(() => this.processBatch(batch));
  }

  private async processBatch(batch: RawSample[]): Promise<void> {
    if (this.disposed) return;
    let start = 0;
    while (start < batch.length) {
      let end = batch.length;
      for (let i = start; i < batch.length; i += 1) {
        if (batch[i]?.phase === "up") {
          end = i + 1;
          break;
        }
      }
      try {
        await this.processStrokePart(batch.slice(start, end));
      } catch (error) {
        this.inStroke = false;
        this.strokeSamples = [];
        this.frames = [];
        if (this.opts.onError) this.opts.onError(error);
        else throw error;
      }
      start = end;
    }
  }

  private async processStrokePart(part: RawSample[]): Promise<void> {
    let samples = part;
    if (!this.inStroke) {
      // 획 밖에서 들어온 move 잔여는 폐기하고 down부터 받는다.
      const downIdx = samples.findIndex((s) => s.phase === "down");
      if (downIdx < 0) return;
      samples = samples.slice(downIdx);
      this.strokeSeed = this.opts.seed + this.strokeCount;
      this.lane.beginStroke(this.opts.program, this.strokeSeed);
      this.inStroke = true;
      this.strokeSamples = [];
      this.frames = [];
    }
    if (samples.length === 0) return;
    const receipt = this.lane.addSamples(samples);
    this.frames.push(receipt);
    for (const s of samples) this.strokeSamples.push(s);
    if (this.opts.onFrame) this.opts.onFrame(receipt);
    const last = samples[samples.length - 1];
    if (last && last.phase === "up") await this.finishStroke();
  }

  private async finishStroke(): Promise<void> {
    this.inStroke = false;
    this.strokeCount += 1;
    const receipt = await this.lane.endStroke();
    const image = await this.lane.readback();
    const linear = await this.lane.readbackLinear();
    if (this.opts.onPreview) this.opts.onPreview([]);
    const result: LiveStrokeResult = {
      image,
      linear,
      receipt,
      frames: this.frames,
      samples: this.strokeSamples,
      seed: this.strokeSeed,
    };
    this.strokeSamples = [];
    this.frames = [];
    if (this.opts.onStrokeEnd) this.opts.onStrokeEnd(result);
  }
}
