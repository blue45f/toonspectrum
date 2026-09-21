import type {
  StudioQuickAccessCommandMeta,
  StudioQuickAccessState,
} from "./studio-quick-access";
import type { RefObject } from "react";

export interface StudioQuickAccessSurfaceProps {
  readonly launchPoint?: { readonly x: number; readonly y: number } | null;
  readonly state: StudioQuickAccessState;
  readonly catalog: readonly StudioQuickAccessCommandMeta[];
  readonly isMobile: boolean;
  readonly onStateChange: (state: StudioQuickAccessState) => void;
  readonly onExecute: (commandId: string, setId: string) => void;
  readonly onClose: () => void;
}

export interface StudioQuickAccessSurfaceLeafProps
  extends Omit<StudioQuickAccessSurfaceProps, "isMobile"> {
  readonly descriptionId: string;
  readonly surfaceRef: RefObject<HTMLDivElement | null>;
}
