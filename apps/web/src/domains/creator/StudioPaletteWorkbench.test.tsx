// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioPaletteWorkbench } from "./StudioPaletteWorkbench";

const mocks = vi.hoisted(() => ({
  save: vi.fn(async (_palette: unknown) => []),
}));

vi.mock("./studio-palette-library", () => ({
  createPalette: (name: string, colors: string[]) => ({
    id: "palette-test",
    name,
    colors,
    createdAt: 1,
    updatedAt: 1,
  }),
}));

vi.mock("./studio-palette-sqlite-repository", () => ({
  getProductStudioPaletteSqliteRepository: () => ({ save: mocks.save }),
}));

vi.mock("./StudioColorQuickPicker", () => ({
  StudioColorQuickPicker: ({
    onPreview,
    onCommit,
  }: {
    onPreview: (hex: string) => void;
    onCommit?: (hex: string) => void;
  }) => (
    <div data-testid="quick-picker">
      <button type="button" onClick={() => onPreview("#123456")}>빠른 미리보기</button>
      <button type="button" onClick={() => onCommit?.("#654321")}>빠른 확정</button>
    </div>
  ),
}));

vi.mock("./StudioColorDiscPicker", () => ({
  StudioColorDiscPicker: ({ onChange }: { onChange: (hex: string) => void }) => (
    <button type="button" data-testid="disc-picker" onClick={() => onChange("#abcdef")}>
      색상환 미리보기
    </button>
  ),
}));

vi.mock("./StudioColorHarmoniesPanel", () => ({
  StudioColorHarmoniesPanel: ({
    onSelectColor,
    onSaveAsPalette,
  }: {
    onSelectColor: (hex: string) => void;
    onSaveAsPalette?: (name: string, colors: string[]) => void;
  }) => (
    <div data-testid="harmony-panel">
      <button type="button" onClick={() => onSelectColor("#1122aa")}>조화 색 선택</button>
      <button type="button" onClick={() => onSaveAsPalette?.("테스트 조화", ["#1122aa", "#ffee00"])}>
        조화 저장
      </button>
    </div>
  ),
}));

vi.mock("./StudioWebtoonCelShadePanel", () => ({
  StudioWebtoonCelShadePanel: () => <div data-testid="webtoon-panel">웹툰 음영 패널</div>,
}));

afterEach(cleanup);
beforeEach(() => {
  mocks.save.mockClear();
});

function renderWorkbench(overrides: Partial<ComponentProps<typeof StudioPaletteWorkbench>> = {}) {
  const onPreviewColor = vi.fn();
  const onCommitColor = vi.fn();
  render(
    <StudioPaletteWorkbench
      value="#112233"
      recentColors={["#445566", "#445566", "#abc", "invalid"]}
      onPreviewColor={onPreviewColor}
      onCommitColor={onCommitColor}
      libraryContent={<div data-testid="palette-library">팔레트 라이브러리</div>}
      {...overrides}
    />,
  );
  return { onPreviewColor, onCommitColor };
}

describe("StudioPaletteWorkbench", () => {
  it("keeps normalized recent colors visible and applies them in one step", () => {
    const { onPreviewColor, onCommitColor } = renderWorkbench();

    expect(screen.getByRole("heading", { name: "최근 사용 색" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "최근 색상 #445566 선택" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "최근 색상 #aabbcc 선택" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /invalid/ })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "최근 색상 #445566 선택" }));
    expect(onPreviewColor).toHaveBeenCalledWith("#445566");
    expect(onCommitColor).toHaveBeenCalledWith("#445566");
  });

  it("moves between quick, wheel, harmony, webtoon, and library workflows without leaving the popover", () => {
    const { onPreviewColor } = renderWorkbench();

    expect(screen.getByTestId("quick-picker")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /색상환:/ }));
    expect(screen.getByTestId("disc-picker")).toBeTruthy();
    fireEvent.click(screen.getByTestId("disc-picker"));
    expect(onPreviewColor).toHaveBeenCalledWith("#abcdef");

    fireEvent.click(screen.getByRole("tab", { name: /조화·웹툰:/ }));
    expect(screen.getByTestId("harmony-panel")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "웹툰 음영" }));
    expect(screen.getByTestId("webtoon-panel")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /내 팔레트:/ }));
    expect(screen.getByTestId("palette-library")).toBeTruthy();
  });

  it("previews valid direct input, commits it on Enter, and rejects invalid hex values", () => {
    const { onPreviewColor, onCommitColor } = renderWorkbench();
    const input = screen.getByRole("textbox", { name: "현재 색상 코드" });

    fireEvent.change(input, { target: { value: "#ABC" } });
    expect(onPreviewColor).toHaveBeenCalledWith("#aabbcc");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommitColor).toHaveBeenCalledWith("#aabbcc");

    fireEvent.change(input, { target: { value: "not-a-color" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert").textContent).toContain("#RRGGBB");
  });

  it("saves the current flow and generated harmony sets through the shared palette repository", async () => {
    renderWorkbench();

    fireEvent.click(screen.getByRole("button", { name: "현재 흐름을 내 팔레트로 저장" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0]?.[0]).toMatchObject({
      name: "작업 색 #112233",
      colors: ["#112233", "#445566", "#aabbcc"],
    });

    fireEvent.click(screen.getByRole("tab", { name: /조화·웹툰:/ }));
    fireEvent.click(screen.getByRole("button", { name: "조화 저장" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1]?.[0]).toMatchObject({
      name: "테스트 조화",
      colors: ["#1122aa", "#ffee00"],
    });
  });
});
