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

const assetLibraryMock = vi.hoisted(() => ({
  listAssets: vi.fn(),
  ensureStudioAssetContentHash: vi.fn(),
}));

vi.mock("./studio-asset-library", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-asset-library")>();
  return {
    ...actual,
    listAssets: assetLibraryMock.listAssets,
    ensureStudioAssetContentHash: assetLibraryMock.ensureStudioAssetContentHash,
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
}: {
  initialDocument: StudioReferenceBoardDocument;
  onCommit: (next: StudioReferenceBoardDocument) => void;
}) {
  const [document, setDocument] = useState(initialDocument);
  return (
    <StudioReferencePanel
      open
      onClose={vi.fn()}
      document={document}
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
