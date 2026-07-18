import {
  Circle,
  Crop,
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
  PenTool,
  Pencil,
  PictureInPicture2,
  Pipette,
  RotateCw,
  ScanLine,
  Search,
  Settings2,
  Shapes,
  Square,
  Triangle,
  Type as TypeIcon,
  Wind,
} from "lucide-react";
import { memo } from "react";

import {
  DEFAULT_STUDIO_RAIL_TOOL_ORDER,
  studioRailToolLabel,
  type StudioAppSettings,
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
import { preloadStudioReferencePanel } from "./studio-page-lazy-ui";
import {
  isSelectionUsable,
  type PixelSelection,
  type SelectionToolKind,
} from "./studio-selection-tools";
import { studioUiDensityAllows } from "./studio-ui-density";
import { StudioToolHintTarget } from "./StudioToolHint";

import { cn } from "@/lib/utils";

export interface StudioLeftToolRailHandlers {
  fitCanvasToWidth: () => void;
  openFrameAnimationForSelected: () => void;
  openPixelSelectionTransform: () => void;
  openSelectedLayerCrop: () => void;
  addBubble: (variant: BubbleVariant, at?: { x: number; y: number; }) => void;
  addText: (at?: { x: number; y: number; }) => void;
  announceDrawingShortcut: (message: string) => void;
  clearPolyLassoDraft: () => void;
  commitAppSettings: (next: StudioAppSettings) => void;
  disarmAllPixelTools: () => void;
  onPickImage: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  toggleAdvancedFill: () => void;
  toggleLiquifyTool: () => void;
  togglePixelMarquee: (kind: "rect" | "circle") => void;
  toggleSmudgeTool: () => void;
  toggleStudioCommentPinPlacement: () => void;
}

interface StudioLeftToolRailProps {
  activeSurfaceReviewLocked: boolean;
  advancedFillActive: boolean;
  advancedFillUnsupportedReason: string | null;
  appSettings: StudioAppSettings;
  appSettingsOpen: boolean;
  canvasOnlyMode: boolean;
  commentsOpen: boolean;
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
  selected: El | null;
  selectedContentMutationLocked: boolean;
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
  setStrokeWidth: import("react").Dispatch<import("react").SetStateAction<number>>;
  setTool: import("react").Dispatch<import("react").SetStateAction<Tool>>;
  setViewTool: import("react").Dispatch<import("react").SetStateAction<"zoom" | "rotate" | null>>;
  smudgeActive: boolean;
  tool: Tool;
  uiDensityMode: "simple" | "full" | "focus";
  viewTransformSuppressed: boolean;
  viewTool: "zoom" | "rotate" | null;
  stableHandlers: StudioLeftToolRailHandlers;
}

export const StudioLeftToolRail = memo(function StudioLeftToolRail({
  activeSurfaceReviewLocked,
  advancedFillActive,
  advancedFillUnsupportedReason,
  appSettings,
  appSettingsOpen,
  canvasOnlyMode,
  commentsOpen,
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
  selected,
  selectedContentMutationLocked,
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
  setStrokeWidth,
  setTool,
  setViewTool,
  smudgeActive,
  tool,
  uiDensityMode,
  viewTransformSuppressed,
  viewTool,
  stableHandlers,
}: StudioLeftToolRailProps) {
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
    toggleLiquifyTool,
    togglePixelMarquee,
    toggleSmudgeTool,
    openFrameAnimationForSelected,
    openPixelSelectionTransform,
    openSelectedLayerCrop,
  } = stableHandlers;
  return (
    <>
        {studioUiDensityAllows(uiDensityMode, "tool-rail") && !canvasOnlyMode ? (
          <StudioVerticalToolRail className={cn(mobileImmersive && "hidden")}>
            {isRailToolVisible("select") ? (
            <StudioRailToolButton
              icon={MousePointer2}
              label="선택 (V)"
              description="캔버스 위 요소를 클릭·드래그로 고르고 옮기거나 크기를 바꿉니다. 여러 개를 드래그해 함께 선택할 수 있어요."
              active={tool === "select" && !advancedFillActive && !eyedropperActive}
              onClick={() => {
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
                setTool((t) => (t === "hand" ? "select" : "hand"));
                setEyedropperActive(false);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("marquee-rect") ? (
            <StudioRailToolButton
              icon={Square}
              label="사각 선택 (M)"
              description="이미지 픽셀을 사각형으로 선택합니다. Shift=정사각, Alt=중심 확장."
              active={pixelTool === "rect" && !pixelForceCircle}
              disabled={selected?.type !== "image" || selectedContentMutationLocked}
              unavailableReason={
                selected?.type !== "image"
                  ? "픽셀을 선택할 이미지 레이어를 먼저 고르세요."
                  : selectedContentMutationLocked
                    ? "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요."
                    : undefined
              }
              onClick={() => togglePixelMarquee("rect")}
            />
            ) : null}
            {isRailToolVisible("marquee-circle") ? (
            <StudioRailToolButton
              icon={Circle}
              label="원형 선택"
              description="이미지 픽셀을 정원으로 선택합니다. Alt=중심 확장."
              active={pixelTool === "ellipse" && pixelForceCircle}
              disabled={selected?.type !== "image" || selectedContentMutationLocked}
              unavailableReason={
                selected?.type !== "image"
                  ? "픽셀을 선택할 이미지 레이어를 먼저 고르세요."
                  : selectedContentMutationLocked
                    ? "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요."
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
              disabled={selected?.type !== "image" || !isSelectionUsable(pixelSel)}
              unavailableReason={
                selected?.type !== "image"
                  ? "변형할 이미지 레이어를 먼저 고르세요."
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
              description="선택한 이미지의 가장자리와 모서리를 끌어 필요한 영역만 남깁니다. 적용 전까지 원본은 바뀌지 않아요."
              active={cropActive}
              disabled={selected?.type !== "image" || selectedContentMutationLocked}
              unavailableReason={
                selected?.type !== "image"
                  ? "자를 이미지 레이어를 먼저 고르세요."
                  : selectedContentMutationLocked
                    ? "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요."
                    : undefined
              }
              onClick={openSelectedLayerCrop}
            />
            ) : null}
            {isRailToolVisible("pen") ? (
            <StudioRailToolButton
              icon={Pencil}
              label="펜 (B)"
              description="자유선으로 그립니다. 필압·보정·브러시 프리셋은 하단 옵션 도크와 브러시 스튜디오에서 조절해요."
              active={tool === "draw" && drawMode === "pen"}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? "현재 작업면의 검토 잠금을 먼저 해제하세요." : undefined}
              grouped
              onClick={() => {
                setTool("draw");
                setDrawMode("pen");
                setEyedropperActive(false);
                setMenu(null);
              }}
            />
            ) : null}
            {isRailToolVisible("pixel-pencil") ? (
            <StudioRailToolButton
              icon={PenTool}
              label="픽셀 펜 (P)"
              description="1px 하드 픽셀 펜으로 그립니다. 안티앨리어스·필압 없이 또렷한 선을 남깁니다."
              active={tool === "draw" && drawMode === "pixel"}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? "현재 작업면의 검토 잠금을 먼저 해제하세요." : undefined}
              onClick={() => {
                setTool("draw");
                setDrawMode("pixel");
                setStrokeWidth(1);
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
              active={tool === "draw" && drawMode === "eraser"}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? "현재 작업면의 검토 잠금을 먼저 해제하세요." : undefined}
              onClick={() => {
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
              description="이미지 픽셀을 문질러 색을 섞습니다."
              active={smudgeActive}
              disabled={selected?.type !== "image" || selectedContentMutationLocked}
              unavailableReason={
                selected?.type !== "image"
                  ? "색을 섞을 이미지 레이어를 먼저 고르세요."
                  : selectedContentMutationLocked
                    ? "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요."
                    : undefined
              }
              onClick={toggleSmudgeTool}
            />
            ) : null}
            {isRailToolVisible("liquify") ? (
            <StudioRailToolButton
              icon={Move}
              label="리퀴파이 (J)"
              description="이미지 위를 밀어 국소 왜곡합니다."
              active={liquifyActive}
              disabled={selected?.type !== "image" || selectedContentMutationLocked}
              unavailableReason={
                selected?.type !== "image"
                  ? "왜곡할 이미지 레이어를 먼저 고르세요."
                  : selectedContentMutationLocked
                    ? "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요."
                    : undefined
              }
              onClick={toggleLiquifyTool}
            />
            ) : null}
            {isRailToolVisible("fill") ? (
            <StudioRailToolButton
              icon={PaintBucket}
              label="채우기 (G)"
              description="선 안을 탭해 색을 채웁니다. 경계 인식과 참조 레이어 설정은 속성 패널에서 조정해요."
              active={advancedFillActive}
              disabled={!advancedFillActive && advancedFillUnsupportedReason !== null}
              unavailableReason={advancedFillUnsupportedReason ?? undefined}
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
                setEyedropperActive((v) => !v);
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
              unavailableReason={activeSurfaceReviewLocked ? "현재 작업면의 검토 잠금을 먼저 해제하세요." : undefined}
              onClick={() => {
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
                    ? "자유 올가미 끄기"
                    : pixelTool === "poly-lasso"
                      ? "다각형 올가미 사용 중 · 다시 누르면 자유 올가미"
                      : "올가미 선택"
              }
              description="이미지 픽셀을 자유 올가미(드래그) 또는 다각형 올가미(클릭)로 선택합니다."
              active={(pixelTool === "lasso" || pixelTool === "poly-lasso") && !pixelForceCircle}
              disabled={selected?.type !== "image" || selectedContentMutationLocked}
              unavailableReason={
                selected?.type !== "image"
                  ? "픽셀을 고를 이미지 레이어를 먼저 선택하세요."
                  : selectedContentMutationLocked
                    ? "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요."
                    : undefined
              }
              onClick={() => {
                if (selected?.type !== "image" || selectedContentMutationLocked) return;
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
              label={commentPinArmed ? "댓글 핀 배치 취소" : "댓글 핀 배치"}
              description="캔버스의 정확한 위치를 클릭해 댓글을 남깁니다. 댓글 검토함은 상단 댓글 버튼에서 열 수 있어요."
              active={commentsOpen || commentPinArmed}
              onClick={toggleStudioCommentPinPlacement}
            />
            ) : null}
            {isRailToolVisible("perspective") ? (
            <StudioRailToolButton
              icon={Triangle}
              label="투시도"
              description="소실점 가이드로 원근을 맞춥니다."
              active={perspectiveRulerActive}
              onClick={() => {
                setPerspectiveRulerActive((v) => !v);
                setTool("draw");
              }}
            />
            ) : null}
            {isRailToolVisible("zoom-fit") ? (
            <StudioRailToolButton
              icon={ScanLine}
              label="화면 맞춤"
              description="캔버스 폭에 맞춰 확대·축소합니다."
              disabled={viewTransformSuppressed}
              unavailableReason={viewTransformSuppressed ? "내보내기·저장이 끝난 뒤 보기를 조절하세요." : undefined}
              onClick={fitCanvasToWidth}
            />
            ) : null}
            {isRailToolVisible("zoom") ? (
            <StudioRailToolButton
              icon={Search}
              label="보기 확대·축소 (Z)"
              description="확대·축소 HUD를 열어 배율·화면 맞춤·100% 보기를 빠르게 조절합니다."
              active={viewTool === "zoom"}
              disabled={viewTransformSuppressed}
              unavailableReason={viewTransformSuppressed ? "내보내기·저장이 끝난 뒤 보기를 조절하세요." : undefined}
              aria-expanded={viewTool === "zoom"}
              aria-controls="studio-view-tools-hud-zoom"
              data-studio-view-tool-trigger="zoom"
              onClick={() => setViewTool((current) => current === "zoom" ? null : "zoom")}
            />
            ) : null}
            {isRailToolVisible("rotate-view") ? (
            <StudioRailToolButton
              icon={RotateCw}
              label="보기 회전 (R)"
              description="회전 HUD를 열어 캔버스를 좌·우 90°로 돌리거나 수평 반전합니다. 문서와 내보내기는 바뀌지 않아요."
              active={viewTool === "rotate"}
              disabled={viewTransformSuppressed}
              unavailableReason={viewTransformSuppressed ? "내보내기·저장이 끝난 뒤 보기를 조절하세요." : undefined}
              aria-expanded={viewTool === "rotate"}
              aria-controls="studio-view-tools-hud-rotate"
              data-studio-view-tool-trigger="rotate"
              onClick={() => setViewTool((current) => current === "rotate" ? null : "rotate")}
            />
            ) : null}
            {isRailToolVisible("smart-shape") ? (
            <StudioRailToolButton
              icon={Shapes}
              label="스마트 도형"
              description="낙서를 잠시 멈추면 선·원·사각형 등 깔끔한 도형으로 자동 다듬어요."
              active={quickShapeActive}
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
              onClick={() => {
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
              onClick={() => {
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
              onClick={() => {
                addText();
              }}
            />
            ) : null}
            {isRailToolVisible("bubble") ? (
            <StudioRailToolButton
              icon={MessageCircle}
              label="말풍선 추가"
              description="만화 말풍선을 넣습니다. 꼬리 위치·스타일 프리셋은 말풍선 패널에서 바꿀 수 있어요."
              onClick={() => {
                addBubble("speech");
              }}
            />
            ) : null}
            {isRailToolVisible("image") ? (
            <StudioToolHintTarget
              hint={{
                id: "image",
                title: "이미지 추가",
                description: "파일에서 그림을 불러와 캔버스에 배치합니다. 이후 비파괴 필터·블러·픽셀 선택을 적용할 수 있어요.",
                preview: "image",
                tip: "클립보드의 이미지는 ⌘V 또는 Ctrl+V로 바로 붙여넣을 수도 있어요.",
              }}
            >
              <label className="relative grid size-9 cursor-pointer place-items-center rounded-md border border-transparent text-fg-2 hover:border-line hover:bg-raised hover:text-fg">
                <ImagePlus size={16} strokeWidth={1.75} aria-hidden />
                <span className="sr-only">이미지 추가</span>
                <input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={onPickImage}
                  aria-label="이미지 추가"
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
              disabled={selected?.type !== "image"}
              unavailableReason={selected?.type !== "image" ? "애니메이션으로 편집할 이미지 레이어를 먼저 선택하세요." : undefined}
              onClick={openFrameAnimationForSelected}
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
            {/* More tools — hidden rail tools + Application Settings */}
            <div className="relative">
              <StudioRailToolButton
                icon={Settings2}
                label="더보기 · 툴바 설정"
                description="숨긴 도구를 열거나 애플리케이션 설정에서 툴바·단축키·마우스·터치를 맞춤 설정합니다."
                active={railMoreOpen || appSettingsOpen}
                onClick={() => setRailMoreOpen((v) => !v)}
              />
              {railMoreOpen ? (
                <div className="absolute left-full top-0 z-[80] ml-1 w-48 rounded-xl border border-line bg-panel p-1.5 shadow-2xl">
                  <p className="px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-wider text-fg-3">
                    숨긴 도구
                  </p>
                  {appSettings.toolbar.visibleIds.length >= DEFAULT_STUDIO_RAIL_TOOL_ORDER.length ? (
                    <p className="px-2 py-1.5 text-[0.68rem] text-fg-3">모두 표시 중</p>
                  ) : (
                    (
                      [
                        "select",
                        "hand",
                        "pen",
                        "pixel-pencil",
                        "eraser",
                        "blend",
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
                        "reference",
                      ] as StudioRailToolId[]
                    )
                      .filter((id) => !isRailToolVisible(id))
                      .map((id) => (
                        <button
                          key={id}
                          type="button"
                          className="flex w-full rounded-lg px-2 py-1.5 text-left text-xs text-fg hover:bg-raised"
                          onClick={() => {
                            commitAppSettings({
                              ...appSettings,
                              toolbar: {
                                visibleIds: [...appSettings.toolbar.visibleIds, id],
                              },
                            });
                            setRailMoreOpen(false);
                          }}
                        >
                          {studioRailToolLabel(id)}
                        </button>
                      ))
                  )}
                  <button
                    type="button"
                    className="mt-1 flex w-full items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-left text-xs font-medium text-accent hover:bg-accent-soft"
                    onClick={() => {
                      setRailMoreOpen(false);
                      setAppSettingsOpen(true);
                    }}
                  >
                    <Settings2 className="size-3.5" aria-hidden />
                    애플리케이션 설정
                  </button>
                </div>
              ) : null}
            </div>
          </StudioVerticalToolRail>
        ) : null}
    </>
  );
});
