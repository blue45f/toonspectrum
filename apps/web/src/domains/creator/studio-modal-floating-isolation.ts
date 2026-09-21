interface FloatingIsolation {
  owners: number;
  attributes: ReadonlyArray<readonly [string, string | null]>;
}
const active = new WeakMap<HTMLElement, FloatingIsolation>();
const attributes = ["hidden", "inert", "aria-hidden"] as const;
const imposed = (attribute: string): string => attribute === "aria-hidden" ? "true" : "";

function acquire(element: HTMLElement): () => void {
  const existing = active.get(element);
  const snapshot = existing ?? { owners: 0, attributes: attributes.map((name) => [name, element.getAttribute(name)] as const) };
  snapshot.owners += 1;
  active.set(element, snapshot);
  if (!existing) for (const name of attributes) element.setAttribute(name, imposed(name));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    snapshot.owners -= 1;
    if (snapshot.owners !== 0) return;
    active.delete(element);
    for (const [name, value] of snapshot.attributes) {
      // Do not overwrite a newer application-owned attribute update.
      if (element.getAttribute(name) !== imposed(name)) continue;
      if (value === null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }
  };
}

/** Route-level floating notices can mount after a modal, outside the editor root.
 * Keep their React state/resources mounted, but suspend visual and input interference
 * until the last sheet closes. The modal's own controls and other dialogs are untouched.
 */
export function isolateStudioModalFloatingTargets(root: HTMLElement, dialog: HTMLElement): () => void {
  const document = root.ownerDocument;
  const held = new Map<HTMLElement, () => void>();
  const synchronize = () => {
    const targets = new Set(Array.from(document.querySelectorAll?.<HTMLElement>("[data-studio-shell-floating-target]") ?? [])
      .filter((target) => !root.contains(target) && !dialog.contains(target)
        && !target.contains(dialog) && !target.closest('[aria-modal="true"]')));
    for (const [target, release] of held) {
      if (targets.has(target)) continue;
      release(); held.delete(target);
    }
    for (const target of targets) {
      if (!held.has(target)) held.set(target, acquire(target));
    }
  };
  synchronize();
  const Observer = document.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(synchronize) : null;
  if (document.body) observer?.observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["data-studio-shell-floating-target", "aria-modal"],
  });
  return () => {
    observer?.disconnect();
    for (const release of held.values()) release();
    held.clear();
  };
}
