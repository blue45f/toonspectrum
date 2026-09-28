import { describe, expect, it } from "vitest";
import { auditLanguage, auditMotion, auditViewportOverrides } from "./lib/visual-audit-emulation.mjs";

describe("전수 관찰의 명시적 보충 조건", () => {
  it("옵션이 없으면 기존 뷰포트·한국어·일반 모션 조건을 바꾸지 않는다", () => {
    expect(auditViewportOverrides()).toBeNull();
    expect(auditLanguage()).toBe("ko");
    expect(auditMotion()).toBe("no-preference");
  });
  it("320px 터치, 820px 태블릿, 1920px 데스크톱을 중복 없이 확장한다", () => {
    const cases = auditViewportOverrides("320,820,1920,320");
    expect(cases.map(([name]) => name)).toEqual(["width-320", "width-820", "width-1920"]);
    expect(cases[0][1]).toEqual({ width: 320, height: 844, hasTouch: true, isMobile: true });
    expect(cases[1][1]).toEqual({ width: 820, height: 1000, hasTouch: true, isMobile: false });
    expect(cases[2][1].hasTouch).toBe(false);
  });
  it.each(["0", "390px", "320.5", "Infinity", "3841", "300,320,360,390,430,820,1440"])("잘못된 폭 %s를 조용히 대체하지 않는다", (width) => {
    expect(() => auditViewportOverrides(width)).toThrow();
  });
  it("영어·모션 감소를 명시적으로 선택하고 알 수 없는 조건을 거부한다", () => {
    expect(auditLanguage("en")).toBe("en");
    expect(auditMotion("reduce")).toBe("reduce");
    expect(() => auditLanguage("unknown")).toThrow();
    expect(() => auditMotion("unknown")).toThrow();
  });
});
