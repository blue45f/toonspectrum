// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { StudioColorChannelInput } from "./StudioColorChannelInput";

afterEach(cleanup);
function Field({ changed = () => undefined }: { changed?: (value: number) => void }) {
  const [value, setValue] = useState(100);
  return <><StudioColorChannelInput label="채널" value={value} min={-128} max={255} step={0.1}
    onChange={(next) => { changed(next); setValue(next); }} />
    <output aria-label="현재 값">{value}</output><button onClick={() => setValue(200)}>외부 변경</button></>;
}
const input = () => screen.getByRole<HTMLInputElement>("spinbutton", { name: "채널" });
it("preserves blanks and trailing numeric text without forcing zero", () => {
  const changed = vi.fn(); render(<Field changed={changed} />);
  fireEvent.focus(input()); fireEvent.change(input(), { target: { value: "" } });
  expect(input().value).toBe(""); expect(changed).not.toHaveBeenCalled();
  fireEvent.change(input(), { target: { value: "12.30" } });
  expect(input().value).toBe("12.30"); expect(changed).toHaveBeenCalledExactlyOnceWith(12.3);
  fireEvent.blur(input()); expect(input().value).toBe("12.3");
});
it("clamps only the preview while retaining the typed value until blur", () => {
  const changed = vi.fn(); render(<Field changed={changed} />);
  fireEvent.change(input(), { target: { value: "300" } });
  expect(input().value).toBe("300"); expect(changed).toHaveBeenCalledExactlyOnceWith(255);
  fireEvent.blur(input()); expect(input().value).toBe("255");
});
it("Escape restores this field edit without dismissing its parent", () => {
  const parent = vi.fn(); render(<div role="presentation" onKeyDown={parent}><Field /></div>);
  fireEvent.focus(input()); fireEvent.change(input(), { target: { value: "50" } });
  fireEvent.keyDown(input(), { key: "Escape" });
  expect(input().value).toBe("100"); expect(parent).not.toHaveBeenCalled();
  fireEvent.keyDown(input(), { key: "Escape" }); expect(parent).toHaveBeenCalledOnce();
});
it("does not overwrite an external change with a stale draft cancellation", () => {
  render(<Field />); fireEvent.focus(input()); fireEvent.change(input(), { target: { value: "50" } });
  fireEvent.click(screen.getByRole("button", { name: "외부 변경" }));
  expect(input().value).toBe("200");
  fireEvent.keyDown(input(), { key: "Escape" }); expect(input().value).toBe("200");
});
it("holds composition without preview and processes one completed value", () => {
  const changed = vi.fn(); render(<Field changed={changed} />);
  fireEvent.compositionStart(input()); fireEvent.change(input(), { target: { value: "25" } });
  fireEvent.keyDown(input(), { key: "Enter", isComposing: true });
  expect(changed).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input()); expect(changed).toHaveBeenCalledExactlyOnceWith(25);
});
it("normalizes on Enter but leaves focus in the field", () => {
  render(<Field />); input().focus(); fireEvent.change(input(), { target: { value: "40.00" } });
  fireEvent.keyDown(input(), { key: "Enter" });
  expect(input().value).toBe("40"); expect(document.activeElement).toBe(input());
});
