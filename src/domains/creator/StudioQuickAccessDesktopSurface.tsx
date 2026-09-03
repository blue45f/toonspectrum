import { StudioFloatingSurface } from "./StudioFloatingSurface";
import {
  DEFAULT_STUDIO_QUICK_ACCESS_FLOATING_LAYOUT,
  STUDIO_QUICK_ACCESS_FLOATING_LAYOUT_SESSION_KEY,
} from "./studio-quick-access-surface-layout";
import { StudioQuickAccessPalette } from "./StudioQuickAccessPalette";
import { useStudioFloatingSurfaceLayout } from "./use-studio-floating-surface-layout";

import type { StudioQuickAccessSurfaceLeafProps } from "./studio-quick-access-surface-types";

/** Movable, resizable, dockable desktop presentation backed by shared Studio window chrome. */
export function StudioQuickAccessDesktopSurface({
  state,
  catalog,
  descriptionId,
  surfaceRef,
  onStateChange,
  onExecute,
  onClose,
}: StudioQuickAccessSurfaceLeafProps) {
  const {
    layout,
    authority,
    failure,
    setLayout,
  } = useStudioFloatingSurfaceLayout({
    surfaceId: "quick-access",
    defaultLayout: DEFAULT_STUDIO_QUICK_ACCESS_FLOATING_LAYOUT,
    sessionKey: STUDIO_QUICK_ACCESS_FLOATING_LAYOUT_SESSION_KEY,
  });

  return (
    <StudioFloatingSurface
      ref={surfaceRef}
      surfaceId="quick-access"
      label="빠른 액세스 팔레트"
      descriptionId={descriptionId}
      layout={layout}
      defaultLayout={DEFAULT_STUDIO_QUICK_ACCESS_FLOATING_LAYOUT}
      minWidth={280}
      minHeight={320}
      maxWidth={560}
      maxHeight={900}
      insetTop={76}
      insetRight={12}
      insetBottom={12}
      insetLeft={12}
      chromeDensity="compact"
      onLayoutChange={setLayout}
      onClose={onClose}
      rootDataAttributes={{
        "data-studio-quick-access-surface": "true",
        "data-studio-shortcut-boundary": "true",
        "data-mobile": "false",
        "data-layout-authority": authority,
        "data-layout-failure": failure ?? undefined,
      }}
      contentClassName="overflow-hidden"
    >
      <p id={descriptionId} className="sr-only">
        자주 쓰는 명령을 실행하거나 표시 방식과 명령 순서를 편집합니다.
      </p>
      <StudioQuickAccessPalette
        state={state}
        catalog={catalog}
        onStateChange={onStateChange}
        onExecute={onExecute}
        className="h-full min-h-0 rounded-none border-0 shadow-none"
      />
    </StudioFloatingSurface>
  );
}
