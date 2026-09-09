import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_ASSET_DRAG_MIME,
  STUDIO_INSERT_DRAG_MIME,
  type StudioWritableDataTransfer,
} from "./studio-insert-drag-core";
import {
  canDragStudioInsertHubEntry,
  resolveStudioInsertHubDragDescriptor,
  writeStudioInsertHubDragPayload,
} from "./studio-insert-hub-drag";
import {
  buildStudioInsertHubEntries,
  type StudioInsertActionId,
  type StudioInsertHubEntry,
} from "./studio-insert-hub-model";
import { listStudioObjectInsertItems } from "./studio-object-insert-catalog";
import {
  parseStudioObjectInsertDragPayload,
  STUDIO_OBJECT_INSERT_DRAG_MIME,
} from "./studio-object-insert-drag";
import { parseStudioAssetDragPayload } from "./studio-shared-asset-drag";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

const LOCAL_DATA_URL = "data:image/png;base64,AA==";

function actionEntry(actionId: StudioInsertActionId): StudioInsertHubEntry {
  const entry = buildStudioInsertHubEntries([]).find(
    (candidate) =>
      candidate.kind === "action" && candidate.actionId === actionId,
  );
  if (!entry) throw new Error(`삽입 액션이 없습니다: ${actionId}`);
  return entry;
}

function assetEntry(item: StudioUnifiedAssetItem): StudioInsertHubEntry {
  const entry = buildStudioInsertHubEntries([item]).find(
    (candidate) => candidate.kind === "asset" && candidate.item.id === item.id,
  );
  if (!entry) throw new Error(`삽입 에셋이 없습니다: ${item.id}`);
  return entry;
}

function createTransfer() {
  const writes = new Map<string, string>();
  const setData = vi.fn((format: string, data: string) => {
    writes.set(format, data);
  });
  const transfer: StudioWritableDataTransfer = {
    effectAllowed: "none",
    setData,
  };
  return { transfer, writes };
}

function localItem(dataUrl = LOCAL_DATA_URL): StudioUnifiedAssetItem {
  return {
    id: "local:hero-sheet",
    category: "mine",
    scope: "mine",
    title: "내 주인공 시트",
    description: "표정과 의상 참고 이미지",
    categoryLabel: "내 에셋",
    keywords: ["캐릭터", "reference"],
    badges: ["내 에셋"],
    preview: { kind: "image", src: dataUrl },
    useMode: "insert",
    useLabel: "캔버스에 삽입",
    discoverability: "standard",
    sortPriority: 10,
    source: {
      kind: "local",
      value: {
        id: "hero-sheet",
        name: "내 주인공 시트",
        dataUrl,
        width: 600,
        height: 900,
        createdAt: 1,
      },
    },
  };
}

function elementItem(
  svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 4 61 37 96 37 68 57 79 92 50 71 21 92 32 57 4 37 39 37Z"/></svg>',
): StudioUnifiedAssetItem {
  return {
    id: "element:star",
    category: "element",
    scope: "studio",
    title: "별",
    description: "편집 가능한 벡터 요소",
    categoryLabel: "요소",
    keywords: ["별", "star"],
    badges: ["벡터"],
    preview: { kind: "svg", svg },
    useMode: "insert",
    useLabel: "캔버스에 삽입",
    discoverability: "standard",
    sortPriority: 20,
    source: {
      kind: "element",
      value: {
        id: "star",
        label: "별",
        category: "shape",
        keywords: ["별", "star"],
        width: 100,
        height: 100,
        svg,
      },
    },
  };
}

function objectItem(): StudioUnifiedAssetItem {
  const object = listStudioObjectInsertItems()[0];
  if (!object) throw new Error("3D 삽입 카탈로그가 비어 있습니다.");
  return {
    id: `3d:${object.id}`,
    category: "3d",
    scope: "studio",
    title: object.label,
    description: object.hint ?? `${object.familyLabel} 편집 도구`,
    categoryLabel: object.familyLabel,
    keywords: object.keywords,
    badges: ["3D", object.familyLabel],
    preview: { kind: "none" },
    useMode: "open",
    useLabel: "3D 도구 열기",
    discoverability: "standard",
    sortPriority: 30,
    source: { kind: "object-3d", value: object },
  };
}

describe("studio insert hub direct drag", () => {
  it("advertises only entries with an owned canvas-drop contract", () => {
    expect(canDragStudioInsertHubEntry(actionEntry("text"))).toBe(true);
    expect(canDragStudioInsertHubEntry(actionEntry("bubble"))).toBe(true);
    expect(canDragStudioInsertHubEntry(actionEntry("ai"))).toBe(false);
    expect(canDragStudioInsertHubEntry(actionEntry("upload"))).toBe(false);
    expect(canDragStudioInsertHubEntry(assetEntry(localItem()))).toBe(true);
    expect(canDragStudioInsertHubEntry(assetEntry(elementItem()))).toBe(true);
    expect(canDragStudioInsertHubEntry(assetEntry(objectItem()))).toBe(true);
  });

  it("writes text and speech bubbles through the existing insert MIME", () => {
    for (const [actionId, expected] of [
      ["text", { kind: "text" }],
      ["bubble", { kind: "bubble", variant: "speech" }],
    ] as const) {
      const { transfer, writes } = createTransfer();
      expect(
        writeStudioInsertHubDragPayload(transfer, {
          entry: actionEntry(actionId),
          canvasWidth: 800,
          canvasHeight: 1_200,
        }),
      ).toBe(true);
      expect(JSON.parse(writes.get(STUDIO_INSERT_DRAG_MIME) ?? "null")).toEqual(
        expected,
      );
      expect(transfer.effectAllowed).toBe("copy");
    }
  });

  it("reuses the shared strict parser for local images and vectors", () => {
    for (const item of [localItem(), elementItem()]) {
      const { transfer, writes } = createTransfer();
      expect(
        writeStudioInsertHubDragPayload(transfer, {
          entry: assetEntry(item),
          canvasWidth: 800,
          canvasHeight: 1_200,
        }),
      ).toBe(true);
      const payload = parseStudioAssetDragPayload(
        writes.get(STUDIO_ASSET_DRAG_MIME) ?? "",
      );
      expect(payload?.source).toBe("local");
      expect(transfer.effectAllowed).toBe("copy");
    }
  });

  it("fails closed for remote images, unsafe SVG, and invalid geometry", () => {
    expect(
      resolveStudioInsertHubDragDescriptor({
        entry: assetEntry(localItem("https://example.com/untrusted.png")),
        canvasWidth: 800,
        canvasHeight: 1_200,
      }),
    ).toBeNull();
    expect(
      canDragStudioInsertHubEntry(
        assetEntry(
          elementItem(
            '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
          ),
        ),
      ),
    ).toBe(false);
    expect(
      resolveStudioInsertHubDragDescriptor({
        entry: assetEntry(objectItem()),
        canvasWidth: Number.NaN,
        canvasHeight: 1_200,
      }),
    ).toBeNull();
  });

  it("writes catalog-bound 3D placement through the existing object MIME", () => {
    const item = objectItem();
    const { transfer, writes } = createTransfer();
    expect(
      writeStudioInsertHubDragPayload(transfer, {
        entry: assetEntry(item),
        canvasWidth: 800,
        canvasHeight: 1_200,
      }),
    ).toBe(true);
    const payload = parseStudioObjectInsertDragPayload(
      writes.get(STUDIO_OBJECT_INSERT_DRAG_MIME) ?? "",
    );
    if (item.source.kind !== "object-3d") {
      throw new Error("3D 테스트 항목의 source가 잘못되었습니다.");
    }
    expect(payload?.itemId).toBe(item.source.value.id);
    expect(transfer.effectAllowed).toBe("copy");
  });
});
