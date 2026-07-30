import {
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
  RotateCw,
  ScanLine,
  Search,
  Settings2,
  Shapes,
  Square,
  SquareDashedMousePointer,
  Sun,
  Triangle,
  Type as TypeIcon,
  UsersRound,
  Wind,
} from "lucide-react";
import { memo, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_STUDIO_RAIL_TOOL_ORDER,
  formatStudioShortcutChord,
  studioRailToolLabel,
  type StudioAppSettings,
  type StudioAppSettingsTab,
  type StudioRailToolId,
} from "./studio-app-settings";
import { type BubbleVariant } from "./studio-assets";
import {
  StudioRailDivider,
  StudioRailToolButton,
  StudioVerticalToolRail,
} from "./studio-chrome-ui";
import { type DrawMode, type DrawShapeKind, type StudioMenu, type Tool } from "./studio-editor-tool-model";
import { type El } from "./studio-element-model";
import {
  resolveStudioRailMorePosition,
  type StudioRailMorePosition,
  type StudioRailMoreViewport,
} from "./studio-left-tool-rail-position";
import { preloadStudioReferencePanel } from "./studio-page-lazy-ui";
import {
  isSelectionUsable,
  type PixelSelection,
  type SelectionToolKind,
} from "./studio-selection-tools";
import { studioUiDensityAllows } from "./studio-ui-density";
import { StudioToolHintTarget } from "./StudioToolHint";

import { cn } from "@/lib/utils";

const REVIEW_LOCK_REASON = "현재 작업면의 검토 잠금을 먼저 해제하세요.";
const IMAGE_EDIT_LOCK_REASON = "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요.";
const RASTER_RETOUCH_AUTO_TARGET_GUIDANCE =
  "이미지 레이어를 선택하지 않아도 현재 페이지 합성본을 자동 준비해 새 래스터 레이어에서 시작합니다.";
const RASTER_RETOUCH_AUTO_TARGET_UNAVAILABLE_REASON =
  "편집 가능한 이미지가 없고 현재 페이지 합성본을 자동 준비할 그리기 내용도 없습니다.";
const STUDIO_CANVAS_IMAGE_ACCEPT =
  "image/*,.bmp,.dib,.tga,.icb,.vda,.vst,.ppm,.pam,.qoi,.tif,.tiff";
const STUDIO_RAIL_MORE_GAP_PX = 4;
const STUDIO_RAIL_MORE_MARGIN_PX = 8;
const STUDIO_RAIL_MORE_MAX_HEIGHT_PX = 28 * 16;
const STUDIO_RAIL_MORE_WIDTH_PX = 13 * 16;

type PositionedStudioRailMore = StudioRailMorePosition & { readonly maxHeight: number };

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

export interface StudioLeftToolRailHandlers {
  fitCanvasToWidth: () => void;
  openFrameAnimationForSelected: () => void;
  openPixelSelectionTransform: () => void;
  openSelectedLayerCrop: () => void;
  addBubble: (
    variant: BubbleVariant,
    at?: { x: number; y: number; },
    editImmediately?: boolean
  ) => void;
  addText: (at?: { x: number; y: number; }, editImmediately?: boolean) => void;
  announceDrawingShortcut: (message: string) => void;
  clearPolyLassoDraft: () => void;
  commitAppSettings: (next: StudioAppSettings) => void;
  disarmAllPixelTools: () => void;
  onPickImage: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  toggleAdvancedFill: () => void;
  toggleDodgeBurnTool: () => void;
  toggleWetMixTool: () => void;
  toggleLiquifyTool: () => void;
  togglePixelMarquee: (kind: "rect" | "circle") => void;
  toggleSmudgeTool: () => void;
  toggleStudioCommentPinPlacement: () => void;
}

interface StudioLeftToolRailProps {
  activeSurfaceReviewLocked: boolean;
  /** 선택한 편집 가능 이미지가 필요한 픽셀 변형·프레임 애니메이션의 활성 판정. */
  pixelToolTargetAvailable: boolean;
  /** 선택 이미지 또는 현재 페이지 합성본을 자동 준비할 수 있는 래스터 리터치 도구 활성 판정. */
  rasterRetouchTargetAvailable: boolean;
  advancedFillActive: boolean;
  advancedFillUnsupportedReason: string | null;
  appSettings: StudioAppSettings;
  appSettingsOpen: boolean;
  canvasOnlyMode: boolean;
  commentPinArmed: boolean;
  cropActive: boolean;
  drawMode: DrawMode;
  drawShape: DrawShapeKind;
  eyedropperActive: boolean;
  frameAnimOpen: boolean;
  frameAnimTargetId: string | null;
  isRailToolVisible: (id: StudioRailToolId) => boolean;
  liquifyActive: boolean;
  mobileImmersive: boolean;
  perspectiveRulerActive: boolean;
  pixelForceCircle: boolean;
  pixelSel: PixelSelection | null;
  pixelTool: SelectionToolKind | "wand" | null;
  quickShapeActive: boolean;
  railMoreOpen: boolean;
  referencePanelOpen: boolean;
  mannequinPoserOpen?: boolean;
  poserVrmOpen?: boolean;
  bg3dOpen?: boolean;
  selected: El | null;
  selectedImageMutationLocked: boolean;
  setAppSettingsInitialTab: import("react").Dispatch<import("react").SetStateAction<StudioAppSettingsTab>>;
  setAppSettingsOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setDrawMode: import("react").Dispatch<import("react").SetStateAction<DrawMode>>;
  setDrawShape: import("react").Dispatch<import("react").SetStateAction<DrawShapeKind>>;
  setEyedropperActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setMenu: import("react").Dispatch<import("react").SetStateAction<StudioMenu | null>>;
  setPerspectiveRulerActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPixelForceCircle: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPixelTool: import("react").Dispatch<import("react").SetStateAction<SelectionToolKind | "wand" | null>>;
  setQuickShapeActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setRailMoreOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setReferencePanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setMannequinPoserOpen?: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPoserVrmOpen?: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setBg3dOpen?: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setStrokeWidth: import("react").Dispatch<import("react").SetStateAction<number>>;
  setTool: import("react").Dispatch<import("react").SetStateAction<Tool>>;
  setViewTool: import("react").Dispatch<import("react").SetStateAction<"zoom" | "rotate" | null>>;
  dodgeBurnActive: boolean;
  wetMixActive: boolean;
  smudgeActive: boolean;
  tool: Tool;
  uiDensityMode: "simple" | "full" | "focus";
  viewTransformSuppressed: boolean;
  viewTool: "zoom" | "rotate" | null;
  stableHandlers: StudioLeftToolRailHandlers;
}

export const StudioLeftToolRail = memo(function StudioLeftToolRail({
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
  isRailToolVisible,
  liquifyActive,
  mobileImmersive,
  perspectiveRulerActive,
  pixelForceCircle,
  pixelSel,
  pixelTool,
  quickShapeActive,
  railMoreOpen,
  referencePanelOpen,
  mannequinPoserOpen = false,
  poserVrmOpen = false,
  bg3dOpen = false,
  selected,
  selectedImageMutationLocked,
  setAppSettingsInitialTab,
  setAppSettingsOpen,
  setDrawMode,
  setDrawShape,
  setEyedropperActive,
  setMenu,
  setPerspectiveRulerActive,
  setPixelForceCircle,
  setPixelTool,
  setQuickShapeActive,
  setRailMoreOpen,
  setReferencePanelOpen,
  setMannequinPoserOpen,
  setPoserVrmOpen,
  setBg3dOpen,
  setTool,
  setViewTool,
  dodgeBurnActive,
  wetMixActive,
  smudgeActive,
  tool,
  uiDensityMode,
  viewTransformSuppressed,
  viewTool,
  stableHandlers,
}: StudioLeftToolRailProps) {
  const railMoreDialogId = useId();
  const railMoreTriggerId = `${railMoreDialogId}-trigger`;
  const railMoreTitleId = `${railMoreDialogId}-title`;
  const zoomShortcut = appSettings.shortcuts["tool-zoom"];
  const rotateViewShortcut = appSettings.shortcuts["tool-rotate-view"];
  const commentShortcut = appSettings.shortcuts["tool-comment"];
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
  const {
    addBubble,
    addText,
    announceDrawingShortcut,
    clearPolyLassoDraft,
    commitAppSettings,
    disarmAllPixelTools,
    fitCanvasToWidth,
    onPickImage,
    toggleAdvancedFill,
    toggleStudioCommentPinPlacement,
    toggleDodgeBurnTool,
    toggleWetMixTool,
    toggleLiquifyTool,
    togglePixelMarquee,
    toggleSmudgeTool,
    openFrameAnimationForSelected,
    openPixelSelectionTransform,
    openSelectedLayerCrop,
  } = stableHandlers;

  useEffect(() => {
    if (!railMoreOpen) return;
    const dialog = railMoreDialogRef.current;
    const updatePosition = () => {
      const trigger = document.getElementById(railMoreTriggerId);
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setRailMoreOpen(false);
      requestAnimationFrame(() => document.getElementById(railMoreTriggerId)?.focus());
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dialog?.contains(target) || document.getElementById(railMoreTriggerId)?.contains(target)) return;
      setRailMoreOpen(false);
    };
    updatePosition();
    dialog?.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, true);
    globalThis.addEventListener("resize", updatePosition);
    globalThis.addEventListener("scroll", updatePosition, true);
    globalThis.visualViewport?.addEventListener("resize", updatePosition);
    globalThis.visualViewport?.addEventListener("scroll", updatePosition);
    const frame = requestAnimationFrame(() => {
      dialog
        ?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled])')
        ?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      dialog?.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      globalThis.removeEventListener("resize", updatePosition);
      globalThis.removeEventListener("scroll", updatePosition, true);
      globalThis.visualViewport?.removeEventListener("resize", updatePosition);
      globalThis.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [railMoreOpen, railMoreTriggerId, setRailMoreOpen]);

  function closeRailMoreAndRestoreFocus(): void {
    setRailMoreOpen(false);
    requestAnimationFrame(() => document.getElementById(railMoreTriggerId)?.focus());
  }

  const railMoreFooter = (
    <div className="relative" data-studio-tool-rail-settings="true">
      <StudioRailToolButton
        id={railMoreTriggerId}
        icon={Settings2}
        label="더보기 · 툴바 설정"
        description="숨긴 도구를 열거나 애플리케이션 설정에서 툴바·단축키·마우스·터치를 맞춤 설정합니다."
        active={railMoreOpen || appSettingsOpen}
        aria-controls={railMoreOpen ? railMoreDialogId : undefined}
        aria-expanded={railMoreOpen}
        aria-haspopup="dialog"
        onClick={() => {
          if (!railMoreOpen) {
            const rect = document.getElementById(railMoreTriggerId)?.getBoundingClientRect();
            if (rect) {
              setRailMorePosition(measureStudioRailMorePosition(rect));
            }
          }
          setRailMoreOpen((v) => !v);
        }}
      />
      {railMoreOpen && typeof document !== "undefined" ? createPortal((
        <div
          ref={railMoreDialogRef}
          id={railMoreDialogId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={railMoreTitleId}
          tabIndex={-1}
          className="fixed z-[80] max-h-[min(28rem,calc(100dvh-1rem))] w-52 overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-1.5 shadow-2xl [scrollbar-gutter:stable]"
          style={{
            left: railMorePosition.left,
            maxHeight: railMorePosition.maxHeight,
            top: railMorePosition.top,
          }}
        >
          <p id={railMoreTitleId} className="px-2 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-3">
            숨긴 도구
          </p>
          {appSettings.toolbar.visibleIds.length >= DEFAULT_STUDIO_RAIL_TOOL_ORDER.length ? (
            <p className="px-2 py-1.5 text-[0.6875rem] text-fg-3">모두 표시 중</p>
          ) : (
            (
              [
                "select",
                "hand",
                "pen",
                "pixel-pencil",
                "eraser",
                "blend",
                "wet-mix",
                "dodge-burn",
                "liquify",
                "fill",
                "lasso-fill",
                "eyedropper",
                "marquee-rect",
                "marquee-circle",
                "lasso",
                "transform",
                "crop",
                "smart-shape",
                "shape-rect",
                "shape-ellipse",
                "text",
                "bubble",
                "image",
                "comment",
                "perspective",
                "zoom",
                "zoom-fit",
                "rotate-view",
                "frame-anim",
                "mannequin3d",
                "vrm3d",
                "bg3d",
                "reference",
              ] as StudioRailToolId[]
            )
              .filter((id) => !isRailToolVisible(id))
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  className="flex min-h-11 w-full items-center rounded-lg px-2 py-2 text-left text-xs text-fg hover:bg-raised sm:min-h-9 sm:py-1.5 pointer-coarse:min-h-11 pointer-coarse:py-2"
                  onClick={() => {
                    commitAppSettings({
                      ...appSettings,
                      toolbar: {
                        visibleIds: [...appSettings.toolbar.visibleIds, id],
                      },
                    });
                    closeRailMoreAndRestoreFocus();
                  }}
                >
                  {studioRailToolLabel(id)}
                </button>
              ))
          )}
          <button
            type="button"
            className="mt-1 flex min-h-11 w-full items-center gap-1 rounded-lg border border-line px-2 py-2 text-left text-xs font-medium text-accent hover:bg-accent-soft sm:min-h-9 sm:py-1.5 pointer-coarse:min-h-11 pointer-coarse:py-2"
            onClick={() => {
              document.getElementById(railMoreTriggerId)?.focus({ preventScroll: true });
              setRailMoreOpen(false);
              setAppSettingsInitialTab("toolbar");
              setAppSettingsOpen(true);
            }}
          >
            <Settings2 className="size-3.5" aria-hidden />
            애플리케이션 설정
          </button>
        </div>
      ), document.body) : null}
    </div>
  );

  return (
    <>
        {studioUiDensityAllows(uiDensityMode, "tool-rail") && !canvasOnlyMode ? (
          <StudioVerticalToolRail
            className={cn(mobileImmersive && "hidden")}
            footer={railMoreFooter}
          >
            {isRailToolVisible("select") ? (
            <StudioRailToolButton
              icon={MousePointer2}
              label="선택 (V)"
              description="캔버스 위 요소를 클릭·드래그로 고르고 옮기거나 크기를 바꿉니다. 여러 개를 드래그해 함께 선택할 수 있어요."
              active={tool === "select" && !selectionSubtoolActive}
              onClick={() => {
                disarmAllPixelTools();
                setTool("select");
                setEyedropperActive(false);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("hand") ? (
            <StudioRailToolButton
              icon={Hand}
              label="핸드 (팬)"
              description="캔버스를 드래그해 이동합니다. Space 키와 같은 역할입니다."
              active={tool === "hand"}
              onClick={() => {
                disarmAllPixelTools();
                setTool((t) => (t === "hand" ? "select" : "hand"));
                setEyedropperActive(false);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("marquee-rect") ? (
            <StudioRailToolButton
              icon={SquareDashedMousePointer}
              label="사각 선택 (M)"
              description="이미지 픽셀을 사각형으로 선택합니다. Shift=정사각, Alt=중심 확장."
              active={pixelTool === "rect" && !pixelForceCircle}
              disabled={activeSurfaceReviewLocked || (selected?.type === "image" && selectedImageMutationLocked)}
              unavailableReason={
                activeSurfaceReviewLocked
                  ? REVIEW_LOCK_REASON
                  : selected?.type === "image" && selectedImageMutationLocked
                    ? IMAGE_EDIT_LOCK_REASON
                    : undefined
              }
              onClick={() => togglePixelMarquee("rect")}
            />
            ) : null}
            {isRailToolVisible("marquee-circle") ? (
            <StudioRailToolButton
              icon={CircleDashed}
              label="원형 선택"
              description="이미지 픽셀을 정원으로 선택합니다. Alt=중심 확장."
              active={pixelTool === "ellipse" && pixelForceCircle}
              disabled={activeSurfaceReviewLocked || (selected?.type === "image" && selectedImageMutationLocked)}
              unavailableReason={
                activeSurfaceReviewLocked
                  ? REVIEW_LOCK_REASON
                  : selected?.type === "image" && selectedImageMutationLocked
                    ? IMAGE_EDIT_LOCK_REASON
                    : undefined
              }
              onClick={() => togglePixelMarquee("circle")}
            />
            ) : null}
            {isRailToolVisible("transform") ? (
            <StudioRailToolButton
              icon={Maximize2}
              label="변형 (⇧T)"
              description="픽셀 선택이 있으면 속성→리터치에서 내용 변형(스케일·회전·뒤집기)을 적용합니다."
              active={false}
              disabled={!pixelToolTargetAvailable || !isSelectionUsable(pixelSel)}
              unavailableReason={
                selected?.type !== "image"
                  ? "변형할 이미지 레이어를 먼저 고르세요."
                  : selectedImageMutationLocked
                    ? IMAGE_EDIT_LOCK_REASON
                    : !isSelectionUsable(pixelSel)
                      ? "이미지 안에서 변형할 픽셀 영역을 먼저 선택하세요."
                      : undefined
              }
              onClick={openPixelSelectionTransform}
            />
            ) : null}
            {isRailToolVisible("crop") ? (
            <StudioRailToolButton
              icon={Crop}
              label="자르기 (C)"
              description={rasterRetouchDescription(
                "가장자리와 모서리를 끌어 필요한 영역만 남깁니다. 적용 전까지 원본은 바뀌지 않아요."
              )}
              active={cropActive}
              disabled={!cropActive && !rasterRetouchCanStart}
              unavailableReason={rasterRetouchUnavailableReason(cropActive)}
              onClick={openSelectedLayerCrop}
            />
            ) : null}
            {isRailToolVisible("pen") ? (
            <StudioRailToolButton
              icon={Pencil}
              label="펜 (B)"
              description="자유선으로 그립니다. 필압·보정·브러시 프리셋은 하단 옵션 도크와 브러시 스튜디오에서 조절해요."
              active={tool === "draw" && drawMode === "pen" && !drawToolTemporarilyOverridden}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              grouped
              onClick={() => {
                disarmAllPixelTools();
                setTool("draw");
                setDrawMode("pen");
                setEyedropperActive(false);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("pixel-pencil") ? (
            <StudioRailToolButton
              icon={Grid3X3}
              label="픽셀 펜 (P)"
              description="1px 하드 픽셀 펜으로 그립니다. 안티앨리어스·필압 없이 또렷한 선을 남깁니다."
              active={tool === "draw" && drawMode === "pixel" && !drawToolTemporarilyOverridden}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              onClick={() => {
                disarmAllPixelTools();
                setTool("draw");
                setDrawMode("pixel");
                setEyedropperActive(false);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("eraser") ? (
            <StudioRailToolButton
              icon={Eraser}
              label="지우개 (E)"
              description="현재 레이어/획 위를 지웁니다. 굵기는 펜과 같은 크기 칩으로 맞출 수 있어요."
              active={tool === "draw" && drawMode === "eraser" && !drawToolTemporarilyOverridden}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              onClick={() => {
                disarmAllPixelTools();
                setTool("draw");
                setDrawMode("eraser");
                setEyedropperActive(false);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("blend") ? (
            <StudioRailToolButton
              icon={Wind}
              label="혼합 (스머지) (N)"
              description={rasterRetouchDescription("이미지 픽셀을 문질러 색을 섞습니다.")}
              active={smudgeActive}
              disabled={!smudgeActive && !rasterRetouchCanStart}
              unavailableReason={rasterRetouchUnavailableReason(smudgeActive)}
              onClick={toggleSmudgeTool}
            />
            ) : null}
            {isRailToolVisible("wet-mix") ? (
            <StudioRailToolButton
              icon={Droplets}
              label="혼색 브러시 (Shift+N)"
              description={rasterRetouchDescription(
                "바닥색을 묻혀 섞어가며 안료를 얹는 CSP식 색혼합 브러시입니다."
              )}
              active={wetMixActive}
              disabled={!wetMixActive && !rasterRetouchCanStart}
              unavailableReason={rasterRetouchUnavailableReason(wetMixActive)}
              onClick={toggleWetMixTool}
            />
            ) : null}
            {isRailToolVisible("dodge-burn") ? (
            <StudioRailToolButton
              icon={Sun}
              label="닷지/번 (O)"
              description={rasterRetouchDescription(
                "어둡거나 밝은 영역을 브러시로 밝히거나 태우고, 스펀지로 채도를 조절합니다."
              )}
              active={dodgeBurnActive}
              disabled={!dodgeBurnActive && !rasterRetouchCanStart}
              unavailableReason={rasterRetouchUnavailableReason(dodgeBurnActive)}
              onClick={toggleDodgeBurnTool}
            />
            ) : null}
            {isRailToolVisible("liquify") ? (
            <StudioRailToolButton
              icon={Move}
              label="리퀴파이 (J)"
              description={rasterRetouchDescription("이미지 위를 밀어 국소 왜곡합니다.")}
              active={liquifyActive}
              disabled={!liquifyActive && !rasterRetouchCanStart}
              unavailableReason={rasterRetouchUnavailableReason(liquifyActive)}
              onClick={toggleLiquifyTool}
            />
            ) : null}
            {isRailToolVisible("fill") ? (
            <StudioRailToolButton
              icon={PaintBucket}
              label="채우기 (G)"
              description={advancedFillUnsupportedReason
                ? `선 안을 탭해 색을 채웁니다. ${advancedFillUnsupportedReason} 눌러서 안전한 단일 래스터 후보를 찾거나 필요한 조건을 확인하세요.`
                : "선 안을 탭해 색을 채웁니다. 경계 인식과 참조 레이어 설정은 속성 패널에서 조정해요."}
              active={advancedFillActive}
              onClick={toggleAdvancedFill}
            />
            ) : null}
            {isRailToolVisible("eyedropper") ? (
            <StudioRailToolButton
              icon={Pipette}
              label="스포이드 (I / Alt+클릭)"
              description="캔버스 색을 샘플링해 주 색으로 가져옵니다. 펜으로 그리는 중엔 Alt+클릭으로도 동작해요."
              active={eyedropperActive}
              onClick={() => {
                const next = !eyedropperActive;
                if (next) disarmAllPixelTools();
                setEyedropperActive(next);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("lasso-fill") ? (
            <StudioRailToolButton
              icon={Paintbrush}
              label="라쏘 필"
              description="닫힌 궤적을 그려 현재 색으로 채웁니다."
              active={tool === "draw" && drawMode === "lasso-fill"}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              onClick={() => {
                disarmAllPixelTools();
                setTool("draw");
                setDrawMode("lasso-fill");
                setEyedropperActive(false);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("lasso") ? (
            <StudioRailToolButton
              icon={Lasso}
              label={
                pixelTool === "lasso"
                    ? "자유 올가미 · 다시 누르면 다각형 올가미"
                    : pixelTool === "poly-lasso"
                      ? "다각형 올가미 · 다시 누르면 끄기"
                      : "올가미 선택"
              }
              description={
                pixelTool === "lasso"
                  ? "다시 누르면 클릭한 꼭짓점을 연결하는 다각형 올가미로 전환합니다."
                  : pixelTool === "poly-lasso"
                    ? "다시 누르면 다각형 올가미와 작성 중인 꼭짓점을 지우고 선택 도구를 끕니다."
                    : "다음 클릭부터 드래그한 자유 곡선 안쪽의 이미지 픽셀을 선택합니다."
              }
              {...lassoToolHintProps}
              active={(pixelTool === "lasso" || pixelTool === "poly-lasso") && !pixelForceCircle}
              disabled={activeSurfaceReviewLocked || (selected?.type === "image" && selectedImageMutationLocked)}
              unavailableReason={
                activeSurfaceReviewLocked
                  ? REVIEW_LOCK_REASON
                  : selected?.type === "image" && selectedImageMutationLocked
                    ? IMAGE_EDIT_LOCK_REASON
                    : undefined
              }
              onClick={() => {
                if (activeSurfaceReviewLocked || (selected?.type === "image" && selectedImageMutationLocked)) return;
                setTool("select");
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
              }}
            />
            ) : null}
            {isRailToolVisible("comment") ? (
            <StudioRailToolButton
              icon={MessageSquare}
              label={commentPinArmed
                ? "댓글 핀 배치 취소"
                : formattedCommentShortcut
                  ? `댓글 핀 배치 (${formattedCommentShortcut})`
                  : "댓글 핀 배치"}
              description={commentPinArmed
                ? "댓글 핀 배치를 취소하고 이전 편집 도구로 돌아갑니다."
                : `캔버스의 정확한 위치를 클릭해 댓글을 남깁니다. ${formattedCommentShortcut ? `${formattedCommentShortcut}로 바로 시작하고, ` : ""}⇧·C로 핀을 숨길 수 있어요.`}
              aria-keyshortcuts={commentShortcut || undefined}
              hintPreview={commentPinArmed ? "dismiss" : "comment"}
              active={commentPinArmed}
              onClick={toggleStudioCommentPinPlacement}
            />
            ) : null}
            {isRailToolVisible("perspective") ? (
            <StudioRailToolButton
              icon={Triangle}
              label="투시도"
              description="소실점 가이드로 원근을 맞춥니다."
              active={perspectiveRulerActive}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              onClick={() => {
                const next = !perspectiveRulerActive;
                setPerspectiveRulerActive(next);
                if (next) {
                  disarmAllPixelTools();
                  setTool("draw");
                  setDrawMode("pen");
                  setEyedropperActive(false);
                  announceDrawingShortcut("투시도 켜짐 · 소실점 방향으로 펜 선을 맞춰요");
                } else {
                  announceDrawingShortcut("투시도 꺼짐");
                }
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("zoom-fit") ? (
            <StudioRailToolButton
              icon={ScanLine}
              label="너비에 맞춤 (Home)"
              description="캔버스 폭에 맞춰 확대·축소합니다."
              hintPreview="zoom-view"
              hintPreviewVariant="fit-width"
              disabled={viewTransformSuppressed}
              unavailableReason={viewTransformSuppressed ? "내보내기·저장이 끝난 뒤 보기를 조절하세요." : undefined}
              onClick={fitCanvasToWidth}
            />
            ) : null}
            {isRailToolVisible("zoom") ? (
            <StudioRailToolButton
              icon={Search}
              label={zoomViewToolLabel}
              description={zoomViewToolOpen
                ? "현재 확대·축소 HUD를 닫고 적용한 보기 배율은 그대로 유지합니다."
                : "확대·축소 HUD를 열어 배율·화면 맞춤·100% 보기를 빠르게 조절합니다."}
              {...zoomViewToolHintProps}
              active={zoomViewToolOpen}
              disabled={viewTransformSuppressed}
              unavailableReason={viewTransformSuppressed ? "내보내기·저장이 끝난 뒤 보기를 조절하세요." : undefined}
              aria-expanded={zoomViewToolOpen}
              aria-controls="studio-view-tools-hud-zoom"
              data-studio-view-tool-trigger="zoom"
              onClick={() => setViewTool((current) => current === "zoom" ? null : "zoom")}
            />
            ) : null}
            {isRailToolVisible("rotate-view") ? (
            <StudioRailToolButton
              icon={RotateCw}
              label={rotateViewToolLabel}
              description={rotateViewToolOpen
                ? "현재 회전 HUD를 닫고 적용한 보기 회전·반전 상태는 그대로 유지합니다."
                : "회전 HUD를 열어 캔버스를 좌·우 90°로 돌리거나 수평 반전합니다. 문서와 내보내기는 바뀌지 않아요."}
              {...rotateViewToolHintProps}
              active={rotateViewToolOpen}
              disabled={viewTransformSuppressed}
              unavailableReason={viewTransformSuppressed ? "내보내기·저장이 끝난 뒤 보기를 조절하세요." : undefined}
              aria-expanded={rotateViewToolOpen}
              aria-controls="studio-view-tools-hud-rotate"
              data-studio-view-tool-trigger="rotate"
              onClick={() => setViewTool((current) => current === "rotate" ? null : "rotate")}
            />
            ) : null}
            {isRailToolVisible("smart-shape") ? (
            <StudioRailToolButton
              icon={Shapes}
              label={quickShapeActive ? "스마트 도형 끄기" : "스마트 도형 켜기"}
              description={quickShapeActive
                ? "자동 도형 보정을 끄고 입력한 획을 그대로 유지합니다."
                : "낙서를 잠시 멈추면 선·원·사각형 등 깔끔한 도형으로 자동 다듬어요."}
              hintPreview="smart-shape"
              hintPreviewVariant={quickShapeActive ? "disable" : "enable"}
              active={quickShapeActive}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              accented
              onClick={() => {
                const next = !quickShapeActive;
                if (next) {
                  disarmAllPixelTools();
                  setTool("draw");
                  setDrawMode("pen");
                  setEyedropperActive(false);
                  announceDrawingShortcut("스마트 도형 켜짐 · 그려서 손을 떼면 다듬어요");
                } else {
                  announceDrawingShortcut("스마트 도형 꺼짐");
                }
                setQuickShapeActive(next);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("shape-rect") ? (
            <StudioRailToolButton
              icon={Square}
              label="사각형 도형"
              description="드래그로 사각형을 그립니다. Shift를 누르면 정사각형으로 맞출 수 있어요."
              active={tool === "draw" && drawMode === "shape" && drawShape === "rect"}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              onClick={() => {
                disarmAllPixelTools();
                setTool("draw");
                setDrawMode("shape");
                setDrawShape("rect");
                setEyedropperActive(false);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("shape-ellipse") ? (
            <StudioRailToolButton
              icon={Circle}
              label="타원 도형"
              description="드래그로 타원을 그립니다. Shift를 누르면 정원으로 맞출 수 있어요."
              active={tool === "draw" && drawMode === "shape" && drawShape === "ellipse"}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              onClick={() => {
                disarmAllPixelTools();
                setTool("draw");
                setDrawMode("shape");
                setDrawShape("ellipse");
                setEyedropperActive(false);
                setMenu(null);
              }}
            />
            ) : null}
            <StudioRailDivider />
            {isRailToolVisible("text") ? (
            <StudioRailToolButton
              icon={TypeIcon}
              label="텍스트 추가"
              description="캔버스에 글자 상자를 추가합니다. 폰트·정렬·효과는 우측 속성에서 편집해요."
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              onClick={() => {
                addText(undefined, true);
              }}
            />
            ) : null}
            {isRailToolVisible("bubble") ? (
            <StudioRailToolButton
              icon={MessageCircle}
              label="말풍선 추가"
              description="만화 말풍선을 넣습니다. 꼬리 위치·스타일 프리셋은 말풍선 패널에서 바꿀 수 있어요."
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              onClick={() => {
                addBubble("speech", undefined, true);
              }}
            />
            ) : null}
            {isRailToolVisible("image") ? (
            <StudioToolHintTarget
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? REVIEW_LOCK_REASON : undefined}
              hint={{
                id: "image",
                title: "이미지 추가",
                description: "파일에서 그림을 불러와 캔버스에 배치합니다. 이후 비파괴 필터·블러·픽셀 선택을 적용할 수 있어요.",
                preview: "image",
                tip: "클립보드의 이미지는 ⌘V 또는 Ctrl+V로 바로 붙여넣을 수도 있어요.",
              }}
            >
              <label
                aria-disabled={activeSurfaceReviewLocked}
                className={cn(
                  "relative grid size-10 place-items-center rounded-2xl border border-transparent text-fg-2 xl:size-11",
                  activeSurfaceReviewLocked
                    ? "cursor-not-allowed opacity-35"
                    : "cursor-pointer hover:border-line hover:bg-raised hover:text-fg"
                )}
              >
                <ImagePlus size={16} strokeWidth={1.75} aria-hidden />
                <span className="sr-only">이미지 추가</span>
                <input
                  type="file"
                  accept={STUDIO_CANVAS_IMAGE_ACCEPT}
                  className={cn(
                    "absolute inset-0 opacity-0",
                    activeSurfaceReviewLocked ? "cursor-not-allowed" : "cursor-pointer"
                  )}
                  onChange={onPickImage}
                  aria-label="이미지 추가"
                  disabled={activeSurfaceReviewLocked}
                />
              </label>
            </StudioToolHintTarget>
            ) : null}
            <StudioRailDivider />
            {isRailToolVisible("frame-anim") ? (
            <StudioRailToolButton
              icon={Film}
              label="프레임 애니메이션"
              description="선택한 이미지에 여러 프레임을 쌓아 간단한 셀 애니메이션을 만듭니다."
              active={frameAnimOpen && frameAnimTargetId === selected?.id}
              disabled={!pixelToolTargetAvailable}
              unavailableReason={
                selected?.type !== "image"
                  ? "애니메이션으로 편집할 이미지 레이어를 먼저 선택하세요."
                  : selectedImageMutationLocked
                    ? IMAGE_EDIT_LOCK_REASON
                    : undefined
              }
              onClick={openFrameAnimationForSelected}
            />
            ) : null}
            {isRailToolVisible("mannequin3d") ? (
            <StudioRailToolButton
              icon={PersonStanding}
              label="3D 데생 인형"
              description="모델 파일 없이 체형을 조절하고 포즈를 잡아 드로잉 참고 이미지로 캡처합니다."
              active={mannequinPoserOpen}
              accented
              onClick={() => setMannequinPoserOpen?.((v) => !v)}
            />
            ) : null}
            {isRailToolVisible("vrm3d") ? (
            <StudioRailToolButton
              icon={UsersRound}
              label="3D 캐릭터"
              description="베이스 캐릭터를 고른 뒤 포즈, 표정, 의상과 색상을 조정해 투명 배경 이미지로 추가합니다."
              active={poserVrmOpen}
              accented
              onClick={() => setPoserVrmOpen?.((v) => !v)}
            />
            ) : null}
            {isRailToolVisible("bg3d") ? (
            <StudioRailToolButton
              icon={Boxes}
              label="3D 배경"
              description="3D 오브젝트와 씬을 배치하고 카메라 앵글을 조절해 웹툰 배경 이미지를 추출합니다."
              active={bg3dOpen}
              accented
              onClick={() => setBg3dOpen?.((v) => !v)}
            />
            ) : null}
            {studioUiDensityAllows(uiDensityMode, "toolbar-reference") && isRailToolVisible("reference") ? (
              <StudioRailToolButton
                icon={PictureInPicture2}
                label="참고 이미지"
                description="캔버스와 분리된 참고 이미지를 띄워 구도·색·의상을 보면서 작업합니다. 완성 원고에는 포함되지 않아요."
                active={referencePanelOpen}
                accented
                onClick={() => {
                  preloadStudioReferencePanel();
                  setReferencePanelOpen((v) => !v);
                }}
                onMouseEnter={preloadStudioReferencePanel}
                onFocus={preloadStudioReferencePanel}
              />
            ) : null}
          </StudioVerticalToolRail>
        ) : null}
    </>
  );
});
