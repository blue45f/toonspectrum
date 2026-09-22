import { createContext, useContext } from "react";
import type { CampusBinding, CampusDistrict, CampusMode } from "@/shared/lib/spatial-campus/campus-model";

export interface CampusContextValue {
  readonly binding: CampusBinding;
  readonly district: CampusDistrict;
  readonly mode: CampusMode;
  readonly privacyMode: boolean;
  readonly privacySensitive: boolean;
  readonly returnHref: string | null;
  readonly setMode: (mode: CampusMode) => void;
  readonly setPrivacyMode: (active: boolean) => void;
}
export const CampusContext = createContext<CampusContextValue | null>(null);
export function useCampus(): CampusContextValue | null {
  return useContext(CampusContext);
}
