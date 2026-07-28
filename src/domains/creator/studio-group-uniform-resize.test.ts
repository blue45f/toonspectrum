import { describe, expect, it } from "vitest";

import {
  planStudioGroupUniformResize,
  type StudioGroupUniformResizeBounds,
  type StudioGroupUniformResizeInput,
} from "./studio-group-uniform-resize";

import type { El } from "./studio-element-model";

const SOURCE: StudioGroupUniformResizeBounds = {
  x: 10,
  y: 20,
  width: 100,
  height: 50,
};
const DOUBLE: StudioGroupUniformResizeBounds = {
  x: 30,
  y: 40,
  width: 200,
  height: 100,
};

function image(id = "image"): Extract<El, { type: "image" }> {
  return {
    id,
    type: "image",
    src: "data:image/png;base64,AA==",
    x: 20,
    y: 25,
    width: 30,
    height: 20,
    rotation: 17,
    skewX: 8,
  };
}

function text(id = "text"): Extract<El, { type: "text" }> {
  return {
    id,
    type: "text",
    text: "대사",
    x: 50,
    y: 30,
    width: 40,
    fontSize: 12,
    fill: "#111111",
    rotation: -12,
  };
}

function draw(id = "draw"): Extract<El, { type: "draw" }> {
  return {
    id,
    type: "draw",
    points: [10, 20, 20, 25, 30, 30],
    stroke: "#111111",
    strokeWidth: 4,
  };
}

function plan(
  items: readonly El[],
  overrides: Partial<Omit<StudioGroupUniformResizeInput, "items">> = {}
): El[] {
  return planStudioGroupUniformResize({
    items,
    selectedIds: items.map((item) => item.id),
    sourceBounds: SOURCE,
    targetBounds: DOUBLE,
    isLocked: (item) => item.locked === true,
    ...overrides,
  });
}

describe("planStudioGroupUniformResize", () => {
  it("draw + text + image 혼합 선택을 같은 양수 균일 배율로 원자 변환한다", () => {
    const outside = image("outside");
    outside.x = 400;
    const items: El[] = [draw(), text(), image(), outside];
    const result = plan(items, { selectedIds: ["image", "draw", "text", "draw"] });

    expect(result).toEqual([
      {
        ...draw(),
        points: [30, 40, 50, 50, 70, 60],
        strokeWidth: 4,
      },
      {
        ...text(),
        x: 110,
        y: 60,
        width: 80,
        fontSize: 24,
      },
      {
        ...image(),
        x: 50,
        y: 50,
        width: 60,
        height: 40,
      },
      outside,
    ]);
    expect(result[3]).toBe(outside);
    expect(result.map((item) => item.id)).toEqual(items.map((item) => item.id));
    expect(items[0]).toEqual(draw());
    expect(items[1]).toEqual(text());
  });

  it("draw 선폭·샘플 간격은 기본 보존하고 명시적 scale 정책에서만 함께 확대한다", () => {
    const source = { ...draw(), sampleSpacing: 1.5 } satisfies El;
    const preserved = plan([source]) as Extract<El, { type: "draw" }>[];
    const scaled = plan([source], {
      strokeWidthPolicy: "scale",
    }) as Extract<El, { type: "draw" }>[];

    expect(preserved[0].strokeWidth).toBe(4);
    expect(preserved[0].sampleSpacing).toBe(1.5);
    expect(scaled[0].strokeWidth).toBe(8);
    expect(scaled[0].sampleSpacing).toBe(3);
  });

  it("draw의 문서 좌표 symmetry와 도형 cornerRadius를 옮기되 비율·개수 메타데이터는 보존한다", () => {
    const source: Extract<El, { type: "draw" }> = {
      ...draw(),
      shapeParams: {
        starPoints: 7,
        starInnerRatio: 0.42,
        polygonSides: 8,
        cornerRadius: 6,
      },
      symmetry: {
        type: "radial",
        centerX: 15,
        centerY: 25,
        radialCount: 9,
      },
    };
    const result = plan([source])[0] as typeof source;

    expect(result.shapeParams).toEqual({
      starPoints: 7,
      starInnerRatio: 0.42,
      polygonSides: 8,
      cornerRadius: 12,
    });
    expect(result.symmetry).toEqual({
      type: "radial",
      centerX: 40,
      centerY: 50,
      radialCount: 9,
    });
  });

  it("sticker의 위치와 fontSize를 바꾸되 rotation/skew는 유지한다", () => {
    const sticker: Extract<El, { type: "sticker" }> = {
      id: "sticker",
      type: "sticker",
      text: "쾅",
      x: 15,
      y: 22,
      fontSize: 20,
      rotation: 25,
      skewY: -7,
    };
    const result = plan([sticker]);

    expect(result[0]).toEqual({
      ...sticker,
      x: 40,
      y: 44,
      fontSize: 40,
    });
  });

  it("bubble box·커스텀 로컬 점·주 꼬리·추가 꼬리의 절대 길이를 함께 확대한다", () => {
    const bubble: Extract<El, { type: "bubble" }> = {
      id: "bubble",
      type: "bubble",
      variant: "speech",
      text: "안녕",
      x: 20,
      y: 25,
      width: 60,
      height: 30,
      fill: "#ffffff",
      textFill: "#111111",
      rotation: 9,
      fontSize: 18,
      autoShrinkText: true,
      autoShrinkMinFontSize: 9,
      lineHeight: 1.25,
      strokeWidth: 3,
      tailHeight: 18,
      tailBase: 12,
      tailBend: 0.3,
      tailXRatio: 0.68,
      tailAnchorPoint: { x: 170, y: 220 },
      shadowBlur: 7,
      shadowOffsetX: 3,
      shadowOffsetY: 4,
      customShapePoints: [0, 0, 60, 0, 60, 30, 0, 30],
      extraTails: [
        {
          direction: "bottom",
          ratio: 0.75,
          length: 16,
          base: 10,
          side: "right",
          bend: -0.2,
        },
      ],
    };
    const result = plan([bubble]);

    expect(result[0]).toEqual({
      ...bubble,
      x: 50,
      y: 50,
      width: 120,
      height: 60,
      fontSize: 36,
      autoShrinkMinFontSize: 18,
      tailHeight: 36,
      tailBase: 24,
      customShapePoints: [0, 0, 120, 0, 120, 60, 0, 60],
      extraTails: [
        {
          direction: "bottom",
          ratio: 0.75,
          length: 32,
          base: 20,
          side: "right",
          bend: -0.2,
        },
      ],
    });
    expect((result[0] as typeof bubble).tailBend).toBe(0.3);
    expect((result[0] as typeof bubble).tailXRatio).toBe(0.68);
    expect((result[0] as typeof bubble).tailAnchorPoint).toBe(
      bubble.tailAnchorPoint
    );
    expect((result[0] as typeof bubble).lineHeight).toBe(1.25);
    expect((result[0] as typeof bubble).strokeWidth).toBe(3);
    expect((result[0] as typeof bubble).shadowBlur).toBe(7);
    expect((result[0] as typeof bubble).shadowOffsetX).toBe(3);
    expect((result[0] as typeof bubble).shadowOffsetY).toBe(4);
  });

  it("말풍선의 암시적 fontSize·자동축소 하한·기본 꼬리 길이는 실제 배율로 materialize한다", () => {
    const bubble: Extract<El, { type: "bubble" }> = {
      id: "implicit-bubble",
      type: "bubble",
      variant: "speech",
      text: "기본값",
      x: 20,
      y: 25,
      width: 60,
      height: 30,
      fill: "#ffffff",
      textFill: "#111111",
      rotation: 0,
      autoShrinkText: true,
    };
    const result = plan([bubble])[0] as typeof bubble;

    expect(result.fontSize).toBe(48);
    expect(result.autoShrinkMinFontSize).toBe(20);
    expect(result.tailHeight).toBe(60);
  });

  it("text 자간·image 모서리 반경은 기하와 함께 확대하고 lineHeight·shadow 효과는 보존한다", () => {
    const sourceText: Extract<El, { type: "text" }> = {
      ...text(),
      letterSpacing: -1.25,
      lineHeight: 1.4,
      strokeWidth: 2,
      shadowBlur: 8,
      shadowOffsetX: 3,
      shadowOffsetY: -2,
    };
    const sourceImage: Extract<El, { type: "image" }> = {
      ...image(),
      cornerRadius: 7,
      shadowBlur: 12,
      shadowOffsetX: 4,
      shadowOffsetY: 5,
      pixelate: 9,
    };
    const result = plan([sourceText, sourceImage]);
    const scaleStrokeResult = plan([sourceText, sourceImage], {
      strokeWidthPolicy: "scale",
    });
    const resizedText = result[0] as typeof sourceText;
    const resizedImage = result[1] as typeof sourceImage;
    const scaledStrokeText = scaleStrokeResult[0] as typeof sourceText;
    const scaledStrokeImage = scaleStrokeResult[1] as typeof sourceImage;

    expect(resizedText.letterSpacing).toBe(-2.5);
    expect(resizedText.lineHeight).toBe(1.4);
    expect(resizedText.strokeWidth).toBe(2);
    expect(resizedText.shadowBlur).toBe(8);
    expect(resizedText.shadowOffsetX).toBe(3);
    expect(resizedText.shadowOffsetY).toBe(-2);
    expect(resizedImage.cornerRadius).toBe(14);
    expect(resizedImage.shadowBlur).toBe(12);
    expect(resizedImage.shadowOffsetX).toBe(4);
    expect(resizedImage.shadowOffsetY).toBe(5);
    expect(resizedImage.pixelate).toBe(9);
    expect(scaledStrokeText.strokeWidth).toBe(4);
    expect(scaledStrokeText.shadowBlur).toBe(8);
    expect(scaledStrokeText.shadowOffsetX).toBe(3);
    expect(scaledStrokeText.shadowOffsetY).toBe(-2);
    expect(scaledStrokeImage.shadowBlur).toBe(12);
    expect(scaledStrokeImage.shadowOffsetX).toBe(4);
    expect(scaledStrokeImage.shadowOffsetY).toBe(5);
    expect(scaledStrokeImage.pixelate).toBe(9);
  });

  it("frame box와 로컬 polygon points를 같은 비율로 확대한다", () => {
    const frame: Extract<El, { type: "frame" }> = {
      id: "frame",
      type: "frame",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      points: [0, 0, 80, 4, 76, 40, 2, 38],
      strokeWidth: 3,
    };
    const result = plan([frame]);
    const scaledStroke = plan([frame], { strokeWidthPolicy: "scale" });

    expect(result[0]).toEqual({
      ...frame,
      x: 30,
      y: 40,
      width: 160,
      height: 80,
      points: [0, 0, 160, 8, 152, 80, 4, 76],
    });
    expect(
      (scaledStroke[0] as Extract<El, { type: "frame" }>).strokeWidth
    ).toBe(6);
  });

  it("focus/speed lines의 box와 로컬 px 필드를 확대한다", () => {
    const focus: Extract<El, { type: "focusLines" }> = {
      id: "focus",
      type: "focusLines",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      lineCount: 80,
      innerRadius: 12,
      outerRadius: 44,
      stroke: "#000000",
      strokeWidth: 2,
      noise: 6,
      rotation: 15,
    };
    const speed: Extract<El, { type: "speedLines" }> = {
      id: "speed",
      type: "speedLines",
      x: 30,
      y: 25,
      width: 40,
      height: 20,
      lineCount: 30,
      direction: "horizontal",
      stroke: "#000000",
      strokeWidth: 1.5,
      noise: 5,
      rotation: -5,
    };
    const result = plan([focus, speed]);
    const scaledStroke = plan([focus, speed], {
      strokeWidthPolicy: "scale",
    });

    expect(result[0]).toMatchObject({
      x: 30,
      y: 40,
      width: 200,
      height: 100,
      innerRadius: 24,
      outerRadius: 88,
      strokeWidth: 2,
      noise: 12,
      rotation: 15,
    });
    expect(result[1]).toMatchObject({
      x: 70,
      y: 50,
      width: 80,
      height: 40,
      strokeWidth: 1.5,
      noise: 10,
      rotation: -5,
    });
    expect(
      (scaledStroke[0] as Extract<El, { type: "focusLines" }>).strokeWidth
    ).toBe(4);
    expect(
      (scaledStroke[1] as Extract<El, { type: "speedLines" }>).strokeWidth
    ).toBe(3);
  });

  it("명시적 scale 정책은 text·bubble·frame의 authored object stroke를 같은 비율로 확대한다", () => {
    const sourceText = { ...text(), strokeWidth: 1.5 } satisfies El;
    const bubble: Extract<El, { type: "bubble" }> = {
      id: "bubble-stroke",
      type: "bubble",
      variant: "speech",
      text: "선",
      x: 10,
      y: 20,
      width: 60,
      height: 30,
      fill: "#ffffff",
      textFill: "#111111",
      rotation: 0,
      strokeWidth: 2.5,
    };
    const frame: Extract<El, { type: "frame" }> = {
      id: "frame-stroke",
      type: "frame",
      x: 10,
      y: 20,
      width: 80,
      height: 40,
      strokeWidth: 3.5,
    };
    const preserved = plan([sourceText, bubble, frame]);
    const scaled = plan([sourceText, bubble, frame], {
      strokeWidthPolicy: "scale",
    });

    expect(
      (preserved[0] as Extract<El, { type: "text" }>).strokeWidth
    ).toBe(1.5);
    expect(
      (preserved[1] as Extract<El, { type: "bubble" }>).strokeWidth
    ).toBe(2.5);
    expect(
      (preserved[2] as Extract<El, { type: "frame" }>).strokeWidth
    ).toBe(3.5);
    expect(
      (scaled[0] as Extract<El, { type: "text" }>).strokeWidth
    ).toBe(3);
    expect(
      (scaled[1] as Extract<El, { type: "bubble" }>).strokeWidth
    ).toBe(5);
    expect(
      (scaled[2] as Extract<El, { type: "frame" }>).strokeWidth
    ).toBe(7);
  });

  it("선택 ID가 유실되거나 멤버 하나라도 잠기면 전원을 원본 참조로 fail-closed한다", () => {
    const free = image("free");
    const locked = { ...text("locked"), locked: true } satisfies El;
    const items: El[] = [free, locked];
    const missing = plan(items, { selectedIds: ["free", "ghost"] });
    const constrained = plan(items);

    expect(missing).not.toBe(items);
    expect(missing[0]).toBe(free);
    expect(missing[1]).toBe(locked);
    expect(constrained[0]).toBe(free);
    expect(constrained[1]).toBe(locked);
  });

  it("비균일·음수·비유한 target scale은 원자 no-op한다", () => {
    const source = image();
    const cases: StudioGroupUniformResizeBounds[] = [
      { ...DOUBLE, height: 120 },
      { ...DOUBLE, width: -200 },
      { ...DOUBLE, x: Number.NaN },
      { ...DOUBLE, width: Number.POSITIVE_INFINITY },
    ];

    for (const targetBounds of cases) {
      const result = plan([source], { targetBounds });
      expect(result[0]).toBe(source);
    }
  });

  it("source/target의 0 크기 퇴화 bounds는 확대를 시도하지 않는다", () => {
    const source = draw();
    const degenerateSources: StudioGroupUniformResizeBounds[] = [
      { ...SOURCE, width: 0 },
      { ...SOURCE, height: 0 },
    ];

    for (const sourceBounds of degenerateSources) {
      const result = plan([source], { sourceBounds });
      expect(result[0]).toBe(source);
    }
    expect(plan([source], { targetBounds: { ...DOUBLE, height: 0 } })[0]).toBe(source);
  });

  it("identity bounds는 빈 히스토리를 만들 수 없도록 모든 내부 참조를 보존한다", () => {
    const items: El[] = [draw(), text(), image()];
    const result = plan(items, { targetBounds: { ...SOURCE } });

    expect(result).not.toBe(items);
    expect(result[0]).toBe(items[0]);
    expect(result[1]).toBe(items[1]);
    expect(result[2]).toBe(items[2]);
  });

  it("지원 기하 하나가 손상되면 유효한 다른 멤버도 변환하지 않는다", () => {
    const good = image("good");
    const invalid = {
      ...draw("invalid"),
      points: [0, 0, Number.NaN, 20],
    } satisfies El;
    const items: El[] = [good, invalid];
    const result = plan(items);

    expect(result[0]).toBe(good);
    expect(result[1]).toBe(invalid);
  });
});
