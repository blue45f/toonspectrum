// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  BGM_CROSSFADE_SECONDS,
  BGM_DEFAULT_VOLUME,
  BGM_MAX_VOLUME,
  BGM_MIN_VOLUME,
  BGM_MOODS,
  BGM_PRESETS,
  clampBgmVolume,
  degreeToMidi,
  midiToFreq,
  moodForPath,
  readBgmPreferences,
  writeBgmEnabled,
  writeBgmVolume,
} from "./bgm-engine";
import { getBgmLabels } from "./bgm-labels";

beforeEach(() => {
  window.localStorage.clear();
});

describe("moodForPath", () => {
  it("홈 경로를 home 무드로 매핑한다", () => {
    expect(moodForPath("/")).toBe("home");
    expect(moodForPath("/home")).toBe("home");
  });

  it("스튜디오 캔버스를 draw 무드로 매핑한다", () => {
    expect(moodForPath("/studio/canvas")).toBe("draw");
  });

  it("스튜디오 일반 경로를 studio 무드로 매핑한다", () => {
    expect(moodForPath("/studio")).toBe("studio");
    expect(moodForPath("/studio/assets/brushes/new")).toBe("studio");
  });

  it("허브/가상공간 경로를 virtual 무드로 매핑한다", () => {
    expect(moodForPath("/hub")).toBe("virtual");
    expect(moodForPath("/team")).toBe("virtual");
    expect(moodForPath("/team/lounge")).toBe("virtual");
  });

  it("요금제를 pricing 무드로 매핑한다", () => {
    expect(moodForPath("/pricing")).toBe("pricing");
    expect(moodForPath("/market/checkout/order-1")).toBe("pricing");
  });

  it("리서치/소재 경로를 material 무드로 매핑한다", () => {
    expect(moodForPath("/research/material-assets")).toBe("material");
    expect(moodForPath("/research/open-data")).toBe("material");
    expect(moodForPath("/market")).toBe("material");
    expect(moodForPath("/market/browse")).toBe("material");
  });

  it("학습 경로를 studio 무드로 매핑한다", () => {
    expect(moodForPath("/learn")).toBe("studio");
    expect(moodForPath("/learn/recipes")).toBe("studio");
  });

  it("협업 경로를 virtual 무드로 매핑한다", () => {
    expect(moodForPath("/collaborate")).toBe("virtual");
    expect(moodForPath("/collaborate/gallery")).toBe("virtual");
  });

  it("알 수 없는 경로는 home으로 폴백한다", () => {
    expect(moodForPath("/some/unknown/page")).toBe("home");
  });

  it("대소문자를 구분하지 않는다", () => {
    expect(moodForPath("/STUDIO/CANVAS")).toBe("draw");
    expect(moodForPath("/Pricing")).toBe("pricing");
  });
});

describe("degreeToMidi", () => {
  it("스케일 degree를 MIDI 번호로 변환한다", () => {
    // C 메이저 펜타토닉 [0,2,4,7,9], root 60(C4)
    expect(degreeToMidi(60, [0, 2, 4, 7, 9], 0)).toBe(60);
    expect(degreeToMidi(60, [0, 2, 4, 7, 9], 2)).toBe(64);
    expect(degreeToMidi(60, [0, 2, 4, 7, 9], 4)).toBe(69);
  });

  it("스케일을 넘어가면 옥타브를 올린다", () => {
    expect(degreeToMidi(60, [0, 2, 4, 7, 9], 5)).toBe(72);
    expect(degreeToMidi(60, [0, 2, 4, 7, 9], 7)).toBe(76);
  });
});

describe("midiToFreq", () => {
  it("A4(69)는 440Hz다", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
  });

  it("C4(60)는 약 261.63Hz다", () => {
    expect(midiToFreq(60)).toBeCloseTo(261.63, 2);
  });

  it("옥타브가 오르면 주파수가 2배가 된다", () => {
    expect(midiToFreq(81)).toBeCloseTo(midiToFreq(69) * 2, 5);
  });
});

describe("BGM_PRESETS", () => {
  it("모든 무드에 프리셋이 있다", () => {
    for (const mood of BGM_MOODS) {
      expect(BGM_PRESETS[mood]).toBeDefined();
      expect(BGM_PRESETS[mood].mood).toBe(mood);
    }
  });

  it("프리셋 값이 유효 범위 안에 있다", () => {
    for (const mood of BGM_MOODS) {
      const preset = BGM_PRESETS[mood];
      expect(preset.scale.length).toBeGreaterThan(0);
      expect(preset.chords.length).toBeGreaterThan(0);
      expect(preset.chordSeconds).toBeGreaterThan(0);
      expect(preset.bpm).toBeGreaterThan(0);
      expect(preset.cutoffHz).toBeGreaterThan(0);
      expect(preset.reverbMix).toBeGreaterThanOrEqual(0);
      expect(preset.reverbMix).toBeLessThanOrEqual(1);
      expect(preset.level).toBeGreaterThan(0);
      expect(preset.level).toBeLessThanOrEqual(1);
      // 코드 degree가 스케일 2옥타브 안에 들어간다
      for (const chord of preset.chords) {
        expect(chord.length).toBeGreaterThan(0);
        for (const degree of chord) {
          expect(degree).toBeGreaterThanOrEqual(0);
          expect(degree).toBeLessThan(preset.scale.length * 2);
          // 변환된 주파수가 가청 범위다
          const freq = midiToFreq(degreeToMidi(preset.rootMidi, preset.scale, degree));
          expect(freq).toBeGreaterThan(40);
          expect(freq).toBeLessThan(5000);
        }
      }
    }
  });

  it("크로스페이드 시간이 2초다", () => {
    expect(BGM_CROSSFADE_SECONDS).toBe(2);
  });
});

describe("clampBgmVolume", () => {
  it("범위를 벗어나면 제한한다", () => {
    expect(clampBgmVolume(-1)).toBe(BGM_MIN_VOLUME);
    expect(clampBgmVolume(2)).toBe(BGM_MAX_VOLUME);
    expect(clampBgmVolume(0.5)).toBe(0.5);
  });

  it("숫자가 아니면 기본 볼륨을 반환한다", () => {
    expect(clampBgmVolume(Number.NaN)).toBe(BGM_DEFAULT_VOLUME);
  });
});

describe("BGM 환경설정 저장", () => {
  it("저장된 값이 없으면 기본값을 반환한다", () => {
    expect(readBgmPreferences().enabled).toBe(true);
    expect(readBgmPreferences().volume).toBe(BGM_DEFAULT_VOLUME);
  });

  it("enabled를 저장하고 읽는다", () => {
    writeBgmEnabled(false);
    expect(readBgmPreferences().enabled).toBe(false);
    writeBgmEnabled(true);
    expect(readBgmPreferences().enabled).toBe(true);
  });

  it("volume을 저장하고 읽는다", () => {
    writeBgmVolume(0.3);
    expect(readBgmPreferences().volume).toBeCloseTo(0.3, 5);
    writeBgmVolume(99);
    expect(readBgmPreferences().volume).toBe(BGM_MAX_VOLUME);
  });
});

describe("getBgmLabels", () => {
  it("한국어 라벨을 반환한다", () => {
    const labels = getBgmLabels("ko-KR");
    expect(labels.moodName("home")).toBe("환영");
    expect(labels.enable).toContain("배경음악");
  });

  it("영어 라벨을 반환한다", () => {
    const labels = getBgmLabels("en-US");
    expect(labels.moodName("home")).toBe("Welcome");
    expect(labels.enable).toContain("background music");
  });

  it("모든 무드에 이름과 설명이 있다", () => {
    for (const lang of ["ko", "en"]) {
      const labels = getBgmLabels(lang);
      for (const mood of BGM_MOODS) {
        expect(labels.moodName(mood).length).toBeGreaterThan(0);
        expect(labels.moodDescription(mood).length).toBeGreaterThan(0);
      }
    }
  });
});
