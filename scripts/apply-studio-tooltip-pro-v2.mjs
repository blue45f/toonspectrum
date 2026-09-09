import { appendFile, readFile, rm, writeFile } from "node:fs/promises";

const TARGET = {
  shell: "apps/web/src/domains/creator/StudioToolHint.tsx",
  bubble: "apps/web/src/domains/creator/components/StudioToolHintBubble.tsx",
  css: "apps/web/src/styles/globals.css",
};

async function read(path) {
  return readFile(path, "utf8");
}

async function replaceExact(path, before, after) {
  const source = await read(path);
  if (source.includes(after)) return;
  if (!source.includes(before)) {
    throw new Error(`Expected source fragment was not found in ${path}: ${before.slice(0, 120)}`);
  }
  await writeFile(path, source.replace(before, after));
}

async function replacePattern(path, pattern, after, label) {
  const source = await read(path);
  if (typeof after === "string" && source.includes(after)) return;
  if (!pattern.test(source)) {
    throw new Error(`Expected ${label} pattern was not found in ${path}`);
  }
  await writeFile(path, source.replace(pattern, after));
}

await replaceExact(
  TARGET.shell,
  'import type { StudioToolHintSide } from "./studio-tool-hint-position";',
  `import {
  isStudioToolHintRectVisible,
  readStudioToolHintViewport,
  type StudioToolHintSide,
} from "./studio-tool-hint-position";`
);

await replaceExact(
  TARGET.shell,
  `const SHOW_DELAY_MS = 280;
const EXPAND_DELAY_MS = 620;`,
  `const SHOW_DELAY_MS = 280;
export const STUDIO_TOOL_HINT_WARM_SWITCH_DELAY_MS = 90;
const STUDIO_TOOL_HINT_WARM_SWITCH_WINDOW_MS = 720;
const EXPAND_DELAY_MS = 620;`
);

await replaceExact(
  TARGET.shell,
  `  getHoverSuppressionUntil: () => number;
  markReveal: (hintId: string, intent: StudioToolHintRevealIntent) => void;`,
  `  getHoverSuppressionUntil: () => number;
  getHoverRevealDelay: (hintId: string, now?: number) => number;
  markReveal: (hintId: string, intent: StudioToolHintRevealIntent) => void;`
);

await replaceExact(
  TARGET.shell,
  `  let activeReveal: Readonly<{
    hintId: string;
    intent: StudioToolHintRevealIntent;
  }> | null = null;`,
  `  let activeReveal: Readonly<{
    hintId: string;
    intent: StudioToolHintRevealIntent;
  }> | null = null;
  let lastPassiveRevealAt = Number.NEGATIVE_INFINITY;`
);

await replaceExact(
  TARGET.shell,
  `    getHoverSuppressionUntil() {
      return hoverSuppressedUntil;
    },
    markReveal(hintId, intent) {
      activeReveal = { hintId, intent };
    },`,
  `    getHoverSuppressionUntil() {
      return hoverSuppressedUntil;
    },
    getHoverRevealDelay(hintId, now = Date.now()) {
      const switchingBetweenVisibleTools =
        activeReveal?.intent === "hover" && activeReveal.hintId !== hintId;
      const passiveLaneStillWarm =
        now - lastPassiveRevealAt <= STUDIO_TOOL_HINT_WARM_SWITCH_WINDOW_MS;
      return switchingBetweenVisibleTools || passiveLaneStillWarm
        ? STUDIO_TOOL_HINT_WARM_SWITCH_DELAY_MS
        : SHOW_DELAY_MS;
    },
    markReveal(hintId, intent) {
      activeReveal = { hintId, intent };
      if (intent === "hover") lastPassiveRevealAt = Date.now();
    },`
);

await replaceExact(
  TARGET.shell,
  `    reset() {
      hoverSuppressedUntil = 0;
      activeReveal = null;
    },`,
  `    reset() {
      hoverSuppressedUntil = 0;
      activeReveal = null;
      lastPassiveRevealAt = Number.NEGATIVE_INFINITY;
    },`
);

await replaceExact(
  TARGET.shell,
  `    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest('[data-studio-tool-hint-target="true"]') ||
        target.closest('[data-studio-tool-hint="true"]')
      ) {
        return;
      }
      dismissAll();
    }

    const passiveCapture = { capture: true, passive: true } as const;`,
  `    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest('[data-studio-tool-hint-target="true"]') ||
        target.closest('[data-studio-tool-hint="true"]')
      ) {
        return;
      }
      dismissAll();
    }
    function onWindowBlur() {
      dismissAll();
    }
    function onVisibilityChange() {
      if (globalThis.document?.visibilityState !== "visible") dismissAll();
    }
    function onDragStart() {
      suppressPassivePointerHints();
    }

    const passiveCapture = { capture: true, passive: true } as const;`
);

await replaceExact(
  TARGET.shell,
  `    globalThis.addEventListener("focusin", onFocusIn, passiveCapture);
    globalThis.addEventListener("wheel", suppressPassivePointerHints, passiveCapture);
    globalThis.addEventListener("scroll", suppressPassivePointerHints, passiveCapture);
    return () => {`,
  `    globalThis.addEventListener("focusin", onFocusIn, passiveCapture);
    globalThis.addEventListener("wheel", suppressPassivePointerHints, passiveCapture);
    globalThis.addEventListener("scroll", suppressPassivePointerHints, passiveCapture);
    globalThis.addEventListener("dragstart", onDragStart, passiveCapture);
    globalThis.addEventListener("blur", onWindowBlur);
    globalThis.document?.addEventListener("visibilitychange", onVisibilityChange);
    return () => {`
);

await replaceExact(
  TARGET.shell,
  `      globalThis.removeEventListener("focusin", onFocusIn, passiveCapture);
      globalThis.removeEventListener("wheel", suppressPassivePointerHints, passiveCapture);
      globalThis.removeEventListener("scroll", suppressPassivePointerHints, passiveCapture);
      interaction.reset();`,
  `      globalThis.removeEventListener("focusin", onFocusIn, passiveCapture);
      globalThis.removeEventListener("wheel", suppressPassivePointerHints, passiveCapture);
      globalThis.removeEventListener("scroll", suppressPassivePointerHints, passiveCapture);
      globalThis.removeEventListener("dragstart", onDragStart, passiveCapture);
      globalThis.removeEventListener("blur", onWindowBlur);
      globalThis.document?.removeEventListener("visibilitychange", onVisibilityChange);
      interaction.reset();`
);

await replaceExact(
  TARGET.shell,
  `  const viewportWidth = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1280;
  const viewportHeight = typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 800;`,
  `  const viewport = readStudioToolHintViewport();
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;`
);

await replaceExact(
  TARGET.shell,
  `  const side = preferredSide ?? (anchor.bottom > viewportHeight * 0.72 ? "top" : "right");`,
  `  const side =
    preferredSide ??
    (anchor.bottom > viewport.top + viewportHeight * 0.72 ? "top" : "right");`
);

await replaceExact(
  TARGET.shell,
  `  return {
    left: clamp(left, VIEWPORT_PADDING, viewportWidth - FALLBACK_WIDTH - VIEWPORT_PADDING),
    top: clamp(top, VIEWPORT_PADDING, viewportHeight - fallbackHeight - VIEWPORT_PADDING),
  };`,
  `  return {
    left: clamp(
      left,
      viewport.left + VIEWPORT_PADDING,
      viewport.right - FALLBACK_WIDTH - VIEWPORT_PADDING
    ),
    top: clamp(
      top,
      viewport.top + VIEWPORT_PADDING,
      viewport.bottom - fallbackHeight - VIEWPORT_PADDING
    ),
  };`
);

await replaceExact(
  TARGET.shell,
  `  function scheduleShow() {
    if (!hint || preferences.mode === "off") return;`,
  `  function scheduleShow(event?: ReactMouseEvent<HTMLSpanElement>) {
    if (!hint || preferences.mode === "off") return;
    if (event && event.buttons !== 0) {
      interaction.suppressHover();
      return;
    }`
);

await replaceExact(
  TARGET.shell,
  `    const now = Date.now();
    const pointerSuppressionRemaining = getPointerSuppressionRemainingForTip(tipId, now);`,
  `    const now = Date.now();
    const revealDelay = interaction.getHoverRevealDelay(tipId, now);
    const pointerSuppressionRemaining = getPointerSuppressionRemainingForTip(tipId, now);`
);

await replaceExact(
  TARGET.shell,
  `      scheduleHintRevealWithDelay(pointerSuppressionRemaining + SHOW_DELAY_MS);`,
  `      scheduleHintRevealWithDelay(pointerSuppressionRemaining + revealDelay);`
);

await replaceExact(
  TARGET.shell,
  `      scheduleHintRevealWithDelay(hoverRemaining + SHOW_DELAY_MS);`,
  `      scheduleHintRevealWithDelay(hoverRemaining + revealDelay);`
);

await replaceExact(
  TARGET.shell,
  `    scheduleHintRevealWithDelay(SHOW_DELAY_MS);`,
  `    scheduleHintRevealWithDelay(revealDelay);`
);

await replacePattern(
  TARGET.shell,
  /  useEffect\(\(\) => \{\n    if \(!open\) return;\n    let frame = 0;\n    function updatePosition\(\) \{[\s\S]*?\n  \}, \[open\]\);/u,
  `  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const visualViewport = globalThis.visualViewport;

    function closeDetachedHint() {
      if (coordinator.getActiveHintId() !== tipId) return;
      hideRenderedTooltipImmediately();
      coordinator.release(tipId);
      interaction.clearReveal(tipId);
      activeRevealIntent.current = null;
      setExpanded(false);
      setAnchor(null);
    }

    function updatePosition() {
      globalThis.cancelAnimationFrame?.(frame);
      frame = globalThis.requestAnimationFrame?.(() => {
        const nextAnchor = readAnchor();
        const viewport = readStudioToolHintViewport();
        if (
          nextAnchor &&
          wrapRef.current?.isConnected &&
          (!hasUsableArea(nextAnchor) || isStudioToolHintRectVisible(nextAnchor, viewport))
        ) {
          lastValidAnchor.current = nextAnchor;
          setAnchor(nextAnchor);
          return;
        }
        closeDetachedHint();
      }) ?? 0;
    }

    globalThis.addEventListener("resize", updatePosition);
    globalThis.addEventListener("orientationchange", updatePosition);
    globalThis.addEventListener("scroll", updatePosition, true);
    visualViewport?.addEventListener("resize", updatePosition);
    visualViewport?.addEventListener("scroll", updatePosition);
    const anchorObserver =
      typeof globalThis.ResizeObserver === "function" && wrapRef.current
        ? new globalThis.ResizeObserver(updatePosition)
        : null;
    if (wrapRef.current) anchorObserver?.observe(wrapRef.current);

    return () => {
      globalThis.cancelAnimationFrame?.(frame);
      globalThis.removeEventListener("resize", updatePosition);
      globalThis.removeEventListener("orientationchange", updatePosition);
      globalThis.removeEventListener("scroll", updatePosition, true);
      visualViewport?.removeEventListener("resize", updatePosition);
      visualViewport?.removeEventListener("scroll", updatePosition);
      anchorObserver?.disconnect();
    };
  }, [open]);`,
  "open-tooltip reposition effect"
);

await replaceExact(
  TARGET.bubble,
  `import {
  planStudioToolHintPosition,
  type StudioToolHintSide,
} from "../studio-tool-hint-position";`,
  `import {
  planStudioToolHintPosition,
  readStudioToolHintViewport,
  type StudioToolHintSide,
} from "../studio-tool-hint-position";`
);

await replaceExact(
  TARGET.bubble,
  `  const bubbleRef = useRef<HTMLDivElement>(null);
  const viewportWidth = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1280;
  const viewportHeight = typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 800;`,
  `  const bubbleRef = useRef<HTMLDivElement>(null);
  const lastSideRef = useRef<StudioToolHintSide | null>(null);
  const viewport = readStudioToolHintViewport();
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;`
);

await replaceExact(
  TARGET.bubble,
  `  const resolvedPreferredSide = preferredSide ?? (anchor.bottom > viewportHeight * 0.72 ? "top" : "right");`,
  `  const resolvedPreferredSide =
    preferredSide ??
    (anchor.bottom > viewport.top + viewportHeight * 0.72 ? "top" : "right");`
);

await replaceExact(
  TARGET.bubble,
  `  const position = planStudioToolHintPosition({
    anchor,
    viewportWidth,
    viewportHeight,
    // Width is a deterministic state value. Using the previous measured width
    // for this render leaves the 304px coach at the compact 240px coordinate
    // until its CSS transition ends, clipping exactly 54px at the right edge.
    popupWidth: expectedWidth,
    popupHeight: measuredHeight,
    preferredSide: resolvedPreferredSide,
    viewportPadding: 10,
  });`,
  `  const reservedWidth = richCoachAvailable
    ? Math.min(COACH_WIDTH, Math.max(1, viewportWidth - 20))
    : expectedWidth;
  const reservedHeight = richCoachAvailable
    ? Math.min(
        COACH_HEIGHT + (unavailableReason ? 40 : 0),
        Math.max(1, viewportHeight - 20)
      )
    : measuredHeight;
  const position = planStudioToolHintPosition({
    anchor,
    viewportWidth,
    viewportHeight,
    viewportLeft: viewport.left,
    viewportTop: viewport.top,
    // Width is a deterministic state value. Using the previous measured width
    // for this render leaves the 304px coach at the compact 240px coordinate
    // until its CSS transition ends, clipping exactly 54px at the right edge.
    popupWidth: expectedWidth,
    popupHeight: measuredHeight,
    selectionPopupWidth: reservedWidth,
    selectionPopupHeight: reservedHeight,
    ...(lastSideRef.current ? { previousSide: lastSideRef.current } : {}),
    preferredSide: resolvedPreferredSide,
    viewportPadding: 10,
  });`
);

await replaceExact(
  TARGET.bubble,
  `  const preview = studioToolHintPreview(hint);`,
  `  useLayoutEffect(() => {
    lastSideRef.current = position.side;
  }, [position.side]);

  const preview = studioToolHintPreview(hint);`
);

await replaceExact(
  TARGET.bubble,
  `      data-studio-tool-hint-reduced-motion={reducedMotion ? "true" : undefined}
      data-side={position.side}`,
  `      data-studio-tool-hint-reduced-motion={reducedMotion ? "true" : undefined}
      data-studio-tool-hint-viewport={viewport.source}
      data-studio-tool-hint-layout={coachExpanded ? "expanded" : "compact"}
      data-side={position.side}`
);

await replaceExact(
  TARGET.bubble,
  `        "pointer-events-auto fixed z-[200] max-h-[calc(100vh-1.25rem)] overflow-hidden rounded-lg border border-line/80",
        "bg-panel/98 p-2.5 text-left shadow-[0_20px_56px_oklch(0.06_0.01_70/0.66)] backdrop-blur-xl",`,
  `        "pointer-events-auto fixed z-[200] max-h-[calc(100vh-1.25rem)] overflow-visible rounded-lg border border-line/80",
        "bg-panel/98 text-left shadow-[0_20px_56px_oklch(0.06_0.01_70/0.66)] backdrop-blur-xl",`
);

await replaceExact(
  TARGET.bubble,
  `      <div className="flex items-start justify-between gap-2">`,
  `      <div
        data-studio-tool-hint-scroll-region="true"
        className="overflow-x-hidden overflow-y-auto overscroll-contain p-2.5"
        style={{ maxHeight: Math.max(1, viewportHeight - 20) }}
      >
        <div className="flex items-start justify-between gap-2">`
);

await replaceExact(
  TARGET.bubble,
  `      {coachExpanded && hint.tip ? (
        <div
          data-studio-tool-hint-tip="true"
          className="mt-2 flex items-start gap-1.5 rounded-md border border-accent/20 bg-accent-soft/50 px-2 py-1.5 text-[0.7rem] leading-relaxed text-fg-2"
        >
          <Lightbulb size={12} strokeWidth={1.8} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>{hint.tip}</span>
        </div>
      ) : null}
    </div>
  );
}`,
  `      {coachExpanded && hint.tip ? (
          <div
            data-studio-tool-hint-tip="true"
            className="mt-2 flex items-start gap-1.5 rounded-md border border-accent/20 bg-accent-soft/50 px-2 py-1.5 text-[0.7rem] leading-relaxed text-fg-2"
          >
            <Lightbulb size={12} strokeWidth={1.8} className="mt-0.5 shrink-0 text-accent" aria-hidden />
            <span>{hint.tip}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}`
);

const cssMarker =
  "/* Studio tooltip pro v2: directional motion, stable expansion, and accessible overflow. */";
const css = await read(TARGET.css);
if (!css.includes(cssMarker)) {
  await appendFile(
    TARGET.css,
    `\n\n${cssMarker}\n[data-studio-tool-hint="true"] {\n  --studio-tool-hint-enter-x: 0px;\n  --studio-tool-hint-enter-y: 4px;\n  contain: layout style;\n  isolation: isolate;\n  overscroll-behavior: contain;\n  backface-visibility: hidden;\n  will-change: opacity, transform, width, left, top;\n  transition-property: left, top, width, border-color, box-shadow;\n  transition-duration: 150ms;\n  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n[data-studio-tool-hint="true"][data-side="right"] {\n  --studio-tool-hint-enter-x: -6px;\n  --studio-tool-hint-enter-y: 0px;\n  transform-origin: left center;\n}\n\n[data-studio-tool-hint="true"][data-side="left"] {\n  --studio-tool-hint-enter-x: 6px;\n  --studio-tool-hint-enter-y: 0px;\n  transform-origin: right center;\n}\n\n[data-studio-tool-hint="true"][data-side="bottom"] {\n  --studio-tool-hint-enter-x: 0px;\n  --studio-tool-hint-enter-y: -5px;\n  transform-origin: center top;\n}\n\n[data-studio-tool-hint="true"][data-side="top"] {\n  --studio-tool-hint-enter-x: 0px;\n  --studio-tool-hint-enter-y: 5px;\n  transform-origin: center bottom;\n}\n\n@keyframes studio-tool-hint-enter {\n  from {\n    opacity: 0;\n    transform: translate3d(\n        var(--studio-tool-hint-enter-x),\n        var(--studio-tool-hint-enter-y),\n        0\n      )\n      scale(0.975);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n\n[data-studio-tool-hint-scroll-region="true"] {\n  scrollbar-gutter: stable;\n  scrollbar-width: thin;\n  scrollbar-color: oklch(0.42 0.02 70 / 0.5) transparent;\n}\n\n[data-studio-tool-hint="true"][data-studio-tool-hint-expanded="true"] {\n  border-color: color-mix(in oklch, var(--color-line) 72%, var(--color-accent) 28%);\n  box-shadow:\n    0 24px 68px oklch(0.06 0.01 70 / 0.7),\n    0 0 0 1px oklch(0.72 0.185 42 / 0.08);\n}\n\n[data-studio-tool-hint-preview-frame="true"] {\n  transform-origin: center top;\n  animation: studio-tool-hint-preview-enter 180ms cubic-bezier(0.16, 1, 0.3, 1) both;\n}\n\n@keyframes studio-tool-hint-preview-enter {\n  from {\n    opacity: 0;\n    transform: translateY(-3px) scale(0.985);\n  }\n  to {\n    opacity: 1;\n    transform: none;\n  }\n}\n\n[data-studio-tool-hint="true"][data-studio-tool-hint-reduced-motion="true"] {\n  animation: none !important;\n  transition: none !important;\n  will-change: auto;\n}\n\n[data-studio-tool-hint="true"][data-studio-tool-hint-reduced-motion="true"]\n  [data-studio-tool-hint-preview-frame="true"] {\n  animation: none !important;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  [data-studio-tool-hint="true"],\n  [data-studio-tool-hint="true"] [data-studio-tool-hint-preview-frame="true"] {\n    animation: none !important;\n    transition: none !important;\n    will-change: auto;\n  }\n}\n\n@media (prefers-contrast: more) {\n  [data-studio-tool-hint="true"] {\n    backdrop-filter: none;\n    border-width: 2px;\n    box-shadow: 0 16px 36px oklch(0.02 0.01 70 / 0.82);\n  }\n}\n`
  );
}

await rm("scripts/apply-studio-tooltip-pro-v2.mjs", { force: true });
await rm(".github/workflows/studio-tooltip-pro-materialize.yml", { force: true });
