import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReaderPreviewPanel, type ReaderPreviewPage } from "./ReaderPreviewPanel";

const { createPortalMock } = vi.hoisted(() => ({
  createPortalMock: vi.fn((children: unknown) => children),
}));

vi.mock("react-dom", () => ({
  createPortal: createPortalMock,
}));

vi.mock("../StudioPageThumbnails", () => ({
  StudioPageThumbnail: ({ page }: { page: ReaderPreviewPage }) => (
    <div data-page-thumbnail={page.id} />
  ),
}));

vi.mock("@/shared/lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/i18n")>();
  return {
    ...actual,
    useT: () => (key: string) => key,
  };
});

function makePage(
  id: string,
  elements: ReaderPreviewPage["elements"],
  canvasH = 1_280,
): ReaderPreviewPage {
  return { id, name: id, elements, bg: "#ffffff", bgGrad: null, canvasH };
}

function renderPanel(pages: ReaderPreviewPage[]): string {
  vi.stubGlobal("document", { body: { nodeName: "BODY" } });
  return renderToStaticMarkup(
    <ReaderPreviewPanel
      open
      onClose={() => undefined}
      pages={pages}
      currentPageId={pages[0]?.id ?? ""}
    />,
  );
}

describe("ReaderPreviewPanel", () => {
  afterEach(() => {
    createPortalMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("독자 뷰 다이얼로그를 390px 프레임으로 렌더한다", () => {
    const html = renderPanel([makePage("p1", [])]);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("reader.preview.title");
    expect(html).toContain("390px");
  });

  it("열려 있지 않으면 아무것도 렌더하지 않는다", () => {
    vi.stubGlobal("document", { body: { nodeName: "BODY" } });
    const html = renderToStaticMarkup(
      <ReaderPreviewPanel open={false} onClose={() => undefined} pages={[]} currentPageId="" />,
    );
    expect(html).toBe("");
  });

  it("긴 컷 경고를 체크리스트에 표시한다", () => {
    // 3화면 초과 컷: 3.5 * 844 / (390/720)
    const tallCut = (3.5 * 844) / (390 / 720);
    const html = renderPanel([
      makePage("p1", [{ id: "c1", type: "frame", y: 0, height: tallCut }], 4_000),
    ]);
    expect(html).toContain("reader.preview.checklistTitle");
    expect(html).toContain("과도하게 긴 컷");
  });

  it("짧은 컷 경고를 체크리스트에 표시한다", () => {
    const shortCut = (0.3 * 844) / (390 / 720);
    const html = renderPanel([
      makePage("p1", [{ id: "c1", type: "frame", y: 0, height: shortCut }]),
    ]);
    expect(html).toContain("과도하게 짧은 컷");
  });

  it("작은 대사 폰트 경고를 마커와 함께 표시한다", () => {
    const html = renderPanel([
      makePage("p1", [
        { id: "b1", type: "bubble", text: "대사", fontSize: 20, y: 100, height: 60 },
      ]),
    ]);
    expect(html).toContain("대사가 너무 작습니다");
  });

  it("컷 간격 밴드와 안전영역 가이드를 렌더한다", () => {
    const html = renderPanel([
      makePage("p1", [
        { id: "c1", type: "frame", y: 0, height: 600 },
        { id: "c2", type: "frame", y: 700, height: 600 },
      ]),
    ]);
    // 컷 간격 밴드: 점선 스타일 + title/라벨에 gapLabel 키가 꽂힌다
    // (useT mock 이 키를 그대로 돌려주므로 구조로 검증)
    expect(html).toContain("border-dotted border-accent/60");
    expect(html).toContain('title="reader.preview.gapLabel"');
    // 안전영역 가이드 라벨
    expect(html).toContain("reader.preview.safeAreaLabel");
    // 컷 밴드의 화면 수 라벨
    expect(html).toContain("reader.preview.screenUnit");
  });

  it("자동 스크롤 컨트롤을 렌더한다", () => {
    const html = renderPanel([makePage("p1", [])]);
    expect(html).toContain("reader.preview.autoScroll");
    expect(html).toContain("reader.preview.speed.slow");
    expect(html).toContain("reader.preview.speed.normal");
    expect(html).toContain("reader.preview.speed.fast");
  });

  it("문제가 없으면 빈 체크리스트 안내를 표시한다", () => {
    const okCut = (1.2 * 844) / (390 / 720);
    const html = renderPanel([
      makePage("p1", [{ id: "c1", type: "frame", y: 0, height: okCut }]),
    ]);
    expect(html).toContain("reader.preview.noWarnings");
    expect(html).not.toContain("과도하게 긴 컷");
  });
});
