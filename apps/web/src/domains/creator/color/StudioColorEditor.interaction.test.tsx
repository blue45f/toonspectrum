// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioPaletteWorkbench } from "../StudioPaletteWorkbench";

afterEach(cleanup);
function setup() {
  const committed = vi.fn(); const preview = vi.fn();
  render(<><StudioPaletteWorkbench value="#112233" recentColors={[]} onPreviewColor={preview}
    onCommitColor={committed} libraryContent={null} />
    <button type="button" data-studio-color-cancel="true">대상 변경</button><button type="button">계속</button></>);
  fireEvent.click(screen.getByText("정밀 수치 · RGB / HSV / HSL"));
  const field = screen.getByRole("spinbutton", { name: "빨강 수치 입력" });
  fireEvent.focus(field); fireEvent.change(field, { target: { value: "128" } });
  return { committed, preview, field };
}
it("does not commit numeric edits when focus moves to a cancel or target-change control", () => {
  const { committed, preview, field } = setup();
  fireEvent.blur(field, { relatedTarget: screen.getByRole("button", { name: "대상 변경" }) });
  expect(committed).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled();
});
it("commits a numeric Enter once and does not add another record on blur", () => {
  const { committed, field } = setup();
  fireEvent.keyDown(field, { key: "Enter" });
  fireEvent.blur(field, { relatedTarget: screen.getByRole("button", { name: "계속" }) });
  expect(committed).toHaveBeenCalledExactlyOnceWith("#802233");
});
