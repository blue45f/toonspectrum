/**
 * Studio-wide fallback for body-portalled modal focus restoration.
 * Observe only body's direct children, not the hot canvas subtree. A dialog that
 * restores its own focus always wins: retry only while focus is on the document.
 */
const MODAL_SELECTOR = '[aria-modal="true"]';
const FALLBACK_ANCHOR_SELECTOR = "[data-studio-main-menu-trigger]";

function asElement(node: Node | null): Element | null {
  return node?.nodeType === 1 ? (node as Element) : null;
}

function modalWithin(root: Element): Element | null {
  return root.matches(MODAL_SELECTOR) ? root : root.querySelector(MODAL_SELECTOR);
}

function insideModal(element: Element): boolean {
  return element.closest(MODAL_SELECTOR) !== null;
}

/**
 * Check eligibility without moving focus or relying on layout measurements.
 * getClientRects() would reject every element in jsdom, and offscreen controls
 * remain valid programmatic focus destinations. Native :disabled includes a
 * disabled fieldset while retaining the first-legend exception.
 */
export function canReturnStudioDialogFocus(
  element: Element | null,
  ownerDocument: Document,
): element is HTMLElement {
  if (!element || element.ownerDocument !== ownerDocument) return false;
  const candidate = element as HTMLElement;
  if (typeof candidate.focus !== "function" || !candidate.isConnected) return false;
  if (candidate === ownerDocument.body || candidate === ownerDocument.documentElement) return false;
  if (candidate.closest("[inert], [hidden], [aria-hidden='true']")) return false;
  if (candidate.matches(":disabled")) return false;

  const view = ownerDocument.defaultView;
  if (view) {
    const visibility = view.getComputedStyle(candidate).visibility;
    if (visibility === "hidden" || visibility === "collapse") return false;
    // A child's visibility may explicitly override its parent's; display:none
    // and content-visibility:hidden, unlike visibility, cannot be overridden.
    for (let ancestor: Element | null = candidate; ancestor; ancestor = ancestor.parentElement) {
      const style = view.getComputedStyle(ancestor);
      if (style.display === "none" || style.contentVisibility === "hidden") return false;
    }
  }
  // Closed details hide everything except the first summary and its descendants.
  for (let ancestor = candidate.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.tagName !== "DETAILS" || ancestor.hasAttribute("open")) continue;
    const summary = Array.from(ancestor.children).find((child) => child.tagName === "SUMMARY");
    if (!summary?.contains(candidate)) return false;
  }
  return true;
}

export function studioDialogFocusWasDropped(ownerDocument: Document): boolean {
  const active = ownerDocument.activeElement;
  return active === null || active === ownerDocument.body || active === ownerDocument.documentElement;
}

export function resolveStudioDialogOpener(
  ownerDocument: Document,
  lastOutsideFocus: Element | null,
): HTMLElement | null {
  const active = ownerDocument.activeElement;
  if (active && !insideModal(active) && canReturnStudioDialogFocus(active, ownerDocument)) return active;
  return canReturnStudioDialogFocus(lastOutsideFocus, ownerDocument) ? lastOutsideFocus : null;
}

/** Skip hidden desktop/mobile copies and temporarily disabled menu triggers. */
export function studioDialogFocusAnchor(ownerDocument: Document): HTMLElement | null {
  for (const anchor of ownerDocument.querySelectorAll<HTMLElement>(FALLBACK_ANCHOR_SELECTOR)) {
    if (canReturnStudioDialogFocus(anchor, ownerDocument)) return anchor;
  }
  return null;
}

/** Return true only when the browser actually accepted a focus destination. */
export function returnStudioDialogFocus(opener: Element | null, ownerDocument: Document): boolean {
  const candidates: (Element | null)[] = [
    opener,
    ...ownerDocument.querySelectorAll<HTMLElement>(FALLBACK_ANCHOR_SELECTOR),
  ];
  const attempted = new Set<Element>();
  for (const target of candidates) {
    if (!canReturnStudioDialogFocus(target, ownerDocument) || attempted.has(target)) continue;
    attempted.add(target);
    try {
      target.focus({ preventScroll: true });
    } catch {
      // A detached browsing context or a custom focus implementation can fail.
      // Continue to a verified fallback instead of reporting a false success.
      continue;
    }
    if (ownerDocument.activeElement === target) return true;
  }
  return false;
}

// Each owner document has its own lifecycle (preview windows / iframe hosts).
const installations = new WeakMap<Document, () => void>();

export function installStudioDialogFocusReturn(
  ownerDocument: Document | null = typeof document === "undefined" ? null : document,
): () => void {
  if (!ownerDocument) return () => undefined;
  const existing = installations.get(ownerDocument);
  if (existing) return existing;
  const view = ownerDocument.defaultView;
  const Observer = view?.MutationObserver;
  const body = ownerDocument.body;
  if (!body || !Observer || !view) return () => undefined;

  const openers = new Map<Element, HTMLElement | null>();
  let lastOutsideFocus: Element | null = resolveStudioDialogOpener(ownerDocument, null);
  let settleTimer: number | null = null;
  let settleFrame: number | null = null;
  let disposed = false;

  const cancelSettle = () => {
    if (settleTimer !== null) view.clearTimeout(settleTimer);
    if (settleFrame !== null) view.cancelAnimationFrame(settleFrame);
    settleTimer = null;
    settleFrame = null;
  };
  const restoreIfDropped = (opener: Element | null) => {
    if (!disposed && studioDialogFocusWasDropped(ownerDocument)) {
      returnStudioDialogFocus(opener, ownerDocument);
    }
  };
  // Backdrop mousedown can drop focus after the first restoration. Passive
  // cleanup may also release inert later. Recheck, never unconditionally focus.
  const restoreWhenSettled = (opener: Element | null) => {
    cancelSettle();
    restoreIfDropped(opener);
    settleTimer = view.setTimeout(() => {
      settleTimer = null;
      restoreIfDropped(opener);
    }, 0);
    settleFrame = view.requestAnimationFrame(() => {
      settleFrame = null;
      restoreIfDropped(opener);
    });
  };
  const onFocusIn = (event: Event) => {
    const target = asElement(event.target as Node | null);
    if (!target || insideModal(target) || target === body) return;
    lastOutsideFocus = target;
  };
  const observer = new Observer((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        const element = asElement(node);
        if (element && modalWithin(element)) {
          openers.set(element, resolveStudioDialogOpener(ownerDocument, lastOutsideFocus));
        }
      }
    }
    let pendingOpener: Element | null = null;
    let pendingRestore = false;
    for (const record of records) {
      for (const node of record.removedNodes) {
        const element = asElement(node);
        if (!element || !openers.has(element)) continue;
        // Preserve the established last-removed portal ownership contract.
        pendingOpener = openers.get(element) ?? null;
        pendingRestore = true;
        openers.delete(element);
      }
    }
    if (pendingRestore) restoreWhenSettled(pendingOpener);
  });
  ownerDocument.addEventListener("focusin", onFocusIn, true);
  observer.observe(body, { childList: true });

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    ownerDocument.removeEventListener("focusin", onFocusIn, true);
    observer.disconnect();
    cancelSettle();
    openers.clear();
    if (installations.get(ownerDocument) === dispose) installations.delete(ownerDocument);
  };
  installations.set(ownerDocument, dispose);
  return dispose;
}
