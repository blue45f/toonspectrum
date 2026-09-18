import { formatI18nTemplate, translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { Suspense, useState } from "react";

import { studioColorPopoverTriggerHint } from "./studio-color-popover-hints";
import {
  StudioColorPopoverContent,
  preloadStudioColorPopover,
} from "./studio-page-lazy-ui";
import { StudioColorTrigger } from "./StudioColorTrigger";
import { StudioToolHintTarget } from "./StudioToolHint";

import type { StudioColorPopoverProps } from "./StudioColorPopover";

export type LazyStudioColorPopoverProps = Omit<
  StudioColorPopoverProps,
  "initialOpen"
> & {
  onLoadRecentColors?: () => void;
};

function StudioColorPopoverFallback({
  value,
  label = "색상 선택",
  purpose = "generic",
  className,
  triggerVariant = "swatch",
  triggerNone = false,
  triggerMixed = false,
  disabled = false,
  controlId,
  onWarm,
  onActivate,
  busy = false,
}: Pick<
  LazyStudioColorPopoverProps,
  | "value"
  | "label"
  | "purpose"
  | "className"
  | "triggerVariant"
  | "triggerNone"
  | "triggerMixed"
  | "disabled"
  | "controlId"
> & {
  onWarm?: () => void;
  onActivate?: () => void;
  busy?: boolean;
}) {
  const warm = () => {
    preloadStudioColorPopover();
    onWarm?.();
  };

  return (
    <span className={className ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioLazyColorPopover", "en", "relative inline-block {v0}"), { v0: String(className) }) : translateCurrentStaticSourceText("domains.creator.StudioLazyColorPopover", "en", "relative inline-block")}>
      <StudioToolHintTarget
        hint={studioColorPopoverTriggerHint(label, purpose)}
        preferredSide="bottom"
      >
        <StudioColorTrigger
          value={value}
          label={label}
          variant={triggerVariant}
          busy={busy}
          disabled={disabled}
          isNone={triggerNone}
          mixed={triggerMixed}
          controlId={controlId}
          onClick={onActivate}
          onFocus={warm}
          onMouseEnter={warm}
        />
      </StudioToolHintTarget>
    </span>
  );
}

export function LazyStudioColorPopover({
  onLoadRecentColors,
  ...props
}: LazyStudioColorPopoverProps) {
  const [activated, setActivated] = useState(false);
  const activate = () => {
    if (props.disabled) return;
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
