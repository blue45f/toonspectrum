import { Loader2 } from "lucide-react";
import { cloneElement, Suspense, useSyncExternalStore } from "react";

import {
  reportStudioBg3dRetainedOwnerCleanup,
  studioBg3dRetainedOwnerSource,
} from "./studio-bg3d-retained-owner";

function Bg3DRetainedLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>3D 배경 도구를 여는 중</span>
      </div>
    </div>
  );
}

/**
 * Lives in AppShell's chrome layer, outside RouteStage. This is the sole render site for the BG3D
 * editor, so a route teardown can retain the same R3F Canvas without constructing a second
 * renderer. Normal route changes still show nothing; only an in-flight cleanup lease remains.
 */
export function StudioBg3dRetainedOwnerHost() {
  const lease = useSyncExternalStore(
    studioBg3dRetainedOwnerSource.subscribe,
    studioBg3dRetainedOwnerSource.getSnapshot,
    studioBg3dRetainedOwnerSource.getSnapshot,
  );
  if (!lease.element) return null;
  return (
    <Suspense fallback={lease.logicalOpen ? <Bg3DRetainedLoadingOverlay /> : null}>
      {cloneElement(lease.element, {
        open: lease.logicalOpen,
        onWebXrCleanupPendingChange: (pending: boolean) => {
          reportStudioBg3dRetainedOwnerCleanup(lease.generation, pending);
        },
      })}
    </Suspense>
  );
}
