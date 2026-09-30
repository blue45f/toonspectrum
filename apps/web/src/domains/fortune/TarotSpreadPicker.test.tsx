// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TarotSpreadPicker } from "./TarotSpreadPicker";

afterEach(() => {
  cleanup();
});

describe("TarotSpreadPicker", () => {
  it("4종 스프레드를 도식과 함께 보여준다", () => {
    render(<TarotSpreadPicker value="one" onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "타로 스프레드 선택" })).not.toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    // 각 옵션에 카드 장수 표시
    expect(screen.getByText("1장")).not.toBeNull();
    expect(screen.getByText("3장")).not.toBeNull();
    expect(screen.getByText("10장")).not.toBeNull();
    expect(screen.getByText("6장")).not.toBeNull();
  });

  it("선택된 스프레드가 aria-checked로 표시된다", () => {
    render(<TarotSpreadPicker value="celtic-cross" onChange={() => {}} />);
    const radios = screen.getAllByRole("radio");
    const checked = radios.filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
  });

  it("스프레드 변경 콜백이 호출된다", () => {
    const onChange = vi.fn();
    render(<TarotSpreadPicker value="one" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /관계 스프레드/ }));
    expect(onChange).toHaveBeenCalledWith("relationship");
  });
});
