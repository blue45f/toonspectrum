import { describe, expect, it } from "vitest";
import {
  analyzeStudioStuckDetector,
  createStudioStuckDetectorState,
  recordStudioStuckSample,
  resetStudioStuckDetectorState,
  StudioStuckSampler,
  type StudioStuckDetectorState,
  type StudioStuckSample,
} from "./studio-virtual-space-stuck-detector";

function stuckState(): StudioStuckDetectorState {
  let state = createStudioStuckDetectorState();
  // 입력은 계속 주는데 위치는 제자리 (벽에 낀 상황)
  for (let i = 0; i < 10; i += 1) {
    state = recordStudioStuckSample(state, {
      x: 100 + (i % 2) * 0.4,
      y: 200,
      inputX: 1,
      inputY: 0,
      blockedX: true,
      blockedY: false,
      at: i * 50,
    });
  }
  return state;
}

describe("끼임 감지", () => {
  it("입력 있는데 제자리면 끼임으로 판정한다", () => {
    const report = analyzeStudioStuckDetector(stuckState(), 450);
    expect(report.stuck).toBe(true);
    expect(report.escape).not.toBeNull();
  });

  it("X축으로 밀다 막히면 Y축 탈출을 제안한다", () => {
    const report = analyzeStudioStuckDetector(stuckState(), 450);
    expect(report.escape?.x).toBe(0);
    expect(report.escape?.y).toBe(1);
  });

  it("실제로 움직이고 있으면 끼임이 아니다", () => {
    let state = createStudioStuckDetectorState();
    for (let i = 0; i < 10; i += 1) {
      state = recordStudioStuckSample(state, {
        x: 100 + i * 10,
        y: 200,
        inputX: 1,
        inputY: 0,
        blockedX: false,
        blockedY: false,
        at: i * 50,
      });
    }
    const report = analyzeStudioStuckDetector(state, 450);
    expect(report.stuck).toBe(false);
    expect(report.escape).toBeNull();
  });

  it("입력이 없으면 끼임이 아니다", () => {
    let state = createStudioStuckDetectorState();
    for (let i = 0; i < 10; i += 1) {
      state = recordStudioStuckSample(state, {
        x: 100,
        y: 200,
        inputX: 0,
        inputY: 0,
        blockedX: false,
        blockedY: false,
        at: i * 50,
      });
    }
    const report = analyzeStudioStuckDetector(state, 450);
    expect(report.stuck).toBe(false);
  });

  it("샘플이 부족하면 끼임으로 판정하지 않는다", () => {
    let state = createStudioStuckDetectorState();
    state = recordStudioStuckSample(state, {
      x: 100, y: 200, inputX: 1, inputY: 0, blockedX: true, blockedY: true, at: 0,
    });
    const report = analyzeStudioStuckDetector(state, 0);
    expect(report.stuck).toBe(false);
  });

  it("오래된 샘플은 윈도우에서 제외된다", () => {
    let state = stuckState();
    // 1초 뒤에 조용히 서 있으면 끼임이 아니다
    for (let i = 0; i < 10; i += 1) {
      state = recordStudioStuckSample(state, {
        x: 100, y: 200, inputX: 0, inputY: 0, blockedX: false, blockedY: false, at: 1000 + i * 50,
      });
    }
    const report = analyzeStudioStuckDetector(state, 1450);
    expect(report.stuck).toBe(false);
  });

  it("리셋하면 샘플이 비워진다", () => {
    const state = resetStudioStuckDetectorState();
    expect(state.samples).toEqual([]);
    const report = analyzeStudioStuckDetector(state, 0);
    expect(report.stuck).toBe(false);
  });
});

describe("캔버스용 끼임 샘플러(링 버퍼)", () => {
  function scenario(seed: number): StudioStuckSample[] {
    const samples: StudioStuckSample[] = [];
    let x = 100, y = 200;
    for (let index = 0; index < 70; index += 1) {
      const pushing = (index + seed) % 23 < 17;
      const moving = (index * 7 + seed) % 11 === 0;
      if (moving) { x += 3; y -= 1; }
      samples.push({
        x: x + ((index + seed) % 2) * 0.3, y,
        inputX: pushing ? (seed % 2 ? -1 : 1) : 0, inputY: pushing ? ((seed + index) % 5 === 0 ? 0.6 : 0.1) : 0,
        blockedX: pushing && index % 4 !== 0, blockedY: false, at: index * 16,
      });
    }
    return samples;
  }

  it("순수 함수와 같은 판정·탈출 방향을 낸다", () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const sampler = new StudioStuckSampler();
      let state = createStudioStuckDetectorState();
      for (const sample of scenario(seed)) {
        state = recordStudioStuckSample(state, sample);
        sampler.record(sample.x, sample.y, sample.inputX, sample.inputY, sample.blockedX, sample.blockedY, sample.at);
        const report = analyzeStudioStuckDetector(state, sample.at);
        expect(sampler.analyze(sample.at)).toBe(report.stuck);
        if (report.stuck) expect({ ...sampler.escape }).toEqual(report.escape);
      }
    }
  });

  it("reset 뒤와 시간이 거꾸로 간 뒤에는 이전 샘플을 쓰지 않는다", () => {
    const sampler = new StudioStuckSampler();
    for (let index = 0; index < 10; index += 1) sampler.record(100, 200, 1, 0, true, false, index * 50);
    expect(sampler.analyze(450)).toBe(true);
    sampler.reset();
    expect(sampler.size).toBe(0);
    expect(sampler.analyze(450)).toBe(false);
    for (let index = 0; index < 10; index += 1) sampler.record(100, 200, 1, 0, true, false, 1_000 + index * 50);
    sampler.record(100, 200, 1, 0, true, false, 10);
    expect(sampler.size).toBe(1);
  });
});
