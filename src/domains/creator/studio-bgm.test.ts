import { describe, it, expect } from "vitest";

import { BGM_MOODS, buildProgression, findBgmMood, noteToFreq } from "./studio-bgm";

describe("BGM_MOODS 데이터", () => {
  it("무드 id는 유일하고 음계·템포가 유효하다", () => {
    const ids = BGM_MOODS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(BGM_MOODS.length).toBeGreaterThanOrEqual(6);
    for (const m of BGM_MOODS) {
      expect(m.scale.length).toBeGreaterThan(0);
      expect(m.scale[0]).toBe(0); // 루트 포함
      expect(m.tempo).toBeGreaterThan(0);
      expect(m.rootFreq).toBeGreaterThan(0);
    }
  });

  it("findBgmMood", () => {
    expect(findBgmMood("calm")?.label).toBe("잔잔");
    expect(findBgmMood("nope")).toBeUndefined();
  });
});

describe("noteToFreq", () => {
  it("유니즌은 그대로, 한 옥타브는 2배", () => {
    expect(noteToFreq(220, 0)).toBeCloseTo(220, 5);
    expect(noteToFreq(220, 12)).toBeCloseTo(440, 5);
    expect(noteToFreq(440, -12)).toBeCloseTo(220, 5);
  });

  it("완전5도(7반음)는 약 1.5배", () => {
    expect(noteToFreq(100, 7) / 100).toBeCloseTo(1.4983, 3);
  });
});

describe("buildProgression", () => {
  it("마디 수만큼 스텝을 만들고 박자가 4씩 증가한다", () => {
    const mood = BGM_MOODS[0];
    const steps = buildProgression(mood, 4);
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.atBeat)).toEqual([0, 4, 8, 12]);
    for (const s of steps) {
      expect(s.semitones).toHaveLength(3); // 트라이어드
      expect(s.beats).toBe(4);
      for (const st of s.semitones) expect(Number.isFinite(st)).toBe(true);
    }
  });

  it("결정적 — 같은 무드·마디면 항상 같은 진행", () => {
    const mood = BGM_MOODS[2];
    expect(buildProgression(mood, 8)).toEqual(buildProgression(mood, 8));
  });

  it("0마디는 빈 진행", () => {
    expect(buildProgression(BGM_MOODS[0], 0)).toEqual([]);
  });
});
