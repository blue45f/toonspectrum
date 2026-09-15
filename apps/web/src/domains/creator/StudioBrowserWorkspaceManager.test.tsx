// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioCompanionWindowManager } from "./StudioCompanionWindowManager";
import { defaultStudioBrowserWorkspace, encodeStudioBrowserWorkspace } from "./studio-companion-browser-workspace";

const { get, set } = vi.hoisted(() => ({
  get: vi.fn(async (): Promise<string | null> => null),
  set: vi.fn(async (): Promise<void> => undefined),
}));
vi.mock("./studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({ asAsyncKeyValueStore: () => ({ get, set }) }),
}));
beforeEach(() => { get.mockReset().mockResolvedValue(null); set.mockReset().mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount(onOpenSurface = vi.fn(() => true)) {
  const result = render(<StudioCompanionWindowManager disabled={false} onOpenSurface={onOpenSurface} />);
  await waitFor(() => expect(get).toHaveBeenCalled());
  return { ...result, onOpenSurface };
}
describe("browser workspace manager", () => {
  it("opens exactly one tab from the user gesture and saves the preference", async () => {
    const { onOpenSurface } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "브라우저 탭으로 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "검수 새 탭 열기 또는 앞으로 가져오기" }));
    expect(onOpenSurface).toHaveBeenCalledExactlyOnceWith("review", "tab");
    await waitFor(() => expect(set).toHaveBeenCalledWith("profile", expect.stringContaining('"openMode": "tab"')));
  });
  it("restores pinned surfaces one per gesture without duplicate windows", async () => {
    const { onOpenSurface } = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Navigator 화면 고정" }));
    fireEvent.click(screen.getByRole("button", { name: "레퍼런스 화면 고정" }));
    fireEvent.click(screen.getByRole("button", { name: /고정 화면 차례로 열기/ }));
    expect(onOpenSurface.mock.calls).toEqual([["navigator"]]);
    fireEvent.click(screen.getByRole("button", { name: /고정 화면 차례로 열기/ }));
    expect(onOpenSurface.mock.calls).toEqual([["navigator"], ["reference"]]);
    expect((screen.getByRole("button", { name: /고정 화면 차례로 열기/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("does not consume a restore step when the browser blocks the popup", async () => {
    const { onOpenSurface } = await mount(vi.fn(() => false));
    fireEvent.click(screen.getByRole("button", { name: "검수 화면 고정" }));
    fireEvent.click(screen.getByRole("button", { name: /고정 화면 차례로 열기/ }));
    fireEvent.click(screen.getByRole("button", { name: /고정 화면 차례로 열기/ }));
    expect(onOpenSurface.mock.calls).toEqual([["review"], ["review"]]);
    expect(screen.getByRole("alert").textContent).toContain("새 탭");
  });
  it("does not overwrite a user choice with late database hydration", async () => {
    let resolve!: (text: string) => void;
    get.mockReturnValueOnce(new Promise<string>((done) => { resolve = done; }));
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "브라우저 탭으로 열기" }));
    await act(async () => resolve(encodeStudioBrowserWorkspace(defaultStudioBrowserWorkspace())));
    expect(screen.getByRole("button", { name: "브라우저 탭으로 열기" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("tracks owned windows and closes only through the guarded callback", async () => {
    let opened = true;
    const close = vi.fn(() => { opened = false; return true; });
    const getOpenSurfaces = () => opened ? { review: "tab" as const } : {};
    render(<StudioCompanionWindowManager disabled={false} onOpenSurface={() => true}
      getOpenSurfaces={getOpenSurfaces} onCloseSurface={close} />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    const closeButton = screen.getByRole("button", { name: "검수 화면 닫기" }) as HTMLButtonElement;
    expect(closeButton.disabled).toBe(false);
    fireEvent.click(closeButton);
    expect(close).toHaveBeenCalledExactlyOnceWith("review");
    expect(closeButton.disabled).toBe(true);
    opened = true;
    fireEvent(window, new Event("focus"));
    expect(closeButton.disabled).toBe(false);
    opened = false;
    fireEvent(window, new Event("focus"));
    expect(closeButton.disabled).toBe(true);
  });
});
