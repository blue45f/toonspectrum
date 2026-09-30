import { Footprints } from "lucide-react";
import { useInRouterContext, useNavigate } from "react-router-dom";

import { translateBilingualPair } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { startGuestSession } from "@/domains/auth/public/session/guest-session";

const SCOPE = "domains.auth.components.guest.entry";

type GuestEntryButtonProps = {
  /** Where to go after entering guest mode. Defaults to the workspace. */
  readonly next?: string;
  /** Called after the guest session starts (e.g. to close a parent modal). */
  readonly onDone?: () => void;
  readonly className?: string;
  readonly variant?: "primary" | "ghost";
};

function GuestEntryVisual({
  className,
  variant,
  label,
  hint,
  onClick,
}: {
  readonly className?: string;
  readonly variant: "primary" | "ghost";
  readonly label: string;
  readonly hint: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} — ${hint}`}
      className={cn(
        "group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold outline-none transition-[background-color,border-color,box-shadow,transform] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]",
        variant === "primary"
          ? "border border-accent bg-accent px-5 text-on-accent shadow-lg shadow-accent/15 hover:bg-accent-2"
          : "w-full border border-line bg-card px-4 text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg",
        className,
      )}
    >
      <Footprints
        size={17}
        aria-hidden="true"
        className="transition-transform group-hover:translate-x-0.5"
      />
      <span>{label}</span>
      {variant === "ghost" && (
        <span className="text-xs font-normal text-fg-3">· {hint}</span>
      )}
    </button>
  );
}

/** SPA navigation when a Router is present (the normal app case). */
function RouterGuestEntry({
  next,
  onDone,
  className,
  variant,
  label,
  hint,
}: Required<Pick<GuestEntryButtonProps, "next" | "variant">> &
  Pick<GuestEntryButtonProps, "onDone" | "className"> & {
    readonly label: string;
    readonly hint: string;
  }) {
  const navigate = useNavigate();
  return (
    <GuestEntryVisual
      className={className}
      variant={variant}
      label={label}
      hint={hint}
      onClick={() => {
        startGuestSession();
        onDone?.();
        navigate(next, { replace: true });
      }}
    />
  );
}

/**
 * Fallback when rendered outside a Router (isolated previews/tests).
 * Still starts the guest session; navigation becomes a plain location change.
 */
function PlainGuestEntry({
  next,
  onDone,
  className,
  variant,
  label,
  hint,
}: Required<Pick<GuestEntryButtonProps, "next" | "variant">> &
  Pick<GuestEntryButtonProps, "onDone" | "className"> & {
    readonly label: string;
    readonly hint: string;
  }) {
  return (
    <GuestEntryVisual
      className={className}
      variant={variant}
      label={label}
      hint={hint}
      onClick={() => {
        startGuestSession();
        onDone?.();
        try {
          globalThis.location?.assign(next);
        } catch {
          // Navigation is best-effort outside a Router.
        }
      }}
    />
  );
}

/**
 * One-click guest entry. Starts a local anonymous session and moves the
 * visitor into the product — no credentials, no waiting.
 *
 * Works with or without a React Router context: inside the app it navigates
 * as an SPA; outside one (previews, isolated tests) it falls back to a
 * plain location change instead of throwing.
 */
export function GuestEntryButton({
  next = "/home",
  onDone,
  className,
  variant = "ghost",
}: GuestEntryButtonProps) {
  const inRouter = useInRouterContext();
  const label = translateBilingualPair(SCOPE, "게스트로 시작하기", "Continue as guest");
  const hint = translateBilingualPair(
    SCOPE,
    "로그인 없이 둘러보기",
    "Explore without signing in",
  );
  const shared = { next, onDone, className, variant, label, hint };
  return inRouter
    ? <RouterGuestEntry {...shared} />
    : <PlainGuestEntry {...shared} />;
}
