// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioFilterDialogIntentContext, useStudioFilterDialogIntent } from "./studio-filter-dialog-intent";

afterEach(cleanup);

function FilterIntentButton({ label = "필터 준비" }: { label?: string }) {
  const preload = useStudioFilterDialogIntent();
  return createElement("button", { onPointerDown: preload, onFocus: preload }, label);
}

describe("Studio filter dialog intent context", () => {
  it("calls the current Host capability only on intent, including after a provider update", () => {
    const initial = vi.fn();
    const updated = vi.fn();
    const provided = (preload: () => void) => createElement(
      StudioFilterDialogIntentContext, { value: preload }, createElement(FilterIntentButton),
    );
    const view = render(provided(initial));
    expect(initial).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("button"));
    expect(initial).toHaveBeenCalledOnce();
    view.rerender(provided(updated));
    expect(updated).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByRole("button"));
    expect(updated).toHaveBeenCalledOnce();
    expect(initial).toHaveBeenCalledOnce();
  });

  it("keeps editor capabilities isolated and standalone controls safe without a global registration", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(createElement("div", {},
      createElement(StudioFilterDialogIntentContext, { value: first }, createElement(FilterIntentButton, { label: "첫 문서" })),
      createElement(StudioFilterDialogIntentContext, { value: second }, createElement(FilterIntentButton, { label: "둘째 문서" })),
      createElement(FilterIntentButton, { label: "독립 미리보기" }),
    ));
    fireEvent.pointerDown(screen.getByRole("button", { name: "첫 문서" }));
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("button", { name: "둘째 문서" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: "독립 미리보기" }));
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });
});
