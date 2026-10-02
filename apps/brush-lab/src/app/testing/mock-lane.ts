import { InvalidStateError, LaneUnavailableError } from "../../engine/core/errors";
import { emptyLaneStats, supportedReport, unavailableReport } from "../../lanes/lane";

import type { LaneReasonCode } from "../../engine/core/errors";
import type { LabImage, RawSample } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneDescriptor,
  LaneEnvironment,
  LaneId,
  LaneInit,
  LaneKind,
  LaneStatus,
  LaneStats,
  StrokeReceipt,
} from "../../lanes/lane";

/**
 * 테스트용 모의 레인. 표본 위치에 압력·팁 크기 비례 정사각형을 찍는 결정적 래스터라이저로,
 * 레인 호출 순서(probe → init → beginStroke → addSamples* → endStroke → readback)를 기록하고
 * 계약 위반(init 전 beginStroke 등)은 `InvalidStateError`로 던진다.
 */

export interface MockLaneOptions {
  id?: LaneId;
  label?: string;
  kind?: LaneKind;
  status?: LaneStatus;
  /** probe 결과. 기본 supported. */
  probe?: LaneCapabilityReport;
  /** init에서 던질 사유 코드(설정 시 LaneUnavailableError). */
  failInit?: LaneReasonCode;
  /** 색(sRGB 0..255). 기본 검정. */
  color?: [number, number, number];
  /** 선형 버퍼를 제공하지 않는 레인(canvas2d 모의)이면 true. */
  noLinear?: boolean;
}

export interface MockLane extends BrushEngineLane {
  calls: string[];
}

export function createMockLane(opts: MockLaneOptions = {}): MockLane {
  const id = opts.id ?? "cpu-reference";
  const color = opts.color ?? [0, 0, 0];
  let init: LaneInit | null = null;
  let image: Uint8ClampedArray | null = null;
  let program: BrushProgram | null = null;
  let inStroke = false;
  let frameIndex = 0;
  let strokeDabs = 0;
  let frameTimes: number[] = [];
  let submits = 0;
  const stats: LaneStats = emptyLaneStats();
  const calls: string[] = [];

  const paint = (s: RawSample): void => {
    if (!init || !image || !program) return;
    const r = Math.max(1, Math.round((program.tip.sizePx / 2) * Math.max(0.05, s.pressure)));
    const x0 = Math.max(0, Math.floor(s.x - r));
    const y0 = Math.max(0, Math.floor(s.y - r));
    const x1 = Math.min(init.width - 1, Math.ceil(s.x + r));
    const y1 = Math.min(init.height - 1, Math.ceil(s.y + r));
    const alpha = Math.round(255 * program.deposition.flow);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const o = (y * init.width + x) * 4;
        const a = Math.min(255, (image[o + 3] ?? 0) + alpha);
        image[o] = color[0];
        image[o + 1] = color[1];
        image[o + 2] = color[2];
        image[o + 3] = a;
      }
    }
  };

  const lane: MockLane = {
    id,
    label: opts.label ?? `모의 레인 ${id}`,
    kind: opts.kind ?? "baseline",
    status: opts.status ?? "implemented",
    engineVersion: "mock-0.0.1",
    calls,
    async probe(): Promise<LaneCapabilityReport> {
      calls.push("probe");
      return opts.probe ?? supportedReport(id);
    },
    async init(_env: LaneEnvironment, config: LaneInit): Promise<void> {
      calls.push("init");
      if (opts.failInit) {
        throw new LaneUnavailableError(opts.failInit, `모의 레인 init 실패: ${opts.failInit}`);
      }
      init = config;
      image = new Uint8ClampedArray(config.width * config.height * 4);
    },
    beginStroke(p: BrushProgram, _seed: number): void {
      calls.push("beginStroke");
      if (!init) throw new InvalidStateError("init 전에 beginStroke를 호출했다");
      program = p;
      inStroke = true;
      frameIndex = 0;
      strokeDabs = 0;
      frameTimes = [];
    },
    addSamples(samples: readonly RawSample[]): DabBatchReceipt {
      calls.push("addSamples");
      if (!inStroke) throw new InvalidStateError("beginStroke 전에 addSamples를 호출했다");
      for (const s of samples) {
        if (s.source === "predicted") throw new InvalidStateError("예측 표본이 정본 스트림에 들어왔다");
        paint(s);
      }
      strokeDabs += samples.length;
      submits += 1;
      frameTimes.push(1.5);
      const receipt: DabBatchReceipt = {
        frameIndex,
        dabCount: samples.length,
        submitCount: 1,
        dispatchCount: 1,
        inputToSubmitMs: 0.5,
      };
      frameIndex += 1;
      return receipt;
    },
    async endStroke(): Promise<StrokeReceipt> {
      calls.push("endStroke");
      if (!inStroke) throw new InvalidStateError("beginStroke 전에 endStroke를 호출했다");
      inStroke = false;
      const receipt: StrokeReceipt = {
        dabCount: strokeDabs,
        submitCount: frameTimes.length,
        gpuTimeMs: null,
        timingSource: "unavailable",
        frameTimesMs: frameTimes,
        overflowDabs: 0,
        poolTilesUsed: 0,
      };
      stats.strokes += 1;
      stats.dabs += strokeDabs;
      stats.submits = submits;
      stats.lastReceipt = receipt;
      return receipt;
    },
    async readback(): Promise<LabImage> {
      calls.push("readback");
      if (!init || !image) throw new InvalidStateError("init 전에 readback을 호출했다");
      const out = new Uint8ClampedArray(image.length);
      // 흰 바탕 위 straight alpha 합성 결과를 돌려준다.
      for (let i = 0; i < image.length; i += 4) {
        const a = (image[i + 3] ?? 0) / 255;
        out[i] = Math.round((image[i] ?? 0) * a + 255 * (1 - a));
        out[i + 1] = Math.round((image[i + 1] ?? 0) * a + 255 * (1 - a));
        out[i + 2] = Math.round((image[i + 2] ?? 0) * a + 255 * (1 - a));
        out[i + 3] = 255;
      }
      return { width: init.width, height: init.height, data: out };
    },
    async readbackLinear(): Promise<Float32Array | null> {
      calls.push("readbackLinear");
      if (opts.noLinear) return null;
      if (!init || !image) throw new InvalidStateError("init 전에 readbackLinear를 호출했다");
      const out = new Float32Array(image.length);
      for (let i = 0; i < image.length; i += 4) {
        const a = (image[i + 3] ?? 0) / 255;
        out[i] = ((image[i] ?? 0) / 255) * a;
        out[i + 1] = ((image[i + 1] ?? 0) / 255) * a;
        out[i + 2] = ((image[i + 2] ?? 0) / 255) * a;
        out[i + 3] = a;
      }
      return out;
    },
    stats(): LaneStats {
      return stats;
    },
    dispose(): void {
      calls.push("dispose");
      init = null;
      image = null;
      inStroke = false;
    },
  };
  return lane;
}

/** 모의 레인 디스크립터. `create`는 호출마다 새 모의 레인을 만든다. */
export function mockDescriptor(opts: MockLaneOptions & { lanes?: MockLane[] } = {}): LaneDescriptor {
  const id = opts.id ?? "cpu-reference";
  return {
    id,
    label: opts.label ?? `모의 레인 ${id}`,
    kind: opts.kind ?? "baseline",
    status: opts.status ?? "implemented",
    nodeVerification: "모의",
    browserVerification: "없음",
    create: () => {
      const lane = createMockLane(opts);
      opts.lanes?.push(lane);
      return lane;
    },
  };
}

/** unavailable 레인 디스크립터(probe가 사유 코드를 돌려준다). */
export function unavailableDescriptor(id: LaneId, reasons: LaneReasonCode[], label?: string): LaneDescriptor {
  return mockDescriptor({ id, label: label ?? `모의 레인 ${id}`, kind: "candidate", status: "browser-verification-required", probe: unavailableReport(id, reasons) });
}

/** 테스트용 레인 환경(가짜 시계). */
export function mockEnvironment(): LaneEnvironment {
  let t = 0;
  return {
    gpu: null,
    clock: {
      now: () => {
        t += 1;
        return t;
      },
    },
    userAgent: "vitest/jsdom",
  };
}
