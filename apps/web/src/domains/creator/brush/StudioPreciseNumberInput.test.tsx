// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPreciseNumberInput } from "./StudioPreciseNumberInput";
import { normalizeStudioPreciseNumber } from "./studio-precise-number";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioPreciseNumberInput", () => {
  it("keeps an editable draft and commits one exact value on Enter", () => {
    const onChange = vi.fn();
    render(
      <StudioPreciseNumberInput
        label="브러시 크기 직접 입력"
        value={12}
        min={1}
        max={400}
        suffix="px"
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("spinbutton", { name: "브러시 크기 직접 입력" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "128" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(128);
  });

  it("clamps invalid drafts on blur and Escape restores the canonical value", () => {
    const onChange = vi.fn();
    render(
      <StudioPreciseNumberInput
        label="브러시 불투명도 직접 입력"
        value={80}
        min={5}
        max={100}
        suffix="%"
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("spinbutton", { name: "브러시 불투명도 직접 입력" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "170" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(100);

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("80");
  });

  it("normalizes fractional steps without floating point drift", () => {
    expect(normalizeStudioPreciseNumber(0.83, 0.05, 1, 0.05)).toBe(0.85);
    expect(normalizeStudioPreciseNumber(-10, 0, 10, 1)).toBe(0);
    expect(normalizeStudioPreciseNumber(99, 0, 10, 1)).toBe(10);
  });
});
