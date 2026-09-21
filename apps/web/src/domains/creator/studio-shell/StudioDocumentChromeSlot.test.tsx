// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioChromePortal, StudioDocumentChromeSlot } from "./StudioDocumentChromeSlot";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("authored document chrome", () => {
  it("moves shell controls into a late-mounted editor lane and preserves their actions", async () => {
    const onClick = vi.fn();
    function Fixture({ ready }: { ready: boolean }) {
      return <>
        <StudioChromePortal targetId="studio-document-chrome-slot"><button onClick={onClick}>작업공간</button></StudioChromePortal>
        {ready ? <div data-studio-editor="true"><header data-studio-app-menubar="true"><StudioDocumentChromeSlot /></header></div> : null}
      </>;
    }
    const view = render(<Fixture ready={false} />);
    expect(screen.getByRole("button").closest("#studio-document-chrome-slot")).toBeNull();
    view.rerender(<Fixture ready />);
    await waitFor(() => expect(screen.getByRole("button").closest("#studio-document-chrome-slot")).not.toBeNull());
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
    view.rerender(<Fixture ready={false} />);
    await waitFor(() => expect(screen.getByRole("button").isConnected).toBe(true));
    expect(screen.getByRole("button").closest("#studio-document-chrome-slot")).toBeNull();
  });
  it("publishes the actual header height and restores the prior inset on unmount", () => {
    const editor = document.createElement("div");
    editor.dataset.studioEditor = "true";
    editor.style.setProperty("--studio-immersive-menubar-block", "80px");
    const menu = document.createElement("header");
    menu.dataset.studioAppMenubar = "true";
    menu.getBoundingClientRect = () => new DOMRect(0, 0, 390, 92);
    editor.append(menu);
    document.body.append(editor);
    const view = render(<StudioDocumentChromeSlot />, { container: menu });
    expect(editor.style.getPropertyValue("--studio-immersive-menubar-block")).toBe("104px");
    act(() => view.unmount());
    expect(editor.style.getPropertyValue("--studio-immersive-menubar-block")).toBe("80px");
    editor.remove();
  });
});
