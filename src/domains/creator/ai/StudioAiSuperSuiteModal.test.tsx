import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioAiSuperSuiteModal } from "./StudioAiSuperSuiteModal";

describe("StudioAiSuperSuiteModal", () => {
  it("renders null when open is false", () => {
    const markup = renderToStaticMarkup(
      <StudioAiSuperSuiteModal open={false} onClose={() => {}} />,
    );
    expect(markup).toBe("");
  });

  it("renders all 5 super suite feature tabs when open is true", () => {
    const markup = renderToStaticMarkup(
      <StudioAiSuperSuiteModal open={true} onClose={() => {}} />,
    );

    expect(markup).toContain("AI 웹툰 생성 슈퍼 스위트");
    expect(markup).toContain("화풍 변환 툰필터");
    expect(markup).toContain("AI 음영 어시스트");
    expect(markup).toContain("프롬프트 증강기");
    expect(markup).toContain("콘티 자동 디렉터");
    expect(markup).toContain("감정-말풍선 매처");

    // Style filter tab content
    expect(markup).toContain("로맨스 판타지 / 순정만화 화풍");
    expect(markup).toContain("소년 액션 / 역동적 극화체");
  });
});
