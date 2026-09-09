import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

import {
  resolveStudioInspectorContextRoute,
  type StudioInspectorContentMode,
  type StudioInspectorContextSnapshot,
} from "./studio-inspector-context-route";
import {
  getServerStudioInspectorPanelState,
  getStudioInspectorPanelState,
  subscribeStudioInspectorPanelState,
} from "./studio-inspector-panel-preferences";

import type { StudioInspectorLayout } from "./studio-inspector-layout";

export interface StudioInspectorContextRouteSyncProps {
  readonly activeImageTool?: StudioInspectorLayout["image"] | null;
  readonly contentMode: StudioInspectorContentMode;
  readonly layout: StudioInspectorLayout;
  readonly selectedType: string | null;
  readonly onChange: (layout: StudioInspectorLayout) => void;
}

/**
 * Keeps persisted inspector chrome from leaking a stale image-tool subtab into a new context.
 * A layout effect avoids one painted frame of the old Retouch/Mask tab after selection changes.
 * The panel pin pauses only the automatic reset; explicit tool commands still route immediately.
 */
export function StudioInspectorContextRouteSync({
  activeImageTool,
  contentMode,
  layout,
  selectedType,
  onChange,
}: StudioInspectorContextRouteSyncProps) {
  const previousContextRef = useRef<StudioInspectorContextSnapshot | null>(null);
  const panelState = useSyncExternalStore(
    subscribeStudioInspectorPanelState,
    getStudioInspectorPanelState,
    getServerStudioInspectorPanelState,
  );

  useLayoutEffect(() => {
    const nextContext: StudioInspectorContextSnapshot = {
      contentMode,
      selectedType,
    };
    const nextLayout = resolveStudioInspectorContextRoute(
      layout,
      previousContextRef.current,
      nextContext,
      activeImageTool,
      { preserveImageSection: panelState.contextPinned },
    );
    previousContextRef.current = nextContext;
    if (nextLayout !== layout) onChange(nextLayout);
  }, [
    activeImageTool,
    contentMode,
    layout,
    onChange,
    panelState.contextPinned,
    selectedType,
  ]);

  return null;
}
