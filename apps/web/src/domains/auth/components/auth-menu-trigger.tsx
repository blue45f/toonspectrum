import { ChevronDown, LogIn } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/shared/lib/utils";

type AuthMenuTriggerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  variant: "signed-out" | "signed-in";
  label: string;
  initial?: string;
  imageSrc?: string | null;
  unreadMessageCount?: number;
};

/**
 * Shared trigger for both the eager auth fallback and the lazy account menu.
 * Keeping this stable prevents header shift while the auth bundle loads.
 */
export const AuthMenuTrigger = forwardRef<
  HTMLButtonElement,
  AuthMenuTriggerProps
>(function AuthMenuTrigger(
  {
    variant,
    label,
    initial = "U",
    imageSrc,
    unreadMessageCount = 0,
    className,
    type = "button",
    ...props
  },
  ref
) {
  const signedIn = variant === "signed-in";
  return (
    <button
      ref={ref}
      type={type}
      data-auth-trigger={variant}
      aria-label={label}
      className={cn(
        "group relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center overflow-visible rounded-[0.9rem] border border-line bg-card/85 text-sm font-semibold text-fg-2 shadow-sm outline-none transition-[border-color,background-color,color,box-shadow,transform] duration-200 ease-out-expo hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:border-accent/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.97] motion-reduce:transition-none",
        signedIn ? "px-1" : "gap-2 px-2.5 sm:px-3",
        className
      )}
      {...props}
    >
      {signedIn ? (
        <>
          <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[0.7rem] bg-accent font-display text-xs font-bold text-on-accent ring-1 ring-inset ring-on-accent/20 transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none">
            {imageSrc ? (
              <img src={imageSrc} alt="" className="size-full object-cover" />
            ) : (
              initial
            )}
          </span>
          <ChevronDown
            size={13}
            strokeWidth={2.2}
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full border-2 border-canvas bg-panel p-0.5 text-fg-3 transition-transform group-data-[state=open]:rotate-180"
          />
          {unreadMessageCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-canvas bg-danger shadow-sm"
            />
          ) : null}
        </>
      ) : (
        <>
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent ring-1 ring-inset ring-accent/15 transition-colors group-hover:bg-accent group-hover:text-on-accent">
            <LogIn size={15} strokeWidth={2.1} aria-hidden="true" />
          </span>
          <span className="hidden min-w-max whitespace-nowrap [text-wrap:nowrap] [word-break:keep-all] xl:inline-block">
            {label}
          </span>
        </>
      )}
    </button>
  );
});
