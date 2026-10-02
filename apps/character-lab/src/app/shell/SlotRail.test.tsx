// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ALL_AVAILABLE_CAPABILITIES, CHARACTER_SLOT_KINDS, createPresetCatalog } from "../../contracts";
import { createMockLabStore, MockLabProvider } from "../../testing/mock-store";
import { vocabularyCatalogEntries } from "../../testing/recipe-fixtures";

import { SlotRail } from "./SlotRail";
import { createUiStateStore } from "./ui-state";

afterEach(cleanup);

describe("app/shell/SlotRail", () => {
  it("15칸을 그리고 클릭하면 활성 슬롯이 바뀐다", () => {
    const ui = createUiStateStore();
    const catalog = createPresetCatalog(vocabularyCatalogEntries());
    render(
      <MockLabProvider catalog={catalog} shell={{ ui }}>
        <SlotRail />
      </MockLabProvider>,
    );
    const cells = screen.getAllByRole("button");
    expect(cells).toHaveLength(CHARACTER_SLOT_KINDS.length);
    expect(cells[0]?.getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /헤어/u }));
    expect(ui.getState().activeSlot).toBe("hair");
    expect(screen.getByRole("button", { name: /헤어/u }).getAttribute("aria-current")).toBe("true");
    // 기본 레시피의 헤어 프리셋 라벨이 보인다
    expect(screen.getByRole("button", { name: /헤어/u }).textContent).toContain(catalog.get("hair/soft-bob")?.labelKo ?? "");
  });

  it("미지원·부분 지원 슬롯은 배지와 사유 tooltip을 보여준다", () => {
    const store = createMockLabStore({
      capabilities: {
        ...ALL_AVAILABLE_CAPABILITIES,
        hair: { status: "unavailable", reasonKo: "제작 패키지는 교체형 헤어를 제공하지 않습니다." },
        nose: { status: "partial", reasonKo: "음수 방향 shape key 없음" },
      },
    });
    render(
      <MockLabProvider store={store}>
        <SlotRail />
      </MockLabProvider>,
    );
    const hair = screen.getByRole("button", { name: /헤어/u });
    expect(hair.getAttribute("data-status")).toBe("unavailable");
    expect(hair.getAttribute("title")).toContain("교체형 헤어");
    expect(hair.textContent).toContain("미지원");
    expect(screen.getByRole("button", { name: /코/u }).textContent).toContain("부분");
    expect(screen.getAllByText("없음").length).toBeGreaterThan(0);
  });
});
