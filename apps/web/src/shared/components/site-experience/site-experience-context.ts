import { createContext, useContext } from "react";

import type { ExperienceMode } from "./site-experience-model";

export interface SiteExperienceSettings {
  mode: ExperienceMode;
  setMode: (mode: ExperienceMode) => void;
}

export const SiteExperienceContext = createContext<SiteExperienceSettings | null>(null);
export function useSiteExperience() { return useContext(SiteExperienceContext); }
