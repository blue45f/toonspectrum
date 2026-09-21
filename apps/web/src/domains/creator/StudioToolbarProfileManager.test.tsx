// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { defaultStudioAppSettings, type StudioToolbarPreferences } from "./studio-app-settings";
import { StudioToolbarConfigurator } from "./StudioToolbarConfigurator";
import { StudioToolbarProfileManager } from "./StudioToolbarProfileManager";

afterEach(cleanup);
function initial(): StudioToolbarPreferences {
  return { ...defaultStudioAppSettings().toolbar, configured: true, visibleIds: ["pen", "eraser"],
    activeProfileId: "line", profiles: [
      { id: "line", name: "선화 작업", visibleIds: ["pen"], view: "single" },
      { id: "paint", name: "채색 작업", visibleIds: ["pen", "fill"], view: "double" },
    ] };
}
function Harness({ changed }: { changed: (value: StudioToolbarPreferences) => void }) {
  const [value, setValue] = useState(initial);
  return <StudioToolbarProfileManager value={value} onChange={(next) => { changed(next); setValue(next); }} />;
}
it("renames without changing identity, tool order, view or active profile", () => {
  const changed = vi.fn(); render(<Harness changed={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "선화 작업 구성 이름 변경" }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "  원고 선화  " } });
  fireEvent.click(screen.getByRole("button", { name: "이름 변경 확인" }));
  expect(changed).toHaveBeenCalledExactlyOnceWith({ ...initial(), profiles: [
    { ...initial().profiles![0]!, name: "원고 선화" }, initial().profiles![1]!,
  ] });
});

it("rejects blank and duplicate names and leaves IME Enter uncommitted", () => {
  const changed = vi.fn(); render(<Harness changed={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "선화 작업 구성 이름 변경" }));
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: " " } });
  fireEvent.click(screen.getByRole("button", { name: "이름 변경 확인" }));
  expect(screen.getByRole("alert").textContent).toContain("1~48");
  fireEvent.change(input, { target: { value: "채색 작업" } });
  fireEvent.click(screen.getByRole("button", { name: "이름 변경 확인" }));
  expect(screen.getByRole("alert").textContent).toContain("같은 이름");
  fireEvent.change(input, { target: { value: "새 이름" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(changed).not.toHaveBeenCalled();
});
it("requires confirmation to delete and never removes the current tool layout", () => {
  const changed = vi.fn(); render(<Harness changed={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "선화 작업 구성 삭제" }));
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "삭제 취소" }));
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "선화 작업 구성 삭제" }));
  fireEvent.click(screen.getByRole("button", { name: "선화 작업 구성 삭제 확인" }));
  expect(changed).toHaveBeenCalledExactlyOnceWith({ ...initial(), activeProfileId: null, profiles: [initial().profiles![1]!] });
});

it("keeps deletion in the draft, restores capacity and publishes only on Apply", () => {
  const value = initial();
  value.profiles = Array.from({ length: 12 }, (_, index) => ({
    id: `profile-${index}`, name: `구성 ${index}`, visibleIds: ["pen" as const], view: "single" as const,
  }));
  const before = JSON.stringify(value);
  const apply = vi.fn(); const cancel = vi.fn();
  render(<StudioToolbarConfigurator value={value} onApply={apply} onCancel={cancel} />);
  fireEvent.click(screen.getByText("작업별 구성 · 내 구성 저장"));
  fireEvent.change(screen.getByRole("textbox", { name: "새 도구 구성 이름" }), { target: { value: "새 작업" } });
  expect((screen.getByRole("button", { name: "구성 저장" }) as HTMLButtonElement).disabled).toBe(true);
  const manager = screen.getByRole("region", { name: "저장한 도구 구성" });
  fireEvent.click(within(manager).getByRole("button", { name: "구성 0 구성 삭제" }));
  fireEvent.click(within(manager).getByRole("button", { name: "구성 0 구성 삭제 확인" }));
  expect((screen.getByRole("button", { name: "구성 저장" }) as HTMLButtonElement).disabled).toBe(false);
  expect(apply).not.toHaveBeenCalled();
  expect(JSON.stringify(value)).toBe(before);
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(cancel).toHaveBeenCalledOnce(); expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "구성 적용" }));
  expect(apply).toHaveBeenCalledOnce();
  expect(apply.mock.calls[0]![0].profiles).toHaveLength(11);
});
