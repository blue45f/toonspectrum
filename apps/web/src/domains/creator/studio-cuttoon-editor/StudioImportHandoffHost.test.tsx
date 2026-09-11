// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStudioImportHandoffsForTests,
  registerStudioImportHandoff,
} from "../studio-import-handoff";
import { StudioImportHandoffHost } from "./StudioImportHandoffHost";

function props(overrides: Partial<ComponentProps<typeof StudioImportHandoffHost>> = {}) {
  return {
    brushPackImporting: false,
    collaborationDocumentLocked: false,
    interchangeImportBusy: false,
    projectArchiveBusy: false,
    psdImportBusy: false,
    onImage: vi.fn(),
    onBrushPack: vi.fn(),
    onInterchange: vi.fn(),
    onProjectJson: vi.fn(),
    onPsd: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  clearStudioImportHandoffsForTests();
  window.history.replaceState(null, "", "/studio/canvas");
});

afterEach(() => {
  cleanup();
  clearStudioImportHandoffsForTests();
});

describe("StudioImportHandoffHost", () => {
  it("routes the original File into the existing project import handler exactly once", async () => {
    const file = new File(["{\"pages\":[]}"], "project.json", { type: "application/json" });
    const handoff = registerStudioImportHandoff(file, "json");
    window.history.replaceState(null, "", `/studio/canvas?importHandoff=${handoff.token}`);
    const input = props();

    const view = render(<StudioImportHandoffHost {...input} />);
    await waitFor(() => expect(input.onProjectJson).toHaveBeenCalledTimes(1));
    const event = vi.mocked(input.onProjectJson).mock.calls[0]![0];
    expect(event.currentTarget.files?.[0]).toBe(file);
    expect(window.location.search).toBe("");

    view.rerender(<StudioImportHandoffHost {...input} />);
    expect(input.onProjectJson).toHaveBeenCalledTimes(1);
  });

  it("waits for the established PSD/import lock instead of bypassing it", async () => {
    const file = new File(["8BPS"], "layers.psd", { type: "image/vnd.adobe.photoshop" });
    const handoff = registerStudioImportHandoff(file, "psd");
    window.history.replaceState(null, "", `/studio/canvas?importHandoff=${handoff.token}`);
    const locked = props({ psdImportBusy: true });
    const view = render(<StudioImportHandoffHost {...locked} />);

    expect(locked.onPsd).not.toHaveBeenCalled();
    expect(view.getByRole("status").textContent).toContain("layers.psd");

    const ready = { ...locked, psdImportBusy: false };
    view.rerender(<StudioImportHandoffHost {...ready} />);
    await waitFor(() => expect(ready.onPsd).toHaveBeenCalledTimes(1));
  });

  it("reports a reload-expired token and removes it from the address", async () => {
    window.history.replaceState(null, "", "/studio/canvas?importHandoff=missing");
    const view = render(<StudioImportHandoffHost {...props()} />);

    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("다시 선택"));
    expect(window.location.search).toBe("");
  });
});
