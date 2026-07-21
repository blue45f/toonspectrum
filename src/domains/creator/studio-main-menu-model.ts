import type { StudioToolHintSpec } from "./studio-tool-hints";
import type { LucideIcon } from "lucide-react";

export type StudioMainMenuHintKey =
  | "color-vision:none"
  | "color-vision:grayscale"
  | "color-vision:protanopia"
  | "color-vision:deuteranopia"
  | "color-vision:tritanopia";

export interface StudioMainMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: LucideIcon;
  hint?: StudioToolHintSpec;
  /** Resolves rich copy inside the lazily loaded menu instead of the eager Studio graph. */
  hintKey?: StudioMainMenuHintKey;
  /** State for non-destructive view toggles such as canvas flip and grayscale preview. */
  checked?: boolean;
  /** Checked menu items default to checkbox semantics; exclusive choices use radio semantics. */
  selectionRole?: "checkbox" | "radio";
  disabled?: boolean;
  unavailableReason?: string;
  danger?: boolean;
  separatorAfter?: boolean;
  onSelect: () => void;
}

export interface StudioMainMenuGroup {
  id: string;
  label: string;
  items: readonly StudioMainMenuItem[];
}

export interface StudioMainMenuProps {
  groups: readonly StudioMainMenuGroup[];
  className?: string;
}
