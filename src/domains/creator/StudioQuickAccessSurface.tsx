import { createPortal } from "react-dom";

import { StudioQuickAccessDesktopSurface } from "./StudioQuickAccessDesktopSurface";
import { StudioQuickAccessMobileSurface } from "./StudioQuickAccessMobileSurface";
import { useStudioQuickAccessSurfaceLifecycle } from "./use-studio-quick-access-surface-lifecycle";

import type { StudioQuickAccessSurfaceProps } from "./studio-quick-access-surface-types";

export type { StudioQuickAccessSurfaceProps } from "./studio-quick-access-surface-types";

/**
 * Responsive owner for Quick Access.
 *
 * Desktop portals the shared floating surface directly under `body`: an intermediate fixed/z-index
 * wrapper would create a stacking context and defeat the global click-to-front registry. Mobile
 * deliberately keeps the bounded modal sheet and its backdrop wrapper.
 */
export function StudioQuickAccessSurface(props: StudioQuickAccessSurfaceProps) {
  const {
    state,
    catalog,
    isMobile,
    onStateChange,
    onExecute,
    onClose,
  } = props;
  const { descriptionId, surfaceRef } = useStudioQuickAccessSurfaceLifecycle(
    isMobile,
    onClose,
  );

  if (typeof document === "undefined") return null;
  const leafProps = {
    state,
    catalog,
    onStateChange,
    onExecute,
    onClose,
    descriptionId,
    surfaceRef,
  };

  return createPortal(
    isMobile ? (
      <div
        data-studio-quick-access-portal="true"
        className="pointer-events-none fixed inset-0 z-[70]"
      >
        <StudioQuickAccessMobileSurface {...leafProps} />
      </div>
    ) : (
      <StudioQuickAccessDesktopSurface {...leafProps} />
    ),
    document.body,
  );
}
