// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserCompatModal } from "./browser-compat-modal";

const load = vi.hoisted(() => vi.fn());
vi.mock("./browser-compat-modal-content", () => {
  load();
  return { BrowserCompatModalContent: ({ onClose, reason }: { onClose: () => void; reason?: string }) => (
    <button onClick={onClose}>{reason}</button>
  ) };
});
afterEach(cleanup);

it("loads compatibility guidance only when opened and preserves its close action", async () => {
  const onClose = vi.fn();
  const view = render(<BrowserCompatModal isOpen={false} onClose={onClose} reason="호환성 상세" />);
  expect(load).not.toHaveBeenCalled();
  expect(view.container.childElementCount).toBe(0);
  view.rerender(<BrowserCompatModal isOpen onClose={onClose} reason="호환성 상세" />);
  fireEvent.click(await screen.findByRole("button", { name: "호환성 상세" }));
  expect(load).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
  view.rerender(<BrowserCompatModal isOpen={false} onClose={onClose} />);
  expect(view.container.childElementCount).toBe(0);
});
