import type { Page } from "playwright";

export interface StudioFilterResponsiveLayout {
  readonly width: number;
  readonly height: number;
  readonly theme: string;
  readonly bodyHeight: number;
  readonly panelWithinViewport: boolean;
  readonly panelOverflowX: number;
  readonly actions: ReadonlyArray<{
    label: string; disabled: boolean; withinViewport: boolean; withinPanel: boolean;
    hitTarget: boolean; width: number; height: number;
  }>;
}

/** 비활성 버튼도 화면 안에 있어야 하며, 활성 버튼은 실제 포인터 목표여야 한다. */
export function studioFilterResponsiveLayoutIssues(layout: StudioFilterResponsiveLayout): string[] {
  const issues: string[] = [];
  if (!layout.panelWithinViewport) issues.push("필터 창이 뷰포트 밖에 있습니다");
  if (layout.panelOverflowX > 1) issues.push("필터 창에 가로 넘침이 있습니다");
  if (layout.bodyHeight < 44) issues.push("필터 본문에 한 개의 터치 컨트롤 높이도 확보되지 않았습니다");
  if (layout.actions.length !== 2) issues.push("취소와 적용 두 동작이 모두 있어야 합니다");
  for (const action of layout.actions) {
    if (!action.withinViewport || !action.withinPanel) issues.push(`${action.label}: 실행 영역이 잘렸습니다`);
    if (action.width < 40 || action.height < 40) issues.push(`${action.label}: 실행 영역이 너무 작습니다`);
    if (!action.disabled && !action.hitTarget) issues.push(`${action.label}: 다른 요소가 입력을 가로막습니다`);
  }
  return issues;
}

export async function measureStudioFilterResponsiveLayout(page: Page): Promise<StudioFilterResponsiveLayout> {
  return page.locator('[aria-labelledby="studio-filter-dialog-title"]').evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    const body = panel.querySelector('[data-studio-filter-scroll-region="true"]');
    const actions = [...panel.querySelectorAll<HTMLButtonElement>("footer button")].map((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        label: button.textContent?.trim() ?? "이름 없는 버튼", disabled: button.disabled,
        withinViewport: box.left >= -0.5 && box.top >= -0.5
          && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
        withinPanel: box.left >= bounds.left - 0.5 && box.top >= bounds.top - 0.5
          && box.right <= bounds.right + 0.5 && box.bottom <= bounds.bottom + 0.5,
        hitTarget: hit === button || button.contains(hit), width: box.width, height: box.height,
      };
    });
    return {
      width: innerWidth, height: innerHeight, theme: document.documentElement.dataset.designTheme ?? "dark",
      bodyHeight: body?.getBoundingClientRect().height ?? 0,
      panelWithinViewport: bounds.left >= -0.5 && bounds.top >= -0.5
        && bounds.right <= innerWidth + 0.5 && bounds.bottom <= innerHeight + 0.5,
      panelOverflowX: panel.scrollWidth - panel.clientWidth, actions,
    };
  });
}
