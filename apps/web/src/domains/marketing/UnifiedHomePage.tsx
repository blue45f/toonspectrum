import { Navigate, useLocation } from "react-router-dom";

import { useSession } from "@/compat/auth-session-store";
import { CreatorHomePage } from "@/domains/creator-resources/CreatorHomePage";

/**
 * One front door for ToonStudio.
 * Signed-in creators continue into the personal workspace while visitors see
 * the public product story. This removes the previous root/home split without
 * duplicating workspace chrome inside the marketing shell.
 */
export function UnifiedHomePage() {
  const { ready, status } = useSession();
  const { search } = useLocation();

  if (status === "authenticated") {
    return <Navigate to={{ pathname: "/home", search }} replace />;
  }

  if (!ready) {
    return (
      <section
        aria-label="ToonStudio"
        aria-busy="true"
        className="relative grid min-h-[70dvh] place-items-center overflow-hidden bg-canvas px-5"
      >
        <img
          src="/brand/toonstudio-visual-identity/creator-lobby-hero.webp"
          alt=""
          aria-hidden="true"
          decoding="async"
          className="absolute inset-0 size-full object-cover opacity-35"
        />
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/70 to-canvas" />
        <div className="relative grid max-w-md gap-4 text-center">
          <span className="mx-auto size-12 animate-pulse rounded-2xl border border-accent/35 bg-accent-soft shadow-[0_0_40px_var(--color-accent-soft)] motion-reduce:animate-none" />
          <p className="font-display text-sm font-bold tracking-[0.12em] text-fg-2">TOONSTUDIO</p>
          <p className="text-sm text-fg-3">창작 공간을 준비하고 있습니다.</p>
        </div>
      </section>
    );
  }

  return <CreatorHomePage />;
}

export default UnifiedHomePage;
