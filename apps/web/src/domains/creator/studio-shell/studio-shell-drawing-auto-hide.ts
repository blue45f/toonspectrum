export const STUDIO_SHELL_DRAWING_AUTO_HIDE_RELEASE_MS = 650;

const DRAWING_CONTROL_SELECTOR = [
  "[data-studio-canvas-control]",
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
].join(",");

/** Only an actual canvas drawing surface may trigger pen-aware floating chrome suppression. */
export function isStudioShellDrawingSurfaceTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  if (!target.closest("[data-studio-canvas-viewport]")) return false;
  return target.closest(DRAWING_CONTROL_SELECTOR) === null;
}
