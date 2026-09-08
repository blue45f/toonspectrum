import {
  Bookmark,
  Clapperboard,
  Folder,
  Grid2x2,
  LayoutTemplate,
  Library,
  PenTool,
  Shapes,
  Sticker as StickerIcon,
} from "lucide-react";

import { StudioAssetLegacyPanel } from "./StudioAssetLegacyPanel";
import { StudioInsertHubWorkspace } from "./StudioInsertHubWorkspace";
import { CANVAS_W } from "./studio-assets";
import { BG_SCENES } from "./studio-bg-scenes";
import { BG_SCENES_EXTRA } from "./studio-bg-scenes-extra";
import { StudioMenuPopoverHeader, StudioMenuSubtabs } from "./studio-chrome-ui";
import { elBounds } from "./studio-element-geometry";
import { createCanvasImageElement } from "./studio-image-placement";
import {
  resolveStudioInsertPlacement,
  type StudioInsertActionId,
  type StudioInsertPlacementMode,
} from "./studio-insert-hub-model";
import { preloadStudioAssetMenuPanel } from "./studio-page-lazy-ui";
import { SCENE_TEMPLATES } from "./studio-scene-templates";
import {
  buildStudioUnifiedAssetCatalog,
  type StudioUnifiedAssetItem,
} from "./studio-unified-asset-catalog";
import { StudioUnifiedAssetSmartLibrary } from "./StudioUnifiedAssetSmartLibrary";
import { StudioUnifiedAssetWorkspace } from "./StudioUnifiedAssetWorkspace";

import type { StudioMenu } from "./studio-editor-tool-model";
import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

const INSERT_REVIEW_LOCKED_MESSAGE =
  "이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 항목을 삽입해 주세요.";

const ASSET_MENU_ITEMS = [
  {
    id: "asset",
    label: "삽입",
    icon: Library,
    title: "검색·최근·즐겨찾기·배치가 통합된 삽입 허브",
  },
  {
    id: "template",
    label: "템플릿",
    icon: LayoutTemplate,
    title: "캔버스·컷 레이아웃 템플릿",
  },
  {
    id: "collage",
    label: "콜라주",
    icon: Grid2x2,
    title: "이미지 콜라주 배치",
  },
  {
    id: "elements",
    label: "요소",
    icon: Shapes,
    title: "도형·장식 요소",
  },
  {
    id: "emeres",
    label: "이메레스",
    icon: PenTool,
    title: "스케치 밑그림 틀",
  },
  {
    id: "scene",
    label: "장면",
    icon: Clapperboard,
    title: "장면 템플릿",
  },
  {
    id: "clip",
    label: "클립",
    icon: Bookmark,
    title: "저장된 클립",
  },
  {
    id: "sticker",
    label: "효과",
    icon: StickerIcon,
    title: "만화 효과·스티커",
  },
] as const;

export interface StudioUnifiedAssetToolPopoverContentProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

interface InsertSelectionBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function assertInsertMutationAllowed(
  toolBelt: StudioToolBeltContentProps,
): void {
  if (toolBelt.activeSurfaceReviewLocked) {
    throw new Error(INSERT_REVIEW_LOCKED_MESSAGE);
  }
}

function resolveSelectionBounds(
  toolBelt: StudioToolBeltContentProps,
): InsertSelectionBounds | null {
  if (!toolBelt.selected) return null;
  const bounds = elBounds(toolBelt.selected);
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.w) ||
    !Number.isFinite(bounds.h) ||
    bounds.w <= 0 ||
    bounds.h <= 0
  ) {
    return null;
  }
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.w,
    height: bounds.h,
  };
}

function routeUnifiedAsset(
  item: StudioUnifiedAssetItem,
  toolBelt: StudioToolBeltContentProps,
  placementMode: StudioInsertPlacementMode,
  selectionBounds: InsertSelectionBounds | null,
): boolean | void | Promise<boolean | void> {
  const handlers = toolBelt.stableHandlers;
  switch (item.source.kind) {
    case "background":
      assertInsertMutationAllowed(toolBelt);
      return handlers.addBgScene(item.source.value);
    case "scene-template":
      // The existing controller owns preview, validation and the eventual commit.
      toolBelt.setMenu("scene");
      return true;
    case "element":
      assertInsertMutationAllowed(toolBelt);
      return handlers.addCatalogElement(item.source.value);
    case "object-3d":
      assertInsertMutationAllowed(toolBelt);
      toolBelt.setMenu(null);
      handlers.openStudioObjectInsert({
        openTarget: item.source.value.openTarget,
        sourceId: item.source.value.sourceId,
      });
      return true;
    case "local": {
      assertInsertMutationAllowed(toolBelt);
      const placement = resolveStudioInsertPlacement(placementMode, {
        canvasWidth: CANVAS_W,
        canvasHeight: toolBelt.canvasH,
        selectionBounds,
      });
      if (!placement) {
        return handlers.addRenderedImage(
          item.source.value.dataUrl,
          item.source.value.width,
          item.source.value.height,
        );
      }
      const placed = createCanvasImageElement({
        id: `insert-preview:${item.source.value.id}`,
        src: item.source.value.dataUrl,
        canvasWidth: CANVAS_W,
        canvasHeight: toolBelt.canvasH,
        sourceWidth: item.source.value.width,
        sourceHeight: item.source.value.height,
        placement,
      });
      return handlers.addRenderedImage(
        item.source.value.dataUrl,
        item.source.value.width,
        item.source.value.height,
        undefined,
        undefined,
        {
          x: placed.x,
          y: placed.y,
          width: placed.width,
          height: placed.height,
        },
      );
    }
    case "native-tool":
      toolBelt.setMenu(item.source.value.menu);
      return true;
    default:
      throw new Error(`지원하지 않는 통합 에셋 종류입니다: ${item.id}`);
  }
}

function routeInsertAction(
  actionId: StudioInsertActionId,
  toolBelt: StudioToolBeltContentProps,
): boolean {
  const handlers = toolBelt.stableHandlers;
  switch (actionId) {
    case "text":
      assertInsertMutationAllowed(toolBelt);
      handlers.addText(undefined, true);
      toolBelt.setMenu(null);
      return true;
    case "bubble":
      toolBelt.setMenu("bubble");
      return true;
    case "upload":
      // The insert workspace owns the hidden file input; cancellation is a no-op.
      return true;
    case "stock":
      toolBelt.setMenu("stockImage");
      return true;
    case "template":
      toolBelt.setMenu("template");
      return true;
    case "collage":
      toolBelt.setMenu("collage");
      return true;
    case "elements":
      toolBelt.setMenu("elements");
      return true;
    case "scene":
      toolBelt.setMenu("scene");
      return true;
    case "clip":
      toolBelt.setMenu("clip");
      return true;
    case "sticker":
      toolBelt.setMenu("sticker");
      return true;
    case "emeres":
      toolBelt.setMenu("emeres");
      return true;
    case "background3d":
      toolBelt.setMenu(null);
      toolBelt.setBg3dOpen(true);
      return true;
    case "ai":
      toolBelt.setMenu("aiAssist");
      return true;
    default: {
      const neverAction: never = actionId;
      throw new Error(`지원하지 않는 삽입 동작입니다: ${neverAction}`);
    }
  }
}

function openAiAssist(
  toolBelt: StudioToolBeltContentProps,
  prompt: string,
): void {
  if (prompt) {
    toolBelt.stableHandlers.applyAiAssistPresetPrompt("background", prompt);
  }
  toolBelt.setMenu("aiAssist");
}

export function StudioUnifiedAssetToolPopoverContent({
  toolBelt,
}: StudioUnifiedAssetToolPopoverContentProps) {
  const selectionBounds = resolveSelectionBounds(toolBelt);
  const items = buildStudioUnifiedAssetCatalog({
    // Cold entry must not require visiting legacy background or scene tabs first.
    // Stable ids are deduplicated by the unified catalog.
    backgrounds: [
      ...BG_SCENES,
      ...BG_SCENES_EXTRA,
      ...toolBelt.studioOptionalAssets.bgSceneSections.flatMap(
        (section) => section.scenes,
      ),
    ],
    sceneTemplates: [
      ...SCENE_TEMPLATES,
      ...toolBelt.sceneTemplates.templates,
    ],
    localAssets: toolBelt.assets,
  }).map((item) =>
    item.source.kind === "scene-template"
      ? {
          ...item,
          description: `${item.description} · 장면 도구에서 미리보기 후 배치합니다.`,
          useMode: "open" as const,
          useLabel: "장면 도구 열기",
        }
      : item,
  );
  const smartWorkspaceInitialView =
    toolBelt.assetTab === "community" ? "library" : "discover";

  return (
    <>
      <StudioMenuPopoverHeader
        icon={Folder}
        title="삽입 허브"
        description="텍스트·말풍선·이미지·레이아웃·효과·3D·내 에셋을 검색하고 최근 사용, 즐겨찾기와 배치 방식까지 한곳에서 관리합니다."
      />
      <StudioMenuSubtabs
        aria-label="삽입·에셋 메뉴 구역"
        activeId={toolBelt.menu}
        onSelect={(id: string) => {
          if (id === "asset") preloadStudioAssetMenuPanel();
          toolBelt.setMenu(id as StudioMenu);
        }}
        items={ASSET_MENU_ITEMS}
      />
      <StudioInsertHubWorkspace
        initialView={
          toolBelt.assetTab === "community" ? "library" : "insert"
        }
        items={items}
        legacyContent={
          <StudioUnifiedAssetSmartLibrary
            items={items}
            defaultCollapsed={false}
            onUseItem={(item) =>
              routeUnifiedAsset(item, toolBelt, "auto", selectionBounds)
            }
          >
            {({ items: visibleItems, onUseItem }) => (
              <StudioUnifiedAssetWorkspace
                initialView={smartWorkspaceInitialView}
                items={visibleItems}
                legacyContent={<StudioAssetLegacyPanel toolBelt={toolBelt} />}
                onUseItem={onUseItem}
                onOpenAi={(prompt) => openAiAssist(toolBelt, prompt)}
              />
            )}
          </StudioUnifiedAssetSmartLibrary>
        }
        selectionPlacementAvailable={selectionBounds !== null}
        onUseItem={(item, placementMode) =>
          routeUnifiedAsset(
            item,
            toolBelt,
            placementMode,
            selectionBounds,
          )
        }
        onUseAction={(actionId) => routeInsertAction(actionId, toolBelt)}
        onUploadImage={async (event) => {
          assertInsertMutationAllowed(toolBelt);
          await toolBelt.stableHandlers.onPickImage(event);
        }}
        onOpenAi={(prompt) => openAiAssist(toolBelt, prompt)}
      />
    </>
  );
}
