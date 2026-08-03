// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  STUDIO_HOKUSAI_WORKER_ADAPTER_VERSION,
  STUDIO_HOKUSAI_WORKER_PROTOCOL_VERSION,
} from "./studio-hokusai-natural-media-worker-protocol";
import {
  StudioHokusaiNaturalMediaInspectorSection,
} from "./StudioHokusaiNaturalMediaInspectorSection";

import type { DrawEl } from "./studio-element-model";
import type { StudioHokusaiNaturalMediaProductResult } from "./studio-hokusai-natural-media-product";

const probeProduct = vi.fn(async () => ({
  available: true as const,
  message: "Hokusai WASM 준비 완료",
  runtime: {
    engine: "reearth-hokusai" as const,
    version: "0.3.0" as const,
    adapterVersion: STUDIO_HOKUSAI_WORKER_ADAPTER_VERSION,
    wasm: true as const,
    dedicatedWorker: true as const,
    transparentRgba: true as const,
    dirtyTiles: true as const,
    packedDirtyFrame: true as const,
    mainThreadFallback: false as const,
  },
}));
const generateProduct = vi.fn();

vi.mock("./studio-hokusai-natural-media-product", () => ({
  probeStudioHokusaiNaturalMediaProduct: probeProduct,
  generateStudioHokusaiNaturalMediaProduct: generateProduct,
}));

const selected: DrawEl = {
  id: "draw-1",
  type: "draw",
  points: [10, 10, 20, 20, 30, 15],
  pressures: [0.2, 0.5, 1],
  stroke: "#102030",
  strokeWidth: 6,
  brush: "gpen",
};

afterEach(cleanup);

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve(value: T): void;
}> {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      if (!resolvePromise) throw new Error("Deferred promise is unavailable.");
      resolvePromise(value);
    },
  };
}

function productResult(): StudioHokusaiNaturalMediaProductResult {
  return {
    src: "data:image/png;base64,iVBORw0KGgo=",
    rasterWidth: 32,
    rasterHeight: 24,
    logicalBounds: { x: 8, y: 8, width: 24, height: 18 },
    sourceElementId: selected.id,
    sourceRevision: "hokusai-source-v1:0123456789abcdef",
    name: "Hokusai 연필",
    message: "Hokusai 자연매체 변환 완료",
    receipt: {
      kind: "studio-hokusai/receipt",
      version: STUDIO_HOKUSAI_WORKER_PROTOCOL_VERSION,
      requestId: 1,
      engineEpoch: 1,
      sourceElementId: selected.id,
      presetId: "pencil",
      materialProfileId: "pencil",
      seed: 0x48_4f_4b_55,
      rasterWidth: 32,
      rasterHeight: 24,
      outputRasterWidth: 32,
      outputRasterHeight: 24,
      dirtyBounds: [0, 0, 32, 24],
      pixelLayout: "packed-dirty-rgba8",
      inputHash: `sha256:${"1".repeat(64)}`,
      pixelHash: `sha256:${"2".repeat(64)}`,
      pngHash: `sha256:${"3".repeat(64)}`,
      adapterVersion: STUDIO_HOKUSAI_WORKER_ADAPTER_VERSION,
      execution: "dedicated-worker-wasm-packed-dirty-frame",
      complete: true,
    },
  };
}

function openSection(container: HTMLElement): void {
  const details = container.querySelector("details");
  if (!(details instanceof HTMLDetailsElement)) {
    throw new Error("Hokusai details section was not rendered.");
  }
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

describe("Studio Hokusai natural-media inspector", () => {
  it("explains non-destructive conversion and exposes all five media presets", () => {
    const { container } = render(
      <StudioHokusaiNaturalMediaInspectorSection
        selected={selected}
        currentColor="#102030"
        documentWidth={800}
        documentHeight={1_200}
        pageId="page-1"
        masterEditMode={false}
        disabled={false}
        disabledReason={null}
        onReplace={vi.fn(() => true)}
      />,
    );

    openSection(container);
    expect(screen.getByText(/원본 벡터는 숨김 보존/u)).not.toBeNull();
    for (const label of ["연필", "목탄", "오일", "캘리그래피", "마커"]) {
      expect(screen.getByRole("radio", {
        name: new RegExp(`^${label}`, "u"),
      })).not.toBeNull();
    }
    const action = screen.getByRole("button", {
      name: "선택 획을 자연매체로 변환",
    });
    expect((action as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers a direct route into stroke selection when no completed freehand vector is selected", () => {
    const onRequestSelectStroke = vi.fn();
    const { container } = render(
      <StudioHokusaiNaturalMediaInspectorSection
        selected={null}
        currentColor="#102030"
        documentWidth={800}
        documentHeight={1_200}
        pageId="page-1"
        masterEditMode={false}
        disabled={false}
        disabledReason={null}
        onRequestSelectStroke={onRequestSelectStroke}
        onReplace={vi.fn(() => true)}
      />,
    );
    openSection(container);
    expect(screen.getByText(/자유곡선 선화를 먼저 선택/u)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "선화 선택하기" }));
    expect(onRequestSelectStroke).toHaveBeenCalledOnce();
    const action = screen.getByRole("button", {
      name: "선택 획을 자연매체로 변환",
    });
    expect((action as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts from the selected stroke pigment and opacity without overwriting same-selection edits", async () => {
    const firstSelection: DrawEl = {
      ...selected,
      stroke: "#123456",
      opacity: 0.42,
    };
    const { container, rerender } = render(
      <StudioHokusaiNaturalMediaInspectorSection
        selected={firstSelection}
        currentColor="#abcdef"
        documentWidth={800}
        documentHeight={1_200}
        pageId="page-1"
        masterEditMode={false}
        disabled={false}
        disabledReason={null}
        onReplace={vi.fn(() => true)}
      />,
    );
    openSection(container);
    await waitFor(() => {
      expect(screen.getByText("사용 가능")).not.toBeNull();
    });
    const colorInput = screen.getByRole("textbox", {
      name: "Hokusai 안료 색상 코드",
    }) as HTMLInputElement;
    const opacityInput = screen.getByRole("slider", {
      name: /안료 불투명도/u,
    }) as HTMLInputElement;
    expect(colorInput.value).toBe("#123456");
    expect(opacityInput.value).toBe("0.42");

    fireEvent.change(colorInput, { target: { value: "#fedcba" } });
    fireEvent.change(opacityInput, { target: { value: "0.73" } });
    rerender(
      <StudioHokusaiNaturalMediaInspectorSection
        selected={{ ...firstSelection, points: [...firstSelection.points, 44, 28] }}
        currentColor="#654321"
        documentWidth={800}
        documentHeight={1_200}
        pageId="page-1"
        masterEditMode={false}
        disabled={false}
        disabledReason={null}
        onReplace={vi.fn(() => true)}
      />,
    );
    expect(colorInput.value).toBe("#fedcba");
    expect(opacityInput.value).toBe("0.73");

    rerender(
      <StudioHokusaiNaturalMediaInspectorSection
        selected={{
          ...firstSelection,
          id: "draw-2",
          stroke: "#334455",
          opacity: 0.31,
        }}
        currentColor="#654321"
        documentWidth={800}
        documentHeight={1_200}
        pageId="page-1"
        masterEditMode={false}
        disabled={false}
        disabledReason={null}
        onReplace={vi.fn(() => true)}
      />,
    );
    await waitFor(() => {
      expect(colorInput.value).toBe("#334455");
      expect(opacityInput.value).toBe("0.31");
    });
  });

  it("uses the latest document transaction and rejects a stale source revision", async () => {
    const pending = deferred<StudioHokusaiNaturalMediaProductResult>();
    generateProduct.mockReturnValueOnce(pending.promise);
    const staleReplace = vi.fn(() => true);
    const latestReplace = vi.fn(() => false);
    const { container, rerender } = render(
      <StudioHokusaiNaturalMediaInspectorSection
        selected={selected}
        currentColor="#102030"
        documentWidth={800}
        documentHeight={1_200}
        pageId="page-1"
        masterEditMode={false}
        disabled={false}
        disabledReason={null}
        onReplace={staleReplace}
      />,
    );
    openSection(container);
    await waitFor(() => {
      expect(screen.getByText("사용 가능")).not.toBeNull();
    });
    fireEvent.click(screen.getByRole("button", {
      name: "선택 획을 자연매체로 변환",
    }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "취소" })).not.toBeNull();
    });

    rerender(
      <StudioHokusaiNaturalMediaInspectorSection
        selected={{
          ...selected,
          // Same identity, newer geometry: StudioPage's latest closure owns
          // the source-revision comparison and must reject the old receipt.
          points: [...selected.points, 40, 24],
        }}
        currentColor="#102030"
        documentWidth={800}
        documentHeight={1_200}
        pageId="page-1"
        masterEditMode={false}
        disabled={false}
        disabledReason={null}
        onReplace={latestReplace}
      />,
    );
    await act(async () => pending.resolve(productResult()));

    await waitFor(() => {
      expect(screen.getByText(/선택 획이 변경되어/u)).not.toBeNull();
    });
    expect(staleReplace).not.toHaveBeenCalled();
    expect(latestReplace).toHaveBeenCalledOnce();
  });
});
