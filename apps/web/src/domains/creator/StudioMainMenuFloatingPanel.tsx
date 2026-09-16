import {
  useCallback,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import {
  createStudioFloatingSurfaceLayout,
  loadStudioFloatingSurfaceLayout,
  normalizeStudioFloatingSurfaceLayout,
  saveStudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceConstraints,
  type StudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceViewport,
} from "./studio-floating-surface";
import {
  readStudioMainMenuViewport,
  type StudioMainMenuCoords,
  type StudioMainMenuViewport,
} from "./studio-main-menu-viewport";
import { STUDIO_Z } from "./studio-z-index";
import { StudioFloatingSurface } from "./StudioFloatingSurface";

const MENU_INSET_TOP = 52;
const MENU_INSET_RIGHT = 8;
const MENU_INSET_BOTTOM = 8;
const MENU_INSET_LEFT = 8;
const MENU_MIN_WIDTH = 248;
const MENU_MIN_HEIGHT = 120;
const MENU_MAX_WIDTH = 560;
const MENU_MAX_HEIGHT = 720;
const MENU_ROW_HEIGHT = 38;
const MENU_CHROME_HEIGHT = 58;

interface StudioMainMenuFloatingGeometry {
  readonly viewport: StudioFloatingSurfaceViewport;
  readonly constraints: StudioFloatingSurfaceConstraints;
}

function menuFloatingGeometry(
  viewport: StudioMainMenuViewport,
): StudioMainMenuFloatingGeometry {
  const availableWidth = Math.max(
    1,
    viewport.width - MENU_INSET_LEFT - MENU_INSET_RIGHT,
  );
  const availableHeight = Math.max(
    1,
    viewport.height - MENU_INSET_TOP - MENU_INSET_BOTTOM,
  );
  return {
    viewport: {
      width: viewport.left + viewport.width,
      height: viewport.top + viewport.height,
      insetTop: viewport.top + MENU_INSET_TOP,
      insetRight: MENU_INSET_RIGHT,
      insetBottom: MENU_INSET_BOTTOM,
      insetLeft: viewport.left + MENU_INSET_LEFT,
    },
    constraints: {
      minWidth: Math.min(MENU_MIN_WIDTH, availableWidth),
      minHeight: Math.min(MENU_MIN_HEIGHT, availableHeight),
      maxWidth: Math.min(MENU_MAX_WIDTH, availableWidth),
      maxHeight: Math.min(MENU_MAX_HEIGHT, availableHeight),
      snapDistance: 12,
    },
  };
}

/**
 * Starts below the owning menu title like a normal dropdown, while using the same
 * ratio geometry as every persistent Studio palette once the artist moves it.
 */
function createStudioMainMenuFloatingLayout(
  coords: StudioMainMenuCoords,
  viewport: StudioMainMenuViewport,
  itemCount: number,
): StudioFloatingSurfaceLayout {
  const geometry = menuFloatingGeometry(viewport);
  const maxWidth = geometry.constraints.maxWidth ?? MENU_MAX_WIDTH;
  const maxHeight = geometry.constraints.maxHeight ?? MENU_MAX_HEIGHT;
  const preferredWidth = Math.min(
    maxWidth,
    Math.max(geometry.constraints.minWidth, Math.min(336, coords.maxWidth)),
  );
  const preferredHeight = Math.min(
    maxHeight,
    Math.max(
      geometry.constraints.minHeight,
      Math.min(coords.maxHeight, MENU_CHROME_HEIGHT + itemCount * MENU_ROW_HEIGHT),
    ),
  );
  const y = coords.side === "top"
    ? coords.top - preferredHeight
    : coords.top;
  return createStudioFloatingSurfaceLayout(
    {
      x: coords.left,
      y,
      width: preferredWidth,
      height: preferredHeight,
    },
    geometry.viewport,
    geometry.constraints,
  );
}

function browserSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function useSessionFloatingLayout(
  surfaceId: string,
  defaultLayout: StudioFloatingSurfaceLayout,
): readonly [StudioFloatingSurfaceLayout, (layout: StudioFloatingSurfaceLayout) => void] {
  const sessionKey = `toonspectrum:studio:main-menu:${surfaceId}:v1`;
  const [layout, setLayoutState] = useState<StudioFloatingSurfaceLayout>(() =>
    loadStudioFloatingSurfaceLayout(
      browserSessionStorage(),
      sessionKey,
      defaultLayout,
    )
  );
  const setLayout = useCallback((next: StudioFloatingSurfaceLayout) => {
    const normalized = normalizeStudioFloatingSurfaceLayout(next, defaultLayout);
    setLayoutState(normalized);
    saveStudioFloatingSurfaceLayout(
      browserSessionStorage(),
      sessionKey,
      normalized,
    );
  }, [defaultLayout, sessionKey]);
  return [layout, setLayout] as const;
}

export interface StudioMainMenuFloatingPanelProps {
  readonly panelId: string;
  readonly surfaceId: string;
  readonly label: string;
  readonly coords: StudioMainMenuCoords;
  readonly itemCount: number;
  readonly onClose: () => void;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  readonly surfaceRef: Ref<HTMLDivElement>;
  readonly menuRef: Ref<HTMLDivElement>;
  readonly children: ReactNode;
}

export function StudioMainMenuFloatingPanel({
  panelId,
  surfaceId,
  label,
  coords,
  itemCount,
  onClose,
  onKeyDown,
  surfaceRef,
  menuRef,
  children,
}: StudioMainMenuFloatingPanelProps) {
  const currentViewport = readStudioMainMenuViewport();
  const viewport = useMemo<StudioMainMenuViewport>(() => ({
    left: currentViewport.left,
    top: currentViewport.top,
    width: currentViewport.width,
    height: currentViewport.height,
  }), [
    currentViewport.height,
    currentViewport.left,
    currentViewport.top,
    currentViewport.width,
  ]);
  const geometry = useMemo(() => menuFloatingGeometry(viewport), [viewport]);
  const defaultLayout = useMemo(
    () => createStudioMainMenuFloatingLayout(coords, viewport, itemCount),
    [coords, itemCount, viewport],
  );
  const [layout, setLayout] = useSessionFloatingLayout(surfaceId, defaultLayout);
  const constraints = geometry.constraints;

  return (
    <StudioFloatingSurface
      ref={surfaceRef}
      surfaceId={surfaceId}
      label={label}
      layout={layout}
      defaultLayout={defaultLayout}
      onLayoutChange={setLayout}
      onClose={onClose}
      minWidth={constraints.minWidth}
      minHeight={constraints.minHeight}
      maxWidth={constraints.maxWidth}
      maxHeight={constraints.maxHeight}
      snapDistance={constraints.snapDistance}
      insetTop={MENU_INSET_TOP}
      insetRight={MENU_INSET_RIGHT}
      insetBottom={MENU_INSET_BOTTOM}
      insetLeft={MENU_INSET_LEFT}
      zIndexFloor={STUDIO_Z.workspace}
      contentClassName="min-h-0 overflow-hidden"
      minimizable={false}
      participatesInWorkspaceArrangement={false}
      rootDataAttributes={{
        "data-studio-main-menu-panel": "true",
        "data-studio-main-menu-floating": "true",
        "data-studio-main-menu-side": coords.side,
        "data-studio-shortcut-boundary": "true",
      }}
    >
      <div
        ref={menuRef}
        id={panelId}
        role="menu"
        aria-label={label}
        tabIndex={-1}
        data-studio-main-menu-scroll="true"
        onKeyDown={onKeyDown}
        className="h-full overflow-y-auto overscroll-contain py-1.5 [scrollbar-width:thin]"
      >
        {children}
      </div>
    </StudioFloatingSurface>
  );
}
