// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioReferenceCanvasCard } from "./StudioReferenceCanvasCard";

describe("StudioReferenceCanvasCard", () => {
  afterEach(() => cleanup());

  it("presents ToonSpectrum's reference canvas identity without competitor branding", () => {
    render(
      <StudioReferenceCanvasCard
        itemCount={3}
        onOpenCanvas={vi.fn()}
        onOpenWindow={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "레퍼런스 캔버스" })).toBeDefined();
    expect(screen.getByText("3개 연결")).toBeDefined();
    expect(screen.queryByText("CSP")).toBeNull();
    expect(screen.queryByText(/Sub View/i)).toBeNull();
  });

  it("opens the WYSIWYG canvas and detached synchronized window", () => {
    const onOpenCanvas = vi.fn();
    const onOpenWindow = vi.fn();
    render(
      <StudioReferenceCanvasCard
        onOpenCanvas={onOpenCanvas}
        onOpenWindow={onOpenWindow}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "캔버스 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "레퍼런스 캔버스를 별도 창으로 열기" }));

    expect(onOpenCanvas).toHaveBeenCalledOnce();
    expect(onOpenWindow).toHaveBeenCalledOnce();
  });

  it("normalizes invalid item counts to an empty canvas", () => {
    render(
      <StudioReferenceCanvasCard
        itemCount={Number.NaN}
        onOpenCanvas={vi.fn()}
        onOpenWindow={vi.fn()}
      />,
    );

    expect(screen.getByText("새 캔버스")).toBeDefined();
  });

  it("shows the live canvas state", () => {
    render(
      <StudioReferenceCanvasCard
        itemCount={1}
        open
        onOpenCanvas={vi.fn()}
        onOpenWindow={vi.fn()}
      />,
    );

    expect(screen.getByText("캔버스 열림")).toBeDefined();
    expect(screen.getByRole("button", { name: "캔버스 보기" }).getAttribute("aria-pressed"))
      .toBe("true");
  });
});
