/**
 * `InspectorSection` — the progressive-disclosure primitive for the right inspector.
 *
 * Advanced controls stay reachable without competing with the 5~9 essential controls that should
 * explain the current task at a glance. The header now names the disclosure as "세부 설정" so a
 * first-time artist understands that a closed row is optional depth, not a disabled feature.
 */

import { ChevronDown } from "lucide-react";
import { Suspense, useEffect, useId, useRef, useState } from "react";

import { inspectorSectionLabel } from "./studio-inspector-density";
import { isStudioInspectorFocusTarget } from "./studio-inspector-focus";
import {
  scrollStudioInspectorTargetIntoView,
  useStudioInspectorFocusRequest,
} from "./studio-inspector-focus-effect";
import {
  readStudioInspectorSectionOpen,
  writeStudioInspectorSectionOpen,
} from "./studio-inspector-section-state";

import type { StudioInspectorFocusTarget } from "./studio-inspector-focus";
import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

export interface StudioInspectorSectionProps {
  /** Must exist in `STUDIO_INSPECTOR_DENSITY` as an advanced-tier group id. */
  sectionId: string;
  /** Defaults to the canonical label from the density table. */
  title?: string;
  /** Opens on mount. Reserved for sections a workspace profile promotes. */
  defaultOpen?: boolean;
  /** Forces open — used when search or a deep link points into the section. */
  forceOpen?: boolean;
  /** Number of controls inside that currently hold a non-default value. */
  activeCount?: number;
  loadingLabel?: string;
  children: ReactNode;
}

export function StudioInspectorSection({
  sectionId,
  title,
  defaultOpen = false,
  forceOpen = false,
  activeCount = 0,
  loadingLabel = "설정을 여는 중...",
  children,
}: StudioInspectorSectionProps) {
  const [open, setOpen] = useState(
    () => forceOpen || readStudioInspectorSectionOpen(sectionId, defaultOpen),
  );
  const [focusHighlighted, setFocusHighlighted] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  /** Only explicit header presses persist a preference. Search/deep links do not rewrite it. */
  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    writeStudioInspectorSectionOpen(sectionId, next);
  };

  const focusTarget: StudioInspectorFocusTarget | null =
    isStudioInspectorFocusTarget(sectionId) ? sectionId : null;
  useStudioInspectorFocusRequest(focusTarget, () => {
    setOpen(true);
    setFocusHighlighted(true);
    scrollStudioInspectorTargetIntoView(rootRef.current);
    globalThis.requestAnimationFrame?.(() => {
      headerRef.current?.focus({ preventScroll: true });
    });
  });

  useEffect(() => {
    if (!focusHighlighted) return;
    const timeout = globalThis.setTimeout(() => setFocusHighlighted(false), 1_600);
    return () => globalThis.clearTimeout(timeout);
  }, [focusHighlighted]);

  const heading = title ?? inspectorSectionLabel(sectionId) ?? sectionId;

  return (
    <section
      ref={rootRef}
      className={cn(
        "mt-2 rounded-lg border-t border-line/50 pt-2 transition-[background-color,box-shadow] duration-200",
        focusHighlighted && "bg-accent-soft/55 shadow-[0_0_0_2px_oklch(0.72_0.185_42/0.55)]",
      )}
      data-inspector-section={sectionId}
      data-inspector-section-open={open ? "true" : "false"}
      data-inspector-section-highlighted={focusHighlighted ? "true" : undefined}
    >
      <button
        ref={headerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${heading}, 세부 설정 ${open ? "접기" : "펼치기"}`}
        title="세밀한 옵션입니다. 필요할 때만 펼쳐도 기본 작업에는 문제가 없습니다."
        onClick={toggleOpen}
        data-inspector-control-id={`section.${sectionId}`}
        data-inspector-priority="chrome"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-1.5 py-1 text-left text-xs font-semibold text-fg transition-colors hover:bg-raised/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-8 pointer-coarse:min-h-11"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{heading}</span>
          <span className="shrink-0 rounded-full border border-line bg-card px-1.5 py-px text-[0.56rem] font-semibold text-fg-3">
            세부
          </span>
          {activeCount > 0 && !open ? (
            <>
              <span
                aria-hidden
                className="shrink-0 rounded-full bg-accent/15 px-1.5 py-px text-[0.6rem] font-bold tabular-nums text-accent"
                title={`${activeCount}개 설정이 켜져 있습니다.`}
              >
                {activeCount}
              </span>
              <span className="sr-only">{`, 설정 ${activeCount}개 켜짐`}</span>
            </>
          ) : null}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={open ? "shrink-0 rotate-180 transition-transform" : "shrink-0 transition-transform"}
        />
      </button>
      <div id={panelId} hidden={!open}>
        {open ? (
          <Suspense
            fallback={
              <div className="mt-2 rounded-lg border border-line bg-card/70 px-3 py-2 text-xs text-fg-3">
                {loadingLabel}
              </div>
            }
          >
            <div className="mt-2 space-y-2">{children}</div>
          </Suspense>
        ) : null}
      </div>
    </section>
  );
}
