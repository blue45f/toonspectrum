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
    {open && loaded ? <StudioCommandSearchHost hideTrigger pendingRequest={search.request} onRequestHandled={search.handled} /> : null}
  </>;
}

describe("mobile command search before its lazy inspector mounts", () => {
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
