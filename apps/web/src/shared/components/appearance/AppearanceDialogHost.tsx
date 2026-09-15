import { lazy, Suspense } from "react";

import { useAppearanceDialog } from "@/shared/lib/appearance-dialog-store";

const AppearanceDialog = lazy(() => import("./AppearanceDialog").then((module) => ({ default: module.AppearanceDialog })));

/** App-owned so dismissal of a parent menu cannot unmount the theme dialog. */
export function AppearanceDialogHost() {
  const scope = useAppearanceDialog((state) => state.scope);
  const returnFocusElement = useAppearanceDialog((state) => state.returnFocusElement);
  const close = useAppearanceDialog((state) => state.close);
  return scope === null ? null : (
    <Suspense fallback={null}>
      <AppearanceDialog scope={scope} onClose={close} returnFocusElement={returnFocusElement} />
    </Suspense>
  );
}
