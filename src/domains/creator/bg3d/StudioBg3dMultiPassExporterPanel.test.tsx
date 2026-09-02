// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

import { StudioBg3dMultiPassExporterPanel } from "./StudioBg3dMultiPassExporterPanel";

describe("StudioBg3dMultiPassExporterPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders multi-pass options and starts export session", () => {
    const handleExport = vi.fn();
    render(<StudioBg3dMultiPassExporterPanel onStartMultiPassExport={handleExport} />);

    expect(screen.getByText("멀티패스 레이어 자동 분리 내보내기")).toBeDefined();
    expect(screen.getByText("01_선화 (Line Art)")).toBeDefined();
    expect(screen.getByText("02_밑색 (Flat Color)")).toBeDefined();

    const exportBtn = screen.getByText("레이어별 패스 렌더링 & 다운로드 시작");
    fireEvent.click(exportBtn);

    expect(handleExport).toHaveBeenCalledTimes(1);
    expect(handleExport.mock.calls[0][0].includeLineArt).toBe(true);
    expect(handleExport.mock.calls[0][0].includeFlatColor).toBe(true);
  });
});
