import { useEffect, useSyncExternalStore } from "react";
import {
  ensureSharedStudioRecentColorsLoaded, getStudioRecentColorsServerSnapshot,
  getStudioRecentColorsSnapshot, getStudioRecentColorsStatus, getStudioRecentColorsServerStatus,
  rememberSharedStudioRecentColor, retrySharedStudioRecentColorsPersistence, subscribeStudioRecentColors,
} from "../studio-recent-colors-bridge";

/** Read adapter for the existing owner, not another persistent store. */
export function useStudioSharedColorHistory(override?: readonly string[]) {
  const shared = useSyncExternalStore(subscribeStudioRecentColors, getStudioRecentColorsSnapshot, getStudioRecentColorsServerSnapshot);
  const status = useSyncExternalStore(subscribeStudioRecentColors, getStudioRecentColorsStatus, getStudioRecentColorsServerStatus);
  useEffect(() => { if (override === undefined) ensureSharedStudioRecentColorsLoaded(); }, [override]);
  return {
    colors: override ?? shared,
    status: override === undefined ? status : "saved" as const,
    ensureLoaded: ensureSharedStudioRecentColorsLoaded,
    rememberColor: rememberSharedStudioRecentColor,
    retry: retrySharedStudioRecentColorsPersistence,
  };
}
