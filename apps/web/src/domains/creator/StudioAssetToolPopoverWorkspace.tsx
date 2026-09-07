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
import { BG_SCENES } from "./studio-bg-scenes";
import { BG_SCENES_EXTRA } from "./studio-bg-scenes-extra";
import { StudioAssetToolPopoverBody } from "./StudioAssetToolPopoverBody";
import { StudioMenuPopoverHeader, StudioMenuSubtabs } from "./studio-chrome-ui";
import { preloadStudioAssetMenuPanel } from "./studio-page-lazy-ui";
import { SCENE_TEMPLATES } from "./studio-scene-templates";
import {
  buildStudioUnifiedAssetCatalog,
  type StudioUnifiedAssetItem,
} from "./studio-unified-asset-catalog";
import { StudioUnifiedAssetWorkspace } from "./StudioUnifiedAssetWorkspace";

import type { StudioMenu } from "./studio-editor-tool-model";
import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

const ASSET_MENU_ITEMS = [
  { id: "template", label: "템플릿", icon: LayoutTemplate, title: "캔버스·컷 레이아웃 템플릿" },
  { id: "collage", label: "콜라주", icon: Grid2x2, title: "이미지 콜라주 배치" },
  { id: "elements", label: "요소", icon: Shapes, title: "도형·장식 요소" },
  { id: "emeres", label: "이메레스", icon: PenTool, title: "스케치 밑그림 틀" },
  { id: "scene", label: "장면", icon: Clapperboard, title: "장면 템플릿" },
  { id: "clip", label: "클립", icon: Bookmark, title: "저장된 클립" },
  { id: "sticker", label: "효과", icon: StickerIcon, title: "만화 효과·스티커" },
  { id: "asset", label: "에셋", icon: Library, title: "통합 탐색·보관함·마켓" },
] as const;

export interface StudioAssetToolPopoverWorkspaceProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

function useUnifiedAsset(
  item: StudioUnifiedAssetItem,
  toolBelt: StudioToolBeltContentProps,
): boolean | void | Promise<boolean | void> {
  const handlers = toolBelt.stableHandlers;
  switch (item.source.kind) {
    case "background":
      handlers.addBgScene(item.source.value);
      return true;
    case "scene-template":
      // The legacy controller resolves void even when it rejects a placement internally.
      // Route to its preview/placement surface instead of announcing an insertion here.
      toolBelt.setMenu("scene");
      return true;
    case "element":
      handlers.addCatalogElement(item.source.value);
      return true;
    case "object-3d":
      toolBelt.setMenu(null);
      handlers.openStudioObjectInsert({
        openTarget: item.source.value.openTarget,
        sourceId: item.source.value.sourceId,
      });
      return true;
    case "local":
      return handlers.addRenderedImage(
        item.source.value.dataUrl,
        item.source.value.width,
        item.source.value.height,
      );
    case "native-tool":
      toolBelt.setMenu(item.source.value.menu);
      return true;
    default:
      throw new Error(`지원하지 않는 통합 에셋 종류입니다: ${item.id}`);
  }
}

export function StudioAssetToolPopoverWorkspace({
  toolBelt,
}: StudioAssetToolPopoverWorkspaceProps) {
  if (toolBelt.menu !== "asset") {
    return <StudioAssetToolPopoverBody toolBelt={toolBelt} />;
  }

  const items = buildStudioUnifiedAssetCatalog({
    // Cold asset-menu entry must not depend on users visiting the legacy background/scene tabs.
    // Stable ids are deduplicated by the unified catalog when the host has already loaded them.
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
  }).map((item) => item.source.kind === "scene-template"
    ? {
        ...item,
        description: `${item.description} · 장면 도구에서 미리보기 후 배치합니다.`,
        useMode: "open" as const,
        useLabel: "장면 도구 열기",
      }
    : item);

  return (
    <>
      <StudioMenuPopoverHeader
        icon={Folder}
        title="템플릿 · 에셋"
        description="2D·장면·요소·3D·내 에셋을 통합 검색하고, 기존 보관함과 마켓도 함께 관리합니다."
      />
      <StudioMenuSubtabs
        aria-label="에셋 메뉴 구역"
        activeId={toolBelt.menu}
        onSelect={(id: string) => {
          if (id === "asset") preloadStudioAssetMenuPanel();
          toolBelt.setMenu(id as StudioMenu);
        }}
        items={ASSET_MENU_ITEMS}
      />
      {toolBelt.assetTab === "community" ? (
        <StudioAssetLegacyPanel toolBelt={toolBelt} />
      ) : (
        <StudioUnifiedAssetWorkspace
          items={items}
          legacyContent={<StudioAssetLegacyPanel toolBelt={toolBelt} />}
          onUseItem={(item) => useUnifiedAsset(item, toolBelt)}
          onOpenAi={(prompt) => {
            if (prompt) {
              toolBelt.stableHandlers.applyAiAssistPresetPrompt("background", prompt);
            }
            toolBelt.setMenu("aiAssist");
          }}
        />
      )}
    </>
  );
}
