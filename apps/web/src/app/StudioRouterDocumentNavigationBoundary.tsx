import { useContext, type ReactNode } from "react";
import { UNSAFE_NavigationContext, type Navigator } from "react-router-dom";

import { shouldUseStudioDocumentNavigation } from "./studio-document-navigation";

type DocumentNavigationLocation = Pick<Location, "href" | "assign" | "replace">;

/**
 * Router Link guards run before navigator.push/replace. Intercepting here avoids
 * confusing React Router's own preventDefault with a user cancellation.
 */
export function StudioRouterDocumentNavigationBoundary({
  children,
  location = window.location,
}: {
  readonly children: ReactNode;
  readonly location?: DocumentNavigationLocation;
}) {
  const context = useContext(UNSAFE_NavigationContext);
  if (!context) throw new Error("Studio navigation boundary requires a Router.");
  const delegate = context.navigator;

  const documentTarget = (to: Parameters<Navigator["push"]>[0], state: unknown): string | null => {
    // A native document navigation cannot carry Router history state. Preserve
    // stateful transitions for the existing isolation-gate reload fallback.
    if (state !== null && state !== undefined) return null;
    const targetHref = delegate.createHref(to);
    if (!shouldUseStudioDocumentNavigation({ currentHref: location.href, targetHref })) return null;
    return new URL(targetHref, location.href).href;
  };
  const navigator: Navigator = {
    ...delegate,
    push(to, state, options) {
      const target = documentTarget(to, state);
      if (target !== null) location.assign(target);
      else delegate.push(to, state, options);
    },
    replace(to, state, options) {
      const target = documentTarget(to, state);
      if (target !== null) location.replace(target);
      else delegate.replace(to, state, options);
    },
  };

  return (
    <UNSAFE_NavigationContext.Provider value={{ ...context, navigator }}>
      {children}
    </UNSAFE_NavigationContext.Provider>
  );
}
