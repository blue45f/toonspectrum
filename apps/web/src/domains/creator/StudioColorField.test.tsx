// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioColorField } from "./StudioColorField";

afterEach(cleanup);

describe("StudioColorField", () => {
  it("makes none an explicit reversible state", () => {
    const onChange = vi.fn();
    const view = render(
      <StudioColorField
        label="선 색상"
        value="#112233"
        fallbackColor="#112233"
        recentColors={[]}
        controlId="element.stroke.color"
        allowNone
        noneLabel="선 없음"
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("button", { name: "선 색상" }).getAttribute(
        "data-inspector-control-id",
      ),
    ).toBe("element.stroke.color");
    fireEvent.click(screen.getByRole("button", { name: "선 없음" }));
    expect(onChange).toHaveBeenLastCalledWith(null);

    view.rerender(
      <StudioColorField
        label="선 색상"
        value={null}
        fallbackColor="#112233"
        recentColors={[]}
        allowNone
        noneLabel="선 없음"
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("button", { name: "선 없음" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "선 없음" }));
    expect(onChange).toHaveBeenLastCalledWith("#112233");
  });

  it("applies a recent color without opening the advanced picker", () => {
    const onChange = vi.fn();
    const onUseColor = vi.fn();
    render(
      <StudioColorField
        label="선 색상"
        value="#112233"
        recentColors={["#445566", "#778899"]}
        onChange={onChange}
        onUseColor={onUseColor}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "선 색상 최근 색상 #445566 적용" }),
    );
    expect(onChange).toHaveBeenCalledWith("#445566");
    expect(onUseColor).toHaveBeenCalledWith("#445566");
  });

  it("normalizes legacy transparent values into the explicit none state", () => {
    render(
      <StudioColorField
        label="채우기 색상"
        value="transparent"
        fallbackColor="#ffffff"
        recentColors={[]}
        allowNone
        noneLabel="채우기 없음"
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "채우기 없음" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "채우기 색상" }).getAttribute(
        "data-studio-color-trigger-none",
      ),
    ).toBe("true");
  });

});
