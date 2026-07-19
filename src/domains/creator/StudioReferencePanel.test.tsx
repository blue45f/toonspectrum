// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioReferenceBoardDocument,
  createStudioReferenceBoardItem,
  type StudioReferenceBoardDocument,
  type StudioReferenceBoardItem,
} from "./studio-reference-board";
import { REFERENCE_PANEL_STORAGE_KEY, serializeReferencePanelSettings } from "./studio-reference-panel";
import { StudioReferencePanel } from "./StudioReferencePanel";

import type { StudioAsset } from "./studio-asset-library";
import type { StudioReferenceImageRaster } from "./studio-reference-color-sampler";

const assetLibraryMock = vi.hoisted(() => ({
  listAssets: vi.fn(),
  ensureStudioAssetContentHash: vi.fn(),
  saveAsset: vi.fn(),
}));
const canvasImageIoMock = vi.hoisted(() => ({
  loadImageFileForCanvas: vi.fn(),
}));
const colorSamplerMock = vi.hoisted(() => ({
  loadStudioReferenceImageRaster: vi.fn(),
}));

vi.mock("./studio-asset-library", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-asset-library")>();
  return {
    ...actual,
    listAssets: assetLibraryMock.listAssets,
    ensureStudioAssetContentHash: assetLibraryMock.ensureStudioAssetContentHash,
    saveAsset: assetLibraryMock.saveAsset,
  };
});

vi.mock("./studio-canvas-image-io", () => ({
  loadImageFileForCanvas: canvasImageIoMock.loadImageFileForCanvas,
}));

vi.mock("./studio-reference-color-sampler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-reference-color-sampler")>();
  return {
    ...actual,
    loadStudioReferenceImageRaster: colorSamplerMock.loadStudioReferenceImageRaster,
  };
});

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_MISSING = `sha256:${"c".repeat(64)}` as const;

const ASSET_A: StudioAsset = {
  id: "asset-a",
  name: "동작 A",
  dataUrl: "data:image/png;base64,AAAA",
  contentHash: HASH_A,
  width: 800,
  height: 1200,
  createdAt: 2,
};

const ASSET_B: StudioAsset = {
  id: "asset-b",
  name: "동작 B",
  dataUrl: "data:image/webp;base64,BBBB",
  contentHash: HASH_B,
  width: 1200,
  height: 800,
  createdAt: 1,
};

const COLOR_RASTER: StudioReferenceImageRaster = {
  width: 2,
  height: 3,
  data: Uint8ClampedArray.from([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 0, 255,
    1, 2, 3, 0,
    255, 0, 255, 255,
  ]),
};

function makeItem(
  id: string,
  sha256 = HASH_A,
  assetId = ASSET_A.id,
  name = ASSET_A.name
): StudioReferenceBoardItem {
  const item = createStudioReferenceBoardItem({
    id,
    asset: {
      sha256,
      assetId,
      name,
      mimeType: "image/png",
      width: 800,
      height: 1200,
    },
    view: {
      centerX: 0.5,
      centerY: 0.5,
      zoom: 1,
      rotationDeg: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      grayscale: false,
    },
  });
  if (!item) throw new Error("reference item fixture should be valid");
  return item;
}

function ControlledReferencePanel({
  initialDocument,
  onCommit,
  onPickColor,
}: {
  initialDocument: StudioReferenceBoardDocument;
  onCommit: (next: StudioReferenceBoardDocument) => void;
  onPickColor?: (hex: string) => void;
}) {
  const [document, setDocument] = useState(initialDocument);
  return (
    <StudioReferencePanel
      open
      onClose={vi.fn()}
      document={document}
      onPickColor={onPickColor}
      onChange={(next) => {
        onCommit(next);
        setDocument(next);
      }}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  assetLibraryMock.listAssets.mockResolvedValue([ASSET_A, ASSET_B]);
  assetLibraryMock.ensureStudioAssetContentHash.mockImplementation(async (asset: StudioAsset) => asset);
  let importedAssetIndex = 0;
  assetLibraryMock.saveAsset.mockImplementation(async (input: {
    name: string;
    dataUrl: string;
    width: number;
    height: number;
  }) => {
    const index = importedAssetIndex;
    importedAssetIndex += 1;
    return {
      id: `imported-${index}`,
      ...input,
      contentHash: `sha256:${String(index + 1).repeat(64)}` as `sha256:${string}`,
      createdAt: 10 + index,
    } satisfies StudioAsset;
  });
  canvasImageIoMock.loadImageFileForCanvas.mockImplementation(async (file: File) => ({
    src: `data:image/webp;base64,${file.name}`,
    width: 640,
    height: 480,
    isAnimatedGif: false,
  }));
  colorSamplerMock.loadStudioReferenceImageRaster.mockResolvedValue(COLOR_RASTER);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudioReferencePanel controlled reference board", () => {
  it("adds the same asset as multiple independent items without putting data URLs in the document", async () => {
    const onCommit = vi.fn();
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument()}
        onCommit={onCommit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "참고 이미지 추가" }));
    const addAsset = await screen.findByRole("button", { name: "동작 A 보드에 추가" });
    fireEvent.click(addAsset);
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((addAsset as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(addAsset);
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2));

    const finalDocument = onCommit.mock.calls[1]?.[0] as StudioReferenceBoardDocument;
    expect(finalDocument.items).toHaveLength(2);
    expect(finalDocument.items[0]?.id).not.toBe(finalDocument.items[1]?.id);
    expect(finalDocument.items.map((item) => item.asset.sha256)).toEqual([HASH_A, HASH_A]);
    expect(JSON.stringify(finalDocument)).not.toContain("data:image");
    expect(screen.getByText("2/32")).toBeTruthy();
  });

  it("imports multiple device files in source order and commits the board once", async () => {
    const onCommit = vi.fn();
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument()}
        onCommit={onCommit}
      />
    );
    const input = screen.getByLabelText("참고 이미지 파일 선택");
    const files = [
      new File(["png"], "첫 포즈.png", { type: "image/png" }),
      new File(["jpg"], "둘째 포즈.jpg", { type: "image/jpeg" }),
    ];

    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    expect(canvasImageIoMock.loadImageFileForCanvas.mock.calls.map(([file]) => file.name))
      .toEqual(["첫 포즈.png", "둘째 포즈.jpg"]);
    expect(assetLibraryMock.saveAsset).toHaveBeenCalledTimes(2);
    const imported = onCommit.mock.calls[0]?.[0] as StudioReferenceBoardDocument;
    expect(imported.items.map((item) => item.asset.name)).toEqual(["첫 포즈", "둘째 포즈"]);
    expect(screen.getByText("2/32")).toBeTruthy();
    expect(screen.getByText("2개 참고 이미지를 추가했습니다.")).toBeTruthy();
  });

  it("accepts board drops and image clipboard pastes as separate durable commits", async () => {
    const onCommit = vi.fn();
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument()}
        onCommit={onCommit}
      />
    );
    const dropzone = screen.getByTestId("reference-board-dropzone");
    const dropped = new File(["png"], "드롭.png", { type: "image/png" });
    fireEvent.drop(dropzone, {
      dataTransfer: { files: [dropped], types: ["Files"], dropEffect: "none" },
    });
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));

    const pasted = new File(["GIF89a"], "붙여넣기.gif", { type: "image/gif" });
    fireEvent.paste(window, {
      clipboardData: { files: [pasted], items: [] },
    });
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2));

    const imported = onCommit.mock.calls[1]?.[0] as StudioReferenceBoardDocument;
    expect(imported.items.map((item) => item.asset.name)).toEqual(["드롭", "붙여넣기"]);
    expect(assetLibraryMock.saveAsset).toHaveBeenCalledTimes(2);
  });

  it("resolves bytes by content hash before the legacy assetId hint", async () => {
    const conflictingHintItem = makeItem("ref-a", HASH_A, ASSET_B.id, "문서 이름");
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument([conflictingHintItem])}
        onCommit={vi.fn()}
      />
    );

    expect(await screen.findByRole("button", { name: "동작 A 이동 및 선택" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "동작 B 이동 및 선택" })).toBeNull();
  });

  it("keeps an unresolved hash selectable and lets the user delete its placeholder", async () => {
    const onCommit = vi.fn();
    const missingItem = makeItem("ref-missing", HASH_MISSING, "gone", "삭제된 포즈");
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument([missingItem])}
        onCommit={onCommit}
      />
    );

    expect(await screen.findByRole("button", { name: "삭제된 포즈 이동 및 선택" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "선택 이미지 속성" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 이미지 삭제" }));

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit.mock.calls[0]?.[0].items).toEqual([]);
  });

  it("keeps the controlled document and selection intact when the editor rejects a locked commit", async () => {
    const document = createStudioReferenceBoardDocument([makeItem("ref-locked")]);
    const onChange = vi.fn((_next: StudioReferenceBoardDocument) => false);
    render(
      <StudioReferencePanel
        open
        onClose={vi.fn()}
        document={document}
        onChange={onChange}
      />
    );

    const item = await screen.findByRole("button", { name: "동작 A 이동 및 선택" });
    fireEvent.click(screen.getByRole("button", { name: "선택 이미지 속성" }));
    fireEvent.click(screen.getByRole("button", { name: "선택 이미지 삭제" }));

    expect(onChange).toHaveBeenCalledOnce();
    const rejectedDocument = onChange.mock.calls.at(0)?.[0];
    expect(rejectedDocument?.items).toEqual([]);
    expect(item.isConnected).toBe(true);
    expect(screen.getByRole("button", { name: "선택 이미지 삭제" })).toBeTruthy();
  });

  it("previews an item drag locally and commits the normalized final position once", async () => {
    const onCommit = vi.fn();
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument([makeItem("ref-drag")])}
        onCommit={onCommit}
      />
    );
    const item = await screen.findByRole("button", { name: "동작 A 이동 및 선택" });
    const canvas = screen.getByTestId("reference-board-canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(item, { pointerId: 7, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(item, { pointerId: 7, clientX: 90, clientY: 60 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(item.style.left).toBe("70%");
    expect(item.style.top).toBe("60%");

    fireEvent.pointerUp(item, { pointerId: 7, clientX: 90, clientY: 60 });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit.mock.calls[0]?.[0].items[0]?.view).toMatchObject({ centerX: 0.7, centerY: 0.6 });
  });

  it("rolls a cancelled item drag back without creating a document commit", async () => {
    const onCommit = vi.fn();
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument([makeItem("ref-cancel")])}
        onCommit={onCommit}
      />
    );
    const item = await screen.findByRole("button", { name: "동작 A 이동 및 선택" });
    const canvas = screen.getByTestId("reference-board-canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(item, { pointerId: 9, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(item, { pointerId: 9, clientX: 90, clientY: 60 });
    fireEvent.pointerCancel(item, { pointerId: 9 });

    expect(onCommit).not.toHaveBeenCalled();
    expect(item.style.left).toBe("50%");
    expect(item.style.top).toBe("50%");

    fireEvent.pointerDown(item, { pointerId: 10, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(item, { pointerId: 10, clientX: 70, clientY: 70 });
    fireEvent.lostPointerCapture(item, { pointerId: 10 });
    expect(onCommit).not.toHaveBeenCalled();
    expect(item.style.left).toBe("50%");
    expect(item.style.top).toBe("50%");
  });

  it("coalesces range previews into one transform commit and does not double-commit on blur", async () => {
    const onCommit = vi.fn();
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument([makeItem("ref-transform")])}
        onCommit={onCommit}
      />
    );
    await screen.findByRole("button", { name: "동작 A 이동 및 선택" });
    fireEvent.click(screen.getByRole("button", { name: "선택 이미지 속성" }));
    const zoom = screen.getByRole("slider", { name: "선택 이미지 크기" });

    fireEvent.pointerDown(zoom, { pointerId: 3 });
    fireEvent.change(zoom, { target: { value: "125" } });
    fireEvent.change(zoom, { target: { value: "150" } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText("150%")).toBeTruthy();

    fireEvent.pointerUp(zoom, { pointerId: 3 });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit.mock.calls[0]?.[0].items[0]?.view.zoom).toBe(1.5);
    fireEvent.blur(zoom);
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("extracts a six-color local palette and forwards a selected swatch without a document commit", async () => {
    const onCommit = vi.fn();
    const onPickColor = vi.fn();
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument([makeItem("ref-colors")])}
        onCommit={onCommit}
        onPickColor={onPickColor}
      />
    );

    await screen.findByRole("button", { name: "동작 A 이동 및 선택" });
    fireEvent.click(screen.getByRole("button", { name: "선택 이미지 속성" }));
    const red = await screen.findByRole("button", { name: "#ff0000 색상 선택" });

    expect(colorSamplerMock.loadStudioReferenceImageRaster).toHaveBeenCalledWith(
      ASSET_A.dataUrl,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    fireEvent.click(red);

    expect(onPickColor).toHaveBeenCalledOnce();
    expect(onPickColor).toHaveBeenCalledWith("#ff0000");
    expect(red.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("#ff0000 색상을 기본색으로 선택했습니다.")).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("samples the transformed selected image by pointer and keyboard, and Escape exits eyedropper mode", async () => {
    const onPickColor = vi.fn();
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument([makeItem("ref-eyedropper")])}
        onCommit={vi.fn()}
        onPickColor={onPickColor}
      />
    );

    const initialItem = await screen.findByRole("button", { name: "동작 A 이동 및 선택" });
    const canvas = screen.getByTestId("reference-board-canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });
    fireEvent.click(screen.getByRole("button", { name: "선택 이미지 속성" }));
    await screen.findByRole("button", { name: "#ffff00 색상 선택" });

    const toggle = screen.getByRole("button", { name: "참고 이미지 스포이드 켜기" });
    fireEvent.click(toggle);
    const samplingItem = screen.getByRole("button", { name: "동작 A 색상 추출" });
    fireEvent.pointerDown(samplingItem, { pointerId: 21, button: 0, clientX: 100, clientY: 50 });
    expect(onPickColor).toHaveBeenLastCalledWith("#ffff00");

    fireEvent.keyDown(samplingItem, { key: "Escape" });
    expect(screen.getByRole("button", { name: "참고 이미지 스포이드 켜기" }).getAttribute("aria-pressed"))
      .toBe("false");
    expect(screen.getByRole("button", { name: "동작 A 이동 및 선택" })).toBe(initialItem);

    fireEvent.click(screen.getByRole("button", { name: "참고 이미지 스포이드 켜기" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "동작 A 색상 추출" }), { key: "Enter" });
    expect(onPickColor).toHaveBeenCalledTimes(2);
    expect(onPickColor).toHaveBeenLastCalledWith("#ffff00");
  });

  it("reports local color-analysis failures and retries without changing the board", async () => {
    colorSamplerMock.loadStudioReferenceImageRaster.mockRejectedValueOnce(new Error("픽셀 디코드 실패"));
    const onCommit = vi.fn();
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument([makeItem("ref-retry")])}
        onCommit={onCommit}
        onPickColor={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: "동작 A 이동 및 선택" });
    fireEvent.click(screen.getByRole("button", { name: "선택 이미지 속성" }));
    expect((await screen.findByRole("alert")).textContent).toContain("픽셀 디코드 실패");

    fireEvent.click(screen.getByRole("button", { name: "다시 분석" }));
    expect(await screen.findByRole("button", { name: "#ffff00 색상 선택" })).toBeTruthy();
    expect(colorSamplerMock.loadStudioReferenceImageRaster).toHaveBeenCalledTimes(2);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("migrates a legacy pinned workspace image once, including its flip state", async () => {
    window.localStorage.setItem(
      REFERENCE_PANEL_STORAGE_KEY,
      serializeReferencePanelSettings({
        x: 400,
        y: 100,
        width: 300,
        height: 260,
        assetId: ASSET_A.id,
        flipped: true,
      })
    );
    const onCommit = vi.fn();
    render(
      <ControlledReferencePanel
        initialDocument={createStudioReferenceBoardDocument()}
        onCommit={onCommit}
      />
    );

    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1));
    const migrated = onCommit.mock.calls[0]?.[0] as StudioReferenceBoardDocument;
    expect(migrated.items).toHaveLength(1);
    expect(migrated.items[0]?.asset.sha256).toBe(HASH_A);
    expect(migrated.items[0]?.view.flipX).toBe(true);

    await new Promise((resolve) => window.setTimeout(resolve, 220));
    const stored = window.localStorage.getItem(REFERENCE_PANEL_STORAGE_KEY);
    expect(stored).not.toContain(ASSET_A.id);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
