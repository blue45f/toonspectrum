import { describe, expect, it } from "vitest";
import {
  advanceStudioLipsync,
  createStudioLipsyncState,
  studioLipsyncMouthForIntensity,
  STUDIO_LIPSYNC_SPEAKING_THRESHOLD,
  STUDIO_LIPSYNC_WIDE_THRESHOLD,
} from "./studio-virtual-space-lipsync";

describe("advanceStudioLipsync", () => {
  it("조용한 레벨에서는 입을 닫고 발화로 보지 않는다", () => {
    const sample = advanceStudioLipsync(createStudioLipsyncState(), 0.01, 1_000);
    expect(sample.mouth).toBe("closed");
    expect(sample.speaking).toBe(false);
    expect(sample.level).toBeCloseTo(0.01);
  });

  it("큰 레벨에서는 즉시 wide로 열린다 (어택 즉시)", () => {
    const sample = advanceStudioLipsync(createStudioLipsyncState(), 0.9, 1_000);
    expect(sample.mouth).toBe("wide");
    expect(sample.speaking).toBe(true);
  });

  it("중간 레벨 발화 중에는 85ms 위상으로 open과 closed를 번갈아 립 플랩한다", () => {
    const at0 = advanceStudioLipsync(createStudioLipsyncState(), 0.2, 0);
    const at85 = advanceStudioLipsync(at0.state, 0.2, 85);
    expect(at0.mouth).toBe("open");
    expect(at85.mouth).toBe("closed");
    expect(at85.speaking).toBe(true);
  });

  it("말이 끝나면 반감기로 감쇠해 잠시 머물다 닫힌다 (릴리스)", () => {
    const loud = advanceStudioLipsync(createStudioLipsyncState(), 1, 0);
    const after120 = advanceStudioLipsync(loud.state, 0, 120);
    expect(after120.level).toBeCloseTo(0.5, 1);
    expect(after120.speaking).toBe(true);
    const after600 = advanceStudioLipsync(advanceStudioLipsync(after120.state, 0, 370).state, 0, 620);
    expect(after600.level).toBeLessThan(STUDIO_LIPSYNC_SPEAKING_THRESHOLD);
    expect(after600.mouth).toBe("closed");
    expect(after600.speaking).toBe(false);
  });

  it("오래된 샘플(1초 초과)은 발화로 취급하지 않는다", () => {
    const sample = advanceStudioLipsync(createStudioLipsyncState(), 0.9, 5_000, { sampledAt: 3_000 });
    expect(sample.mouth).toBe("closed");
    expect(sample.speaking).toBe(false);
  });

  it("NaN·범위 밖 레벨과 음수 시각을 안전하게 처리한다", () => {
    const nan = advanceStudioLipsync(createStudioLipsyncState(), Number.NaN, 100);
    expect(nan.mouth).toBe("closed");
    const over = advanceStudioLipsync(createStudioLipsyncState(), 7, 100);
    expect(over.level).toBe(1);
    expect(over.mouth).toBe("wide");
    const negative = advanceStudioLipsync(createStudioLipsyncState(), 0.9, -50);
    expect(negative.state.updatedAt).toBe(0);
    expect(negative.mouth).toBe("wide");
  });

  it("reduced motion이면 플랩 없이 open으로 고정한다", () => {
    const sample = advanceStudioLipsync(createStudioLipsyncState(), 0.2, 85, { reducedMotion: true });
    expect(sample.mouth).toBe("open");
    const wide = advanceStudioLipsync(createStudioLipsyncState(), STUDIO_LIPSYNC_WIDE_THRESHOLD + 0.1, 85, { reducedMotion: true });
    expect(wide.mouth).toBe("wide");
  });

  it("상태가 immutable이고 이전 상태를 바꾸지 않는다", () => {
    const initial = createStudioLipsyncState();
    const next = advanceStudioLipsync(initial, 0.9, 100);
    expect(initial.smoothed).toBe(0);
    expect(Object.isFrozen(next.state)).toBe(true);
    expect(() => { (next.state as { smoothed: number }).smoothed = 0; }).toThrow();
  });
});

describe("studioLipsyncMouthForIntensity", () => {
  it("강도 0이면 closed, 높은 강도면 wide, 중간이면 플랩한다", () => {
    expect(studioLipsyncMouthForIntensity(0, 0)).toBe("closed");
    expect(studioLipsyncMouthForIntensity(1, 0)).toBe("wide");
    expect(studioLipsyncMouthForIntensity(0.1, 0)).toBe("open");
    expect(studioLipsyncMouthForIntensity(0.1, 0, true)).toBe("open");
  });
});
