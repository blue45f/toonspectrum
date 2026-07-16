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
      { id: "copy-image", label: "이미지를 클립보드로", onSelect: vi.fn(), separatorAfter: true },
      { id: "save-draft", label: "임시저장", shortcut: "⌘S", onSelect: vi.fn() },
      { id: "publish", label: "게시", onSelect: vi.fn(), separatorAfter: true },
      { id: "export-json", label: "백업 (.json)", onSelect: vi.fn() },
      { id: "export-archive", label: "아카이브 백업", onSelect: vi.fn() },
      { id: "import-json", label: "프로젝트 가져오기…", onSelect: vi.fn() },
      { id: "import-psd", label: "PSD 가져오기…", onSelect: vi.fn(), separatorAfter: true },
      { id: "project", label: "프로젝트 도구…", onSelect: vi.fn() },
    ],
  },
  {
    id: "edit",
    label: "편집",
    items: [
      { id: "undo", label: "실행취소", shortcut: "⌘Z", onSelect: vi.fn() },
      { id: "redo", label: "다시실행", shortcut: "⌘⇧Z", onSelect: vi.fn(), separatorAfter: true },
      { id: "copy", label: "복사", shortcut: "⌘C", onSelect: vi.fn() },
      { id: "duplicate", label: "복제", shortcut: "⌘D", onSelect: vi.fn() },
      { id: "delete", label: "삭제", shortcut: "⌫", onSelect: vi.fn(), danger: true, separatorAfter: true },
      { id: "select-all", label: "모두 선택", shortcut: "⌘A", onSelect: vi.fn() },
      { id: "deselect", label: "선택 해제", shortcut: "Esc", onSelect: vi.fn(), separatorAfter: true },
      { id: "history", label: "작업 내역", onSelect: vi.fn() },
      { id: "select", label: "선택 도구", shortcut: "V", onSelect: vi.fn() },
      { id: "eyedropper", label: "스포이드", shortcut: "I", onSelect: vi.fn() },
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
      { id: "bg3d", label: "3D 배경", onSelect: vi.fn() },
      { id: "ref", label: "참고 이미지", onSelect: vi.fn() },
      { id: "page", label: "새 페이지", onSelect: vi.fn() },
    ],
  },
  {
    id: "view",
    label: "보기",
    items: [
      { id: "density-focus", label: "슈퍼심플 레이아웃", onSelect: vi.fn() },
      { id: "density-full", label: "전체 레이아웃", onSelect: vi.fn() },
      { id: "wide", label: "패널 접어 넓게", onSelect: vi.fn() },
      { id: "fit", label: "너비에 맞춤", onSelect: vi.fn() },
      { id: "zoom-in", label: "확대", shortcut: "⌘+", onSelect: vi.fn() },
      { id: "zoom-out", label: "축소", shortcut: "⌘-", onSelect: vi.fn() },
      { id: "zoom-reset", label: "실제 크기 (100%)", onSelect: vi.fn(), separatorAfter: true },
      { id: "fullscreen", label: "전체화면", onSelect: vi.fn() },
      { id: "canvas-only", label: "캔버스만", shortcut: "`", onSelect: vi.fn(), separatorAfter: true },
      { id: "left-panel", label: "왼쪽 패널 보이기", onSelect: vi.fn() },
      { id: "right-panel", label: "속성 패널 보이기", onSelect: vi.fn() },
      { id: "shortcuts", label: "단축키 도움말", shortcut: "?", onSelect: vi.fn() },
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
    expect(html).toContain("data-studio-main-menu-trigger");
  });

  it("exposes the full commercial File/Edit/Insert/View/Draw/AI catalog labels", () => {
    const html = renderToStaticMarkup(<StudioMainMenu groups={PRODUCTION_MENU_CATALOG} />);
    expect(html).toContain('aria-label="메인 메뉴"');
    for (const group of PRODUCTION_MENU_CATALOG) {
      expect(html).toContain(group.label);
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
      "프로젝트 가져오기…",
      "PSD 가져오기…",
      "프로젝트 도구…",
      "복사",
      "복제",
      "삭제",
      "모두 선택",
      "선택 해제",
      "스포이드",
      "템플릿 · 에셋",
      "3D 배경",
      "새 페이지",
      "슈퍼심플 레이아웃",
      "확대",
      "축소",
      "실제 크기 (100%)",
      "단축키 도움말",
      "스마트 도형",
      "AI 어시스트",
    ]) {
      expect(itemLabels).toContain(required);
    }
  });
});
