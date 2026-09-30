// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { setStudioCanvasStartDockExpanded } from "./canvas/studio-canvas-start-dock-state";
import { createStudioInspectorTabA11y } from "./studio-inspector-tab-a11y";
import { StudioInspectorEmptyCoachSection } from "./StudioInspectorEmptyCoachSection";
import { StudioInspectorUnselectedImageTools } from "./StudioInspectorUnselectedImageTools";

import type { StudioInspectorAsideModel } from "./useStudioInspectorAsideModel";

const TAB_A11Y = createStudioInspectorTabA11y("entry-focus");

afterEach(cleanup);

function EntryFocusHarness() {
  const [imageToolsVisible, setImageToolsVisible] = useState(false);
  const inspectorLayout = {
    primary: "properties",
    document: "canvas",
    image: "quick",
  } as const;
  const model = {
    activateCanvasTool: () => undefined,
    announceDrawingShortcut: () => undefined,
    changeInspectorLayout: () => undefined,
    disarmAllPixelTools: () => undefined,
    inspectorContentMode: "empty",
    inspectorLayout,
    openFeatureTutorial: () => undefined,
    setUnselectedImageToolsVisible: setImageToolsVisible,
    setEyedropperActive: () => undefined,
    setTool: () => undefined,
    unselectedImageToolsVisible: imageToolsVisible,
    imageInspectorRouteWithoutImageSelection: imageToolsVisible,
    activeImageInspectorTab: "quick",
    shouldMountImageInspectorTab: () => false,
  } as unknown as StudioInspectorAsideModel;

  return (
    <>
      <StudioInspectorEmptyCoachSection model={model} />
      <StudioInspectorUnselectedImageTools model={model} tabA11y={TAB_A11Y} />
    </>
  );
}

describe("Studio inspector entry focus", () => {
  it("moves focus into image preparation and restores it to the returning entry", async () => {
    render(<EntryFocusHarness />);

    const imageEntry = screen.getByRole("button", {
      name: "이미지 편집 · 전문 도구 열기",
    });
    imageEntry.focus();
    fireEvent.click(imageEntry);

    const preparationHeading = screen.getByText("이미지 편집 대상 준비");
    await waitFor(() => {
      expect(document.activeElement).toBe(preparationHeading);
    });

    fireEvent.click(screen.getByRole("button", { name: "시작 안내" }));

    const restoredEntry = screen.getByRole("button", {
      name: "이미지 편집 · 전문 도구 열기",
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(restoredEntry);
    });
  });
});

it("steps the empty-canvas start card aside while the canvas start dock is expanded", () => {
  render(<EntryFocusHarness />);
  expect(screen.getByTestId("studio-inspector-empty-coach")).toBeTruthy();

  act(() => setStudioCanvasStartDockExpanded(true));
  // 펜·사용법 안내는 도크가 맡는다. 같은 안내를 두 곳에 동시에 두지 않는다.
  expect(screen.queryByTestId("studio-inspector-empty-coach")).toBeNull();

  act(() => setStudioCanvasStartDockExpanded(false));
  expect(screen.getByTestId("studio-inspector-empty-coach")).toBeTruthy();
});
