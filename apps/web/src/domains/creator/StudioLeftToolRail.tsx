import { StudioAllToolsCatalog } from "./StudioAllToolsCatalog";
import { pinAllStudioToolbarTools, pinStudioToolbarTools, unpinStudioToolbarTools } from "./studio-toolbar-configuration";
import { subscribeStudioAllTools } from "./studio-toolbar-channel";
import { isStudioDrawingCoreTool, studioDrawingVisibleTools } from "./studio-drawing-core-tools";
import {
  Box,
  Boxes,
  Circle,
  CircleDashed,
  Crop,
  Droplets,
  Eraser,
  Film,
  Hand,
  ImagePlus,
  Lasso,
  Maximize2,
  MessageCircle,
  MessageSquare,
  MousePointer2,
  Move,
  PaintBucket,
  Paintbrush,
  Grid3X3,
  Pencil,
  PersonStanding,
  PictureInPicture2,
  Pipette,
  Settings2,
  Search,
  ScanLine,
  RotateCw,
  X,
  Shapes,
  Sparkles,
  Square,
  SquareDashedMousePointer,
  Sun,
  Triangle,
  Type as TypeIcon,
  UsersRound,
  Wind,
} from "lucide-react";
import { Fragment, memo, useCallback, useEffect, useId, useRef, useState, type SetStateAction } from "react";
import { createPortal } from "react-dom";

import {
  StudioEditorClientProvider,
  useEditorSelector,
  useStudioEditorClient,
} from "./editor-client";
import {
  STUDIO_LEFT_TOOL_RAIL_COMMANDS,
  type StudioLeftToolRailActionArguments,
  type StudioLeftToolRailActionName,
  type StudioLeftToolRailClient,
  type StudioLeftToolRailHandlersContract,
  type StudioLeftToolRailSnapshot,
} from "./editor-client/studio-left-tool-rail-client";
import { preloadStudioRasterRetouchRuntime } from "./render/studio-raster-retouch-preload";
import {
  DEFAULT_STUDIO_RAIL_TOOL_ORDER,
  STUDIO_RAIL_TOOL_CATALOG,
  type StudioRailToolId,
  type StudioToolbarPreferences,
  formatStudioShortcutChord,
} from "./studio-app-settings";
import {
  STUDIO_CHROME_RAIL_TOOL_GROUPS,
  studioChromeRailGroupLabel,
} from "./studio-chrome-ia-map";
import {
  StudioRailDivider,
  StudioRailToolButton,
  StudioVerticalToolRail,
} from "./studio-chrome-ui";
import {
  resolveStudioRailMorePosition,
  type StudioRailMorePosition,
  type StudioRailMoreViewport,
} from "./studio-left-tool-rail-position";
import { preloadStudioReferencePanel } from "./studio-page-lazy-ui";
import {
  STUDIO_RETOUCH_EDITABLE_COPY_NOTE,
  studioRetouchToolHelp,
} from "./studio-retouch-help";
import { isSelectionUsable } from "./studio-selection-tools";
import { suppressNextStudioToolHintFocus } from "./studio-tool-hint-focus-suppression";
import { studioUiDensityAllows } from "./studio-ui-density";
import type { StudioRailToolButtonProps } from "./studio-chrome-ui";

import type { DrawMode, DrawShapeKind } from "./studio-editor-tool-model";

import { cn } from "@/shared/lib/utils";

type StudioRailToolDefinition = StudioRailToolButtonProps & { [key: `data-${string}`]: string | boolean | undefined };

const REVIEW_LOCK_REASON = "현재 작업면의 검토 잠금을 먼저 해제하세요.";
const IMAGE_EDIT_LOCK_REASON = "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요.";
const RASTER_RETOUCH_AUTO_TARGET_GUIDANCE = STUDIO_RETOUCH_EDITABLE_COPY_NOTE;
const RASTER_RETOUCH_AUTO_TARGET_UNAVAILABLE_REASON =
  "편집 가능한 이미지도, 편집용 이미지 복사본을 자동 준비할 벡터 선·도형도 없습니다.";
const STUDIO_CANVAS_IMAGE_ACCEPT =
  "image/*,.bmp,.dib,.tga,.icb,.vda,.vst,.ppm,.pam,.qoi,.tif,.tiff";
const STUDIO_RAIL_MORE_GAP_PX = 4;
const STUDIO_RAIL_MORE_MARGIN_PX = 8;
const STUDIO_RAIL_MORE_MAX_HEIGHT_PX = 28 * 16;
const STUDIO_RAIL_MORE_WIDTH_PX = 22 * 16;

type PositionedStudioRailMore = StudioRailMorePosition & { readonly maxHeight: number };

function labelWithShortcut(label: string, shortcut: string | undefined): string {
  return shortcut ? `${label} (${formatStudioShortcutChord(shortcut)})` : label;
}

function resolveStateAction<T>(next: SetStateAction<T>, current: T): T {
  return typeof next === "function"
    ? (next as (value: T) => T)(current)
    : next;
}

function preloadRasterRetouchIntent(): void {
  void preloadStudioRasterRetouchRuntime().catch(() => undefined);
}

function preloadLiquifyIntent(): void {
  void preloadStudioRasterRetouchRuntime({ liquify: true }).catch(() => undefined);
}

function currentStudioRailMoreViewport(): StudioRailMoreViewport {
  const visualViewport = globalThis.visualViewport;
  return {
    height: visualViewport?.height ?? globalThis.innerHeight,
    left: visualViewport?.offsetLeft ?? 0,
    top: visualViewport?.offsetTop ?? 0,
    width: visualViewport?.width ?? globalThis.innerWidth,
  };
}

function measureStudioRailMorePosition(
  trigger: Pick<DOMRect, "bottom" | "left" | "right">,
  dialog?: Pick<DOMRect, "height" | "width"> | null
): PositionedStudioRailMore {
  const viewport = currentStudioRailMoreViewport();
  const maxHeight = Math.max(0, Math.min(
    STUDIO_RAIL_MORE_MAX_HEIGHT_PX,
    viewport.height - 16
  ));
  const measuredHeight = dialog?.height && dialog.height > 0
    ? Math.min(dialog.height, maxHeight)
    : maxHeight;
  const measuredWidth = dialog?.width && dialog.width > 0
    ? dialog.width
    : STUDIO_RAIL_MORE_WIDTH_PX;

  const resolved = resolveStudioRailMorePosition({
    popoverHeight: measuredHeight,
    popoverWidth: measuredWidth,
    trigger,
    viewport,
  });
  const viewportLeft = viewport.left ?? 0;
  const viewportRight = viewportLeft + viewport.width;
  const availableOnRight = viewportRight - STUDIO_RAIL_MORE_MARGIN_PX
    - trigger.right - STUDIO_RAIL_MORE_GAP_PX;
  const availableOnLeft = trigger.left - viewportLeft
    - STUDIO_RAIL_MORE_MARGIN_PX - STUDIO_RAIL_MORE_GAP_PX;

  return {
    ...resolved,
    left: availableOnRight < measuredWidth && availableOnLeft >= measuredWidth
      ? trigger.left - STUDIO_RAIL_MORE_GAP_PX - measuredWidth
      : resolved.left,
    maxHeight,
  };
}

export type StudioLeftToolRailHandlers = StudioLeftToolRailHandlersContract;

export interface StudioLeftToolRailProps {
  readonly client: StudioLeftToolRailClient;
}

const selectStudioLeftToolRailSnapshot = (
  snapshot: StudioLeftToolRailSnapshot,
): StudioLeftToolRailSnapshot => snapshot;

export const StudioLeftToolRail = memo(function StudioLeftToolRail({
  client,
}: StudioLeftToolRailProps) {
  return (
    <StudioEditorClientProvider client={client}>
      <StudioLeftToolRailConnected />
    </StudioEditorClientProvider>
  );
});

function StudioLeftToolRailConnected() {
  const snapshot = useEditorSelector(selectStudioLeftToolRailSnapshot);
  const client = useStudioEditorClient<StudioLeftToolRailSnapshot>();
  const {
    activeSurfaceReviewLocked,
    pixelToolTargetAvailable,
    rasterRetouchTargetAvailable,
    advancedFillActive,
    advancedFillUnsupportedReason,
    appSettings,
    appSettingsOpen,
    canvasOnlyMode,
    commentPinArmed,
    cropActive,
    drawMode,
    drawShape,
    eyedropperActive,
    frameAnimOpen,
    frameAnimTargetId,
    isRailToolVisible: isConfiguredRailToolVisible,
    liquifyActive,
    mobileImmersive,
    perspectiveRulerActive,
    pixelForceCircle,
    pixelSel,
    pixelTool,
    quickShapeActive,
    railMoreOpen,
    referencePanelOpen,
    mannequinPoserOpen,
    poserVrmOpen,
    characterShaperOpen,
    bg3dOpen,
    hybridDccOpen,
    selected,
    selectedImageMutationLocked,
    dodgeBurnActive,
    wetMixActive,
    smudgeActive,
    tool,
    uiDensityMode,
    viewTransformSuppressed,
    viewTool,
  } = snapshot;
  // Core drawing/editing commands remain discoverable in every density and saved toolbar.
  const isRailToolVisible = (id: Parameters<typeof isConfiguredRailToolVisible>[0]) =>
    appSettings.toolbar.configured === true
      ? appSettings.toolbar.visibleIds.includes(id)
      : isStudioDrawingCoreTool(id) || isConfiguredRailToolVisible(id);
  const railMoreDialogId = useId();
  const [railMoreQuery, setRailMoreQuery] = useState("");
  const [toolbarBeforeShowAll, setToolbarBeforeShowAll] = useState<StudioToolbarPreferences | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const entryRootRef = useRef<HTMLSpanElement>(null);
  const externalTriggerRef = useRef<HTMLElement | null>(null);
  const railMoreTriggerId = `${railMoreDialogId}-trigger`;
  // 도구 버튼 라벨은 `StudioRailToolButton` 안에서 도구 id 로 번역된다. 여기서 쓰는 건 도구가
  // 아닌 레일 셸 문구(더보기 버튼, 숨긴 도구 목록, 설정 진입)뿐이다.
  const railMoreTitleId = `${railMoreDialogId}-title`;
  const zoomShortcut = appSettings.shortcuts["tool-zoom"];
  const rotateViewShortcut = appSettings.shortcuts["tool-rotate-view"];
  const commentShortcut = appSettings.shortcuts["tool-comment"];
  const smudgeShortcut = appSettings.shortcuts["tool-blend"];
  const wetMixShortcut = appSettings.shortcuts["tool-wet-mix"];
  const dodgeBurnShortcut = appSettings.shortcuts["tool-dodge-burn"];
  const liquifyShortcut = appSettings.shortcuts["tool-liquify"];
  const smudgeHelp = studioRetouchToolHelp("smudge");
  const wetMixHelp = studioRetouchToolHelp("wet-mix");
  const dodgeBurnHelp = studioRetouchToolHelp("dodge-burn");
  const liquifyHelp = studioRetouchToolHelp("liquify");
  const formattedCommentShortcut = commentShortcut
    ? formatStudioShortcutChord(commentShortcut)
    : null;
  const zoomViewToolOpen = viewTool === "zoom";
  const rotateViewToolOpen = viewTool === "rotate";
  const zoomViewToolLabel = zoomViewToolOpen
    ? zoomShortcut
      ? `확대·축소 HUD 닫기 (${formatStudioShortcutChord(zoomShortcut)})`
      : "확대·축소 HUD 닫기"
    : zoomShortcut
      ? `보기 확대·축소 (${formatStudioShortcutChord(zoomShortcut)})`
      : "보기 확대·축소";
  const rotateViewToolLabel = rotateViewToolOpen
    ? rotateViewShortcut
      ? `회전 HUD 닫기 (${formatStudioShortcutChord(rotateViewShortcut)})`
      : "회전 HUD 닫기"
    : rotateViewShortcut
      ? `보기 회전 (${formatStudioShortcutChord(rotateViewShortcut)})`
      : "보기 회전";
  const lassoToolHintProps = pixelTool === "lasso"
    ? { hintPreview: "polygon-lasso" as const }
    : pixelTool === "poly-lasso"
      ? { hintPreview: "dismiss" as const }
      : { hintPreview: "lasso" as const };
  const zoomViewToolHintProps = zoomViewToolOpen
    ? { hintPreview: "view-hud" as const, hintPreviewVariant: "zoom-close" as const }
    : { hintPreview: "view-hud" as const, hintPreviewVariant: "zoom-open" as const };
  const rotateViewToolHintProps = rotateViewToolOpen
    ? { hintPreview: "view-hud" as const, hintPreviewVariant: "rotate-close" as const }
    : { hintPreview: "view-hud" as const, hintPreviewVariant: "rotate-open" as const };
  const selectionSubtoolActive =
    advancedFillActive
    || cropActive
    || eyedropperActive
    || commentPinArmed
    || pixelTool !== null
    || smudgeActive
    || wetMixActive
    || dodgeBurnActive
    || liquifyActive;
  const drawToolTemporarilyOverridden = eyedropperActive || commentPinArmed;
  const selectedImageLocked =
    selected?.type === "image" && selectedImageMutationLocked;
  const rasterRetouchCanStart =
    rasterRetouchTargetAvailable
    && !activeSurfaceReviewLocked
    && !selectedImageLocked;
  const rasterRetouchDescription = (base: string): string =>
    selected?.type === "image"
      ? base
      : `${base} ${RASTER_RETOUCH_AUTO_TARGET_GUIDANCE}`;
  const rasterRetouchUnavailableReason = (active: boolean): string | undefined => {
    if (active) return undefined;
    if (activeSurfaceReviewLocked) return REVIEW_LOCK_REASON;
    if (selectedImageLocked) return IMAGE_EDIT_LOCK_REASON;
    return rasterRetouchTargetAvailable
      ? undefined
      : RASTER_RETOUCH_AUTO_TARGET_UNAVAILABLE_REASON;
  };
  const railMoreDialogRef = useRef<HTMLDivElement>(null);
  const [railMorePosition, setRailMorePosition] = useState<PositionedStudioRailMore>({
    left: 56,
    maxHeight: STUDIO_RAIL_MORE_MAX_HEIGHT_PX,
    top: 8,
  });
  const invokeRail = useCallback(
    function invoke<K extends StudioLeftToolRailActionName>(
      action: K,
      ...args: StudioLeftToolRailActionArguments<K>
    ) {
      return client.dispatch({
        id: STUDIO_LEFT_TOOL_RAIL_COMMANDS[action],
        payload: args,
        source: "rail",
      });
    },
    [client],
  );

  function bindVoidAction<K extends StudioLeftToolRailActionName>(
    action: K,
  ): (...args: StudioLeftToolRailActionArguments<K>) => void {
    return (...args) => {
      void invokeRail(action, ...args);
    };
  }

  const setAppSettingsInitialTab = (
    value: StudioLeftToolRailActionArguments<"setAppSettingsInitialTab">[0],
  ): void => {
    void invokeRail("setAppSettingsInitialTab", value);
  };
  const setAppSettingsOpen = (next: SetStateAction<boolean>): void => {
    void invokeRail("setAppSettingsOpen", resolveStateAction(next, appSettingsOpen));
  };
  const setDrawShape = (next: SetStateAction<typeof drawShape>): void => {
    void invokeRail("setDrawShape", resolveStateAction(next, drawShape));
  };
  const setEyedropperActive = (next: SetStateAction<boolean>): void => {
    void invokeRail("setEyedropperActive", resolveStateAction(next, eyedropperActive));
  };
  const setMenu = (
    value: StudioLeftToolRailActionArguments<"setMenu">[0],
  ): void => {
    void invokeRail("setMenu", value);
  };
  const setPerspectiveRulerActive = (next: SetStateAction<boolean>): void => {
    void invokeRail(
      "setPerspectiveRulerActive",
      resolveStateAction(next, perspectiveRulerActive),
    );
  };
  const setPixelForceCircle = (next: SetStateAction<boolean>): void => {
    void invokeRail("setPixelForceCircle", resolveStateAction(next, pixelForceCircle));
  };
  const setPixelTool = (next: SetStateAction<typeof pixelTool>): void => {
    void invokeRail("setPixelTool", resolveStateAction(next, pixelTool));
  };
  const setQuickShapeActive = (next: SetStateAction<boolean>): void => {
    void invokeRail("setQuickShapeActive", resolveStateAction(next, quickShapeActive));
  };
  const setRailMoreOpen = useCallback((next: SetStateAction<boolean>): void => {
    void invokeRail("setRailMoreOpen", resolveStateAction(next, railMoreOpen));
  }, [invokeRail, railMoreOpen]);
  const setReferencePanelOpen = (next: SetStateAction<boolean>): void => {
    void invokeRail("setReferencePanelOpen", resolveStateAction(next, referencePanelOpen));
  };
  const setMannequinPoserOpen = client.availability(
    STUDIO_LEFT_TOOL_RAIL_COMMANDS.setMannequinPoserOpen,
  ).state === "enabled"
    ? (next: SetStateAction<boolean>): void => {
        void invokeRail(
          "setMannequinPoserOpen",
          resolveStateAction(next, mannequinPoserOpen),
        );
      }
    : undefined;
  const setPoserVrmOpen = client.availability(
    STUDIO_LEFT_TOOL_RAIL_COMMANDS.setPoserVrmOpen,
  ).state === "enabled"
    ? (next: SetStateAction<boolean>): void => {
        void invokeRail("setPoserVrmOpen", resolveStateAction(next, poserVrmOpen));
      }
    : undefined;
  const setCharacterShaperOpen = client.availability(
    STUDIO_LEFT_TOOL_RAIL_COMMANDS.setCharacterShaperOpen,
  ).state === "enabled"
    ? (next: SetStateAction<boolean>): void => {
        void invokeRail("setCharacterShaperOpen", resolveStateAction(next, characterShaperOpen));
      }
    : undefined;
  const setHybridDccOpen = client.availability(
    STUDIO_LEFT_TOOL_RAIL_COMMANDS.setHybridDccOpen,
  ).state === "enabled"
    ? (next: SetStateAction<boolean>): void => {
        void invokeRail("setHybridDccOpen", resolveStateAction(next, hybridDccOpen));
      }
    : undefined;
  const setViewTool = (next: SetStateAction<typeof viewTool>): void => {
    void invokeRail("setViewTool", resolveStateAction(next, viewTool));
  };

  const activatePrimaryCanvasTool = bindVoidAction("activatePrimaryCanvasTool");
  const addBubble = bindVoidAction("addBubble");
  const addText = bindVoidAction("addText");
  const announceDrawingShortcut = bindVoidAction("announceDrawingShortcut");
  const clearPolyLassoDraft = bindVoidAction("clearPolyLassoDraft");
  const commitAppSettings = bindVoidAction("commitAppSettings");
  const disarmAllPixelTools = bindVoidAction("disarmAllPixelTools");
  const fitCanvasToWidth = bindVoidAction("fitCanvasToWidth");
  const fitCanvasToWidthWithFocus = client.availability(
    STUDIO_LEFT_TOOL_RAIL_COMMANDS.fitCanvasToWidthWithFocus,
  ).state === "enabled"
    ? bindVoidAction("fitCanvasToWidthWithFocus")
    : undefined;
  const onRequestPixelSelection = bindVoidAction("onRequestPixelSelection");
  const onRequestSelectImage = bindVoidAction("onRequestSelectImage");
  const returnToSelectTool = bindVoidAction("returnToSelectTool");
  const toggleHandTool = bindVoidAction("toggleHandTool");
  const onPickImage: StudioLeftToolRailHandlers["onPickImage"] = async (...args) => {
    await invokeRail("onPickImage", ...args);
  };
  const revealDrawToolProperties = bindVoidAction("revealDrawToolProperties");
  const toggleAdvancedFill = bindVoidAction("toggleAdvancedFill");
  const toggleStudioCommentPinPlacement = bindVoidAction(
    "toggleStudioCommentPinPlacement",
  );
  const toggleDodgeBurnTool = bindVoidAction("toggleDodgeBurnTool");
  const toggleWetMixTool = bindVoidAction("toggleWetMixTool");
  const toggleLiquifyTool = bindVoidAction("toggleLiquifyTool");
  const togglePixelMarquee = bindVoidAction("togglePixelMarquee");
  const toggleSmudgeTool = bindVoidAction("toggleSmudgeTool");
  const toggleBg3dEditor = bindVoidAction("toggleBg3dEditor");
  const openFrameAnimationForSelected = bindVoidAction(
    "openFrameAnimationForSelected",
  );
  const openPixelSelectionTransform = bindVoidAction(
    "openPixelSelectionTransform",
  );
  const openSelectedLayerCrop = bindVoidAction("openSelectedLayerCrop");

  const fitCanvasToWidthWithWorkspace =
    fitCanvasToWidthWithFocus ?? fitCanvasToWidth;
  /** Pick a draw mode from the rail and surface context properties (CSP/PPT IA). */
  const activateDrawTool = (mode: DrawMode, shape?: DrawShapeKind) => {
    // 진행 중인 획 취소 + disarm(스포이드 포함) + tool/drawMode 커밋은 전이 함수가 정본이다.
    activatePrimaryCanvasTool("draw", mode);
    if (shape !== undefined) setDrawShape(shape);
    setMenu(null);
    // First tool click should clear first-use chrome so the canvas stays the focus.
    revealDrawToolProperties();
  };
  /** Object free-transform path (stroke handles / Konva) — no pixel marquee needed. */
  const objectFreeTransformReady =
    selected !== null
    && !activeSurfaceReviewLocked
    && !(selected.type === "image" && selectedImageMutationLocked);
  const pixelContentTransformReady =
    pixelToolTargetAvailable && isSelectionUsable(pixelSel);
  /**
   * Image-only content-transform recovery: start a marquee on a raster target.
   * Vector-first pages should NOT fall through here — that used to label the tool
   * "선택 시작하기" and open pixel marquee, which felt broken vs free-transform.
   */
  const pixelTransformRecoveryAvailable =
    !objectFreeTransformReady
    && !pixelContentTransformReady
    && pixelToolTargetAvailable
    && !activeSurfaceReviewLocked
    && !selectedImageLocked;
  /** No selection yet: arm select tool so the next click free-transforms. */
  const objectTransformPickRecoveryAvailable =
    !objectFreeTransformReady
    && !pixelContentTransformReady
    && !pixelToolTargetAvailable
    && !activeSurfaceReviewLocked;
  const frameAnimationNeedsImage =
    selected?.type !== "image" || !pixelToolTargetAvailable;
  const frameAnimationRecoveryAvailable =
    frameAnimationNeedsImage && !activeSurfaceReviewLocked && !selectedImageLocked;

  useEffect(() => {
    if (!railMoreOpen) return;
    const dialog = railMoreDialogRef.current;
    let positionFrame: number | null = null;
    const updatePosition = () => {
      const trigger = externalTriggerRef.current?.isConnected ? externalTriggerRef.current : document.getElementById(railMoreTriggerId);
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const next = measureStudioRailMorePosition(
        rect,
        dialog?.getBoundingClientRect()
      );
      setRailMorePosition((current) =>
        current.left === next.left
        && current.top === next.top
        && current.maxHeight === next.maxHeight
          ? current
          : next
      );
    };
    const schedulePosition = () => {
      if (positionFrame !== null) return;
      positionFrame = globalThis.requestAnimationFrame(() => {
        positionFrame = null;
        updatePosition();
      });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setRailMoreOpen(false);
      requestAnimationFrame(() => (externalTriggerRef.current ?? document.getElementById(railMoreTriggerId))?.focus());
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dialog?.contains(target) || document.getElementById(railMoreTriggerId)?.contains(target) || externalTriggerRef.current?.contains(target)) return;
      setRailMoreOpen(false);
    };
    updatePosition();
    dialog?.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, true);
    globalThis.addEventListener("resize", schedulePosition);
    globalThis.addEventListener("scroll", schedulePosition, true);
    globalThis.visualViewport?.addEventListener("resize", schedulePosition);
    globalThis.visualViewport?.addEventListener("scroll", schedulePosition);
    const frame = requestAnimationFrame(() => {
      const search = dialog?.querySelector<HTMLInputElement>('input[type="search"]');
      if (search) search.focus();
      else dialog?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled])')?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (positionFrame !== null) globalThis.cancelAnimationFrame(positionFrame);
      dialog?.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      globalThis.removeEventListener("resize", schedulePosition);
      globalThis.removeEventListener("scroll", schedulePosition, true);
      globalThis.visualViewport?.removeEventListener("resize", schedulePosition);
      globalThis.visualViewport?.removeEventListener("scroll", schedulePosition);
    };
  }, [railMoreOpen, railMoreTriggerId, setRailMoreOpen]);

  useEffect(() => {
    const scope = entryRootRef.current?.closest<HTMLElement>('[data-studio-editor="true"]');
    if (!scope) return;
    return subscribeStudioAllTools(scope, (trigger) => {
      externalTriggerRef.current = trigger;
      setRailMoreQuery("");
      setRailMorePosition(measureStudioRailMorePosition(trigger.getBoundingClientRect()));
      setRailMoreOpen(true);
    });
  }, [railMoreTriggerId, setRailMoreOpen]);

  function closeRailMoreAndRestoreFocus(): void {
    setRailMoreOpen(false);
    requestAnimationFrame(() => {
      const trigger = externalTriggerRef.current?.isConnected ? externalTriggerRef.current : document.getElementById(railMoreTriggerId);
      // Selecting a tool keeps keyboard focus available without covering the new tool with its coach.
      suppressNextStudioToolHintFocus(trigger);
      trigger?.focus({ preventScroll: true });
    });
  }

  const visibleRailIds = [...new Set([
    ...studioDrawingVisibleTools(appSettings.toolbar.visibleIds, appSettings.toolbar.configured === true),
    ...DEFAULT_STUDIO_RAIL_TOOL_ORDER,
  ])].filter(isRailToolVisible);

  // Keep action/lock contracts intact, but render in the saved DOM (and keyboard) order.
  const railToolDefinitions: Record<StudioRailToolId, StudioRailToolDefinition> = {
"select": {
"data-studio-rail-tool-id": "select",
"icon": MousePointer2,
"label": "선택 (V)",
"description": "캔버스 위 요소를 클릭·드래그로 고르고 옮기거나 크기를 바꿉니다. 여러 개를 드래그해 함께 선택할 수 있어요.",
"active": tool === "select" && !selectionSubtoolActive,
"onClick": () => {
                activatePrimaryCanvasTool("select");
                setMenu(null);
              }
},
"transform": {
"data-studio-rail-tool-id": "transform",
"icon": Maximize2,
"label": "변형 (⇧T)",
"description": pixelTransformRecoveryAvailable
                  ? "이미지 픽셀 내용 변형을 위해 사각 선택을 시작합니다. 선택 뒤 다시 누르면 스케일·회전·뒤집기 패널이 열려요."
                  : objectTransformPickRecoveryAvailable
                    ? "변형할 선·도형·이미지를 캔버스에서 먼저 고르세요. 선택 도구로 전환합니다."
                    : objectFreeTransformReady
                      ? selected?.type === "draw"
                        ? "선택한 선화 레이어의 모서리 핸들로 크기·위치를 조절합니다. 이미지 픽셀 부분 변형은 사각 선택 후 다시 눌러 주세요."
                        : selected?.type === "image" && !isSelectionUsable(pixelSel)
                          ? "이미지 레이어 전체를 선택해 내용 변형(스케일·회전·뒤집기) 패널을 엽니다. 부분만 바꾸려면 먼저 사각·올가미 선택하세요."
                          : "선택한 객체의 모서리·회전 핸들로 변형하거나, 픽셀 선택이 있으면 내용 변형 패널을 엽니다."
                      : "픽셀 선택이 있으면 속성→리터치에서 내용 변형(스케일·회전·뒤집기)을 적용합니다.",
"active": false,
"disabled": activeSurfaceReviewLocked || selectedImageLocked,
"unavailableReason": activeSurfaceReviewLocked
                  ? REVIEW_LOCK_REASON
                  : selectedImageMutationLocked
                    ? IMAGE_EDIT_LOCK_REASON
                    : undefined,
"className": pixelTransformRecoveryAvailable || objectTransformPickRecoveryAvailable
                  ? "size-11"
                  : undefined,
"onClick": () => {
                if (pixelTransformRecoveryAvailable) {
                  onRequestPixelSelection();
                  return;
                }
                if (objectTransformPickRecoveryAvailable) {
                  disarmAllPixelTools();
                  returnToSelectTool();
                  setMenu(null);
                  announceDrawingShortcut(
                    "변형할 요소를 클릭해 선택하세요 · 모서리 핸들로 크기 조절",
                  );
                  return;
                }
                openPixelSelectionTransform();
              }
},
"hand": {
"data-studio-rail-tool-id": "hand",
"icon": Hand,
"label": "핸드 (팬)",
"description": "캔버스를 드래그해 이동합니다. Space 키와 같은 역할입니다.",
"active": tool === "hand",
"onClick": () => {
                disarmAllPixelTools();
                toggleHandTool();
                setEyedropperActive(false);
                setMenu(null);
              }
},
"pen": {
"data-studio-rail-tool-id": "pen",
"data-studio-primary-action": "draw",
"icon": Pencil,
"label": "펜 (B)",
"description": "자유선으로 그립니다. 필압·보정·브러시 프리셋은 하단 옵션 도크와 현재 브러시 편집에서 조절해요.",
"active": tool === "draw" && drawMode === "pen" && !drawToolTemporarilyOverridden,
"disabled": activeSurfaceReviewLocked,
"unavailableReason": activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined,
"grouped": true,
"onClick": () => activateDrawTool("pen")
},
"pixel-pencil": {
"data-studio-rail-tool-id": "pixel-pencil",
"icon": Grid3X3,
"label": "픽셀 펜 (P)",
"description": "1px 하드 픽셀 펜으로 그립니다. 안티앨리어스·필압 없이 또렷한 선을 남깁니다.",
"active": tool === "draw" && drawMode === "pixel" && !drawToolTemporarilyOverridden,
"disabled": activeSurfaceReviewLocked,
"unavailableReason": activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined,
"onClick": () => activateDrawTool("pixel")
},
"eraser": {
"data-studio-rail-tool-id": "eraser",
"icon": Eraser,
"label": "지우개 (E)",
"description": "현재 레이어/획 위를 지웁니다. 굵기는 펜과 같은 크기 칩으로 맞출 수 있어요.",
"active": tool === "draw" && drawMode === "eraser" && !drawToolTemporarilyOverridden,
"disabled": activeSurfaceReviewLocked,
"unavailableReason": activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined,
"onClick": () => activateDrawTool("eraser")
},
"blend": {
"data-studio-rail-tool-id": "blend",
"icon": Wind,
"label": labelWithShortcut(smudgeHelp.railName, smudgeShortcut),
"aria-keyshortcuts": smudgeShortcut || undefined,
"description": rasterRetouchDescription(smudgeHelp.summary),
"active": smudgeActive,
"disabled": !smudgeActive && !rasterRetouchCanStart,
"unavailableReason": rasterRetouchUnavailableReason(smudgeActive),
"onPointerEnter": preloadRasterRetouchIntent,
"onPointerDown": preloadRasterRetouchIntent,
"onFocus": preloadRasterRetouchIntent,
"onClick": toggleSmudgeTool
},
"wet-mix": {
"data-studio-rail-tool-id": "wet-mix",
"icon": Droplets,
"label": labelWithShortcut(wetMixHelp.railName, wetMixShortcut),
"aria-keyshortcuts": wetMixShortcut || undefined,
"description": rasterRetouchDescription(wetMixHelp.summary),
"active": wetMixActive,
"disabled": !wetMixActive && !rasterRetouchCanStart,
"unavailableReason": rasterRetouchUnavailableReason(wetMixActive),
"onPointerEnter": preloadRasterRetouchIntent,
"onPointerDown": preloadRasterRetouchIntent,
"onFocus": preloadRasterRetouchIntent,
"onClick": toggleWetMixTool
},
"dodge-burn": {
"data-studio-rail-tool-id": "dodge-burn",
"icon": Sun,
"label": labelWithShortcut(dodgeBurnHelp.railName, dodgeBurnShortcut),
"aria-keyshortcuts": dodgeBurnShortcut || undefined,
"description": rasterRetouchDescription(dodgeBurnHelp.summary),
"active": dodgeBurnActive,
"disabled": !dodgeBurnActive && !rasterRetouchCanStart,
"unavailableReason": rasterRetouchUnavailableReason(dodgeBurnActive),
"onPointerEnter": preloadRasterRetouchIntent,
"onPointerDown": preloadRasterRetouchIntent,
"onFocus": preloadRasterRetouchIntent,
"onClick": toggleDodgeBurnTool
},
"liquify": {
"data-studio-rail-tool-id": "liquify",
"icon": Move,
"label": labelWithShortcut(liquifyHelp.railName, liquifyShortcut),
"aria-keyshortcuts": liquifyShortcut || undefined,
"description": rasterRetouchDescription(liquifyHelp.summary),
"active": liquifyActive,
"disabled": !liquifyActive && !rasterRetouchCanStart,
"unavailableReason": rasterRetouchUnavailableReason(liquifyActive),
"onPointerEnter": preloadLiquifyIntent,
"onPointerDown": preloadLiquifyIntent,
"onFocus": preloadLiquifyIntent,
"onClick": toggleLiquifyTool
},
"fill": {
"data-studio-rail-tool-id": "fill",
"icon": PaintBucket,
"label": "채우기 (G)",
"description": advancedFillUnsupportedReason
                ? `선 안을 탭해 색을 채웁니다. ${advancedFillUnsupportedReason} 눌러서 안전한 단일 래스터 후보를 찾거나 필요한 조건을 확인하세요.`
                : "선 안을 탭해 색을 채웁니다. 경계 인식과 참조 레이어 설정은 속성 패널에서 조정해요.",
"active": advancedFillActive,
"onClick": toggleAdvancedFill
},
"lasso-fill": {
"data-studio-rail-tool-id": "lasso-fill",
"icon": Paintbrush,
"label": "올가미 채우기",
"description": "닫힌 궤적을 그려 현재 색으로 채웁니다.",
"active": tool === "draw" && drawMode === "lasso-fill",
"disabled": activeSurfaceReviewLocked,
"unavailableReason": activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined,
"onClick": () => activateDrawTool("lasso-fill")
},
"eyedropper": {
"data-studio-rail-tool-id": "eyedropper",
"icon": Pipette,
"label": "스포이드 (I / Alt+클릭)",
"description": "캔버스 색을 샘플링해 주 색으로 가져옵니다. 펜으로 그리는 중엔 Alt+클릭으로도 동작해요.",
"active": eyedropperActive,
"onClick": () => {
                const next = !eyedropperActive;
                if (next) disarmAllPixelTools();
                setEyedropperActive(next);
                setMenu(null);
              }
},
"marquee-rect": {
"data-studio-rail-tool-id": "marquee-rect",
"icon": SquareDashedMousePointer,
"label": "사각 선택 (M)",
"description": "이미지 픽셀을 사각형으로 선택합니다. Shift=정사각, Alt=중심 확장.",
"active": pixelTool === "rect" && !pixelForceCircle,
"disabled": activeSurfaceReviewLocked || (selected?.type === "image" && selectedImageMutationLocked),
"unavailableReason": activeSurfaceReviewLocked
                  ? REVIEW_LOCK_REASON
                  : selected?.type === "image" && selectedImageMutationLocked
                    ? IMAGE_EDIT_LOCK_REASON
                    : undefined,
"onClick": () => togglePixelMarquee("rect")
},
"marquee-circle": {
"data-studio-rail-tool-id": "marquee-circle",
"icon": CircleDashed,
"label": "원형 선택",
"description": "이미지 픽셀을 정원으로 선택합니다. Alt=중심 확장.",
"active": pixelTool === "ellipse" && pixelForceCircle,
"disabled": activeSurfaceReviewLocked || (selected?.type === "image" && selectedImageMutationLocked),
"unavailableReason": activeSurfaceReviewLocked
                  ? REVIEW_LOCK_REASON
                  : selected?.type === "image" && selectedImageMutationLocked
                    ? IMAGE_EDIT_LOCK_REASON
                    : undefined,
"onClick": () => togglePixelMarquee("circle")
},
"lasso": {
"data-studio-rail-tool-id": "lasso",
"icon": Lasso,
"label": pixelTool === "lasso"
                    ? "자유 올가미 · 다시 누르면 다각형 올가미"
                    : pixelTool === "poly-lasso"
                      ? "다각형 올가미 · 다시 누르면 끄기"
                      : "올가미 선택",
"description": pixelTool === "lasso"
                  ? "다시 누르면 클릭한 꼭짓점을 연결하는 다각형 올가미로 전환합니다."
                  : pixelTool === "poly-lasso"
                    ? "다시 누르면 다각형 올가미와 작성 중인 꼭짓점을 지우고 선택 도구를 끕니다."
                    : "다음 클릭부터 드래그한 자유 곡선 안쪽의 이미지 픽셀을 선택합니다.",
...lassoToolHintProps,
"active": (pixelTool === "lasso" || pixelTool === "poly-lasso") && !pixelForceCircle,
"disabled": activeSurfaceReviewLocked || (selected?.type === "image" && selectedImageMutationLocked),
"unavailableReason": activeSurfaceReviewLocked
                  ? REVIEW_LOCK_REASON
                  : selected?.type === "image" && selectedImageMutationLocked
                    ? IMAGE_EDIT_LOCK_REASON
                    : undefined,
"onClick": () => {
                if (activeSurfaceReviewLocked || (selected?.type === "image" && selectedImageMutationLocked)) return;
                returnToSelectTool();
                setMenu(null);
                setPixelForceCircle(false);
                if (pixelTool === "lasso") {
                  clearPolyLassoDraft();
                  disarmAllPixelTools();
                  setPixelTool("poly-lasso");
                  return;
                }
                if (pixelTool === "poly-lasso") {
                  clearPolyLassoDraft();
                  setPixelTool(null);
                  return;
                }
                clearPolyLassoDraft();
                disarmAllPixelTools();
                setPixelTool("lasso");
              }
},
"crop": {
"data-studio-rail-tool-id": "crop",
"icon": Crop,
"label": "자르기 (C)",
"description": rasterRetouchDescription(
                "가장자리와 모서리를 끌어 필요한 영역만 남깁니다. 적용 전까지 원본은 바뀌지 않아요."
              ),
"active": cropActive,
"disabled": !cropActive && !rasterRetouchCanStart,
"unavailableReason": rasterRetouchUnavailableReason(cropActive),
"onClick": openSelectedLayerCrop
},
"smart-shape": {
"data-studio-rail-tool-id": "smart-shape",
"icon": Shapes,
"label": quickShapeActive ? "스마트 도형 끄기" : "스마트 도형 켜기",
"description": quickShapeActive
                ? "자동 도형 보정을 끄고 입력한 획을 그대로 유지합니다."
                : "낙서를 잠시 멈추면 선·원·사각형 등 깔끔한 도형으로 자동 다듬어요.",
"hintPreview": "smart-shape",
"hintPreviewVariant": quickShapeActive ? "disable" : "enable",
"active": quickShapeActive,
"disabled": activeSurfaceReviewLocked,
"unavailableReason": activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined,
"accented": true,
"onClick": () => {
                const next = !quickShapeActive;
                if (next) {
                  activateDrawTool("pen");
                  announceDrawingShortcut("스마트 도형 켜짐 · 그려서 손을 떼면 다듬어요");
                } else {
                  announceDrawingShortcut("스마트 도형 꺼짐");
                }
                setQuickShapeActive(next);
                setMenu(null);
              }
},
"shape-rect": {
"data-studio-rail-tool-id": "shape-rect",
"icon": Square,
"label": "사각형 도형",
"description": "드래그로 사각형을 그립니다. Shift를 누르면 정사각형으로 맞출 수 있어요.",
"active": tool === "draw" && drawMode === "shape" && drawShape === "rect",
"disabled": activeSurfaceReviewLocked,
"unavailableReason": activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined,
"onClick": () => activateDrawTool("shape", "rect")
},
"shape-ellipse": {
"data-studio-rail-tool-id": "shape-ellipse",
"icon": Circle,
"label": "타원 도형",
"description": "드래그로 타원을 그립니다. Shift를 누르면 정원으로 맞출 수 있어요.",
"active": tool === "draw" && drawMode === "shape" && drawShape === "ellipse",
"disabled": activeSurfaceReviewLocked,
"unavailableReason": activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined,
"onClick": () => activateDrawTool("shape", "ellipse")
},
"text": {
"data-studio-rail-tool-id": "text",
"icon": TypeIcon,
"label": "텍스트 추가",
"description": "캔버스에 글자 상자를 추가합니다. 폰트·정렬·효과는 우측 속성에서 편집해요.",
"disabled": activeSurfaceReviewLocked,
"unavailableReason": activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined,
"onClick": () => {
                addText(undefined, true);
              }
},
"bubble": {
"data-studio-rail-tool-id": "bubble",
"icon": MessageCircle,
"label": "말풍선 추가",
"description": "만화 말풍선을 넣습니다. 꼬리 위치·스타일 프리셋은 말풍선 패널에서 바꿀 수 있어요.",
"disabled": activeSurfaceReviewLocked,
"unavailableReason": activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined,
"onClick": () => {
                addBubble("speech", undefined, true);
              }
},
"comment": {
"data-studio-rail-tool-id": "comment",
"icon": MessageSquare,
"label": commentPinArmed
                ? "댓글 핀 배치 취소"
                : formattedCommentShortcut
                  ? `댓글 핀 배치 (${formattedCommentShortcut})`
                  : "댓글 핀 배치",
"description": commentPinArmed
                ? "댓글 핀 배치를 취소하고 이전 편집 도구로 돌아갑니다."
                : `캔버스의 정확한 위치를 클릭해 댓글을 남깁니다. ${formattedCommentShortcut ? `${formattedCommentShortcut}로 바로 시작하고, ` : ""}⇧·C로 핀을 숨길 수 있어요.`,
"aria-keyshortcuts": commentShortcut || undefined,
"hintPreview": commentPinArmed ? "dismiss" : "comment",
"active": commentPinArmed,
"onClick": toggleStudioCommentPinPlacement
},
"perspective": {
"data-studio-rail-tool-id": "perspective",
"icon": Triangle,
"label": "투시도",
"description": "소실점 가이드로 원근을 맞춥니다.",
"active": perspectiveRulerActive,
"disabled": activeSurfaceReviewLocked,
"unavailableReason": activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined,
"onClick": () => {
                const next = !perspectiveRulerActive;
                setPerspectiveRulerActive(next);
                if (next) {
                  activateDrawTool("pen");
                  announceDrawingShortcut("투시도 켜짐 · 소실점 방향으로 펜 선을 맞춰요");
                } else {
                  announceDrawingShortcut("투시도 꺼짐");
                }
                setMenu(null);
              }
},
"frame-anim": {
"data-studio-rail-tool-id": "frame-anim",
"launcher": true,
"icon": Film,
"label": frameAnimationRecoveryAvailable ? "이미지 선택하기" : "프레임 애니메이션",
"description": frameAnimationRecoveryAvailable
                  ? "애니메이션으로 편집할 이미지 레이어를 먼저 선택하세요. 선택 모드에서 고른 뒤 이 위치에서 프레임 편집기로 돌아올 수 있어요."
                  : "선택한 이미지에 여러 프레임을 쌓아 간단한 셀 애니메이션을 만듭니다.",
"active": frameAnimOpen && frameAnimTargetId === selected?.id,
"disabled": activeSurfaceReviewLocked || selectedImageLocked,
"unavailableReason": activeSurfaceReviewLocked
                  ? REVIEW_LOCK_REASON
                  : selectedImageMutationLocked
                    ? IMAGE_EDIT_LOCK_REASON
                    : undefined,
"className": frameAnimationRecoveryAvailable ? "size-11" : undefined,
"onClick": frameAnimationRecoveryAvailable
                  ? onRequestSelectImage
                  : openFrameAnimationForSelected
},
"mannequin3d": {
"data-studio-rail-tool-id": "mannequin3d",
"launcher": true,
"icon": PersonStanding,
"label": "3D 데생 인형",
"description": "모델 파일 없이 체형을 조절하고 포즈를 잡아 드로잉 참고 이미지로 캡처합니다.",
"active": mannequinPoserOpen,
"accented": true,
"onClick": () => setMannequinPoserOpen?.((v) => !v)
},
"vrm3d": {
"data-studio-rail-tool-id": "vrm3d",
"launcher": true,
"icon": UsersRound,
"label": "3D 캐릭터",
"description": "베이스 캐릭터를 고른 뒤 포즈, 표정, 의상과 색상을 조정해 투명 배경 이미지로 추가합니다.",
"active": poserVrmOpen,
"accented": true,
"onClick": () => setPoserVrmOpen?.((v) => !v)
},
"character-shaper": {
"data-studio-rail-tool-id": "character-shaper",
"launcher": true,
"icon": Sparkles,
"label": "캐릭터 셰이퍼",
"description": "프리셋 카드로 얼굴·헤어·체형·의상을 고르고, 사진·웹캠으로 포즈를 잡고, 투명 PNG나 레이어 PSD로 내보냅니다.",
"active": characterShaperOpen,
"accented": true,
"onClick": () => setCharacterShaperOpen?.((v) => !v)
},
"bg3d": {
"data-studio-rail-tool-id": "bg3d",
"launcher": true,
"icon": Boxes,
"label": "3D 장면",
"description": "배경·포즈·구도를 3D로 먼저 잡고 선화·톤 가이드로 작화에 바로 적용합니다.",
"active": bg3dOpen,
"accented": true,
"onClick": toggleBg3dEditor
},
"hybrid-dcc": {
"data-studio-rail-tool-id": "hybrid-dcc",
"launcher": true,
"icon": Box,
"label": "Hybrid 3D DCC",
"description": "메시·불리언·CAD/스컬프/클로스·샷·.toon3d 하이브리드 워크스페이스를 엽니다. 웹툰 세트장 구축과 컷 연출을 한 화면에서 처리합니다.",
"active": hybridDccOpen,
"accented": true,
"onClick": () => setHybridDccOpen?.((v) => !v)
},
"reference": {
"data-studio-rail-tool-id": "reference",
"launcher": true,
"icon": PictureInPicture2,
"label": "참고 이미지",
"description": "캔버스와 분리된 참고 이미지를 띄워 구도·색·의상을 보면서 작업합니다. 완성 원고에는 포함되지 않아요.",
"active": referencePanelOpen,
"accented": true,
"onClick": () => {
                  preloadStudioReferencePanel();
                  setReferencePanelOpen((v) => !v);
                },
"onMouseEnter": preloadStudioReferencePanel,
"onFocus": preloadStudioReferencePanel
},

image: { icon: ImagePlus, label: "이미지 추가", description: "이미지 파일을 현재 원고에 추가합니다.", disabled: activeSurfaceReviewLocked, unavailableReason: REVIEW_LOCK_REASON, onClick: () => imageFileInputRef.current?.click() },
zoom: { icon: Search, label: zoomViewToolLabel, description: zoomViewToolOpen ? "현재 확대·축소 HUD를 닫고 적용한 보기 배율은 그대로 유지합니다." : "확대·축소 HUD를 열어 배율·화면 맞춤·100% 보기를 빠르게 조절합니다.", active: zoomViewToolOpen, disabled: viewTransformSuppressed, unavailableReason: "내보내기·저장이 끝난 뒤 보기를 조절하세요.", ...zoomViewToolHintProps, "aria-expanded": zoomViewToolOpen, "aria-controls": "studio-view-tools-hud-zoom", "data-studio-view-tool-trigger": "zoom", onClick: () => setViewTool((current) => current === "zoom" ? null : "zoom") },
"zoom-fit": { icon: ScanLine, label: "너비에 맞춤 (Home)", description: "캔버스 폭에 맞춰 확대·축소합니다.", disabled: viewTransformSuppressed, unavailableReason: "내보내기·저장이 끝난 뒤 보기를 조절하세요.", hintPreview: "zoom-view", hintPreviewVariant: "fit-width", onClick: fitCanvasToWidthWithWorkspace },
"rotate-view": { icon: RotateCw, label: rotateViewToolLabel, description: rotateViewToolOpen ? "현재 회전 HUD를 닫고 적용한 보기 회전·반전 상태는 그대로 유지합니다." : "회전 HUD를 열어 캔버스를 좌·우 90°로 돌리거나 수평 반전합니다. 문서와 내보내기는 바뀌지 않아요.", active: rotateViewToolOpen, disabled: viewTransformSuppressed, unavailableReason: "내보내기·저장이 끝난 뒤 보기를 조절하세요.", ...rotateViewToolHintProps, "aria-expanded": rotateViewToolOpen, "aria-controls": "studio-view-tools-hud-rotate", "data-studio-view-tool-trigger": "rotate", onClick: () => setViewTool((current) => current === "rotate" ? null : "rotate") }

};

  const currentToolId: StudioRailToolId | undefined = eyedropperActive ? "eyedropper"
    : commentPinArmed ? "comment" : cropActive ? "crop" : tool === "hand" ? "hand"
    : pixelTool === "rect" ? "marquee-rect" : pixelTool === "ellipse" ? "marquee-circle"
    : pixelTool === "lasso" || pixelTool === "poly-lasso" ? "lasso"
    : advancedFillActive ? "fill" : smudgeActive ? "blend" : wetMixActive ? "wet-mix"
    : dodgeBurnActive ? "dodge-burn" : liquifyActive ? "liquify"
    : tool === "draw" ? drawMode === "eraser" ? "eraser" : drawMode === "pixel" ? "pixel-pencil" : drawMode === "lasso-fill" ? "lasso-fill" : drawMode === "shape" ? drawShape === "ellipse" ? "shape-ellipse" : drawShape === "rect" ? "shape-rect" : "smart-shape" : "pen"
    : tool === "select" ? "select" : undefined;

  const openConfiguration = () => {
    (externalTriggerRef.current ?? document.getElementById(railMoreTriggerId))?.focus({ preventScroll: true });
    setRailMoreOpen(false);
    setAppSettingsInitialTab("toolbar");
    setAppSettingsOpen(true);
  };
  const changePins = (toolbar: StudioToolbarPreferences) => {
    setToolbarBeforeShowAll(appSettings.toolbar);
    commitAppSettings({ ...appSettings, toolbar });
  };
  const railMoreFooter = (
    <div className="relative flex w-full flex-col items-center gap-1" data-studio-tool-rail-settings="true">
      <button type="button" id={railMoreTriggerId}
        aria-label="전체 도구" aria-controls={railMoreOpen ? railMoreDialogId : undefined}
        aria-expanded={railMoreOpen} aria-haspopup="dialog"
        className="flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-lg text-fg-2 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent"
        onClick={() => {
          externalTriggerRef.current = null;
          if (!railMoreOpen) {
            setRailMoreQuery("");
            const rect = document.getElementById(railMoreTriggerId)?.getBoundingClientRect();
            if (rect) setRailMorePosition(measureStudioRailMorePosition(rect));
          }
          setRailMoreOpen((value) => !value);
        }}><Search size={18} aria-hidden /><span className="text-xs">전체</span></button>
      <button type="button" aria-label="도구막대 구성" className="flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-lg text-fg-2 hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent"
        onClick={openConfiguration}><Settings2 size={18} aria-hidden /><span className="text-xs">구성</span></button>
      {railMoreOpen && typeof document !== "undefined" ? createPortal(
        <div ref={railMoreDialogRef} id={railMoreDialogId} role="dialog" aria-modal="false"
          aria-labelledby={railMoreTitleId} tabIndex={-1} data-studio-shortcut-boundary="true"
          className="fixed z-[90] flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-line bg-panel p-3 shadow-xl"
          style={{ left: railMorePosition.left, top: railMorePosition.top, maxHeight: railMorePosition.maxHeight }}>
          <header className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <div><h2 id={railMoreTitleId} className="text-sm font-semibold">전체 도구</h2>
              <p className="text-xs text-fg-2" aria-live="polite">고정 {visibleRailIds.length} · 전체 {STUDIO_RAIL_TOOL_CATALOG.length}</p></div>
            <button type="button" aria-label="전체 도구 닫기" onClick={closeRailMoreAndRestoreFocus} className="grid size-11 place-items-center rounded-lg hover:bg-raised"><X size={18} aria-hidden /></button>
          </header>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
            <StudioAllToolsCatalog definitions={railToolDefinitions} pinned={visibleRailIds} query={railMoreQuery} onQuery={setRailMoreQuery}
              onPin={(id, pinned) => changePins(pinned ? pinStudioToolbarTools(appSettings.toolbar, [id]) : unpinStudioToolbarTools(appSettings.toolbar, [id]))}
              onUsed={closeRailMoreAndRestoreFocus} />
          </div>
          <footer className="mt-2 flex shrink-0 flex-wrap gap-2 border-t border-line pt-2">
            <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs" onClick={() => changePins(pinAllStudioToolbarTools(appSettings.toolbar))}>모든 도구 고정</button>
            {toolbarBeforeShowAll ? <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs"
              onClick={() => { commitAppSettings({ ...appSettings, toolbar: toolbarBeforeShowAll }); setToolbarBeforeShowAll(null); }}>이전 구성</button> : null}
            <button type="button" className="min-h-11 rounded-lg border border-line px-3 text-xs" onClick={openConfiguration}>구성 편집</button>
          </footer>
        </div>, document.body) : null}
    </div>
  );

  return <>
    <span ref={entryRootRef} hidden />
    <input ref={imageFileInputRef} type="file" accept={STUDIO_CANVAS_IMAGE_ACCEPT}
      aria-label="캔버스 이미지 파일 선택" className="sr-only" tabIndex={-1}
      onChange={onPickImage} disabled={activeSurfaceReviewLocked} />
    {studioUiDensityAllows(uiDensityMode, "tool-rail") && !canvasOnlyMode ? (
      <StudioVerticalToolRail className={cn(mobileImmersive && "hidden")} view={appSettings.toolbar.view} footer={railMoreFooter}>
        {currentToolId && !visibleRailIds.includes(currentToolId) ? (
          <div className="col-span-full w-full border-b border-line pb-2" data-studio-unpinned-current-tool={currentToolId}>
            <span className="block text-center text-xs text-fg-2">현재</span>
            <StudioRailToolButton {...railToolDefinitions[currentToolId]} data-studio-rail-tool-id={undefined} data-studio-current-tool-id={currentToolId} showLabel={appSettings.toolbar.view === "list"} />
          </div>
        ) : null}
        {visibleRailIds.map((id, index) => {
          const group = STUDIO_CHROME_RAIL_TOOL_GROUPS.find((item) => (item.toolIds as readonly StudioRailToolId[]).includes(id));
          const previousId = visibleRailIds[index - 1];
          const startsGroup = group && (!previousId || !(group.toolIds as readonly StudioRailToolId[]).includes(previousId));
          return <Fragment key={id}>
            {startsGroup && appSettings.toolbar.view !== "double" ? <StudioRailDivider data-studio-rail-group-divider={group.id} label={studioChromeRailGroupLabel(group.id)} /> : null}
            <StudioRailToolButton {...railToolDefinitions[id]} data-studio-rail-tool-id={id} showLabel={appSettings.toolbar.view === "list"} />
          </Fragment>;
        })}
      </StudioVerticalToolRail>
    ) : <div hidden>{railMoreFooter}</div>}
  </>;
}
