import { formatI18nTemplate, translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { isValidElement } from "react";
import { createPortal } from "react-dom";

import {
  type StudioFloatingSurfaceDock,
  type StudioFloatingSurfaceLayout,
} from "./studio-floating-surface";
import { StudioFloatingSurface } from "./StudioFloatingSurface";
import { StudioWorkspaceRegion } from "./StudioWorkspaceRegion";
import { useStudioFloatingSurfaceLayout } from "./use-studio-floating-surface-layout";

import type { ReactElement, ReactNode } from "react";

export interface StudioDetachablePanelSlotProps {
  readonly detached: boolean;
  readonly surfaceId: string;
  readonly label: string;
  readonly defaultLayout: StudioFloatingSurfaceLayout;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly insetTop?: number;
  readonly allowedDockEdges?: readonly StudioFloatingSurfaceDock[];
}

/**
 * Existing explicit detach controls keep their original portal and close semantics. The authored
 * panel additionally participates in workspace arrangement without remounting its content. While
 * the original detached window is open, the arrangement wrapper is suspended to avoid two shells.
 */
export function StudioDetachablePanelSlot({
  detached,
  surfaceId,
  label,
  defaultLayout,
  onClose,
  children,
  minWidth = 300,
  minHeight = 320,
  maxWidth = 900,
  maxHeight = 1_100,
  insetTop = 76,
  allowedDockEdges = ["left", "right"],
}: StudioDetachablePanelSlotProps): ReactElement {
  const { layout, setLayout, authority, failure } = useStudioFloatingSurfaceLayout({
    surfaceId,
    defaultLayout,
    enabled: detached,
  });

  // The authored owner still controls visibility. A hidden sidebar must not leave an empty
  // floating shell behind; keep its placement preference for the next explicit open.
  const authoredHidden = isValidElement<{ className?: string }>(children)
    && (children.props.className ?? "").split(/\s+/).includes("lg:hidden");
  const body = !detached || typeof document === "undefined" ? <>{children}</> : createPortal(
    <StudioFloatingSurface
      surfaceId={surfaceId}
      label={label}
      layout={layout}
      defaultLayout={defaultLayout}
      minWidth={minWidth}
      minHeight={minHeight}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      insetTop={insetTop}
      insetRight={12}
      insetBottom={12}
      insetLeft={12}
      snapDistance={12}
      allowedDockEdges={allowedDockEdges}
      onLayoutChange={setLayout}
      onClose={onClose}
      rootDataAttributes={{
        "data-studio-detachable-surface": surfaceId,
        "data-studio-floating-layout-authority": authority,
        "data-studio-floating-layout-failure": failure ?? undefined,
      }}
      className="border-line-strong"
      contentClassName="flex min-h-0 min-w-0 flex-1 overflow-auto"
    >
      {children}
    </StudioFloatingSurface>,
    document.body,
  );

  return (
    <StudioWorkspaceRegion
      surfaceId={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioDetachablePanelSlot", "en", "panel-{v0}"), { v0: String(surfaceId) })}
      label={label}
      disabled={detached || authoredHidden}
      defaultLayout={defaultLayout}
      minWidth={minWidth}
      minHeight={minHeight}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      insetTop={insetTop}
      allowedDockEdges={allowedDockEdges}
    >
      {body}
    </StudioWorkspaceRegion>
  );
}
