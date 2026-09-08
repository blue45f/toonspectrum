import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioSelectionWorkbenchPanel } from "./StudioSelectionWorkbenchPanel";
import {
  EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
  encodeStudioSavedSelectionLibrary,
  studioSavedSelectionStorageKey,
  upsertStudioSavedSelection,
  type StudioSelectionStorage,
} from "./studio-saved-selections";
import {
  emptyPixelSelection,
  rectSelectionPolygon,
} from "./studio-selection-tools";

const selection = {
  ...emptyPixelSelection(),
  featherPx: 3,
  subpaths: [{
    mode: "add" as const,
    points: rectSelectionPolygon({ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.8 }),
  }],
};

class MemoryStorage implements StudioSelectionStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function renderPanel(
  overrides: Partial<Parameters<typeof StudioSelectionWorkbenchPanel>[0]> = {},
) {
  return renderToStaticMarkup(
    <StudioSelectionWorkbenchPanel
      selection={selection}
      operation="replace"
      imageSource="data:image/png;base64,AAAA"
      scopeKey="image-1"
      onCommitSelection={vi.fn()}
      storage={null}
      {...overrides}
    />,
  );
}

function openingButtonForLabel(html: string, label: string): string {
  const labelIndex = html.indexOf(`aria-label="${label}"`);
  if (labelIndex < 0) return "";
  const start = html.lastIndexOf("<button", labelIndex);
  const end = html.indexOf(">", labelIndex);
  return html.slice(start, end + 1);
}

describe("StudioSelectionWorkbenchPanel", () => {
  it("exposes opacity, local subject, smoothing, and named-selection workflows", () => {
    const html = renderPanel({ operation: "intersect" });

    expect(html).toContain('data-studio-selection-workbench="true"');
    expect(html).toContain("선택 작업대");
    expect(html).toContain(">교차<");
    expect(html).toContain('aria-label="레이어 불투명도로 픽셀 선택"');
    expect(html).toContain('aria-label="로컬 AI로 주요 피사체 선택"');
    expect(html).toContain("피사체 경계 기준");
    expect(html).toContain('aria-label="선택 경계 가볍게 스무딩"');
    expect(html).toContain('aria-label="선택 경계 균형 스무딩"');
    expect(html).toContain('aria-label="선택 경계 강하게 스무딩"');
    expect(html).toContain('aria-label="현재 픽셀 선택 저장"');
    expect(html).toContain("프로젝트 데이터에는 포함되지 않습니다.");
  });

  it("hydrates a scoped saved-selection library from the injected storage boundary", () => {
    const storage = new MemoryStorage();
    const library = upsertStudioSavedSelection(
      EMPTY_STUDIO_SAVED_SELECTION_LIBRARY,
      {
        id: "hero",
        name: "주인공 실루엣",
        selection,
        now: 10,
      },
    );
    storage.setItem(
      studioSavedSelectionStorageKey("image-1"),
      encodeStudioSavedSelectionLibrary(library),
    );
    const html = renderPanel({ storage });

    expect(html).toContain("주인공 실루엣");
    expect(html).toContain('aria-label="주인공 실루엣 선택 불러오기"');
    expect(html).toContain('aria-label="주인공 실루엣 저장 선택 삭제"');
    expect(html).toContain("1개 영역 · 페더 3px");
    expect(html).toContain("1/16");
  });

  it("explains and disables unavailable source and boundary work", () => {
    const noSource = renderPanel({ imageSource: null });
    expect(openingButtonForLabel(noSource, "레이어 불투명도로 픽셀 선택")).toContain('disabled=""');
    expect(openingButtonForLabel(noSource, "로컬 AI로 주요 피사체 선택")).toContain('disabled=""');
    expect(noSource).toContain("검증된 이미지 픽셀을 준비한 뒤");

    const fullImage = renderPanel({
      selection: { ...emptyPixelSelection(), invert: true },
    });
    expect(openingButtonForLabel(fullImage, "선택 경계 균형 스무딩")).toContain('disabled=""');
    expect(fullImage).toContain("자유형 또는 점이 충분한 선택 경계");
  });

  it("locks all entry points while another pixel operation is busy", () => {
    const html = renderPanel({ busy: true });
    expect(openingButtonForLabel(html, "레이어 불투명도로 픽셀 선택")).toContain('disabled=""');
    expect(openingButtonForLabel(html, "로컬 AI로 주요 피사체 선택")).toContain('disabled=""');
    expect(openingButtonForLabel(html, "현재 픽셀 선택 저장")).toContain('disabled=""');
  });
});
