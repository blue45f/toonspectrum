// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

import { MaterialAtlasPage } from "./MaterialAtlasPage";
import snapshot from "./material-atlas/catalog.json";

vi.mock("./ResourceLayout", () => ({ ResourceLayout: ({ title, children }: { title: string; children: ReactNode }) => <main><h1>{title}</h1>{children}</main> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function open(search = "") { return render(<MemoryRouter initialEntries={[`/research/materials${search}`]}><MaterialAtlasPage /></MemoryRouter>); }

describe("material atlas independent browser workflow", () => {
  it("starts without provider requests, thumbnails or an enabled export", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("무료 배경·소품 소재 도감"); expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect((screen.getByRole("button", { name: "보드 JSON 내보내기" }) as HTMLButtonElement).disabled).toBe(true); expect(fetcher).not.toHaveBeenCalled();
  });
  it("filters Korean search locally, including an honest empty state", () => {
    open(); fireEvent.change(screen.getByLabelText("검색어"), { target: { value: "벽돌" } });
    expect(screen.getAllByRole("button", { name: /소재 담기/ }).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("검색어"), { target: { value: "nonexistentabcdef" } });
    expect(screen.queryAllByRole("button", { name: /소재 담기/ })).toHaveLength(0); expect(screen.getByText(/조건에 맞는 소재가 없습니다/)).toBeTruthy();
  });
  it("changes provider and kind without a backend", () => {
    open(); fireEvent.change(screen.getByLabelText("제공처"), { target: { value: "ambientcg" } });
    expect(screen.getAllByRole("button", { name: /소재 담기/ }).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("소재 종류"), { target: { value: "model" } }); expect(screen.queryAllByRole("button", { name: /소재 담기/ })).toHaveLength(0);
  });
  it("opens a scene study and clears its filter", () => {
    open(); const guide = screen.getByRole("button", { name: /골목 배경의 세 가지 질감/ }); fireEvent.click(guide);
    expect(guide.getAttribute("aria-pressed")).toBe("true"); fireEvent.click(screen.getByRole("button", { name: "가이드 필터 해제" })); expect(guide.getAttribute("aria-pressed")).toBe("false");
  });
  it("preserves selection across filters and supports removal", () => {
    open(); fireEvent.click(screen.getAllByRole("button", { name: /소재 담기/ })[0]);
    expect((screen.getByRole("button", { name: "보드 JSON 내보내기" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("검색어"), { target: { value: "nonexistentabcdef" } });
    const board = document.querySelector("#material-board") as HTMLElement;
    expect(within(board).getAllByRole("button", { name: /목록에서 해제/ })).toHaveLength(1); fireEvent.click(within(board).getByRole("button", { name: /목록에서 해제/ }));
    expect((screen.getByRole("button", { name: "보드 JSON 내보내기" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("restores only known bounded selection from a share URL", () => {
    const ids = snapshot.assets.slice(0, 14).map((asset) => asset.id); open(`?items=${encodeURIComponent([...ids, "evil:asset"].join(","))}`);
    expect(screen.getAllByRole("button", { name: /목록에서 해제/ })).toHaveLength(12);
  });
  it("creates a manual-copy fallback without leaking private notes", async () => {
    open(`?items=${encodeURIComponent(snapshot.assets[0].id)}`);
    fireEvent.change(screen.getByLabelText("내 제작 메모"), { target: { value: "PRIVATE-NOTE-SECRET" } }); fireEvent.click(screen.getByRole("button", { name: "소재 링크 복사" }));
    const link = await screen.findByLabelText("메모를 제외한 소재 공유 링크"); expect((link as HTMLInputElement).value).toContain("items="); expect((link as HTMLInputElement).value).not.toContain("PRIVATE-NOTE-SECRET");
  });
  it("loads previews only after explicit opt-in", () => {
    open(); fireEvent.click(screen.getByRole("checkbox")); expect(screen.getAllByRole("img").length).toBeGreaterThan(0);
    for (const image of screen.getAllByRole("img")) expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
    fireEvent.click(screen.getByRole("checkbox")); expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
