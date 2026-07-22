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
  readonly "aria-keyshortcuts"?: string;
  readonly active?: boolean;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly hintPreview?: string;
  readonly hintPreviewVariant?: string;
  readonly id?: string;
  readonly label: string;
  readonly onClick?: () => void;
}

vi.mock("./studio-chrome-ui", () => ({
  StudioRailDivider: () => <hr />,
  StudioRailToolButton: ({
    "aria-controls": ariaControls,
    "aria-expanded": ariaExpanded,
    "aria-keyshortcuts": ariaKeyShortcuts,
    active,
    description,
    disabled,
    hintPreview,
    hintPreviewVariant,
    id,
    label,
    onClick,
  }: MockRailButtonProps) => (
    <button
      id={id}
      type="button"
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-keyshortcuts={ariaKeyShortcuts}
      aria-label={label}
      aria-pressed={active}
      data-hint-description={description}
      data-hint-preview={hintPreview}
      data-hint-preview-variant={hintPreviewVariant}
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
  vi.unstubAllGlobals();
});

it("shows the configured comment shortcut in the placement tool and preserves the toggle action", () => {
  const props = createProps();
  render(<StudioLeftToolRail {...props} />);

  const comment = screen.getByRole("button", { name: "댓글 핀 배치 (⌥·C)" });
  expect(comment.getAttribute("aria-keyshortcuts")).toBe("Alt+C");
  expect(comment.getAttribute("aria-pressed")).toBe("false");
  expect(comment.getAttribute("data-hint-description")).toContain("⌥·C로 바로 시작");
  expect(comment.getAttribute("data-hint-description")).toContain("⇧·C로 핀을 숨길");

  fireEvent.click(comment);
  expect(props.stableHandlers.toggleStudioCommentPinPlacement).toHaveBeenCalledOnce();

  const unboundSettings = defaultStudioAppSettings();
  unboundSettings.shortcuts["tool-comment"] = "";
  cleanup();
  render(<StudioLeftToolRail {...createProps({ appSettings: unboundSettings })} />);
  const unboundComment = screen.getByRole("button", { name: "댓글 핀 배치" });
  expect(unboundComment.getAttribute("aria-keyshortcuts")).toBeNull();

});

function stubAnimationFrame(): void {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
}

function hiddenToolSettings(): ReturnType<typeof defaultStudioAppSettings> {
  const defaults = defaultStudioAppSettings();
  return {
    ...defaults,
    toolbar: { visibleIds: ["select"] },
  };
}

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

    fireEvent.click(screen.getByRole("button", { name: "너비에 맞춤 (Home)" }));
    expect(props.stableHandlers.fitCanvasToWidth).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "보기 확대·축소 (Z)" }));
    expect(props.setViewTool).toHaveBeenCalledOnce();
    const zoomAction = vi.mocked(props.setViewTool).mock.calls.at(-1)?.[0];
    expect(typeof zoomAction).toBe("function");
    expect(typeof zoomAction === "function" ? zoomAction(null) : null).toBe("zoom");
  });

  it("keeps fill discoverable and clickable while explaining how an unavailable selection recovers", () => {
    const props = createProps({
      advancedFillUnsupportedReason: "래스터 이미지 레이어를 먼저 선택하세요.",
    });
    render(<StudioLeftToolRail {...props} />);

    const fill = screen.getByRole<HTMLButtonElement>("button", { name: "채우기 (G)" });
    expect(fill.disabled).toBe(false);
    expect(fill.getAttribute("data-hint-description")).toContain(
      "래스터 이미지 레이어를 먼저 선택하세요.",
    );
    expect(fill.getAttribute("data-hint-description")).toContain("안전한 단일 래스터 후보");

    fireEvent.click(fill);
    expect(props.stableHandlers.toggleAdvancedFill).toHaveBeenCalledOnce();
  });

  it("keeps remapped and unbound view shortcut labels synchronized with app settings", () => {
    const appSettings = defaultStudioAppSettings();
    appSettings.shortcuts = {
      ...appSettings.shortcuts,
      "tool-zoom": "Shift+Z",
      "tool-rotate-view": "",
    };

    render(<StudioLeftToolRail {...createProps({ appSettings })} />);

    expect(screen.getByRole("button", { name: "보기 확대·축소 (⇧·Z)" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "보기 회전" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "보기 회전 (R)" })).toBeNull();
  });

  it("previews opening and closing each view HUD instead of implying a direct canvas transform", () => {
    const base = createProps();
    const view = render(<StudioLeftToolRail {...base} />);

    const closedZoom = screen.getByRole("button", { name: "보기 확대·축소 (Z)" });
    expect(closedZoom.getAttribute("aria-expanded")).toBe("false");
    expect(closedZoom.getAttribute("aria-controls")).toBe("studio-view-tools-hud-zoom");
    expect(closedZoom.getAttribute("data-hint-preview")).toBe("view-hud");
    expect(closedZoom.getAttribute("data-hint-preview-variant")).toBe("zoom-open");
    expect(closedZoom.getAttribute("data-hint-description")).toContain("HUD를 열어");
    const closedRotate = screen.getByRole("button", { name: "보기 회전 (R)" });
    expect(closedRotate.getAttribute("data-hint-preview")).toBe("view-hud");
    expect(closedRotate.getAttribute("data-hint-preview-variant")).toBe("rotate-open");

    view.rerender(<StudioLeftToolRail {...createProps({ viewTool: "zoom" })} />);
    const openZoom = screen.getByRole("button", { name: "확대·축소 HUD 닫기 (Z)" });
    expect(openZoom.getAttribute("aria-expanded")).toBe("true");
    expect(openZoom.getAttribute("data-hint-preview")).toBe("view-hud");
    expect(openZoom.getAttribute("data-hint-preview-variant")).toBe("zoom-close");
    expect(openZoom.getAttribute("data-hint-description")).toContain("HUD를 닫고");

    view.rerender(<StudioLeftToolRail {...createProps({ viewTool: "rotate" })} />);
    const openRotate = screen.getByRole("button", { name: "회전 HUD 닫기 (R)" });
    expect(openRotate.getAttribute("aria-expanded")).toBe("true");
    expect(openRotate.getAttribute("aria-controls")).toBe("studio-view-tools-hud-rotate");
    expect(openRotate.getAttribute("data-hint-preview")).toBe("view-hud");
    expect(openRotate.getAttribute("data-hint-preview-variant")).toBe("rotate-close");
    expect(openRotate.getAttribute("data-hint-description")).toContain("회전 HUD를 닫고");
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

    const inactiveLasso = screen.getByRole("button", { name: "올가미 선택" });
    expect(inactiveLasso.getAttribute("data-hint-preview")).toBe("lasso");
    expect(inactiveLasso.getAttribute("data-hint-description")).toContain("자유 곡선");
    fireEvent.click(inactiveLasso);
    expect(base.setPixelTool).toHaveBeenCalledWith("lasso");
    expect(base.stableHandlers.disarmAllPixelTools).toHaveBeenCalledOnce();

    const free = createProps({
      selected: IMAGE,
      pixelTool: "lasso",
      setPixelTool: base.setPixelTool,
      stableHandlers: base.stableHandlers,
    });
    view.rerender(<StudioLeftToolRail {...free} />);
    const freeLasso = screen.getByRole("button", {
      name: "자유 올가미 · 다시 누르면 다각형 올가미",
    });
    expect(freeLasso.getAttribute("data-hint-preview")).toBe("polygon-lasso");
    expect(freeLasso.getAttribute("data-hint-preview-variant")).toBeNull();
    expect(freeLasso.getAttribute("data-hint-description")).toContain("다각형 올가미로 전환");
    fireEvent.click(freeLasso);
    expect(base.setPixelTool).toHaveBeenCalledWith("poly-lasso");

    const polygon = createProps({
      selected: IMAGE,
      pixelTool: "poly-lasso",
      setPixelTool: base.setPixelTool,
      stableHandlers: base.stableHandlers,
    });
    view.rerender(<StudioLeftToolRail {...polygon} />);
    const polygonLasso = screen.getByRole("button", {
      name: "다각형 올가미 · 다시 누르면 끄기",
    });
    expect(polygonLasso.getAttribute("data-hint-preview")).toBe("dismiss");
    expect(polygonLasso.getAttribute("data-hint-description")).toContain("선택 도구를 끕니다");
    fireEvent.click(polygonLasso);
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
      "스마트 도형 켜기",
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

  it("ports the More dialog to the body and restores focus after choosing a hidden tool", () => {
    stubAnimationFrame();
    const props = createProps({
      appSettings: hiddenToolSettings(),
      isRailToolVisible: (id) => id === "select",
      railMoreOpen: true,
    });

    render(<StudioLeftToolRail {...props} />);

    const dialog = screen.getByRole("dialog", { name: "숨긴 도구" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.getAttribute("aria-modal")).toBe("false");
    expect(dialog.className).toContain("fixed");
    expect(dialog.className).toContain("overflow-y-auto");

    fireEvent.click(screen.getByRole("button", { name: "핸드(팬)" }));

    expect(props.stableHandlers.commitAppSettings).toHaveBeenCalledWith({
      ...props.appSettings,
      toolbar: { visibleIds: ["select", "hand"] },
    });
    expect(props.setRailMoreOpen).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "더보기 · 툴바 설정" })
    );
  });

  it("opens the toolbar settings tab while preserving the More trigger as modal return focus", () => {
    stubAnimationFrame();
    const props = createProps({
      appSettings: hiddenToolSettings(),
      isRailToolVisible: (id) => id === "select",
      railMoreOpen: true,
    });

    render(<StudioLeftToolRail {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "애플리케이션 설정" }));

    expect(props.setRailMoreOpen).toHaveBeenCalledWith(false);
    expect(props.setAppSettingsInitialTab).toHaveBeenCalledWith("toolbar");
    expect(props.setAppSettingsOpen).toHaveBeenCalledWith(true);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "더보기 · 툴바 설정" })
    );
  });

  it("closes More with Escape or an outside pointer without trapping the canvas chrome", () => {
    stubAnimationFrame();
    const escapeProps = createProps({
      appSettings: hiddenToolSettings(),
      isRailToolVisible: (id) => id === "select",
      railMoreOpen: true,
    });
    const view = render(<StudioLeftToolRail {...escapeProps} />);

    fireEvent.keyDown(screen.getByRole("dialog", { name: "숨긴 도구" }), { key: "Escape" });
    expect(escapeProps.setRailMoreOpen).toHaveBeenCalledWith(false);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "더보기 · 툴바 설정" })
    );

    const outsideProps = createProps({
      appSettings: hiddenToolSettings(),
      isRailToolVisible: (id) => id === "select",
      railMoreOpen: true,
    });
    view.rerender(<StudioLeftToolRail {...outsideProps} />);
    fireEvent.pointerDown(document.body);

    expect(outsideProps.setRailMoreOpen).toHaveBeenCalledWith(false);
  });
});
