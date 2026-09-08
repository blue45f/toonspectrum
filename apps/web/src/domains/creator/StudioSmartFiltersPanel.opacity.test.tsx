// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSmartFiltersPanel } from "./StudioSmartFiltersPanel";
import type { StudioAdjustmentStack } from "./studio-adjustment-stack";

afterEach(cleanup);

describe("Smart Filters opacity controls", () => {
  it("edits only the selected operation and preserves its parameters and the caller snapshot", () => {
    const stack: StudioAdjustmentStack = { version: 1, entries: [
      { id: "first", engine: "invert", enabled: true, params: {} },
      { id: "second", engine: "blur", enabled: true, params: { radius: 3 } },
    ] };
    const original = structuredClone(stack);
    const onChange = vi.fn();
    render(<StudioSmartFiltersPanel stack={stack} onChange={onChange} />);
    const opacity = screen.getByRole("spinbutton", { name: "반전 필터 1 불투명도" });
    expect((opacity as HTMLInputElement).value).toBe("100");
    fireEvent.change(opacity, { target: { value: "25" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].entries[0]).toEqual({ ...original.entries[0], opacity: 0.25 });
    expect(onChange.mock.calls[0]![0].entries[1]).toEqual(original.entries[1]);
    expect(stack).toEqual(original);
  });

  it("shows an enabled zero-opacity operation so it can be restored", () => {
    const onChange = vi.fn();
    render(<StudioSmartFiltersPanel stack={{ version: 1, entries: [{
      id: "first", engine: "invert", enabled: true, opacity: 0, params: {},
    }] }} onChange={onChange} />);
    const opacity = screen.getByRole("spinbutton", { name: "반전 필터 1 불투명도" });
    expect((opacity as HTMLInputElement).value).toBe("0");
    fireEvent.change(opacity, { target: { value: "100" } });
    expect(onChange.mock.calls[0]![0].entries[0]).toEqual({ id: "first", engine: "invert", enabled: true, params: {} });
  });
});
