import { create } from "zustand";

import type { AppearanceScope } from "./theme-presets";

interface AppearanceDialogState {
  scope: AppearanceScope | null;
  returnFocusElement: HTMLButtonElement | null;
  open: (scope: AppearanceScope, trigger: HTMLButtonElement) => void;
  close: () => void;
}

/** Ephemeral UI state, never stored with user preferences or documents. */
export const useAppearanceDialog = create<AppearanceDialogState>((set) => ({
  scope: null,
  returnFocusElement: null,
  open: (scope, trigger) => {
    const parentDialog = trigger.closest('[role="dialog"][id]');
    const launcher = parentDialog
      ? Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-controls]")).find((button) => button.getAttribute("aria-controls") === parentDialog.id)
      : null;
    set({ scope, returnFocusElement: launcher ?? trigger });
  },
  close: () => set({ scope: null }),
}));
