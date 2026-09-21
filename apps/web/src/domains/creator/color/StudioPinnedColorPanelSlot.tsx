import { lazy, Suspense } from "react";
import { useStudioColorWorkspace } from "./StudioColorWorkspaceContext";

const Panel = lazy(() => import("./StudioPinnedColorPanel").then((module) => ({ default: module.StudioPinnedColorPanel })));

/** The default route must not load the full editor just to decide that the panel is closed. */
export function StudioPinnedColorPanelSlot() {
  const workspace = useStudioColorWorkspace();
  if (!workspace || !workspace.pinned || workspace.isMobile) return null;
  return <Suspense fallback={<p role="status" className="p-3 text-sm text-fg-2">색상 패널을 여는 중…</p>}><Panel /></Suspense>;
}
