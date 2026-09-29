import { describe, expect, it } from "vitest";

import {
  bakeTextLineToVectorPath,
  commandsToSvgPathData,
  type StudioTextBakeCommand,
  type StudioVectorFontLike,
} from "./studio-text-vector-bake";

/** 테스트용 가짜 폰트: "A"는 삼각형, 그 외는 사각형 글리프. */
function createMockFont(): StudioVectorFontLike {
  const glyphCommands = (ch: string): StudioTextBakeCommand[] => {
    if (ch === " ") return [];
    if (ch === "A") {
      return [
        { type: "M", x: 0, y: 0 },
        { type: "L", x: 10, y: 20 },
        { type: "L", x: 20, y: 0 },
        { type: "Z" },
      ];
    }
    return [
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 0, y: 20 },
      { type: "L", x: 12, y: 20 },
      { type: "L", x: 12, y: 0 },
      { type: "Z" },
    ];
  };
  return {
    getPath: (text: string, x: number, y: number) => {
      const commands = glyphCommands(text).map((cmd) => ({
        ...cmd,
        x: cmd.x !== undefined ? cmd.x + x : undefined,
        y: cmd.y !== undefined ? cmd.y + y : undefined,
        x1: cmd.x1 !== undefined ? cmd.x1 + x : undefined,
        y1: cmd.y1 !== undefined ? cmd.y1 + y : undefined,
      }));
      return {
        commands,
        getBoundingBox: () => ({ x1: x, y1: y, x2: x + 12, y2: y + 20 }),
      };
    },
    getAdvanceWidth: () => 14,
  };
}

describe("commandsToSvgPathData", () => {
  it("M/L/Q/C/Z 명령을 SVG path data 로 변환한다", () => {
    const commands: StudioTextBakeCommand[] = [
      { type: "M", x: 0, y: 0 },
      { type: "L", x: 10, y: 10 },
      { type: "Q", x1: 20, y1: 20, x: 30, y: 30 },
      { type: "C", x1: 40, y1: 40, x2: 50, y2: 50, x: 60, y: 60 },
      { type: "Z" },
    ];
    // flipY=true, flipBaseY=0 → y 부호 반전
    const result = commandsToSvgPathData(commands, { precision: 2 });
    expect(result).toBe("M0 0L10 -10Q20 -20 30 -30C40 -40 50 -50 60 -60Z");
  });

  it("flipY=false 면 y를 그대로 둔다", () => {
    const commands: StudioTextBakeCommand[] = [
      { type: "M", x: 5, y: 7 },
      { type: "Z" },
    ];
    expect(commandsToSvgPathData(commands, { flipY: false })).toBe("M5 7Z");
  });

  it("precision 에 따라 좌표를 반올림한다", () => {
    const commands: StudioTextBakeCommand[] = [
      { type: "M", x: 1.23456, y: 7.89123 },
    ];
    expect(commandsToSvgPathData(commands, { flipY: false, precision: 1 })).toBe(
      "M1.2 7.9",
    );
  });

  it("빈 명령 배열은 빈 문자열을 반환한다", () => {
    expect(commandsToSvgPathData([])).toBe("");
  });
});

describe("bakeTextLineToVectorPath", () => {
  const font = createMockFont();

  it("한 줄 텍스트를 벡터 패스로 베이크한다", () => {
    const result = bakeTextLineToVectorPath(font, "AB", { fontSize: 32 });
    expect(result.ok).toBe(true);
    expect(result.charCount).toBe(2);
    expect(result.pathData.length).toBeGreaterThan(0);
    // 두 글리프 모두 포함 (A 삼각형 + B 사각형)
    expect(result.pathData).toContain("M");
    expect(result.pathData).toContain("Z");
    expect(result.bounds.width).toBeGreaterThan(0);
    expect(result.bounds.height).toBeGreaterThan(0);
  });

  it("여러 줄은 lineHeight 간격으로 쌓인다", () => {
    const single = bakeTextLineToVectorPath(font, "A", { fontSize: 32 });
    const multi = bakeTextLineToVectorPath(font, "A\nA", {
      fontSize: 32,
      lineHeight: 1.5,
    });
    expect(multi.ok).toBe(true);
    expect(multi.charCount).toBe(2);
    // 두 줄이면 높이가 한 줄보다 크다
    expect(multi.bounds.height).toBeGreaterThan(single.bounds.height);
  });

  it("빈 텍스트는 빈 결과를 반환한다", () => {
    const result = bakeTextLineToVectorPath(font, "");
    expect(result.ok).toBe(true);
    expect(result.pathData).toBe("");
    expect(result.charCount).toBe(0);
  });

  it("최대 문자 수를 초과하면 실패한다", () => {
    const result = bakeTextLineToVectorPath(font, "ABC", { maxChars: 2 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("최대 문자 수");
  });

  it("유효하지 않은 폰트 크기는 실패한다", () => {
    const result = bakeTextLineToVectorPath(font, "A", { fontSize: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("폰트 크기");
  });

  it("tracking(자간)이 적용되면 너비가 늘어난다", () => {
    const noTracking = bakeTextLineToVectorPath(font, "AB", { tracking: 0 });
    const withTracking = bakeTextLineToVectorPath(font, "AB", {
      tracking: 10,
    });
    expect(withTracking.bounds.width).toBeGreaterThan(noTracking.bounds.width);
  });

  it("pathData 길이 한도를 초과하면 실패한다", () => {
    const result = bakeTextLineToVectorPath(font, "AB", {
      maxPathDataLength: 10,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("최대 길이");
  });

  it("공백만 있는 텍스트는 빈 pathData 를 반환한다", () => {
    const result = bakeTextLineToVectorPath(font, "   ");
    expect(result.ok).toBe(true);
    expect(result.pathData).toBe("");
  });

  it("빈 줄이 섞인 여러 줄도 정상 베이크된다", () => {
    const result = bakeTextLineToVectorPath(font, "A\n\nB", { fontSize: 32 });
    expect(result.ok).toBe(true);
    expect(result.charCount).toBe(2);
    expect(result.pathData.length).toBeGreaterThan(0);
    expect(Number.isFinite(result.bounds.width)).toBe(true);
  });
});
