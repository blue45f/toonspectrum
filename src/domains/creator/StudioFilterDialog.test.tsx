import { readFileSync } from "node:fs";

import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StudioFilterDialog } from "./StudioFilterDialog";

const filterDialogSource = readFileSync(
  new URL("./StudioFilterDialog.tsx", import.meta.url),
  "utf8",
);

function renderMotionFilterDialog(
  mutationLocked = false,
  targetKind: "image" | "page-composite" = "image",
  options: { applying?: boolean; mutationLockReason?: string } = {},
): string {
  return renderToStaticMarkup(
    <StudioFilterDialog
      activeKey="filter:motion-blur"
      kind="motion-blur"
      image={{}}
      initialDraft={{ kind: "motion-blur", distance: 12, angle: -45 }}
      rootRef={createRef<HTMLElement>()}
      targetKind={targetKind}
      mutationLocked={mutationLocked}
      mutationLockReason={options.mutationLockReason}
      applying={options.applying}
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

  it("keeps image targeting as the default non-destructive workflow", () => {
    const html = renderMotionFilterDialog();

    expect(html).toContain("선택한 이미지 레이어에 비파괴 필터로 적용합니다.");
    expect(html).not.toContain('id="studio-filter-composite-notice"');
  });

  it("explains page compositing, source preservation, and one-step undo accessibly", () => {
    const html = renderMotionFilterDialog(false, "page-composite");

    expect(html).toContain(
      'aria-describedby="studio-filter-dialog-description studio-filter-composite-notice"',
    );
    expect(html).toContain(
      "현재 보이는 페이지를 편집 가능한 합성 레이어로 만들고, 원본 레이어를 보존한 채 필터를 적용합니다.",
    );
    expect(html).toContain('id="studio-filter-composite-notice" role="note"');
    expect(html).toContain("원본은 그대로 유지됩니다.");
    expect(html).toContain(
      "적용 후 실행 취소 한 번으로 새 합성 레이어만 제거할 수 있습니다.",
    );
  });

  it("describes both page compositing and the lock state when mutation is blocked", () => {
    const html = renderMotionFilterDialog(true, "page-composite");

    expect(html).toContain(
      'aria-describedby="studio-filter-dialog-description studio-filter-composite-notice studio-filter-lock-message"',
    );
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

  it("uses the exact supplied mutation lock reason instead of the generic copy", () => {
    const reason = "공동 편집 동기화 중에는 필터 레이어를 추가할 수 없습니다.";
    const html = renderMotionFilterDialog(true, "image", {
      mutationLockReason: reason,
    });

    expect(html).toContain(`role="status" aria-live="polite" aria-atomic="true"`);
    expect(html).toContain(reason);
    expect(html).not.toContain("선택한 이미지 또는 문서가 잠겨 있어 적용할 수 없습니다.");
    expect(html).toContain('aria-describedby="studio-filter-lock-message"');
  });

  it("announces an in-flight apply, blocks reset and apply re-entry, and keeps dismissal available", () => {
    const html = renderMotionFilterDialog(false, "page-composite", { applying: true });

    expect(html.match(/aria-busy="true"/g)?.length ?? 0).toBe(2);
    expect(html).toContain(">적용 중…</button>");
    expect(html).not.toContain(">적용</button>");
    expect(html.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/<button type="button"[^>]*>취소<\/button>/);
    expect(html).toMatch(/<button type="button"[^>]*aria-label="[^"]+ 닫기"[^>]*>/);
    expect(filterDialogSource).toContain("if (applying) return;");
    expect(filterDialogSource).toContain("if (mutationLocked || applying) return;");
  });

  it("keeps brightness and contrast controls inside the renderer's exact ±80 range", () => {
    expect(filterDialogSource).toMatch(/label="밝기\/명도"[\s\S]*?min=\{-80\}[\s\S]*?max=\{80\}/u);
    expect(filterDialogSource).toMatch(/label="명도"[\s\S]*?min=\{-80\}[\s\S]*?max=\{80\}/u);
    expect(filterDialogSource).toMatch(/label="대비"[\s\S]*?min=\{-80\}[\s\S]*?max=\{80\}/u);
  });

  it("renders schema-driven sliders for filter-pack kinds (vignette)", () => {
    const html = renderToStaticMarkup(
      <StudioFilterDialog
        activeKey="filter:vignette"
        kind="vignette"
        image={{}}
        rootRef={createRef<HTMLElement>()}
        onPreview={vi.fn()}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain(">비네트</h2>");
    for (const label of ["어둡기", "크기", "둥글기", "페더"]) {
      expect(html).toContain(`>${label}</label>`);
      expect(html).toContain(`aria-label="${label} 숫자"`);
    }
    // 첫 파라미터가 초기 포커스 대상이다.
    expect(html).toContain('data-autofocus="true"');
  });

  it("renders native color pickers for the duotone filter-pack kind", () => {
    const html = renderToStaticMarkup(
      <StudioFilterDialog
        activeKey="filter:duotone"
        kind="duotone"
        image={{ duotoneShadow: "#102030", duotoneHighlight: "#f0e0d0" }}
        rootRef={createRef<HTMLElement>()}
        onPreview={vi.fn()}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain(">세피아 / 듀오톤</h2>");
    expect(html.match(/type="color"/g)?.length ?? 0).toBe(2);
    // 현재 이미지의 듀오톤 색을 되읽어 초기값으로 쓴다(다시 열기 패리티).
    expect(html).toContain('value="#102030"');
    expect(html).toContain('value="#f0e0d0"');
    expect(html).toContain("어두운 영역 색");
    expect(html).toContain("밝은 영역 색");
  });

  it("reopens a filter-pack kind from a stored last-filter draft", () => {
    const html = renderToStaticMarkup(
      <StudioFilterDialog
        activeKey="filter:mosaic"
        kind="mosaic"
        image={{}}
        initialDraft={{ kind: "mosaic", values: { cell: 24 } }}
        rootRef={createRef<HTMLElement>()}
        onPreview={vi.fn()}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain(">모자이크 / 픽셀화</h2>");
    expect(html).toContain('value="24"');
  });
});
