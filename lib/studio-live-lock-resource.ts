export type StudioLiveLockResourceScope =
  | { kind: "page"; pageId: string }
  | { kind: "element"; pageId: string; elementId: string };

/** Parse the canonical page/element hierarchy while leaving legacy resource IDs opaque. */
export function parseStudioLiveLockResourceScope(
  resourceId: string
): StudioLiveLockResourceScope | null {
  if (resourceId.startsWith("page:")) {
    const pageId = resourceId.slice("page:".length);
    return pageId.length > 0 ? { kind: "page", pageId } : null;
  }
  if (!resourceId.startsWith("element:")) return null;
  const identity = resourceId.slice("element:".length);
  const pageSeparator = identity.indexOf(":");
  if (pageSeparator <= 0 || pageSeparator === identity.length - 1) return null;
  return {
    kind: "element",
    pageId: identity.slice(0, pageSeparator),
    elementId: identity.slice(pageSeparator + 1),
  };
}

/**
 * A page mutation covers all of its elements; sibling elements remain independently editable.
 * Unknown/legacy resource shapes retain exact-match locking semantics.
 */
export function studioLiveLockResourcesConflict(left: string, right: string): boolean {
  if (left === right) return true;
  const leftResource = parseStudioLiveLockResourceScope(left);
  const rightResource = parseStudioLiveLockResourceScope(right);
  if (!leftResource || !rightResource || leftResource.pageId !== rightResource.pageId) {
    return false;
  }
  return leftResource.kind === "page" || rightResource.kind === "page";
}
