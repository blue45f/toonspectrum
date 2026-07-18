import { readFileSync } from "node:fs";

import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioFilterDialog } from "./StudioFilterDialog";

const filterDialogSource = readFileSync(
  new URL("./StudioFilterDialog.tsx", import.meta.url),
  "utf8",
);

function renderMotionFilterDialog(mutationLocked = false): string {
  return renderToStaticMarkup(
    <StudioFilterDialog
      activeKey="filter:motion-blur"
      kind="motion-blur"
      image={{}}
      initialDraft={{ kind: "motion-blur", distance: 12, angle: -45 }}
      rootRef={createRef<HTMLElement>()}
      mutationLocked={mutationLocked}
      onPreview={vi.fn()}
      onApply={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe("StudioFilterDialog", () => {
  it("renders a narrow-screen-safe number layout and keeps signed values visible", () => {
    const html = renderMotionFilterDialog();

    expect(html).toContain("grid-cols-[minmax(0,1fr)_5.5rem]");
    expect(html).toContain(
      "min-[420px]:grid-cols-[minmax(5rem,1fr)_minmax(0,2fr)_5.5rem]",
    );
    expect(html).toContain('aria-label="각도 숫자"');
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('value="-45"');
  });

  it("preserves empty and negative editing drafts until blur or Enter commits them", () => {
    expect(filterDialogSource).toContain(
      "const [numberDraft, setNumberDraft] = useState<string | null>(null)",
    );
    expect(filterDialogSource).toContain("isEditableNumberDraft(event.target.value)");
    expect(filterDialogSource).toContain('normalized === ""');
    expect(filterDialogSource).toContain('normalized === "-"');
    expect(filterDialogSource).toContain(
      "onBlur={(event) => commitNumberDraft(event.currentTarget.value)}",
    );
    expect(filterDialogSource).toContain('if (event.key === "Enter")');
    expect(filterDialogSource).not.toContain('type="number"');
  });

  it("hides the pointer backdrop from assistive technology without hiding the dialog", () => {
    const html = renderMotionFilterDialog();

    expect(html).toContain(
      'tabindex="-1" aria-hidden="true" data-studio-modal-backdrop="true"',
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-describedby="studio-filter-dialog-description"');
    expect(html).not.toContain('aria-label="필터 창 닫기"');
  });

  it("uses at least 44px mobile and coarse-pointer targets for frequent actions", () => {
    const html = renderMotionFilterDialog();

    expect(html).toContain("h-11 w-full cursor-pointer");
    expect(html).toContain("pointer-coarse:h-11");
    expect(html).toContain("size-11 shrink-0");
    expect(html).toContain("pointer-coarse:size-11");
    expect(html.match(/min-h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(html.match(/pointer-coarse:min-h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("explains a locked mutation visibly and to assistive technology", () => {
    const html = renderMotionFilterDialog(true);

    expect(html).toContain(
      'aria-describedby="studio-filter-dialog-description studio-filter-lock-message"',
    );
    expect(html).toContain('id="studio-filter-lock-message"');
    expect(html).toContain('role="status"');
    expect(html).toContain("선택한 이미지 또는 문서가 잠겨 있어 적용할 수 없습니다.");
    expect(html).toContain(
      'disabled="" aria-describedby="studio-filter-lock-message"',
    );
    expect(html).toContain(">적용</button>");
    expect(html).not.toContain(">저장</button>");
  });
});
