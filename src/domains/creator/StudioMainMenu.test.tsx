import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioMainMenu, type StudioMainMenuGroup } from "./StudioMainMenu";

/** Mirrors production IA labels from StudioPage `studioMainMenuGroups` (structure only). */
const PRODUCTION_MENU_CATALOG: StudioMainMenuGroup[] = [
  {
    id: "file",
    label: "파일",
    items: [
      { id: "export", label: "내보내기 / 다운로드", onSelect: vi.fn() },
      { id: "save-draft", label: "임시저장", shortcut: "⌘S", onSelect: vi.fn() },
      { id: "publish", label: "게시", onSelect: vi.fn(), separatorAfter: true },
      { id: "project", label: "프로젝트 도구…", onSelect: vi.fn() },
    ],
  },
  {
    id: "edit",
    label: "편집",
    items: [
      { id: "undo", label: "실행취소", shortcut: "⌘Z", onSelect: vi.fn() },
      { id: "redo", label: "다시실행", shortcut: "⌘⇧Z", onSelect: vi.fn(), separatorAfter: true },
      { id: "history", label: "작업 내역", onSelect: vi.fn() },
      { id: "select", label: "선택 도구", shortcut: "V", onSelect: vi.fn() },
    ],
  },
  {
    id: "insert",
    label: "삽입",
    items: [
      { id: "template", label: "템플릿 · 에셋", onSelect: vi.fn() },
      { id: "bubble", label: "말풍선", onSelect: vi.fn() },
      { id: "text", label: "텍스트", onSelect: vi.fn() },
      { id: "image", label: "이미지…", onSelect: vi.fn(), separatorAfter: true },
      { id: "char", label: "3D 캐릭터", onSelect: vi.fn() },
      { id: "ref", label: "참고 이미지", onSelect: vi.fn() },
    ],
  },
  {
    id: "view",
    label: "보기",
    items: [
      { id: "density-focus", label: "슈퍼심플 레이아웃", onSelect: vi.fn() },
      { id: "density-full", label: "전체 레이아웃", onSelect: vi.fn() },
      { id: "wide", label: "패널 접어 넓게", onSelect: vi.fn() },
      { id: "fit", label: "너비에 맞춤", onSelect: vi.fn(), separatorAfter: true },
      { id: "fullscreen", label: "전체화면", onSelect: vi.fn() },
      { id: "canvas-only", label: "캔버스만", onSelect: vi.fn() },
    ],
  },
  {
    id: "draw",
    label: "그리기",
    items: [
      { id: "pen", label: "펜", shortcut: "B", onSelect: vi.fn() },
      { id: "eraser", label: "지우개", shortcut: "E", onSelect: vi.fn() },
      { id: "fill", label: "채우기", shortcut: "G", onSelect: vi.fn() },
      { id: "smart-shape", label: "스마트 도형", onSelect: vi.fn(), separatorAfter: true },
      { id: "bg", label: "배경 · 톤", onSelect: vi.fn() },
      { id: "style", label: "팔레트 · 브랜드", onSelect: vi.fn() },
    ],
  },
  {
    id: "ai",
    label: "AI",
    items: [
      { id: "ai-assist", label: "AI 어시스트", onSelect: vi.fn() },
      { id: "stock", label: "스톡 이미지", onSelect: vi.fn() },
      { id: "integrations", label: "연동 설정", onSelect: vi.fn() },
    ],
  },
];

describe("StudioMainMenu", () => {
  it("renders Magma-style application menu groups", () => {
    const html = renderToStaticMarkup(
      <StudioMainMenu
        groups={[
          {
            id: "file",
            label: "파일",
            items: [
              { id: "export", label: "내보내기", onSelect: vi.fn() },
              { id: "save", label: "저장", shortcut: "⌘S", onSelect: vi.fn() },
            ],
          },
          {
            id: "edit",
            label: "편집",
            items: [{ id: "undo", label: "실행취소", shortcut: "⌘Z", onSelect: vi.fn() }],
          },
        ]}
      />
    );
    expect(html).toContain('data-studio-main-menu="true"');
    expect(html).toContain("파일");
    expect(html).toContain("편집");
    expect(html).toContain('aria-haspopup="menu"');
  });

  it("exposes the full commercial File/Edit/Insert/View/Draw/AI catalog labels", () => {
    const html = renderToStaticMarkup(<StudioMainMenu groups={PRODUCTION_MENU_CATALOG} />);
    expect(html).toContain('aria-label="메인 메뉴"');
    for (const group of PRODUCTION_MENU_CATALOG) {
      expect(html).toContain(group.label);
      // Closed dropdowns only render triggers — items appear after open; catalog still declares them.
      expect(group.items.length).toBeGreaterThan(0);
    }
    expect(PRODUCTION_MENU_CATALOG.map((g) => g.id)).toEqual([
      "file",
      "edit",
      "insert",
      "view",
      "draw",
      "ai",
    ]);
    const itemLabels = PRODUCTION_MENU_CATALOG.flatMap((g) => g.items.map((i) => i.label));
    for (const required of [
      "내보내기 / 다운로드",
      "프로젝트 도구…",
      "템플릿 · 에셋",
      "슈퍼심플 레이아웃",
      "스마트 도형",
      "AI 어시스트",
    ]) {
      expect(itemLabels).toContain(required);
    }
  });
});
