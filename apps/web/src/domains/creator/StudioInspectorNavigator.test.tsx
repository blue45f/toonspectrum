// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  requestStudioCommandSearch,
  subscribeStudioCommandSearchRequests,
  type StudioCommandSearchRequest,
} from "./studio-help-center-channel";
import { STUDIO_IMAGE_INSPECTOR_SECTIONS } from "./studio-inspector-layout";
import { createStudioInspectorTabA11y } from "./studio-inspector-tab-a11y";
import { StudioInspectorNavigator } from "./StudioInspectorNavigator";

import type { StudioInspectorLayout } from "./studio-inspector-layout";

const noop = () => {
  // 정적 렌더에서는 내비게이션 콜백을 실행하지 않는다.
};
const TAB_A11Y = createStudioInspectorTabA11y("test");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderNavigator(
  layout: StudioInspectorLayout,
  selectedType: string | null = "image",
  imageToolsAvailable?: boolean,
  imageToolsStatus?: Readonly<{
    label: string;
    description: string;
    tone: "neutral" | "accent" | "good" | "warn";
  }>,
  selectionCount = selectedType === null ? 0 : 1,
): string {
  return renderToStaticMarkup(
    <StudioInspectorNavigator
      layout={layout}
      tabA11y={TAB_A11Y}
      selectedType={selectedType}
      selectionLabel={
        selectedType === "text"
          ? "텍스트"
          : selectedType
            ? "이미지"
            : null
      }
      selectionCount={selectionCount}
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
  it("links every primary and image tab to stable, non-duplicated panel ids", () => {
    const html = renderNavigator({
      primary: "properties",
      image: "quick",
      document: "canvas",
    });

    for (const section of ["properties", "layers"] as const) {
      expect(html).toContain(`id="${TAB_A11Y.primary[section].tabId}"`);
      expect(html).toContain(`aria-controls="${TAB_A11Y.primary[section].panelId}"`);
    }
    expect(html).toContain(`id="${TAB_A11Y.primary.document.tabId}"`);
    expect(html).toContain(`aria-controls="${TAB_A11Y.document.canvas.panelId}"`);
    for (const tabId of Object.values(TAB_A11Y.imageTabs)) {
      expect(html).toContain(`id="${tabId}"`);
    }
    expect(html.match(new RegExp(`aria-controls="${TAB_A11Y.imagePanels.selected}"`, "gu")))
      .toHaveLength(5);
    expect(TAB_A11Y.imagePanels.selected).not.toBe(TAB_A11Y.imagePanels.unselected);
  });

  it("links each page subtab to its own stable panel", () => {
    const html = renderNavigator({
      primary: "document",
      image: "quick",
      document: "grade",
    });

    for (const link of Object.values(TAB_A11Y.document)) {
      expect(html).toContain(`id="${link.tabId}"`);
      expect(html).toContain(`aria-controls="${link.panelId}"`);
    }
  });

  it("renders a three-tab dock (선택 항목·레이어·페이지) with a capped layer badge", () => {
    const html = renderNavigator({
      primary: "properties",
      image: "quick",
      document: "canvas",
    });

    expect(html).toContain('aria-label="스튜디오 설정"');
    // 3 primary + 5 image tabs. 작품 정보 is no longer a permanent fourth tab.
    expect(html.match(/role="tab"/g)).toHaveLength(8);
    expect(html).toContain("선택 항목");
    expect(html).toContain("레이어");
    expect(html).toContain("페이지");
    expect(html).not.toContain('data-studio-inspector-primary-tab="publish"');
    expect(html).toContain("99+");
    expect(html).toContain('data-studio-inspector-primary-tab="layers"');
    expect(html).toContain('aria-label="기능·설정 찾기"');
    expect(html).toMatch(/data-studio-inspector-search-trigger="true"[^>]*class="[^"]*lg:hidden/u);
  });

  it("shows the 게시 준비 mode with a way back instead of a fourth tab", () => {
    const html = renderNavigator({
      primary: "publish",
      image: "quick",
      document: "canvas",
    });

    expect(html).toContain('data-studio-inspector-publish-mode="true"');
    expect(html).toContain(`id="${TAB_A11Y.primary.publish.tabId}"`);
    expect(html).toContain("작품 정보");
    expect(html).toContain("편집으로 돌아가기");
    expect(html).not.toContain('aria-selected="true"');
    expect(html).toMatch(/data-studio-inspector-primary-tab="properties"[^>]*tabindex="0"/u);
  });

  it("uses the shared settings name for the mobile close action", () => {
    const html = renderToStaticMarkup(
      <StudioInspectorNavigator
        layout={{ primary: "layers", image: "quick", document: "canvas" }}
        selectedType={null}
        selectionLabel={null}
        drawing={false}
        layerCount={0}
        onRequestClose={noop}
        onChange={noop}
      />,
    );

    expect(html).toContain('aria-label="설정 닫기"');
    expect(html).not.toContain('aria-label="속성 시트 닫기"');
  });

  it("shows image categories only for an image selection, in canonical order, without a hidden scroll strip", () => {
    const imageHtml = renderNavigator({
      primary: "properties",
      image: "fill",
      document: "canvas",
    });
    const textHtml = renderNavigator(
      { primary: "properties", image: "fill", document: "canvas" },
      "text"
    );

    expect(imageHtml).toContain('aria-label="이미지 설정"');
    expect(imageHtml).toContain("빠른 수정");
    expect(imageHtml).toContain("채우기·선화");
    expect(imageHtml).toContain("선택·보정");
    expect(imageHtml).toContain("가리기");
    expect(imageHtml).toContain("크기·회전");
    expect(imageHtml).toContain('aria-selected="true"');
    expect(textHtml).not.toContain('aria-label="이미지 설정"');

    const rendered = [...imageHtml.matchAll(/id="test-studio-inspector-image-tab-([a-z]+)"/gu)]
      .map((match) => match[1]);
    expect(rendered).toEqual([...STUDIO_IMAGE_INSPECTOR_SECTIONS]);
    expect(imageHtml).toMatch(/aria-label="이미지 설정"[^>]*class="[^"]*grid-cols-3/u);
    expect(imageHtml).not.toContain("overflow-x-auto");
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

    expect(html).toContain('aria-label="이미지 설정"');
    expect(html).toContain("채우기·선화");
    expect(html).toContain("선택·보정");
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

    expect(drawHtml).toContain('aria-label="이미지 설정"');
    expect(drawHtml).toContain("채우기·선화");
    expect(drawHtml).toContain("빠른 수정");
    expect(drawHtml).toContain("선택·보정");
    expect(drawHtml).toContain("가리기");
    expect(drawHtml).toContain("크기·회전");
    expect(drawHtml).toContain('aria-selected="true"');
  });

  it("uses an independent compact sub-navigation for page settings", () => {
    const html = renderNavigator({
      primary: "document",
      image: "quick",
      document: "grade",
    });

    expect(html).toContain('aria-label="페이지 설정"');
    expect(html).toContain("페이지");
    expect(html).toContain("색상 보정");
    expect(html).toContain("긴 원고 미니맵");
    expect(html).not.toContain('aria-label="이미지 설정"');
  });

  it("keeps all dock controls mobile-safe and every caption at or above 11px", () => {
    const html = renderNavigator({
      primary: "properties",
      image: "retouch",
      document: "navigator",
    });

    expect(html.match(/(?:min-h-11|size-11)/g)?.length).toBeGreaterThanOrEqual(9);
    expect(html).toContain("sticky top-0");
    const tinySizes = [...html.matchAll(/text-\[(0\.\d+)rem\]/gu)]
      .map((match) => Number(match[1]))
      .filter((rem) => rem * 16 < 11);
    expect(tinySizes).toEqual([]);
  });

  it("offers a direct return to selected-item settings from another tab", () => {
    const html = renderNavigator(
      { primary: "layers", image: "quick", document: "canvas" },
      "text",
    );

    expect(html).toContain("텍스트 설정");
    expect(html).toContain("선택한 그림·글자·말풍선의 설정을 바로 엽니다");
    expect(html).toContain("설정 열기");
  });

  it("treats a marquee count as a selection and summarizes it as generic items", () => {
    const html = renderNavigator(
      { primary: "properties", image: "quick", document: "canvas" },
      null,
      undefined,
      undefined,
      3,
    );

    expect(html).toContain("3개 항목");
    expect(html).not.toContain("3개 이미지");
  });

  it("opens the unified search scoped to the current settings panel instead of a second search box", () => {
    const seen: StudioCommandSearchRequest[] = [];
    const unsubscribe = subscribeStudioCommandSearchRequests((request) => seen.push(request));
    try {
      render(
        <StudioInspectorNavigator
          layout={{ primary: "properties", image: "quick", document: "canvas" }}
          tabA11y={TAB_A11Y}
          selectedType={null}
          selectionLabel={null}
          drawing={false}
          layerCount={0}
          onChange={noop}
        />,
      );
      expect(screen.queryByRole("searchbox")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "기능·설정 찾기" }));
      expect(seen).toEqual([{ scope: "inspector" }]);
      expect(requestStudioCommandSearch()).toBe(true);
    } finally {
      unsubscribe();
    }
  });

  it("focuses the active selected-item tab after the contextual CTA opens it", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const onChange = vi.fn();

    function NavigatorHarness() {
      const [layout, setLayout] = useState<StudioInspectorLayout>({
        primary: "layers",
        image: "quick",
        document: "canvas",
      });
      return (
        <StudioInspectorNavigator
          layout={layout}
          tabA11y={TAB_A11Y}
          selectedType={null}
          selectionLabel={null}
          selectionCount={2}
          drawing={false}
          layerCount={2}
          onChange={(next) => {
            onChange(next);
            setLayout(next);
          }}
        />
      );
    }

    render(<NavigatorHarness />);

    fireEvent.click(screen.getByRole("button", { name: /설정 열기/u }));

    expect(onChange).toHaveBeenCalledWith({
      primary: "properties",
      image: "quick",
      document: "canvas",
    });
    const propertiesTab = screen.getByRole("tab", { name: "선택 항목" });
    expect(propertiesTab.getAttribute("aria-selected")).toBe("true");
    expect(propertiesTab).toBe(document.activeElement);
  });

  it("returns to editing from the 게시 준비 mode", () => {
    const onChange = vi.fn();
    render(
      <StudioInspectorNavigator
        layout={{ primary: "publish", image: "quick", document: "canvas" }}
        tabA11y={TAB_A11Y}
        selectedType={null}
        selectionLabel={null}
        drawing={false}
        layerCount={0}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "편집으로 돌아가기" }));
    expect(onChange).toHaveBeenCalledWith({
      primary: "properties",
      image: "quick",
      document: "canvas",
    });
  });
});
