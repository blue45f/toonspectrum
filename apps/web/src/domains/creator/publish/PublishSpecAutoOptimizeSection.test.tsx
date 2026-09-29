// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadBlob } from "../export/studio-export";
import { PublishSpecAutoOptimizeSection } from "./PublishSpecAutoOptimizeSection";

vi.mock("../export/studio-export", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../export/studio-export")>();
  return { ...mod, downloadBlob: vi.fn() };
});

const mockedDownloadBlob = vi.mocked(downloadBlob);

class FakeCanvas2DContext {
  fillStyle = "#ffffff";
  imageSmoothingEnabled = true;
  imageSmoothingQuality: ImageSmoothingQuality = "high";
  drawImage(..._args: unknown[]): void {}
  fillRect(..._args: unknown[]): void {}
}

class FakeCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(): FakeCanvas2DContext {
    return new FakeCanvas2DContext();
  }
}

const asCanvas = (fake: FakeCanvas): HTMLCanvasElement =>
  fake as unknown as HTMLCanvasElement;

function blobOf(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseProps = {
  canvasWidth: 800,
  canvasHeight: 2000,
  exportScale: 1,
  exportFormat: "jpg" as const,
  exportPresetId: null as string | null,
  exportTitle: "작품제목",
  pageCount: 1,
  busy: false,
  canExport: true,
  pageIndices: [0],
  capturePages: async () => ({
    pages: [asCanvas(new FakeCanvas(800, 2000))],
    indices: [0],
    rangeLabel: "1페이지",
  }),
  createCanvas: (width: number, height: number) => asCanvas(new FakeCanvas(width, height)),
  encode: async () => blobOf(1000),
};

describe("PublishSpecAutoOptimizeSection", () => {
  it("체크리스트와 프리셋 선택을 렌더링한다", () => {
    render(<PublishSpecAutoOptimizeSection {...baseProps} />);
    expect(screen.getByLabelText("발행 규격 체크리스트")).toBeTruthy();
    expect(screen.getByLabelText("발행 규격 프리셋")).toBeTruthy();
    // 800×2000 · canvas(1280 슬라이스) → 2장 예상
    expect(screen.getByText(/예상 2장/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /자동 최적화/ })
    ).toBeTruthy();
  });

  it("프리셋을 바꾸면 체크리스트 행이 갱신된다", () => {
    render(<PublishSpecAutoOptimizeSection {...baseProps} />);
    const select = screen.getByLabelText("발행 규격 프리셋") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "tapas" } });
    expect(select.value).toBe("tapas");
    // tapas는 세로 상한이 없어 슬라이싱 행이 "상한 없음"으로 나온다
    expect(screen.getByText(/세로 상한이 없어요/)).toBeTruthy();
  });

  it("자동 최적화는 슬라이스·썸네일을 규격 파일명으로 다운로드한다", async () => {
    render(<PublishSpecAutoOptimizeSection {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: /자동 최적화/ }));

    await waitFor(() => {
      expect(mockedDownloadBlob).toHaveBeenCalled();
    });

    const filenames = mockedDownloadBlob.mock.calls.map((call) => call[1]);
    // 800×2000 → 1280 단위 2장
    expect(filenames).toContain("작품제목-canvas-slice1of2.jpg");
    expect(filenames).toContain("작품제목-canvas-slice2of2.jpg");
    // 썸네일 3종
    expect(filenames).toContain("작품제목-canvas-thumb-series-square.jpg");
    expect(filenames).toContain("작품제목-canvas-thumb-series-portrait.jpg");
    expect(filenames).toContain("작품제목-canvas-thumb-episode.jpg");
    // 성공 상태 메시지
    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/규격에 맞게 저장했어요/);
    });
  });

  it("여러 페이지면 페이지 접미사로 파일명 충돌을 피한다", async () => {
    render(
      <PublishSpecAutoOptimizeSection
        {...baseProps}
        pageCount={2}
        pageIndices={[0, 1]}
        capturePages={async () => ({
          pages: [asCanvas(new FakeCanvas(800, 1000)), asCanvas(new FakeCanvas(800, 1000))],
          indices: [0, 1],
          rangeLabel: "1-2페이지",
        })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /자동 최적화/ }));

    await waitFor(() => {
      expect(mockedDownloadBlob).toHaveBeenCalled();
    });
    const filenames = mockedDownloadBlob.mock.calls.map((call) => call[1]);
    expect(filenames).toContain("작품제목-p1-canvas.jpg");
    expect(filenames).toContain("작품제목-p2-canvas.jpg");
  });

  it("캡처가 비면 실패 상태를 보여준다", async () => {
    render(
      <PublishSpecAutoOptimizeSection
        {...baseProps}
        capturePages={async () => ({ pages: [], indices: [], rangeLabel: "없음" })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /자동 최적화/ }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toMatch(/캡처된 페이지가 없어요/);
    });
    expect(mockedDownloadBlob).not.toHaveBeenCalled();
  });
});
