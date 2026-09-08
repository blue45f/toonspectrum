import { useEffect, useRef, useState } from "react";
import { downloadBlob } from "../export/studio-export";
import type { StudioVrmTexturePaintRuntime } from "./studio-vrm-texture-paint-runtime";

export function StudioVrmTextureExportButton({ runtime, disabled }: {
  readonly runtime: StudioVrmTexturePaintRuntime | null;
  readonly disabled: boolean;
}) {
  const active = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => active.current?.abort(), [runtime]);
  const run = async () => {
    if (!runtime || disabled || active.current) return;
    const controller = new AbortController();
    active.current = controller; setBusy(true); setError("");
    try {
      const { exportStudioVrmTexturePaintArchive } = await import("./studio-vrm-texture-paint-export");
      const blob = await exportStudioVrmTexturePaintArchive(runtime, { signal: controller.signal });
      if (!controller.signal.aborted) downloadBlob(blob, "surface-textures.zip");
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "텍스처를 내보내지 못했습니다.");
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  };
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <button type="button" disabled={disabled || !runtime || busy} onClick={() => { void run(); }}
      className="min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45">
      {busy ? "텍스처 내보내는 중…" : "텍스처 ZIP 내보내기"}
    </button>
    {busy ? <button type="button" onClick={() => active.current?.abort()} aria-label="텍스처 내보내기 취소"
      className="min-h-11 rounded-lg border border-line px-3 text-xs focus-visible:outline-2 focus-visible:outline-accent">취소</button> : null}
    {error ? <p role="alert" className="basis-full text-xs text-bad">{error}</p> : null}
  </div>;
}
