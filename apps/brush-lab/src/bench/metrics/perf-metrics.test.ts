import { describe, expect, it } from "vitest";

import { fakeReceipt } from "../testing/synthetic-images";

import { dabsPerSecond, percentiles, perfSampleFromReceipts, summarizePerf } from "./perf-metrics";

describe("성능 지표", () => {
  it("dabs/s와 백분위수", () => {
    expect(dabsPerSecond(1000, 500)).toBe(2000);
    expect(dabsPerSecond(1000, 0)).toBe(0);
    expect(percentiles([1, 2, 3, 4, 5], [50, 95])).toEqual({ p50: 3, p95: 4.8 });
  });

  it("summarizePerf: 프레임 p50/p95/max, 입력→제출 null 필터, elapsed 기본값은 프레임 합", () => {
    const s = summarizePerf({
      frameTimesMs: [1, 2, 3, 4],
      dabCount: 200,
      submitCount: 4,
      gpuTimeMs: null,
      memoryBytes: null,
      inputToSubmitMs: [1, null, 3, Number.NaN],
    });
    expect(s.frameCount).toBe(4);
    expect(s.frameP50Ms).toBe(2.5);
    expect(s.frameMaxMs).toBe(4);
    expect(s.totalFrameMs).toBe(10);
    expect(s.elapsedMs).toBe(10);
    expect(s.dabsPerSecond).toBe(20000);
    expect(s.inputToSubmitP50Ms).toBe(2);
    expect(s.inputToSubmitP95Ms).toBeCloseTo(2.9, 9);
    expect(s.gpuTimeMs).toBeNull();
    const none = summarizePerf({ frameTimesMs: [], dabCount: 0, submitCount: 0, gpuTimeMs: 2, memoryBytes: 1024, elapsedMs: 5 });
    expect(none.inputToSubmitP50Ms).toBeNull();
    expect(none.elapsedMs).toBe(5);
    expect(none.gpuTimeMs).toBe(2);
    expect(none.memoryBytes).toBe(1024);
  });

  it("perfSampleFromReceipts는 영수증을 그대로 옮긴다", () => {
    const sample = perfSampleFromReceipts(
      fakeReceipt({ gpuTimeMs: 7 }),
      [
        { frameIndex: 0, dabCount: 1, submitCount: 1, dispatchCount: 1, inputToSubmitMs: 0.5 },
        { frameIndex: 1, dabCount: 1, submitCount: 1, dispatchCount: 1, inputToSubmitMs: null },
      ],
      42,
      null,
    );
    expect(sample.frameTimesMs).toEqual([1, 2, 3, 4]);
    expect(sample.dabCount).toBe(100);
    expect(sample.gpuTimeMs).toBe(7);
    expect(sample.inputToSubmitMs).toEqual([0.5, null]);
    expect(sample.elapsedMs).toBe(42);
  });
});
