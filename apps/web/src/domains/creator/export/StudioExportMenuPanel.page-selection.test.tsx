// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetStudioExportGeometryDraft } from "./studio-export-geometry-draft";
import { StudioEnhancedExportMenuPanel } from "./StudioEnhancedExportMenuPanel";
import { StudioExportMenuPanel, type StudioExportMenuPanelProps } from "./StudioExportMenuPanel";

const encoders = vi.hoisted(() => ({
  cbz: vi.fn(async () => ({ blob: new Blob(["cbz"]), warnings: [] })),
  pdf: vi.fn(async () => ({ pageCount: 3, bytes: 100, fileName: "test.pdf" })),
  contact: vi.fn(async () => ({ pageCount: 3, sheetCount: 1, columns: 3, rows: 3, bytes: 100, fileName: "test.pdf" })),
  preset: vi.fn(async () => ({ files: 3, oversized: 0, targetWidth: 800, format: "png" })),
  verified: vi.fn(async () => ({ blob: new Blob(["zip"]), fileName: "test.zip", manifest: { pageCount: 3 } })),
}));

vi.mock("../studio-cbz-interchange", () => ({ buildStudioCbzBlob: encoders.cbz }));
vi.mock("./studio-download-package", () => ({ buildStudioDownloadPackage: encoders.verified }));
vi.mock("./studio-pdf-export", async (original) => ({
  ...await original<typeof import("./studio-pdf-export")>(),
  exportPagesToPdf: encoders.pdf,
}));
vi.mock("../studio-pdf-contact-sheet", async (original) => ({
  ...await original<typeof import("../studio-pdf-contact-sheet")>(),
  exportContactSheetPdf: encoders.contact,
}));
vi.mock("./studio-export-presets", async (original) => ({
  ...await original<typeof import("./studio-export-presets")>(),
  exportPresetSlices: encoders.preset,
}));

function canvas(page: number): HTMLCanvasElement {
  return {
    width: 800,
    height: 1200,
    toBlob: (callback: BlobCallback) => callback(new Blob([
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, page]),
    ], { type: "image/png" })),
  } as HTMLCanvasElement;
}

function panelProps(overrides: Partial<StudioExportMenuPanelProps> = {}): StudioExportMenuPanelProps {
  return {
    canvasWidth: 800, canvasHeight: 1200, exportScale: 1, exportFormat: "png",
    exportTransparent: false, exportPresetId: "webtoon-canvas", isExporting: false,
    watermark: { enabled: false, text: "", opacity: 0.2, position: "br", size: 0.028 },
    exportTitle: "선택 원고", pageCount: 5, pageLabels: ["표지", "장면 A", "장면 B", "장면 C", "후기"],
    setExportScale: vi.fn(), setExportFormat: vi.fn(), setExportTransparent: vi.fn(),
    setExportPresetId: vi.fn(), setWatermark: vi.fn(), onCopyToClipboard: vi.fn(),
    capturePagesForPreset: vi.fn(async () => Array.from({ length: 5 }, (_, i) => canvas(i))),
    capturePagesForIndices: vi.fn(async (indices) => indices.map(canvas)),
    ...overrides,
  };
}

function selectPages(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "직접 지정" }));
  fireEvent.change(screen.getByRole("textbox", { name: "내보내기 페이지 직접 지정" }), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStudioExportGeometryDraft();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:selection") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("selective delivery from the export menu", () => {
  it.each([
    ["CBZ", /^CBZ · 3P$/u, "cbz"],
    ["PDF", /^PDF \(/u, "pdf"],
    ["contact sheet", "콘택트시트 PDF로 저장", "contact"],
    ["platform slices", /^선택 3페이지$/u, "preset"],
  ] as const)("sends only the selected pages to %s", async (_name, buttonName, encoder) => {
    const pages = [canvas(0), canvas(2), canvas(4)];
    const props = panelProps({ capturePagesForIndices: vi.fn(async () => pages) });
    render(<StudioExportMenuPanel {...props} />);
    selectPages("5, 1, 3, 3");
    expect(screen.getByText("페이지 1, 3, 5 · 3P")).toBeTruthy();
    expect(screen.getByText("선택 3P · 통과")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: buttonName }));
    await waitFor(() => expect(encoders[encoder]).toHaveBeenCalledOnce());
    expect(props.capturePagesForIndices).toHaveBeenCalledWith([0, 2, 4]);
    expect(props.capturePagesForPreset).not.toHaveBeenCalled();
    if (encoder !== "cbz") {
      expect(encoders[encoder]).toHaveBeenCalledWith(expect.objectContaining({ pages }));
    }
    if (encoder === "contact") {
      expect(encoders.contact).toHaveBeenCalledWith(expect.objectContaining({ pageLabels: ["표지", "장면 B", "후기"] }));
    }
  });

  it("blocks all package paths for invalid selections and restores whole-document export with 전체", () => {
    const props = panelProps();
    render(<StudioExportMenuPanel {...props} />);
    selectPages("1, 6");
    expect(screen.getByText("선택 0P · 차단")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "내보내기 페이지 직접 지정" }).getAttribute("aria-invalid")).toBe("true");
    for (const name of [/^CBZ ·/u, /^PDF \(/u, "콘택트시트 PDF로 저장", /^선택 0페이지$/u]) {
      const button = screen.getByRole("button", { name });
      expect(button.hasAttribute("disabled")).toBe(true);
      fireEvent.click(button);
    }
    expect(props.capturePagesForIndices).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "전체" }));
    expect(screen.getByRole("button", { name: "CBZ · 5P" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("페이지 1–5 · 5P")).toBeTruthy();
  });

  it.each(["indices", "fallback"] as const)("refuses incomplete %s captures before any file is written", async (mode) => {
    const props = panelProps({
      capturePagesForIndices: mode === "indices" ? vi.fn(async () => [canvas(0)]) : undefined,
      capturePagesForPreset: vi.fn(async () => [canvas(0), canvas(1), canvas(2), canvas(3)]),
    });
    render(<StudioExportMenuPanel {...props} />);
    selectPages("1, 5");
    fireEvent.click(screen.getByRole("button", { name: "CBZ · 2P" }));
    await waitFor(() => expect(screen.getByText(/페이지 캡처가 완료되지 않았습니다/u)).toBeTruthy());
    expect(encoders.cbz).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("slices fallback capture in document order without encoding omitted pages", async () => {
    const pages = Array.from({ length: 5 }, (_, index) => canvas(index));
    const props = panelProps({ capturePagesForIndices: undefined, capturePagesForPreset: vi.fn(async () => pages) });
    render(<StudioExportMenuPanel {...props} />);
    selectPages("5, 1, 3");
    fireEvent.click(screen.getByRole("button", { name: /^PDF \(/u }));
    await waitFor(() => expect(encoders.pdf).toHaveBeenCalledWith(expect.objectContaining({ pages: [pages[0], pages[2], pages[4]] })));
    expect(props.capturePagesForPreset).toHaveBeenCalledWith("all");
  });

  it("keeps verified ZIP in the menu and preserves selected source indices in its manifest", async () => {
    const props = panelProps();
    render(<StudioEnhancedExportMenuPanel {...props} />);
    selectPages("5, 1, 3");
    const section = document.querySelector("[data-studio-verified-download-package]");
    expect(section?.closest("[data-studio-export-menu-panel]")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "페이지 ZIP 다운로드" }));
    await waitFor(() => expect(encoders.verified).toHaveBeenCalledOnce());
    expect(props.capturePagesForIndices).toHaveBeenCalledWith([0, 2, 4]);
    expect(encoders.verified).toHaveBeenCalledWith(expect.objectContaining({
      pages: [
        expect.objectContaining({ index: 0, label: "표지" }),
        expect.objectContaining({ index: 2, label: "장면 B" }),
        expect.objectContaining({ index: 4, label: "후기" }),
      ],
    }), expect.anything());
    await waitFor(() => expect(screen.getByText(/ZIP으로 저장했어요\. \(페이지 1, 3, 5\)/u)).toBeTruthy());
  });

  it("shares the capture lock between verified ZIP and the other export formats", async () => {
    let finishCapture: ((pages: HTMLCanvasElement[]) => void) | undefined;
    const props = panelProps({ capturePagesForIndices: vi.fn(() => new Promise<HTMLCanvasElement[]>((resolve) => { finishCapture = resolve; })) });
    render(<StudioEnhancedExportMenuPanel {...props} />);
    selectPages("1, 3, 5");
    fireEvent.click(screen.getByRole("button", { name: "페이지 ZIP 다운로드" }));
    expect(screen.getByRole("button", { name: "CBZ · 3P" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /^PDF \(/u }).hasAttribute("disabled")).toBe(true);
    finishCapture?.([canvas(0), canvas(2), canvas(4)]);
    await waitFor(() => expect(screen.getByRole("button", { name: "페이지 ZIP 다운로드" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "CBZ · 3P" }));
    expect(screen.getByRole("button", { name: "페이지 ZIP 다운로드" }).hasAttribute("disabled")).toBe(true);
    finishCapture?.([canvas(0), canvas(2), canvas(4)]);
    await waitFor(() => expect(encoders.cbz).toHaveBeenCalledOnce());
  });

  it("blocks verified ZIP when its shared preflight rejects the page selection", () => {
    const props = panelProps();
    render(<StudioEnhancedExportMenuPanel {...props} />);
    selectPages("1, 6");
    const download = screen.getByRole("button", { name: "페이지 ZIP 다운로드" });
    expect(download.hasAttribute("disabled")).toBe(true);
    fireEvent.click(download);
    expect(props.capturePagesForIndices).not.toHaveBeenCalled();
    expect(encoders.verified).not.toHaveBeenCalled();
  });
});
