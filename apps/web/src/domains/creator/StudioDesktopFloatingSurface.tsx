import type { ReactNode } from "react";

import type {
  StudioFloatingSurfaceDock,
  StudioFloatingSurfaceLayout,
} from "./studio-floating-surface";
import { StudioFloatingSurface } from "./StudioFloatingSurface";
import { useStudioFloatingSurfaceLayout } from "./use-studio-floating-surface-layout";

export const STUDIO_DESKTOP_FLOATING_QUERY = "(min-width: 1024px)";

export interface StudioDesktopFloatingSurfaceProps {
  readonly surfaceId: string;
  readonly label: string;
  readonly defaultLayout: StudioFloatingSurfaceLayout;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly id?: string;
  readonly descriptionId?: string;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly insetTop?: number;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly minimizable?: boolean;
  readonly participatesInWorkspaceArrangement?: boolean;
  readonly allowedDockEdges?: readonly StudioFloatingSurfaceDock[];
  readonly rootDataAttributes?: Readonly<Record<`data-${string}`, string | undefined>>;
}

export function StudioDesktopFloatingSurface({
  surfaceId,
  label,
  defaultLayout,
  onClose,
  children,
  id,
  descriptionId,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  insetTop = 68,
  className,
  contentClassName,
  minimizable,
  participatesInWorkspaceArrangement,
  allowedDockEdges,
  rootDataAttributes,
}: StudioDesktopFloatingSurfaceProps) {
  const { layout, setLayout } = useStudioFloatingSurfaceLayout({
    surfaceId,
    defaultLayout,
  });
  return (
    <StudioFloatingSurface
      id={id}
      surfaceId={surfaceId}
      label={label}
      descriptionId={descriptionId}
      layout={layout}
      defaultLayout={defaultLayout}
      onLayoutChange={setLayout}
      onClose={onClose}
      minWidth={minWidth}
      minHeight={minHeight}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      insetTop={insetTop}
      className={className}
      contentClassName={contentClassName}
      minimizable={minimizable}
      participatesInWorkspaceArrangement={participatesInWorkspaceArrangement}
      allowedDockEdges={allowedDockEdges}
      rootDataAttributes={rootDataAttributes}
    >
      {children}
    </StudioFloatingSurface>
  );
}
