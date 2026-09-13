import { STUDIO_DRAFT_CANVAS_PATHNAME, STUDIO_HOME_PATHNAME } from "@/domains/creator/studio-workspace-route";

const LEGACY_STUDIO_EDITOR_QUERY_KEYS = new Set([
  "id",
  "remix",
  "mode",
  "preset",
  "room",
  "page",
  "tool",
  "surface",
  "document",
  "demo",
  "installMarketResource",
]);

export function readInitialDocumentPathname(): string | null {
  try {
    return typeof globalThis.location?.pathname === "string"
      ? globalThis.location.pathname
      : null;
  } catch {
    return null;
  }
}

/** Redirect a legacy `/studio` editor query to the canonical draft-canvas route. */
export function legacyStudioEditorHref(pathname: string, search: string): string | null {
  if (pathname !== STUDIO_HOME_PATHNAME || search.length === 0) return null;
  const params = new URLSearchParams(search);
  const hasLegacyEditorState = [...params.keys()].some((key) =>
    LEGACY_STUDIO_EDITOR_QUERY_KEYS.has(key)
  );
  return hasLegacyEditorState ? `${STUDIO_DRAFT_CANVAS_PATHNAME}${search}` : null;
}

