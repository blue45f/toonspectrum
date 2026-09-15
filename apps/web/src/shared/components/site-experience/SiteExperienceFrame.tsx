import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { SiteExperienceContext } from "./site-experience-context";
import { EXPERIENCE_MODE_KEY, parseExperienceMode, type ExperienceMode } from "./site-experience-policy";

import { readBrowserPreference, writeBrowserPreference } from "@/shared/lib/browser-preferences";

import "./site-experience.css";
import "./site-art-direction.css";


function SiteThemeAmbientArt() {
  return (
    <div className="site-experience-ambient" aria-hidden="true">
      <span className="site-theme-art site-theme-art--ribbon"><i /><i /><i /></span>
      <span className="site-theme-art site-theme-art--petals"><i /><i /><i /><i /><i /><i /></span>
      <span className="site-theme-art site-theme-art--orbit"><i /><i /><i /></span>
      <span className="site-theme-art site-theme-art--paper"><i /><i /><i /></span>
      <span className="site-theme-art site-theme-art--ink"><i /><i /></span>
      <svg className="site-theme-art site-theme-art--constellation" viewBox="0 0 520 300" preserveAspectRatio="none">
        <path d="M38 206 126 92l91 73 84-121 85 109 96-76" />
        <path d="m126 92 51-49 40 122 93 69 76-81" />
        <g><circle cx="38" cy="206" r="3" /><circle cx="126" cy="92" r="4" /><circle cx="177" cy="43" r="3" /><circle cx="217" cy="165" r="5" /><circle cx="301" cy="44" r="4" /><circle cx="310" cy="234" r="3" /><circle cx="386" cy="153" r="5" /><circle cx="482" cy="77" r="3" /></g>
      </svg>
    </div>
  );
}

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
        <SiteThemeAmbientArt />
        {children}
      </div>
    </SiteExperienceContext.Provider>
  );
}

/** Disabled routes do not access storage or install any web-only listeners. */
export function SiteExperienceFrame({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? <ActiveSiteExperienceFrame>{children}</ActiveSiteExperienceFrame> : <>{children}</>;
}
