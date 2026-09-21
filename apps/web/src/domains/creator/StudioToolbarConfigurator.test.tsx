// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioToolbarConfigurator } from "./StudioToolbarConfigurator";
import { defaultStudioAppSettings, DEFAULT_STUDIO_RAIL_TOOL_ORDER } from "./studio-app-settings";
import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => useI18n.setState({ lang: "ko" }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup() {
  const value = { ...defaultStudioAppSettings().toolbar, configured: true, visibleIds: [...DEFAULT_STUDIO_RAIL_TOOL_ORDER].reverse().slice(0, 27) };
  const onApply = vi.fn(); const onCancel = vi.fn();
  const view = render(<StudioToolbarConfigurator value={value} onApply={onApply} onCancel={onCancel} />);
  return { value, onApply, onCancel, view };
}

describe("toolbar draft editor", () => {
  it("changes view and appends all tools without publishing until Apply", () => {
    const { value, onApply } = setup();
    fireEvent.change(screen.getByRole("combobox", { name: "도구막대 보기 방식" }), { target: { value: "double" } });
    fireEvent.click(screen.getByRole("button", { name: "모든 도구 고정" }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "구성 적용" }));
    const saved = onApply.mock.calls[0]![0];
    expect(saved.visibleIds).toHaveLength(35); expect(saved.visibleIds.slice(0, 27)).toEqual(value.visibleIds);
    expect(saved).toMatchObject({ version: 2, view: "double", configured: true });
  });
  it("Cancel discards bulk additions and reordering without touching the saved configuration", () => {
    const { value, onApply, onCancel } = setup();
    const initial = [...value.visibleIds];
    fireEvent.click(screen.getByRole("button", { name: "모든 도구 고정" }));
    fireEvent.click(screen.getByRole("button", { name: "기본 순서로 정렬" }));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onApply).not.toHaveBeenCalled(); expect(onCancel).toHaveBeenCalledOnce();
    expect(value.visibleIds).toEqual(initial);
  });
  it("supports multi-selection and reports concurrent configuration changes rather than overwriting them", () => {
    const { value, onApply, onCancel, view } = setup();
    fireEvent.click(screen.getByRole("button", { name: "추가 목록 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 추가" }));
    view.rerender(<StudioToolbarConfigurator value={{ ...value, view: "list" }} onApply={onApply} onCancel={onCancel} />);
    expect(screen.getByRole("alert").textContent).toContain("다른 화면에서 구성이 바뀌었습니다");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "구성 적용" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "최신 구성 불러오기" }));
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "도구막대 보기 방식" }).value).toBe("list");
    expect(onApply).not.toHaveBeenCalled();
  });
  it("retains exactly one tool and keeps saved work profiles separate from document commands", () => {
    const onApply = vi.fn(); const value = { ...defaultStudioAppSettings().toolbar, configured: true, visibleIds: ["pen"] as const };
    render(<StudioToolbarConfigurator value={{ ...value, visibleIds: [...value.visibleIds] }} onApply={onApply} onCancel={vi.fn()} />);
    const pinned = screen.getByRole("region", { name: "도구막대에 표시" });
    expect(within(pinned).getByRole<HTMLButtonElement>("button", { name: "펜 숨기기" }).disabled).toBe(true);
    const details = screen.getByText("작업별 구성 · 내 구성 저장").closest("details")!; details.open = true;
    fireEvent.change(screen.getByRole("textbox", { name: "새 도구 구성 이름" }), { target: { value: "내 선화" } });
    fireEvent.click(screen.getByRole("button", { name: "구성 저장" }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "구성 적용" }));
    expect(onApply.mock.calls[0]![0].profiles).toEqual([expect.objectContaining({ name: "내 선화", visibleIds: ["pen"] })]);
  });
});
