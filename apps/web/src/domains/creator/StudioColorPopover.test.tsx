// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioColorPopover } from "./StudioColorPopover";

vi.mock("./StudioPaletteLibraryPanel", () => ({ StudioPaletteLibraryPanel: () => <div>내 팔레트 저장소</div> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(extra: Partial<React.ComponentProps<typeof StudioColorPopover>> = {}) {
  const onChange = vi.fn();
  const onUseColor = vi.fn();
  const props = { value: "#123456", onChange, onUseColor, recentColors: ["#123456", "#654321"], label: "색 고르기", ...extra };
  const view = render(<StudioColorPopover {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "색 고르기" }));
  return { ...view, onChange, onUseColor, props };
}

describe("StudioColorPopover transactional surface", () => {
  it("ports the editor outside clipping containers and preserves a labelled trigger", () => {
    const { container } = setup();
    const popup = screen.getByRole("dialog", { name: "색 고르기 선택" });
    expect(popup.closest('[data-studio-color-surface-root]')?.parentElement).toBe(document.body);
    expect(container.contains(popup)).toBe(false);
    expect(screen.getByRole("button", { name: "색 고르기" }).getAttribute("aria-controls")).toBe(popup.id);
    expect(within(popup).getAllByRole("button").some((button) => button.hasAttribute("title"))).toBe(false);
  });
  it("keeps the authored-canvas sampler available without a browser EyeDropper", () => {
    const sample = vi.fn(); setup({ onRequestCanvasEyedropper: sample });
    fireEvent.click(screen.getByRole("button", { name: "캔버스에서 정밀 색 가져오기" }));
    expect(sample).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("previews locally and cancels without changing document state or recent colors", () => {
    const onPreviewColor = vi.fn(); const onCancelColor = vi.fn();
    const { onChange, onUseColor } = setup({ onPreviewColor, onCancelColor });
    fireEvent.change(screen.getByRole("slider", { name: "빠른 색조" }), { target: { value: "80" } });
    expect(onPreviewColor).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "헥스 색상 코드" }), { key: "Escape" });
    expect(onCancelColor).toHaveBeenCalledExactlyOnceWith("#123456");
    expect(onUseColor).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it.each(["apply", "outside"])("commits exactly once through %s", (mode) => {
    const onPreviewColor = vi.fn(); const onCommitColor = vi.fn(); const onInteractionEnd = vi.fn();
    const { onUseColor, onChange, container } = setup({ onPreviewColor, onCommitColor, onInteractionEnd });
    fireEvent.change(screen.getByRole("textbox", { name: "헥스 색상 코드" }), { target: { value: "#ABC" } });
    expect(onPreviewColor).not.toHaveBeenCalled();
    if (mode === "apply") fireEvent.click(screen.getByRole("button", { name: "색상 적용" }));
    else fireEvent.pointerDown(container);
    expect(onPreviewColor).toHaveBeenCalledExactlyOnceWith("#aabbcc");
    expect(onCommitColor).toHaveBeenCalledExactlyOnceWith("#aabbcc");
    expect(onUseColor).toHaveBeenCalledExactlyOnceWith("#aabbcc");
    expect(onInteractionEnd).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
  });
  it("blocks invalid outside commits and prevents the closing click from drawing", () => {
    const canvasDown = vi.fn();
    const { onChange, onUseColor } = setup();
    const canvas = document.createElement("button"); document.body.append(canvas); canvas.addEventListener("pointerdown", canvasDown);
    try {
      const input = screen.getByRole("textbox", { name: "헥스 색상 코드" }) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "#invalid" } });
      fireEvent.pointerDown(canvas);
      expect(input.value).toBe("#invalid");
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(canvasDown).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled(); expect(onUseColor).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "취소" }));
    } finally { canvas.remove(); }
  });
  it("deduplicates document colors without labelling them as recent history", () => {
    setup({ documentColors: ["#ABCDEF", "#abcdef", "transparent", "#112233"] });
    fireEvent.click(screen.getByRole("tab", { name: "팔레트" }));
    const group = screen.getByRole("group", { name: "문서 사용 색 목록" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(within(group).getByRole("button", { name: "문서 사용 색 #abcdef 적용" }));
    expect(screen.getByLabelText("선택 중인 색상").textContent).toBe("#ABCDEF");
  });
  it("preserves raw typing and confirms once on Enter, excluding IME composition", () => {
    const { onChange } = setup();
    const input = screen.getByRole("textbox", { name: "헥스 색상 코드" }) as HTMLInputElement;
    for (const raw of ["#1", "#12", "#123", "#1234", "#12345", "#abcdef"]) {
      fireEvent.change(input, { target: { value: raw } }); expect(input.value).toBe(raw);
    }
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("#abcdef");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it.each(["target", "value"])("invalidates a pending session when %s changes", (kind) => {
    const { rerender, props, onChange, onUseColor } = setup({ targetKey: "shape-a" });
    fireEvent.change(screen.getByRole("textbox", { name: "헥스 색상 코드" }), { target: { value: "#abcdef" } });
    rerender(<StudioColorPopover {...props} targetKey={kind === "target" ? "shape-b" : "shape-a"} value={kind === "value" ? "#654321" : "#123456"} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onChange).not.toHaveBeenCalled(); expect(onUseColor).not.toHaveBeenCalled();
  });
  it("contains the sheet inside a reduced keyboard visual viewport", () => {
    const viewport = { width: 360, height: 310, offsetLeft: 0, offsetTop: 100, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("visualViewport", viewport);
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-layout")).toBe("sheet");
    expect(parseFloat(dialog.style.width)).toBe(344);
    expect(parseFloat(dialog.style.top)).toBeGreaterThanOrEqual(108);
    expect(parseFloat(dialog.style.top) + parseFloat(dialog.style.maxHeight)).toBeLessThanOrEqual(402);
    expect(screen.getByRole("button", { name: "색상 적용" })).toBeTruthy();
  });
  it("does not reorder recent swatches while previewing and records only the final selection", () => {
    const { onChange, onUseColor } = setup();
    const before = within(screen.getByRole("group", { name: "최근 선택 색 목록" })).getAllByRole("button").map((button) => button.getAttribute("aria-label"));
    fireEvent.click(screen.getByRole("button", { name: "최근 선택 색 #654321 적용" }));
    expect(onUseColor).not.toHaveBeenCalled();
    const after = within(screen.getByRole("group", { name: "최근 선택 색 목록" })).getAllByRole("button").map((button) => button.getAttribute("aria-label"));
    expect(after).toEqual(before);
    fireEvent.click(screen.getByRole("button", { name: "색상 적용" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("#654321");
    expect(onUseColor).toHaveBeenCalledExactlyOnceWith("#654321");
  });
});
