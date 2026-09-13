import type { StudioFloatingSurfaceLayout } from "./studio-floating-surface";

export interface StudioWorkspaceRegionSnapshot {
  readonly detached: boolean;
  readonly collapsed?: boolean;
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
export function captureStudioWorkspaceArrangement(): string {
  const entries = [...regions].map(([id, controller]) => ({ id, ...controller.capture() }));
  return JSON.stringify({ version: 1, entries });
}
export function decodeStudioWorkspaceArrangement(raw: string): ({ id: string } & StudioWorkspaceRegionSnapshot)[] | null {
  try {
    if (!raw || raw.length > 100_000) return null;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || !("version" in saved) || saved.version !== 1
      || !("entries" in saved) || !Array.isArray(saved.entries) || saved.entries.length > 100) return null;
    const ids = new Set<string>();
    for (const entry of saved.entries) {
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string"
        || !/^[A-Za-z0-9][A-Za-z0-9._:~-]{0,127}$/.test(entry.id) || ids.has(entry.id)
        || typeof entry.detached !== "boolean"
        || (entry.collapsed !== undefined && typeof entry.collapsed !== "boolean")) return null;
      const layout = entry.layout;
      if (!layout || typeof layout !== "object" || layout.version !== 2
        || !["free", "left", "right", "top", "bottom"].includes(layout.dock)
        || typeof layout.positionLocked !== "boolean" || typeof layout.sizeLocked !== "boolean"
        || ![layout.xRatio, layout.yRatio].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
        || ![layout.width, layout.height].every(value => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10_000)) return null;
      ids.add(entry.id);
    }
    return saved.entries;
  } catch { return null; }
}
export function applyStudioWorkspaceArrangement(raw: string): boolean {
  const entries = decodeStudioWorkspaceArrangement(raw);
  if (!entries) return false;
  let restored = false;
  for (const entry of entries) {
    const controller = regions.get(entry.id);
    if (!controller) continue;
    controller.restore(entry);
    restored = true;
  }
  return restored;
}

export function saveStudioWorkspaceArrangement(
  storage: Pick<Storage, "setItem"> | null = sessionStorageOrNull(),
): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STUDIO_WORKSPACE_ARRANGEMENT_KEY, captureStudioWorkspaceArrangement());
    return true;
  } catch { return false; }
}
export function restoreStudioWorkspaceArrangement(
  storage: Pick<Storage, "getItem"> | null = sessionStorageOrNull(),
): boolean {
  try {
    const raw = storage?.getItem(STUDIO_WORKSPACE_ARRANGEMENT_KEY);
    return raw ? applyStudioWorkspaceArrangement(raw) : false;
  } catch { return false; }
}
