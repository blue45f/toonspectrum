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
  applyStudioBg3dWorkspacePreset,
  readStudioBg3dProfessionalWorkspaceLayout,
  setStudioBg3dWorkspacePanelVisible,
  setStudioBg3dWorkspacePanelWidth,
  studioBg3dProfessionalWorkspaceStorageKey,
  swapStudioBg3dWorkspaceDockOrder,
  writeStudioBg3dProfessionalWorkspaceLayout,
  type StudioBg3dWorkspacePanel,
  type StudioBg3dWorkspacePresetId,
} from "./studio-bg3d-professional-workspace-layout";

import type { StudioBg3dExperienceMode } from "./StudioBackground3DTypes";

interface StudioBg3dProfessionalWorkspaceProps {
  readonly outliner: ReactNode;
  readonly viewport: ReactNode;
  readonly inspector: ReactNode;
  readonly scopeKey?: string | null;
  readonly experienceMode?: StudioBg3dExperienceMode;
}

interface ResizeGesture {
  readonly panel: StudioBg3dWorkspacePanel;
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
}

const PRESET_LABELS: Readonly<Record<Exclude<StudioBg3dWorkspacePresetId, "custom">, string>> =
  Object.freeze({
    scene: "장면",
    character: "캐릭터",
    output: "출력",
    focus: "집중",
  });

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function panelBounds(panel: StudioBg3dWorkspacePanel): { readonly min: number; readonly max: number } {
  return panel === "outliner"
    ? { min: STUDIO_BG3D_OUTLINER_WIDTH_MIN, max: STUDIO_BG3D_OUTLINER_WIDTH_MAX }
    : { min: STUDIO_BG3D_INSPECTOR_WIDTH_MIN, max: STUDIO_BG3D_INSPECTOR_WIDTH_MAX };
}

export function StudioBg3dProfessionalWorkspace({
  outliner,
  viewport,
  inspector,
  scopeKey = null,
  experienceMode = "pro",
}: StudioBg3dProfessionalWorkspaceProps) {
  const canonicalStorageKey = studioBg3dProfessionalWorkspaceStorageKey(scopeKey);
  const [layout, setLayout] = useState(() =>
    readStudioBg3dProfessionalWorkspaceLayout(browserStorage(), scopeKey));
  const hydratedStorageKeyRef = useRef(canonicalStorageKey);
  const resizeGestureRef = useRef<ResizeGesture | null>(null);

  useEffect(() => {
    if (hydratedStorageKeyRef.current === canonicalStorageKey) return;
    hydratedStorageKeyRef.current = canonicalStorageKey;
    setLayout(readStudioBg3dProfessionalWorkspaceLayout(browserStorage(), scopeKey));
  }, [canonicalStorageKey, scopeKey]);

  useEffect(() => {
    if (hydratedStorageKeyRef.current !== canonicalStorageKey) return;
    writeStudioBg3dProfessionalWorkspaceLayout(browserStorage(), layout, scopeKey);
  }, [canonicalStorageKey, layout, scopeKey]);

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
    const panelIsLeft = layout.dockOrder === "outliner-viewport-inspector"
      ? gesture.panel === "outliner"
      : gesture.panel === "inspector";
    const widthDelta = panelIsLeft ? rawDelta : -rawDelta;
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
    const panelIsLeft = layout.dockOrder === "outliner-viewport-inspector"
      ? panel === "outliner"
      : panel === "inspector";
    let nextWidth: number | null = null;
    const step = event.shiftKey ? 32 : 16;
    if (event.key === "Home") nextWidth = bounds.min;
    else if (event.key === "End") nextWidth = bounds.max;
    else if (event.key === "ArrowLeft") nextWidth = currentWidth + (panelIsLeft ? -step : step);
    else if (event.key === "ArrowRight") nextWidth = currentWidth + (panelIsLeft ? step : -step);
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

  const togglePanel = (panel: StudioBg3dWorkspacePanel) => {
    const visible = panel === "outliner" ? layout.outlinerVisible : layout.inspectorVisible;
    setLayout((current) => setStudioBg3dWorkspacePanelVisible(current, panel, !visible));
  };

  const simpleMode = experienceMode === "simple";
  const outlinerVisible = !simpleMode && layout.outlinerVisible;
  const inspectorVisible = simpleMode || layout.inspectorVisible;
  const reversed = layout.dockOrder === "inspector-viewport-outliner";
  const workspaceStyle = {
    "--studio-bg3d-outliner-width": `${layout.outlinerWidth}px`,
    "--studio-bg3d-inspector-width": `${layout.inspectorWidth}px`,
    "--studio-bg3d-outliner-order": reversed ? 4 : 0,
    "--studio-bg3d-outliner-resizer-order": reversed ? 3 : 1,
    "--studio-bg3d-viewport-order": 2,
    "--studio-bg3d-inspector-resizer-order": reversed ? 1 : 3,
    "--studio-bg3d-inspector-order": reversed ? 0 : 4,
  } as CSSProperties;

  const renderSeparator = (panel: StudioBg3dWorkspacePanel) => {
    const bounds = panelBounds(panel);
    const value = panel === "outliner" ? layout.outlinerWidth : layout.inspectorWidth;
    const label = panel === "outliner" ? "장면 계층 패널 너비" : "속성 패널 너비";
    const orderVariable = panel === "outliner"
      ? "var(--studio-bg3d-outliner-resizer-order)"
      : "var(--studio-bg3d-inspector-resizer-order)";
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
        className="group hidden min-h-0 w-1.5 shrink-0 touch-none cursor-col-resize items-stretch justify-center bg-panel/70 outline-none hover:bg-accent-soft focus-visible:bg-accent-soft xl:flex"
        style={{ order: orderVariable }}
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        className={simpleMode ? "hidden" : "hidden min-h-10 shrink-0 items-center gap-1.5 border-b border-line bg-panel/90 px-2 xl:flex"}
        role="toolbar"
        aria-label="3D 전문가 작업공간"
      >
        {(Object.keys(PRESET_LABELS) as Array<Exclude<StudioBg3dWorkspacePresetId, "custom">>).map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={layout.preset === preset}
            className="min-h-8 rounded-md border border-line bg-card px-2.5 text-[0.65rem] font-semibold text-fg-2 hover:border-accent/60 hover:text-fg aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
            onClick={() => setLayout(applyStudioBg3dWorkspacePreset(preset))}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <button
          type="button"
          aria-pressed={layout.outlinerVisible}
          className="min-h-8 rounded-md border border-line bg-card px-2.5 text-[0.65rem] font-semibold text-fg-2 hover:border-accent/60 aria-pressed:border-accent aria-pressed:text-accent"
          onClick={() => togglePanel("outliner")}
        >
          계층
        </button>
        <button
          type="button"
          aria-pressed={layout.inspectorVisible}
          className="min-h-8 rounded-md border border-line bg-card px-2.5 text-[0.65rem] font-semibold text-fg-2 hover:border-accent/60 aria-pressed:border-accent aria-pressed:text-accent"
          onClick={() => togglePanel("inspector")}
        >
          속성
        </button>
        <button
          type="button"
          className="min-h-8 rounded-md border border-line bg-card px-2.5 text-[0.65rem] font-semibold text-fg-2 hover:border-accent/60 hover:text-accent"
          onClick={() => setLayout((current) => swapStudioBg3dWorkspaceDockOrder(current))}
        >
          좌우 바꾸기
        </button>
        <button
          type="button"
          className="ml-auto min-h-8 rounded-md border border-line bg-card px-2.5 text-[0.65rem] font-semibold text-fg-2 hover:border-accent/60 hover:text-accent"
          onClick={() => setLayout(DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT)}
        >
          기본 배치
        </button>
      </div>

      <div
        data-studio-bg3d-workspace-layout="dockable-v2"
        className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,44dvh)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1 xl:flex xl:flex-row"
        style={workspaceStyle}
      >
        <aside
          className={`${outlinerVisible ? "hidden xl:flex" : "hidden"} min-h-0 shrink-0 flex-col overflow-hidden border-r border-line bg-panel/70 xl:w-[var(--studio-bg3d-outliner-width)]`}
          style={{ order: "var(--studio-bg3d-outliner-order)" }}
        >
          {outliner}
        </aside>
        {outlinerVisible ? renderSeparator("outliner") : null}
        <div
          className="contents xl:flex xl:min-h-0 xl:min-w-0 xl:flex-1"
          style={{ order: "var(--studio-bg3d-viewport-order)" }}
        >
          {viewport}
        </div>
        {inspectorVisible ? renderSeparator("inspector") : null}
        <div
          className={`${inspectorVisible ? "contents xl:flex" : "contents xl:hidden"} xl:min-h-0 xl:shrink-0 xl:overflow-hidden xl:w-[var(--studio-bg3d-inspector-width)]`}
          style={{ order: "var(--studio-bg3d-inspector-order)" }}
        >
          {inspector}
        </div>
      </div>
    </div>
  );
}
