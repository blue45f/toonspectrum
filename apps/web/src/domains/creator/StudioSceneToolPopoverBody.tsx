import {
  Boxes,
  Droplets,
  Grid2x2,
  Image as ImageIcon,
  Mountain,
  PersonStanding,
  Search,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { Suspense } from "react";

import { CANVAS_W } from "./studio-assets";
import { StudioMenuPopoverHeader, StudioMenuSubtabs } from "./studio-chrome-ui";
import {
  Studio2dSceneBrowser,
  StudioBackgroundPanel,
  StudioCanvasResizer,
  StudioTonePanel,
} from "./studio-page-lazy-ui";
import { STUDIO_FOCUS_RING } from "./studio-panel-ui";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";

import type { StudioMenu } from "./studio-editor-tool-model";
import type { StudioToolBeltContentProps } from "./StudioToolBeltContent";

import { cn } from "@/shared/lib/utils";

export interface StudioSceneToolPopoverBodyProps {
  readonly toolBelt: StudioToolBeltContentProps;
}

const FLOW_CARD = cn(
  "min-h-24 rounded-xl border border-line bg-card p-3 text-left transition-colors",
  "hover:border-accent/45 hover:bg-accent-soft/20",
  STUDIO_FOCUS_RING,
);

export function StudioSceneToolPopoverBody({
  toolBelt,
}: StudioSceneToolPopoverBodyProps) {
  const {
    bg,
    bgGrad,
    bgSceneGenreFilter,
    bgSceneSearchQuery,
    canvasH,
    magicResizeStrategy,
    masterEditMode,
    menu,
    setBg3dInitialDataUrl,
    setBg3dInitialElementId,
    setBg3dInitialScene,
    setBg3dOpen,
    setBgSceneGenreFilter,
    setBgSceneSearchQuery,
    setCharacterShaperOpen,
    setMagicResizeStrategy,
    setMannequinPoserOpen,
    setMenu,
    setPoserVrmOpen,
    setToneSearchQuery,
    studioBgSceneAssetsError,
    studioBgSceneAssetsLoaded,
    studioBgSceneAssetsLoading,
    studioOptionalAssets,
    toneSearchQuery,
  } = toolBelt;
  const {
    addBgScene,
    addTone,
    announceDrawingShortcut,
    applyMagicResizePreset,
    applyStudioBackgroundFill,
    setCanvasH,
  } = toolBelt.stableHandlers;

  const closeAnd = (open: () => void) => {
    setMenu(null);
    open();
  };
  const openSharedStage = () => {
    setBg3dInitialScene(undefined);
    setBg3dInitialDataUrl(undefined);
    setBg3dInitialElementId(undefined);
    setBg3dOpen(true);
    setMenu(null);
  };

  return (
    <>
      <StudioMenuPopoverHeader
        icon={Boxes}
        title="3D 스튜디오"
        description="캐릭터 제작부터 포즈·손·소품, 배경 합성, 카메라·캔버스 출력까지 한 흐름으로 진행하세요."
      />

      <section aria-label="3D 제작 순서" className="mb-3 rounded-2xl border border-accent/20 bg-accent-soft/10 p-2.5">
        <div className="mb-2 flex items-start justify-between gap-2 px-0.5">
          <div>
            <p className="text-[0.7rem] font-bold text-fg">3D 작업은 여기서 시작하세요</p>
            <p className="mt-0.5 text-[0.62rem] leading-relaxed text-fg-3">
              기존 3D 캐릭터·셰이퍼·데생 인형·3D 배경은 서로 다른 제품이 아니라 아래 제작 단계의 전문 편집기입니다.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-accent px-2 py-1 text-[0.56rem] font-bold text-white">1 → 4</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={FLOW_CARD} onClick={() => closeAnd(() => setCharacterShaperOpen(true))}>
            <Sparkles size={17} aria-hidden className="text-accent" />
            <span className="mt-2 block text-[0.68rem] font-bold text-fg">1. 캐릭터 만들기</span>
            <span className="mt-1 block text-[0.59rem] leading-relaxed text-fg-3">얼굴·눈·헤어·체형·의상·색을 만들고 수정합니다.</span>
          </button>
          <button type="button" className={FLOW_CARD} onClick={() => closeAnd(() => setPoserVrmOpen(true))}>
            <UsersRound size={17} aria-hidden className="text-accent" />
            <span className="mt-2 block text-[0.68rem] font-bold text-fg">2. 포즈·손·소품</span>
            <span className="mt-1 block text-[0.59rem] leading-relaxed text-fg-3">전신 포즈와 손 모양, 표정, 소품 잡기를 한 캐릭터에서 조정합니다.</span>
          </button>
          <button type="button" className={FLOW_CARD} onClick={openSharedStage}>
            <Mountain size={17} aria-hidden className="text-accent" />
            <span className="mt-2 block text-[0.68rem] font-bold text-fg">3. 배경·장면 합성</span>
            <span className="mt-1 block text-[0.59rem] leading-relaxed text-fg-3">3D 배경과 캐릭터를 같은 카메라·조명·바닥 좌표에서 배치합니다.</span>
          </button>
          <button type="button" className={FLOW_CARD} onClick={openSharedStage}>
            <Boxes size={17} aria-hidden className="text-accent" />
            <span className="mt-2 block text-[0.68rem] font-bold text-fg">4. 카메라·컷 출력</span>
            <span className="mt-1 block text-[0.59rem] leading-relaxed text-fg-3">구도·조명·투명 배경을 확인하고 고해상도로 현재 컷에 넣습니다.</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => closeAnd(() => setMannequinPoserOpen(true))}
          className={cn(
            "mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed border-line px-3 text-left text-[0.63rem] text-fg-2 hover:bg-raised",
            STUDIO_FOCUS_RING,
          )}
        >
          <PersonStanding size={15} aria-hidden />
          <span><strong>빠른 인체 참고</strong> · 캐릭터 제작 없이 데생 인형으로 포즈만 잡기</span>
        </button>
      </section>

      <div className="mb-2 border-t border-line pt-2">
        <p className="mb-1.5 px-0.5 text-[0.62rem] font-semibold text-fg-3">2D 배경 도구</p>
        <StudioMenuSubtabs
          aria-label="배경 메뉴 구역"
          activeId={menu === "bgScene" || menu === "tone" || menu === "bgFill" ? menu : "bgFill"}
          onSelect={(id) => setMenu(id as StudioMenu)}
          items={[
            { id: "bgFill", label: "편집", icon: Droplets, title: "채우기·크기·비율 리사이저" },
            { id: "bgScene", label: "2D 씬", icon: ImageIcon, title: "2D 배경 씬" },
            { id: "tone", label: "톤", icon: Grid2x2, title: "만화 스크린톤" },
          ]}
        />
      </div>

      {menu === "bgFill" && (
        <Suspense fallback={<StudioPanelLoading label="배경 편집기를 여는 중..." />}>
          <StudioBackgroundPanel
            canvasW={CANVAS_W}
            canvasH={canvasH}
            currentBg={bg}
            currentBgGrad={bgGrad}
            onApply={(payload) => {
              void applyStudioBackgroundFill(payload);
            }}
            sizeSlot={
              <StudioCanvasResizer
                canvasW={CANVAS_W}
                canvasH={canvasH}
                strategy={magicResizeStrategy}
                onStrategyChange={setMagicResizeStrategy}
                disabled={masterEditMode}
                onSetHeight={(height) => {
                  if (masterEditMode) return;
                  setCanvasH(height);
                  announceDrawingShortcut(`캔버스 높이 ${height}px`);
                }}
                onMagicResizePreset={(preset) => {
                  applyMagicResizePreset(preset);
                  announceDrawingShortcut(`${preset.label} 규격 적용`);
                }}
              />
            }
          />
        </Suspense>
      )}
      {menu === "bgScene" && (
        <Suspense fallback={<StudioPanelLoading label="2D 장면 라이브러리를 여는 중..." />}>
          <Studio2dSceneBrowser
            groups={studioOptionalAssets.bgSceneGenreGroups}
            query={bgSceneSearchQuery}
            onQueryChange={setBgSceneSearchQuery}
            genre={bgSceneGenreFilter}
            onGenreChange={setBgSceneGenreFilter}
            loading={studioBgSceneAssetsLoading && !studioBgSceneAssetsLoaded}
            error={studioBgSceneAssetsError}
            disabled={masterEditMode || Boolean(toolBelt.builtinRasterBusyId)}
            onPick={addBgScene}
          />
        </Suspense>
      )}
      {menu === "tone" && (
        <>
          <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">만화 스크린톤</p>
          <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
            톤을 누르면 캔버스에 깔려요. 패널을 먼저 선택하면 그 칸을 덮고, 망점 크기는 칸에 맞춰 일정하게 유지됩니다.
          </p>
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" />
            <input
              type="text"
              placeholder="톤 검색 (망점·선·교차선...)"
              value={toneSearchQuery}
              onChange={(event) => setToneSearchQuery(event.target.value)}
              className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder:text-fg-3 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/40"
            />
            {toneSearchQuery && (
              <button
                type="button"
                onClick={() => setToneSearchQuery("")}
                aria-label="검색어 지우기"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-fg-3 transition-colors hover:text-fg-2"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto pr-1">
            <Suspense fallback={<StudioPanelLoading label="톤 패널을 여는 중..." />}>
              <StudioTonePanel onPick={(svg) => void addTone(svg)} query={toneSearchQuery} />
            </Suspense>
          </div>
        </>
      )}
    </>
  );
}
