import { Folder } from "lucide-react";

import { StudioAssetLegacyPanel } from "./StudioAssetLegacyPanel";
import { StudioUnifiedAssetWorkspace } from "./StudioUnifiedAssetWorkspace";
import { CANVAS_W } from "./studio-assets";
import { BG_SCENES } from "./studio-bg-scenes";
import { BG_SCENES_EXTRA } from "./studio-bg-scenes-extra";
import { StudioMenuPopoverHeader } from "./studio-chrome-ui";
import { elBounds } from "./studio-element-geometry";
import { listStudioElementLibrary } from "./studio-elements-catalog";
import {
  decorateStudioGenerated2dAsset,
  STUDIO_GENERATED_BG_SCENES,
  STUDIO_GENERATED_ELEMENT_ITEMS,
} from "./studio-generated-2d-catalog";
import { createCanvasImageElement } from "./studio-image-placement";
import {
  resolveStudioInsertPlacement,
  type StudioInsertActionId,
  type StudioInsertPlacementMode,
} from "./studio-insert-hub-model";
import { SCENE_TEMPLATES } from "./studio-scene-templates";
import {
  buildStudioUnifiedAssetCatalog,
  type StudioUnifiedAssetItem,
} from "./studio-unified-asset-catalog";

import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

const INSERT_REVIEW_LOCKED_MESSAGE =
  "이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 항목을 삽입해 주세요.";

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
    !Number.isFinite(bounds.x)
    || !Number.isFinite(bounds.y)
    || !Number.isFinite(bounds.w)
    || !Number.isFinite(bounds.h)
    || bounds.w <= 0
    || bounds.h <= 0
  ) return null;
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
      assertInsertMutationAllowed(toolBelt);
      return handlers.addSceneTemplate(item.source.value).then(() => true);
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

export function StudioUnifiedAssetToolPopoverContent({
  toolBelt,
}: StudioUnifiedAssetToolPopoverContentProps) {
  const selectionBounds = resolveSelectionBounds(toolBelt);
  const items = buildStudioUnifiedAssetCatalog({
    backgrounds: [
      ...STUDIO_GENERATED_BG_SCENES,
      ...BG_SCENES,
      ...BG_SCENES_EXTRA,
      ...toolBelt.studioOptionalAssets.bgSceneSections.flatMap(
        (section) => section.scenes,
      ),
    ],
    elements: [
      ...STUDIO_GENERATED_ELEMENT_ITEMS,
      ...listStudioElementLibrary(),
    ],
    sceneTemplates: [
      ...SCENE_TEMPLATES,
      ...toolBelt.sceneTemplates.templates,
    ],
    localAssets: toolBelt.assets,
  }).map(decorateStudioGenerated2dAsset);
  const initialView = toolBelt.assetTab === "community" ? "library" : "discover";

  return (
    <>
      <StudioMenuPopoverHeader
        icon={Folder}
        title="에셋 워크스페이스"
        description="2D 배경·장면 레시피·스토리 연출·3D·내 에셋을 실제 미리보기로 비교하고 바로 캔버스에 배치합니다."
      />
      <StudioUnifiedAssetWorkspace
        initialView={initialView}
        items={items}
        legacyContent={<StudioAssetLegacyPanel toolBelt={toolBelt} />}
        selectionPlacementAvailable={selectionBounds !== null}
        reviewLocked={toolBelt.activeSurfaceReviewLocked}
        onUseItem={(item, placementMode = "auto") =>
          routeUnifiedAsset(item, toolBelt, placementMode, selectionBounds)}
        onUseAction={(actionId) => routeInsertAction(actionId, toolBelt)}
        onUploadImage={async (event) => {
          assertInsertMutationAllowed(toolBelt);
          await toolBelt.stableHandlers.onPickImage(event);
        }}
        onOpenAi={(prompt) => {
          if (prompt) {
            toolBelt.stableHandlers.applyAiAssistPresetPrompt("background", prompt);
          }
          toolBelt.setMenu("aiAssist");
        }}
      />
    </>
  );
}
