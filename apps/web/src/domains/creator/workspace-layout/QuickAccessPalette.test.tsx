// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuickAccessPalette, QUICK_ACCESS_MAX_ITEMS, type QuickAccessCommand } from "./QuickAccessPalette";

afterEach(cleanup);

const CATALOG: QuickAccessCommand[] = [
  { id: "brush", label: "브러시", hint: "B" },
  { id: "eraser", label: "지우개", hint: "E" },
  { id: "fill", label: "채우기", hint: "G" },
];

function addItem(label: string) {
  const select = screen.getByLabelText("추가할 도구·명령 선택");
  fireEvent.change(select, { target: { value: CATALOG.find((c) => c.label === label)!.id } });
  fireEvent.click(screen.getByRole("button", { name: "추가" }));
}

describe("QuickAccessPalette", () => {
  it("팔레트 UI를 렌더링하고 접기/펼치기가 동작한다", () => {
    render(<QuickAccessPalette catalog={CATALOG} />);
    const section = screen.getByLabelText("퀵 액세스");
    expect(section.getAttribute("data-workspace-layout-quick-access")).toBe("true");
    expect(screen.getByText("자주 쓰는 도구나 명령을 등록해 두세요.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "팔레트 접기" }));
    expect(screen.queryByLabelText("추가할 도구·명령 선택")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "팔레트 펼치기" }));
    expect(screen.getByLabelText("추가할 도구·명령 선택")).toBeTruthy();
  });

  it("항목을 등록하고 onItemsChange가 호출된다", () => {
    const onItemsChange = vi.fn();
    render(<QuickAccessPalette catalog={CATALOG} onItemsChange={onItemsChange} />);
    addItem("브러시");
    expect(onItemsChange).toHaveBeenCalledTimes(1);
    expect(onItemsChange.mock.calls[0][0].map((item: QuickAccessCommand) => item.id)).toEqual([
      "brush",
    ]);
    expect(screen.getByText("항목을 추가했어요.")).toBeTruthy();
  });

  it("중복 등록을 막는다", () => {
    render(<QuickAccessPalette catalog={CATALOG} />);
    addItem("브러시");
    // 카탈로그에서 이미 등록된 항목은 선택지에서 제외된다
    const select = screen.getByLabelText("추가할 도구·명령 선택");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options.some((text) => text?.includes("브러시"))).toBe(false);
  });

  it("최대 개수를 초과하면 등록을 막고 안내한다", () => {
    const catalog: QuickAccessCommand[] = Array.from({ length: 14 }, (_, i) => ({
      id: `cmd-${i}`,
      label: `명령 ${i}`,
    }));
    render(
      <QuickAccessPalette
        catalog={catalog}
        initialItems={catalog.slice(0, QUICK_ACCESS_MAX_ITEMS)}
        maxItems={QUICK_ACCESS_MAX_ITEMS}
      />,
    );
    expect(screen.getByText(`등록 ${QUICK_ACCESS_MAX_ITEMS}/${QUICK_ACCESS_MAX_ITEMS}`)).toBeTruthy();

    const select = screen.getByLabelText("추가할 도구·명령 선택");
    fireEvent.change(select, { target: { value: "cmd-12" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(screen.getByText("퀵 액세스는 최대 12개까지 등록할 수 있어요.")).toBeTruthy();
    // 13번째 항목은 등록 목록에 추가되지 않는다
    const list = screen.getByRole("list", { name: "퀵 액세스" });
    expect(within(list).queryByText("명령 12")).toBeNull();
    expect(within(list).getAllByRole("listitem")).toHaveLength(QUICK_ACCESS_MAX_ITEMS);
  });

  it("위로/아래로 이동 버튼으로 순서를 바꾼다", () => {
    const onItemsChange = vi.fn();
    render(<QuickAccessPalette catalog={CATALOG} onItemsChange={onItemsChange} />);
    addItem("브러시");
    addItem("지우개");
    addItem("채우기");

    // "지우개"를 위로 → [지우개, 브러시, 채우기]
    fireEvent.click(screen.getByRole("button", { name: "지우개 위로 이동" }));
    let last = onItemsChange.mock.calls[onItemsChange.mock.calls.length - 1][0];
    expect(last.map((item: QuickAccessCommand) => item.id)).toEqual(["eraser", "brush", "fill"]);

    // "브러시"를 아래로 → [지우개, 채우기, 브러시]
    fireEvent.click(screen.getByRole("button", { name: "브러시 아래로 이동" }));
    last = onItemsChange.mock.calls[onItemsChange.mock.calls.length - 1][0];
    expect(last.map((item: QuickAccessCommand) => item.id)).toEqual(["eraser", "fill", "brush"]);

    // 경계: 첫 항목의 위로 이동·마지막 항목의 아래로 이동 버튼은 비활성
    expect(
      (screen.getByRole("button", { name: "지우개 위로 이동" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "브러시 아래로 이동" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("제거 버튼으로 항목을 삭제한다", () => {
    const onItemsChange = vi.fn();
    render(<QuickAccessPalette catalog={CATALOG} onItemsChange={onItemsChange} />);
    addItem("브러시");
    addItem("지우개");
    fireEvent.click(screen.getByRole("button", { name: "브러시 제거" }));
    const last = onItemsChange.mock.calls[onItemsChange.mock.calls.length - 1][0];
    expect(last.map((item: QuickAccessCommand) => item.id)).toEqual(["eraser"]);
    expect(screen.getByText("항목을 제거했어요.")).toBeTruthy();
  });

  it("항목 클릭 시 onSelectCommand가 호출된다", () => {
    const onSelectCommand = vi.fn();
    render(
      <QuickAccessPalette
        catalog={CATALOG}
        initialItems={[{ id: "brush", label: "브러시", hint: "B" }]}
        onSelectCommand={onSelectCommand}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "브러시 B" }));
    expect(onSelectCommand).toHaveBeenCalledTimes(1);
    expect(onSelectCommand.mock.calls[0][0].id).toBe("brush");
  });
});
