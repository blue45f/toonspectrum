import { Suspense, useState } from "react";

import {
  StudioColorPopoverContent,
  preloadStudioColorPopover,
} from "./studio-page-lazy-ui";

import type { StudioColorPopoverProps } from "./StudioColorPopover";

export type LazyStudioColorPopoverProps = Omit<
  StudioColorPopoverProps,
  "initialOpen"
> & {
  onLoadRecentColors?: () => void;
};

function StudioColorPopoverFallback({
  value,
  title,
  className,
  onWarm,
  onActivate,
  busy = false,
}: Pick<LazyStudioColorPopoverProps, "value" | "title" | "className"> & {
  onWarm?: () => void;
  onActivate?: () => void;
  busy?: boolean;
}) {
  const warm = () => {
    preloadStudioColorPopover();
    onWarm?.();
  };

  return (
    <span className={className ? `relative inline-block ${className}` : "relative inline-block"}>
      <button
        type="button"
        aria-label={title ?? "색상 선택"}
        aria-expanded={false}
        aria-busy={busy || undefined}
        title={title ?? "색상 선택"}
        onClick={onActivate}
        onFocus={warm}
        onMouseEnter={warm}
        className="h-7 w-7 rounded border border-line cursor-pointer"
        style={{ background: value }}
      />
    </span>
  );
}

export function LazyStudioColorPopover({
  onLoadRecentColors,
  ...props
}: LazyStudioColorPopoverProps) {
  const [activated, setActivated] = useState(false);
  const activate = () => {
    onLoadRecentColors?.();
    setActivated(true);
  };

  if (!activated) {
    return (
      <StudioColorPopoverFallback
        {...props}
        onWarm={onLoadRecentColors}
        onActivate={activate}
      />
    );
  }

  return (
    <Suspense fallback={<StudioColorPopoverFallback {...props} busy />}>
      <StudioColorPopoverContent {...props} initialOpen />
    </Suspense>
  );
}
