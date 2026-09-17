import type { ButtonHTMLAttributes, ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-checked" | "onChange" | "role"
> & {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
};

type SwitchIndicatorProps = {
  readonly checked: boolean;
  readonly className?: string;
};

/** Non-interactive visual authority for row-level switches whose whole row is the hit target. */
export function SwitchIndicator({ checked, className }: SwitchIndicatorProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      data-ui-switch-track="true"
      data-state={checked ? "on" : "off"}
      className={cn(
        "relative block h-6 w-11 shrink-0 rounded-full border transition-colors duration-150",
        "motion-reduce:transition-none",
        checked
          ? "border-accent bg-accent"
          : "border-line-strong bg-raised",
        className,
      )}
    >
      <span
        data-ui-switch-thumb="true"
        className={cn(
          "absolute left-0.5 top-0.5 size-5 rounded-full shadow-sm",
          "transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          checked
            ? "translate-x-5 bg-on-accent"
            : "translate-x-0 bg-fg-2",
        )}
      />
    </span>
  );
}

/**
 * Canonical binary switch for ToonSpectrum UI.
 *
 * Geometry is intentionally fixed: 44×24px track, 20px thumb, 2px origin,
 * and 20px travel. Keep the explicit left/top origin; relying on an absolutely
 * positioned thumb's static position is browser/layout dependent and has caused
 * clipped or overflowing switches in narrow Studio panels.
 *
 * The button itself keeps a 44×44px minimum hit target while the visual track
 * stays compact. Callers must provide an accessible name via aria-label or
 * aria-labelledby.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  className,
  type = "button",
  ...props
}: SwitchProps): ReactElement {
  return (
    <button
      {...props}
      type={type}
      role="switch"
      aria-checked={checked}
      data-ui-switch="true"
      data-state={checked ? "on" : "off"}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-0 align-middle",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented && !disabled) onCheckedChange(!checked);
      }}
    >
      <SwitchIndicator checked={checked} />
    </button>
  );
}
