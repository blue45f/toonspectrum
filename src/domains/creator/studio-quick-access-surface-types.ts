import type { RefObject } from "react";

import type {
  StudioQuickAccessCommandMeta,
  StudioQuickAccessState,
} from "./studio-quick-access";

export interface StudioQuickAccessSurfaceProps {
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
