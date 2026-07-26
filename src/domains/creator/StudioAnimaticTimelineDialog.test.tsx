// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAnimaticTimelineDialog } from "./StudioAnimaticTimelineDialog";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  localStorage.clear();
});

const PAGES = [
  {
    id: "page-1",
    name: "오프닝",
    canvasH: 1_200,
    elements: [
      {
        id: "frame-1",
        type: "frame",
        x: 0,
        y: 0,
        width: 720,
        height: 500,
      },
    ],
  },
] as const;

describe("StudioAnimaticTimelineDialog", () => {
  it("keeps the local animatic out of the DOM until explicitly opened", () => {
    render(
      <StudioAnimaticTimelineDialog
        open={false}
        workScope="work-a"
        pages={PAGES}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog", { name: "웹툰 애니매틱" })).toBeNull();
  });

  it("opens as a viewport-bounded modal and closes with Escape", () => {
    const onClose = vi.fn();
    render(
      <StudioAnimaticTimelineDialog
        open
        workScope="work-a"
        pages={PAGES}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("dialog", { name: "웹툰 애니매틱" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "웹툰 애니매틱 타임라인" })).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes only when the backdrop itself is pressed", () => {
    const onClose = vi.fn();
    render(
      <StudioAnimaticTimelineDialog
        open
        workScope="work-a"
        pages={PAGES}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("region", { name: "웹툰 애니매틱 타임라인" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "애니매틱 배경 닫기" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
