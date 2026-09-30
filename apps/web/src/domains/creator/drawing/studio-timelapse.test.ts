import { describe, expect, it } from "vitest";

import {
  TIMELAPSE_DEFAULT_MAX_DURATION_MS,
  TIMELAPSE_PLAYBACK_RATES,
  advanceTimelapsePlayback,
  createTimelapseSession,
  endTimelapseSession,
  estimateTimelapseExportSize,
  formatBytes,
  formatTimelapseTime,
  getMediaRecorderExportGuide,
  getTimelapseDurationMs,
  getTimelapseProgress,
  getTimelapseStats,
  getVisibleStrokes,
  recordStroke,
  validateTimelapseStroke,
  type TimelapseStroke,
} from "./studio-timelapse";

function makeStroke(
  id: string,
  startedAtMs: number,
  sampleCount: number,
  stepMs = 100,
): TimelapseStroke {
  const samples = Array.from({ length: sampleCount }, (_, i) => ({
    timeMs: startedAtMs + i * stepMs,
    x: i * 10,
    y: i * 5,
    pressure: 0.5,
  }));
  return {
    id,
    color: "#1a1a2e",
    width: 4,
    startedAtMs,
    endedAtMs: startedAtMs + (sampleCount - 1) * stepMs,
    samples,
  };
}

describe("createTimelapseSession", () => {
  it("기본 최대 5분", () => {
    expect(createTimelapseSession().maxDurationMs).toBe(
      TIMELAPSE_DEFAULT_MAX_DURATION_MS,
    );
    expect(TIMELAPSE_DEFAULT_MAX_DURATION_MS).toBe(5 * 60 * 1000);
  });

  it("재생 속도 1x/2x/4x/8x", () => {
    expect([...TIMELAPSE_PLAYBACK_RATES]).toEqual([1, 2, 4, 8]);
  });
});

describe("recordStroke", () => {
  it("스트로크를 기록한다 (불변 스냅샷)", () => {
    const s0 = createTimelapseSession();
    const s1 = recordStroke(s0, makeStroke("a", 0, 5));
    expect(s1.strokes).toHaveLength(1);
    expect(s0.strokes).toHaveLength(0);
  });

  it("유효하지 않은 스트로크는 무시된다", () => {
    const s0 = createTimelapseSession();
    const bad = { ...makeStroke("b", 0, 3), width: -1 };
    expect(recordStroke(s0, bad).strokes).toHaveLength(0);
  });

  it("최대 길이를 초과한 샘플은 잘린다", () => {
    const s0 = createTimelapseSession({ maxDurationMs: 10_000 });
    const s1 = recordStroke(s0, makeStroke("c", 9000, 50, 100)); // ~13900ms
    expect(s1.strokes).toHaveLength(1);
    const last = s1.strokes[0].samples[s1.strokes[0].samples.length - 1];
    expect(last.timeMs).toBeLessThanOrEqual(10_000);
  });

  it("종료된 세션에는 기록되지 않는다", () => {
    const s0 = endTimelapseSession(createTimelapseSession(), 1000);
    expect(recordStroke(s0, makeStroke("d", 2000, 3)).strokes).toHaveLength(0);
  });
});

describe("validateTimelapseStroke", () => {
  it("샘플 시각이 단조 증가하지 않으면 실패", () => {
    const stroke = makeStroke("e", 0, 3);
    const bad = {
      ...stroke,
      samples: [
        { timeMs: 200, x: 0, y: 0 },
        { timeMs: 100, x: 1, y: 1 },
      ],
    };
    expect(validateTimelapseStroke(bad).ok).toBe(false);
  });

  it("빈 id·빈 샘플은 실패", () => {
    expect(validateTimelapseStroke({ ...makeStroke("f", 0, 3), id: "" }).ok).toBe(false);
    expect(validateTimelapseStroke({ ...makeStroke("g", 0, 3), samples: [] }).ok).toBe(false);
  });
});

describe("getTimelapseDurationMs", () => {
  it("종료 전에는 마지막 스트로크 종료 시각", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 5)); // 400ms
    s = recordStroke(s, makeStroke("b", 1000, 3)); // 1200ms
    expect(getTimelapseDurationMs(s)).toBe(1200);
  });

  it("종료 후에는 종료 시각", () => {
    const s = endTimelapseSession(recordStroke(createTimelapseSession(), makeStroke("a", 0, 5)), 3000);
    expect(getTimelapseDurationMs(s)).toBe(3000);
  });
});

describe("getVisibleStrokes (스크럽/시크)", () => {
  it("재생 시각 이전 스트로크만 보인다", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 5)); // 0~400ms
    s = recordStroke(s, makeStroke("b", 1000, 5)); // 1000~1400ms
    expect(getVisibleStrokes(s, 500).map((x) => x.id)).toEqual(["a"]);
    expect(getVisibleStrokes(s, 2000).map((x) => x.id)).toEqual(["a", "b"]);
    expect(getVisibleStrokes(s, -100)).toHaveLength(0);
  });

  it("진행 중인 스트로크는 시각까지 샘플이 잘린다", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 10, 100)); // 0~900ms
    const visible = getVisibleStrokes(s, 250);
    expect(visible).toHaveLength(1);
    expect(visible[0].samples.length).toBe(3); // 0,100,200
    expect(visible[0].endedAtMs).toBe(250);
  });
});

describe("getTimelapseProgress", () => {
  it("진행률 0..1", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 5)); // 400ms
    expect(getTimelapseProgress(s, 200)).toBeCloseTo(0.5, 5);
    expect(getTimelapseProgress(s, 9999)).toBe(1);
    expect(getTimelapseProgress(createTimelapseSession(), 100)).toBe(0);
  });
});

describe("advanceTimelapsePlayback", () => {
  it("rate 배율로 재생 위치가 전진한다", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 100, 100)); // 9900ms
    const tick = advanceTimelapsePlayback(s, 0, 4, 250);
    expect(tick.playbackTimeMs).toBe(1000);
    expect(tick.finished).toBe(false);
  });

  it("끝에 도달하면 finished", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 5)); // 400ms
    const tick = advanceTimelapsePlayback(s, 300, 8, 250);
    expect(tick.playbackTimeMs).toBe(400);
    expect(tick.finished).toBe(true);
  });
});

describe("estimateTimelapseExportSize", () => {
  it("비트레이트 기반 추정", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 600, 100)); // 59900ms ≈ 60초
    const est = estimateTimelapseExportSize(s, { fps: 30 });
    expect(est.frameCount).toBeGreaterThan(1700);
    // 60초 × 2.5Mbps / 8 ≈ 18.75MB
    expect(est.bytes).toBeGreaterThan(15 * 1024 * 1024);
    expect(est.bytes).toBeLessThan(25 * 1024 * 1024);
    expect(est.humanReadable).toMatch(/MB/);
  });
});

describe("formatBytes / formatTimelapseTime", () => {
  it("바이트 표기", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("시각 표기", () => {
    expect(formatTimelapseTime(0)).toBe("00:00.000");
    expect(formatTimelapseTime(61500)).toBe("01:01.500");
  });
});

describe("getTimelapseStats", () => {
  it("스트로크·샘플 수 집계", () => {
    let s = createTimelapseSession();
    s = recordStroke(s, makeStroke("a", 0, 5));
    s = recordStroke(s, makeStroke("b", 1000, 7));
    const stats = getTimelapseStats(s);
    expect(stats.strokeCount).toBe(2);
    expect(stats.sampleCount).toBe(12);
    expect(stats.isEnded).toBe(false);
  });
});

describe("getMediaRecorderExportGuide", () => {
  it("한/영 가이드가 단계별로 있다", () => {
    const ko = getMediaRecorderExportGuide("ko");
    const en = getMediaRecorderExportGuide("en");
    expect(ko.length).toBeGreaterThanOrEqual(5);
    expect(en.length).toBeGreaterThanOrEqual(5);
    expect(ko.join(" ")).toContain("MediaRecorder");
    expect(en.join(" ")).toContain("captureStream");
  });
});
