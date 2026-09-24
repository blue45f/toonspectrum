export type StudioCreationMode =
  | "draw"
  | "story"
  | "character"
  | "background"
  | "assets"
  | "ai";

export const STUDIO_CREATION_MODE_EVENT = "toonstudio:creation-mode";

export function requestStudioCreationMode(mode: StudioCreationMode): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STUDIO_CREATION_MODE_EVENT, {
    detail: { mode },
  }));
}
