export const STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT =
  "toonspectrum:studio-shell-floating-layout-open";

export function requestStudioShellFloatingLayoutManagerOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(STUDIO_SHELL_FLOATING_LAYOUT_OPEN_EVENT));
}
