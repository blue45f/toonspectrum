// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { useI18n } from "@/shared/lib/i18n-core";
import { productionText } from "./production-workboard-copy";

const originalLanguage = useI18n.getState().lang;
afterEach(() => useI18n.setState({ lang: originalLanguage }));

describe("제작 보드 UI 문구", () => {
  it("한국어와 영어 핵심 행동을 같은 i18n 경로로 해석한다", () => {
    useI18n.setState({ lang: "ko" });
    expect(productionText("작업 만들기")).toBe("작업 만들기");
    useI18n.setState({ lang: "en" });
    expect(productionText("작업 만들기")).toBe("Create task");
    expect(productionText("공정 설정")).toBe("Configure workflow");
  });
  it("번역되지 않은 설명에서도 내부 번역 키 대신 원문을 유지한다", () => {
    useI18n.setState({ lang: "en" });
    const source = "제작 보드 테스트 전용 원문 설명입니다.";
    expect(productionText(source)).toBe(source);
    expect(productionText(source)).not.toContain("staticUi.");
  });
});
