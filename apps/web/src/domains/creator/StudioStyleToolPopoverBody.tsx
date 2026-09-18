import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { Package, Palette } from "lucide-react";
import { Suspense, useEffect } from "react";

import { StudioMenuPopoverHeader, StudioMenuSubtabs } from "./studio-chrome-ui";
import {
  StudioBrandKitPanel,
  StudioPaletteLibraryPanel,
} from "./studio-page-lazy-ui";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";
import { StudioPaletteWorkbench } from "./StudioPaletteWorkbench";

import type { StudioMenu } from "./studio-editor-tool-model";
import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

export interface StudioStyleToolPopoverBodyProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

export function StudioStyleToolPopoverBody({
  toolBelt,
}: StudioStyleToolPopoverBodyProps) {
  const {
    menu,
    recentColors,
    selected,
    setColor,
    setMenu,
  } = toolBelt;
  const {
    applyBrandKitFont,
    applyBrandKitLogo,
    ensureRecentColorsLoaded,
    rememberColor,
  } = toolBelt.stableHandlers;

  useEffect(() => {
    ensureRecentColorsLoaded();
  }, [ensureRecentColorsLoaded]);

  const applyAndRememberColor = (hex: string): void => {
    setColor(hex);
    rememberColor(hex);
  };

  return (
    <>
      <StudioMenuPopoverHeader
        icon={Palette}
        title={translateCurrentStaticSourceText("domains.creator.StudioStyleToolPopoverBody", "ko", "색상 · 스타일")}
        description={translateCurrentStaticSourceText("domains.creator.StudioStyleToolPopoverBody", "ko", "현재 색, 최근 색, 색상환, 조화 배색과 웹툰 음영을 한곳에서 고릅니다.")}
      />
      <StudioMenuSubtabs
        aria-label={translateCurrentStaticSourceText("domains.creator.StudioStyleToolPopoverBody", "ko", "색상과 스타일 메뉴 구역")}
        activeId={menu === "palette" || menu === "brandKit" ? menu : translateCurrentStaticSourceText("domains.creator.StudioStyleToolPopoverBody", "en", "palette")}
        onSelect={(id) => setMenu(id as StudioMenu)}
        items={[
          {
            id: "palette",
            label: "색상 · 팔레트",
            icon: Palette,
            title: "빠른 색 선택·색상환·조화 배색·웹툰 음영·팔레트 관리",
          },
          {
            id: "brandKit",
            label: "브랜드 킷",
            icon: Package,
            title: "팔레트·글꼴·로고를 묶은 브랜드 킷 저장·적용",
          },
        ]}
      />
      {menu === "palette" ? (
        <StudioPaletteWorkbench
          value={toolBelt.color}
          recentColors={recentColors}
          onPreviewColor={setColor}
          onCommitColor={rememberColor}
          libraryContent={(
            <Suspense fallback={<StudioPanelLoading label={translateCurrentStaticSourceText("domains.creator.StudioStyleToolPopoverBody", "ko", "팔레트 라이브러리를 여는 중...")} />}>
              <StudioPaletteLibraryPanel
                onPickColor={applyAndRememberColor}
                seedColors={recentColors}
              />
            </Suspense>
          )}
        />
      ) : null}
      {menu === "brandKit" ? (
        <Suspense fallback={<StudioPanelLoading label={translateCurrentStaticSourceText("domains.creator.StudioStyleToolPopoverBody", "ko", "브랜드 킷 패널을 여는 중...")} />}>
          <StudioBrandKitPanel
            onPickColor={applyAndRememberColor}
            canApplyFont={!!selected && (selected.type === "text" || selected.type === "bubble")}
            onApplyFont={applyBrandKitFont}
            onApplyLogo={applyBrandKitLogo}
          />
        </Suspense>
      ) : null}
    </>
  );
}
