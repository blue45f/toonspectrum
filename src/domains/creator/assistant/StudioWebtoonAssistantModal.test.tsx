import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioWebtoonAssistantModal } from "./StudioWebtoonAssistantModal";

describe("StudioWebtoonAssistantModal", () => {
  it("renders nothing when open is false", () => {
    const markup = renderToStaticMarkup(
      <StudioWebtoonAssistantModal open={false} onClose={() => {}} />,
    );
    expect(markup).toBe("");
  });

  it("renders all 6 assistant feature tabs when open is true", () => {
    const markup = renderToStaticMarkup(
      <StudioWebtoonAssistantModal
        open={true}
        onClose={() => {}}
        canvasWidth={690}
        canvasHeight={15000}
      />,
    );

    expect(markup).toContain("웹툰 창작 보조 센터");
    expect(markup).toContain("플랫폼 규격");
    expect(markup).toContain("스크롤 페이싱 시뮬레이터");
    expect(markup).toContain("효과음·의성어 사전");
    expect(markup).toContain("피부/그림자 컬러 조화");
    expect(markup).toContain("포커스플로우");
    expect(markup).toContain("구도 가이드");

    // Default Spec & Slicer Tab content
    expect(markup).toContain("네이버웹툰 (도전/베도/정식)");
    expect(markup).toContain("카카오페이지 / 카카오웹툰");
    expect(markup).toContain("ToonSlicer 컷 안전 분할 계획");
  });
});
