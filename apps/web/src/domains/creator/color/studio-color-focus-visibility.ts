type VerticalBounds = Pick<DOMRect, "top" | "bottom">;

/** Scroll only enough to reveal a control; oversized controls align at the top. */
export function studioColorControlScrollDelta(control: VerticalBounds, viewport: VerticalBounds): number {
  if (![control.top, control.bottom, viewport.top, viewport.bottom].every(Number.isFinite)) return 0;
  const top = viewport.top + 8;
  const bottom = viewport.bottom - 8;
  if (bottom <= top) return 0;
  if (control.top < top || control.bottom - control.top > bottom - top) return control.top - top;
  return Math.max(0, control.bottom - bottom);
}

/** Preserve focus, selection and document position when the visual keyboard resizes a sheet. */
export function revealStudioColorFocusedControl(root: HTMLElement | null): void {
  const focused = root?.ownerDocument.activeElement;
  if (!(focused instanceof HTMLElement) || !root?.contains(focused)) return;
  const scroller = focused.closest<HTMLElement>("[data-studio-color-scroll]");
  if (!scroller || !root.contains(scroller) || !focused.isConnected) return;
  scroller.scrollTop += studioColorControlScrollDelta(focused.getBoundingClientRect(), scroller.getBoundingClientRect());
}
