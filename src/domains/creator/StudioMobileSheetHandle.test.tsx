import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudioMobileSheetHandle } from "./StudioMobileSheetHandle";

describe("StudioMobileSheetHandle", () => {
  it("renders one semantic 44px drag-and-tap close target with a stable sheet selector", () => {
    const html = renderToStaticMarkup(
      <StudioMobileSheetHandle
        active
        kind="pages"
        label="페이지 시트"
        onDismiss={() => undefined}
        sheetRef={createRef<HTMLElement>()}
      />,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain('data-studio-sheet-drag-handle="true"');
    expect(html).toContain('data-studio-sheet-kind="pages"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("touch-action:none");
    expect(html).toContain("아래로 밀거나 눌러 닫기");
  });

  it("removes an inactive mounted sheet handle from sequential keyboard navigation", () => {
    const html = renderToStaticMarkup(
      <StudioMobileSheetHandle
        active={false}
        kind="props"
        label="속성 시트"
        onDismiss={() => undefined}
        sheetRef={createRef<HTMLElement>()}
      />,
    );

    expect(html).toContain('tabindex="-1"');
  });
});
