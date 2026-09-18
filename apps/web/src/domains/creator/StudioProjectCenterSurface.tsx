import {
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import type { StudioFloatingSurfaceLayout } from "./studio-floating-surface";
import { StudioDesktopFloatingSurface } from "./StudioDesktopFloatingSurface";

const PROJECT_CENTER_DEFAULT_LAYOUT: StudioFloatingSurfaceLayout = {
  version: 2,
  xRatio: 1,
  yRatio: 0.04,
  width: 704,
  height: 760,
  dock: "right",
  positionLocked: false,
  sizeLocked: false,
};

export interface StudioProjectCenterSurfaceProps {
  readonly desktop: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

function handleProjectAction(
  event: ReactMouseEvent<HTMLDivElement>,
  onClose: () => void,
): void {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (button && !button.dataset.projectKeepOpen) {
    globalThis.setTimeout(onClose, 0);
  }
}
export function StudioProjectCenterSurface({
  desktop,
  onClose,
  children,
}: StudioProjectCenterSurfaceProps) {
  const content = (
    <div
      onClickCapture={(event) => handleProjectAction(event, onClose)}
      className={desktop
        ? translateCurrentStaticSourceText("domains.creator.StudioProjectCenterSurface", "en", "grid h-full min-h-0 grid-cols-2 gap-2 overflow-y-auto overscroll-contain p-2.5 [scrollbar-gutter:stable] @xl:grid-cols-3 [&>button]:min-h-11 [&>button]:min-w-0 [&>button]:justify-start [&>label]:min-h-11 [&>label]:min-w-0 [&>label]:justify-start")
        : translateCurrentStaticSourceText("domains.creator.StudioProjectCenterSurface", "en", "fixed inset-x-2 top-12 z-[100] grid max-h-[calc(100dvh-4rem)] grid-cols-2 gap-2 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel/95 p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl [scrollbar-gutter:stable] sm:grid-cols-3 sm:inset-x-auto sm:right-3 sm:w-[min(44rem,calc(100vw-1.5rem))] [&>button]:min-h-11 [&>button]:justify-start [&>label]:min-h-11 [&>label]:justify-start")}
    >
      {children}
    </div>
  );

  if (!desktop) {
    return (
      <div
        id="studio-project-actions-menu"
        data-studio-project-actions-menu="true"
        role="dialog"
        aria-label={translateCurrentStaticSourceText("domains.creator.StudioProjectCenterSurface", "ko", "프로젝트 센터")}
      >
        {content}
      </div>
    );
  }
  return (
    <StudioDesktopFloatingSurface
      id="studio-project-actions-menu"
      surfaceId="project-center"
      label={translateCurrentStaticSourceText("domains.creator.StudioProjectCenterSurface", "ko", "프로젝트 센터")}
      defaultLayout={PROJECT_CENTER_DEFAULT_LAYOUT}
      onClose={onClose}
      minWidth={440}
      minHeight={360}
      maxWidth={980}
      maxHeight={1100}
      contentClassName="min-h-0 overflow-hidden"
      rootDataAttributes={{
        "data-studio-project-actions-menu": "true",
      }}
    >
      {content}
    </StudioDesktopFloatingSurface>
  );
}
