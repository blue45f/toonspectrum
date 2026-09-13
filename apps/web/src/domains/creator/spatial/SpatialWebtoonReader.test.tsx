// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SpatialWebtoonReader from "./SpatialWebtoonReader";

const runtime = vi.hoisted(() => ({ inspectSupport: vi.fn(), update: vi.fn(), start: vi.fn(), end: vi.fn(), recenter: vi.fn(), dispose: vi.fn() }));
const createRuntime = vi.hoisted(() => vi.fn());
vi.mock("./spatial-reader-runtime", () => ({ createSpatialReaderRuntime: createRuntime }));
const capabilities = { kind: "toonspectrum.studio-webxr-support", version: 1, secureContext: true, immersiveAr: "supported", immersiveVr: "supported" };
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
const originalXr = Object.getOwnPropertyDescriptor(navigator, "xr");
function loaded(width = 800, height = 4000) {
  const image = screen.getByRole("img");
  Object.defineProperties(image, { naturalWidth: { configurable: true, value: width }, naturalHeight: { configurable: true, value: height } });
  fireEvent.load(image); return image;
}
beforeEach(() => {
  vi.clearAllMocks(); window.localStorage.clear(); vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "xr", { configurable: true, value: undefined });
  runtime.inspectSupport.mockResolvedValue(capabilities); runtime.start.mockResolvedValue(undefined);
  runtime.end.mockResolvedValue(undefined); runtime.dispose.mockResolvedValue(undefined); createRuntime.mockReturnValue(runtime);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal); else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose); else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  if (originalXr) Object.defineProperty(navigator, "xr", originalXr); else Reflect.deleteProperty(navigator, "xr");
});
describe("spatial reader interaction", () => {
  it("keeps 2D working without constructing XR on unsupported browsers", () => {
    render(<SpatialWebtoonReader title="검토" pages={["/one.png", "/two.png"]} onClose={vi.fn()} />);
    loaded(); expect(createRuntime).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "AR로 읽기" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "다음 구간" }));
    expect(screen.getByAltText("검토 1페이지 · 2구간")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("button", { name: "이전 구간" }), { key: "Home" });
    expect(screen.getByAltText("검토 1페이지 · 1구간")).toBeTruthy();
  });
  it("maps RTL arrows on native navigation buttons without reversing sources", () => {
    render(<SpatialWebtoonReader title="RTL" direction="rtl" pages={["/one.png", "/two.png"]} onClose={vi.fn()} />);
    loaded(800, 1120); fireEvent.keyDown(screen.getByRole("button", { name: "다음 구간" }), { key: "ArrowLeft" });
    expect(screen.getByAltText("RTL 2페이지 · 1구간").getAttribute("src")).toBe(new URL("/two.png", document.baseURI).href);
  });
  it("rejects non-raster local files without replacing the open work", () => {
    render(<SpatialWebtoonReader title="기존" pages={["/one.png"]} onClose={vi.fn()} />); loaded();
    fireEvent.change(screen.getByLabelText("공간 리더 원고 이미지 선택"), { target: { files: [new File(["bad"], "bad.svg", { type: "image/svg+xml" })] } });
    expect(screen.getByRole("alert").textContent).toContain("SVG");
    expect(screen.getByRole("img").getAttribute("src")).toBe(new URL("/one.png", document.baseURI).href);
  });
  it("does not put unsupported source schemes in the DOM", () => {
    render(<SpatialWebtoonReader pages={["javascript:alert(1)"]} onClose={vi.fn()} />);
    expect(screen.queryByRole("img")).toBeNull(); expect(screen.getByRole("alert").textContent).toContain("이미지 주소");
  });
  it("passes only the canonical image URL to the DOM", () => {
    render(<SpatialWebtoonReader pages={["/page one.png?sig=a%2Fb&part=1"]} onClose={vi.fn()} />);
    expect(screen.getByRole("img").getAttribute("src"))
      .toBe(new URL("/page%20one.png?sig=a%2Fb&part=1", document.baseURI).href);
  });
  it.each(["javascript:alert(1)", "data:text/html;base64,PHN2Zz4=", "data:image/svg+xml;base64,PHN2Zz4=", "https://user:pass@example.com/page.png", "blob:https://other.test/id"])
    ("removes the previous image when a new source is rejected: %s", (source) => {
      const view = render(<SpatialWebtoonReader pages={["/one.png"]} onClose={vi.fn()} />);
      loaded();
      view.rerender(<SpatialWebtoonReader pages={[source]} onClose={vi.fn()} />);
      expect(screen.queryByRole("img")).toBeNull();
      expect(screen.getByRole("alert").textContent).toContain("이미지 주소");
    });
  it("opens local pages in natural filename order and revokes URLs on close", () => {
    const createUrl = vi.fn((file: File) => `blob:${window.location.origin}/${file.name}`);
    const revoke = vi.fn(); vi.stubGlobal("URL", class extends URL { static createObjectURL = createUrl; static revokeObjectURL = revoke; });
    const view = render(<SpatialWebtoonReader onClose={vi.fn()} />);
    const ten = new File(["png"], "10.png", { type: "image/png" });
    const two = new File(["png"], "2.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("공간 리더 원고 이미지 선택"), { target: { files: [ten, two] } });
    expect(createUrl.mock.calls.map(([file]) => file.name)).toEqual(["2.png", "10.png"]);
    expect(screen.getByRole("img").getAttribute("src")).toContain("2.png");
    view.unmount(); expect(revoke).toHaveBeenCalledTimes(2);
  });
  it("requests a supported session only on explicit click and waits for cleanup before closing", async () => {
    Object.defineProperty(navigator, "xr", { configurable: true, value: {} });
    const onClose = vi.fn(); render(<SpatialWebtoonReader pages={["/one.png"]} onClose={onClose} />);
    const start = screen.getByRole("button", { name: "VR로 읽기" }) as HTMLButtonElement;
    await waitFor(() => expect(start.disabled).toBe(false)); expect(runtime.start).not.toHaveBeenCalled();
    fireEvent.click(start); expect(runtime.start).toHaveBeenCalledWith("immersive-vr");
    let finish!: () => void; runtime.dispose.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "공간 리더 닫기" }));
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { finish(); }); expect(onClose).toHaveBeenCalledOnce();
  });
  it("keeps the original 2D page when a device rejects the session", async () => {
    Object.defineProperty(navigator, "xr", { configurable: true, value: {} });
    runtime.start.mockRejectedValue(new Error("permission denied"));
    render(<SpatialWebtoonReader title="권한" pages={["/one.png"]} onClose={vi.fn()} />); loaded();
    const start = screen.getByRole("button", { name: "AR로 읽기" }) as HTMLButtonElement;
    await waitFor(() => expect(start.disabled).toBe(false)); fireEvent.click(start);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("permission denied"));
    expect(screen.getByAltText("권한 1페이지 · 1구간")).toBeTruthy();
  });
  it("disposes a reader removed while capability probing is unresolved", async () => {
    Object.defineProperty(navigator, "xr", { configurable: true, value: {} });
    let finish!: (value: typeof capabilities) => void;
    runtime.inspectSupport.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const view = render(<SpatialWebtoonReader pages={["/one.png"]} onClose={vi.fn()} />);
    await waitFor(() => expect(createRuntime).toHaveBeenCalled()); view.unmount();
    expect(runtime.dispose).toHaveBeenCalled(); await act(async () => { finish(capabilities); });
    expect(runtime.start).not.toHaveBeenCalled();
  });
});

describe("spatial reader DOM XSS regression", () => {
  it("keeps manuscript titles and imported filenames out of HTML sinks", () => {
    const title = '<img src=x onerror="alert(1)">';
    const file = new File(["raster"], '"><svg onload="alert(1)">.png', { type: "image/png" });
    const source = `blob:${window.location.origin}/safe-manuscript`;
    const createUrl = vi.fn(() => source);
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revoke;
    });
    const view = render(<SpatialWebtoonReader title={title} pages={["/one.png"]} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(title);
    expect(screen.getByRole("img").getAttribute("alt")).toBe(`${title} 1페이지 · 1구간`);
    expect(view.container.querySelector("script, svg, [onerror], [onload]")).toBeNull();
    fireEvent.change(screen.getByLabelText("공간 리더 원고 이미지 선택"), { target: { files: [file] } });
    expect(createUrl).toHaveBeenCalledWith(file);
    expect(screen.getByRole("img").getAttribute("src")).toBe(source);
    expect(view.container.querySelector("script, svg, [onerror], [onload]")).toBeNull();
    expect(view.container.textContent).not.toContain(file.name);
    view.unmount();
    expect(revoke).toHaveBeenCalledWith(source);
  });
});
