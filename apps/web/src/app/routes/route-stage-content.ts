const MEANINGFUL_SELECTOR = [
  "[data-route-ready]",
  "h1:not([data-route-semantic-heading])",
  "h2",
  "h3",
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "canvas",
  "img",
  "picture",
  "video",
  "iframe",
].join(",");

export function hasMeaningfulRouteContent(root: HTMLElement): boolean {
  for (const candidate of root.querySelectorAll(MEANINGFUL_SELECTOR)) {
    if (!candidate.closest("[data-route-semantic-heading], [data-route-recovery], [data-route-loading-fallback], [data-route-pending]")) return true;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textLength = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (parent?.closest("[data-route-semantic-heading], [data-route-recovery], [data-route-loading-fallback], [data-route-pending]")) continue;
    textLength += node.textContent?.trim().length ?? 0;
    if (textLength >= 32) return true;
  }
  return false;
}
