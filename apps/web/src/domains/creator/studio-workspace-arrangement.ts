import type { StudioFloatingSurfaceLayout } from "./studio-floating-surface";

export interface StudioWorkspaceRegionSnapshot {
  readonly detached: boolean;
  readonly layout: StudioFloatingSurfaceLayout;
}
export interface StudioWorkspaceRegionController {
  readonly capture: () => StudioWorkspaceRegionSnapshot;
  readonly restore: (snapshot: StudioWorkspaceRegionSnapshot) => void;
  readonly attach: () => void;
  readonly detach: () => void;
}
export const STUDIO_WORKSPACE_ARRANGEMENT_KEY = "toonspectrum:studio:arrangement:v1";
const regions = new Map<string, StudioWorkspaceRegionController>();
const listeners = new Set<() => void>();
let arranging = false;

export function studioWorkspaceArrangingSnapshot(): boolean { return arranging; }
export function subscribeStudioWorkspaceArranging(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setStudioWorkspaceArranging(value: boolean): void {
  if (arranging === value) return;
  arranging = value;
  for (const listener of [...listeners]) listener();
}
export function registerStudioWorkspaceRegion(
  id: string,
  controller: StudioWorkspaceRegionController,
): () => void {
  regions.set(id, controller);
  return () => { if (regions.get(id) === controller) regions.delete(id); };
}
export function arrangeStudioWorkspaceRegions(action: "attach" | "detach"): void {
  for (const controller of [...regions.values()]) controller[action]();
}
function sessionStorageOrNull(): Storage | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
}
export function readStudioWorkspaceRegionDetached(
  id: string,
  storage: Pick<Storage, "getItem"> | null = sessionStorageOrNull(),
): boolean {
  try { return storage?.getItem(`${STUDIO_WORKSPACE_ARRANGEMENT_KEY}:${id}`) === "detached"; }
  catch { return false; }
}
export function writeStudioWorkspaceRegionDetached(
  id: string,
  detached: boolean,
  storage: Pick<Storage, "setItem"> | null = sessionStorageOrNull(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(`${STUDIO_WORKSPACE_ARRANGEMENT_KEY}:${id}`, detached ? "detached" : "attached");
    return true;
  } catch { return false; }
}
/** UI preferences only: never serializes document content, credentials or canvas history. */
export function saveStudioWorkspaceArrangement(
  storage: Pick<Storage, "setItem"> | null = sessionStorageOrNull(),
): boolean {
  try {
    if (!storage) return false;
    const entries = [...regions].map(([id, controller]) => ({ id, ...controller.capture() }));
    storage.setItem(STUDIO_WORKSPACE_ARRANGEMENT_KEY, JSON.stringify({ version: 1, entries }));
    return true;
  } catch { return false; }
}
export function restoreStudioWorkspaceArrangement(
  storage: Pick<Storage, "getItem"> | null = sessionStorageOrNull(),
): boolean {
  try {
    const raw = storage?.getItem(STUDIO_WORKSPACE_ARRANGEMENT_KEY);
    if (!raw || raw.length > 100_000) return false;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1
      || !("entries" in saved) || !Array.isArray(saved.entries) || saved.entries.length > 100) return false;
    // Validate the complete envelope before applying anything. Each owner normalizes geometry.
    const entries: { id: string; detached: boolean; layout: StudioFloatingSurfaceLayout }[] = [];
    for (const entry of saved.entries as unknown[]) {
      if (!entry || typeof entry !== "object" || !("id" in entry) || typeof entry.id !== "string"
        || !("detached" in entry) || typeof entry.detached !== "boolean"
        || !("layout" in entry) || !entry.layout || typeof entry.layout !== "object") return false;
      entries.push(entry as { id: string; detached: boolean; layout: StudioFloatingSurfaceLayout });
    }
    let restored = false;
    for (const entry of entries) {
      const controller = regions.get(entry.id);
      if (!controller) continue;
      controller.restore(entry);
      restored = true;
    }
    return restored;
  } catch { return false; }
}
