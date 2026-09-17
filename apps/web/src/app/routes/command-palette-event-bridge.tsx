import { useEffect } from "react";

import { useUi } from "@/shared/lib/ui-store";

export const OPEN_COMMAND_PALETTE_EVENT = "toonspectrum:command-palette:open" as const;

/** Bridge route-level command-palette events into the shared UI store. */
export function CommandPaletteEventBridge() {
  const openCommandPalette = useUi((state) => state.openCommandPalette);

  useEffect(() => {
    const open = () => openCommandPalette();
    globalThis.addEventListener(OPEN_COMMAND_PALETTE_EVENT, open);
    return () => globalThis.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, open);
  }, [openCommandPalette]);

  return null;
}
