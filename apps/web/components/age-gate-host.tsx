import { lazy, Suspense } from "react";

import { useApp, useHydrated } from "@/lib/store";

const AgeGateModal = lazy(() => import("@/components/age-gate-modal").then((mod) => ({ default: mod.AgeGateModal })));

export function AgeGateHost() {
  const hydrated = useHydrated();
  const open = useApp((s) => s.ageGateOpen);
  if (!hydrated || !open) return null;
  return (
    <Suspense fallback={null}>
      <AgeGateModal />
    </Suspense>
  );
}
