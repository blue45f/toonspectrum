import { readFile, rm, writeFile } from "node:fs/promises";

const shellPath = "apps/web/src/domains/creator/StudioToolHint.tsx";
const bubblePath = "apps/web/src/domains/creator/components/StudioToolHintBubble.tsx";

async function replaceExact(path, before, after) {
  const source = await readFile(path, "utf8");
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`Missing expected fragment in ${path}`);
  await writeFile(path, source.replace(before, after));
}

async function replacePattern(path, pattern, after, label) {
  const source = await readFile(path, "utf8");
  if (!pattern.test(source)) throw new Error(`Missing ${label} in ${path}`);
  await writeFile(path, source.replace(pattern, after));
}

await replaceExact(
  shellPath,
  `    if (event && event.buttons !== 0) {
      interaction.suppressHover();
      return;
    }`,
  `    if (event && event.buttons !== 0) {
      interaction.suppressHover();
      dismissCoordinatedHintsImmediately();
      return;
    }`
);

await replacePattern(
  shellPath,
  /function compactFallbackStyle\([\s\S]*?\n\}\n\nfunction StudioToolHintCompactFallback/u,
  `function compactFallbackStyle(
  anchor: DOMRect,
  preferredSide: StudioToolHintSide | undefined,
  hasUnavailableReason: boolean
): CSSProperties {
  const viewport = readStudioToolHintViewport();
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;
  const fallbackWidth = Math.min(
    FALLBACK_WIDTH,
    Math.max(1, viewportWidth - VIEWPORT_PADDING * 2)
  );
  const fallbackHeight = hasUnavailableReason ? 124 : FALLBACK_HEIGHT;
  const side =
    preferredSide ??
    (anchor.bottom > viewport.top + viewportHeight * 0.72 ? "top" : "right");
  let left = anchor.right + FALLBACK_GAP;
  let top = anchor.top + anchor.height / 2 - fallbackHeight / 2;
  if (side === "left") left = anchor.left - FALLBACK_GAP - fallbackWidth;
  if (side === "bottom" || side === "top") {
    left = anchor.left + anchor.width / 2 - fallbackWidth / 2;
    top =
      side === "bottom"
        ? anchor.bottom + FALLBACK_GAP
        : anchor.top - FALLBACK_GAP - fallbackHeight;
  }
  return {
    left: clamp(
      left,
      viewport.left + VIEWPORT_PADDING,
      viewport.right - fallbackWidth - VIEWPORT_PADDING
    ),
    top: clamp(
      top,
      viewport.top + VIEWPORT_PADDING,
      viewport.bottom - fallbackHeight - VIEWPORT_PADDING
    ),
    width: fallbackWidth,
  };
}

function StudioToolHintCompactFallback`,
  "compact fallback function"
);

await replaceExact(
  shellPath,
  `      data-studio-tool-hint-loading="true"
      className="studio-tool-hint-compact"`,
  `      data-studio-tool-hint-loading="true"
      data-studio-tool-hint-reduced-motion={reducedMotion ? "true" : undefined}
      data-studio-tool-hint-viewport={readStudioToolHintViewport().source}
      className="studio-tool-hint-compact"`
);

await replaceExact(
  bubblePath,
  `      style={{
        left: position.left,
        top: position.top,
        animation: reducedMotion ? "none" : undefined,
      }}`,
  `      style={{
        left: position.left,
        top: position.top,
        width: expectedWidth,
        animation: reducedMotion ? "none" : undefined,
      }}`
);

await rm("scripts/finalize-studio-tooltip-pro-v2.mjs", { force: true });
