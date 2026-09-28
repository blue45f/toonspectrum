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
    hitTarget: boolean; blocking: string; width: number; height: number;
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
    if (!action.disabled && !action.hitTarget) {
      issues.push(`${action.label}: 다른 요소가 입력을 가로막습니다(${action.blocking || "미상"})`);
    }
  }
  return issues;
}

export const PANEL_SELECTOR = '[aria-labelledby="studio-filter-dialog-title"]';

/**
 * 뷰포트 변경 뒤 패널이 이동을 멈출 때까지 기다린 뒤에만 잰다.
 * 고정 대기는 느린 러너에서 전환 중 프레임을 재게 되어, 실제로는 가려지지 않은
 * 실행 영역을 가려진 것으로 판정했다. 연속 두 프레임의 사각형이 같으면 정지로 본다.
 */
export async function waitForStudioFilterLayoutSettled(page: Page): Promise<void> {
  const panel = page.locator(PANEL_SELECTOR);
  await panel.waitFor({ state: "visible", timeout: 45_000 });
  await page.evaluate(async (selector) => {
    const target = document.querySelector(selector);
    if (!target) throw new Error("필터 창이 없어 반응형 측정을 진행할 수 없습니다.");
    let previous = `${target.getBoundingClientRect().left},${target.getBoundingClientRect().top}`;
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise<void>((resolve) => { requestAnimationFrame(() => { resolve(); }); });
      const box = target.getBoundingClientRect();
      const current = `${box.left},${box.top},${box.width},${box.height}`;
      if (current === previous) return;
      previous = current;
    }
  }, PANEL_SELECTOR);
}

export async function measureStudioFilterResponsiveLayout(page: Page): Promise<StudioFilterResponsiveLayout> {
  return page.locator(PANEL_SELECTOR).evaluate((panel) => {
    const bounds = panel.getBoundingClientRect();
    const body = panel.querySelector('[data-studio-filter-scroll-region="true"]');
    const actions = [...panel.querySelectorAll<HTMLButtonElement>("footer button")].map((button) => {
      const box = button.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      const clear = hit === button || button.contains(hit);
      return {
        label: button.textContent?.trim() ?? "이름 없는 버튼", disabled: button.disabled,
        withinViewport: box.left >= -0.5 && box.top >= -0.5
          && box.right <= innerWidth + 0.5 && box.bottom <= innerHeight + 0.5,
        withinPanel: box.left >= bounds.left - 0.5 && box.top >= bounds.top - 0.5
          && box.right <= bounds.right + 0.5 && box.bottom <= bounds.bottom + 0.5,
        hitTarget: clear,
        blocking: clear || !hit ? "" : `${hit.tagName.toLowerCase()}`
          + (hit.id ? `#${hit.id}` : "")
          + [...hit.classList].slice(0, 3).map((name) => `.${name}`).join("")
          + [...hit.attributes]
            .filter((attribute) => attribute.name.startsWith("data-")
              || attribute.name === "role" || attribute.name === "aria-label")
            .slice(0, 3)
            .map((attribute) => `[${attribute.name}="${attribute.value.slice(0, 40)}"]`)
            .join(""),
        width: box.width, height: box.height,
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
