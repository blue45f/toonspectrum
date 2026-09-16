import { useEffect, useRef } from "react";

import { cn } from "@/shared/lib/utils";

let previewRuntimePromise: Promise<{
  readonly render: typeof import("../brush-lab/brush-studio-v6-preview")["renderBrushStudioV6Preview"];
  readonly programFor: typeof import("./studio-brush-v6-catalog-runtime")["studioV6BrushProgramForCatalogId"];
}> | null = null;

function loadPreviewRuntime() {
  previewRuntimePromise ??= Promise.all([
    import("../brush-lab/brush-studio-v6-preview"),
    import("./studio-brush-v6-catalog-runtime"),
  ]).then(([preview, catalog]) => ({
    render: preview.renderBrushStudioV6Preview,
    programFor: catalog.studioV6BrushProgramForCatalogId,
  })).catch((error) => {
    previewRuntimePromise = null;
    throw error;
  });
  return previewRuntimePromise;
}

/** Render the real V6 material program only when a tile approaches the scrollport. */
export function StudioNextGenBrushPreview({
  catalogId,
  compact,
  density,
  active,
}: {
  readonly catalogId: string;
  readonly compact: boolean;
  readonly density: "stroke" | "tile";
  readonly active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let observer: IntersectionObserver | null = null;
    const render = () => {
      timer = globalThis.setTimeout(() => {
        void loadPreviewRuntime().then((runtime) => {
          if (cancelled || !canvas.isConnected) return;
          const program = runtime.programFor(catalogId);
          if (program) runtime.render(canvas, program);
        }).catch(() => undefined);
      }, 0);
    };
    if (typeof globalThis.IntersectionObserver === "function") {
      observer = new globalThis.IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        observer = null;
        render();
      }, { rootMargin: "180px 0px", threshold: 0 });
      observer.observe(canvas);
    }
    // Without IntersectionObserver, keep the lightweight placeholder instead of eagerly loading
    // every physical engine preview in one frame.
    return () => {
      cancelled = true;
      observer?.disconnect();
      if (timer !== null) globalThis.clearTimeout(timer);
    };
  }, [catalogId]);

  return (
    <canvas
      ref={canvasRef}
      width={336}
      height={112}
      aria-hidden="true"
      data-studio-brush-preview="true"
      data-studio-brush-preview-kind="v6-material"
      data-studio-brush-v6-preview={catalogId}
      className={cn(
        "block w-full rounded-md border object-cover",
        active ? "border-on-accent/25 bg-on-accent/10" : "border-line bg-raised/50",
        density === "tile" ? "h-7" : "h-[2.125rem]",
        compact && "h-7",
        "[@media(max-height:32rem)]:h-7",
      )}
    />
  );
}
