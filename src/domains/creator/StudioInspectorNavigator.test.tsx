import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioInspectorNavigator } from "./StudioInspectorNavigator";

import type { StudioInspectorLayout } from "./studio-inspector-layout";

const noop = () => {
  // 정적 렌더에서는 내비게이션 콜백을 실행하지 않는다.
};

function renderNavigator(
  layout: StudioInspectorLayout,
  selectedType: string | null = "image",
  imageToolsAvailable?: boolean,
  imageToolsStatus?: Readonly<{
    label: string;
    description: string;
    tone: "neutral" | "accent" | "good" | "warn";
  }>,
): string {
  return renderToStaticMarkup(
    <StudioInspectorNavigator
      layout={layout}
      selectedType={selectedType}
      selectionLabel={selectedType ? "이미지" : null}
      drawing={false}
      imageToolsAvailable={imageToolsAvailable}
      imageToolsStatusLabel={imageToolsStatus?.label}
      imageToolsStatusDescription={imageToolsStatus?.description}
      imageToolsStatusTone={imageToolsStatus?.tone}
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
    expect(html).toContain('data-studio-inspector-primary-tab="layers"');
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

  it("keeps professional pixel tools discoverable before a raster target is selected", () => {
    const html = renderNavigator(
      { primary: "properties", image: "retouch", document: "canvas" },
      null,
      true,
      {
        label: "합성본 준비",
        description: "페이지 합성본 준비 후 실행",
        tone: "accent",
      },
    );

    expect(html).toContain('aria-label="이미지 전문 도구"');
    expect(html).toContain("채우기·선화");
    expect(html).toContain("선택·리터치");
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("합성본 준비");
    expect(html).toContain("페이지 합성본 준비 후 실행");
    expect(html).toMatch(/aria-describedby="[^"]*-image-tools-status"/u);
  });

  it("shows all image tabs for draw selections", () => {
    const drawHtml = renderNavigator({
      primary: "properties",
      image: "fill",
      document: "canvas",
    }, "draw");

    expect(drawHtml).toContain('aria-label="이미지 전문 도구"');
    expect(drawHtml).toContain("채우기·선화");
    expect(drawHtml).toContain("빠른 수정");
    expect(drawHtml).toContain("선택·리터치");
    expect(drawHtml).toContain("마스크");
    expect(drawHtml).toContain("변형");
    expect(drawHtml).toContain('aria-selected="true"');
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

    // 모바일 44px 계약은 기본값(`min-h-11`/`size-11`)으로 제공하고 일부 보조 탭만
    // coarse-pointer 보강을 함께 둔다. 구현 방식이 아니라 실제 최소 터치 크기 토큰을 센다.
    expect(html.match(/(?:min-h-11|size-11)/g)?.length).toBeGreaterThanOrEqual(9);
    expect(html).toContain("sticky top-0");
    expect(html).toContain("overflow-x-auto");
  });
});
