import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioMainMenu } from "./StudioMainMenu";

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
});
