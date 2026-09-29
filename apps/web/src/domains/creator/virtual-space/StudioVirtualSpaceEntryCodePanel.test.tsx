// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEntryCodePanel } from "./StudioVirtualSpaceEntryCodePanel";

describe("StudioVirtualSpaceEntryCodePanel", () => {
  it("유효한 코드는 입장 콜백으로 전달한다", () => {
    const onEnterWithCode = vi.fn();
    render(<StudioVirtualSpaceEntryCodePanel onEnterWithCode={onEnterWithCode} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "abc234" } });
    fireEvent.click(screen.getByRole("button", { name: "입장하기" }));
    expect(onEnterWithCode).toHaveBeenCalledWith("ABC234");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("잘못된 코드는 안내를 보여준다", () => {
    const onEnterWithCode = vi.fn();
    render(<StudioVirtualSpaceEntryCodePanel onEnterWithCode={onEnterWithCode} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "AB12" } });
    fireEvent.click(screen.getByRole("button", { name: "입장하기" }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onEnterWithCode).not.toHaveBeenCalled();
  });
});
