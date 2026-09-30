import { describe, expect, it } from "vitest";

import {
  READER_PREVIEW_DEVICE_WIDTH_PX,
  READER_PREVIEW_LONG_CUT_SCREENS,
  READER_PREVIEW_MIN_DIALOGUE_FONT_PX,
  READER_PREVIEW_SAFE_AREA_INSET_PX,
  READER_PREVIEW_SHORT_CUT_SCREENS,
  READER_PREVIEW_VIEWPORT_HEIGHT_PX,
  analyzeReaderPreview,
  analyzeReaderPreviewPage,
  type ReaderPreviewPageLike,
} from "./reader-preview-analysis";

const SCALE = READER_PREVIEW_DEVICE_WIDTH_PX / 720;

function canvasPxForScreens(screens: number): number {
  return (screens * READER_PREVIEW_VIEWPORT_HEIGHT_PX) / SCALE;
}

function makePage(
  elements: ReaderPreviewPageLike["elements"],
  canvasH = 1_280,
): ReaderPreviewPageLike {
  return { id: "p1", canvasH, elements };
}

function cut(id: string, y: number, height: number) {
  return { id, type: "frame", y, height };
}

describe("analyzeReaderPreviewPage 컷 길이 계산", () => {
  it("컷 높이를 독자 폭 환산 화면 수로 잰다", () => {
    const height = canvasPxForScreens(1.5);
    const analysis = analyzeReaderPreviewPage(makePage([cut("c1", 0, height)]));
    expect(analysis.cuts).toHaveLength(1);
    expect(analysis.cuts[0]?.screens).toBeCloseTo(1.5, 2);
  });

  it("짧은 컷(<0.5화면)에 SHORT_CUT 경고를 낸다", () => {
    const analysis = analyzeReaderPreviewPage(
      makePage([cut("c1", 0, canvasPxForScreens(0.3))]),
    );
    const codes = analysis.warnings.map((warning) => warning.code);
    expect(codes).toContain("SHORT_CUT");
    expect(analysis.warnings[0]?.severity).toBe("warning");
  });

  it("긴 컷(>3화면)에 LONG_CUT 경고를 낸다", () => {
    const analysis = analyzeReaderPreviewPage(
      makePage([cut("c1", 0, canvasPxForScreens(3.5))]),
    );
    const codes = analysis.warnings.map((warning) => warning.code);
    expect(codes).toContain("LONG_CUT");
    expect(analysis.warnings[0]?.message).toContain("3.5화면");
  });

  it("임계값 경계(정확히 3화면·0.5화면)에서는 경고하지 않는다", () => {
    const analysis = analyzeReaderPreviewPage(
      makePage([
        cut("c1", 0, canvasPxForScreens(READER_PREVIEW_LONG_CUT_SCREENS)),
        cut("c2", canvasPxForScreens(3.2), canvasPxForScreens(READER_PREVIEW_SHORT_CUT_SCREENS)),
      ]),
    );
    const codes = analysis.warnings.map((warning) => warning.code);
    expect(codes).not.toContain("LONG_CUT");
    expect(codes).not.toContain("SHORT_CUT");
  });

  it("적정 길이 컷(0.5~3화면)은 경고 없이 통과한다", () => {
    const analysis = analyzeReaderPreviewPage(
      makePage([cut("c1", 0, canvasPxForScreens(1.2))]),
    );
    expect(analysis.warnings).toHaveLength(0);
  });

  it("높이가 0인 컷은 SHORT_CUT 경고 대상에서 제외한다", () => {
    const analysis = analyzeReaderPreviewPage(makePage([cut("c1", 0, 0)]));
    const codes = analysis.warnings.map((warning) => warning.code);
    expect(codes).not.toContain("SHORT_CUT");
  });
});

describe("analyzeReaderPreviewPage 컷 간격", () => {
  it("연속 컷 사이의 간격을 잰다", () => {
    const analysis = analyzeReaderPreviewPage(
      makePage([cut("c1", 0, 500), cut("c2", 560, 500)]),
    );
    expect(analysis.cuts[0]?.gapAfterPx).toBe(60);
    expect(analysis.cuts[1]?.gapAfterPx).toBeNull();
  });

  it("겹친 컷(음수 간격)에 OVERLAPPING_CUTS critical 경고를 낸다", () => {
    const analysis = analyzeReaderPreviewPage(
      makePage([cut("c1", 0, 600), cut("c2", 500, 600)]),
    );
    const overlap = analysis.warnings.find(
      (warning) => warning.code === "OVERLAPPING_CUTS",
    );
    expect(overlap?.severity).toBe("critical");
    expect(overlap?.cutIndex).toBe(0);
  });

  it("y 순서와 무관하게 정렬해 간격을 잰다", () => {
    const analysis = analyzeReaderPreviewPage(
      makePage([cut("c2", 560, 500), cut("c1", 0, 500)]),
    );
    expect(analysis.cuts[0]?.id).toBe("c1");
    expect(analysis.cuts[1]?.id).toBe("c2");
  });
});

describe("analyzeReaderPreviewPage 대사 가독성", () => {
  function dialogue(id: string, fontSize: number, text = "대사") {
    return { id, type: "bubble", text, fontSize, y: 100, height: 80 };
  }

  it("독자 폭 환산 폰트가 최소값 미만이면 SMALL_DIALOGUE_TEXT 경고를 낸다", () => {
    // 24px(캔버스) → 390/720 환산 ≈ 13px < 14px 최소값
    const analysis = analyzeReaderPreviewPage(makePage([dialogue("b1", 24)]));
    const small = analysis.warnings.find(
      (warning) => warning.code === "SMALL_DIALOGUE_TEXT",
    );
    expect(small?.severity).toBe("warning");
    expect(small?.elementId).toBe("b1");
    expect(analysis.smallDialogueCount).toBe(1);
  });

  it("충분히 큰 폰트는 경고를 내지 않는다", () => {
    const fontSize = Math.ceil(
      READER_PREVIEW_MIN_DIALOGUE_FONT_PX / SCALE,
    );
    const analysis = analyzeReaderPreviewPage(makePage([dialogue("b1", fontSize)]));
    const codes = analysis.warnings.map((warning) => warning.code);
    expect(codes).not.toContain("SMALL_DIALOGUE_TEXT");
  });

  it("빈 텍스트·숨김 요소는 가독성 검사에서 제외한다", () => {
    const analysis = analyzeReaderPreviewPage(
      makePage([
        { id: "b1", type: "bubble", text: "   ", fontSize: 10 },
        { id: "b2", type: "bubble", text: "대사", fontSize: 10, hidden: true },
        { id: "b3", type: "bubble", text: "대사", fontSize: 10, opacity: 0 },
      ]),
    );
    expect(analysis.dialogueElementCount).toBe(0);
    const codes = analysis.warnings.map((warning) => warning.code);
    expect(codes).not.toContain("SMALL_DIALOGUE_TEXT");
  });

  it("안전영역을 벗어난 대사에 SAFE_AREA_INTRUSION 안내를 낸다", () => {
    const analysis = analyzeReaderPreviewPage(
      makePage([
        {
          id: "b1",
          type: "bubble",
          text: "대사",
          fontSize: 30,
          x: 0,
          y: 100,
          width: 720,
          height: 80,
        },
      ]),
    );
    const intrusion = analysis.warnings.find(
      (warning) => warning.code === "SAFE_AREA_INTRUSION",
    );
    expect(intrusion?.severity).toBe("info");
    expect(intrusion?.detail).toContain(
      String(READER_PREVIEW_SAFE_AREA_INSET_PX),
    );
  });

  it("안전영역 안의 대사는 침범 경고를 내지 않는다", () => {
    const insetCanvas = READER_PREVIEW_SAFE_AREA_INSET_PX / SCALE;
    const analysis = analyzeReaderPreviewPage(
      makePage([
        {
          id: "b1",
          type: "bubble",
          text: "대사",
          fontSize: 30,
          x: insetCanvas + 1,
          y: 100,
          width: 720 - (insetCanvas + 1) * 2,
          height: 80,
        },
      ]),
    );
    const codes = analysis.warnings.map((warning) => warning.code);
    expect(codes).not.toContain("SAFE_AREA_INTRUSION");
  });
});

describe("analyzeReaderPreviewPage 페이지 집계", () => {
  it("페이지 전체 높이를 화면 수로 환산한다", () => {
    const analysis = analyzeReaderPreviewPage(makePage([], 2_560));
    expect(analysis.screenCount).toBeCloseTo(
      (2_560 * SCALE) / READER_PREVIEW_VIEWPORT_HEIGHT_PX,
      2,
    );
  });

  it("cut/panel 타입만 컷으로 집계한다", () => {
    const analysis = analyzeReaderPreviewPage(
      makePage([
        { id: "f1", type: "frame", y: 0, height: canvasPxForScreens(1) },
        { id: "p1", type: "panel", y: 900, height: canvasPxForScreens(1) },
        { id: "b1", type: "bubble", y: 100, height: 100, text: "대사" },
        { id: "i1", type: "image", y: 200, height: 400 },
      ]),
    );
    expect(analysis.cuts).toHaveLength(2);
  });
});

describe("analyzeReaderPreview 문서 집계", () => {
  it("여러 페이지의 경고를 합치고 전체 화면 수를 잰다", () => {
    const result = analyzeReaderPreview([
      makePage([cut("c1", 0, canvasPxForScreens(4))], 1_280),
      makePage([cut("c2", 0, canvasPxForScreens(0.2))], 1_280),
    ]);
    expect(result.pages).toHaveLength(2);
    expect(result.warningCount).toBe(2);
    expect(result.criticalCount).toBe(0);
    expect(
      result.warnings.map((warning) => warning.code).sort(),
    ).toEqual(["LONG_CUT", "SHORT_CUT"]);
    expect(result.totalScreens).toBeGreaterThan(0);
  });

  it("페이지 수 상한을 지킨다", () => {
    const pages = Array.from({ length: 600 }, (_, index) => ({
      id: `p${index}`,
      canvasH: 1_280,
      elements: [],
    }));
    const result = analyzeReaderPreview(pages);
    expect(result.pages.length).toBeLessThanOrEqual(500);
  });
});
