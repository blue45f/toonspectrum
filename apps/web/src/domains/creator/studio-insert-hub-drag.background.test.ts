import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_ASSET_DRAG_MIME,
  type StudioWritableDataTransfer,
} from "./studio-insert-drag-core";
import {
  canDragStudioInsertHubEntry,
  resolveStudioInsertHubDragDescriptor,
  writeStudioInsertHubDragPayload,
} from "./studio-insert-hub-drag";
import { buildStudioInsertHubEntries } from "./studio-insert-hub-model";
import { parseStudioAssetDragPayload } from "./studio-shared-asset-drag";

import type { StudioInsertHubEntry } from "./studio-insert-hub-model";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

function backgroundItem(svg: string): StudioUnifiedAssetItem {
  return {
    id: "background:drag-preview",
    category: "scene",
    scope: "studio",
    title: "드래그 배경",
    description: "직접 배치 가능한 벡터 배경",
    categoryLabel: "2D 배경",
    keywords: ["배경", "드래그"],
    badges: ["벡터"],
    preview: { kind: "svg", svg },
    useMode: "insert",
    useLabel: "배경 삽입",
    discoverability: "featured",
    sortPriority: 1,
    source: {
      kind: "background",
      value: {
        id: "drag-preview",
        label: "드래그 배경",
        genre: "일상",
        svg,
        width: 720,
        height: 480,
      },
    },
  };
}

function assetEntry(item: StudioUnifiedAssetItem): StudioInsertHubEntry {
  const entry = buildStudioInsertHubEntries([item]).find(
    (candidate) => candidate.kind === "asset" && candidate.id === item.id,
  );
  if (!entry) throw new Error("배경 삽입 엔트리를 만들지 못했습니다.");
  return entry;
}

function transfer() {
  const writes = new Map<string, string>();
  const value: StudioWritableDataTransfer = {
    effectAllowed: "none",
    setData: vi.fn((format: string, payload: string) => writes.set(format, payload)),
  };
  return { value, writes };
}

describe("studio insert hub vector background drag", () => {
  it("serializes a safe Studio SVG background through the shared asset MIME", () => {
    const entry = assetEntry(backgroundItem(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480"><rect width="720" height="480" fill="#dde7f2"/></svg>',
    ));
    const { value, writes } = transfer();

    expect(canDragStudioInsertHubEntry(entry)).toBe(true);
    expect(writeStudioInsertHubDragPayload(value, {
      entry,
      canvasWidth: 720,
      canvasHeight: 1_200,
    })).toBe(true);

    const parsed = parseStudioAssetDragPayload(
      writes.get(STUDIO_ASSET_DRAG_MIME) ?? "",
    );
    expect(parsed).toMatchObject({ source: "local", width: 720, height: 480 });
    expect(value.effectAllowed).toBe("copy");
  });

  it("fails closed when a background SVG contains executable markup", () => {
    const entry = assetEntry(backgroundItem(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ));
    expect(canDragStudioInsertHubEntry(entry)).toBe(false);
    expect(resolveStudioInsertHubDragDescriptor({
      entry,
      canvasWidth: 720,
      canvasHeight: 1_200,
    })).toBeNull();
  });
});
