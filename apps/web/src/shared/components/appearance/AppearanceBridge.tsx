import { useEffect, useLayoutEffect } from "react";

import { AppearanceDialogHost } from "./AppearanceDialogHost";

import { installAppearanceSync, setAppearanceScope } from "@/shared/lib/theme";

/** Apply at document level so dialogs portaled to body share the active workspace palette. */
export function AppearanceBridge({ studio }: { studio: boolean }) {
  useLayoutEffect(() => setAppearanceScope(studio ? "studio" : "site"), [studio]);
  useEffect(installAppearanceSync, []);
  return <AppearanceDialogHost />;
}
