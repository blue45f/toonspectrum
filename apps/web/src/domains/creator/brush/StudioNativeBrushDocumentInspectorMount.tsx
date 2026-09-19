import { lazy, Suspense } from "react";

import type { StudioNativeBrushDocumentInspectorProps } from "./StudioNativeBrushDocumentInspector";

const Inspector = lazy(() => import("./StudioNativeBrushDocumentInspector"));

/** The engine itself is created only after an explicit conversion request, never on mount. */
export function StudioNativeBrushDocumentInspectorMount(props: StudioNativeBrushDocumentInspectorProps) {
  if (!props.onPrepare) return null;
  return <Suspense fallback={<p className="text-xs text-fg-3">네이티브 브러시 변환 도구를 여는 중…</p>}>
    <Inspector {...props} />
  </Suspense>;
}
