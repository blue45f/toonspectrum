/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex --
 * A focusable WAI-ARIA separator is the prescribed interaction model for resizing adjacent panes.
 */
import { useEffect, useRef, useState } from "react";

import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";

import {
  DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT,
  STUDIO_BG3D_INSPECTOR_WIDTH_MAX,
  STUDIO_BG3D_INSPECTOR_WIDTH_MIN,
  STUDIO_BG3D_OUTLINER_WIDTH_MAX,
  STUDIO_BG3D_OUTLINER_WIDTH_MIN,
  readStudioBg3dProfessionalWorkspaceLayout,
  setStudioBg3dWorkspacePanelWidth,
  writeStudioBg3dProfessionalWorkspaceLayout,
  type StudioBg3dWorkspacePanel,
} from "./studio-bg3d-professional-workspace-layout";

interface StudioBg3dProfessionalWorkspaceProps {
  readonly outliner: ReactNode;
  readonly viewport: ReactNode;
  readonly inspector: ReactNode;
}

interface ResizeGesture {
  readonly panel: StudioBg3dWorkspacePanel;
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function panelBounds(panel: StudioBg3dWorkspacePanel): {
  readonly min: number;
  readonly max: number;
} {
  return panel === "outliner"
    ? { min: STUDIO_BG3D_OUTLINER_WIDTH_MIN, max: STUDIO_BG3D_OUTLINER_WIDTH_MAX }
    : { min: STUDIO_BG3D_INSPECTOR_WIDTH_MIN, max: STUDIO_BG3D_INSPECTOR_WIDTH_MAX };
}

export function StudioBg3dProfessionalWorkspace({
  outliner,
  viewport,
  inspector,
}: StudioBg3dProfessionalWorkspaceProps) {
  const [layout, setLayout] = useState(() =>
    readStudioBg3dProfessionalWorkspaceLayout(browserStorage()));
  const resizeGestureRef = useRef<ResizeGesture | null>(null);

  useEffect(() => {
    writeStudioBg3dProfessionalWorkspaceLayout(browserStorage(), layout);
  }, [layout]);

  const beginResize = (
    panel: StudioBg3dWorkspacePanel,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeGestureRef.current = {
      panel,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panel === "outliner" ? layout.outlinerWidth : layout.inspectorWidth,
    };
  };

  const continueResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const rawDelta = event.clientX - gesture.startX;
    const widthDelta = gesture.panel === "outliner" ? rawDelta : -rawDelta;
    setLayout((current) => setStudioBg3dWorkspacePanelWidth(
      current,
      gesture.panel,
      gesture.startWidth + widthDelta,
    ));
  };
  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    resizeGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleSeparatorKeyDown = (
    panel: StudioBg3dWorkspacePanel,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const bounds = panelBounds(panel);
    const currentWidth = panel === "outliner" ? layout.outlinerWidth : layout.inspectorWidth;
    let nextWidth: number | null = null;
    const step = event.shiftKey ? 32 : 16;
    if (event.key === "Home") nextWidth = bounds.min;
    else if (event.key === "End") nextWidth = bounds.max;
    else if (event.key === "ArrowLeft") {
      nextWidth = currentWidth + (panel === "outliner" ? -step : step);
    } else if (event.key === "ArrowRight") {
      nextWidth = currentWidth + (panel === "outliner" ? step : -step);
    }
    if (nextWidth === null) return;
    event.preventDefault();
    setLayout((current) => setStudioBg3dWorkspacePanelWidth(current, panel, nextWidth));
  };

  const resetPanelWidth = (panel: StudioBg3dWorkspacePanel) => {
    const defaultWidth = panel === "outliner"
      ? DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT.outlinerWidth
      : DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT.inspectorWidth;
    setLayout((current) => setStudioBg3dWorkspacePanelWidth(current, panel, defaultWidth));
  };

  const workspaceStyle = {
    "--studio-bg3d-workspace-columns":
      `${layout.outlinerWidth}px 6px minmax(0,1fr) 6px ${layout.inspectorWidth}px`,
  } as CSSProperties;

  const renderSeparator = (panel: StudioBg3dWorkspacePanel) => {
    const bounds = panelBounds(panel);
    const value = panel === "outliner" ? layout.outlinerWidth : layout.inspectorWidth;
    const label = panel === "outliner" ? "장면 계층 패널 너비" : "속성 패널 너비";
    return (
      <div
        role="separator"
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuenow={value}
        tabIndex={0}
        data-testid={`studio-bg3d-${panel}-resizer`}
        className="group hidden min-h-0 touch-none cursor-col-resize items-stretch justify-center bg-panel/70 outline-none hover:bg-accent-soft focus-visible:bg-accent-soft xl:flex"
        onDoubleClick={() => resetPanelWidth(panel)}
        onKeyDown={(event) => handleSeparatorKeyDown(panel, event)}
        onPointerDown={(event) => beginResize(panel, event)}
        onPointerMove={continueResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onLostPointerCapture={endResize}
      >
        <span className="w-px bg-line transition-colors group-hover:bg-accent group-focus-visible:bg-accent" aria-hidden />
      </div>
    );
  };

  return (
    <div
      data-studio-bg3d-workspace-layout="resizable-v1"
      className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,44dvh)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1 xl:[grid-template-columns:var(--studio-bg3d-workspace-columns)]"
      style={workspaceStyle}
    >
      <aside className="hidden min-h-0 border-r border-line bg-panel/70 xl:flex xl:flex-col">
        {outliner}
      </aside>
      {renderSeparator("outliner")}
      {viewport}
      {renderSeparator("inspector")}
      {inspector}
    </div>
  );
}
