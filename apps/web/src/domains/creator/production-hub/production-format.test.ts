import { describe, expect, it } from "vitest";

import { formatProductionDday } from "./production-format";

const ko = (text: string) => text;
const en = (_ko: string, text: string) => text;

describe("D-day 표기", () => {
  it("남은 날짜는 D-N, 오늘은 오늘, 지난 마감은 N일 지남으로 쓴다", () => {
    expect(formatProductionDday(3, ko)).toBe("D-3");
    expect(formatProductionDday(1, ko)).toBe("D-1");
    expect(formatProductionDday(0, ko)).toBe("오늘");
    expect(formatProductionDday(-2, ko)).toBe("2일 지남");
    expect(formatProductionDday(null, ko)).toBe("마감 미정");
  });

  it("영문도 같은 문법을 쓴다", () => {
    expect(formatProductionDday(3, en)).toBe("D-3");
    expect(formatProductionDday(0, en)).toBe("Today");
    expect(formatProductionDday(-2, en)).toBe("2d overdue");
    expect(formatProductionDday(null, en)).toBe("No due date");
  });
});
