import { Navigate, useLocation } from "react-router-dom";

import type { ReactNode } from "react";

import { useSession } from "@/domains/auth/public/session/auth-session-store";

/**
 * Auth gate for the personal workspace surfaces (/home, /team, /hub).
 *
 * The workspace is "my home" — it only makes sense for signed-in creators.
 * Visitors are sent to the public front door (/) which already implements
 * the smart routing: authenticated users are forwarded to /home from there.
 *
 * This removes the confusing state where a logged-out visitor lands on an
 * empty workspace dashboard that looks like a duplicated/broken homepage.
 */
export function WorkspaceHomeRoute({ children }: { readonly children: ReactNode }) {
  const { ready, status } = useSession();
  const { pathname, search, hash } = useLocation();

  if (!ready) {
    return (
      <section
        aria-label="ToonStudio"
        aria-busy="true"
        className="relative grid min-h-[70dvh] place-items-center overflow-hidden bg-canvas px-5"
      >
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/70 to-canvas" />
        <div className="relative grid max-w-md gap-4 text-center">
          <span className="mx-auto size-12 animate-pulse rounded-2xl border border-accent/35 bg-accent-soft shadow-[0_0_40px_var(--color-accent-soft)] motion-reduce:animate-none" />
          <p className="font-display text-sm font-bold tracking-[0.12em] text-fg-2">TOONSTUDIO</p>
          <p className="text-sm text-fg-3">창작 공간을 준비하고 있습니다.</p>
        </div>
      </section>
    );
  }

  if (status !== "authenticated") {
    // Preserve the destination so a post-login return can be implemented later.
    return <Navigate to={{ pathname: "/", search: `?next=${encodeURIComponent(`${pathname}${search}${hash}`)}` }} replace />;
  }

  return <>{children}</>;
}
