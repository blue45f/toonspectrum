// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings } from "./studio-app-settings";
import { type El } from "./studio-element-model";
import {
  StudioLeftToolRail,
  type StudioLeftToolRailHandlers,
} from "./StudioLeftToolRail";

import type { ComponentProps, ReactNode } from "react";

interface MockRailButtonProps {
  readonly "aria-controls"?: string;
  readonly "aria-expanded"?: boolean;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly label: string;
  readonly onClick?: () => void;
}

vi.mock("./studio-chrome-ui", () => ({
  StudioRailDivider: () => <hr />,
  StudioRailToolButton: ({
    "aria-controls": ariaControls,
    "aria-expanded": ariaExpanded,
    active,
    disabled,
    id,
    label,
    onClick,
  }: MockRailButtonProps) => (
    <button
      id={id}
      type="button"
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  ),
  StudioVerticalToolRail: ({ children }: { children: ReactNode }) => (
    <div role="toolbar" aria-label="그리기 도구">{children}</div>
  ),
}));

vi.mock("./StudioToolHint", () => ({
  StudioToolHintTarget: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

type RailProps = ComponentProps<typeof StudioLeftToolRail>;

const IMAGE: El = {
  id: "image-1",
  type: "image",
  src: "data:image/png;base64,AA==",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
};

const USABLE_SELECTION = {
  subpaths: [{
    mode: "add" as const,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
    ],
  }],
  featherPx: 0,
  invert: false,
};

function createHandlers(): StudioLeftToolRailHandlers {
  return {
    fitCanvasToWidth: vi.fn(),
    openFrameAnimationForSelected: vi.fn(),
    openPixelSelectionTransform: vi.fn(),
    openSelectedLayerCrop: vi.fn(),
    addBubble: vi.fn(),
    addText: vi.fn(),
    announceDrawingShortcut: vi.fn(),
    clearPolyLassoDraft: vi.fn(),
    commitAppSettings: vi.fn(),
    disarmAllPixelTools: vi.fn(),
    onPickImage: vi.fn(async () => undefined),
    toggleAdvancedFill: vi.fn(),
    toggleLiquifyTool: vi.fn(),
    togglePixelMarquee: vi.fn(),
    toggleSmudgeTool: vi.fn(),
    toggleStudioCommentPinPlacement: vi.fn(),
  };
}

function createProps(overrides: Partial<RailProps> = {}): RailProps {
  return {
    activeSurfaceReviewLocked: false,
    advancedFillActive: false,
    advancedFillUnsupportedReason: null,
    appSettings: defaultStudioAppSettings(),
    appSettingsOpen: false,
    canvasOnlyMode: false,
    commentsOpen: false,
    commentPinArmed: false,
    cropActive: false,
    drawMode: "pen",
    drawShape: "rect",
    eyedropperActive: false,
    frameAnimOpen: false,
    frameAnimTargetId: null,
    isRailToolVisible: () => true,
    liquifyActive: false,
    mobileImmersive: false,
    perspectiveRulerActive: false,
    pixelForceCircle: false,
    pixelSel: null,
    pixelTool: null,
    quickShapeActive: false,
    railMoreOpen: false,
    referencePanelOpen: false,
    selected: null,
    selectedContentMutationLocked: false,
    setAppSettingsInitialTab: vi.fn(),
    setAppSettingsOpen: vi.fn(),
    setDrawMode: vi.fn(),
    setDrawShape: vi.fn(),
    setEyedropperActive: vi.fn(),
    setMenu: vi.fn(),
    setPerspectiveRulerActive: vi.fn(),
    setPixelForceCircle: vi.fn(),
    setPixelTool: vi.fn(),
    setQuickShapeActive: vi.fn(),
    setRailMoreOpen: vi.fn(),
    setReferencePanelOpen: vi.fn(),
    setStrokeWidth: vi.fn(),
    setTool: vi.fn(),
    setViewTool: vi.fn(),
    smudgeActive: false,
    stableHandlers: createHandlers(),
    tool: "select",
    uiDensityMode: "full",
    viewTool: null,
    viewTransformSuppressed: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudioLeftToolRail", () => {
  it("wires core draw, insertion, image, and view actions to their single owners", () => {
    const props = createProps({ selected: IMAGE });
    render(<StudioLeftToolRail {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "펜 (B)" }));
    expect(props.setTool).toHaveBeenCalledWith("draw");
    expect(props.setDrawMode).toHaveBeenCalledWith("pen");

    fireEvent.click(screen.getByRole("button", { name: "픽셀 펜 (P)" }));
    expect(props.setDrawMode).toHaveBeenCalledWith("pixel");
    expect(props.setStrokeWidth).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "사각형 도형" }));
    expect(props.setDrawMode).toHaveBeenCalledWith("shape");
    expect(props.setDrawShape).toHaveBeenCalledWith("rect");

    fireEvent.click(screen.getByRole("button", { name: "텍스트 추가" }));
    expect(props.stableHandlers.addText).toHaveBeenCalledWith(undefined, true);
    fireEvent.click(screen.getByRole("button", { name: "말풍선 추가" }));
    expect(props.stableHandlers.addBubble).toHaveBeenCalledWith("speech", undefined, true);

    fireEvent.change(screen.getByLabelText("이미지 추가"), {
      target: { files: [new File(["image"], "image.png", { type: "image/png" })] },
    });
    expect(props.stableHandlers.onPickImage).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "화면 맞춤" }));
    expect(props.stableHandlers.fitCanvasToWidth).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "보기 확대·축소 (Z)" }));
    expect(props.setViewTool).toHaveBeenCalledOnce();
    const zoomAction = vi.mocked(props.setViewTool).mock.calls.at(-1)?.[0];
    expect(typeof zoomAction).toBe("function");
    expect(typeof zoomAction === "function" ? zoomAction(null) : null).toBe("zoom");
  });

  it("activates perspective as a usable pen workflow instead of preserving an eraser or pixel gesture", () => {
    const props = createProps({ drawMode: "eraser", tool: "draw" });
    render(<StudioLeftToolRail {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "투시도" }));

    expect(props.setPerspectiveRulerActive).toHaveBeenCalledWith(true);
    expect(props.stableHandlers.disarmAllPixelTools).toHaveBeenCalledOnce();
    expect(props.setTool).toHaveBeenCalledWith("draw");
    expect(props.setDrawMode).toHaveBeenCalledWith("pen");
    expect(props.setEyedropperActive).toHaveBeenCalledWith(false);
    expect(props.stableHandlers.announceDrawingShortcut).toHaveBeenCalledWith(
      "투시도 켜짐 · 소실점 방향으로 펜 선을 맞춰요",
    );
    expect(props.setMenu).toHaveBeenCalledWith(null);
  });

  it("cycles free lasso to polygon lasso to off with labels that describe the real next action", () => {
    const base = createProps({ selected: IMAGE });
    const view = render(<StudioLeftToolRail {...base} />);

    fireEvent.click(screen.getByRole("button", { name: "올가미 선택" }));
    expect(base.setPixelTool).toHaveBeenCalledWith("lasso");
    expect(base.stableHandlers.disarmAllPixelTools).toHaveBeenCalledOnce();

    const free = createProps({
      selected: IMAGE,
      pixelTool: "lasso",
      setPixelTool: base.setPixelTool,
      stableHandlers: base.stableHandlers,
    });
    view.rerender(<StudioLeftToolRail {...free} />);
    fireEvent.click(screen.getByRole("button", {
      name: "자유 올가미 · 다시 누르면 다각형 올가미",
    }));
    expect(base.setPixelTool).toHaveBeenCalledWith("poly-lasso");

    const polygon = createProps({
      selected: IMAGE,
      pixelTool: "poly-lasso",
      setPixelTool: base.setPixelTool,
      stableHandlers: base.stableHandlers,
    });
    view.rerender(<StudioLeftToolRail {...polygon} />);
    fireEvent.click(screen.getByRole("button", {
      name: "다각형 올가미 · 다시 누르면 끄기",
    }));
    expect(base.setPixelTool).toHaveBeenCalledWith(null);
  });

  it("exposes review and element locks before mutation buttons can silently no-op", () => {
    const props = createProps({
      activeSurfaceReviewLocked: true,
      pixelSel: USABLE_SELECTION,
      selected: IMAGE,
      selectedContentMutationLocked: true,
    });
    render(<StudioLeftToolRail {...props} />);

    for (const name of [
      "펜 (B)",
      "픽셀 펜 (P)",
      "지우개 (E)",
      "라쏘 필",
      "투시도",
      "스마트 도형",
      "사각형 도형",
      "타원 도형",
      "텍스트 추가",
      "말풍선 추가",
      "변형 (⇧T)",
      "자르기 (C)",
      "프레임 애니메이션",
    ]) {
      expect(screen.getByRole<HTMLButtonElement>("button", { name }).disabled).toBe(true);
    }
    expect(screen.getByLabelText<HTMLInputElement>("이미지 추가").disabled).toBe(true);
  });
});
