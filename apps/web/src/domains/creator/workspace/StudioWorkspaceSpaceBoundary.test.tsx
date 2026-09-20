// @vitest-environment jsdom
import { lazy, Suspense, useState, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioWorkspaceSpaceBoundary } from "./StudioWorkspaceSpaceBoundary";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Host({ children }: { readonly children: ReactNode }) {
  const [space, setSpace] = useState(true);
  return <>
    <label>작품 선택<select defaultValue="older"><option value="older">이전 작품</option><option value="newer">새 작품</option></select></label>
    <nav aria-label="주 메뉴">스튜디오 / 작품 / 팀 / 둘러보기</nav>
    {space ? <StudioWorkspaceSpaceBoundary fallback={<section role="alert">공간 보기 오류
      <button type="button" onClick={() => setSpace(false)}>목록 보기로 전환</button>
    </section>}><Suspense fallback={<p>불러오는 중</p>}>{children}</Suspense></StudioWorkspaceSpaceBoundary>
      : <p>현재 작품 목록</p>}
  </>;
}
function BrokenSpace(): ReactNode { throw new Error("space rendering failed"); }

describe("optional workspace space view recovery", () => {
  it("renders healthy space content without a fallback", () => {
    render(<Host><p>작품 공간</p></Host>);
    expect(screen.getByText("작품 공간")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("keeps the shell and chosen work mounted after a render failure", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Host><BrokenSpace /></Host>);
    const selection = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(selection, { target: { value: "newer" } });
    expect(screen.getByRole("navigation", { name: "주 메뉴" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "목록 보기로 전환" }));
    expect(screen.getByText("현재 작품 목록")).toBeTruthy();
    expect(screen.getByRole("combobox")).toBe(selection);
    expect(selection.value).toBe("newer");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("also isolates rejected lazy imports instead of leaving a loading screen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const FailedImport = lazy(async () => { throw new Error("chunk unavailable"); });
    render(<Host><FailedImport /></Host>);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "주 메뉴" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "목록 보기로 전환" }));
    expect(screen.getByText("현재 작품 목록")).toBeTruthy();
  });
});
