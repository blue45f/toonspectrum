import type { NavigateFunction, NavigateOptions, To } from "react-router-dom";

/** Keep the acknowledged source mounted until review capture has read it back. */
export function studioReviewCaptureSaveNavigation(
  navigate: NavigateFunction,
  workId: string | null,
  preserveEditor = false,
): NavigateFunction {
  return (to: To | number, options?: NavigateOptions) => {
    if (typeof to === "number") return navigate(to);
    // New-work, recovery, and all ordinary save navigation retain their original behavior.
    if (preserveEditor && workId && to === `/create/${workId}`) return;
    return navigate(to, options);
  };
}
