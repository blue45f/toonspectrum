import { describe, expect, it } from "vitest";

import {
  getMoodPalette,
  guessMoodFromText,
  AI_MOOD_PALETTES,
} from "./ai-mood-palettes";

describe("AI_MOOD_PALETTES", () => {
  it("8개 분위기 팔레트가 있다", () => {
    expect(AI_MOOD_PALETTES).toHaveLength(8);
  });

  it("각 팔레트는 6개 색상을 가진다", () => {
    for (const palette of AI_MOOD_PALETTES) {
      expect(palette.colors).toHaveLength(6);
      for (const color of palette.colors) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("ko/en 라벨이 모두 있다", () => {
    for (const palette of AI_MOOD_PALETTES) {
      expect(palette.label.ko.length).toBeGreaterThan(0);
      expect(palette.label.en.length).toBeGreaterThan(0);
    }
  });
});

describe("getMoodPalette", () => {
  it("로맨스 팔레트를 반환한다", () => {
    expect(getMoodPalette("romance").mood).toBe("romance");
  });

  it("호러 팔레트는 어둡다", () => {
    const horror = getMoodPalette("horror");
    // 배경색이 어두운지 확인
    expect(horror.colors[4]).toBe("#26262e");
  });
});

describe("guessMoodFromText", () => {
  it("사랑 키워드에서 로맨스를 추정한다", () => {
    expect(guessMoodFromText("사랑해, 고백할게")).toBe("romance");
  });

  it("마법 키워드에서 판타지를 추정한다", () => {
    expect(guessMoodFromText("마법의 검으로 드래곤을 무찔렀다")).toBe("fantasy");
  });

  it("키워드가 없으면 일상을 반환한다", () => {
    expect(guessMoodFromText("오늘 날씨가 좋네요")).toBe("daily");
  });

  it("영어 키워드도 인식한다", () => {
    expect(guessMoodFromText("the ghost is scary")).toBe("horror");
  });
});
