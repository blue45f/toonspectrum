import type { LucideIcon } from "lucide-react";

export interface StudioMainMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: LucideIcon;
  /** State for non-destructive view toggles such as canvas flip and grayscale preview. */
  checked?: boolean;
  disabled?: boolean;
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
