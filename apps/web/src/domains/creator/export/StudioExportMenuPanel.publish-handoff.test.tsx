// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioExportMenuPanel } from "./StudioExportMenuPanel";

const handoffMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  href: vi.fn(),
}));

vi.mock("../studio-publish-handoff", () => ({
  prepareStudioPublishHandoffFromCanvases: handoffMocks.prepare,
  studioPublishHandoffHref: handoffMocks.href,
}));

function canvas(width = 800, height = 1200): HTMLCanvasElement {
  return { width, height } as HTMLCanvasElement;
}
const baseProps = {
  canvasWidth: 800,
  canvasHeight: 1200,
  exportScale: 1 as const,
  exportFormat: "png" as const,
  exportTransparent: false,
  exportPresetId: null as string | null,
  watermark: {
    enabled: false,
    text: "",
    opacity: 0.2,
    position: "br" as const,
    size: 0.028,
  },
  isExporting: false,
  exportTitle: "성운의 왕관",
  setExportScale: vi.fn(),
  setExportFormat: vi.fn(),
  setExportTransparent: vi.fn(),
  setExportPresetId: vi.fn(),
  setWatermark: vi.fn(),
  onCopyToClipboard: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("StudioExportMenuPanel publish handoff", () => {
  it("keeps selected page order and work context while navigating to publish", async () => {
    const captured = [canvas(), canvas(720, 1600)];
    const capturePagesForPreset = vi.fn(async () => captured);
    const onNavigateToPublish = vi.fn();
    handoffMocks.prepare.mockResolvedValue({ id: "handoff-ui", sourceWorkId: "work-1" });
    handoffMocks.href.mockReturnValue("/studio/work/work-1/publish?handoff=handoff-ui");

    render(
      <StudioExportMenuPanel
        {...baseProps}
        pageCount={2}
        pageLabels={["표지", "엔딩"]}
        sourceWorkId="work-1"
        capturePagesForPreset={capturePagesForPreset}
        onNavigateToPublish={onNavigateToPublish}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "선택 2페이지 보내기" }));
    await waitFor(() => expect(handoffMocks.prepare).toHaveBeenCalledTimes(1));
    expect(capturePagesForPreset).toHaveBeenCalledWith("all");
    expect(handoffMocks.prepare).toHaveBeenCalledWith({
      title: "성운의 왕관",
      sourceWorkId: "work-1",
      canvases: captured,
      pageNames: ["표지", "엔딩"],
    });
    expect(handoffMocks.href).toHaveBeenCalledWith("handoff-ui", "work-1");
    expect(onNavigateToPublish).toHaveBeenCalledWith(
      "/studio/work/work-1/publish?handoff=handoff-ui",
    );
    expect(
      await screen.findByText(/2페이지를 게시 명령 센터로 전달합니다/u),
    ).toBeTruthy();
  });
});
