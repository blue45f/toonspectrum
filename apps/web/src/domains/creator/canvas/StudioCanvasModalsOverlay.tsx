import { BookOpen, Keyboard } from "lucide-react";
import { memo } from "react";
import { useStudioOnDemandModule } from "../useStudioOnDemandModule";
import { StudioOnDemandModuleStatus } from "../StudioOnDemandModuleStatus";
import type { StudioCanvasModalsOverlayProps } from "./StudioCanvasModalsBody";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export type { StudioCanvasModalsOverlayProps } from "./StudioCanvasModalsBody";
const loadModals = () => import("./StudioCanvasModalsBody");

/** Keep the launch controls immediate; modal wiring is requested only after an opening action. */
export const StudioCanvasModalsOverlay = memo(function StudioCanvasModalsOverlay(props: StudioCanvasModalsOverlayProps) {
  const { tool, canvasOnlyMode, tutorialHubOpen, setShortcutsOpen, openFeatureTutorial } = props;
  const requested = Boolean(props.tutorialHubOpen || props.shortcutsOpen || props.appSettingsOpen
    || props.historyPanelOpen || (props.frameAnimOpen && props.frameAnimEl) || props.timelineOpen
    || props.dialogueBatchOpen || props.dialogueTranslateOpen || props.masterPanelOpen || props.aiNoticeOpen
    || (props.pageSequenceOpen && !props.canvasOnlyMode && !props.mobileImmersive) || props.editingFallbackToModal);
  const state = useStudioOnDemandModule(loadModals, requested);
  const t = useT();
  const shortcutsHelpKey = "studio.shortcuts.row.view.help";
  const translatedShortcutsHelp = t(shortcutsHelpKey)?.trim();
  const shortcutsHelpLabel = translatedShortcutsHelp && translatedShortcutsHelp !== shortcutsHelpKey
    ? translatedShortcutsHelp : "키보드 단축키 도움말";
  const cancel = () => {
    props.setTutorialHubOpen(false); props.setShortcutsOpen(false); props.setAppSettingsOpen(false);
    props.setHistoryPanelOpen(false); props.setFrameAnimOpen(false); props.setTimelineOpen(false);
    props.setDialogueBatchOpen(false); props.setDialogueTranslateOpen(false); props.setMasterPanelOpen(false);
    props.setPageSequenceOpen(false);
    if (props.aiNoticeOpen) props.cancelAiNotice();
    if (props.editingFallbackToModal) props.cancelEditText();
  };
  return <>
      <button
        type="button"
        onClick={() => setShortcutsOpen(true)}
        className={cn(
          "absolute bottom-3 right-16 z-30 hidden size-11 place-items-center rounded-lg border border-line bg-panel/90 text-sm text-fg-2 shadow-md backdrop-blur transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:grid",
          canvasOnlyMode && "!hidden"
        )}
        style={
          tool === "draw" && !canvasOnlyMode
            ? { bottom: "calc(var(--studio-draw-options-height, 3.75rem) + 1.25rem)" }
            : undefined
        }
        aria-label={shortcutsHelpLabel}
        title={shortcutsHelpLabel}
      >
        <Keyboard size={16} aria-hidden />
      </button>

      <button
        type="button"
        onClick={() => openFeatureTutorial(null)}
        className={cn(
          "absolute bottom-3 right-[7.25rem] z-30 hidden size-11 place-items-center rounded-lg border border-line bg-panel/90 text-fg-2 shadow-md backdrop-blur transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:grid",
          canvasOnlyMode && "!hidden"
        )}
        style={
          tool === "draw" && !canvasOnlyMode
            ? { bottom: "calc(var(--studio-draw-options-height, 3.75rem) + 1.25rem)" }
            : undefined
        }
        aria-label={t("studio.mainMenu.item.view.feature-tutorials")}
        aria-expanded={tutorialHubOpen}
        title={t("studio.mainMenu.item.view.feature-tutorials")}
      >
        <BookOpen size={15} aria-hidden />
      </button>

    {state.module ? <state.module.StudioCanvasModalsBody {...props} />
      : requested ? <StudioOnDemandModuleStatus failed={state.failed} onRetry={state.retry} onCancel={cancel} /> : null}
  </>;
});
