// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioColorPalettePanel } from "./StudioColorPalettePanel";

const mocks = vi.hoisted(() => ({
  savePalette: vi.fn(),
}));

vi.mock("./studio-color-palette", () => ({
  extractPalette: vi.fn(async (src: string, count: number) => {
    if (src === "empty") return [];
    if (src === "error") throw new Error("Image corrupt");
    return ["#ff0000", "#00ff00", "#0000ff", "#ffffff"].slice(0, count);
  }),
}));

vi.mock("./studio-palette-sqlite-repository", () => ({
  getProductStudioPaletteSqliteRepository: () => ({
    save: mocks.savePalette,
  }),
}));

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

describe("StudioColorPalettePanel", () => {
  beforeEach(() => {
    mocks.savePalette.mockReset();
    mocks.savePalette.mockResolvedValue(undefined);
    stubClipboard(() => Promise.resolve());
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(globalThis.navigator, "clipboard");
    Reflect.deleteProperty(document, "execCommand");
    vi.restoreAllMocks();
  });

  it("renders extracted colors with count selector and confirms a copied swatch", async () => {
    const onPickColor = vi.fn();
    render(
      <StudioColorPalettePanel
        src="sample.jpg"
        onPickColor={onPickColor}
      />
    );

    expect(screen.getByText("이미지의 고유 배색을 분석하는 중…")).toBeDefined();

    const swatch = await screen.findByRole("button", { name: /#ff0000/ });
    fireEvent.click(swatch);
    expect(onPickColor).toHaveBeenCalledWith("#ff0000");
    await screen.findByRole("button", { name: /#ff0000.*복사 완료/u });

    expect(screen.getByRole("button", { name: /전체 복사/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /내 팔레트에 저장/ })).toBeDefined();
  });

  it("reports clipboard failure for a swatch and for the whole palette", async () => {
    stubClipboard(() => Promise.reject(new Error("blocked")));
    Object.defineProperty(document, "execCommand", {
      value: () => false,
      configurable: true,
      writable: true,
    });

    render(
      <StudioColorPalettePanel
        src="sample.jpg"
        onPickColor={vi.fn()}
      />
    );

    const swatch = await screen.findByRole("button", { name: /#ff0000/ });
    fireEvent.click(swatch);
    await screen.findByRole("button", { name: /#ff0000.*복사 실패/u });

    fireEvent.click(screen.getByRole("button", { name: "전체 복사" }));
    await screen.findByRole("button", { name: "전체 복사 실패" });
    expect(screen.queryByText("전체 복사됨")).toBeNull();
  });

  it("shows a real repository failure and succeeds on an explicit retry", async () => {
    mocks.savePalette
      .mockRejectedValueOnce(new Error("OPFS unavailable"))
      .mockResolvedValueOnce(undefined);

    render(
      <StudioColorPalettePanel
        src="sample.jpg"
        onPickColor={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /#ff0000/ });
    fireEvent.click(screen.getByRole("button", { name: "내 팔레트에 저장" }));

    const retry = await screen.findByRole("button", { name: "저장 실패 · 다시 시도" });
    expect(screen.queryByText("임시 저장 완료")).toBeNull();

    fireEvent.click(retry);
    await screen.findByRole("button", { name: "내 팔레트에 저장됨" });
    expect(mocks.savePalette).toHaveBeenCalledTimes(2);
  });

  it("does not let an old save completion overwrite a newly extracted palette state", async () => {
    let resolveSave: (() => void) | undefined;
    mocks.savePalette.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    const view = render(
      <StudioColorPalettePanel
        src="sample.jpg"
        onPickColor={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /#ff0000/ });
    fireEvent.click(screen.getByRole("button", { name: "내 팔레트에 저장" }));
    expect(
      screen.getByRole("button", { name: "팔레트 저장 중…" }).hasAttribute("disabled")
    ).toBe(true);

    view.rerender(
      <StudioColorPalettePanel
        src="empty"
        onPickColor={vi.fn()}
      />
    );
    expect(await screen.findByText("추출할 색이 없어요(투명 이미지).")).toBeDefined();

    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
    });
    expect(screen.queryByText("내 팔레트에 저장됨")).toBeNull();
  });

  it("handles empty extracted colors state", async () => {
    render(
      <StudioColorPalettePanel
        src="empty"
        onPickColor={vi.fn()}
      />
    );

    expect(await screen.findByText("추출할 색이 없어요(투명 이미지).")).toBeDefined();
  });

  it("handles extraction error state", async () => {
    render(
      <StudioColorPalettePanel
        src="error"
        onPickColor={vi.fn()}
      />
    );

    expect(await screen.findByText("Image corrupt")).toBeDefined();
  });
});
