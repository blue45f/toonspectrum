import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { SiteExperienceContext } from "./site-experience-context";
import { EXPERIENCE_MODE_KEY, parseExperienceMode, type ExperienceMode } from "./site-experience-policy";

import { readBrowserPreference, writeBrowserPreference } from "@/shared/lib/browser-preferences";

import "./site-experience.css";
import "./site-art-direction.css";

/** No root/body mutations: unmounting the web frame removes every visual effect. */
function ActiveSiteExperienceFrame({ children }: { children: ReactNode }) {
  const [mode, updateMode] = useState<ExperienceMode>(() => parseExperienceMode(
    readBrowserPreference(() => globalThis.localStorage, EXPERIENCE_MODE_KEY),
  ));
  const setMode = useCallback((next: ExperienceMode) => {
    updateMode(next);
    writeBrowserPreference(() => globalThis.localStorage, EXPERIENCE_MODE_KEY, next);
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== EXPERIENCE_MODE_KEY && event.key !== null) return;
      updateMode(parseExperienceMode(readBrowserPreference(() => globalThis.localStorage, EXPERIENCE_MODE_KEY)));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const settings = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return (
    <SiteExperienceContext.Provider value={settings}>
      <div data-site-experience={mode}>
        <div className="site-experience-ambient" aria-hidden="true" />
        {children}
      </div>
    </SiteExperienceContext.Provider>
  );
}

/** Disabled routes do not access storage or install any web-only listeners. */
export function SiteExperienceFrame({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? <ActiveSiteExperienceFrame>{children}</ActiveSiteExperienceFrame> : <>{children}</>;
}
