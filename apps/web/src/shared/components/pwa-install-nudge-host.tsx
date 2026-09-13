import { Suspense, useSyncExternalStore } from "react";

import { lazyRetry } from "../lib/lazy-retry";
import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  subscribePwaInstall,
} from "../lib/pwa-install-store";

const InstallNudge = lazyRetry(
  () => import("./pwa-install-nudge").then((module) => ({ default: module.PwaInstallNudge })),
  "PwaInstallNudge",
);

/** Keep the install-event subscription eager, but download the UI only when it is usable. */
export function PwaInstallNudgeHost() {
  const install = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    getPwaInstallServerSnapshot,
  );
  if (install.status !== "available") return null;
  return <Suspense fallback={null}><InstallNudge /></Suspense>;
}
