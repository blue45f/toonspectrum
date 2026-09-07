// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCommandSearchHost } from "./StudioCommandSearchHost";
import { requestStudioCommandSearch } from "./studio-help-center-channel";
import { useStudioDeferredCommandSearch } from "./useStudioDeferredCommandSearch";

afterEach(cleanup);

vi.mock("./StudioCommandSearchDialog", () => ({
  StudioCommandSearchDialog: ({ initialScope, onClose }: {
    initialScope: string;
    onClose: () => void;
  }) => <div role="dialog" aria-label={initialScope}><button onClick={onClose}>close search</button></div>,
}));

function MobileInspector({ loaded }: { loaded: boolean }) {
  const [open, setOpen] = useState(false);
  const search = useStudioDeferredCommandSearch(true, open, () => setOpen(true));
  return <>
    <button onClick={() => setOpen(true)}>open inspector</button>
    <button onClick={() => setOpen(false)}>close inspector</button>
    <input aria-label="editing" />
    <output>{open ? "inspector open" : "inspector closed"}</output>
    {open && loaded ? <StudioCommandSearchHost hideTrigger pendingRequest={search.request} onRequestHandled={search.handled} onReadyChange={search.onHostReadyChange} /> : null}
  </>;
}

describe("mobile command search before its lazy inspector mounts", () => {
  it("holds a menu request after the inspector opens but before its host loads", async () => {
    const view = render(<MobileInspector loaded={false} />);
    fireEvent.click(screen.getByText("open inspector"));
    act(() => { expect(requestStudioCommandSearch({ scope: "inspector" })).toBe(true); });
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(<MobileInspector loaded />);
    expect(await screen.findByRole("dialog", { name: "inspector" })).toBeTruthy();
  });

  it("keeps the latest scope when another request arrives during the lazy load", async () => {
    const view = render(<MobileInspector loaded={false} />);
    act(() => { expect(requestStudioCommandSearch({ scope: "inspector" })).toBe(true); });
    act(() => { expect(requestStudioCommandSearch({ scope: "all" })).toBe(true); });
    view.rerender(<MobileInspector loaded />);
    expect(await screen.findByRole("dialog", { name: "all" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "inspector" })).toBeNull();
  });

  it("resumes deferred requests when closing the inspector unmounts the ready host", async () => {
    render(<MobileInspector loaded />);
    fireEvent.click(screen.getByText("open inspector"));
    fireEvent.click(screen.getByText("close inspector"));
    act(() => { expect(requestStudioCommandSearch({ scope: "inspector" })).toBe(true); });
    expect(await screen.findByRole("dialog", { name: "inspector" })).toBeTruthy();
    fireEvent.click(screen.getByText("close search"));
    fireEvent.click(screen.getByText("close inspector"));
    fireEvent.click(screen.getByText("open inspector"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("accepts F1 during loading and lets only the mounted host toggle it afterward", async () => {
    const view = render(<MobileInspector loaded={false} />);
    fireEvent.click(screen.getByText("open inspector"));
    const pendingF1 = new KeyboardEvent("keydown", { key: "F1", cancelable: true });
    fireEvent(window, pendingF1);
    expect(pendingF1.defaultPrevented).toBe(true);
    view.rerender(<MobileInspector loaded />);
    expect(await screen.findByRole("dialog", { name: "all" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "F1" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "F1" });
    expect(await screen.findByRole("dialog", { name: "all" })).toBeTruthy();
  });

  it("preserves editing and an already handled F1 while the open inspector loads", async () => {
    const view = render(<MobileInspector loaded={false} />);
    fireEvent.click(screen.getByText("open inspector"));
    const editingF1 = new KeyboardEvent("keydown", { key: "F1", bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("textbox"), editingF1);
    expect(editingF1.defaultPrevented).toBe(false);
    const handledF1 = new KeyboardEvent("keydown", { key: "F1", cancelable: true });
    handledF1.preventDefault();
    fireEvent(window, handledF1);
    await act(async () => { view.rerender(<MobileInspector loaded />); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("delivers the requested scope after loading and consumes it once", async () => {
    const view = render(<MobileInspector loaded={false} />);
    act(() => { expect(requestStudioCommandSearch({ scope: "inspector" })).toBe(true); });
    expect(screen.getByText("inspector open")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(<MobileInspector loaded />);
    expect(await screen.findByRole("dialog", { name: "inspector" })).toBeTruthy();
    fireEvent.click(screen.getByText("close search"));
    fireEvent.click(screen.getByText("close inspector"));
    fireEvent.click(screen.getByText("open inspector"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancels an unhandled request when the inspector closes during loading", async () => {
    const view = render(<MobileInspector loaded={false} />);
    act(() => { requestStudioCommandSearch(); });
    fireEvent.click(screen.getByText("close inspector"));
    view.rerender(<MobileInspector loaded />);
    fireEvent.click(screen.getByText("open inspector"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens from F1 on the canvas, leaves text editing alone, and releases its listener", async () => {
    const view = render(<MobileInspector loaded />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "F1" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(window, { key: "F1" });
    expect(await screen.findByRole("dialog", { name: "all" })).toBeTruthy();
    view.unmount();
    expect(requestStudioCommandSearch()).toBe(false);
  });
});
