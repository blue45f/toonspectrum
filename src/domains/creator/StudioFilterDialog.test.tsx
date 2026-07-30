// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_CREATOR_PACK_CATALOG } from "./studio-creator-pack-catalog";
import {
  installStudioCreatorPack,
  type StudioCreatorPackStorage,
} from "./studio-creator-pack-runtime";
import { STUDIO_FILTER_DIALOG_CATALOG } from "./studio-filter-catalog";
import { StudioFilterDialog } from "./StudioFilterDialog";

const filterDialogCatalogCount = STUDIO_FILTER_DIALOG_CATALOG.length;
const transformFilterCount = STUDIO_FILTER_DIALOG_CATALOG.filter(
  ({ group }) => group === "transform",
).length;

const filterDialogSource = readFileSync(
  resolve(process.cwd(), "src/domains/creator/StudioFilterDialog.tsx"),
  "utf8",
);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

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

function renderInteractiveMotionFilterDialog() {
  const onApply = vi.fn();
  render(
    <StudioFilterDialog
      activeKey="filter:motion-blur"
      kind="motion-blur"
      image={{}}
      initialDraft={{ kind: "motion-blur", distance: 12, angle: -45 }}
      rootRef={createRef<HTMLElement>()}
      onPreview={vi.fn()}
      onApply={onApply}
      onClose={vi.fn()}
    />,
  );
  return { onApply };
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

  it("surfaces an installed Creator Pack preset in the matching live filter dialog", () => {
    const values = new Map<string, string>();
    const target: StudioCreatorPackStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    const filterPack = STUDIO_CREATOR_PACK_CATALOG.find(
      (pack) => pack.metadata.kind === "filter",
    )!;
    expect(installStudioCreatorPack(filterPack, target, 1_000).status).toBe("installed");
    vi.stubGlobal("localStorage", target);
    try {
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
      expect(html).toContain("설치한 Creator Pack 프리셋");
      expect(html).toContain("대사 집중 비네트");
      expect(html).not.toContain("야간 듀오톤");
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("renders deterministic union-wave controls with edge and alpha behavior explained", () => {
    const html = renderToStaticMarkup(
      <StudioFilterDialog
        activeKey="filter:ripple-warp"
        kind="ripple-warp"
        image={{}}
        rootRef={createRef<HTMLElement>()}
        onPreview={vi.fn()}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain(">원형 리플</h2>");
    for (const label of ["진폭", "파장", "중심 X", "중심 Y", "위상"]) {
      expect(html).toContain(`>${label}</label>`);
    }
    expect(html).toContain("가장자리는 반복 없이 고정해 빈 틈을 막고");
    expect(html).toContain("투명도는 원본 그대로");
    expect(html).toContain("같은 시드는 언제나 같은 결과");
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

  it("opens a narrow-safe visual gallery and searches the applicable catalog", () => {
    renderInteractiveMotionFilterDialog();

    const gallery = screen.getByRole("region", { name: "필터 갤러리" });
    const openButton = within(gallery).getByRole("button", {
      name: /다른 필터 둘러보기/,
    });
    expect(openButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(openButton);
    expect(openButton.getAttribute("aria-expanded")).toBe("true");
    expect(within(gallery).getByText(`${filterDialogCatalogCount}개 필터`)).toBeTruthy();
    expect(within(gallery).getAllByRole("button", { name: /필터 선택$/ }))
      .toHaveLength(filterDialogCatalogCount);

    fireEvent.change(within(gallery).getByRole("searchbox", { name: "필터 검색" }), {
      target: { value: "CRT" },
    });
    expect(within(gallery).getByText("1개 필터")).toBeTruthy();
    expect(
      within(gallery).getByRole("button", { name: "스캔라인 (CRT) 필터 선택" }),
    ).toBeTruthy();
  });

  it("filters by category and keeps every gallery control touch-safe", () => {
    renderInteractiveMotionFilterDialog();
    const gallery = screen.getByRole("region", { name: "필터 갤러리" });
    fireEvent.click(
      within(gallery).getByRole("button", { name: /다른 필터 둘러보기/ }),
    );
    fireEvent.click(within(gallery).getByRole("button", { name: "변형" }));

    expect(within(gallery).getByText(`${transformFilterCount}개 필터`)).toBeTruthy();
    expect(within(gallery).getAllByRole("button", { name: /필터 선택$/ }))
      .toHaveLength(transformFilterCount);
    expect(filterDialogSource).toContain("min-h-11 w-full min-w-0");
    expect(filterDialogSource).toContain("grid-cols-2");
    expect(filterDialogSource).toContain("max-h-[min(44dvh,24rem)]");
  });

  it("persists filter favorites locally and restores the favorites view", () => {
    const first = renderInteractiveMotionFilterDialog();
    const firstGallery = screen.getByRole("region", { name: "필터 갤러리" });
    fireEvent.click(
      within(firstGallery).getByRole("button", { name: /다른 필터 둘러보기/ }),
    );
    fireEvent.click(
      within(firstGallery).getByRole("button", { name: "글리치 즐겨찾기 추가" }),
    );
    expect(
      within(firstGallery).getByRole("button", { name: "글리치 즐겨찾기 해제" }),
    ).toBeTruthy();
    expect(first.onApply).not.toHaveBeenCalled();

    cleanup();
    renderInteractiveMotionFilterDialog();
    const secondGallery = screen.getByRole("region", { name: "필터 갤러리" });
    fireEvent.click(
      within(secondGallery).getByRole("button", { name: /다른 필터 둘러보기/ }),
    );
    fireEvent.click(within(secondGallery).getByRole("button", { name: "즐겨찾기" }));
    expect(
      within(secondGallery).getByRole("button", { name: "글리치 필터 선택" }),
    ).toBeTruthy();
  });

  it("switches filter kinds in place, remembers recents, and preserves apply semantics", () => {
    const { onApply } = renderInteractiveMotionFilterDialog();
    const gallery = screen.getByRole("region", { name: "필터 갤러리" });
    fireEvent.click(
      within(gallery).getByRole("button", { name: /다른 필터 둘러보기/ }),
    );
    fireEvent.change(within(gallery).getByRole("searchbox", { name: "필터 검색" }), {
      target: { value: "렌즈 플레어" },
    });
    fireEvent.click(
      within(gallery).getByRole("button", { name: "렌즈 플레어 필터 선택" }),
    );

    expect(screen.getByRole("heading", { name: "렌즈 플레어" })).toBeTruthy();
    expect(
      within(gallery).getByRole("button", { name: /다른 필터 둘러보기/ })
        .getAttribute("aria-expanded"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[1]).toMatchObject({ kind: "lens-flare" });
  });
});
