import { describe, it, expect } from "vitest";

import {
  emotionShapeParams,
  presetShapeParams,
  scaleShapeIntensity,
  emotionBubblePath,
  thoughtTailBubbles,
  type EmotionShapeParams,
} from "./studio-bubble-emotion-shapes";

const NEUTRAL: EmotionShapeParams = {
  spikiness: 0,
  wobble: 0,
  cloudiness: 0,
  dashed: false,
  strokeScale: 1,
  fontScale: 1,
  tailStyle: "solid",
  tremble: false,
};

describe("emotionShapeParams", () => {
  it("분노는 가시가 많고 글자가 크다", () => {
    const p = emotionShapeParams("rage-shout");
    expect(p.spikiness).toBeGreaterThan(0.5);
    expect(p.fontScale).toBeGreaterThan(1);
    expect(p.tailStyle).toBe("jagged");
    expect(p.tremble).toBe(true);
  });

  it("생각은 구름형이고 꼬리가 동그라미다", () => {
    const p = emotionShapeParams("thought-monologue");
    expect(p.cloudiness).toBe(1);
    expect(p.tailStyle).toBe("bubbles");
  });

  it("속삭임은 점선이고 글자가 작다", () => {
    const p = emotionShapeParams("whisper-secret");
    expect(p.dashed).toBe(true);
    expect(p.fontScale).toBeLessThan(1);
  });

  it("중립은 변형이 없다", () => {
    expect(emotionShapeParams("neutral-calm")).toEqual(NEUTRAL);
  });

  it("반환값은 복사본이다 (원본 테이블 불변)", () => {
    const p = emotionShapeParams("rage-shout");
    p.spikiness = 0;
    expect(emotionShapeParams("rage-shout").spikiness).toBeGreaterThan(0.5);
  });
});

describe("presetShapeParams", () => {
  it("프리셋이 감정으로 역매핑된다", () => {
    expect(presetShapeParams("shout-spiky")).toEqual(
      emotionShapeParams("rage-shout")
    );
    expect(presetShapeParams("cloud-thought")).toEqual(
      emotionShapeParams("thought-monologue")
    );
    expect(presetShapeParams("standard-oval")).toEqual(
      emotionShapeParams("neutral-calm")
    );
  });
});

describe("scaleShapeIntensity", () => {
  it("강도 0이면 중립이 된다", () => {
    const p = scaleShapeIntensity(emotionShapeParams("rage-shout"), 0);
    expect(p.spikiness).toBe(0);
    expect(p.fontScale).toBe(1);
    expect(p.tailStyle).toBe("solid");
  });

  it("강도 1이면 원본 그대로다", () => {
    const orig = emotionShapeParams("shock-gasp");
    const p = scaleShapeIntensity(orig, 1);
    expect(p).toEqual(orig);
  });

  it("강도가 범위를 벗어나면 클램프된다", () => {
    const p = scaleShapeIntensity(emotionShapeParams("rage-shout"), 5);
    expect(p.spikiness).toBe(emotionShapeParams("rage-shout").spikiness);
  });

  it("중간 강도는 보간된다", () => {
    const p = scaleShapeIntensity(emotionShapeParams("rage-shout"), 0.5);
    expect(p.spikiness).toBeGreaterThan(0);
    expect(p.spikiness).toBeLessThan(
      emotionShapeParams("rage-shout").spikiness
    );
  });
});

describe("emotionBubblePath", () => {
  it("중립이면 타원형 닫힌 path를 만든다", () => {
    const d = emotionBubblePath(200, 100, NEUTRAL);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith(" Z")).toBe(true);
    // 베지어 곡선 구간이 있다.
    expect(d).toContain(" C ");
  });

  it("가시 파라미터가 path를 바꾼다", () => {
    const plain = emotionBubblePath(200, 100, NEUTRAL);
    const spiky = emotionBubblePath(
      200,
      100,
      emotionShapeParams("rage-shout")
    );
    expect(plain).not.toBe(spiky);
  });

  it("같은 시드면 결정적이다", () => {
    const params = emotionShapeParams("shock-gasp");
    expect(emotionBubblePath(200, 100, params, 3)).toBe(
      emotionBubblePath(200, 100, params, 3)
    );
  });

  it("다른 시드면 위상이 달라진다", () => {
    const params = emotionShapeParams("shock-gasp");
    expect(emotionBubblePath(200, 100, params, 1)).not.toBe(
      emotionBubblePath(200, 100, params, 2)
    );
  });
});

describe("thoughtTailBubbles", () => {
  it("지정한 개수만큼 동그라미를 만든다", () => {
    const svg = thoughtTailBubbles(0, 0, 100, 0, 4);
    expect((svg.match(/<circle/g) ?? []).length).toBe(4);
  });

  it("화자에 가까워질수록 작아진다", () => {
    const svg = thoughtTailBubbles(0, 0, 100, 0, 3);
    const radii = [...svg.matchAll(/r="([\d.]+)"/g)].map((m) =>
      parseFloat(m[1])
    );
    expect(radii).toHaveLength(3);
    expect(radii[0]).toBeGreaterThan(radii[1]);
    expect(radii[1]).toBeGreaterThan(radii[2]);
  });
});
