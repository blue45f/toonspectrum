import { createContext, useContext } from "react";

/** The Host supplies its registry-owned preload capability without exposing the registry to UI. */
export const StudioFilterDialogIntentContext = createContext<() => void>(() => undefined);

export function useStudioFilterDialogIntent(): () => void {
  return useContext(StudioFilterDialogIntentContext);
}
