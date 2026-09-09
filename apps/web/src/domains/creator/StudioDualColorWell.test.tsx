// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDualColorWell } from "./StudioDualColorWell";

afterEach(cleanup);

describe("StudioDualColorWell", () => {
  it("publishes native input immediately and coalesces the matching change event", () => {
    const onPrimaryChange = vi.fn();
    render(
      <StudioDualColorWell
        primary="#ffffff"
        onPrimaryChange={onPrimaryChange}
      />
    );

    const group = screen.getByRole("group", { name: "색상" });
    expect(group.getAttribute("data-studio-primary-color")).toBe("#ffffff");

    const input = screen.getByLabelText(/주 색 선택/u);
    fireEvent.input(input, { target: { value: "#0b9b6d" } });
    fireEvent.change(input, { target: { value: "#0b9b6d" } });

    expect(onPrimaryChange).toHaveBeenCalledTimes(1);
    expect(onPrimaryChange).toHaveBeenCalledWith("#0b9b6d");
  });

  it("keeps secondary input on the same native input contract", () => {
    const onPrimaryChange = vi.fn();
    const onSecondaryChange = vi.fn();
    render(
      <StudioDualColorWell
        primary="#112233"
        secondary="#445566"
        onPrimaryChange={onPrimaryChange}
        onSecondaryChange={onSecondaryChange}
      />
    );

    const group = screen.getByRole("group", { name: "색상" });
    expect(group.getAttribute("data-studio-primary-color")).toBe("#112233");
    expect(group.getAttribute("data-studio-secondary-color")).toBe("#445566");

    const input = screen.getByLabelText(/보조 색 선택/u);
    fireEvent.input(input, { target: { value: "#abcdef" } });
    fireEvent.change(input, { target: { value: "#abcdef" } });

    expect(onSecondaryChange).toHaveBeenCalledTimes(1);
    expect(onSecondaryChange).toHaveBeenCalledWith("#abcdef");
    expect(onPrimaryChange).not.toHaveBeenCalled();
  });
});
