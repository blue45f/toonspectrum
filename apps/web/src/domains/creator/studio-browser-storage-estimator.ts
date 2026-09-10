import type { StudioOpfsStorageEstimator } from "./studio-opfs-asset-store";

/**
 * Browser storage capability belongs behind a non-React runtime boundary so diagnostic
 * surfaces do not each acquire their own navigator.storage ownership.
 */
export function studioBrowserStorageEstimator(): StudioOpfsStorageEstimator | null {
  if (typeof navigator === "undefined") return null;
  const storage = navigator.storage;
  if (!storage || typeof storage.estimate !== "function") return null;
  return { estimate: () => storage.estimate() };
}
