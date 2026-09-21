const OPEN_ALL_TOOLS = "studio:open-all-tools";

/** Transient UI request; the mounted editor's existing rail remains command authority. */
export function requestStudioAllTools(trigger: HTMLElement): void {
  trigger.dispatchEvent(new CustomEvent(OPEN_ALL_TOOLS, { bubbles: true, detail: { trigger } }));
}

export function subscribeStudioAllTools(
  scope: HTMLElement,
  open: (trigger: HTMLElement) => void,
): () => void {
  const listener = (event: Event) => {
    const detail: unknown = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== "object" || !("trigger" in detail)) return;
    const trigger = detail.trigger;
    if (!(trigger instanceof HTMLElement) || !scope.contains(trigger)) return;
    event.stopPropagation();
    open(trigger);
  };
  scope.addEventListener(OPEN_ALL_TOOLS, listener);
  return () => scope.removeEventListener(OPEN_ALL_TOOLS, listener);
}
