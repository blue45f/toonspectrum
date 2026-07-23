import { Loader2 } from "lucide-react";
import { Suspense, memo } from "react";

import { isStudioAiConfigured } from "./studio-ai-client";
import {
  StudioBackground3D,
  StudioPageReviewPanel,
  StudioQuickActionsMenu,
  StudioScenarioAutoLayoutPanel,
  StudioMannequinPoserPanel,
  StudioScrollPreviewPanel,
  StudioStoryboardGridPanel,
  StudioTimelapsePanel,
  StudioVrmPoser,
} from "./studio-page-lazy-ui";
import { pageDisplayName } from "./studio-page-meta";

import type {
  StudioLazyPanelStackHandlers,
  StudioLazyPanelStackProps,
} from "./StudioLazyPanelStack";

type StudioThreeDPreviewPanelStackHandlers = Pick<
  StudioLazyPanelStackHandlers,
  | "addPage"
  | "captureTimelapseStep"
  | "commitShotTag"
  | "deletePage"
  | "duplicatePage"
  | "executeQuickAction"
  | "handleTimelapseRecordingEnd"
  | "handleTimelapseRecordingStart"
  | "insertBg3dResult"
  | "insertVrmResult"
  | "insertMannequinResult"
  | "patchPageReview"
  | "setCurrentPageId"
>;

export type StudioThreeDPreviewPanelStackProps = Pick<
  StudioLazyPanelStackProps,
  | "activePage"
  | "bg3dInitialDataUrl"
  | "bg3dInitialScene"
  | "bg3dBatchRecoveryScope"
  | "validateRecoveryAccess"
  | "bg3dOpen"
  | "composeWorkAssetPreviewPage"
  | "currentPageId"
  | "elementById"
  | "isMobile"
  | "masterEditMode"
  | "pageDnd"
  | "pageReviewOpen"
  | "pages"
  | "pagesHi"
  | "pagesHistory"
  | "mannequinPoserOpen"
  | "poserInitialDataUrl"
  | "poserInitialElementId"
  | "poserVrmOpen"
  | "quickActionsAnchor"
  | "quickActionsDisabledActions"
  | "quickActionsOpen"
  | "quickActionsPreferences"
  | "setBg3dInitialDataUrl"
  | "setBg3dInitialElementId"
  | "setBg3dInitialScene"
  | "setBg3dOpen"
  | "setMannequinPoserOpen"
  | "setPageReviewOpen"
  | "setPoserInitialDataUrl"
  | "setPoserInitialElementId"
  | "setPoserVrmOpen"
  | "setQuickActionsOpen"
  | "setQuickActionsPreferences"
  | "setStoryboardGridOpen"
  | "setTimelapseOpen"
  | "storyboardGridOpen"
  | "timelapseOpen"
  | "title"
> & {
  stableHandlers: StudioThreeDPreviewPanelStackHandlers;
};

type StudioScrollScenarioPreviewPanelStackHandlers = Pick<
  StudioLazyPanelStackHandlers,
  | "onApplyScenarioPreview"
  | "onCancelScenario"
  | "onChangeScenarioScene"
  | "onDiscardScenarioPreview"
  | "onGenerateScenario"
  | "onGenerateScenarioImages"
  | "onRegenerateScenarioImage"
  | "onRemoveScenarioScene"
  | "onScenarioApplyTargetChange"
  | "setCurrentPageId"
>;

export type StudioScrollScenarioPreviewPanelStackProps = Pick<
  StudioLazyPanelStackProps,
  | "aiSettings"
  | "composeWorkAssetPreviewPage"
  | "currentPageId"
  | "pages"
  | "scenarioApplyTarget"
  | "scenarioBusy"
  | "scenarioError"
  | "scenarioOpen"
  | "scenarioProgress"
  | "scenarioRegeneratingIndex"
  | "scenarioResult"
  | "scenarioSceneCountHint"
  | "scenarioStageLabel"
  | "scenarioStoryText"
  | "scrollPreviewOpen"
  | "setScenarioOpen"
  | "setScenarioSceneCountHint"
  | "setScenarioStoryText"
  | "setScrollPreviewOpen"
  | "textAiConfigured"
> & {
  stableHandlers: StudioScrollScenarioPreviewPanelStackHandlers;
};

function PoserLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>포저를 여는 중</span>
      </div>
    </div>
  );
}

function MannequinLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>3D 데생 인형을 여는 중</span>
      </div>
    </div>
  );
}

function Bg3DLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>3D 배경 도구를 여는 중</span>
      </div>
    </div>
  );
}

function TimelapseLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>타임랩스 도구를 여는 중</span>
      </div>
    </div>
  );
}

function StoryboardGridLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>스토리보드 그리드를 여는 중</span>
      </div>
    </div>
  );
}

function ScrollPreviewLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>스크롤 미리보기를 여는 중</span>
      </div>
    </div>
  );
}

function ScenarioAutoLayoutLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>시나리오 자동 생성 도구를 여는 중</span>
      </div>
    </div>
  );
}

export const StudioThreeDPreviewPanelStack = memo(function StudioThreeDPreviewPanelStack({
  activePage,
  bg3dInitialDataUrl,
  bg3dInitialScene,
  bg3dBatchRecoveryScope,
  validateRecoveryAccess,
  bg3dOpen,
  composeWorkAssetPreviewPage,
  currentPageId,
  elementById,
  isMobile,
  masterEditMode,
  pageDnd,
  pageReviewOpen,
  pages,
  pagesHi,
  pagesHistory,
  mannequinPoserOpen,
  poserInitialDataUrl,
  poserInitialElementId,
  poserVrmOpen,
  quickActionsAnchor,
  quickActionsDisabledActions,
  quickActionsOpen,
  quickActionsPreferences,
  setBg3dInitialDataUrl,
  setBg3dInitialElementId,
  setBg3dInitialScene,
  setBg3dOpen,
  setMannequinPoserOpen,
  setPageReviewOpen,
  setPoserInitialDataUrl,
  setPoserInitialElementId,
  setPoserVrmOpen,
  setQuickActionsOpen,
  setQuickActionsPreferences,
  setStoryboardGridOpen,
  setTimelapseOpen,
  storyboardGridOpen,
  timelapseOpen,
  title,
  stableHandlers,
}: StudioThreeDPreviewPanelStackProps) {
  const {
    addPage,
    captureTimelapseStep,
    commitShotTag,
    deletePage,
    duplicatePage,
    executeQuickAction,
    handleTimelapseRecordingEnd,
    handleTimelapseRecordingStart,
    insertBg3dResult,
    insertVrmResult,
    insertMannequinResult,
    patchPageReview,
    setCurrentPageId,
  } = stableHandlers;
  const poserInitialElement = poserInitialElementId
    ? elementById.get(poserInitialElementId) ?? null
    : null;
  const poserInitialScene = poserInitialElement?.type === "image"
    ? poserInitialElement.vrmScene
    : undefined;

  return (
    <>
      <Suspense fallback={null}>
        {isMobile ? (
          <StudioQuickActionsMenu
            open={quickActionsOpen}
            anchor={quickActionsAnchor}
            preferences={quickActionsPreferences}
            disabledActions={[...quickActionsDisabledActions]}
            onExecute={executeQuickAction}
            onPreferencesChange={setQuickActionsPreferences}
            onClose={() => setQuickActionsOpen(false)}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<PoserLoadingOverlay />}>
        {poserVrmOpen ? (
          <StudioVrmPoser
            open
            initialDataUrl={poserInitialDataUrl}
            initialScene={poserInitialScene}
            onClose={() => {
              setPoserVrmOpen(false);
              setPoserInitialDataUrl(undefined);
              setPoserInitialElementId(undefined);
            }}
            onInsert={insertVrmResult}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<MannequinLoadingOverlay />}>
        {mannequinPoserOpen ? (
          <StudioMannequinPoserPanel
            open
            onClose={() => setMannequinPoserOpen(false)}
            onInsert={insertMannequinResult}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<Bg3DLoadingOverlay />}>
        {bg3dOpen ? (
          <StudioBackground3D
            open
            initialDataUrl={bg3dInitialDataUrl}
            initialScene={bg3dInitialScene}
            recoveryScope={bg3dBatchRecoveryScope}
            validateRecoveryAccess={validateRecoveryAccess}
            onClose={() => {
              setBg3dOpen(false);
              setBg3dInitialDataUrl(undefined);
              setBg3dInitialScene(undefined);
              setBg3dInitialElementId(undefined);
            }}
            onInsert={insertBg3dResult}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<TimelapseLoadingOverlay />}>
        {timelapseOpen ? (
          <StudioTimelapsePanel
            open
            onClose={() => setTimelapseOpen(false)}
            pageId={activePage.id}
            history={pagesHistory.slice(0, pagesHi + 1)}
            title={title}
            masterEditMode={masterEditMode}
            captureStep={captureTimelapseStep}
            onRecordingStart={handleTimelapseRecordingStart}
            onRecordingEnd={handleTimelapseRecordingEnd}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<StoryboardGridLoadingOverlay />}>
        {storyboardGridOpen ? (
          <StudioStoryboardGridPanel
            open
            onClose={() => setStoryboardGridOpen(false)}
            pages={pages.map(composeWorkAssetPreviewPage)}
            currentPageId={currentPageId}
            dnd={pageDnd}
            onSelectPage={(id) => {
              setCurrentPageId(id);
              setStoryboardGridOpen(false);
            }}
            onAddPage={addPage}
            onDuplicatePage={duplicatePage}
            onDeletePage={deletePage}
            canDelete={pages.length > 1}
            onShotTagChange={(pageId, patch) => commitShotTag(pageId, patch)}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {pageReviewOpen ? (
          <StudioPageReviewPanel
            open
            onClose={() => setPageReviewOpen(false)}
            pages={pages.map((page, index) => ({
              id: page.id,
              label: pageDisplayName(page, index),
              review: page.review,
            }))}
            currentPageId={currentPageId}
            onSelectPage={setCurrentPageId}
            onPatchReview={patchPageReview}
          />
        ) : null}
      </Suspense>
    </>
  );
});

export const StudioScrollScenarioPreviewPanelStack = memo(function StudioScrollScenarioPreviewPanelStack({
  aiSettings,
  composeWorkAssetPreviewPage,
  currentPageId,
  pages,
  scenarioApplyTarget,
  scenarioBusy,
  scenarioError,
  scenarioOpen,
  scenarioProgress,
  scenarioRegeneratingIndex,
  scenarioResult,
  scenarioSceneCountHint,
  scenarioStageLabel,
  scenarioStoryText,
  scrollPreviewOpen,
  setScenarioOpen,
  setScenarioSceneCountHint,
  setScenarioStoryText,
  setScrollPreviewOpen,
  textAiConfigured,
  stableHandlers,
}: StudioScrollScenarioPreviewPanelStackProps) {
  const {
    onApplyScenarioPreview,
    onCancelScenario,
    onChangeScenarioScene,
    onDiscardScenarioPreview,
    onGenerateScenario,
    onGenerateScenarioImages,
    onRegenerateScenarioImage,
    onRemoveScenarioScene,
    onScenarioApplyTargetChange,
    setCurrentPageId,
  } = stableHandlers;

  return (
    <>
      <Suspense fallback={<ScrollPreviewLoadingOverlay />}>
        {scrollPreviewOpen ? (
          <StudioScrollPreviewPanel
            open
            onClose={() => setScrollPreviewOpen(false)}
            pages={pages.map(composeWorkAssetPreviewPage)}
            currentPageId={currentPageId}
            onSelectPage={(id) => {
              setCurrentPageId(id);
              setScrollPreviewOpen(false);
            }}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<ScenarioAutoLayoutLoadingOverlay />}>
        {scenarioOpen ? (
          <StudioScenarioAutoLayoutPanel
            open
            onClose={() => setScenarioOpen(false)}
            textConfigured={textAiConfigured}
            imageConfigured={isStudioAiConfigured(aiSettings)}
            storyText={scenarioStoryText}
            onStoryTextChange={setScenarioStoryText}
            sceneCountHint={scenarioSceneCountHint}
            onSceneCountHintChange={setScenarioSceneCountHint}
            applyTarget={scenarioApplyTarget}
            onApplyTargetChange={onScenarioApplyTargetChange}
            busy={scenarioBusy}
            stageLabel={scenarioStageLabel}
            progress={scenarioProgress}
            error={scenarioError}
            preview={scenarioResult?.items ?? null}
            textProvenance={scenarioResult?.textAiProvenance ?? null}
            onGenerate={onGenerateScenario}
            onGenerateImages={onGenerateScenarioImages}
            onChangeScene={onChangeScenarioScene}
            onRemoveScene={onRemoveScenarioScene}
            onRegenerateScene={onRegenerateScenarioImage}
            regeneratingIndex={scenarioRegeneratingIndex}
            onCancel={onCancelScenario}
            onApply={onApplyScenarioPreview}
            onDiscard={onDiscardScenarioPreview}
          />
        ) : null}
      </Suspense>
    </>
  );
});
