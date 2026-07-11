import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioInspectorNavigator } from "./StudioInspectorNavigator";

import type { StudioInspectorLayout } from "./studio-inspector-layout";

const noop = () => {
  // 정적 렌더에서는 내비게이션 콜백을 실행하지 않는다.
};

function renderNavigator(
  layout: StudioInspectorLayout,
  selectedType: string | null = "image"
): string {
  return renderToStaticMarkup(
    <StudioInspectorNavigator
      layout={layout}
      selectedType={selectedType}
      selectionLabel={selectedType ? "이미지" : null}
      drawing={selectedType === null}
      layerCount={128}
      onChange={noop}
    />
  );
}

describe("StudioInspectorNavigator", () => {
  it("renders a four-tab professional dock with a capped layer badge", () => {
    const html = renderNavigator({
      primary: "properties",
      image: "quick",
      document: "canvas",
    });

    expect(html).toContain('aria-label="스튜디오 작업 패널"');
    expect(html.match(/role="tab"/g)).toHaveLength(9);
    expect(html).toContain("속성");
    expect(html).toContain("레이어");
    expect(html).toContain("페이지");
    expect(html).toContain("게시");
    expect(html).toContain("99+");
    expect(html).toContain('aria-label="패널과 기능 찾기"');
  });

  it("shows image categories only for an image selection", () => {
    const imageHtml = renderNavigator({
      primary: "properties",
      image: "fill",
      document: "canvas",
    });
    const textHtml = renderNavigator(
      { primary: "properties", image: "fill", document: "canvas" },
      "text"
    );

    expect(imageHtml).toContain('aria-label="이미지 전문 도구"');
    expect(imageHtml).toContain("빠른 수정");
    expect(imageHtml).toContain("채우기·선화");
    expect(imageHtml).toContain("선택·리터치");
    expect(imageHtml).toContain("마스크");
    expect(imageHtml).toContain("변형");
    expect(imageHtml).toContain('aria-selected="true"');
    expect(textHtml).not.toContain('aria-label="이미지 전문 도구"');
  });

  it("uses an independent compact sub-navigation for page settings", () => {
    const html = renderNavigator({
      primary: "document",
      image: "quick",
      document: "grade",
    });

    expect(html).toContain('aria-label="페이지 설정"');
    expect(html).toContain("캔버스");
    expect(html).toContain("색보정");
    expect(html).toContain("미니맵");
    expect(html).not.toContain('aria-label="이미지 전문 도구"');
  });

  it("keeps all dock controls mobile-safe", () => {
    const html = renderNavigator({
      primary: "properties",
      image: "retouch",
      document: "navigator",
    });

    expect(html.match(/pointer-coarse:min-h-11/g)?.length).toBeGreaterThanOrEqual(9);
    expect(html).toContain("sticky top-0");
    expect(html).toContain("overflow-x-auto");
  });
});
