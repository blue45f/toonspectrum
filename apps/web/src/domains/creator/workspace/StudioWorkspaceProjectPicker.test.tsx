// @vitest-environment jsdom
import { createRef, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioProject } from "../studio-project-library-store";
import { StudioWorkspaceProjectPicker } from "./StudioWorkspaceProjectPicker";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));
afterEach(cleanup);
function work(id: string, title = `작품 ${id}`) {
  const data = new Map<string, string>();
  return createStudioProject({ getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } },
    { id, title, kind: "webtoon", createdAt: "2026-09-20T00:00:00.000Z" });
}
function mount(overrides: Partial<ComponentProps<typeof StudioWorkspaceProjectPicker>> = {}) {
  const props = { projects: [work("a"), work("b")], selectedId: "a", personal: false,
    loading: false, error: null, locale: "ko", searchRef: createRef<HTMLInputElement>(), onSelect: vi.fn(), onRetry: vi.fn(), ...overrides };
  const view = render(<MemoryRouter><StudioWorkspaceProjectPicker {...props} /></MemoryRouter>);
  return { ...view, props };
}
const results = () => document.querySelectorAll<HTMLButtonElement>("button[data-workspace-project]");

describe("searchable workspace project picker", () => {
  it("bounds initial results and lets users reach every work", () => {
    mount({ projects: Array.from({ length: 61 }, (_, i) => work(String(i).padStart(3, "0"))) });
    expect(results()).toHaveLength(30);
    fireEvent.click(screen.getByRole("button", { name: "작품 더 보기" })); expect(results()).toHaveLength(60);
    fireEvent.click(screen.getByRole("button", { name: "작품 더 보기" })); expect(results()).toHaveLength(61);
    expect(screen.queryByRole("button", { name: "작품 더 보기" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "작품 00" } }); expect(results()).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "지우기" })); expect(results()).toHaveLength(30);
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });
  it("selects the exact id and distinguishes duplicate titles", () => {
    const { props } = mount({ projects: [work("a", "같은 제목"), work("b", "같은 제목")] });
    expect(results()[0].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(results()[1]); expect(props.onSelect).toHaveBeenCalledExactlyOnceWith("b");
  });
  it("supports explicit personal scope even with a search query", () => {
    const { props } = mount();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "없는 제목" } });
    expect(screen.getByText(/검색 결과가 없습니다/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /개인 작업실/ }));
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith("");
  });
  it("sorts by title and preserves selection without writing anything", () => {
    const { props } = mount({ projects: [work("a", "작품 10"), work("b", "작품 2")] });
    fireEvent.change(screen.getByRole("combobox", { name: "정렬" }), { target: { value: "title" } });
    expect(results()[0].dataset.workspaceProject).toBe("b"); expect(props.onSelect).not.toHaveBeenCalled();
  });
  it("moves focus by arrows without selecting on composition or submission", () => {
    const { props } = mount(); const search = screen.getByRole("searchbox"); search.focus();
    fireEvent.keyDown(search, { key: "ArrowDown", isComposing: true }); expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: "ArrowDown" }); expect(document.activeElement).toBe(results()[0]);
    fireEvent.keyDown(results()[0], { key: "End" }); expect(document.activeElement).toBe(results()[1]);
    fireEvent.keyDown(results()[1], { key: "Home" }); expect(document.activeElement).toBe(results()[0]);
    fireEvent.keyDown(results()[0], { key: "ArrowUp" }); expect(document.activeElement).toBe(search);
    expect(fireEvent.submit(screen.getByRole("search"))).toBe(false); expect(props.onSelect).not.toHaveBeenCalled();
  });
  it("hides stale results and creation actions while loading", () => {
    mount({ loading: true });
    expect(results()).toHaveLength(0); expect(screen.getByRole("searchbox").hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: /개인 작업실/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "새 작품 만들기" })).toBeNull();
  });
  it("offers storage recovery rather than stale selection after a failure", () => {
    const { props } = mount({ error: "저장 공간 오류" });
    expect(results()).toHaveLength(0); expect(screen.getByRole("alert").textContent).toContain("저장 공간 오류");
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" })); expect(props.onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "저장 공간 확인" }).getAttribute("href")).toBe("/studio?view=storage");
    expect(props.onSelect).not.toHaveBeenCalled();
  });
  it("distinguishes an empty device library from no matching results", () => {
    mount({ projects: [], selectedId: null, personal: true });
    expect(screen.getByText(/아직 이 기기에 등록된 작품이 없습니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /개인 작업실/ }).getAttribute("aria-pressed")).toBe("true");
  });
});
