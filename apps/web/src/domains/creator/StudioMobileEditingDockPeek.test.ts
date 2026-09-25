import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DOCK_SOURCE = readFileSync(
  join(process.cwd(), "apps/web/src/domains/creator/StudioMobileEditingDock.tsx"),
  "utf8",
);

// 펜·지우개·색상·실행 취소·다시 실행·작업 메뉴는 작은 폰에서도 완전히 보여야 한다.
// 실제 브라우저 검증과 함께 슬롯 수가 늘거나 터치 목표가 줄어드는 회귀를 막는다.
const BUTTON_MINIMUM = 44;
const SIDE_PADDING = 6;
const GAP = 4;
const SLOT_COUNT = 6;

describe("studio mobile dock essential action geometry", () => {
  it("keeps six fixed slots and an explicit 44px minimum without a horizontal scroll lane", () => {
    const row = DOCK_SOURCE.slice(
      DOCK_SOURCE.indexOf('data-studio-mobile-primary-actions="true"'),
      DOCK_SOURCE.indexOf('<section id={`${scrollDescriptionId}-colors`}'),
    );
    expect(row).toContain("grid-cols-6");
    expect(row).toContain("gap-1");
    expect(row).not.toContain("overflow-x-auto");
    expect(DOCK_SOURCE).toContain("[&_button]:min-h-[44px] [&_button]:min-w-[44px]");
    expect(DOCK_SOURCE).toContain("pl-[max(6px,env(safe-area-inset-left))]");
    expect(DOCK_SOURCE).toContain("pr-[max(6px,env(safe-area-inset-right))]");
  });

  it.each([320, 360, 390, 412])("fully shows every essential target at %ipx", (viewport) => {
    const availableWidth = viewport - SIDE_PADDING * 2;
    const slotWidth = (availableWidth - GAP * (SLOT_COUNT - 1)) / SLOT_COUNT;
    expect(slotWidth).toBeGreaterThanOrEqual(BUTTON_MINIMUM);
    for (let index = 0; index < SLOT_COUNT; index += 1) {
      const left = SIDE_PADDING + index * (slotWidth + GAP);
      const right = left + slotWidth;
      expect(left).toBeGreaterThanOrEqual(SIDE_PADDING);
      expect(right).toBeLessThanOrEqual(viewport - SIDE_PADDING + 0.01);
    }
  });
});
