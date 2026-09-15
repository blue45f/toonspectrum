import { isValidStudioWorkspaceWorkId, studioCanvasPathname } from "./studio-workspace-route";

export const STUDIO_BROWSER_WORKSPACE_KEY = "toonspectrum.studio.browser-workspace.v1";
export const STUDIO_BROWSER_WORKSPACE_MAX_BYTES = 8_192;
export const STUDIO_BROWSER_SURFACES = ["navigator", "review", "reference"] as const;
export type StudioBrowserSurface = (typeof STUDIO_BROWSER_SURFACES)[number];
export type StudioCompanionOpenMode = "window" | "tab";
export type StudioBrowserOpenSurfaces = Partial<Record<StudioBrowserSurface, StudioCompanionOpenMode>>;

/** Portable preferences only. No document content, URLs or session credentials. */
export interface StudioBrowserWorkspaceProfile {
  readonly schema: "toonspectrum.studio.browser-workspace";
  readonly version: 1;
  readonly openMode: StudioCompanionOpenMode;
  readonly pinnedSurfaces: readonly StudioBrowserSurface[];
}

export function defaultStudioBrowserWorkspace(): StudioBrowserWorkspaceProfile {
  return { schema: "toonspectrum.studio.browser-workspace", version: 1, openMode: "window", pinnedSurfaces: [] };
}
export function decodeStudioBrowserWorkspace(text: string): StudioBrowserWorkspaceProfile | null {
  if (text.length > STUDIO_BROWSER_WORKSPACE_MAX_BYTES) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => !["schema", "version", "openMode", "pinnedSurfaces"].includes(key))) return null;
    if (record.schema !== "toonspectrum.studio.browser-workspace" || record.version !== 1) return null;
    if (record.openMode !== "window" && record.openMode !== "tab") return null;
    if (!Array.isArray(record.pinnedSurfaces) || record.pinnedSurfaces.length > STUDIO_BROWSER_SURFACES.length) return null;
    const surfaces: StudioBrowserSurface[] = [];
    for (const candidate of record.pinnedSurfaces) {
      if (typeof candidate !== "string" || !STUDIO_BROWSER_SURFACES.some((surface) => surface === candidate)) return null;
      const surface = candidate as StudioBrowserSurface;
      if (surfaces.includes(surface)) return null;
      surfaces.push(surface);
    }
    return { schema: record.schema, version: 1, openMode: record.openMode, pinnedSurfaces: surfaces };
  } catch {
    return null;
  }
}

export function encodeStudioBrowserWorkspace(profile: StudioBrowserWorkspaceProfile): string {
  return JSON.stringify({
    schema: "toonspectrum.studio.browser-workspace", version: 1,
    openMode: profile.openMode, pinnedSurfaces: [...profile.pinnedSurfaces],
  }, null, 2);
}

type ProfileStore = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> };
async function productProfileStore(): Promise<ProfileStore> {
  const { acquireStudioLocalDatabase } = await import("./studio-local-database-runtime");
  return (await acquireStudioLocalDatabase()).asAsyncKeyValueStore(STUDIO_BROWSER_WORKSPACE_KEY);
}
let writeTail: Promise<boolean> = Promise.resolve(true);
export async function loadStudioBrowserWorkspace(store?: ProfileStore): Promise<{ profile: StudioBrowserWorkspaceProfile; persistent: boolean }> {
  try {
    const text = await (store ?? await productProfileStore()).get("profile");
    return { profile: (text && decodeStudioBrowserWorkspace(text)) || defaultStudioBrowserWorkspace(), persistent: true };
  } catch { return { profile: defaultStudioBrowserWorkspace(), persistent: false }; }
}
export function saveStudioBrowserWorkspace(profile: StudioBrowserWorkspaceProfile, store?: ProfileStore): Promise<boolean> {
  const text = encodeStudioBrowserWorkspace(profile);
  const operation = writeTail.then(async () => {
    try {
      await (store ?? await productProfileStore()).set("profile", text);
      return true;
    } catch { return false; }
  });
  writeTail = operation;
  return operation;
}
/** Reopen a saved work; this is not a document transfer or live-sync link. */
export function studioBrowserWorkspaceEditorHref(workId: string | null, origin: string): string | null {
  if (!workId || !isValidStudioWorkspaceWorkId(workId)) return null;
  try {
    const base = new URL(origin);
    if (base.protocol !== "https:" && base.protocol !== "http:") return null;
    return new URL(studioCanvasPathname(workId), base.origin).href;
  } catch {
    return null;
  }
}
