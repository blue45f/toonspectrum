import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

export type StudioDrawingPresentation = "integrated" | "app";

export const STUDIO_DRAWING_PRESENTATION_QUERY = "drawingShell";
export const STUDIO_DRAWING_PRESENTATION_SESSION_KEY =
  "toonstudio:drawing-presentation:v1";

function readExplicitPresentation(search: string): StudioDrawingPresentation | null {
  const values = new URLSearchParams(search).getAll(STUDIO_DRAWING_PRESENTATION_QUERY);
  if (values.length !== 1) return null;
  if (values[0] === "app") return "app";
  if (values[0] === "integrated") return "integrated";
  return null;
}

function readRememberedPresentation(): StudioDrawingPresentation {
  if (typeof window === "undefined") return "integrated";
  try {
    return window.sessionStorage.getItem(STUDIO_DRAWING_PRESENTATION_SESSION_KEY) === "app"
      ? "app"
      : "integrated";
  } catch {
    return "integrated";
  }
}

function persistPresentation(value: StudioDrawingPresentation): void {
  if (typeof window === "undefined") return;
  try {
    if (value === "app") {
      window.sessionStorage.setItem(STUDIO_DRAWING_PRESENTATION_SESSION_KEY, "app");
    } else {
      window.sessionStorage.removeItem(STUDIO_DRAWING_PRESENTATION_SESSION_KEY);
    }
  } catch {
    // Presentation preference is convenience state only. Drawing must stay usable when
    // session storage is unavailable (private mode, quota policy, embedded browser, etc.).
  }
}

/**
 * One drawing runtime, two shells.
 *
 * `app` changes only chrome/presentation. Document identity, brush engine, layer model,
 * autosave, collaboration and export all stay on the normal Studio runtime. The explicit
 * query is remembered for the lifetime of the tab/PWA window so navigation between Studio
 * documents does not suddenly re-introduce site chrome.
 */
export function useStudioDrawingPresentation(): StudioDrawingPresentation {
  const { search } = useLocation();
  const explicit = useMemo(() => readExplicitPresentation(search), [search]);
  const [remembered, setRemembered] = useState<StudioDrawingPresentation>(() =>
    explicit ?? readRememberedPresentation(),
  );

  useEffect(() => {
    if (!explicit) return;
    persistPresentation(explicit);
    setRemembered(explicit);
  }, [explicit]);

  return explicit ?? remembered;
}

export function withStudioDrawingPresentation(
  search: string | URLSearchParams,
  presentation: StudioDrawingPresentation,
): URLSearchParams {
  const next = new URLSearchParams(
    typeof search === "string" ? search : search.toString(),
  );
  next.set(STUDIO_DRAWING_PRESENTATION_QUERY, presentation);
  if (presentation === "app") {
    next.set("uiMode", "focus");
    next.set("startTool", "draw");
  }
  return next;
}
